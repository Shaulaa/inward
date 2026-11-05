import * as THREE from 'three';
import { distanceToPoints } from '../shared/geometry.js';

// Scene units: 1 unit = 0.1 µm. The nucleus is ~6 µm across.
export const ENVELOPE_RADIUS = 30;
/** How far outside the envelope the camera starts (it pushes through during the transition). */
export const ENTRY_OFFSET = 1.2;

/** Nucleosome "beads on a string" (dramatised ~3× so they read on screen). */
export const BEAD_SPACING = 0.6;
export const BEAD_RADIUS = 0.17;
export const WRAP_RADIUS = 0.21;
export const DNA_RADIUS = 0.03;

const UP = new THREE.Vector3(0, 1, 0);

/** Along the string: where the beads stop and naked DNA continues, and the string's total length. */
export const STRING_BEFORE_CENTER = 7;
export const BEADS_AFTER_CENTER = 2;
export const STRING_AFTER_CENTER = 10;

/**
 * Route through the nucleus to a string of nucleosomes. The string is laid
 * across the line of sight; past its last bead it continues as naked DNA,
 * which is what the camera follows and finally dives into.
 */
export function createNucleusRoute() {
  const entryDir = new THREE.Vector3(0.35, 0.25, 0.9).normalize();
  const side = new THREE.Vector3().crossVectors(entryDir, UP).normalize();
  const up = new THREE.Vector3().crossVectors(side, entryDir).normalize();
  const at = (a, s, u) => new THREE.Vector3().addScaledVector(entryDir, a).addScaledVector(side, s).addScaledVector(up, u);

  // The string sits in the outer third of the nucleus, so the route there is short.
  const bead = at(15.5, 3, 3.5);
  const routeEnd = at(19.5, 5.5, 5.0);
  const points = [at(ENVELOPE_RADIUS + ENTRY_OFFSET, 0, 0), at(ENVELOPE_RADIUS - 2.2, 0.5, 0.3), at(23, 3.5, 3), routeEnd];
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const length = curve.getLength();

  // Final approach runs from routeEnd straight at the bead.
  const toCamera = routeEnd.clone().sub(bead).normalize();
  // Lay the string across the line of sight.
  const stringTangent = new THREE.Vector3().crossVectors(toCamera, up).normalize();

  return {
    curve,
    length,
    at,
    bead,
    stringTangent,
    toCamera,
    membraneFraction: ENTRY_OFFSET / length,
    samples: curve.getSpacedPoints(200),
  };
}

/**
 * Chromatin fibres: random walks inside the nucleus, coiled into a helix
 * around their path. Some start close to the target bead, so the chromatin
 * gets denser toward the end of the route. Fibres that pass close to the
 * route or the target string are rejected.
 *
 * Returns curves of the coiled fibres plus whether each is peripheral
 * (heterochromatin, near the envelope).
 */
export function createChromatinFibers(rng, route, { count, steps = 15, stepLength = 2.0 }) {
  const fibers = [];
  const direction = new THREE.Vector3();
  const nudge = new THREE.Vector3();
  const stringStart = route.bead.clone().addScaledVector(route.stringTangent, -STRING_BEFORE_CENTER);
  const stringEnd = route.bead.clone().addScaledVector(route.stringTangent, STRING_AFTER_CENTER);
  const stringSamples = Array.from({ length: 30 }, (_, i) => stringStart.clone().lerp(stringEnd, i / 29));

  for (let attempt = 0; fibers.length < count && attempt < count * 40; attempt++) {
    const nearTarget = rng.next() < 0.55;
    const start = new THREE.Vector3();
    if (nearTarget) start.copy(route.bead).add(rng.onSphere(nudge).multiplyScalar(rng.range(3, 9)));
    else rng.onSphere(start).multiplyScalar(Math.cbrt(rng.next()) * (ENVELOPE_RADIUS - 4));

    rng.onSphere(direction);
    const backbone = [start.clone()];
    const p = start.clone();
    for (let i = 0; i < steps; i++) {
      direction.add(rng.onSphere(nudge).multiplyScalar(0.8)).normalize();
      p.addScaledVector(direction, stepLength);
      // Stay inside the envelope: steer back toward the centre.
      if (p.length() > ENVELOPE_RADIUS - 3) direction.addScaledVector(p.clone().normalize(), -1.2).normalize();
      backbone.push(p.clone());
    }

    const clear = backbone.every(
      (b) => distanceToPoints(b, route.samples) > 2.2 && distanceToPoints(b, stringSamples) > 1.6 && b.length() < ENVELOPE_RADIUS - 1.5,
    );
    if (!clear) continue;

    const peripheral = backbone.reduce((sum, b) => sum + b.length(), 0) / backbone.length > ENVELOPE_RADIUS * 0.62;
    fibers.push({ curve: coil(new THREE.CatmullRomCurve3(backbone), peripheral), peripheral });
  }
  return { fibers, stringStart, stringEnd };
}

