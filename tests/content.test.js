import { describe, expect, it } from 'vitest';
import { NOTE, OUTRO, SCENES, UI } from '../src/content/story.js';

const SCENE_IDS = ['skin', 'dermis', 'vessel', 'cell', 'nucleus', 'dna'];
const LEVELS = ['wajib', 'disarankan'];

const expectCheck = (check, where) => {
  expect(check, `${where}: missing check`).toBeTruthy();
  expect(LEVELS, `${where}: check.level`).toContain(check.level);
  expect(check.what?.length, `${where}: check.what`).toBeGreaterThan(3);
  expect(check.source?.length, `${where}: check.source`).toBeGreaterThan(3);
};

describe('content (src/content/story.js)', () => {
  it('has every scene, in journey order, with the scale indicator values', () => {
    expect(Object.keys(SCENES)).toEqual(SCENE_IDS);
    expect(SCENE_IDS.map((id) => SCENES[id].scale)).toEqual(['±1 cm', '±1 mm', '±100 µm', '±20 µm', '±5 µm', '±2 nm']);
    for (const id of SCENE_IDS) expectCheck(SCENES[id].scaleCheck, `${id} scale`);
  });

  it('gives every scene a short text and two or three click points, each with a fact check marker', () => {
    for (const id of SCENE_IDS) {
      const scene = SCENES[id];
      expect(scene.caption.title.length).toBeGreaterThan(0);
      // Short enough for the side column / bottom band.
      expect(scene.caption.text.length, `${id} caption`).toBeLessThanOrEqual(170);
      expectCheck(scene.caption.check, `${id} caption`);

      expect(scene.hotspots.length).toBeGreaterThanOrEqual(2);
      expect(scene.hotspots.length).toBeLessThanOrEqual(3);
      const ids = scene.hotspots.map((h) => h.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const spot of scene.hotspots) {
        expect(spot.label.length).toBeLessThanOrEqual(22);
        expect(spot.title.length).toBeGreaterThan(0);
        expect(spot.text.length, `${id}/${spot.id}`).toBeLessThanOrEqual(190);
        expectCheck(spot.check, `${id}/${spot.id}`);
      }
    }
  });

  it('marks every number as a must-check fact', () => {
    const all = [
      ...SCENE_IDS.flatMap((id) => [SCENES[id].caption, ...SCENES[id].hotspots]),
      OUTRO.fact,
    ];
    for (const item of all) {
      if (/\d/.test(item.text) || /\d/.test(item.title)) expect(item.check.level, item.title).toBe('wajib');
    }
  });

  it('has the closing texts and the illustration note', () => {
    expect(OUTRO.fact.title).toMatch(/2 meter/);
    expectCheck(OUTRO.fact.check, 'outro fact');
    expectCheck(OUTRO.closing.check, 'outro closing');
    expect(OUTRO.replay.length).toBeGreaterThan(0);
    expect(NOTE).toMatch(/ilustrasi/i);
    expect(UI.closeFact.length).toBeGreaterThan(0);
  });
});
