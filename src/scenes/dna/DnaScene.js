import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BaseScene } from '../BaseScene.js';
import { tissueMaterial } from '../shared/materials.js';
import { createTaperedTube } from '../shared/geometry.js';
import { createParticles } from '../shared/particles.js';
import { B_DNA, buildHelix, randomSequence } from './dnaGeometry.js';
import { createDnaFlight } from './dnaFlight.js';
import { createRng } from '../../utils/random.js';
import { smoothstep } from '../../utils/math.js';

// Scene units: 1 unit = 1 nm.
const FOG_COLOR = '#0e0b26';
const FOG_DENSITY = 0.035;

/** Classic base colours. The backbone matches the DNA strand the nucleus scene ends on. */
const BASE_COLORS = { A: '#5ad17a', T: '#ff7a6b', C: '#57a8ff', G: '#ffd257' };
const BACKBONE_COLOR = '#d68cf0';
const BACKBONE_RADIUS = 0.2;
const PHOSPHATE_RADIUS = 0.24;
const BASE_RADIUS = 0.13;

/**
 * The hero helix runs from far behind the camera to far ahead, so neither end
 * is ever in view uncovered: both sit deep in the haze, tapered and faded.
 */
const HERO_PAIRS = 350;
const HERO_START_PAIR = 90; // the base pair the camera starts beside (z = 0)
const BACKGROUND_PAIRS = 240;

/**
 * Camera starts this far from the axis: just off the backbone's surface (it
 * presses into the DNA strand at the end of the previous scene).
 */
const START_DISTANCE = B_DNA.radius + BACKBONE_RADIUS + 0.14;
/** nm ridden down the helix inside the major groove, and the final viewing distance. */
const RIDE_LENGTH = 9;
const FINAL_DISTANCE = 4.6;
/** How far ahead (nm, along the axis) the camera looks while flying. */
const LOOK_AHEAD = 6;

export class DnaScene extends BaseScene {
  onBuild() {
    const q = this.quality.dna;
    const rng = createRng(41);

    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

    this.camera.near = 0.01;
    this.camera.far = 120;
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
    this.scene.add(this.camera);

    // The hero helix is shifted so its HERO_START_PAIR sits at z = 0; its axis is the world Z axis.
    const heroOffset = new THREE.Vector3(0, 0, HERO_START_PAIR * B_DNA.rise);
    const helices = [{ position: heroOffset, rotation: new THREE.Euler(), length: HERO_PAIRS, phosphates: true }];
    const placements = [
      [new THREE.Vector3(-12, 6, 10), new THREE.Euler(0.25, 0.6, 0.1)],
      [new THREE.Vector3(14, -7, 0), new THREE.Euler(-0.2, -0.5, 0.3)],
      [new THREE.Vector3(-5, -13, -20), new THREE.Euler(0.9, 0.2, 0)],
      [new THREE.Vector3(9, 11, -30), new THREE.Euler(-0.7, -0.3, 0.5)],
    ];
    for (const [position, rotation] of placements.slice(0, q.backgroundHelices)) {
      helices.push({ position, rotation, length: BACKGROUND_PAIRS, phosphates: false });
    }
    this.#buildHelices(rng, helices);
    this.#buildWater(rng, q.particles);

    this.scene.add(new THREE.HemisphereLight('#c8d8ff', '#2a1a40', 1.1));
    this.camera.add(new THREE.PointLight('#ffffff', 1.4, 0, 0));

    this.flight = null;
    this.tmp = { look: new THREE.Vector3(), forward: new THREE.Vector3() };
  }

  #buildHelices(rng, helices) {
    const backbones = [];
    const phosphates = [];
    const bases = [];
    const quaternion = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3();
    const center = new THREE.Vector3();
    const unit = new THREE.Vector3(1, 1, 1);
    let rodLength = 0;

