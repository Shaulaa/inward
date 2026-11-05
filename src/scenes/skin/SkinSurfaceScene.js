import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';
import { organicMaterial, tissueMaterial } from '../shared/materials.js';
import { createTaperedTube } from '../shared/geometry.js';
import { createSkinField } from './skinField.js';
import skinVertex from './skin.vert.glsl?raw';
import skinFragment from './skin.frag.glsl?raw';
import { createRng } from '../../utils/random.js';
import { easeInOutSine, lerp } from '../../utils/math.js';
import { exitPhases } from '../../utils/choreography.js';

// Scene units: 1 unit = 1 mm. The surface is 300 mm across on a graded grid
// (dense where the camera looks, coarse toward the edges, which sit deep in
// the haze), so no edge of the skin is ever on screen at any aspect ratio.
// Pores are modelled within the central 90 mm; the opening view frames
// roughly 1–2 cm of skin.
const FOG_COLOR = '#eadbd2';
const FOG_DENSITY = 0.018;
const LIGHT_DIR = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();
const VERTICAL_FOV = 55;
const MAX_HORIZONTAL_FOV = 80;

/** Lens height above the skin when the dive hands over to the slow press, and at the very end. */
const APPROACH_HEIGHT = 0.45;
const END_HEIGHT = 0.05;
/** Hairs stay this far (mm) from the dive target so none crosses the camera, and within view. */
const HAIR_CLEARANCE = 3.5;
const HAIR_RANGE = 30;

/**
 * Maps a uniform grid coordinate u in [-1, 1] to world units: the inner 60 %
 * of the segments cover ±denseHalf evenly, the rest stretch quadratically out
 * to ±half (continuous position and slope at the seam).
 */
function gradedCoordinate(u, denseHalf, half) {
  const inner = 0.6;
  const t = Math.abs(u);
  const a = denseHalf / half;
  if (t <= inner) return Math.sign(u) * half * a * (t / inner);
  const k = t - inner;
  const slope = a / inner;
  const curve = (1 - a - slope * (1 - inner)) / (1 - inner) ** 2;
  return Math.sign(u) * half * (a + slope * k + curve * k * k);
}

export class SkinSurfaceScene extends BaseScene {
  constructor(context) {
    super(context);
    this.exitRimColor.set('#fff0e4');
  }

  onBuild() {
    const q = this.quality.skin;
    const rng = createRng(3);

    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

    this.camera.near = 0.01;
    this.camera.far = 120;
    this.camera.fov = VERTICAL_FOV;
    // The camera ends up looking straight down; a world-up of -Z keeps lookAt stable there.
    this.camera.up.set(0, 0, -1);
    this.camera.updateProjectionMatrix();

    this.field = createSkinField(rng, { size: q.poreFieldSize });
    this.#chooseTarget();
    this.#buildSurface(q);
    this.#buildHairs(rng, q.hairs);
    this.#buildRoute();

    this.tmp = { position: new THREE.Vector3(), look: new THREE.Vector3() };
  }

