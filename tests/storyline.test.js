import { describe, expect, it } from 'vitest';
import { buildTimeline, sampleTimeline } from '../src/core/timeline.js';
import { buildStoryline, inWindow, journeyProgressAt, OUTRO_UNITS, phaseAt, TEXT_FADE, windowOpacity } from '../src/core/storyline.js';

// The real journey's durations (journey.js), without importing the scenes.
const scenes = [0.6, 0.85, 0.75, 1.05, 0.9, 0.65].map((duration, i) => ({ id: `s${i}`, duration }));
const transitions = [0.22, 0.22, 0.22, 0.22, 0.25].map((duration) => ({ type: 'membrane', duration }));
const timeline = buildTimeline(scenes, transitions);
const story = buildStoryline(timeline);

describe('buildStoryline', () => {
  it('keeps the journey exactly as it was and appends the closing sequence after it', () => {
    expect(story.journeyEnd).toBeCloseTo(timeline.total);
    expect(story.holdEnd).toBeCloseTo(timeline.total + OUTRO_UNITS.hold);
    expect(story.rewindEnd).toBeCloseTo(story.holdEnd + OUTRO_UNITS.rewind);
    expect(story.total).toBeCloseTo(story.rewindEnd + OUTRO_UNITS.rest);
    for (let u = 0; u <= story.journeyEnd; u += 0.01) {
      expect(journeyProgressAt(story, u)).toBeCloseTo(u / timeline.total, 10);
    }
  });

  it('rejects a missing or empty outro part', () => {
    expect(() => buildStoryline(timeline, { ...OUTRO_UNITS, rewind: 0 })).toThrow(/rewind/);
  });

  it('holds on the DNA view, rewinds all the way to the skin, and stays there', () => {
    expect(journeyProgressAt(story, story.journeyEnd + OUTRO_UNITS.hold / 2)).toBe(1);
    expect(journeyProgressAt(story, story.rewindEnd)).toBe(0);
    expect(journeyProgressAt(story, story.total)).toBe(0);
    expect(phaseAt(story, story.journeyEnd - 0.01)).toBe('journey');
    expect(phaseAt(story, story.journeyEnd + 0.01)).toBe('hold');
    expect(phaseAt(story, story.holdEnd + 0.01)).toBe('rewind');
    expect(phaseAt(story, story.total)).toBe('rest');
    // The rewind passes back through every scene.
    const visited = new Set();
    for (let u = story.holdEnd; u <= story.rewindEnd; u += 0.002) visited.add(sampleTimeline(timeline, journeyProgressAt(story, u)).active);
    expect([...visited].sort()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('is continuous and never jumps, in either scroll direction', () => {
    const step = 0.001;
    let previous = journeyProgressAt(story, 0);
    for (let u = step; u <= story.total + step; u += step) {
      const p = journeyProgressAt(story, u);
      // The fastest part of the rewind moves at 1.5× its average speed.
      expect(Math.abs(p - previous)).toBeLessThan((1.5 * step) / OUTRO_UNITS.rewind + 1e-9);
      previous = p;
    }
    // Scrolling back up is the same function: outro → journey reversed, no special case.
    expect(journeyProgressAt(story, story.holdEnd)).toBe(1);
    expect(journeyProgressAt(story, -1)).toBe(0);
    expect(journeyProgressAt(story, Number.NaN)).toBe(0);
  });

  it('starts and ends the rewind at rest (no lurch out of the DNA view or into the skin)', () => {
    const e = 1e-4;
    const speed = (u) => Math.abs(journeyProgressAt(story, u + e) - journeyProgressAt(story, u)) / e;
    expect(speed(story.holdEnd + e)).toBeLessThan(0.01);
    expect(speed(story.rewindEnd - 2 * e)).toBeLessThan(0.01);
  });

  it('keeps every scene text and click-point window clear of the transitions', () => {
    story.scenes.forEach((scene, i) => {
      const span = timeline.spans[i];
      const transitionStart = i < transitions.length ? span.end - transitions[i].duration : Infinity;
      const transitionEnd = i > 0 ? span.start + transitions[i - 1].duration : -Infinity;
      expect(scene.caption.start).toBeGreaterThanOrEqual(Math.min(transitionEnd, -TEXT_FADE) - 1e-9);
      expect(scene.caption.end).toBeLessThan(transitionStart);
      expect(scene.hotspots.start).toBeGreaterThan(transitionEnd);
      expect(scene.hotspots.end).toBeLessThan(transitionStart);
      // Every point of the window has this scene active and no transition running.
      for (let u = scene.hotspots.start; u <= scene.hotspots.end; u += 0.005) {
        const state = sampleTimeline(timeline, u / timeline.total);
        expect(state.active).toBe(i);
        expect(state.to === null || state.mix === 0).toBe(true);
      }
    });
  });

  it('shows the first text from the start, and the closing fact during the hold only', () => {
    expect(windowOpacity(story.scenes[0].caption, 0)).toBe(1);
    const { fact, closing } = story.outro;
    expect(fact.start).toBeGreaterThan(story.journeyEnd);
    expect(fact.end).toBeLessThan(story.holdEnd);
    expect(windowOpacity(fact, (fact.start + fact.end) / 2)).toBe(1);
    expect(windowOpacity(fact, story.holdEnd + 0.01)).toBe(0);
    expect(windowOpacity(closing, story.total)).toBe(1);
    expect(windowOpacity(closing, story.holdEnd + 0.1)).toBe(0);
    expect(inWindow(closing, story.total)).toBe(true);
  });

  it('fades text smoothly: opacity changes gradually with the scroll', () => {
    const window = story.scenes[2].caption;
    let previous = windowOpacity(window, window.start - 0.1);
    for (let u = window.start - 0.1; u <= window.end + 0.1; u += 0.002) {
      const o = windowOpacity(window, u);
      expect(Math.abs(o - previous)).toBeLessThan(0.06);
      previous = o;
    }
  });
});
