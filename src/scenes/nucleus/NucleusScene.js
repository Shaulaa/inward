import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BaseScene } from '../BaseScene.js';
import { organicMaterial, tissueMaterial } from '../shared/materials.js';
import { createTaperedTube, distanceToPoints } from '../shared/geometry.js';
import { createParticles } from '../shared/particles.js';
import { NUCLEAR_ENVELOPE } from '../shared/palette.js';
import {
  BEADS_AFTER_CENTER,
  BEAD_RADIUS,
  DNA_RADIUS,
  ENVELOPE_RADIUS,
  NAKED_PITCH,
  NAKED_STRAND_RADIUS,
  STRING_BEFORE_CENTER,
  createChromatinFibers,
  createNucleosomeString,
  createNucleusRoute,
} from './nucleusLayout.js';
import envelopeVertex from './envelope.vert.glsl?raw';
import envelopeFragment from './envelope.frag.glsl?raw';
import strandVertex from './dnaStrand.vert.glsl?raw';
import strandFragment from './dnaStrand.frag.glsl?raw';
import { createRng } from '../../utils/random.js';
import { clamp, easeInOutSine, lerp, range01, smoothstep } from '../../utils/math.js';
import { closingGap, crossAtMidEntry, exitPhases, settle } from '../../utils/choreography.js';

// The cell scene's haze lingers just inside the envelope, then clears into
// the nucleoplasm's violet.
const FOG_COLOR_NUCLEUS = '#1d1238';
const FOG_COLOR_ENTRY = '#123a47'; // the cell scene's fog
const FOG_DENSITY_NUCLEUS = 0.05;
const FOG_DENSITY_ENTRY = 0.08;
const ENTRY_TINT_TAIL = 0.2;

/** Same palette as the nucleus in the cell scene, so the envelope matches across the transition. */
const ENVELOPE_COLORS = NUCLEAR_ENVELOPE;
/** Cell scene: pore scale 1.5 on a radius of 6.5. Keep the same number of pores around. */
const PORE_SCALE = (1.5 * 6.5) / ENVELOPE_RADIUS;
const WRINKLE_SCALE = (0.9 * 6.5) / ENVELOPE_RADIUS;
/**
 * The entry pore, sized to fill the same share of the frame at this scene's
 * start (1.2 units from the envelope) as the cell scene's dive pore does at
 * its end, so the camera visibly flies in through it.
 */
const HERO_PORE_SIZE = 1.9;

const DNA_COLOR = '#d68cf0';
/** Chromatin fibres passing within this distance of the nucleosome string are built smooth. */
const CHROMATIN_DETAIL_RANGE = 4.5;
/** Same base colours as the DNA scene. */
const BASE_COLORS = { A: '#5ad17a', T: '#ff7a6b', C: '#57a8ff', G: '#ffd257' };
/**
 * Dramatised double-helix proportions on the strand (tube radius 0.03 stands
 * for 1 nm, so one 3.4 nm turn is ~0.1 units).
 */
const STRAND_PITCH = 0.1;
const MINOR_GROOVE = 144 / 360;

/**
 * Timeline units spent following the string before the transition: over the
 * beads, then down onto the naked DNA past them.
 */
const FOLLOW_UNITS = 0.3;
/** Where (distance along the string from its start) the camera dives into the naked DNA. */
const DIVE_AT = STRING_BEFORE_CENTER + BEADS_AFTER_CENTER + 3;
/** Lens height above backbone A's surface just before, and at the very end of, the scene. */
const APPROACH_GAP = 0.07;
const END_GAP = 0.012;
/** Closing-in ends this far short of the path's end, so the camera is still moving at the cut. */
const CLOSING_EPSILON = 0.05;

export class NucleusScene extends BaseScene {
  constructor(context) {
    super(context);
    this.exitRimColor.set('#f0c8ff');
  }

  onBuild() {
    const q = this.quality.nucleus;
    const rng = createRng(31);

    this.fogColorNucleus = new THREE.Color(FOG_COLOR_NUCLEUS);
    this.fogColorEntry = new THREE.Color(FOG_COLOR_ENTRY);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR_ENTRY, FOG_DENSITY_ENTRY);
    this.scene.background = new THREE.Color(FOG_COLOR_ENTRY);

