import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BaseScene } from '../BaseScene.js';
import { organicMaterial } from '../shared/materials.js';
import organelleVertex from '../../shaders/organelle.vert.glsl?raw';
import ribbonFragment from './ribbon.frag.glsl?raw';
import { createParticles } from '../shared/particles.js';
import { B_DNA, buildHelix, randomSequence } from './dnaGeometry.js';
import { createDnaFlight } from './dnaFlight.js';
import { createHelixRibbon } from './dnaRibbon.js';
import { fogLimit, mergeByCell, sliceRings } from '../shared/geometry.js';
import { InstanceCuller } from '../shared/instanceCulling.js';
import { createRng } from '../../utils/random.js';
import { smoothstep } from '../../utils/math.js';

// Scene units: 1 unit = 1 nm.
const FOG_COLOR = '#0e0b26';
const FOG_DENSITY = 0.035;

/** Classic base colours. The backbone matches the DNA strand the nucleus scene ends on. */
const BASE_COLORS = { A: '#5ad17a', T: '#ff7a6b', C: '#57a8ff', G: '#ffd257' };
const RIBBON_COLOR = '#a85cc8';
const RIBBON_RIM = '#c79be0';
/** Backbone ribbon cross-section (nm): broad side facing out from the axis. */
const RIBBON_WIDTH = 0.5;
const RIBBON_THICKNESS = 0.16;
const BASE_RADIUS = 0.13;
/** Ribbon chunk length (base pairs) for culling, and the grid cell (nm) chunks are merged by. */
const PAIRS_PER_CHUNK = 15;
const CHUNK_CELL = 8;
/** Ribbon chunks further than this from the camera's path keep every second ring. */
const RIBBON_FAR = 16;
/** Base rods: lighter model beyond ROD_LOD_DISTANCE; none beyond the fog (≥97 % fogged at FOG_DENSITY). */
const ROD_LOD_DISTANCE = 9;
const FOG_LIMIT = 55;
/** The camera's path runs along the hero axis between these z (see dnaFlight). */
const CAMERA_PATH_Z = [-17.5, 0.5];

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
const START_DISTANCE = B_DNA.radius + RIBBON_THICKNESS / 2 + 0.12;
/** nm glided along the helix, and the final viewing distance. */
const GLIDE_LENGTH = 12;
const FINAL_DISTANCE = 4.6;
/** How far ahead (nm, along the axis) the camera looks while gliding. */
const LOOK_AHEAD = 1.2;

export class DnaScene extends BaseScene {
  onBuild() {
    const q = this.quality.dna;
    const rng = createRng(41);

    this.scene.background = new THREE.Color(FOG_COLOR);
    this.scene.fog = new THREE.FogExp2(FOG_COLOR, FOG_DENSITY);

    this.camera.near = 0.01;
    // Past this the haze is complete: the far ends of the helices are culled, not just fogged.
    this.camera.far = fogLimit(FOG_DENSITY);
    this.camera.fov = 58;
    this.camera.updateProjectionMatrix();
    this.scene.add(this.camera);

    // The hero helix is shifted so its HERO_START_PAIR sits at z = 0; its axis is the world Z axis.
    const heroOffset = new THREE.Vector3(0, 0, HERO_START_PAIR * B_DNA.rise);
    const helices = [{ position: heroOffset, rotation: new THREE.Euler(), length: HERO_PAIRS, hero: true }];
    const placements = [
      [new THREE.Vector3(-12, 6, 10), new THREE.Euler(0.25, 0.6, 0.1)],
      [new THREE.Vector3(14, -7, 0), new THREE.Euler(-0.2, -0.5, 0.3)],
      [new THREE.Vector3(-5, -13, -20), new THREE.Euler(0.9, 0.2, 0)],
      [new THREE.Vector3(9, 11, -30), new THREE.Euler(-0.7, -0.3, 0.5)],
    ];
    for (const [position, rotation] of placements.slice(0, q.backgroundHelices)) {
      helices.push({ position, rotation, length: BACKGROUND_PAIRS, hero: false });
    }
    this.#buildHelices(rng, helices);
    this.#buildWater(rng, q.particles);

    this.scene.add(new THREE.HemisphereLight('#c8d8ff', '#2a1a40', 1.1));
    this.camera.add(new THREE.PointLight('#ffffff', 1.4, 0, 0));

    this.flight = null;
    this.tmp = { look: new THREE.Vector3(), forward: new THREE.Vector3() };
  }