    for (const h of helices) {
      const helix = buildHelix(randomSequence(rng, h.length));
      const place = new THREE.Matrix4().compose(h.position, new THREE.Quaternion().setFromEuler(h.rotation), unit);

      for (const strand of [helix.strandA, helix.strandB]) {
        const points = strand.map((p) => p.clone().applyMatrix4(place));
        backbones.push(
          createTaperedTube(new THREE.CatmullRomCurve3(points), {
            tubularSegments: strand.length * 5,
            radius: BACKBONE_RADIUS,
            radialSegments: 8,
            taperLength: 4,
            fadeLength: 9,
          }),
        );
        // Phosphates only on the hero, and not in its fading tips.
        if (h.phosphates) points.slice(30, -30).forEach((p) => phosphates.push(p));
      }

      helix.pairs.forEach((pair, i) => {
        if (i < 25 || i >= helix.pairs.length - 25) return;
        const middle = pair.middle.clone().applyMatrix4(place);
        for (const [end, base] of [[pair.a, pair.base], [pair.b, pair.partner]]) {
          const from = end.clone().applyMatrix4(place);
          direction.subVectors(middle, from);
          rodLength = direction.length();
          center.copy(from).addScaledVector(direction, 0.5);
          quaternion.setFromUnitVectors(yAxis, direction.normalize());
          bases.push({ matrix: new THREE.Matrix4().compose(center, quaternion, unit), color: new THREE.Color(BASE_COLORS[base]) });
        }
      });
    }

    const backboneGeometry = mergeGeometries(backbones);
    backbones.forEach((g) => g.dispose());
    this.scene.add(new THREE.Mesh(backboneGeometry, this.animate(tissueMaterial({ color: BACKBONE_COLOR, rimColor: '#ffe0ff', wobble: 0, fade: true }))));

    const matrix = new THREE.Matrix4();
    const phosphateMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(PHOSPHATE_RADIUS, 12, 9),
      this.animate(tissueMaterial({ color: '#e8a8ff', rimColor: '#ffffff', wobble: 0 })),
      phosphates.length,
    );
    phosphates.forEach((p, i) => phosphateMesh.setMatrixAt(i, matrix.makeTranslation(p)));
    phosphateMesh.instanceMatrix.needsUpdate = true;
    phosphateMesh.computeBoundingSphere();
    this.scene.add(phosphateMesh);

    // Every half-rod has the same length, so one capsule (rounded ends, no flat
    // cut) fits all of them without non-uniform scaling. Instance colours need a
    // built-in material; MeshStandardMaterial supports them directly.
    const baseMesh = new THREE.InstancedMesh(
      new THREE.CapsuleGeometry(BASE_RADIUS, Math.max(0.01, rodLength - BASE_RADIUS * 2), 3, 8),
      new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0, emissive: '#1a1030' }),
      bases.length,
    );
    bases.forEach((b, i) => {
      baseMesh.setMatrixAt(i, b.matrix);
      baseMesh.setColorAt(i, b.color);
    });
    baseMesh.instanceMatrix.needsUpdate = true;
    baseMesh.instanceColor.needsUpdate = true;
    baseMesh.computeBoundingSphere();
    this.scene.add(baseMesh);
  }

  #buildWater(rng, count) {
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      let x;
      let y;
      do {
        x = rng.range(-25, 25);
        y = rng.range(-25, 25);
      } while (Math.hypot(x, y) < 2.2); // keep the hero helix clear
      positions.set([x, y, rng.range(15, -80)], i * 3);
      sizes[i] = rng.range(0.4, 1.2);
      seeds[i] = rng.next();
    }
    const particles = createParticles({
      positions,
      sizes,
      seeds,
      color: '#9fd8ff',
      opacity: 0.35,
      pixelRatio: this.quality.pixelRatio,
      sizeScale: 10,
      drift: 0.25,
      fogFade: true,
    });
    this.animate(particles.material);
    this.scene.add(particles);
  }

  /**
   * One continuous flight (see dnaFlight.js): off the backbone, through the
   * major groove, down the helix inside the groove, then out and back. The
   * gaze starts on the backbone in front of the lens and settles on the axis
   * ahead, so the helix stays centred while the camera moves.
   */
  update({ progress, enter, time }) {
    this.tick(time);
    // The speed profile depends on the incoming transition's length; build once per value.
    if (!this.flight || this.flight.enter !== enter) {
      this.flight = createDnaFlight({ startPair: HERO_START_PAIR, startDistance: START_DISTANCE, rideLength: RIDE_LENGTH, finalDistance: FINAL_DISTANCE, enter });
      this.flight.enter = enter;
      this.flight.startLook = this.flight.curve.getPointAt(0).clone().setLength(B_DNA.radius);
    }
    const { curve, distance, crossingFraction, startLook } = this.flight;
    const { look, forward } = this.tmp;
    const position = this.camera.position;

    const s = distance(progress);
    curve.getPointAt(s, position);

    forward.set(0, 0, position.z - LOOK_AHEAD);
    look.copy(startLook).lerp(forward, smoothstep(crossingFraction * 0.4, crossingFraction * 1.6, s));
    this.camera.lookAt(look);
  }

  onDispose() {
    this.flight = null;
  }
}