    this.camera.near = 0.005;
    this.camera.far = 90;
    this.camera.fov = 60;
    this.camera.updateProjectionMatrix();

    this.route = createNucleusRoute();
    const { fibers, stringStart, stringEnd } = createChromatinFibers(rng, this.route, { count: q.fibers });

    this.#buildEnvelope();
    this.#buildChromatin(fibers, stringStart, stringEnd);
    this.#buildNucleolus();
    this.#buildNucleosomes(stringStart, stringEnd);
    this.#buildNucleoplasm(rng, q.particles);
    this.#buildFollowPath();
    this.#buildAnchors(fibers);

    // Lights for the base-pair rungs (built-in material); everything else shades itself.
    this.scene.add(this.camera);
    this.scene.add(new THREE.HemisphereLight('#e6d8ff', '#2a1a40', 1.0));
    this.camera.add(new THREE.PointLight('#ffffff', 1.2, 0, 0));

    this.tmp = { position: new THREE.Vector3(), ahead: new THREE.Vector3(), gaze: new THREE.Vector3(), target: new THREE.Vector3() };
  }

  #buildEnvelope() {
    const material = this.animate(
      organicMaterial({
        vertexShader: envelopeVertex,
        fragmentShader: envelopeFragment,
        uniforms: {
          uAmplitude: { value: 0.5 },
          uPoreScale: { value: PORE_SCALE },
          uWrinkleScale: { value: WRINKLE_SCALE },
          // The large pore the camera comes in through (it matches the one the cell scene dives into).
          uHeroDir: { value: this.route.curve.getPointAt(0).normalize() },
          uHeroSize: { value: HERO_PORE_SIZE },
          uColorEnvelope: { value: new THREE.Color(ENVELOPE_COLORS.envelope) },
          uColorPoreRing: { value: new THREE.Color(ENVELOPE_COLORS.ring) },
          uColorPoreCenter: { value: new THREE.Color(ENVELOPE_COLORS.core) },
          uColorRim: { value: new THREE.Color(ENVELOPE_COLORS.rim) },
          uColorInner: { value: new THREE.Color('#5a3a9a') },
        },
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    const envelope = new THREE.Mesh(new THREE.IcosahedronGeometry(ENVELOPE_RADIUS, 64), material);
    envelope.renderOrder = 10;
    this.scene.add(envelope);
  }

  /**
   * All fibres merged by look (euchromatin, heterochromatin) — a few draw
   * calls in total. Fibres that pass near the nucleosome string, where the
   * camera ends up, are built smooth (more sides, finer rings) so no facets
   * show up close; the rest stay light.
   */
  #buildChromatin(fibers, stringStart, stringEnd) {
    const groups = new Map();
    const closeTo = (p) => {
      const ab = stringEnd.clone().sub(stringStart);
      const t = Math.min(1, Math.max(0, p.clone().sub(stringStart).dot(ab) / ab.lengthSq()));
      return stringStart.clone().addScaledVector(ab, t).distanceTo(p) < CHROMATIN_DETAIL_RANGE;
    };
    for (const { curve, peripheral } of fibers) {
      const close = curve.getSpacedPoints(80).some(closeTo);
      const geometry = createTaperedTube(curve, {
        tubularSegments: Math.ceil(curve.getLength() / (close ? 0.1 : 0.22)),
        radius: peripheral ? 0.22 : 0.18,
        radialSegments: close ? 10 : 5,
        taperLength: 1.5,
        fadeLength: 3,
      });
      if (!groups.has(peripheral)) groups.set(peripheral, []);
      groups.get(peripheral).push(geometry);
    }
    const looks = new Map([
      [false, { color: '#b867d6', rimColor: '#f0c8ff' }],
      [true, { color: '#7e3aa0', rimColor: '#d8a8f0' }],
    ]);
    for (const [peripheral, list] of groups) {
      const geometry = mergeGeometries(list);
      list.forEach((g) => g.dispose());
      this.scene.add(new THREE.Mesh(geometry, this.animate(tissueMaterial({ ...looks.get(peripheral), wobble: 0.03, wobbleScale: 0.8, fade: true }))));
    }
  }

  /** Nucleolus: a dense, granular body off to the side of the route. */
  #buildNucleolus() {
    const center = this.route.at(15, -7, -6);
    const material = this.animate(tissueMaterial({ color: '#5a2a7a', rimColor: '#c08ae0', wobble: 0.6, wobbleScale: 0.35 }));
    const nucleolus = new THREE.Mesh(new THREE.IcosahedronGeometry(5.5, 24), material);
    nucleolus.position.copy(center);
    this.scene.add(nucleolus);
    this.nucleolusCenter = center;
  }

  /** Click points: the nucleolus surface, points along the chromatin fibres, the histone beads. */
  #buildAnchors(fibers) {
    const directions = new THREE.IcosahedronGeometry(1, 1).attributes.position;
    const surface = [];
    for (let i = 0; i < directions.count; i++) {
      surface.push(new THREE.Vector3().fromBufferAttribute(directions, i).setLength(4.8).add(this.nucleolusCenter));
    }
    this.addAnchor('nucleolus', surface, { near: 4, far: 30 });
    this.addAnchor('chromatin', fibers.flatMap(({ curve }) => curve.getSpacedPoints(8).slice(1, -1)), { near: 1, far: 11 });
    this.addAnchor('nucleosome', this.string.beads, { near: 0.25, far: 8 });
  }

  /**
   * The target: DNA wrapped around histone beads, unravelling from the
   * chromatin; past the last bead it runs on naked — bending organically —
   * as a real double helix (two backbones and coloured base-pair rungs), the
   * structure the DNA scene opens on.
   */
  #buildNucleosomes(stringStart, stringEnd) {
    const string = createNucleosomeString(stringStart, stringEnd, this.route.bead, STRING_BEFORE_CENTER + BEADS_AFTER_CENTER);
    this.string = string;
    const { wrapped, beads, tangent, naked } = string;

    const length = wrapped.getLength();
    const dnaMaterial = this.animate(
      organicMaterial({
        vertexShader: strandVertex,
        fragmentShader: strandFragment,
        uniforms: {
          uLength: { value: length },
          uPitch: { value: STRAND_PITCH },
          uMinorGroove: { value: MINOR_GROOVE },
          uColor: { value: new THREE.Color(DNA_COLOR) },
          uRimColor: { value: new THREE.Color('#ffe0ff') },
          uColorA: { value: new THREE.Color(BASE_COLORS.A) },
          uColorT: { value: new THREE.Color(BASE_COLORS.T) },
          uColorC: { value: new THREE.Color(BASE_COLORS.C) },
          uColorG: { value: new THREE.Color(BASE_COLORS.G) },
        },
        transparent: true,
      }),
    );
    this.scene.add(
      new THREE.Mesh(createTaperedTube(wrapped, { tubularSegments: Math.ceil(length / 0.012), radius: DNA_RADIUS, radialSegments: 16, taperLength: 0.3, fadeLength: 0.5 }), dnaMaterial),
    );

    // Naked double helix: backbones split out of the wrapped strand (short taper at
    // the start), and fade away at the far end.
    const backboneMaterial = this.animate(tissueMaterial({ color: DNA_COLOR, rimColor: '#ffe0ff', wobble: 0, fade: true }));
    for (const strand of [naked.strandA, naked.strandB]) {
      const strandLength = strand.getLength();
      this.scene.add(
        new THREE.Mesh(
          createTaperedTube(strand, { tubularSegments: Math.ceil(strandLength / 0.004), radius: NAKED_STRAND_RADIUS, radialSegments: 10, taperLength: 0.25, fadeLength: 2.5 }),
          backboneMaterial,
        ),
      );
    }
    this.#buildRungs(naked.rungs);

    const histones = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 48, 32),
      this.animate(tissueMaterial({ color: '#8e64c8', rimColor: '#d9c4ff', wobble: 0.01, wobbleScale: 6 })),
      beads.length,
    );
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
    // Histone core: a short, fat spool along the string.
    const scale = new THREE.Vector3(BEAD_RADIUS, BEAD_RADIUS * 1.15, BEAD_RADIUS);
    const matrix = new THREE.Matrix4();
    beads.forEach((b, i) => histones.setMatrixAt(i, matrix.compose(b, quaternion, scale)));
    histones.instanceMatrix.needsUpdate = true;
    histones.computeBoundingSphere();
    this.scene.add(histones);
  }

  /** Base-pair rungs of the naked DNA: two coloured half-rods per pair, meeting midway. */
  #buildRungs(rungs) {
    // Skip the first and last few, where the backbones taper and fade.
    const visible = rungs.slice(6, -Math.round(rungs.length * 0.3));
    if (!visible.length) return;
    const halfLength = visible[0].a.distanceTo(visible[0].b) / 2;
    const radius = NAKED_STRAND_RADIUS * 0.45;
    const mesh = new THREE.InstancedMesh(
      new THREE.CapsuleGeometry(radius, Math.max(0.0005, halfLength - radius * 2), 4, 10),
      new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0, emissive: '#1a1030' }),
      visible.length * 2,
    );
    const bases = ['A', 'T', 'C', 'G'];
    const complement = { A: 'T', T: 'A', C: 'G', G: 'C' };
    const yAxis = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3();
    const center = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const unit = new THREE.Vector3(1, 1, 1);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    visible.forEach((rung, i) => {
      // Deterministic sequence from the rung's position along the strand.
      const base = bases[Math.floor(Math.abs(Math.sin(rung.s * 91.7) * 43758.5)) % 4];
      [[rung.a, base], [rung.b, complement[base]]].forEach(([end, letter], k) => {
        direction.subVectors(rung.middle, end);
        center.copy(end).addScaledVector(direction, 0.5);
        quaternion.setFromUnitVectors(yAxis, direction.normalize());
        mesh.setMatrixAt(i * 2 + k, matrix.compose(center, quaternion, unit));
        mesh.setColorAt(i * 2 + k, color.set(BASE_COLORS[letter]));
      });
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.scene.add(mesh);
  }

  #buildNucleoplasm(rng, count) {
    const positions = [];
    const sizes = [];
    const seeds = [];
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      rng.onSphere(p).multiplyScalar(Math.cbrt(rng.next()) * (ENVELOPE_RADIUS - 0.5));
      const size = rng.range(0.4, 1.4);
      const seed = rng.next();
      if (distanceToPoints(p, this.route.samples) < 0.6) continue;
      positions.push(p.x, p.y, p.z);
      sizes.push(size);
      seeds.push(seed);
    }
    const particles = createParticles({
      positions: new Float32Array(positions),
      sizes: new Float32Array(sizes),
      seeds: new Float32Array(seeds),
      color: '#e2c4ff',
      opacity: 0.3,
      pixelRatio: this.quality.pixelRatio,
      sizeScale: 10,
      drift: 0.15,
      fogFade: true,
    });
    this.animate(particles.material);
    this.scene.add(particles);
  }

  /**
   * Exit path: from the end of the route, over the beads (well clear of them,
   * so no histone ever fills the frame), then down onto the naked DNA from the
   * side, following its bends, so the strand crosses the frame at an angle
   * instead of receding straight away from the lens — ending just above
   * backbone A where it faces the camera.
   */
  #buildFollowPath() {
    const { toCamera, curve } = this.route;
    const { axisAt, tangent, naked } = this.string;
    const side = new THREE.Vector3().crossVectors(tangent, toCamera).normalize();
    const at = (s, height, offset = 0) => axisAt(s).addScaledVector(toCamera, height).addScaledVector(side, offset);

    // Within one turn of DIVE_AT, pick where backbone A faces the camera most.
    let best = { s: DIVE_AT, facing: -Infinity };
    for (let s = DIVE_AT - NAKED_PITCH / 2; s <= DIVE_AT + NAKED_PITCH / 2; s += NAKED_PITCH / 100) {
      const facing = naked.strandDirection(s, 'A').dot(toCamera);
      if (facing > best.facing) best = { s, facing };
    }
    const outward = naked.strandDirection(best.s, 'A');
    this.diveTarget = naked.strandPoint(best.s, 'A');

    this.exitPath = new THREE.CatmullRomCurve3(
      [
        curve.getPointAt(1),
        at(STRING_BEFORE_CENTER + 0.5, 1.3, 1.2),
        at(STRING_BEFORE_CENTER + BEADS_AFTER_CENTER + 0.6, 0.65, 0.9),
        at(best.s - 0.35, 0.3 + DNA_RADIUS, 0.45),
        this.diveTarget.clone().addScaledVector(outward, NAKED_STRAND_RADIUS + APPROACH_GAP),
        this.diveTarget.clone().addScaledVector(outward, NAKED_STRAND_RADIUS + END_GAP),
      ],
      false,
      'centripetal',
    );
    this.exitPath.arcLengthDivisions = 2000;
    this.exitLength = this.exitPath.getLength();
  }

  update({ progress, enter, exit, duration, time }) {
    this.tick(time);

    const clear = easeInOutSine(smoothstep(enter * 0.5, enter + ENTRY_TINT_TAIL, progress));
    this.scene.fog.color.lerpColors(this.fogColorEntry, this.fogColorNucleus, clear);
    this.scene.fog.density = lerp(FOG_DENSITY_ENTRY, FOG_DENSITY_NUCLEUS, clear);
    this.scene.background.copy(this.scene.fog.color);

    this.#updateCamera(progress, enter, exit, duration);
  }

  /**
   * Route (crossing the envelope halfway through the incoming transition),
   * then one continuous move along the exit path: it eases in from the
   * route's stop, then closes in at a steady relative rate (closingGap), still
   * drifting onto the backbone while the DNA scene opens through it — no
   * stall at the start of the transition.
   */
  #updateCamera(progress, enter, exit, duration) {
    const { curve, membraneFraction } = this.route;
    const { position, ahead, gaze, target } = this.tmp;
    const { diveStart } = exitPhases(progress, exit, FOLLOW_UNITS / duration);

    const routeEnd = exit > 0 ? diveStart : 1;
    const routeP = clamp(progress / routeEnd);
    const f = crossAtMidEntry(settle(routeP, 0.8), enter / routeEnd, membraneFraction);
    curve.getPointAt(f, position);
    curve.getPointAt(Math.min(f + 0.04, 1), ahead);
    gaze.subVectors(ahead, position).normalize();

    // Toward the end of the route, turn to look along the string ahead.
    const { axisAt } = this.string;
    axisAt(STRING_BEFORE_CENTER + 1, target);
    gaze.lerp(target.sub(position).normalize(), smoothstep(0.55, 1, routeP));

    if (exit > 0 && progress > diveStart) {
      const t = range01(diveStart, 1, progress);
      const remaining = closingGap(t, this.exitLength + CLOSING_EPSILON, CLOSING_EPSILON) - CLOSING_EPSILON;
      const u = Math.min(1, Math.max(0, 1 - remaining / this.exitLength));
      this.exitPath.getPointAt(u, position);
      // Look a little ahead along the strand, tipping down onto backbone A at the end.
      const along = target.subVectors(position, axisAt(0)).dot(this.string.tangent);
      axisAt(along + lerp(0.5, 0.02, smoothstep(0.55, 0.95, u)), target);
      target.lerp(this.diveTarget, smoothstep(0.8, 1, u));
      // Blend from the route's gaze so the hand-over doesn't snap.
      gaze.lerp(target.sub(position).normalize(), smoothstep(0, 0.15, t)).normalize();
    }
    if (gaze.lengthSq() < 1e-8) gaze.set(0, 0, -1);

    this.camera.position.copy(position);
    this.camera.lookAt(ahead.copy(position).add(gaze));
  }

  onDispose() {
    this.route = null;
    this.string = null;
  }
}

