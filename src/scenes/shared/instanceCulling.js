import * as THREE from 'three';

const frustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();
const sphere = new THREE.Sphere();
const center = new THREE.Vector3();
const eye = new THREE.Vector3();
const scratch = new THREE.Color();

/**
 * Per-instance culling (and optional level of detail) for a static
 * InstancedMesh.
 *
 * three.js culls an InstancedMesh as a whole (one bounding sphere around all
 * instances), so a layer of a thousand cells is drawn in full even when the
 * camera only sees a handful. This keeps every instance's matrix and bounding
 * sphere, and each frame packs just the ones the camera can see into the
 * front of the instance buffer:
 *
 * - outside the frustum: skipped,
 * - further than `maxDistance` (lost in the fog): skipped,
 * - further than `lodDistance`: drawn by `lod`, a second InstancedMesh with
 *   lighter geometry and the same material (small on screen, so the coarser
 *   silhouette doesn't show).
 *
 * Per-instance colours (`colors`) travel with their instance. Buffers are
 * only re-uploaded when what is visible changes.
 */
export class InstanceCuller {
  /**
   * @param {THREE.InstancedMesh} mesh created with capacity for every matrix
   * @param {THREE.Matrix4[]} matrices
   * @param {{ lod?: THREE.InstancedMesh | null, lodDistance?: number, maxDistance?: number, colors?: THREE.Color[] | null }} [options]
   */
  constructor(mesh, matrices, { lod = null, lodDistance = Infinity, maxDistance = Infinity, colors = null } = {}) {
    this.total = matrices.length;
    this.levels = (lod ? [mesh, lod] : [mesh]).map((target) => ({ mesh: target, visible: new Uint32Array(this.total), count: -1 }));
    this.lodDistance = lodDistance;
    this.maxDistance = maxDistance;
    this.source = new Float32Array(this.total * 16);
    this.centers = new Float32Array(this.total * 3);
    this.radii = new Float32Array(this.total);
    this.colors = colors ? new Float32Array(this.total * 3) : null;

    mesh.geometry.computeBoundingSphere();
    const local = mesh.geometry.boundingSphere;
    matrices.forEach((matrix, i) => {
      matrix.toArray(this.source, i * 16);
      center.copy(local.center).applyMatrix4(matrix).toArray(this.centers, i * 3);
      // 10 % slack: the organic materials wobble their surface a little outward.
      this.radii[i] = local.radius * matrix.getMaxScaleOnAxis() * 1.1;
      if (colors) colors[i].toArray(this.colors, i * 3);
    });
    for (const level of this.levels) {
      level.mesh.count = 0;
      // Culled per instance here; the mesh-level test would use stale bounds.
      level.mesh.frustumCulled = false;
      if (this.colors && !level.mesh.instanceColor) level.mesh.setColorAt(0, scratch.setRGB(1, 1, 1));
    }
  }

  /** Call after the camera has moved for this frame. */
  update(camera) {
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection);
    eye.setFromMatrixPosition(camera.matrixWorld);

    const [near, far] = this.levels;
    const counts = [0, 0];
    const changed = [false, false];
    for (let i = 0; i < this.total; i++) {
      sphere.center.fromArray(this.centers, i * 3);
      sphere.radius = this.radii[i];
      const distance = sphere.center.distanceTo(eye) - sphere.radius;
      if (distance > this.maxDistance || !frustum.intersectsSphere(sphere)) continue;
      const k = far && distance > this.lodDistance ? 1 : 0;
      const level = k ? far : near;
      if (level.visible[counts[k]] !== i) {
        level.visible[counts[k]] = i;
        changed[k] = true;
      }
      counts[k]++;
    }

    this.levels.forEach((level, k) => {
      if (!changed[k] && counts[k] === level.count) return;
      level.count = counts[k];
      const { mesh, visible } = level;
      const matrices = mesh.instanceMatrix.array;
      for (let n = 0; n < level.count; n++) {
        const i = visible[n];
        matrices.set(this.source.subarray(i * 16, i * 16 + 16), n * 16);
      }
      mesh.count = level.count;
      upload(mesh.instanceMatrix, level.count * 16);
      if (this.colors) {
        const colors = mesh.instanceColor.array;
        for (let n = 0; n < level.count; n++) {
          const i = visible[n];
          colors.set(this.colors.subarray(i * 3, i * 3 + 3), n * 3);
        }
        upload(mesh.instanceColor, level.count * 3);
      }
    });
  }

  /** Instances currently drawn, per level (for tests and the debug overlay). */
  get drawn() {
    return this.levels.map((level) => Math.max(0, level.count));
  }
}

function upload(attribute, length) {
  attribute.clearUpdateRanges();
  attribute.addUpdateRange(0, Math.max(length, 1));
  attribute.needsUpdate = true;
}
