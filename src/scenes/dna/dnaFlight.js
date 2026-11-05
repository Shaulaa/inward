import * as THREE from 'three';
import { B_DNA } from './dnaGeometry.js';
import { smoothstep } from '../../utils/math.js';

/**
 * The camera's flight through the hero helix as one continuous curve with one
 * smooth speed profile (no phase boundaries where the camera stops and lurches):
 *
 * 1. start just off a backbone (the strand the nucleus scene pressed into),
 * 2. cross the helix wall through the middle of the major groove,
 * 3. ride down the helix inside the major groove — 252° from each pair's
 *    strand-A backbone, 0.575 nm from the axis — the point farthest from every
 *    base, phosphate and backbone (~0.7 nm clear; on the axis it is ~0.2 nm,
 *    because the bases meet 0.31 nm off-axis),
 * 4. leave radially through the same groove and pull back to watch the helix.
 *
 * Hero geometry: pair k sits at z = (startPair − k) · rise, at angle k · twist.
 */
export const RIDE_ANGLE_OFFSET = (252 * Math.PI) / 180;
export const RIDE_RADIUS = 0.575;

const twist = (Math.PI * 2) / B_DNA.basePairsPerTurn;

const polar = (r, angle, z) => new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, z);

export function createDnaFlight({ startPair, startDistance, rideLength = 9, finalDistance = 4.6, enter = 0.35 }) {
  const startAngle = startPair * twist;
  const pairAngleAt = (z) => (startPair - z / B_DNA.rise) * twist;

  const points = [
    polar(startDistance, startAngle, 0),
    // Mid-groove crossing: ~1 nm below the backbone we started on, ~1.2 nm above the other strand.
    polar(B_DNA.radius, startAngle, -0.95),
  ];
  const rideStart = -1.4;
  let z = rideStart;
  for (; z >= rideStart - rideLength; z -= 0.25) points.push(polar(RIDE_RADIUS, pairAngleAt(z) + RIDE_ANGLE_OFFSET, z));
  z += 0.25;
  const exitAngle = pairAngleAt(z) + RIDE_ANGLE_OFFSET;
  const pullStartIndex = points.length;
  points.push(
    polar(1.6, exitAngle, z - 0.15),
    polar(2.8, exitAngle + 0.5, z - 2.5),
    polar(finalDistance, exitAngle + 1.6, z - 7),
  );

  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  // getPointAt() maps arc length through a lookup table; the default 200
  // divisions are too coarse for dense ride points followed by sparse
  // pull-back points and show up as speed jumps. Use a fine table.
  curve.arcLengthDivisions = points.length * 400;
  const length = curve.getLength();

  // Arc-length fraction of a control point (polyline approximation; close
  // enough for timing because the control points are dense).
  const arcTo = (index) => {
    let d = 0;
    for (let i = 1; i <= index; i++) d += points[i].distanceTo(points[i - 1]);
    let total = 0;
    for (let i = 1; i < points.length; i++) total += points[i].distanceTo(points[i - 1]);
    return d / total;
  };
  const crossingFraction = arcTo(1);
  const pullFraction = arcTo(pullStartIndex);

  return {
    curve,
    length,
    startAngle,
    crossingFraction,
    pullFraction,
    distance: createSpeedProfile({ enter, crossingFraction }),
  };
}

/**
 * Maps scene progress (0..1) to travelled arc fraction (0..1) with a speed
 * that is continuous everywhere: a slow start (matching the previous scene's
 * slow press), a smooth ramp to a steady cruise, and a gentle slow-down at the
 * end. The ramp length is solved so the helix wall is crossed halfway through
 * the incoming transition, like every other scene boundary.
 */
export function createSpeedProfile({ enter, crossingFraction, startSpeed = 0.06, endSpeed = 0.08, slowFrom = 0.78, samples = 2000 }) {
  const build = (ramp) => {
    const speed = (p) => (startSpeed + (1 - startSpeed) * smoothstep(0, ramp, p)) * (1 - (1 - endSpeed) * smoothstep(slowFrom, 1, p));
    const table = new Float64Array(samples + 1);
    for (let i = 1; i <= samples; i++) {
      const p0 = (i - 1) / samples;
      const p1 = i / samples;
      table[i] = table[i - 1] + ((speed(p0) + speed(p1)) / 2) * (p1 - p0);
    }
    const total = table[samples];
    for (let i = 0; i <= samples; i++) table[i] /= total;
    return (p) => {
      const x = Math.min(Math.max(p, 0), 1) * samples;
      const i = Math.min(Math.floor(x), samples - 1);
      return table[i] + (table[i + 1] - table[i]) * (x - i);
    };
  };

  // Longer ramp -> slower early travel -> later crossing. Bisect for a crossing at enter / 2.
  const target = enter / 2;
  let lo = 0.02;
  let hi = 0.95;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const f = build(mid);
    if (f(target) > crossingFraction) lo = mid;
    else hi = mid;
  }
  return build((lo + hi) / 2);
}
