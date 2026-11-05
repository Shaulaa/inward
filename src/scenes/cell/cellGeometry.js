import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * One Golgi cisterna: a flattened sac with blunt, slightly swollen rims, bent
 * so a stack of them curves gently. Local Y is the stacking axis; the sac bows
 * toward +Y at its ends.
 *
 * A plain squashed sphere would thin out to a knife edge at the rim and read
 * as a pointed leaf from the side. Raising |y| to a small power turns the
 * cross-section into a superellipse: flat faces with a rounded, blunt rim.
 */
export function createCisternaGeometry({ length = 1.7, width = 1.2, thickness = 0.075, bend = 0.06 } = {}) {
  const sphere = new THREE.SphereGeometry(1, 64, 24);
  const position = sphere.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const edge = Math.min(1, Math.hypot(x, z));
    const px = x * length;
    const pz = z * width;
    const profile = Math.sign(y) * Math.abs(y) ** 0.3;
    const swollenRim = 1 + 0.45 * edge ** 4;
    const py = profile * thickness * swollenRim + bend * (px * px + 0.6 * pz * pz);
    position.setXYZ(i, px, py, pz);
  }
  // Drop attributes that differ across the UV seam so it welds into one smooth surface.
  sphere.deleteAttribute('normal');
  sphere.deleteAttribute('uv');
  const geometry = mergeVertices(sphere);
  sphere.dispose();
  geometry.computeVertexNormals();
  return geometry;
}