  #buildHelices(rng, helices) {
    const q = this.quality.dna;
    const ribbonChunks = [];
    const bases = { hero: [], background: [] };
    const quaternion = new THREE.Quaternion();
    const yAxis = new THREE.Vector3(0, 1, 0);
    const direction = new THREE.Vector3();
    const center = new THREE.Vector3();
    const unit = new THREE.Vector3(1, 1, 1);
    let rodLength = 0;
    const anchors = { basePair: [], backbone: [], genome: [] };
    const fromPath = (p) => Math.hypot(p.x, p.y, p.z - THREE.MathUtils.clamp(p.z, CAMERA_PATH_Z[0], CAMERA_PATH_Z[1]));

    for (const h of helices) {
      const helix = buildHelix(randomSequence(rng, h.length));
      const place = new THREE.Matrix4().compose(h.position, new THREE.Quaternion().setFromEuler(h.rotation), unit);

      // One seamless ribbon per backbone, built in the helix's own space (so
      // "outward" is away from its axis), placed, then cut into short chunks
      // so the parts out of view are culled. Chunks far from the camera's
      // path keep every second ring (they are small and hazy there).
      const [samplesPerPoint, radialSegments] = h.hero ? q.ribbonHero : q.ribbonBackground;
      for (const strand of [helix.strandA, helix.strandB]) {
        const ribbon = createHelixRibbon(strand, { width: RIBBON_WIDTH, thickness: RIBBON_THICKNESS, samplesPerPoint, radialSegments, taperLength: 4, fadeLength: 9 });
        ribbon.applyMatrix4(place);
        ribbonChunks.push(
          ...sliceRings(ribbon, {
            ringSize: radialSegments + 1,
            ringsPerChunk: samplesPerPoint * PAIRS_PER_CHUNK,
            step: (_, c) => (fromPath(c) > RIBBON_FAR ? 2 : 1),
          }),
        );
        ribbon.dispose();
      }

      helix.pairs.forEach((pair, i) => {
        if (i < 25 || i >= helix.pairs.length - 25) return;
        const middle = pair.middle.clone().applyMatrix4(place);
        if (h.hero) {
          // Click points: a rod halfway out (clear of the axis), and the ribbon itself.
          anchors.basePair.push(pair.a.clone().lerp(pair.middle, 0.55).applyMatrix4(place));
          anchors.backbone.push(pair.b.clone().applyMatrix4(place));
        } else if (i % 6 === 0) {
          anchors.genome.push(middle.clone());
        }
        for (const [end, base] of [[pair.a, pair.base], [pair.b, pair.partner]]) {
          // Start the rod inside the ribbon's inner face: the rod is thicker
          // than the ribbon and meets it at an angle, so starting at the
          // centreline would poke its rounded end through the outer face.
          const from = end.clone().applyMatrix4(place);
          direction.subVectors(middle, from).normalize();
          from.addScaledVector(direction, RIBBON_THICKNESS / 2 + BASE_RADIUS);
          direction.subVectors(middle, from);
          rodLength = direction.length();
          center.copy(from).addScaledVector(direction, 0.5);
          quaternion.setFromUnitVectors(yAxis, direction.normalize());
          bases[h.hero ? 'hero' : 'background'].push({ matrix: new THREE.Matrix4().compose(center, quaternion, unit), color: new THREE.Color(BASE_COLORS[base]) });
        }
      });
    }
    this.addAnchor('basePair', anchors.basePair, { near: 1.2, far: 9 });
    this.addAnchor('backbone', anchors.backbone, { near: 1.2, far: 9 });
    this.addAnchor('genome', anchors.genome, { near: 6, far: 40 });

