import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BaseScene } from '../BaseScene.js';
import { createParticles } from '../shared/particles.js';
import { ENDOTHELIUM, NUCLEAR_ENVELOPE } from '../shared/palette.js';
import { CELL_RADIUS, NUCLEUS_RADIUS, blocksNucleusView, createCellRoute, distanceToRoute } from './cellLayout.js';
import { createCisternaGeometry } from './cellGeometry.js';
import { createTaperedTube, fogLimit, splitByDirection } from '../shared/geometry.js';
import { InstanceCuller } from '../shared/instanceCulling.js';
import { organicMaterial } from '../shared/materials.js';
import organelleVertex from '../../shaders/organelle.vert.glsl?raw';
import organelleFragment from '../../shaders/organelle.frag.glsl?raw';
import mitochondriaFragment from './mitochondria.frag.glsl?raw';
import nucleusFragment from './nucleus.frag.glsl?raw';
import membraneVertex from './membrane.vert.glsl?raw';
import membraneFragment from './membrane.frag.glsl?raw';
import { createRng } from '../../utils/random.js';
import { clamp, easeInOutSine, lerp, range01, smoothstep } from '../../utils/math.js';
import { closingGap, crossAtMidEntry, exitPhases, settle } from '../../utils/choreography.js';

// Exponential-squared fog gives depth: far organelles sink into the cytoplasm
// haze. Right after the membrane the haze is still the dark red of the vessel
// and thick, then it clears into the cell's own colour.
const FOG_COLOR_CELL = '#123a47';
const FOG_COLOR_ENTRY = '#3a0b13'; // matches the vessel scene's fog
const FOG_DENSITY_CELL = 0.068;
const FOG_DENSITY_ENTRY = 0.11;
/** Scene progress (after the transition) over which the red haze clears. */
const ENTRY_TINT_TAIL = 0.22;

/** World lengths over which each ER tubule narrows to a point, and (longer) dissolves away. */
const ER_TAPER_LENGTH = 0.7;
const ER_FADE_LENGTH = 1.3;

/** Final part of the route eases to a stop instead of halting abruptly when the scroll ends. */
const SETTLE_START = 0.8;

/**
 * Timeline units spent diving from the framed shot into the nuclear envelope
 * before the transition into the nucleus begins (absolute, so the dive keeps
 * its pace whatever the scene's duration).
 */
const NUCLEUS_DIVE_UNITS = 0.21;
/** Lens distance from the envelope at the very end of the scene. */
const ENVELOPE_END_GAP = 0.22;
/** Size of the pore the camera dives into, relative to an ordinary pore. */
const HERO_PORE_SIZE = 1.6;

const ORIGIN = new THREE.Vector3();
/** Beyond this the cytoplasm haze (FogExp2 at FOG_DENSITY_CELL) has swallowed small organelles (≥98 %). */
const FOG_LIMIT = 30;
/** Mitochondria further than this (and ≥70 % fogged) use a lighter capsule. */
const MITO_LOD_DISTANCE = 16;

export class CellScene extends BaseScene {
  constructor(context) {
    super(context);
    // Lavender rim: the next scene starts behind the nuclear envelope.
    this.exitRimColor.set('#c9b8ff');
  }

  onBuild() {
    const q = this.quality.cell;
    const rng = createRng(21);
    this.fogColorCell = new THREE.Color(FOG_COLOR_CELL);
    this.fogColorEntry = new THREE.Color(FOG_COLOR_ENTRY);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR_ENTRY, FOG_DENSITY_ENTRY);
    this.scene.background = new THREE.Color(FOG_COLOR_ENTRY);

    this.camera.near = 0.01;
    // The cytoplasm haze is complete by here (the entry haze is even denser).
    this.camera.far = fogLimit(FOG_DENSITY_CELL);
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
    this.scene.add(this.camera);

    this.route = createCellRoute();
    /** Keep the nucleus clear: nothing may sit between the final camera positions and it. */
    this.isClear = (point, margin) => !blocksNucleusView(point, this.route.framingCameras, margin);

