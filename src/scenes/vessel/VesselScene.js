import * as THREE from 'three';
import { BaseScene } from '../BaseScene.js';
import { VesselPath } from './VesselPath.js';
import { createRedCellGeometry } from './rbcGeometry.js';
import { createLanes, distributeAlongLane } from './redCellLanes.js';
import { createParticles } from '../shared/particles.js';
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
    this.camera.far = 70;
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
    this.cameraS = 0;
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
    const geometry = createRedCellGeometry({ radius: RED_CELL_RADIUS });
    this.redCells = new THREE.InstancedMesh(geometry, material, this.cellState.length);
    this.redCells.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Instances move along the whole vessel; the geometry's own bounds are meaningless.
    this.redCells.frustumCulled = false;
    this.scene.add(this.redCells);
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
   * Click points ride along with the camera (the cells themselves stream past
   * too fast to click): fixed slots a few units ahead of the lens — among the
   * red cells, on the wall, and in the plasma between the lanes.
   */
  #buildAnchors() {
    const slots = (distances, radial, count) =>
      distances.flatMap((d) => Array.from({ length: count }, (_, k) => ({ d, radial, angle: (k / count) * Math.PI * 2 + d })));
    const track = (spec) => {
      const points = spec.map(() => new THREE.Vector3());
      return () => {
        spec.forEach((slot, i) => this.path.sample(Math.min(1, this.cameraS + slot.d / this.path.length), slot.radial, slot.angle, points[i]));
        return points;
      };
    };
    this.addAnchor('redCells', track(slots([4, 5.5], 1.5, 8)), { near: 1, far: 12 });
    this.addAnchor('wall', track(slots([6, 8], VESSEL_RADIUS * 0.96, 8)), { near: 1, far: 14 });
    this.addAnchor('plasma', track(slots([7.5, 9.5], 2.3, 8)), { near: 1, far: 14 });
  }

  update({ progress, exit, duration, time }) {
    // Flow uses its own clock so a scene that was just built doesn't jump.
    const dt = this.lastTime === null ? 0 : Math.min(time - this.lastTime, 0.1);
    this.lastTime = time;

    const beat = heartbeat(time);
    const flow = (0.45 + 0.9 * beat) * dt / this.path.length;

    this.wallMaterial.uniforms.uTime.value = time;
    this.wallMaterial.uniforms.uBeat.value = beat;
    this.plasma.material.uniforms.uTime.value = time;

    this.#updateFlow(flow, time);
    this.#updateCamera(progress, exit, duration);
  }

  #updateFlow(flow, time) {
    const { position, quat, spin, scale, matrix } = this.tmp;
    // Uses last frame's camera: one frame of lag is invisible, and cells that
    // would slice through the near plane shrink away instead.
    const lens = this.camera.position;

    for (const lane of this.lanes) lane.offset = (lane.offset + lane.speed * flow) % 1;

    this.cellState.forEach((cell, i) => {
      const { lane } = cell;
      this.path.sample((cell.s + lane.offset) % 1, lane.radial, lane.angle, position);
      scale.setScalar(Math.max(smoothstep(0.2, 0.9, position.distanceTo(lens)), 1e-3));
      spin.setFromAxisAngle(cell.spinAxis, time * cell.spinSpeed);
      quat.multiplyQuaternions(cell.base, spin);
      matrix.compose(position, quat, scale);
      this.redCells.setMatrixAt(i, matrix);
    });
    this.redCells.instanceMatrix.needsUpdate = true;

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
    this.cameraS = s;
    this.path.pointAt(s, center);
    this.path.pointAt(Math.min(s + LOOK_AHEAD / this.path.length, 1), ahead);

    position.lerpVectors(center, this.diveApproach, dive).lerp(this.diveEnd, press);
    look.lerpVectors(ahead, this.targetSurface, smoothstep(0, 0.6, dive));

    this.camera.position.copy(position);
    this.camera.lookAt(look);
    this.wallMaterial.uniforms.uFocus.value = smoothstep(diveStart - 0.15, diveStart + 0.1, progress);
  }

  onDispose() {
    this.cellState = null;
    this.lanes = null;
    this.plasmaState = null;
  }
}
