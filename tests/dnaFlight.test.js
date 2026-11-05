import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B_DNA, buildHelix } from '../src/scenes/dna/dnaGeometry.js';
import { VIEW_DISTANCE, createDnaFlight } from '../src/scenes/dna/dnaFlight.js';

// Same proportions as DnaScene.
const START_PAIR = 90;
const RIBBON_WIDTH = 0.5;
const RIBBON_THICKNESS = 0.16;
const BASE_RADIUS = 0.13;
const START_DISTANCE = B_DNA.radius + RIBBON_THICKNESS / 2 + 0.12;
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
  // Dense samples along each backbone ribbon's centreline.
  const sample = (strand) => {
    const curve = new THREE.CatmullRomCurve3(strand.map(move));
    return curve.getSpacedPoints(strand.length * 12);
  };
  return { rods, ribbons: [sample(helix.strandA), sample(helix.strandB)] };
}

const segmentDistance = (p, a, b) => {
  const ab = b.clone().sub(a);
  const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / ab.lengthSq()));
  return a.clone().addScaledVector(ab, t).distanceTo(p);
};

/**
 * Lower bound on the distance from p to a ribbon (flattened ellipse, broad
 * side facing out from the axis) around centreline point c.
 */
function ribbonClearance(p, c) {
  const d = p.clone().sub(c);
  const radial = new THREE.Vector3(c.x, c.y, 0).normalize();
  const along = d.dot(radial);
  const across = Math.sqrt(Math.max(0, d.lengthSq() - along * along));
  const e = Math.hypot(along / (RIBBON_THICKNESS / 2), across / (RIBBON_WIDTH / 2));
  // Two valid lower bounds; the second is the tight one far away (the ribbon
  // always fits inside a tube of its half-width).
  return Math.max((e - 1) * (RIBBON_THICKNESS / 2), d.length() - RIBBON_WIDTH / 2);
}

describe('createDnaFlight', () => {
  const { rods, ribbons } = obstacles();
  const clearance = (p) => {
    let c = Infinity;
    for (const [a, b] of rods) if (Math.abs(a.z - p.z) < 4) c = Math.min(c, segmentDistance(p, a, b) - BASE_RADIUS);
    for (const ribbon of ribbons) {
      for (const point of ribbon) if (Math.abs(point.z - p.z) < 1.5) c = Math.min(c, ribbonClearance(p, point));
    }
    return c;
  };

  it('never touches the helix, even at the pressed-in start', () => {
    for (let i = 0; i <= 600; i++) expect(clearance(flight.curve.getPointAt(i / 600))).toBeGreaterThan(0.08);
  });

  it('views the helix whole once the incoming transition is over', () => {
    for (let i = 0; i <= 200; i++) {
      const progress = ENTER + (i / 200) * (1 - ENTER);
      const p = flight.curve.getPointAt(flight.distance(progress));
      expect(Math.hypot(p.x, p.y)).toBeGreaterThan(VIEW_DISTANCE * 0.9);
      expect(clearance(p)).toBeGreaterThan(1.5);
    }
  });
});

describe('flight speed', () => {
  const f = flight.distance;
  const speeds = Array.from({ length: 2000 }, (_, i) => (f((i + 1) / 2000) - f(i / 2000)) * 2000);

  it('runs 0 -> 1 monotonically, starting slowly', () => {
    expect(f(0)).toBe(0);
    expect(f(1)).toBeCloseTo(1);
    speeds.forEach((v) => expect(v).toBeGreaterThan(0));
    expect(speeds[0]).toBeLessThan(Math.max(...speeds) * 0.15);
  });

  it('changes smoothly in profile and in world space (no stop-then-lurch, no arc-length steps)', () => {
    const cruise = Math.max(...speeds);
    for (let i = 1; i < speeds.length; i++) expect(Math.abs(speeds[i] - speeds[i - 1])).toBeLessThan(cruise * 0.01);

    const world = [];
    let previous = flight.curve.getPointAt(0);
    for (let i = 1; i <= 2000; i++) {
      const point = flight.curve.getPointAt(f(i / 2000));
      world.push(point.distanceTo(previous));
      previous = point;
    }
    const top = Math.max(...world);
    for (let i = 1; i < world.length; i++) expect(Math.abs(world[i] - world[i - 1])).toBeLessThan(top * 0.03);
  });
});
