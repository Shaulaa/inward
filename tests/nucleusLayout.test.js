import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BEAD_SPACING, createNucleosomeString } from '../src/scenes/nucleus/nucleusLayout.js';

describe('createNucleosomeString', () => {
  const start = new THREE.Vector3(0, 0, 0);
  const end = new THREE.Vector3(16, 0, 0);
  const center = new THREE.Vector3(7, 0, 0);

  it('puts a bead exactly at the centre, spaced evenly', () => {
    const { beads } = createNucleosomeString(start, end, center);
    expect(beads.some((b) => b.distanceTo(center) < 1e-9)).toBe(true);
    for (let i = 1; i < beads.length; i++) expect(beads[i].x - beads[i - 1].x).toBeCloseTo(BEAD_SPACING);
  });

  it('stops the beads where the naked DNA begins, and the DNA runs on to the end', () => {
    const { beads, curve } = createNucleosomeString(start, end, center, 9);
    expect(Math.max(...beads.map((b) => b.x))).toBeLessThan(9);
    // Past the beads the DNA lies on the string axis (no wrapping offset).
    const tail = curve.getPointAt(0.9);
    expect(Math.hypot(tail.y, tail.z)).toBeLessThan(1e-6);
    expect(curve.getPointAt(1).x).toBeGreaterThan(15.9);
  });
});
