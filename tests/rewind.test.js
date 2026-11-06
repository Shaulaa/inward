import { describe, expect, it } from 'vitest';
import { REWIND_STAGES, ZOOM, rewindFrame } from '../src/core/rewind.js';

/** What the screen shows, sampled as numbers: for each stage, its zoom and its visible weight. */
function picture(f) {
  const shown = new Map();
  if (f.outer === null) shown.set(f.inner, { zoom: f.innerZoom, weight: 1 });
  else {
    shown.set(f.outer, { zoom: f.outerZoom, weight: 1 - f.innerAlpha });
    shown.set(f.inner, { zoom: f.innerZoom, weight: f.innerAlpha });
  }
  return shown;
}

describe('rewindFrame', () => {
  it('starts on the live DNA view and ends on the opening skin view', () => {
    const start = rewindFrame(0);
    expect(REWIND_STAGES[start.inner]).toBe(5);
    expect(start.innerZoom).toBe(1);
    expect(start.innerAlpha).toBe(1);

    const end = rewindFrame(1);
    expect(REWIND_STAGES[end.inner]).toBe(0);
    expect(end.outer).toBeNull();
    expect(end.skinProgress).toBe(0);
  });

  it('passes every scene once, inside out', () => {
    const seen = [];
    for (let r = 0; r <= 1.0001; r += 0.001) {
      const s = REWIND_STAGES[rewindFrame(r).inner];
      if (s !== seen[seen.length - 1]) seen.push(s);
    }
    expect(seen).toEqual([5, 4, 3, 2, 1, 0]);
  });

  it('is continuous: no stage jumps in size or visibility from one frame to the next', () => {
    let previous = picture(rewindFrame(0));
    let previousSkin = rewindFrame(0).skinProgress;
    for (let r = 0.0005; r <= 1; r += 0.0005) {
      const f = rewindFrame(r);
      const now = picture(f);
      for (const stage of new Set([...now.keys(), ...previous.keys()])) {
        const a = previous.get(stage) ?? { zoom: null, weight: 0 };
        const b = now.get(stage) ?? { zoom: null, weight: 0 };
        expect(Math.abs(a.weight - b.weight)).toBeLessThan(0.02);
        // A stage that is visibly on screen keeps a continuous zoom.
        if (a.zoom !== null && b.zoom !== null && Math.min(a.weight, b.weight) > 0.01) expect(Math.abs(a.zoom - b.zoom)).toBeLessThan(0.01);
      }
      expect(Math.abs(f.skinProgress - previousSkin)).toBeLessThan(0.01);
      previous = now;
      previousSkin = f.skinProgress;
    }
  });

  it('never enlarges the inner image (it only shrinks, so it never turns blocky)', () => {
    for (let r = 0; r <= 1; r += 0.003) {
      const f = rewindFrame(r);
      expect(f.innerZoom).toBeLessThanOrEqual(1);
      expect(f.outerZoom).toBeLessThanOrEqual(ZOOM + 1e-9);
      expect(f.outerZoom).toBeGreaterThanOrEqual(1);
    }
  });

  it('reduced motion: plain crossfades, no zoom', () => {
    for (let r = 0; r <= 1; r += 0.01) {
      const f = rewindFrame(r, { reducedMotion: true });
      expect(f.innerZoom).toBe(1);
      expect(f.outerZoom).toBe(1);
    }
  });
});
