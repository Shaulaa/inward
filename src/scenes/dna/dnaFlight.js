import * as THREE from 'three';
import { B_DNA } from './dnaGeometry.js';
import { smoothstep } from '../../utils/math.js';

/**
 * The camera's flight around the hero helix as one continuous curve with one
 * smooth speed profile (no phase boundaries where the camera stops and lurches):
 *
 * 1. start just off a backbone — the strand the nucleus scene pressed into,
 * 2. ease back from it while the transition opens,
 * 3. glide alongside the helix at VIEW_DISTANCE, slowly spiralling around it,
 *    so the double helix is always seen whole (both backbones, the bases
 *    between them) rather than individual rods filling the frame,
 * 4. drift further back at the end.
 *
 * Hero geometry: pair k sits at z = (startPair − k) · rise, at angle k · twist.
 */
export const VIEW_DISTANCE = 3.2;

const twist = (Math.PI * 2) / B_DNA.basePairsPerTurn;

const polar = (r, angle, z) => new THREE.Vector3(Math.cos(angle) * r, Math.sin(angle) * r, z);

export function createDnaFlight({ startPair, startDistance, glideLength = 12, finalDistance = 4.6, enter = 0.35 }) {
  const startAngle = startPair * twist;
  const points = [
    polar(startDistance, startAngle, 0),
    polar((startDistance + VIEW_DISTANCE) / 2, startAngle + 0.15, -0.5),
  ];
  // Glide: steady radius, a slow quarter-ish turn around the helix while moving along it.
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push(polar(VIEW_DISTANCE, startAngle + 0.45 + t * 1.4, -1.6 - t * glideLength));
  }
  const glideEnd = -1.6 - glideLength;
  points.push(polar(finalDistance, startAngle + 2.2, glideEnd - 3.5));

  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  // getPointAt() maps arc length through a lookup table; a fine table keeps
  // the speed free of interpolation steps between unevenly spaced points.
  curve.arcLengthDivisions = points.length * 400;

  return {
    curve,
    length: curve.getLength(),
    startAngle,
    distance: createSpeedProfile({ ramp: enter }),
  };
}

/**
 * Maps scene progress (0..1) to travelled arc fraction (0..1) with a speed
 * that is continuous everywhere: a slow start (matching the previous scene's
 * slow press) that ramps up smoothly across the incoming transition, a steady
 * cruise, and a gentle slow-down at the end.
 */
export function createSpeedProfile({ ramp, startSpeed = 0.06, endSpeed = 0.1, slowFrom = 0.8, samples = 2000 }) {
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
}
