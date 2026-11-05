import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { NUCLEUS_RADIUS, blocksNucleusView } from '../src/scenes/cell/cellLayout.js';
import { createTaperedTube } from '../src/scenes/shared/geometry.js';

describe('blocksNucleusView', () => {
  const camera = [new THREE.Vector3(0, 0, 12)];

  it('flags points between the camera and the nucleus', () => {
    expect(blocksNucleusView(new THREE.Vector3(0, 0, 9), camera, 0)).toBe(true);
    expect(blocksNucleusView(new THREE.Vector3(2, 1, 8), camera, 0)).toBe(true);
  });

  it('ignores points outside the view cone, behind the camera or behind the nucleus centre', () => {
    expect(blocksNucleusView(new THREE.Vector3(9, 0, 9), camera, 0)).toBe(false);
    expect(blocksNucleusView(new THREE.Vector3(0, 0, 14), camera, 0)).toBe(false);
    expect(blocksNucleusView(new THREE.Vector3(0, 0, -8), camera, 0)).toBe(false);
  });

  it('widens the cone by the margin', () => {
    // Just outside the silhouette cone at this depth.
    const along = 3;
    const tan = NUCLEUS_RADIUS / Math.sqrt(144 - NUCLEUS_RADIUS ** 2);
    const p = new THREE.Vector3(along * tan + 0.2, 0, 12 - along);
    expect(blocksNucleusView(p, camera, 0)).toBe(false);
    expect(blocksNucleusView(p, camera, 0.5)).toBe(true);
  });
});

describe('createTaperedTube', () => {
  const curve = new THREE.LineCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 10));
  const radialSegments = 8;
  const tubularSegments = 100;
  const ring = (i) => i * (radialSegments + 1);
  const geometry = createTaperedTube(curve, { tubularSegments, radius: 0.5, radialSegments, taperLength: 2 });
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const fade = geometry.attributes.aFade;
  const v = new THREE.Vector3();
  const radiusOfRing = (i) => Math.hypot(position.getX(ring(i)), position.getY(ring(i)));

  it('narrows to a point on the centreline at both ends', () => {
    for (const i of [0, tubularSegments]) {
      for (let j = 0; j <= radialSegments; j++) {
        v.fromBufferAttribute(position, ring(i) + j);
        expect(Math.hypot(v.x, v.y)).toBeLessThan(1e-6);
      }
    }
  });

  it('grows monotonically through the taper and keeps full radius in the middle', () => {
    for (let i = 1; i <= 20; i++) expect(radiusOfRing(i)).toBeGreaterThanOrEqual(radiusOfRing(i - 1));
    expect(radiusOfRing(5)).toBeLessThan(0.5);
    expect(radiusOfRing(50)).toBeCloseTo(0.5);
  });

  it('fades the tips out and leaves the body opaque', () => {
    expect(fade.getX(ring(0))).toBe(0);
    expect(fade.getX(ring(tubularSegments))).toBe(0);
    expect(fade.getX(ring(10))).toBeGreaterThan(0);
    expect(fade.getX(ring(10))).toBeLessThan(1);
    expect(fade.getX(ring(50))).toBe(1);
  });

  it('tilts normals outward along the taper and keeps them unit length', () => {
    v.fromBufferAttribute(normal, ring(5));
    expect(v.z).toBeLessThan(0); // start cone faces backward
    v.fromBufferAttribute(normal, ring(tubularSegments - 5));
    expect(v.z).toBeGreaterThan(0); // end cone faces forward
    v.fromBufferAttribute(normal, ring(50));
    expect(Math.abs(v.z)).toBeLessThan(1e-6);
    for (let i = 0; i < normal.count; i++) {
      v.fromBufferAttribute(normal, i);
      expect(v.length()).toBeCloseTo(1);
    }
  });
});
