import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';
import { organicMaterial, tissueMaterial } from '../shared/materials.js';
import { createTaperedTube, distanceToPoints } from '../shared/geometry.js';
import { createParticles } from '../shared/particles.js';
import { ENDOTHELIUM } from '../shared/palette.js';
import organelleVertex from '../../shaders/organelle.vert.glsl?raw';
import sheetFragment from './sheet.frag.glsl?raw';
import vesselOuterFragment from './vesselOuter.frag.glsl?raw';
import { createRng } from '../../utils/random.js';
import { lerp, range01 } from '../../utils/math.js';
import { crossAtMidEntry, exitPhases, settle } from '../../utils/choreography.js';

// Scene units: 1 unit = 10 µm. The camera sinks straight down through the
// skin's layers (y = 0 is the top of the stratum corneum) and dives into a
// dermal blood vessel, which the next scene continues inside.
const CORNEUM_LAYERS = 9;
const CORNEUM_STEP = 0.22;
const BASEMENT_Y = -10.6;
const PAPILLA_HEIGHT = 0.9;
const PAPILLA_FREQUENCY = 0.33;
const DERMIS_BOTTOM = -28;

const VESSEL_Y = -24;
const VESSEL_RADIUS = 4.5;
const VESSEL_TOP = VESSEL_Y + VESSEL_RADIUS;
/** Vessel centreline drifts sideways along Z but passes x = 0 at z = 0, under the camera. */
const vesselAxisX = (z) => 1.6 * Math.sin(z * 0.05);

const APPROACH_GAP = 0.5;
const END_GAP = 0.05;
/** Radius of the clear shaft the camera descends through. */
const SHAFT = 0.8;

/** Fog/background by depth: pale near the surface, deep red by the vessel. */
const FOG_STOPS = [
  { y: 1, color: new THREE.Color('#e8cfc4'), density: 0.028 },
  { y: -10, color: new THREE.Color('#c98f86'), density: 0.034 },
  { y: -15, color: new THREE.Color('#a0505a'), density: 0.04 },
  { y: -19, color: new THREE.Color('#4a121a'), density: 0.05 },
];

const papillae = (x, z) => PAPILLA_HEIGHT * Math.sin(x * PAPILLA_FREQUENCY) * Math.sin(z * PAPILLA_FREQUENCY);

export class DermisScene extends BaseScene {
  constructor(context) {
    super(context);
    this.exitRimColor.set('#ff9f8f');
  }

  onBuild() {
    const q = this.quality.dermis;
    const rng = createRng(11);

    this.scene.fog = new THREE.FogExp2(FOG_STOPS[0].color.clone(), FOG_STOPS[0].density);
    this.scene.background = FOG_STOPS[0].color.clone();

    this.camera.near = 0.01;
    this.camera.far = 90;
    this.camera.fov = 60;
    // The camera looks down the whole time; -Z as up keeps lookAt stable.
    this.camera.up.set(0, 0, -1);
    this.camera.updateProjectionMatrix();

    this.#buildRoute();
    this.#buildCorneum(rng);
    this.#buildEpidermis(rng);
    this.#buildBasementMembrane();
    this.#buildCollagen(rng, q.collagen);
    this.#buildElastin(rng, q.elastin);
    this.#buildFibroblasts(rng, q.fibroblasts);
    this.#buildVessels();
    this.#buildFluid(rng, q.fluidParticles);

    this.tmp = { position: new THREE.Vector3(), ahead: new THREE.Vector3() };
  }

