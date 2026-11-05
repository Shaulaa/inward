import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildHelix } from '../src/scenes/dna/dnaGeometry.js';
import { createHelixRibbon } from '../src/scenes/dna/dnaRibbon.js';

describe('createHelixRibbon', () => {
  const { strandA } = buildHelix('A'.repeat(80));
  const radialSegments = 12;
  const geometry = createHelixRibbon(strandA, { width: 0.5, thickness: 0.16, samplesPerPoint: 4, radialSegments, taperLength: 3, fadeLength: 6 });
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const fade = geometry.attributes.aFade;
  const stride = radialSegments + 1;
  const rings = position.count / stride;

  it('is one continuous surface: every ring joins the next with no gaps', () => {
    expect(Number.isInteger(rings)).toBe(true);
    expect(geometry.index.count).toBe((rings - 1) * radialSegments * 6);
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    for (let i = 1; i < rings; i++) {
      a.fromBufferAttribute(position, (i - 1) * stride);
      b.fromBufferAttribute(position, i * stride);
      expect(a.distanceTo(b)).toBeLessThan(0.2); // neighbouring rings are close: no seams or jumps
    }
  });

  it('has finite, unit-length normals everywhere', () => {
    const n = new THREE.Vector3();
    for (let i = 0; i < normal.count; i++) {
      n.fromBufferAttribute(normal, i);
      expect(Number.isFinite(n.x + n.y + n.z)).toBe(true);
      expect(n.length()).toBeCloseTo(1);
    }
  });

  it('faces outward: every triangle winds counter-clockwise seen from outside (front faces are not culled)', () => {
    const index = geometry.index;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const face = new THREE.Vector3();
    const vertexNormals = new THREE.Vector3();
    const n = new THREE.Vector3();
    let checked = 0;
    for (let k = 0; k < index.count; k += 3) {
      const [ia, ib, ic] = [index.getX(k), index.getX(k + 1), index.getX(k + 2)];
      a.fromBufferAttribute(position, ia);
      b.fromBufferAttribute(position, ib);
      c.fromBufferAttribute(position, ic);
      face.subVectors(b, a).cross(c.clone().sub(a));
      if (face.lengthSq() < 1e-14) continue; // degenerate sliver at a tip
      vertexNormals.set(0, 0, 0);
      for (const i of [ia, ib, ic]) vertexNormals.add(n.fromBufferAttribute(normal, i));
      expect(face.dot(vertexNormals)).toBeGreaterThan(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(index.count / 3 / 2);
  });

  it('is broad along the axis and thin radially in the middle, and fades at both ends', () => {
    const mid = Math.floor(rings / 2);
    const ring = Array.from({ length: radialSegments }, (_, j) => new THREE.Vector3().fromBufferAttribute(position, mid * stride + j));
    const radii = ring.map((p) => Math.hypot(p.x, p.y));
    const zs = ring.map((p) => p.z);
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(0.2); // thin across the radius
    expect(Math.max(...zs) - Math.min(...zs)).toBeGreaterThan(0.3); // broad along the axis
    expect(fade.getX(0)).toBe(0);
    expect(fade.getX(position.count - 1)).toBe(0);
    expect(fade.getX(mid * stride)).toBe(1);
  });
});
