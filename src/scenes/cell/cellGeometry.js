import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Tube along `curve` that narrows to a fine point at both ends.
 *
 * TubeGeometry lays vertices out ring by ring. Within `taperLength` (world
 * units) of either end each ring is pulled toward the centreline, so the
 * radius runs smoothly from full to zero. Normals are tilted by the local
 * slope of the radius so the taper is lit like a real cone.
 *
 * Adds an `aFade` attribute (0 at the tips, 1 once past the fade zone) that a
 * material can use to dissolve the tips into the cytoplasm.
 */
export function createTaperedTube(
  curve,
  { tubularSegments = 64, radius = 0.1, radialSegments = 8, taperLength = 0.6, fadeLength = taperLength } = {},
) {
  const length = curve.getLength();
  const taper = Math.min(taperLength, length * 0.45);
  const fade = Math.min(fadeLength, length * 0.45);
  // Radius profile in [0, 1]: fast rise from the tip, smooth shoulder into the full tube.
  const profile = (distance) => {
    const x = Math.min(1, distance / taper);
    return Math.pow(x, 0.75) * (1 - 0.25 * (1 - x) * (1 - x));
  };
  const radiusAt = (t) => radius * profile(Math.min(t, 1 - t) * length);

  const geometry = new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments, false);
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const fadeValues = new Float32Array(position.count);
  const center = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const dt = 0.5 / tubularSegments;

  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    const fromEnd = Math.min(t, 1 - t) * length;
    const ringFade = Math.min(1, fromEnd / fade);
    const scale = radiusAt(t) / radius;

    curve.getPointAt(t, center);
    curve.getTangentAt(t, tangent);
    // dr/ds along the curve direction: positive near the start, negative near the end.
    const slope = (radiusAt(Math.min(1, t + dt)) - radiusAt(Math.max(0, t - dt))) / (2 * dt * length);

    for (let j = 0; j <= radialSegments; j++) {
      const index = i * (radialSegments + 1) + j;
      fadeValues[index] = ringFade;
      if (scale >= 1 && Math.abs(slope) < 1e-6) continue;

      v.fromBufferAttribute(position, index).sub(center).multiplyScalar(scale).add(center);
      position.setXYZ(index, v.x, v.y, v.z);

      // Surface of revolution r(s): outward normal ∝ radial − r'(s)·tangent.
      n.fromBufferAttribute(normal, index).addScaledVector(tangent, -slope).normalize();
      normal.setXYZ(index, n.x, n.y, n.z);
    }
  }
  position.needsUpdate = true;
  normal.needsUpdate = true;
  geometry.setAttribute('aFade', new THREE.BufferAttribute(fadeValues, 1));
  geometry.computeBoundingSphere();
  return geometry;
}

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