  #buildRoute() {
    const points = [
      new THREE.Vector3(0, 1.3, 0),
      new THREE.Vector3(0, -1.0, 0),
      new THREE.Vector3(0, -6, 0),
      new THREE.Vector3(0.2, BASEMENT_Y, 0.1),
      new THREE.Vector3(1.0, -14, 0.6),
      new THREE.Vector3(0.3, -17.3, 0),
      new THREE.Vector3(0, VESSEL_TOP + APPROACH_GAP, 0),
    ];
    this.route = new THREE.CatmullRomCurve3(points, false, 'centripetal');
    this.routeLength = this.route.getLength();
    this.routeSamples = this.route.getSpacedPoints(200);
    this.vesselTop = new THREE.Vector3(0, VESSEL_TOP, 0);
    this.pressEnd = new THREE.Vector3(0, VESSEL_TOP + END_GAP, 0);
  }

  /** Stratum corneum: overlapping layers of flat, dead hexagonal cells (corneocytes). */
  #buildCorneum(rng) {
    const material = this.animate(tissueMaterial({ color: '#d9a690', rimColor: '#fff0e6', wobble: 0.01 }));
    const spacingX = 3.0;
    const spacingZ = 2.6;
    const extent = 18;
    const matrices = [];
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();

    for (let k = 0; k < CORNEUM_LAYERS; k++) {
      const offsetX = rng.range(0, spacingX);
      const offsetZ = rng.range(0, spacingZ);
      for (let j = -Math.ceil(extent / spacingZ); j <= Math.ceil(extent / spacingZ); j++) {
        for (let i = -Math.ceil(extent / spacingX); i <= Math.ceil(extent / spacingX); i++) {
          const x = i * spacingX + (j % 2) * spacingX * 0.5 + offsetX;
          const z = j * spacingZ + offsetZ;
          const r = rng.range(1.55, 1.9);
          if (Math.hypot(x, z) < SHAFT + r) continue;
          position.set(x, -k * CORNEUM_STEP - 0.06 + rng.range(-0.03, 0.03), z);
          euler.set(rng.range(-0.06, 0.06), rng.range(0, Math.PI), rng.range(-0.06, 0.06));
          quaternion.setFromEuler(euler);
          scale.set(r, 0.12, r);
          matrices.push(new THREE.Matrix4().compose(position, quaternion, scale));
        }
      }
    }
    this.#addInstanced(new THREE.CylinderGeometry(1, 1, 1, 6), material, matrices);
  }

  /** Living epidermis: flattened cells near the top, polyhedral in the middle, columnar at the base. */
  #buildEpidermis(rng) {
    const layers = [
      { y: -2.8, size: [1.5, 0.45, 1.5], spacing: 2.6, basal: false },
      { y: -4.3, size: [1.15, 0.95, 1.15], spacing: 2.2, basal: false },
      { y: -5.9, size: [1.1, 1.0, 1.1], spacing: 2.1, basal: false },
      { y: -7.5, size: [1.0, 1.05, 1.0], spacing: 2.0, basal: false },
      { y: -9.3, size: [0.75, 1.3, 0.75], spacing: 1.6, basal: true },
    ];
    const upper = [];
    const basal = [];
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const extent = 18;

    for (const layer of layers) {
      const steps = Math.ceil(extent / layer.spacing);
      for (let i = -steps; i <= steps; i++) {
        for (let j = -steps; j <= steps; j++) {
          const x = (i + rng.range(-0.2, 0.2)) * layer.spacing;
          const z = (j + rng.range(-0.2, 0.2)) * layer.spacing;
          if (Math.hypot(x, z) < SHAFT + 0.5 + layer.size[0]) continue;
          const jitter = rng.range(0.9, 1.1);
          position.set(x, layer.y + rng.range(-0.15, 0.15), z);
          euler.set(rng.range(-0.15, 0.15), rng.range(0, Math.PI), rng.range(-0.15, 0.15));
          quaternion.setFromEuler(euler);
          scale.set(layer.size[0] * jitter, layer.size[1] * jitter, layer.size[2] * jitter);
          (layer.basal ? basal : upper).push(new THREE.Matrix4().compose(position, quaternion, scale));
        }
      }
    }
    const cell = new THREE.IcosahedronGeometry(1, 2);
    this.#addInstanced(cell, this.animate(tissueMaterial({ color: '#e6b6a2', rimColor: '#ffe6dc', wobble: 0.08, wobbleScale: 1.4 })), upper);
    this.#addInstanced(cell.clone(), this.animate(tissueMaterial({ color: '#c48a74', rimColor: '#ffd6c4', wobble: 0.08, wobbleScale: 1.4 })), basal);
  }

  /** Basement membrane between epidermis and dermis, rising into dermal papillae. */
  #buildBasementMembrane() {
    const geometry = new THREE.PlaneGeometry(44, 44, 140, 140);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      position.setY(i, BASEMENT_Y + papillae(position.getX(i), position.getZ(i)));
    }
    geometry.computeVertexNormals();
    const material = this.animate(
      organicMaterial({
        vertexShader: organelleVertex,
        fragmentShader: sheetFragment,
        uniforms: {
          uWobble: { value: 0 },
          uWobbleScale: { value: 1 },
          uColor: { value: new THREE.Color('#f2c4bc') },
          uRimColor: { value: new THREE.Color('#fff0ec') },
          uOpacity: { value: 0.18 },
        },
        side: THREE.DoubleSide,
        transparent: true,
        depthWrite: false,
      }),
    );
    this.scene.add(new THREE.Mesh(geometry, material));
  }

  /** Is `p` (with clearance `margin`) clear of the camera route and the target vessel? */
  #isClear(p, margin) {
    if (distanceToPoints(p, this.routeSamples) < margin) return false;
    return Math.hypot(p.x - vesselAxisX(p.z), p.y - VESSEL_Y) > VESSEL_RADIUS + margin;
  }

  /** Wavy collagen bundles, mostly lying flat, from one instanced tapered template. */
  #buildCollagen(rng, count) {
    const template = new THREE.CatmullRomCurve3(
      Array.from({ length: 13 }, (_, i) => {
        const x = -6 + i;
        return new THREE.Vector3(x, 0.35 * Math.sin(x * 1.3), 0.25 * Math.cos(x * 0.9));
      }),
    );
    const geometry = createTaperedTube(template, { tubularSegments: 96, radius: 0.42, radialSegments: 7, taperLength: 1.6, fadeLength: 2.2 });
    const material = this.animate(tissueMaterial({ color: '#e2bfae', rimColor: '#fff2ea', wobble: 0.04, wobbleScale: 0.6, fade: true }));
    const checkpoints = template.getSpacedPoints(10);

    const matrices = [];
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3();
    const p = new THREE.Vector3();
    for (let attempt = 0; matrices.length < count && attempt < count * 30; attempt++) {
      position.set(rng.range(-20, 20), rng.range(BASEMENT_Y - 1.5, DERMIS_BOTTOM), rng.range(-20, 20));
      euler.set(rng.range(-0.3, 0.3), rng.range(0, Math.PI * 2), rng.range(-0.3, 0.3));
      quaternion.setFromEuler(euler);
      scale.setScalar(rng.range(0.8, 1.4));
      const matrix = new THREE.Matrix4().compose(position, quaternion, scale);
      const clear = checkpoints.every((c) => {
        p.copy(c).applyMatrix4(matrix);
        return p.y < BASEMENT_Y + papillae(p.x, p.z) - 0.6 && this.#isClear(p, 1.6 * scale.x);
      });
      if (clear) matrices.push(matrix);
    }
    this.#addInstanced(geometry, material, matrices);
  }

  /** Thin, faint elastic fibres. */
  #buildElastin(rng, count) {
    const vertices = [];
    const start = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let n = 0, attempts = 0; n < count && attempts < count * 20; attempts++) {
      start.set(rng.range(-20, 20), rng.range(BASEMENT_Y - 1.5, DERMIS_BOTTOM), rng.range(-20, 20));
      rng.onSphere(direction);
      direction.y *= 0.3;
      direction.normalize();
      const length = rng.range(3, 7);
      if (!this.#isClear(start, 1.2) || !this.#isClear(b.copy(start).addScaledVector(direction, length), 1.2)) continue;
      const wiggle = rng.range(0, Math.PI * 2);
      const segments = 10;
      for (let k = 0; k < segments; k++) {
        const t0 = k / segments;
        const t1 = (k + 1) / segments;
        a.copy(start).addScaledVector(direction, t0 * length);
        a.y += 0.25 * Math.sin(t0 * 9 + wiggle);
        b.copy(start).addScaledVector(direction, t1 * length);
        b.y += 0.25 * Math.sin(t1 * 9 + wiggle);
        vertices.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
      n++;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    const material = new THREE.LineBasicMaterial({ color: '#f0d58a', transparent: true, opacity: 0.3, depthWrite: false, fog: true });
    this.scene.add(new THREE.LineSegments(geometry, material));
  }

  /** Fibroblasts: spindle-shaped cells between the collagen. */
  #buildFibroblasts(rng, count) {
    const matrices = [];
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const scale = new THREE.Vector3(2.0, 0.32, 0.5);
    for (let attempt = 0; matrices.length < count && attempt < count * 30; attempt++) {
      position.set(rng.range(-18, 18), rng.range(BASEMENT_Y - 2, DERMIS_BOTTOM), rng.range(-18, 18));
      if (!this.#isClear(position, 2.6)) continue;
      euler.set(rng.range(-0.3, 0.3), rng.range(0, Math.PI * 2), rng.range(-0.3, 0.3));
      quaternion.setFromEuler(euler);
      matrices.push(new THREE.Matrix4().compose(position, quaternion, scale));
    }
    const material = this.animate(tissueMaterial({ color: '#d68f88', rimColor: '#ffd0c8', wobble: 0.05 }));
    this.#addInstanced(new THREE.SphereGeometry(1, 18, 10), material, matrices);
  }

  /** The target vessel, a deeper horizontal plexus and capillary loops rising into the papillae. */
  #buildVessels() {
    const material = this.animate(
      organicMaterial({
        vertexShader: organelleVertex,
        fragmentShader: vesselOuterFragment,
        uniforms: {
          uWobble: { value: 0 },
          uWobbleScale: { value: 1 },
          uColorWall: { value: new THREE.Color(ENDOTHELIUM) },
          uColorBlood: { value: new THREE.Color('#c0182a') },
          uColorNucleus: { value: new THREE.Color('#4a0c22') },
          uColorRim: { value: new THREE.Color('#ff8a7a') },
        },
      }),
    );
    const tube = (points, radius, segments = 160, radial = 32) =>
      this.scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, radial, false), material));

    // Target: runs along Z, its top passing right under the camera at z = 0.
    tube(
      Array.from({ length: 11 }, (_, i) => {
        const z = -50 + i * 10;
        return new THREE.Vector3(vesselAxisX(z), VESSEL_Y, z);
      }),
      VESSEL_RADIUS,
      220,
      56,
    );

    // Smaller vessels of the plexus, away from the route.
    for (const z of [10, -13]) {
      tube([new THREE.Vector3(-30, -16, z), new THREE.Vector3(-8, -15, z + 1.5), new THREE.Vector3(10, -17, z - 1), new THREE.Vector3(30, -16, z)], 1.4, 120, 20);
    }

    // Capillary loops climbing into papilla peaks (sin·sin = 1).
    const peak = Math.PI / 2 / PAPILLA_FREQUENCY;
    const period = (Math.PI * 2) / PAPILLA_FREQUENCY;
    for (const [px, pz] of [[peak, peak], [-peak, -peak], [peak - period, peak], [peak, peak - period], [-peak + period, -peak]]) {
      const top = BASEMENT_Y + PAPILLA_HEIGHT - 0.35;
      tube(
        [
          new THREE.Vector3(px - 0.6, -15, pz),
          new THREE.Vector3(px - 0.6, -12.5, pz),
          new THREE.Vector3(px - 0.4, top - 0.3, pz),
          new THREE.Vector3(px, top, pz + 0.1),
          new THREE.Vector3(px + 0.4, top - 0.3, pz),
          new THREE.Vector3(px + 0.6, -12.5, pz),
          new THREE.Vector3(px + 0.6, -15, pz),
        ],
        0.32,
        80,
        10,
      );
    }
  }

  #buildFluid(rng, count) {
    const positions = [];
    const sizes = [];
    const seeds = [];
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      p.set(rng.range(-18, 18), rng.range(2, DERMIS_BOTTOM), rng.range(-18, 18));
      const size = rng.range(0.4, 1.2);
      const seed = rng.next();
      if (distanceToPoints(p, this.routeSamples) < 0.4) continue;
      positions.push(p.x, p.y, p.z);
      sizes.push(size);
      seeds.push(seed);
    }
    const particles = createParticles({
      positions: new Float32Array(positions),
      sizes: new Float32Array(sizes),
      seeds: new Float32Array(seeds),
      color: '#fff1e8',
      opacity: 0.35,
      pixelRatio: this.quality.pixelRatio,
      sizeScale: 8,
      drift: 0.08,
      fogFade: true,
    });
    this.animate(particles.material);
    this.scene.add(particles);
  }

  #addInstanced(geometry, material, matrices) {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, matrices.length));
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.count = matrices.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.scene.add(mesh);
    return mesh;
  }

  update({ progress, enter, exit, time }) {
    this.tick(time);
    const { position, ahead } = this.tmp;
    const { overlapStart, press } = exitPhases(progress, exit, 1);

    // Travel 0..1 along the route until the overlap; crossing the top of the
    // corneum (y = 0) halfway through the incoming transition.
    const routeP = Math.min(progress / overlapStart, 1);
    const f = crossAtMidEntry(settle(routeP, 0.85), enter / overlapStart, 1.3 / this.routeLength);
    this.route.getPointAt(f, position);
    this.route.getPointAt(Math.min(f + 0.04, 1), ahead);
    if (f > 0.96 || ahead.distanceToSquared(position) < 1e-6) ahead.copy(this.vesselTop);
    position.lerp(this.pressEnd, press);

    this.camera.position.copy(position);
    this.camera.lookAt(ahead);
    this.#updateFog(position.y);
  }

  #updateFog(y) {
    const fog = this.scene.fog;
    for (let i = 0; i < FOG_STOPS.length - 1; i++) {
      const a = FOG_STOPS[i];
      const b = FOG_STOPS[i + 1];
      if ((y <= a.y && y >= b.y) || i === FOG_STOPS.length - 2) {
        const t = range01(a.y, b.y, y);
        fog.color.lerpColors(a.color, b.color, t);
        fog.density = lerp(a.density, b.density, t);
        break;
      }
    }
    if (y > FOG_STOPS[0].y) {
      fog.color.copy(FOG_STOPS[0].color);
      fog.density = FOG_STOPS[0].density;
    }
    this.scene.background.copy(fog.color);
  }

  onDispose() {
    this.route = null;
    this.routeSamples = null;
  }
}
