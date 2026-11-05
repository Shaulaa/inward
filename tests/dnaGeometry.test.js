import { describe, expect, it } from 'vitest';
import { B_DNA, COMPLEMENT, buildHelix, randomSequence } from '../src/scenes/dna/dnaGeometry.js';
import { createRng } from '../src/utils/random.js';

describe('randomSequence', () => {
  it('is deterministic and uses only A, T, C, G', () => {
    const a = randomSequence(createRng(4), 200);
    expect(a).toBe(randomSequence(createRng(4), 200));
    expect(a).toMatch(/^[ATCG]{200}$/);
    for (const base of 'ATCG') expect(a).toContain(base);
  });
});

describe('buildHelix', () => {
  const sequence = randomSequence(createRng(9), 42);
  const { strandA, strandB, pairs, twist } = buildHelix(sequence);

  it('pairs every base with its complement', () => {
    pairs.forEach((p, i) => {
      expect(p.base).toBe(sequence[i]);
      expect(p.partner).toBe(COMPLEMENT[p.base]);
    });
  });

  it('keeps both backbones on the helix radius, rising 0.34 nm per base pair', () => {
    for (let i = 0; i < pairs.length; i++) {
      expect(Math.hypot(strandA[i].x, strandA[i].y)).toBeCloseTo(B_DNA.radius);
      expect(Math.hypot(strandB[i].x, strandB[i].y)).toBeCloseTo(B_DNA.radius);
      expect(strandA[i].z).toBeCloseTo(-i * B_DNA.rise);
      expect(strandB[i].z).toBeCloseTo(strandA[i].z);
    }
  });

  it('makes one full turn every 10.5 base pairs', () => {
    expect(twist * B_DNA.basePairsPerTurn).toBeCloseTo(Math.PI * 2);
  });

  it('separates the two backbones of a pair by the groove angle, with the bases meeting midway', () => {
    const chord = 2 * B_DNA.radius * Math.sin(B_DNA.grooveAngle / 2);
    for (const p of pairs) {
      expect(p.a.distanceTo(p.b)).toBeCloseTo(chord);
      expect(p.middle.distanceTo(p.a)).toBeCloseTo(chord / 2);
    }
  });
});
