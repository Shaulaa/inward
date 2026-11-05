import * as THREE from 'three';

/**
 * One smooth, seamless backbone ribbon along a helix strand: a flattened
 * ellipse swept along the strand, its broad side facing away from the helix
 * axis (local Z), like a classic DNA ribbon. One continuous surface — no
 * beads or segments along it.
 *
 * Both ends narrow (taperLength, world units) and dissolve (fadeLength, via
 * an `aFade` attribute, 0 at the tips).
 *
 * @param {THREE.Vector3[]} points strand points in the helix's local space (axis = Z)
 */
export function createHelixRibbon(
  points,
  { width = 0.5, thickness = 0.14, samplesPerPoint = 6, radialSegments = 16, taperLength = 4, fadeLength = 9 } = {},
) {
  const curve = new THREE.CatmullRomCurve3(points);
  curve.arcLengthDivisions = points.length * 20;
  const length = curve.getLength();
  const rings = Math.max(2, (points.length - 1) * samplesPerPoint);
  const taper = Math.min(taperLength, length * 0.45);
  const fade = Math.min(fadeLength, length * 0.45);

  const positions = [];
  const normals = [];
  const uvs = [];
  const fades = [];
  const indices = [];

  const center = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const radial = new THREE.Vector3();
  const across = new THREE.Vector3();
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();

  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    curve.getPointAt(t, center);
    curve.getTangentAt(t, tangent);
    // Outward from the helix axis, made perpendicular to the strand.
    radial.set(center.x, center.y, 0).normalize();
    radial.addScaledVector(tangent, -radial.dot(tangent)).normalize();
    across.crossVectors(tangent, radial);

    const fromEnd = Math.min(t, 1 - t) * length;
    const x = Math.min(1, fromEnd / taper);
    const scale = Math.max(0.02, Math.pow(x, 0.6) * (1 - 0.25 * (1 - x) * (1 - x)));
    const halfThick = (thickness / 2) * scale;
    const halfWide = (width / 2) * scale;

    for (let j = 0; j <= radialSegments; j++) {
      const phi = (j / radialSegments) * Math.PI * 2;
      const c = Math.cos(phi);
      const s = Math.sin(phi);
      p.copy(center).addScaledVector(radial, c * halfThick).addScaledVector(across, s * halfWide);
      positions.push(p.x, p.y, p.z);
      // Ellipse normal: gradient of (u/a)² + (v/b)².
      n.copy(radial).multiplyScalar(c / halfThick).addScaledVector(across, s / halfWide).normalize();
      normals.push(n.x, n.y, n.z);
      uvs.push(t, j / radialSegments);
      fades.push(Math.min(1, fromEnd / fade));
    }
  }

  // Counter-clockwise seen from outside: (a+1 − a) runs around the ellipse
  // (≈ across at phi = 0) and (b − a) along the strand (tangent), and
  // across × tangent = radial points out. The opposite order made the outer
  // wall back-facing, so it was culled and the ribbon looked hollow and cut
  // open wherever it bent toward the camera.
  const stride = radialSegments + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('aFade', new THREE.Float32BufferAttribute(fades, 1));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
