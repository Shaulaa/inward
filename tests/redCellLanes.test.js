import { describe, expect, it } from 'vitest';
import { createLanes, distributeAlongLane } from '../src/scenes/vessel/redCellLanes.js';
import { createRng } from '../src/utils/random.js';

describe('createLanes', () => {
  it('keeps every pair of lanes at least minDistance apart, inside the annulus', () => {
    const lanes = createLanes(createRng(3), { rMin: 0.7, rMax: 2.4, minDistance: 0.72 });
    expect(lanes.length).toBeGreaterThan(15);
    for (const lane of lanes) {
      expect(lane.radial).toBeGreaterThanOrEqual(0.7);
      expect(lane.radial).toBeLessThanOrEqual(2.4);
    }
    for (let i = 0; i < lanes.length; i++) {
      for (let j = i + 1; j < lanes.length; j++) {
        expect(Math.hypot(lanes[i].x - lanes[j].x, lanes[i].y - lanes[j].y)).toBeGreaterThanOrEqual(0.72);
      }
    }
  });
});

describe('distributeAlongLane', () => {
  const minLoopGap = (positions, length) => {
    let min = Infinity;
    for (let i = 0; i < positions.length; i++) {
      const next = i + 1 < positions.length ? positions[i + 1] : positions[0] + 1;
      min = Math.min(min, (next - positions[i]) * length);
    }
    return min;
  };

  it('spaces cells by at least the gap, including across the wrap', () => {
    const positions = distributeAlongLane(createRng(5), 50, 160, 0.95);
    expect(positions).toHaveLength(50);
    expect(minLoopGap(positions, 160)).toBeGreaterThanOrEqual(0.95 - 1e-9);
    positions.forEach((p) => {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThan(1);
    });
  });

  it('caps the count to what fits on the lane', () => {
    const positions = distributeAlongLane(createRng(5), 500, 10, 1);
    expect(positions).toHaveLength(10);
    expect(minLoopGap(positions, 10)).toBeGreaterThanOrEqual(1 - 1e-9);
    expect(distributeAlongLane(createRng(5), 3, 0.5, 1)).toEqual([]);
  });
});
