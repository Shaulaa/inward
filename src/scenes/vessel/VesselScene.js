import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';
import { VesselPath } from './VesselPath.js';
import { createRedCellGeometry } from './rbcGeometry.js';
import { createLanes, distributeAlongLane } from './redCellLanes.js';
import { createParticles } from '../shared/particles.js';
import { fogLimit } from '../shared/geometry.js';
import { ENDOTHELIUM, ENDOTHELIUM_HIGHLIGHT } from '../shared/palette.js';
import noise from '../../shaders/noise.glsl?raw';
import bump from '../../shaders/bump.glsl?raw';
import wallVertex from './wall.vert.glsl?raw';
import wallFragment from './wall.frag.glsl?raw';
import redCellVertex from './redCell.vert.glsl?raw';
import redCellFragment from './redCell.frag.glsl?raw';
import { createRng } from '../../utils/random.js';
import { heartbeat } from '../../utils/heartbeat.js';
import { easeInOutCubic, easeOutCubic, lerp, range01, smoothstep } from '../../utils/math.js';

// Scene units: vessel radius 3.2 ≈ 50 µm, so 1 unit ≈ 15 µm. Red cells are
// drawn ~1.4× their true relative size so they read on screen.
const VESSEL_RADIUS = 3.2;
const RED_CELL_RADIUS = 0.32;

// Exponential-squared fog: a soft haze that swallows the far tunnel smoothly
// instead of a hard linear cut-off. Background equals fog colour.
const FOG_COLOR = '#3a0b13';
const FOG_DENSITY = 0.072;

/**
 * The tube keeps going well past the dive target so its open end is always
 * fully fogged (otherwise the background shows through gaps between cells as
 * dark specks near the vanishing point).
 */
const PATH_SEGMENTS = 14;
const PATH_SPACING = 12;
/**
 * World units the camera rides along the vessel before the overlap, and the
 * timeline units the dive toward the wall takes. Both are absolute so the ride
 * keeps its speed when the scene's duration changes.
 */
const RIDE_LENGTH = 62;
const DIVE_UNITS = 0.25;
/** Arc-length position of the endothelial cell the camera dives into. */
const TARGET_S = 0.6;
/** World units: the camera stops this far before the target along the vessel, and looks this far ahead. */
const CAMERA_STOP_BEFORE_TARGET = 1.6;
const LOOK_AHEAD = 7;

const BULGE = 0.24;
/** Distance kept between the lens and the wall at the very end of the dive. */
const END_GAP = 0.035;
/** Distance from the wall at which the dive hands over to the slow press. */
const APPROACH_GAP = 0.4;

// Red cells keep out of a plasma layer at the wall and out of the camera's
// lane on the centreline. Lane spacing > cell diameter prevents overlaps;
// the along-lane gap has extra margin because lanes on the inside of a bend
// get slightly compressed.
const LANE_R_MIN = 0.7;
const LANE_R_MAX = VESSEL_RADIUS * 0.75;
const LANE_SPACING = RED_CELL_RADIUS * 2 + 0.08;
/**
 * Red cells are only drawn within this distance of the lens: past it they
 * are ≥97 % fog (FogExp2 at FOG_DENSITY), and the vessel holds ~1500 of them
 * along its whole length. Within NEAR_DETAIL_DISTANCE they use the detailed
 * model, further out a lighter one (the silhouette is a few dozen pixels).
 */
const DRAW_DISTANCE = 26;
/** Distance from the wall within which wall.frag shows its close-up membrane detail (its `closeUp` ramp ends here). */
const CLOSE_UP_RANGE = 2.5;
const NEAR_DETAIL_DISTANCE = 5;
/** Click points ride on cells in the outermost lanes: the slowest (Poiseuille flow), so the easiest to follow. */
const ANCHOR_LANE_SHARE = 0.85;
const ALONG_LANE_GAP = RED_CELL_RADIUS * 2 + 0.31;

export class VesselScene extends BaseScene {
  constructor(context) {
    super(context);
    // Deep, muted red: the rim sits between the maroon wall and the membrane.
    this.exitRimColor.set('#a8524e');
  }

