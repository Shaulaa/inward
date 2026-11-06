import { smoothstep } from '../utils/math.js';

/**
 * The closing rewind, as a pure function of its progress r (0..1, already
 * eased by the storyline): which images are on screen, at what zoom, and how
 * much of the inner one shows.
 *
 * Stages, inside out: DNA (the live scene, exactly as the hold left it),
 * images of nucleus, cell, vessel and dermis (captured on the way in, see
 * SceneManager), then the live skin scene.
 *
 * One continuous pull-back, like a camera zooming out: every stage sits ZOOM
 * times larger than the one inside it. The inner image keeps shrinking toward
 * the centre (zoom below 1 — never enlarged, so never blocky) with a soft
 * edge, and fades out over the outer image, which grows from ZOOM down to its
 * natural size. Everything is a continuous function of r: no cuts, no jumps.
 * Once the skin is at its natural size, its own camera rises back to the
 * opening view, so the rewind ends exactly on the first frame of the journey.
 *
 * Only the two live scenes are ever drawn; nothing has to be built while the
 * rewind runs.
 */

/** Scene indices of the stages, inside out. */
export const REWIND_STAGES = [5, 4, 3, 2, 1, 0];
/** Size ratio between consecutive stages. */
export const ZOOM = 1.6;
/** r at which the skin reaches its natural size; after that only the skin's camera moves. */
const SKIN_AT = 0.72;
const STEP = SKIN_AT / (REWIND_STAGES.length - 1);
/** Skin progress (the lens still pressed close) while it grows into view; back to 0 at the end. */
const SKIN_START = 0.95;

/**
 * @param {number} r rewind progress, 0 (DNA view) to 1 (opening skin view)
 * @param {{ reducedMotion?: boolean }} [options] reduced motion: plain crossfades, no zoom
 * @returns {{ inner: number, outer: number | null, innerZoom: number, outerZoom: number, innerAlpha: number, skinProgress: number }}
 *   inner / outer: stage indices on screen (outer null once only the skin is left);
 *   innerAlpha: how much of the inner image shows over the outer one.
 */
export function rewindFrame(r, { reducedMotion = false } = {}) {
  const t = Math.min(Math.max(Number.isFinite(r) ? r : 0, 0), 1);
  const last = REWIND_STAGES.length - 1;
  if (t >= SKIN_AT) {
    return { inner: last, outer: null, innerZoom: 1, outerZoom: 1, innerAlpha: 1, skinProgress: SKIN_START * (1 - smoothstep(SKIN_AT, 1, t)) };
  }
  const k = Math.min(last - 1, Math.floor(t / STEP));
  const p = t / STEP - k;
  if (reducedMotion) {
    return { inner: k, outer: k + 1, innerZoom: 1, outerZoom: 1, innerAlpha: 1 - smoothstep(0, 1, p), skinProgress: SKIN_START };
  }
  return {
    inner: k,
    outer: k + 1,
    innerZoom: ZOOM ** -p,
    outerZoom: ZOOM ** (1 - p),
    // Fully there while it still fills most of the screen, gone by the time it is 1/ZOOM.
    innerAlpha: 1 - smoothstep(0.45, 1, p),
    skinProgress: SKIN_START,
  };
}
