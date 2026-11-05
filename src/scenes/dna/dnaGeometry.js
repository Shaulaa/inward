import * as THREE from 'three';

/** B-DNA (units: nm). Visual only, but the proportions are the textbook ones. */
export const B_DNA = {
  radius: 1.0, // ~2 nm diameter
  rise: 0.34, // per base pair
  basePairsPerTurn: 10.5,
  /** Angle between the two backbones of one base pair; the smaller gap is the minor groove. */
  grooveAngle: (144 * Math.PI) / 180,
};

export const BASES = ['A', 'T', 'C', 'G'];
export const COMPLEMENT = { A: 'T', T: 'A', C: 'G', G: 'C' };

export function randomSequence(rng, length) {
  return Array.from({ length }, () => BASES[Math.floor(rng.next() * 4) % 4]).join('');
}

/**
 * Backbone positions and base pairs of a straight double helix along -Z,
 * starting at z = 0.
 *
 * Each base pair has one backbone point per strand; the pair is drawn as two
 * half-rods meeting midway between them (the bases), coloured by base.
 */
export function buildHelix(sequence, { radius, rise, basePairsPerTurn, grooveAngle } = B_DNA) {
  const twist = (Math.PI * 2) / basePairsPerTurn;
  const strandA = [];
  const strandB = [];
  const pairs = [];
  for (let i = 0; i < sequence.length; i++) {
    const angle = i * twist;
    const z = -i * rise;
    const a = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, z);
    const b = new THREE.Vector3(Math.cos(angle + grooveAngle) * radius, Math.sin(angle + grooveAngle) * radius, z);
    strandA.push(a);
    strandB.push(b);
    const base = sequence[i];
    pairs.push({ base, partner: COMPLEMENT[base], a, b, middle: a.clone().add(b).multiplyScalar(0.5), angle });
  }
  return { strandA, strandB, pairs, twist };
}