  onBuild() {
    const q = this.quality.vessel;
    const rng = createRng(7);

    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

    this.camera.near = 0.01;
    // Past this the blood haze is complete.
    this.camera.far = fogLimit(FOG_DENSITY);
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();

    // Gentle S-shaped centreline heading down -Z.
    const controlPoints = [];
    for (let i = 0; i <= PATH_SEGMENTS; i++) {
      controlPoints.push(new THREE.Vector3(Math.sin(i * 0.85) * 3.5, Math.cos(i * 0.65) * 2.4, -i * PATH_SPACING));
    }
    const curve = new THREE.CatmullRomCurve3(controlPoints, false, 'centripetal');
    this.path = new VesselPath(curve, VESSEL_RADIUS);

    this.#buildTarget();
    this.#buildWall(curve, q);
    this.#buildRedCells(rng, q.redCells);
    this.#buildPlasma(rng, q.plasmaParticles);
    this.#buildAnchors();

    this.tmp = {
      position: new THREE.Vector3(),
      look: new THREE.Vector3(),
      center: new THREE.Vector3(),
      ahead: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      spin: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
      matrix: new THREE.Matrix4(),
    };
    this.lastTime = null;
  }

  /** The dive target sits on the side wall (horizontal outward direction) so the camera never rolls. */
  #buildTarget() {
    const center = this.path.pointAt(TARGET_S);
    const tangent = this.path.tangentAt(TARGET_S);
    this.targetOutward = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
    this.target = center.clone().addScaledVector(this.targetOutward, VESSEL_RADIUS);
    // Where the bulged surface actually is, and where the lens stops.
    this.targetSurface = this.target.clone().addScaledVector(this.targetOutward, -BULGE);
    this.diveEnd = this.targetSurface.clone().addScaledVector(this.targetOutward, -END_GAP);
    // Close enough that the bulging cell fills the frame.
    this.diveApproach = this.targetSurface.clone().addScaledVector(this.targetOutward, -APPROACH_GAP);
  }

  #buildWall(curve, q) {
    const geometry = new THREE.TubeGeometry(curve, q.wallTubularSegments, VESSEL_RADIUS, q.wallRadialSegments, false);
    this.wallMaterial = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uTime: { value: 0 },
          uBeat: { value: 0 },
          uTarget: { value: this.target.clone() },
          uBulge: { value: BULGE },
          uBulgeRadius: { value: 0.75 },
          uFocus: { value: 0 },
          // 1 while the lens is close enough to the wall for its close-up detail to show (see #updateCamera).
          uDetail: { value: 0 },
          uLength: { value: this.path.length },
          uCircumference: { value: Math.PI * 2 * VESSEL_RADIUS },
          uColorWall: { value: new THREE.Color(ENDOTHELIUM) },
          uColorBorder: { value: new THREE.Color(ENDOTHELIUM_HIGHLIGHT) },
          uColorNucleus: { value: new THREE.Color('#3e0a1e') },
          uColorRim: { value: new THREE.Color('#4a0a14') },
          uColorTarget: { value: new THREE.Color('#d98a7c') },
        },
      ]),
      vertexShader: `${noise}\n${wallVertex}`,
      fragmentShader: `${noise}\n${bump}\n${wallFragment}`,
      side: THREE.BackSide,
      fog: true,
    });
    this.scene.add(new THREE.Mesh(geometry, this.wallMaterial));
  }

  #buildRedCells(rng, budget) {
    const lanes = createLanes(rng, { rMin: LANE_R_MIN, rMax: LANE_R_MAX, minDistance: LANE_SPACING });
    const perLane = Math.ceil(budget / lanes.length);

    this.lanes = lanes.map((lane) => ({
      ...lane,
      offset: 0,
      // Poiseuille flow: fastest at the centre, slowest at the wall.
      speed: 2.4 * (1 - (lane.radial / VESSEL_RADIUS) ** 2),
    }));

    const axis = new THREE.Vector3();
    this.cellState = [];
    for (const lane of this.lanes) {
      for (const s of distributeAlongLane(rng, perLane, this.path.length, ALONG_LANE_GAP)) {
        if (this.cellState.length >= budget) break;
        rng.onSphere(axis);
        this.cellState.push({
          lane,
          s,
          base: new THREE.Quaternion().setFromAxisAngle(axis.clone(), rng.range(0, Math.PI * 2)),
          spinAxis: rng.onSphere(new THREE.Vector3()),
          spinSpeed: rng.range(0.2, 0.9),
        });
      }
    }

    const material = new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uRadius: { value: RED_CELL_RADIUS },
          uColorCore: { value: new THREE.Color('#c8121c') },
          uColorShadow: { value: new THREE.Color('#4a040c') },
          uColorGlow: { value: new THREE.Color('#ff5a3a') },
        },
      ]),
      vertexShader: redCellVertex,
      fragmentShader: redCellFragment,
      side: THREE.DoubleSide,
      fog: true,
    });
    // Two levels of detail, both refilled every frame with only the cells in view.
    const lod = (geometry) => {
      const mesh = new THREE.InstancedMesh(geometry, material, this.cellState.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      // Culled per cell in #updateFlow; the mesh's own bounds would be meaningless.
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    };
    this.redCellsNear = lod(createRedCellGeometry({ radius: RED_CELL_RADIUS }));
    this.redCellsFar = lod(createRedCellGeometry({ radius: RED_CELL_RADIUS, profileSegments: 5, radialSegments: 16 }));
    this.frustum = new THREE.Frustum();
    this.viewProjection = new THREE.Matrix4();
    this.cellSphere = new THREE.Sphere(new THREE.Vector3(), RED_CELL_RADIUS);

    // Click-point candidates: cells in the slowest lanes; positions follow the cells each frame.
    const slowest = LANE_R_MAX * ANCHOR_LANE_SHARE;
    this.anchorCells = this.cellState.filter((cell) => cell.lane.radial >= slowest);
    this.anchorCells.forEach((cell) => {
      cell.anchor = new THREE.Vector3();
    });
  }

  #buildPlasma(rng, count) {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);
    this.plasmaState = Array.from({ length: count }, (_, i) => {
      sizes[i] = rng.range(0.4, 1.3);
      seeds[i] = rng.next();
      const radial = Math.sqrt(rng.next()) * VESSEL_RADIUS * 0.95;
      return { s: rng.next(), radial, angle: rng.range(0, Math.PI * 2), speed: 2.4 * (1 - (radial / VESSEL_RADIUS) ** 2) };
    });
    this.plasma = createParticles({
      positions,
      sizes,
      seeds,
      color: '#ffd9a0',
      opacity: 0.4,
      pixelRatio: this.quality.pixelRatio,
      sizeScale: 9,
      drift: 0.04,
    });
    this.scene.add(this.plasma);
  }

  /**
   * Click points on real, steady objects: red cells in the slowest lanes
   * (each marker stays on its cell as it drifts down the vessel), and fixed
   * spots on the wall along the stretch the camera rides through.
   */
  #buildAnchors() {
    const cellPositions = this.anchorCells.map((cell) => cell.anchor);
    this.addAnchor('redCells', cellPositions, { near: 1.2, far: 10 });

    const wall = [];
    const stopS = TARGET_S - CAMERA_STOP_BEFORE_TARGET / this.path.length;
    const startS = Math.max(0.02, stopS - RIDE_LENGTH / this.path.length);
    for (let d = 0; d <= RIDE_LENGTH + 12; d += 2) {
      const s = Math.min(1, startS + d / this.path.length);
      for (let k = 0; k < 8; k++) wall.push(this.path.sample(s, VESSEL_RADIUS * 0.97, (k / 8) * Math.PI * 2 + d * 0.37));
    }
    this.addAnchor('wall', wall, { near: 1.5, far: 13 });
  }

  update({ progress, exit, duration, time }) {
    // Flow uses its own clock so a scene that was just built doesn't jump.
    const dt = this.lastTime === null ? 0 : Math.min(time - this.lastTime, 0.1);
    this.lastTime = time;

    // Reduced motion: a steady flow, no pulsing.
    const beat = this.quality.reducedMotion ? 0 : heartbeat(time);
    const flow = (0.45 + 0.9 * beat) * dt / this.path.length;

    this.wallMaterial.uniforms.uTime.value = time;
    this.wallMaterial.uniforms.uBeat.value = beat;
    this.plasma.material.uniforms.uTime.value = time;

    // Camera first: the flow culls and sizes cells against this frame's view.
    this.#updateCamera(progress, exit, duration);
    this.#updateFlow(flow, time);
  }

  #updateFlow(flow, time) {
    const { position, quat, spin, scale, matrix } = this.tmp;
    const camera = this.camera;
    const lens = camera.position;
    camera.updateMatrixWorld();
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.viewProjection);
    const sphere = this.cellSphere;
    const drawSq = DRAW_DISTANCE * DRAW_DISTANCE;
    const nearSq = NEAR_DETAIL_DISTANCE * NEAR_DETAIL_DISTANCE;
    let near = 0;
    let far = 0;

    for (const lane of this.lanes) lane.offset = (lane.offset + lane.speed * flow) % 1;

    for (const cell of this.cellState) {
      const { lane } = cell;
      this.path.sample((cell.s + lane.offset) % 1, lane.radial, lane.angle, position);
      cell.anchor?.copy(position);
      const distanceSq = position.distanceToSquared(lens);
      if (distanceSq > drawSq) continue;
      sphere.center.copy(position);
      if (!this.frustum.intersectsSphere(sphere)) continue;

      // Cells that would slice through the near plane shrink away instead.
      scale.setScalar(Math.max(smoothstep(0.2, 0.9, Math.sqrt(distanceSq)), 1e-3));
      spin.setFromAxisAngle(cell.spinAxis, time * cell.spinSpeed);
      quat.multiplyQuaternions(cell.base, spin);
      matrix.compose(position, quat, scale);
      if (distanceSq < nearSq) this.redCellsNear.setMatrixAt(near++, matrix);
      else this.redCellsFar.setMatrixAt(far++, matrix);
    }
    for (const [mesh, count] of [[this.redCellsNear, near], [this.redCellsFar, far]]) {
      mesh.count = count;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, Math.max(count, 1) * 16);
      mesh.instanceMatrix.needsUpdate = true;
    }

    const positions = this.plasma.geometry.attributes.position;
    this.plasmaState.forEach((speck, i) => {
      speck.s = (speck.s + speck.speed * flow) % 1;
      this.path.sample(speck.s, speck.radial, speck.angle, position);
      positions.setXYZ(i, position.x, position.y, position.z);
    });
    positions.needsUpdate = true;
  }

  /**
   * Phase 1 (dive): leave the centreline and arrive in front of the target
   * cell exactly when the transition overlap begins, so the wall already fills
   * the frame. Phase 2 (press): creep into the membrane during the overlap
   * while the next scene opens through it.
   */
  #updateCamera(progress, exit, duration) {
    const { center, ahead, position, look } = this.tmp;
    const overlapStart = 1 - exit;
    const diveStart = Math.max(0.1, overlapStart - DIVE_UNITS / duration);
    const dive = easeInOutCubic(range01(diveStart, overlapStart, progress));
    const press = easeOutCubic(range01(overlapStart, 1, progress));

    const stopS = TARGET_S - CAMERA_STOP_BEFORE_TARGET / this.path.length;
    const startS = Math.max(0.02, stopS - RIDE_LENGTH / this.path.length);
    const s = lerp(startS, stopS, Math.min(progress / overlapStart, 1));
    this.path.pointAt(s, center);
    this.path.pointAt(Math.min(s + LOOK_AHEAD / this.path.length, 1), ahead);

    position.lerpVectors(center, this.diveApproach, dive).lerp(this.diveEnd, press);
    look.lerpVectors(ahead, this.targetSurface, smoothstep(0, 0.6, dive));

    this.camera.position.copy(position);
    this.camera.lookAt(look);
    // The wall's close-up detail fades in within CLOSE_UP_RANGE of the lens;
    // while the whole wall is further away, skip computing it at all.
    const wallGap = VESSEL_RADIUS - position.distanceTo(center);
    this.wallMaterial.uniforms.uDetail.value = wallGap < CLOSE_UP_RANGE + 0.3 ? 1 : 0;
    this.wallMaterial.uniforms.uFocus.value = smoothstep(diveStart - 0.15, diveStart + 0.1, progress);
  }

  onDispose() {
    this.cellState = null;
    this.lanes = null;
    this.plasmaState = null;
  }
}