  /** A pore-free spot near the centre, so the final close-up is plain skin. */
  #chooseTarget() {
    let best = { x: 0, z: 0, d: -1 };
    for (let x = -2; x <= 2; x += 0.25) {
      for (let z = -2; z <= 2; z += 0.25) {
        const d = this.field.nearestPoreDistance(x, z);
        if (d > best.d) best = { x, z, d };
      }
    }
    const { height } = this.field.sample(best.x, best.z);
    this.target = new THREE.Vector3(best.x, height, best.z);
  }

  #buildSurface({ surfaceSize, surfaceSegments, denseSize }) {
    const geometry = new THREE.PlaneGeometry(2, 2, surfaceSegments, surfaceSegments);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.attributes.position;
    const pores = new Float32Array(position.count);
    const half = surfaceSize / 2;
    for (let i = 0; i < position.count; i++) {
      const x = gradedCoordinate(position.getX(i), denseSize / 2, half);
      const z = gradedCoordinate(position.getZ(i), denseSize / 2, half);
      const { height, pore } = this.field.sample(x, z);
      position.setXYZ(i, x, height, z);
      pores[i] = pore;
    }
    geometry.setAttribute('aPore', new THREE.BufferAttribute(pores, 1));
    geometry.computeVertexNormals();

    const material = this.animate(
      organicMaterial({
        vertexShader: skinVertex,
        fragmentShader: skinFragment,
        uniforms: {
          uLightDir: { value: LIGHT_DIR.clone() },
          uLightColor: { value: new THREE.Color('#fff1e6') },
          uSkyColor: { value: new THREE.Color('#d9d4e8') },
          uColorBase: { value: new THREE.Color('#d9a38c') },
          uColorBlush: { value: new THREE.Color('#c97a6c') },
          uColorFurrow: { value: new THREE.Color('#a8665a') },
          uColorPore: { value: new THREE.Color('#5a2a26') },
        },
      }),
    );
    this.scene.add(new THREE.Mesh(geometry, material));
  }

  /** Fine hairs growing out of some pores, all from one instanced, tapered template. */
  #buildHairs(rng, count) {
    const template = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.15, 0),
      new THREE.Vector3(0.05, 0.8, 0),
      new THREE.Vector3(0.45, 2.2, 0),
      new THREE.Vector3(1.3, 3.5, 0),
      new THREE.Vector3(2.6, 4.4, 0),
    ]);
    const geometry = createTaperedTube(template, { tubularSegments: 48, radius: 0.045, radialSegments: 5, taperLength: 2.5 });
    const material = this.animate(tissueMaterial({ color: '#4a2e22', rimColor: '#c0906a', wobble: 0 }));

    // Pores within view of the descent, minus a clear zone around the target,
    // shuffled so the hairs spread evenly rather than following the pore grid.
    const candidates = this.field.pores.filter((p) => {
      const d = Math.hypot(p.x - this.target.x, p.z - this.target.z);
      return d > HAIR_CLEARANCE && d < HAIR_RANGE;
    });
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const mesh = new THREE.InstancedMesh(geometry, material, Math.min(count, candidates.length));
    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < mesh.count; i++) {
      const pore = candidates[i];
      position.set(pore.x, this.field.sample(pore.x, pore.z).height, pore.z);
      // Hairs lean roughly the same way, like a real hair stream.
      euler.set(rng.range(-0.12, 0.12), rng.range(0.3, 1.2), rng.range(-0.15, 0.1));
      quaternion.setFromEuler(euler);
      scale.setScalar(rng.range(0.6, 1.3));
      mesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    this.scene.add(mesh);
  }

  #buildRoute() {
    const t = this.target;
    this.route = new THREE.CatmullRomCurve3(
      [
        new THREE.Vector3(t.x + 3.0, t.y + 10, t.z + 4.5),
        new THREE.Vector3(t.x + 1.8, t.y + 5.8, t.z + 2.8),
        new THREE.Vector3(t.x + 0.8, t.y + 2.4, t.z + 1.2),
        new THREE.Vector3(t.x, t.y + APPROACH_HEIGHT, t.z + 0.04),
      ],
      false,
      'centripetal',
    );
    this.pressEnd = new THREE.Vector3(t.x, t.y + END_HEIGHT, t.z + 0.004);
  }

  update({ progress, exit, time }) {
    this.tick(time);
    const { position, look } = this.tmp;
    // The whole scene is one descent onto the target; then a slow press into the skin.
    const { overlapStart, press } = exitPhases(progress, exit, 1);
    const travel = easeInOutSine(Math.min(progress / overlapStart, 1));

    this.route.getPointAt(travel, position).lerp(this.pressEnd, press);
    // Look a little past the target early on (more horizon), straight at it at the end.
    look.copy(this.target);
    look.z -= lerp(1.5, 0, travel);

    this.camera.position.copy(position);
    this.camera.lookAt(look);
  }

  /**
   * Caps the horizontal field of view: on very wide screens the vertical FOV
   * narrows instead, so the corners never tilt up past the skin's horizon.
   */
  resize(width, height) {
    const aspect = width / height;
    const maxHalfH = THREE.MathUtils.degToRad(MAX_HORIZONTAL_FOV / 2);
    const halfV = Math.min(THREE.MathUtils.degToRad(VERTICAL_FOV / 2), Math.atan(Math.tan(maxHalfH) / aspect));
    this.camera.fov = THREE.MathUtils.radToDeg(halfV * 2);
    super.resize(width, height);
  }

  onDispose() {
    this.field = null;
    this.route = null;
  }
}
