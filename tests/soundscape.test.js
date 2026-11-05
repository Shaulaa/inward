import { describe, expect, it } from 'vitest';
import { SCENE_MIX, blendMix } from '../src/audio/soundscape.js';
import { HEART_BPM, heartPhase, heartbeat } from '../src/utils/heartbeat.js';

describe('soundscape mix', () => {
  it('has the heartbeat clearest in the vessel and fading the deeper the journey goes', () => {
    const order = ['vessel', 'cell', 'nucleus', 'dna'];
    for (let i = 1; i < order.length; i++) {
      expect(SCENE_MIX[order[i]].heart).toBeLessThan(SCENE_MIX[order[i - 1]].heart);
      expect(SCENE_MIX[order[i]].heartTone).toBeLessThan(SCENE_MIX[order[i - 1]].heartTone);
    }
    for (const id of Object.keys(SCENE_MIX)) expect(SCENE_MIX[id].heart).toBeLessThanOrEqual(SCENE_MIX.vessel.heart);
  });

  it('uses a scene mix as-is outside transitions and blends inside them', () => {
    expect(blendMix('vessel', null, 0.7)).toEqual(SCENE_MIX.vessel);
    const half = blendMix('vessel', 'cell', 0.5);
    expect(half.heart).toBeCloseTo((SCENE_MIX.vessel.heart + SCENE_MIX.cell.heart) / 2);
    // Cutoff blends geometrically.
    expect(half.heartTone).toBeCloseTo(Math.sqrt(SCENE_MIX.vessel.heartTone * SCENE_MIX.cell.heartTone));
    expect(blendMix('vessel', 'cell', 1).heart).toBeCloseTo(SCENE_MIX.cell.heart);
  });

  it('treats unknown scenes as silence', () => {
    expect(blendMix('nowhere', null, 0).heart).toBe(0);
  });
});

describe('heartbeat timing', () => {
  it('peaks at phase 0, the moment the audio "lub" is scheduled', () => {
    const period = 60 / HEART_BPM;
    const phase = heartPhase(3 * period);
    expect(Math.min(phase, 1 - phase)).toBeCloseTo(0); // 0, or 0.999… from floating point
    expect(heartbeat(3 * period)).toBeGreaterThan(heartbeat(3 * period + period * 0.1));
  });
});