    // The ribbon's broad side faces the camera, so it catches every light at
    // once: a deeper base colour and a softer rim keep it lilac, not white.
    const ribbonMaterial = this.animate(
      organicMaterial({
        vertexShader: organelleVertex,
        fragmentShader: ribbonFragment,
        uniforms: {
          uWobble: { value: 0 },
          uWobbleScale: { value: 1 },
          uColor: { value: new THREE.Color(RIBBON_COLOR) },
          uRimColor: { value: new THREE.Color(RIBBON_RIM) },
          uSkyColor: { value: new THREE.Color('#f1e2ff') },
          uGroundColor: { value: new THREE.Color('#24163a') },
        },
        defines: { USE_FADE: '' },
        transparent: true,
      }),
    );
    for (const geometry of mergeByCell(ribbonChunks, CHUNK_CELL, mergeGeometries)) {
      this.scene.add(new THREE.Mesh(geometry, ribbonMaterial));
    }

    // Every half-rod has the same length, so one capsule (rounded ends, no flat
    // cut) fits all of them without non-uniform scaling. Instance colours need a
    // built-in material; MeshPhysicalMaterial gives them a soft sheen. Only the
    // rods in view are drawn; the hero's distant ones use a lighter capsule.
    const baseMaterial = new THREE.MeshPhysicalMaterial({ roughness: 0.38, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4, emissive: '#1a1030' });
    const shaft = Math.max(0.01, rodLength - BASE_RADIUS * 2);
    const capsule = ([capSegments, radialSegments], count) => {
      const mesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(BASE_RADIUS, shaft, capSegments, radialSegments), baseMaterial, Math.max(1, count));
      this.scene.add(mesh);
      return mesh;
    };
    for (const key of ['hero', 'background']) {
      const list = bases[key];
      if (!list.length) continue;
      const hero = key === 'hero';
      const near = capsule(hero ? q.rodsHero : q.rodsBackground, list.length);
      const far = hero ? capsule(q.rodsHeroFar, list.length) : null;
      this.addCuller(
        new InstanceCuller(near, list.map((b) => b.matrix), {
          lod: far,
          lodDistance: ROD_LOD_DISTANCE,
          maxDistance: FOG_LIMIT,
          colors: list.map((b) => b.color),
        }),
      );
    }
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
   * One continuous flight (see dnaFlight.js): off the backbone, then a glide
   * alongside the helix with the whole double helix in view. The gaze starts
   * on the backbone in front of the lens and settles on the axis just ahead,
   * so the helix stays centred while the camera moves.
   */
  update({ progress, enter, time }) {
    this.tick(time);
    // The speed profile depends on the incoming transition's length; build once per value.
    if (!this.flight || this.flight.enter !== enter) {
      this.flight = createDnaFlight({ startPair: HERO_START_PAIR, startDistance: START_DISTANCE, glideLength: GLIDE_LENGTH, finalDistance: FINAL_DISTANCE, enter });
      this.flight.enter = enter;
      this.flight.startLook = this.flight.curve.getPointAt(0).clone().setLength(B_DNA.radius);
    }
    const { curve, distance, startLook } = this.flight;
    const { look, forward } = this.tmp;
    const position = this.camera.position;

    const s = distance(progress);
    curve.getPointAt(s, position);

    forward.set(0, 0, position.z - LOOK_AHEAD);
    // From the backbone in front of the lens to the axis just ahead, as the camera eases back.
    look.copy(startLook).lerp(forward, smoothstep(0.01, 0.12, s));
    this.camera.lookAt(look);
  }

  onDispose() {
    this.flight = null;
  }
}
