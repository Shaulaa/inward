import { describe, expect, it } from 'vitest';
import { closingGap, crossAtMidEntry, exitPhases, settle } from '../src/utils/choreography.js';
import { createSkinField } from '../src/scenes/skin/skinField.js';
import { createRng } from '../src/utils/random.js';

describe('settle', () => {
  it('is the identity before the start and lands exactly on 1', () => {
    expect(settle(0.3, 0.8)).toBe(0.3);
    expect(settle(0.8, 0.8)).toBe(0.8);
    expect(settle(1, 0.8)).toBeCloseTo(1);
  });

  it('keeps speed continuous at the start and comes to rest at the end', () => {
    const slope = (p) => (settle(p + 1e-4, 0.8) - settle(p - 1e-4, 0.8)) / 2e-4;
    expect(slope(0.8)).toBeCloseTo(1, 2);
    expect(slope(0.9999)).toBeLessThan(0.01);
    for (let p = 0.8; p < 1; p += 0.01) expect(settle(p + 0.01, 0.8)).toBeGreaterThanOrEqual(settle(p, 0.8));
  });
});

describe('exitPhases', () => {
  it('stays idle when the scene has no outgoing transition', () => {
    expect(exitPhases(0.99, 0, 0.2)).toMatchObject({ dive: 0, press: 0, overlapStart: 1 });
  });

  it('dives before the overlap and presses during it', () => {
    const exit = 0.2;
    expect(exitPhases(0.55, exit, 0.2)).toMatchObject({ dive: 0, press: 0 });
    expect(exitPhases(0.8, exit, 0.2)).toMatchObject({ dive: 1, press: 0 });
    expect(exitPhases(1, exit, 0.2)).toMatchObject({ dive: 1, press: 1 });
    const mid = exitPhases(0.7, exit, 0.2);
    expect(mid.dive).toBeGreaterThan(0);
    expect(mid.dive).toBeLessThan(1);
  });
});

describe('closingGap', () => {
  const gap = (t) => closingGap(t, 8, 0.22);

  it('runs from the start gap to the end gap', () => {
    expect(gap(0)).toBeCloseTo(8);
    expect(gap(1)).toBeCloseTo(0.22);
  });

  it('starts at rest, never stalls, and keeps the on-screen growth rate steady', () => {
    const steps = 1000;
    const speeds = Array.from({ length: steps }, (_, i) => gap(i / steps) - gap((i + 1) / steps));
    expect(speeds[0]).toBeLessThan(speeds[400] * 0.02);
    // Relative closing rate (speed / gap: how fast the surface grows on
    // screen) is constant once eased in — including at the very end, so the
    // camera is still visibly moving when the scene hands over.
    const rel = (i) => speeds[i] / gap(i / steps);
    expect(rel(900) / rel(400)).toBeCloseTo(1, 1);
    expect(rel(steps - 1) / rel(400)).toBeCloseTo(1, 1);
    expect(speeds[steps - 1]).toBeGreaterThan(0);
    speeds.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
  });
});

describe('crossAtMidEntry', () => {
  it('reaches the boundary halfway through the incoming transition', () => {
    const enter = 0.18;
    const boundary = 0.04;
    expect(crossAtMidEntry(enter / 2, enter, boundary)).toBeCloseTo(boundary);
    expect(crossAtMidEntry(0, enter, boundary)).toBe(0);
    expect(crossAtMidEntry(1, enter, boundary)).toBe(1);
  });

  it('is the identity without an incoming transition', () => {
    expect(crossAtMidEntry(0.37, 0, 0.04)).toBeCloseTo(0.37);
  });
});

describe('createSkinField', () => {
  const field = createSkinField(createRng(3), { size: 20 });

  it('is deterministic for a given seed', () => {
    const again = createSkinField(createRng(3), { size: 20 });
    expect(again.pores).toEqual(field.pores);
  });

  it('sinks pores below their surroundings and marks them', () => {
    for (const p of field.pores.slice(0, 20)) {
      const inside = field.sample(p.x, p.z);
      const outside = field.sample(p.x + p.r * 2.5, p.z);
      expect(inside.height).toBeLessThan(outside.height);
      expect(inside.pore).toBeCloseTo(1);
      expect(field.nearestPoreDistance(p.x, p.z)).toBeCloseTo(0);
    }
  });
});
