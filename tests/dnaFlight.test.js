import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B_DNA, buildHelix } from '../src/scenes/dna/dnaGeometry.js';
import { createDnaFlight } from '../src/scenes/dna/dnaFlight.js';

// Same proportions as DnaScene.
const START_PAIR = 90;
const BACKBONE_RADIUS = 0.2;
const PHOSPHATE_RADIUS = 0.24;
const BASE_RADIUS = 0.13;
const START_DISTANCE = B_DNA.radius + BACKBONE_RADIUS + 0.14;
const ENTER = 0.385;

const flight = createDnaFlight({ startPair: START_PAIR, startDistance: START_DISTANCE, enter: ENTER });

/** Hero helix obstacles in world space (pair k at z = (START_PAIR − k) · rise). */
function obstacles() {
  const helix = buildHelix('A'.repeat(220));
  const shift = new THREE.Vector3(0, 0, START_PAIR * B_DNA.rise);
  const move = (v) => v.clone().add(shift);
  const rods = [];
  for (const p of helix.pairs) {
    for (const end of [p.a, p.b]) {
      const dir = p.middle.clone().sub(end).normalize();
      rods.push([move(end).addScaledVector(dir, BASE_RADIUS), move(p.middle).addScaledVector(dir, -BASE_RADIUS)]);
    }
  }
  return { rods, strandA: helix.strandA.map(move), strandB: helix.strandB.map(move) };
}

const segmentDistance = (p, a, b) => {
  const ab = b.clone().sub(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return a.clone().addScaledVector(ab, t).distanceTo(p);
};

describe('createDnaFlight', () => {
  const { rods, strandA, strandB } = obstacles();
  const clearance = (p) => {
    let c = Infinity;
    const k0 = Math.round(START_PAIR - p.z / B_DNA.rise);
    for (let k = Math.max(0, k0 - 10); k < Math.min(strandA.length - 1, k0 + 10); k++) {
      c = Math.min(c, segmentDistance(p, ...rods[2 * k]) - BASE_RADIUS, segmentDistance(p, ...rods[2 * k + 1]) - BASE_RADIUS);
      c = Math.min(c, strandA[k].distanceTo(p) - PHOSPHATE_RADIUS, strandB[k].distanceTo(p) - PHOSPHATE_RADIUS);
      c = Math.min(c, segmentDistance(p, strandA[k], strandA[k + 1]) - BACKBONE_RADIUS, segmentDistance(p, strandB[k], strandB[k + 1]) - BACKBONE_RADIUS);
    }
    return c;
  };

  it('keeps well clear of every base, phosphate and backbone once inside the helix', () => {
    let worst = Infinity;
    for (let i = 0; i <= 3000; i++) {
      const s = i / 3000;
      if (s < flight.crossingFraction) continue; // the start presses against the backbone on purpose
      worst = Math.min(worst, clearance(flight.curve.getPointAt(s)));
    }
    expect(worst).toBeGreaterThan(0.35);
  });

  it('never touches anything on the way in either', () => {
    for (let i = 0; i <= 400; i++) {
      const s = (i / 400) * flight.crossingFraction;
      expect(clearance(flight.curve.getPointAt(s))).toBeGreaterThan(0.08);
    }
  });
});

describe('flight in world space', () => {
  it('moves at a steady, continuous speed along the curve (no arc-length jumps)', () => {
    const steps = 2000;
    const speeds = [];
    let previous = flight.curve.getPointAt(flight.distance(0));
    for (let i = 1; i <= steps; i++) {
      const point = flight.curve.getPointAt(flight.distance(i / steps));
      speeds.push(point.distanceTo(previous));
      previous = point;
    }
    const cruise = Math.max(...speeds);
    for (let i = 1; i < speeds.length; i++) expect(Math.abs(speeds[i] - speeds[i - 1])).toBeLessThan(cruise * 0.03);
  });
});

describe('flight speed profile', () => {
  const f = flight.distance;
  const speeds = Array.from({ length: 1000 }, (_, i) => (f((i + 1) / 1000) - f(i / 1000)) * 1000);

  it('runs 0 -> 1 monotonically', () => {
    expect(f(0)).toBe(0);
    expect(f(1)).toBeCloseTo(1);
    speeds.forEach((v) => expect(v).toBeGreaterThan(0));
  });

  it('has no sudden speed changes (no stop-then-lurch)', () => {
    const cruise = Math.max(...speeds);
    for (let i = 1; i < speeds.length; i++) {
      // Speed may change by at most 1% of cruise speed per 0.1% of progress.
      expect(Math.abs(speeds[i] - speeds[i - 1])).toBeLessThan(cruise * 0.01);
    }
  });

  it('starts slowly and crosses the helix wall halfway through the incoming transition', () => {
    expect(speeds[0]).toBeLessThan(Math.max(...speeds) * 0.15);
    expect(f(ENTER / 2)).toBeCloseTo(flight.crossingFraction, 3);
  });
});
