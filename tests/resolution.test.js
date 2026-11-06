import { describe, expect, it } from 'vitest';
import { ResolutionGovernor } from '../src/core/resolution.js';

const run = (governor, fps, seconds) => {
  const changes = [];
  for (let t = 0; t < seconds; t += 1 / fps) {
    const scale = governor.update(1 / fps);
    if (scale !== null) changes.push(scale);
  }
  return changes;
};

describe('ResolutionGovernor', () => {
  it('stays at full resolution while the frame rate is fine', () => {
    const g = new ResolutionGovernor({ max: 1.25 });
    expect(run(g, 60, 10)).toEqual([]);
    expect(g.scale).toBe(1.25);
  });

  it('steps down to 1× CSS when frames are merely slow, never below it', () => {
    const g = new ResolutionGovernor({ max: 1.25 });
    run(g, 32, 10);
    expect(g.scale).toBe(1);
  });

  it('goes below 1× CSS only when frames are really slow, and comes back once they recover', () => {
    const g = new ResolutionGovernor({ max: 1.25 });
    run(g, 20, 10);
    expect(g.scale).toBeLessThan(1);
    expect(g.scale).toBeGreaterThanOrEqual(g.min);
    run(g, 45, 6);
    expect(g.scale).toBe(1);
  });

  it('on a 1× display: stays at 1× unless frames are really slow', () => {
    const g = new ResolutionGovernor({ max: 1 });
    run(g, 33, 10);
    expect(g.scale).toBe(1);
    run(g, 22, 5);
    expect(g.scale).toBeLessThan(1);
  });

  it('reacts within a fraction of a second', () => {
    const g = new ResolutionGovernor({ max: 1.25 });
    let elapsed = 0;
    while (g.update(1 / 25) === null && elapsed < 2) elapsed += 1 / 25;
    expect(elapsed).toBeLessThan(0.6);
  });

  it('ignores single long frames (scene builds, a tab coming back), which resolution cannot fix', () => {
    const g = new ResolutionGovernor({ max: 1.25 });
    for (let i = 0; i < 20; i++) {
      expect(g.update(0.3)).toBeNull();
      run(g, 60, 0.2);
    }
    expect(g.scale).toBe(1.25);
  });

  it('does nothing while paused', () => {
    const g = new ResolutionGovernor({ max: 1.25 });
    g.paused = true;
    expect(run(g, 20, 5)).toEqual([]);
  });

  it('returns to full sharpness once there is headroom again', () => {
    const g = new ResolutionGovernor({ max: 1.25 });
    run(g, 32, 3);
    expect(g.scale).toBeLessThan(1.25);
    run(g, 60, 20);
    expect(g.scale).toBeCloseTo(1.25);
  });

  it('backs off instead of ping-ponging when a step up is too much', () => {
    const g = new ResolutionGovernor({ max: 1.25 });
    let changes = 0;
    for (let t = 0; t < 60; t += 1 / 50) {
      const fps = g.scale > 1.1 ? 28 : 58;
      if (g.update(1 / fps) !== null) changes++;
    }
    expect(changes).toBeLessThan(12);
  });
});
