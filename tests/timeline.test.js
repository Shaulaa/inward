import { describe, expect, it } from 'vitest';
import { buildTimeline, liveWindow, sampleTimeline } from '../src/core/timeline.js';

const scenes = [
  { id: 'a', duration: 1 },
  { id: 'b', duration: 1.2 },
  { id: 'c', duration: 1 },
];
const transitions = [
  { type: 'membrane', duration: 0.2 },
  { type: 'crossfade', duration: 0.25 },
];

describe('buildTimeline', () => {
  it('overlaps neighbouring scenes by the transition duration', () => {
    const t = buildTimeline(scenes, transitions);
    expect(t.spans[0]).toMatchObject({ start: 0, end: 1, enter: 0 });
    expect(t.spans[0].exit).toBeCloseTo(0.2);
    expect(t.spans[1].start).toBeCloseTo(0.8);
    expect(t.spans[1].end).toBeCloseTo(2.0);
    expect(t.spans[1].enter).toBeCloseTo(0.2 / 1.2);
    expect(t.spans[2].start).toBeCloseTo(1.75);
    expect(t.total).toBeCloseTo(2.75);
  });

  it('rejects a mismatched transition count', () => {
    expect(() => buildTimeline(scenes, transitions.slice(1))).toThrow(/exactly 2/);
  });

  it('rejects transitions that would make overlaps touch', () => {
    expect(() =>
      buildTimeline(
        [{ id: 'a', duration: 1 }, { id: 'b', duration: 0.5 }, { id: 'c', duration: 1 }],
        [{ type: 'crossfade', duration: 0.3 }, { type: 'crossfade', duration: 0.3 }],
      ),
    ).toThrow(/longer than the scene/);
  });

  it('rejects non-positive durations', () => {
    expect(() => buildTimeline([{ id: 'a', duration: 0 }], [])).toThrow(/positive/);
    expect(() => buildTimeline(scenes.slice(0, 2), [{ type: 'crossfade', duration: 0 }])).toThrow(/positive/);
  });
});

describe('sampleTimeline', () => {
  const t = buildTimeline(scenes, transitions);

  it('shows only the first scene at the start', () => {
    expect(sampleTimeline(t, 0)).toMatchObject({ from: 0, to: null, mix: 0, active: 0 });
  });

  it('blends two scenes inside an overlap', () => {
    const s = sampleTimeline(t, 0.9 / t.total);
    expect(s.from).toBe(0);
    expect(s.to).toBe(1);
    expect(s.mix).toBeCloseTo(0.5);
    expect(s.transition.type).toBe('membrane');
    expect(s.local[0]).toBeCloseTo(0.9);
    expect(s.local[1]).toBeCloseTo(0.1 / 1.2);
  });

  it('switches the active scene at the midpoint of a transition', () => {
    expect(sampleTimeline(t, 0.89 / t.total).active).toBe(0);
    expect(sampleTimeline(t, 0.91 / t.total).active).toBe(1);
  });

  it('shows only the last scene at the end and clamps bad input', () => {
    expect(sampleTimeline(t, 1)).toMatchObject({ from: 2, to: null, active: 2 });
    expect(sampleTimeline(t, 5)).toMatchObject({ from: 2, to: null });
    expect(sampleTimeline(t, -1)).toMatchObject({ from: 0, to: null });
    expect(sampleTimeline(t, Number.NaN)).toMatchObject({ from: 0, to: null });
  });

  it('only ever pairs a scene with its direct successor', () => {
    for (let i = 0; i <= 1000; i++) {
      const s = sampleTimeline(t, i / 1000);
      if (s.to !== null) expect(s.to).toBe(s.from + 1);
      expect([s.from, s.to]).toContain(s.active);
    }
  });
});

describe('liveWindow', () => {
  it('keeps the active scene and its direct neighbours', () => {
    expect(liveWindow(0, 6)).toEqual([0, 1]);
    expect(liveWindow(3, 6)).toEqual([2, 3, 4]);
    expect(liveWindow(5, 6)).toEqual([4, 5]);
    expect(liveWindow(0, 1)).toEqual([0]);
  });
});
