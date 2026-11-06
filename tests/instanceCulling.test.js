import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { InstanceCuller } from '../src/scenes/shared/instanceCulling.js';

describe('InstanceCuller', () => {
  // A row of unit spheres along X; the camera looks down -Z at the origin.
  const matrices = Array.from({ length: 41 }, (_, i) => new THREE.Matrix4().makeTranslation((i - 20) * 3, 0, 0));
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), new THREE.MeshBasicMaterial(), matrices.length);
  const culler = new InstanceCuller(mesh, matrices);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);

  const drawnX = () => Array.from({ length: mesh.count }, (_, k) => new THREE.Vector3().setFromMatrixPosition(new THREE.Matrix4().fromArray(mesh.instanceMatrix.array, k * 16)).x);

  it('draws only the instances inside the view, packed at the front of the buffer', () => {
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    culler.update(camera);
    const xs = drawnX();
    expect(mesh.count).toBeGreaterThan(0);
    expect(mesh.count).toBeLessThan(matrices.length);
    // Half-width of the view at distance 10 is 10·tan(30°) ≈ 5.8, plus the sphere radius.
    for (const x of xs) expect(Math.abs(x)).toBeLessThanOrEqual(5.8 + 1.1 + 1e-6);
    expect(xs).toContain(0);
    expect(xs).toContain(-6);
    expect(xs).toContain(6);
  });

  it('follows the camera, and draws nothing when it looks away', () => {
    camera.position.set(30, 0, 10);
    camera.lookAt(30, 0, 0);
    culler.update(camera);
    expect(drawnX()).toContain(30);
    expect(drawnX()).not.toContain(0);

    camera.lookAt(30, 0, 20);
    culler.update(camera);
    expect(mesh.count).toBe(0);
  });

  it('keeps instances whose sphere only grazes the frustum edge (no popping at the border)', () => {
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.position.x = 6.9; // the sphere at x = 0 is just past the left edge, inside by its radius
    camera.lookAt(6.9, 0, 0);
    culler.update(camera);
    expect(drawnX()).toContain(0);
  });
});