    this.#buildMembrane(q.membraneDetail);
    this.#buildNucleus();
    this.#buildMitochondria(rng, q.mitochondria);
    const erCurves = this.#buildEndoplasmicReticulum(rng, q.erTubules);
    this.#buildRibosomes(rng, erCurves, q.erRibosomes, q.freeRibosomes);
    this.#buildGolgi(rng);
    this.#buildFilaments(rng, q.filaments);
    this.#buildCytosol(rng, q.cytosolParticles);

    this.scene.add(new THREE.AmbientLight('#7fb4cc', 0.6));
    this.scene.add(new THREE.HemisphereLight('#bfe9ff', '#2a1640', 0.8));
    this.camera.add(new THREE.PointLight('#ffe6d2', 1.6, 0, 0));

    this.tmp = {
      position: new THREE.Vector3(),
      ahead: new THREE.Vector3(),
      gaze: new THREE.Vector3(),
      toNucleus: new THREE.Vector3(),
    };
  }

  #buildMembrane(detail) {
    const material = this.animate(
      organicMaterial({
        vertexShader: membraneVertex,
        fragmentShader: membraneFragment,
        uniforms: {
          uAmplitude: { value: 0.35 },
          // Outer colour deliberately matches the vessel wall we dive into.
          uColorOuter: { value: new THREE.Color(ENDOTHELIUM) },
          uColorInner: { value: new THREE.Color('#5a3a7a') },
          uColorProtein: { value: new THREE.Color('#a84a55') },
          uColorProteinInner: { value: new THREE.Color('#5a6a9a') },
          uColorRim: { value: new THREE.Color('#c0708a') },
          uSphereRadius: { value: CELL_RADIUS },
        },
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    // In patches, so the parts behind or beside the camera are culled; the
    // vertex shader bulges the surface by up to uAmplitude.
    const sphere = new THREE.IcosahedronGeometry(CELL_RADIUS, detail);
    for (const patch of splitByDirection(sphere, { cells: 2, margin: 1 })) {
      const membrane = new THREE.Mesh(patch, material);
      membrane.renderOrder = 10;
      this.scene.add(membrane);
    }
    sphere.dispose();
  }

  #buildNucleus() {
    const material = this.animate(
      organicMaterial({
        vertexShader: organelleVertex,
        fragmentShader: nucleusFragment,
        uniforms: {
          uWobble: { value: 0.12 },
          uWobbleScale: { value: 0.35 },
          uPoreScale: { value: 1.5 },
          // The pore at the end of the route, straight ahead of the dive.
          uHeroDir: { value: this.route.curve.getPointAt(1).normalize() },
          uHeroSize: { value: HERO_PORE_SIZE },
          // The hero object only takes part of the haze so it stays the focal point.
          uFogAmount: { value: 0.3 },
          uColorEnvelope: { value: new THREE.Color(NUCLEAR_ENVELOPE.envelope) },
          uColorPoreRing: { value: new THREE.Color(NUCLEAR_ENVELOPE.ring) },
          uColorPoreCenter: { value: new THREE.Color(NUCLEAR_ENVELOPE.core) },
          uColorRim: { value: new THREE.Color(NUCLEAR_ENVELOPE.rim) },
        },
      }),
    );
    // In patches: during the dive the lens is right on its surface and sees only a small part of it.
    const sphere = new THREE.SphereGeometry(NUCLEUS_RADIUS, 160, 120);
    for (const patch of splitByDirection(sphere, { cells: 2, margin: 0.3 })) this.scene.add(new THREE.Mesh(patch, material));
    sphere.dispose();
  }

  #buildMitochondria(rng, count) {
    const material = this.animate(
      organicMaterial({
        vertexShader: organelleVertex,
        fragmentShader: mitochondriaFragment,
        uniforms: {
          uWobble: { value: 0.07 },
          uWobbleScale: { value: 0.9 },
          uColorMembrane: { value: new THREE.Color('#e8906a') },
          uColorMatrix: { value: new THREE.Color('#9a3c40') },
          uColorCristae: { value: new THREE.Color('#d98c66') },
        },
      }),
    );
    const mesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.55, 2.0, 8, 24, 6), material, count);
    const far = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.55, 2.0, 6, 16, 4), material, count);
    const matrices = [];

    const placed = [];
    const position = new THREE.Vector3();
    const axis = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    let attempts = 0;

    while (placed.length < count && attempts < count * 120) {
      attempts++;
      // Keep a clear band around the nucleus: a mitochondrion near its limb
      // reads as a small red speck sitting on the nucleus surface.
      rng.onSphere(position).multiplyScalar(rng.range(NUCLEUS_RADIUS + 3.4, CELL_RADIUS - 2));
      if (distanceToRoute(position, this.route.samples) < 2.6) continue;
      // Capsule reach is up to ~2.2 from its centre: never overlap the nucleus
      // silhouette from any point on the route.
      if (blocksNucleusView(position, this.route.viewCameras, 2.2)) continue;
      if (placed.some((p) => p.distanceToSquared(position) < 2.6 * 2.6)) continue;
      placed.push(position.clone());

      quaternion.setFromAxisAngle(rng.onSphere(axis), rng.range(0, Math.PI * 2));
      const s = rng.range(0.8, 1.2);
      scale.set(s, s * rng.range(0.9, 1.4), s);
      matrices.push(matrix.compose(position, quaternion, scale).clone());
    }
    // Only the mitochondria in view are drawn; distant ones use the lighter capsule.
    this.addCuller(new InstanceCuller(mesh, matrices, { lod: far, lodDistance: MITO_LOD_DISTANCE, maxDistance: FOG_LIMIT }));
    this.scene.add(mesh, far);
    this.addAnchor('mitochondrion', placed, { near: 2.5, far: 16 });
  }

  /**
   * Rough ER: thin tubules that wrap the nucleus in a few shells just above
   * its envelope, each narrowing to a point and dissolving at both ends.
   * Because it hugs the nucleus, a tubule on the side the camera can see would
   * lie across its face, so tubules are checked against every camera position
   * on the route. What survives sits on the far side and peeks out around the
   * silhouette.
   */
  #buildEndoplasmicReticulum(rng, count) {
    const material = this.animate(
      organicMaterial({
        vertexShader: organelleVertex,
        fragmentShader: organelleFragment,
        uniforms: {
          uWobble: { value: 0.015 },
          uWobbleScale: { value: 1.2 },
          uColor: { value: new THREE.Color('#5d7fd6') },
          uRimColor: { value: new THREE.Color('#9fd2ff') },
        },
        defines: { USE_FADE: '' },
        // Only the tips are translucent; keep depth writes so the bodies sort like solids.
        transparent: true,
      }),
    );

    const curves = [];
    const tubes = [];
    const axis = new THREE.Vector3();
    const u = new THREE.Vector3();
    const v = new THREE.Vector3();
    const { viewCameras } = this.route;
    for (let attempt = 0; curves.length < count && attempt < count * 150; attempt++) {
      rng.onSphere(axis);
      u.set(1, 0, 0).cross(axis);
      if (u.lengthSq() < 0.01) u.set(0, 1, 0).cross(axis);
      u.normalize();
      v.crossVectors(axis, u);

      const shell = NUCLEUS_RADIUS + rng.range(0.6, 2.4);
      const arcStart = rng.range(0, Math.PI * 2);
      const arcLength = rng.range(0.9, 1.9);
      const phase = rng.range(0, Math.PI * 2);
      const points = [];
      const segments = 8;
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const a = arcStart + t * arcLength;
        const r = shell + Math.sin(t * 5 + phase) * 0.22;
        points.push(
          new THREE.Vector3()
            .addScaledVector(u, Math.cos(a) * r)
            .addScaledVector(v, Math.sin(a) * r)
            .addScaledVector(axis, Math.sin(t * 4 + phase * 1.7) * 0.35),
        );
      }
      const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
      const samples = curve.getSpacedPoints(30);
      const clear = samples.every(
        (p) => !blocksNucleusView(p, viewCameras, 0.3) && distanceToRoute(p, this.route.samples) > 1.2,
      );
      if (!clear) continue;

      const radius = rng.range(0.07, 0.11);
      const length = curve.getLength();
      // Ribosomes stay on the fully opaque body, not on the fading tips.
      curves.push({ curve, radius, taperFraction: Math.min(0.45, ER_FADE_LENGTH / length) });
      // ~0.05 units per ring keeps the taper smooth.
      const tubularSegments = Math.ceil(length / 0.05);
      const geometry = createTaperedTube(curve, {
        tubularSegments,
        radius,
        radialSegments: 6,
        taperLength: ER_TAPER_LENGTH,
        fadeLength: ER_FADE_LENGTH,
      });
      tubes.push(geometry);
    }
    // All tubules share one material: one mesh, one draw call.
    if (tubes.length) {
      this.scene.add(new THREE.Mesh(mergeGeometries(tubes), material));
      tubes.forEach((g) => g.dispose());
    }
    // Click point on the opaque middle of each tubule.
    this.addAnchor('er', curves.map(({ curve }) => curve.getPointAt(0.5)), { near: 2, far: 18 });
    return curves;
  }

  #buildRibosomes(rng, erCurves, erCount, freeCount) {
    const material = new THREE.MeshLambertMaterial({ color: '#e9dcff', emissive: '#3a2a5a' });
    const total = (erCurves.length ? erCount : 0) + freeCount;
    const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 1), material, total);
    const matrices = [];

    const position = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    const offset = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    let index = 0;

    if (erCurves.length) {
      for (let i = 0; i < erCount; i++) {
        const { curve, radius, taperFraction } = erCurves[i % erCurves.length];
        // Stay off the tapered, fading tips.
        const t = rng.range(taperFraction, 1 - taperFraction);
        curve.getPointAt(t, position);
        curve.getTangentAt(t, tangent);
        // Random direction perpendicular to the tube: studs on its surface.
        rng.onSphere(offset);
        offset.addScaledVector(tangent, -offset.dot(tangent)).normalize();
        position.addScaledVector(offset, radius + 0.03);
        matrices[index++] = matrix.makeTranslation(position).clone();
      }
    }

    let attempts = 0;
    const free = index + freeCount;
    while (index < free && attempts < freeCount * 20) {
      attempts++;
      rng.onSphere(position).multiplyScalar(rng.range(NUCLEUS_RADIUS + 0.6, CELL_RADIUS - 0.8));
      // Ribosomes are tiny; any closer than this they balloon into blobs on the lens.
      if (distanceToRoute(position, this.route.samples) < 1.4) continue;
      // No stray specks on the nucleus face from any point of the route.
      if (blocksNucleusView(position, this.route.viewCameras, 0.2)) continue;
      matrices[index++] = matrix.makeTranslation(position).clone();
    }

    // Only the ribosomes in view (and not lost in the haze) are drawn.
    this.addCuller(new InstanceCuller(mesh, matrices, { maxDistance: FOG_LIMIT }));
    this.scene.add(mesh);
  }

  /**
   * Golgi apparatus: stacks of flattened, gently curved sacs (cisternae) with
   * a few vesicles budding off the rims. Stacks sit beside the route, tangent
   * to the nucleus, and never in front of it.
   */
  #buildGolgi(rng) {
    const material = this.animate(
      organicMaterial({
        vertexShader: organelleVertex,
        fragmentShader: organelleFragment,
        uniforms: {
          // Must stay well below the sac thickness or the wobble punches through.
          uWobble: { value: 0.012 },
          uWobbleScale: { value: 0.8 },
          uColor: { value: new THREE.Color('#d9a63c') },
          uRimColor: { value: new THREE.Color('#ffe2a0') },
        },
      }),
    );

    const { at } = this.route;
    const candidates = [at(11.5, 8.0, -3.6), at(2.0, 9.5, -4.2), at(14.5, 4.0, 3.2), at(7.0, 12.0, -2.4)];
    const stacks = candidates
      .filter((p) => distanceToRoute(p, this.route.samples) > 3.4 && this.isClear(p, 2.2))
      .slice(0, 2);

    this.addAnchor('golgi', stacks, { near: 2.5, far: 18 });

    const layers = 6;
    const vesiclesPerStack = 12;
    const sacs = new THREE.InstancedMesh(createCisternaGeometry(), material, stacks.length * layers);
    const vesicles = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 16, 12), material, stacks.length * vesiclesPerStack);

    const outward = new THREE.Vector3();
    const base = new THREE.Quaternion();
    const twist = new THREE.Quaternion();
    const quaternion = new THREE.Quaternion();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const local = new THREE.Vector3();

    stacks.forEach((center, s) => {
      // Stack axis points away from the nucleus; spin it randomly around that axis.
      outward.copy(center).normalize();
      base.setFromUnitVectors(yAxis, outward);
      twist.setFromAxisAngle(yAxis, rng.range(0, Math.PI));
      base.multiply(twist);

      for (let i = 0; i < layers; i++) {
        const k = i - (layers - 1) / 2;
        // Middle sacs are the widest; outer ones shrink a little.
        const size = 1 - 0.07 * Math.abs(k) + rng.range(-0.04, 0.04);
        local.set(rng.range(-0.06, 0.06), k * 0.24, rng.range(-0.06, 0.06)).applyQuaternion(base);
        position.copy(center).add(local);
        scale.set(size, 1, size);
        place(sacs, s * layers + i, position, base, scale);
      }

      for (let i = 0; i < vesiclesPerStack; i++) {
        // Bud off around the rim of the stack.
        const a = rng.range(0, Math.PI * 2);
        local.set(Math.cos(a) * rng.range(1.9, 2.4), rng.range(-0.8, 0.8), Math.sin(a) * rng.range(1.1, 1.6)).applyQuaternion(base);
        position.copy(center).add(local);
        scale.setScalar(rng.range(0.7, 1.2));
        place(vesicles, s * vesiclesPerStack + i, position, quaternion.identity(), scale);
      }
    });

    function place(target, index, p, q, sc) {
      target.setMatrixAt(index, matrix.compose(p, q, sc));
    }

    for (const target of [sacs, vesicles]) {
      target.instanceMatrix.needsUpdate = true;
      target.computeBoundingSphere();
      this.scene.add(target);
    }
  }

  /**
   * Cytoskeleton: short, faint, slightly curved filaments scattered through the
   * cytoplasm in all directions (no single radiating centre).
   */
  #buildFilaments(rng, count) {
    const segments = 8;
    const vertices = [];
    const start = new THREE.Vector3();
    const end = new THREE.Vector3();
    const control = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const bow = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const curve = new THREE.QuadraticBezierCurve3(start, control, end);

    let attempts = 0;
    let made = 0;
    while (made < count && attempts < count * 20) {
      attempts++;
      rng.onSphere(start).multiplyScalar(rng.range(NUCLEUS_RADIUS + 1.0, CELL_RADIUS - 1.2));
      rng.onSphere(direction);
      end.copy(start).addScaledVector(direction, rng.range(1.2, 3.2));
      if (end.length() > CELL_RADIUS - 1 || end.length() < NUCLEUS_RADIUS + 0.8) continue;

      // Gentle bow perpendicular to the filament.
      rng.onSphere(bow);
      bow.addScaledVector(direction, -bow.dot(direction)).normalize();
      control.lerpVectors(start, end, 0.5).addScaledVector(bow, rng.range(0.15, 0.45));

      const mid = control;
      // Fogged lines across the nucleus would read as scratches on it, from any viewpoint.
      if (distanceToRoute(mid, this.route.samples) < 0.8) continue;
      if (blocksNucleusView(start, this.route.viewCameras, 0.3) || blocksNucleusView(end, this.route.viewCameras, 0.3)) continue;
      if (blocksNucleusView(mid, this.route.viewCameras, 0.3)) continue;

      for (let k = 0; k < segments; k++) {
        curve.getPoint(k / segments, a);
        curve.getPoint((k + 1) / segments, b);
        vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      made++;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({ color: '#7cc6c9', transparent: true, opacity: 0.16, depthWrite: false, fog: true });
    this.scene.add(new THREE.LineSegments(geometry, material));
  }

  #buildCytosol(rng, count) {
    const positions = [];
    const sizes = [];
    const seeds = [];
    const p = new THREE.Vector3();
    const inner = (NUCLEUS_RADIUS + 0.3) ** 3;
    const outer = (CELL_RADIUS - 0.3) ** 3;
    for (let i = 0; i < count; i++) {
      // Uniform in the shell volume; none in front of the nucleus.
      rng.onSphere(p).multiplyScalar(Math.cbrt(lerp(inner, outer, rng.next())));
      const size = rng.range(0.5, 1.6);
      const seed = rng.next();
      if (!this.isClear(p, 0.3)) continue;
      positions.push(p.x, p.y, p.z);
      sizes.push(size);
      seeds.push(seed);
    }
    this.cytosol = createParticles({
      positions: new Float32Array(positions),
      sizes: new Float32Array(sizes),
      seeds: new Float32Array(seeds),
      color: '#9fe7ff',
      opacity: 0.3,
      pixelRatio: this.quality.pixelRatio,
      sizeScale: 10,
      drift: 0.12,
      // Specks dissolve into the haze instead of taking its colour; otherwise
      // the dark red entry haze turns them into red dots.
      fogFade: true,
    });
    this.animate(this.cytosol.material);
    this.scene.add(this.cytosol);
  }

  update({ progress, enter, exit, duration, time }) {
    this.tick(time);
    this.#updateAtmosphere(progress, enter);
    this.#updateCamera(progress, enter, exit, duration);
  }

  /** The vessel's dark red haze lingers just inside the membrane, then clears into the cell's colour. */
  #updateAtmosphere(progress, enter) {
    const clear = easeInOutSine(smoothstep(enter * 0.5, enter + ENTRY_TINT_TAIL, progress));
    this.scene.fog.color.lerpColors(this.fogColorEntry, this.fogColorCell, clear);
    this.scene.fog.density = lerp(FOG_DENSITY_ENTRY, FOG_DENSITY_CELL, clear);
    this.scene.background.copy(this.scene.fog.color);
  }

  /**
   * Route: arc-length fraction = settle(p)^k (see crossAtMidEntry), so the
   * camera crosses the membrane halfway through the incoming transition and
   * eases to a stop on the framed shot of the nucleus. The gaze leans toward
   * the nucleus once inside and is centred on it at the end of the route.
   *
   * Exit: from the framed shot the camera closes in on the large pore
   * straight ahead in one continuous move (closingGap): it never stalls,
   * and is still drifting into the pore while the nucleus scene opens
   * through it.
   */
  #updateCamera(progress, enter, exit, duration) {
    const { curve, membraneFraction } = this.route;
    const { position, ahead, gaze, toNucleus } = this.tmp;
    const { diveStart } = exitPhases(progress, exit, NUCLEUS_DIVE_UNITS / duration);

    // Route progress runs 0..1 between the scene start and the start of the dive.
    const routeEnd = exit > 0 ? diveStart : 1;
    const routeP = clamp(progress / routeEnd);
    const f = crossAtMidEntry(settle(routeP, SETTLE_START), enter / routeEnd, membraneFraction);

    curve.getPointAt(f, position);
    curve.getPointAt(Math.min(f + 0.03, 1), ahead);

    gaze.subVectors(ahead, position).normalize();
    toNucleus.subVectors(ORIGIN, position).normalize();
    const lean = smoothstep(enter, enter + 0.15, progress) * 0.25;
    const frame = smoothstep(0.55, 0.95, routeP);
    gaze.lerp(toNucleus, Math.max(lean, frame));
    if (gaze.lengthSq() < 1e-8) gaze.copy(toNucleus);

    if (exit > 0 && progress > diveStart) {
      // Straight in along the line to the nucleus centre (and the hero pore),
      // so nothing new enters the shot.
      const outward = ahead.copy(position).normalize();
      const startGap = position.length() - NUCLEUS_RADIUS;
      const gap = closingGap(range01(diveStart, 1, progress), startGap, ENVELOPE_END_GAP);
      position.copy(outward).multiplyScalar(NUCLEUS_RADIUS + gap);
      gaze.copy(outward).negate();
    }

    this.camera.position.copy(position);
    this.camera.lookAt(position.add(gaze.normalize()));
  }

  onDispose() {
    this.route = null;
    this.isClear = null;
  }
}