/** Wraps a helix around `backbone`: tighter and wider for heterochromatin. */
function coil(backbone, peripheral) {
  const radius = peripheral ? 0.6 : 0.5;
  const pitch = peripheral ? 0.75 : 1.1;
  const length = backbone.getLength();
  const samples = Math.ceil(length / 0.25);
  const frames = backbone.computeFrenetFrames(samples, false);
  const points = [];
  const p = new THREE.Vector3();
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const angle = ((t * length) / pitch) * Math.PI * 2;
    backbone.getPointAt(t, p);
    p.addScaledVector(frames.normals[i], Math.cos(angle) * radius).addScaledVector(frames.binormals[i], Math.sin(angle) * radius);
    points.push(p.clone());
  }
  return new THREE.CatmullRomCurve3(points);
}

/**
 * The DNA path of a nucleosome string: straight linker DNA wrapping ~1.65
 * turns around each histone bead (spool axis along the string), with beads
 * only up to `beadsUntil` (distance from `start`); after that the DNA runs on
 * naked. Returns the DNA curve, the bead centres and the string direction.
 */
export function createNucleosomeString(start, end, center, beadsUntil = Infinity) {
  const tangent = end.clone().sub(start).normalize();
  const a = new THREE.Vector3(0, 1, 0).cross(tangent);
  if (a.lengthSq() < 1e-4) a.set(1, 0, 0).cross(tangent);
  a.normalize();
  const b = new THREE.Vector3().crossVectors(tangent, a);

  const length = start.distanceTo(end);
  // Beads every BEAD_SPACING, one exactly at `center`.
  const centerS = start.distanceTo(center);
  const beads = [];
  for (let s = centerS % BEAD_SPACING; s < Math.min(length, beadsUntil); s += BEAD_SPACING) beads.push(s);

  const points = [];
  const p = new THREE.Vector3();
  const step = 0.02;
  let angle = 0;
  for (let s = 0; s <= length; s += step) {
    // Distance to the nearest bead centre, as a fraction of half the bead's width.
    const nearest = beads.reduce((best, c) => Math.min(best, Math.abs(s - c)), Infinity);
    const onBead = Math.max(0, 1 - nearest / (BEAD_SPACING * 0.36));
    const wrap = onBead * onBead * (3 - 2 * onBead);
    // 1.65 turns across the bead, a slow drift along the linker.
    angle += step * (wrap * (1.65 * Math.PI * 2) / (BEAD_SPACING * 0.5) + 0.8);
    p.copy(start)
      .addScaledVector(tangent, s)
      .addScaledVector(a, Math.cos(angle) * WRAP_RADIUS * wrap)
      .addScaledVector(b, Math.sin(angle) * WRAP_RADIUS * wrap);
    points.push(p.clone());
  }
  return {
    curve: new THREE.CatmullRomCurve3(points),
    beads: beads.map((s) => start.clone().addScaledVector(tangent, s)),
    tangent,
  };
}
