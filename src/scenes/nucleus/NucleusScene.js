import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BaseScene } from '../BaseScene.js';
import { organicMaterial, tissueMaterial } from '../shared/materials.js';
import { createTaperedTube, distanceToPoints } from '../shared/geometry.js';
import { createParticles } from '../shared/particles.js';
import {
  BEADS_AFTER_CENTER,
  BEAD_RADIUS,
  DNA_RADIUS,
  ENVELOPE_RADIUS,
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
import { clamp, easeInOutSine, lerp, smoothstep } from '../../utils/math.js';
import { crossAtMidEntry, exitPhases, settle } from '../../utils/choreography.js';

// The cell scene's haze lingers just inside the envelope, then clears into
// the nucleoplasm's violet.
const FOG_COLOR_NUCLEUS = '#1d1238';
const FOG_COLOR_ENTRY = '#123a47'; // the cell scene's fog
const FOG_DENSITY_NUCLEUS = 0.05;
const FOG_DENSITY_ENTRY = 0.08;
const ENTRY_TINT_TAIL = 0.2;

/** Same palette as the nucleus in the cell scene, so the envelope matches across the transition. */
const ENVELOPE_COLORS = {
  envelope: '#4a3fbf',
  ring: '#c2b4ff',
  core: '#120c3a',
  rim: '#8f7bff',
};
/** Cell scene: pore scale 1.5 on a radius of 6.5. Keep the same number of pores around. */
const PORE_SCALE = (1.5 * 6.5) / ENVELOPE_RADIUS;
const WRINKLE_SCALE = (0.9 * 6.5) / ENVELOPE_RADIUS;

const DNA_COLOR = '#d68cf0';
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
/** Lens height above the strand's surface at the end of the follow and of the press. */
const APPROACH_GAP = 0.07;
const END_GAP = 0.012;

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
    this.#buildChromatin(fibers);
    this.#buildNucleolus();
    this.#buildNucleosomes(stringStart, stringEnd);
    this.#buildNucleoplasm(rng, q.particles);
    this.#buildFollowPath(stringStart);

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

  /** All fibres merged into two meshes (euchromatin, heterochromatin): two draw calls in total. */
  #buildChromatin(fibers) {
    const groups = { false: [], true: [] };
    for (const { curve, peripheral } of fibers) {
      const tubularSegments = Math.ceil(curve.getLength() / 0.22);
      groups[peripheral].push(createTaperedTube(curve, { tubularSegments, radius: peripheral ? 0.22 : 0.18, radialSegments: 5, taperLength: 1.5, fadeLength: 3 }));
    }
    const looks = {
      false: { color: '#b867d6', rimColor: '#f0c8ff' },
      true: { color: '#7e3aa0', rimColor: '#d8a8f0' },
    };
    for (const key of ['false', 'true']) {
      if (!groups[key].length) continue;
      const geometry = mergeGeometries(groups[key]);
      groups[key].forEach((g) => g.dispose());
      this.scene.add(new THREE.Mesh(geometry, this.animate(tissueMaterial({ ...looks[key], wobble: 0.03, wobbleScale: 0.8, fade: true }))));
    }
  }

  /** Nucleolus: a dense, granular body off to the side of the route. */
  #buildNucleolus() {
    const center = this.route.at(15, -7, -6);
    const material = this.animate(tissueMaterial({ color: '#5a2a7a', rimColor: '#c08ae0', wobble: 0.6, wobbleScale: 0.35 }));
    const nucleolus = new THREE.Mesh(new THREE.IcosahedronGeometry(5.5, 24), material);
    nucleolus.position.copy(center);
    this.scene.add(nucleolus);
  }

  /**
   * The target: DNA wrapped around histone beads, unravelling from the
   * chromatin and running on as naked DNA past the last bead. Its surface
   * shows the double helix when seen up close (dnaStrand.frag.glsl).
   */
  #buildNucleosomes(stringStart, stringEnd) {
    const { curve, beads, tangent } = createNucleosomeString(stringStart, stringEnd, this.route.bead, STRING_BEFORE_CENTER + BEADS_AFTER_CENTER);
    const length = curve.getLength();
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
    const tubularSegments = Math.ceil(length / 0.012);
    this.scene.add(new THREE.Mesh(createTaperedTube(curve, { tubularSegments, radius: DNA_RADIUS, radialSegments: 16, taperLength: 1.5, fadeLength: 3 }), dnaMaterial));

    const histones = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 20, 14),
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
   * Follow path: from the end of the route, over the beads (well clear of
   * them, so no histone ever fills the frame), then low along the naked DNA
   * until the lens is just above its surface.
   */
  #buildFollowPath(stringStart) {
    const { stringTangent, toCamera, curve } = this.route;
    const at = (s, height) => stringStart.clone().addScaledVector(stringTangent, s).addScaledVector(toCamera, height);
    this.stringPoint = (s, out) => out.copy(stringStart).addScaledVector(stringTangent, s);
    this.stringStart = stringStart;
    this.followPath = new THREE.CatmullRomCurve3(
      [
        curve.getPointAt(1),
        at(STRING_BEFORE_CENTER + 0.5, 1.3),
        at(STRING_BEFORE_CENTER + BEADS_AFTER_CENTER + 0.6, 0.5),
        at(DIVE_AT - 0.7, 0.16 + DNA_RADIUS),
        at(DIVE_AT, APPROACH_GAP + DNA_RADIUS),
      ],
      false,
      'centripetal',
    );
    this.pressEnd = at(DIVE_AT + 0.08, END_GAP + DNA_RADIUS);
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
   * then the follow along the string, and a slow press into the DNA while the
   * DNA scene opens through it.
   */
  #updateCamera(progress, enter, exit, duration) {
    const { curve, membraneFraction, stringTangent } = this.route;
    const { position, ahead, gaze, target } = this.tmp;
    const { diveStart, dive, press } = exitPhases(progress, exit, FOLLOW_UNITS / duration);

    const routeEnd = exit > 0 ? diveStart : 1;
    const routeP = clamp(progress / routeEnd);
    const f = crossAtMidEntry(settle(routeP, 0.8), enter / routeEnd, membraneFraction);
    curve.getPointAt(f, position);
    curve.getPointAt(Math.min(f + 0.04, 1), ahead);
    gaze.subVectors(ahead, position).normalize();

    // Toward the end of the route, turn to look along the string ahead.
    this.stringPoint(STRING_BEFORE_CENTER + 1, target);
    gaze.lerp(target.sub(position).normalize(), smoothstep(0.55, 1, routeP));

    if (dive > 0 || press > 0) {
      this.followPath.getPointAt(dive, position).lerp(this.pressEnd, press);
      // Look ahead along the strand, tipping down onto it at the end so its
      // surface (and the helix in it) fills the frame.
      const along = target.subVectors(position, this.stringStart).dot(stringTangent);
      const down = Math.max(smoothstep(0.65, 1, dive), press);
      this.stringPoint(along + lerp(1.4, 0.02, down), target);
      // Blend from the route's gaze so the hand-over doesn't snap.
      gaze.lerp(target.sub(position).normalize(), Math.max(smoothstep(0, 0.2, dive), press)).normalize();
    }
    if (gaze.lengthSq() < 1e-8) gaze.set(0, 0, -1);

    this.camera.position.copy(position);
    this.camera.lookAt(ahead.copy(position).add(gaze));
  }

  onDispose() {
    this.route = null;
  }
}

