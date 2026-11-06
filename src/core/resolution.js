/**
 * Dynamic render resolution, in two tiers.
 *
 * Between the device's full scale (`max`, e.g. 1.25 on a 125 % display) and
 * 1× CSS pixels (`floor`): the scale steps down while the frame rate is below
 * SLOW_FPS — in practice during the heaviest transitions — and back up once
 * there is headroom again (FAST_FPS).
 *
 * Below 1× CSS: only when the frame rate is really low (under VERY_SLOW_FPS
 * for VERY_SLOW_FOR seconds even at 1×), down to `min`; back up to 1× as soon
 * as it has recovered (RECOVERED_FPS for RECOVER_AFTER seconds).
 *
 * Rules that keep it calm:
 * - single long frames (> HITCH, e.g. a scene being built, or a tab coming
 *   back from the background) are ignored — resolution can't fix those,
 * - after a change it waits COOLDOWN before the next one,
 * - if a step up drops straight back below target, the next attempt waits
 *   twice as long (up to MAX_WAIT), so it doesn't ping-pong,
 * - `paused` freezes it (the closing rewind, where a resize would hitch),
 * - reset() forgets the history (call it when the tab becomes visible again).
 */
const STEP = 0.85;
const SLOW_FPS = 36;
const FAST_FPS = 55;
const SLOW_FRAMES = 8;
const UP_AFTER = 2;
const VERY_SLOW_FPS = 30;
const VERY_SLOW_FOR = 1.5;
const RECOVERED_FPS = 40;
const RECOVER_AFTER = 1.5;
const MAX_WAIT = 16;
const COOLDOWN = 0.5;
const HITCH = 0.08;
/** A step up counts as a failure if the rate falls below target within this many seconds. */
const PROBATION = 3;

export class ResolutionGovernor {
  /**
   * @param {{ max: number, floor?: number, min?: number }} range
   *   max: full scale (device pixel ratio cap); floor: 1× CSS; min: the lowest it may go when frames are very slow
   */
  constructor({ max, floor = Math.min(1, max), min = Math.max(0.6, floor * 0.75) }) {
    this.max = max;
    this.floor = Math.min(floor, max);
    this.min = Math.min(min, this.floor);
    this.scale = max;
    this.paused = false;
    this.reset();
  }

  /** Forget frame-rate history (e.g. after the tab was hidden). */
  reset() {
    this.average = 1 / 60;
    this.slowFrames = 0;
    this.verySlowTime = 0;
    this.fastTime = 0;
    this.recoverTime = 0;
    this.wait = UP_AFTER;
    this.sinceChange = Infinity;
    this.sinceStepUp = Infinity;
    this.onProbation = false;
  }

  /**
   * @param {number} dt seconds since the last frame
   * @returns {number | null} the new scale when it changes, else null
   */
  update(dt) {
    if (this.paused || !(dt > 0) || dt > HITCH) return null;
    this.average += (dt - this.average) * 0.15;
    this.sinceChange += dt;
    this.sinceStepUp += dt;
    const fps = 1 / this.average;
    const canChange = this.sinceChange > COOLDOWN;

    // Very slow: allowed below 1× CSS.
    this.verySlowTime = fps < VERY_SLOW_FPS ? this.verySlowTime + dt : 0;
    // Recovered (only matters below 1×).
    this.recoverTime = fps >= RECOVERED_FPS ? this.recoverTime + dt : 0;

    if (this.scale > this.floor + 1e-6) {
      if (fps < SLOW_FPS) {
        this.slowFrames++;
        this.fastTime = 0;
        if (this.slowFrames >= SLOW_FRAMES && canChange) return this.#down(this.floor);
        return null;
      }
    } else if (this.verySlowTime >= VERY_SLOW_FOR && canChange && this.scale > this.min + 1e-6) {
      return this.#down(this.min);
    }
    this.slowFrames = 0;

    if (this.scale < this.floor - 1e-6) {
      // Below 1×: back up as soon as the frame rate has recovered.
      if (this.recoverTime >= RECOVER_AFTER && canChange) return this.#up(this.floor);
      return null;
    }
    if (fps >= FAST_FPS) {
      this.fastTime += dt;
      if (this.fastTime >= this.wait && this.scale < this.max - 1e-6 && canChange) return this.#up(this.max);
    } else {
      this.fastTime = 0;
    }
    // A step up that held: the next one may come at the normal pace again.
    if (this.onProbation && this.sinceStepUp > PROBATION) {
      this.onProbation = false;
      this.wait = UP_AFTER;
    }
    return null;
  }

  #down(limit) {
    if (this.onProbation && this.sinceStepUp < PROBATION) this.wait = Math.min(MAX_WAIT, this.wait * 2);
    this.onProbation = false;
    return this.#set(Math.max(limit, this.scale * STEP));
  }

  #up(limit) {
    this.sinceStepUp = 0;
    this.onProbation = true;
    return this.#set(Math.min(limit, this.scale / STEP));
  }

  #set(scale) {
    this.scale = scale;
    this.sinceChange = 0;
    this.slowFrames = 0;
    this.fastTime = 0;
    this.verySlowTime = 0;
    this.recoverTime = 0;
    return scale;
  }
}
