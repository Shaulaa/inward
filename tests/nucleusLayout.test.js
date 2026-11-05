import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BEAD_SPACING, NAKED_GROOVE_ANGLE, NAKED_HELIX_RADIUS, createNucleosomeString } from '../src/scenes/nucleus/nucleusLayout.js';

describe('createNucleosomeString', () => {
  const start = new THREE.Vector3(0, 0, 0);
  const end = new THREE.Vector3(16, 0, 0);
  const center = new THREE.Vector3(7, 0, 0);

  it('puts a bead exactly at the centre, spaced evenly', () => {
    const { beads } = createNucleosomeString(start, end, center);
    expect(beads.some((b) => b.distanceTo(center) < 1e-9)).toBe(true);
    for (let i = 1; i < beads.length; i++) expect(beads[i].x - beads[i - 1].x).toBeCloseTo(BEAD_SPACING);
  });

  const string = createNucleosomeString(start, end, center, 9);

  it('stops the beads where the naked DNA begins', () => {
    expect(Math.max(...string.beads.map((b) => b.x))).toBeLessThan(9);
    expect(string.naked.start).toBeLessThan(10);
    expect(string.wrapped.getPointAt(1).x).toBeLessThan(10);
  });

  it('keeps the axis straight along the beads and bends it organically after them', () => {
    const onBeads = string.axisAt(5);
    expect(Math.hypot(onBeads.y, onBeads.z)).toBeLessThan(1e-9);
    const offsets = [11, 12.5, 14, 15.5].map((s) => {
      const p = string.axisAt(s);
      return Math.hypot(p.y, p.z);
    });
    expect(Math.max(...offsets)).toBeGreaterThan(0.15);
    // Gentle: no kinks between neighbouring samples.
    for (let s = 9; s < 15.9; s += 0.05) {
      expect(string.axisAt(s + 0.05).distanceTo(string.axisAt(s))).toBeLessThan(0.065);
    }
  });

  it('builds the naked DNA as a double helix around the bending axis', () => {
    const { naked, axisAt } = string;
    for (let s = naked.start; s < 15.9; s += 0.137) {
      const a = naked.strandPoint(s, 'A');
      const b = naked.strandPoint(s, 'B');
      expect(a.distanceTo(axisAt(s))).toBeCloseTo(NAKED_HELIX_RADIUS);
      expect(b.distanceTo(axisAt(s))).toBeCloseTo(NAKED_HELIX_RADIUS);
      // The two backbones of a pair are a groove angle apart.
      expect(a.distanceTo(b)).toBeCloseTo(2 * NAKED_HELIX_RADIUS * Math.sin(NAKED_GROOVE_ANGLE / 2), 4);
    }
    expect(naked.rungs.length).toBeGreaterThan(100);
    const rung = naked.rungs[40];
    const t = axisAt(rung.s + 0.01).sub(axisAt(rung.s - 0.01)).normalize();
    // Rungs lie across the axis, not along it.
    expect(Math.abs(rung.b.clone().sub(rung.a).normalize().dot(t))).toBeLessThan(0.05);
  });
});
