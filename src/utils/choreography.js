import { clamp, easeInOutCubic, easeOutCubic, range01 } from './math.js';

/**
 * Camera beats shared by scenes that hand over to the next scene through a
 * surface:
 * - dive: from diveStart to the start of the outgoing overlap, the camera
 *   travels to just in front of the surface, so it fills the frame by the time
 *   the next scene starts to show through;
 * - press: during the overlap the camera creeps the last bit into it.
 * With no outgoing transition (exit = 0) both stay 0.
 */
export function exitPhases(progress, exit, diveSpan) {
  if (!(exit > 0)) return { overlapStart: 1, diveStart: 1, dive: 0, press: 0 };
  const overlapStart = 1 - exit;
  const diveStart = Math.max(0, overlapStart - diveSpan);
  return {
    overlapStart,
    diveStart,
    dive: easeInOutCubic(range01(diveStart, overlapStart, progress)),
    press: easeOutCubic(range01(overlapStart, 1, progress)),
  };
}

/**
 * Identity up to `start`, then a cubic with slope 1 at `start` and slope 0 at
 * 1: the motion carries on, then settles instead of halting abruptly.
 */
export function settle(p, start) {
  if (p <= start) return p;
  const t = (p - start) / (1 - start);
  return start + (1 - start) * (-t * t * t + t * t + t);
}

/**
 * Remaps 0..1 travel so the camera crosses the entry boundary (at
 * `boundaryFraction` of the path) exactly halfway through the incoming
 * transition: progress^k with k solved for that point. The result is a slow
 * push through the boundary that accelerates smoothly afterwards.
 */
export function crossAtMidEntry(progress, enter, boundaryFraction) {
  const p = clamp(progress);
  if (!(enter > 0) || !(boundaryFraction > 0) || boundaryFraction >= 1) return p;
  const crossing = clamp(enter * 0.5, 0.02, 0.5);
  return Math.pow(p, Math.log(boundaryFraction) / Math.log(crossing));
}
