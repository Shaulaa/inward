import * as THREE from 'three';

/** Shortest distance from `point` to a set of sample points (e.g. a camera route). */
export function distanceToPoints(point, samples) {
  let best = Infinity;
  for (const s of samples) best = Math.min(best, s.distanceToSquared(point));
  return Math.sqrt(best);
}

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
 * Split a ring-major tube-like geometry into chunks along its length, so each
 * chunk is frustum-culled on its own instead of the whole tube being drawn
 * whenever any part of it is in view.
 *
 * Works for any geometry laid out ring by ring with `ringSize` vertices per
 * ring (TubeGeometry, createTaperedTube, createHelixRibbon). The winding of
 * the source is read from its first quad and repeated, so chunks face the
 * same way as the original.
 *
 * `step(chunkIndex, approxCenter)` may return 2 or 3 to keep only every n-th
 * ring inside a chunk: a lighter level of detail for chunks far from where
 * the camera goes. A chunk's first and last rings are always kept, so
 * neighbouring chunks of different detail still share their boundary ring
 * exactly (no cracks). Attribute values are copied unchanged, so positions,
 * normals, UVs and fades along the tube stay identical.
 *
 * @param {THREE.BufferGeometry} geometry indexed, ring-major
 * @param {{ ringSize: number, ringsPerChunk: number, step?: (chunk: number, center: THREE.Vector3) => number }} options
 * @returns {{ geometry: THREE.BufferGeometry, center: THREE.Vector3 }[]}
 */
export function sliceRings(geometry, { ringSize, ringsPerChunk, step = () => 1 }) {
  const source = geometry.index.array;
  const position = geometry.attributes.position;
  const ringCount = position.count / ringSize;
  if (!Number.isInteger(ringCount)) throw new Error('sliceRings: vertex count is not a whole number of rings.');

  // One quad of the source, as (ring offset, radial offset) per corner.
  const corners = Array.from(source.slice(0, 6), (i) => [Math.floor(i / ringSize), i % ringSize]);
  const baseRing = Math.min(...corners.map((c) => c[0]));
  const baseRadial = Math.min(...corners.map((c) => c[1]));
  const pattern = corners.map(([r, j]) => [r - baseRing, j - baseRadial]);

  const names = Object.keys(geometry.attributes);
  const chunks = [];
  const center = new THREE.Vector3();
  for (let first = 0; first < ringCount - 1; first += ringsPerChunk) {
    const last = Math.min(first + ringsPerChunk, ringCount - 1);
    center.fromBufferAttribute(position, Math.round((first + last) / 2) * ringSize);
    const stride = Math.max(1, Math.round(step(chunks.length, center)));
    const rings = [];
    for (let r = first; r < last; r += stride) rings.push(r);
    rings.push(last);

    const piece = new THREE.BufferGeometry();
    for (const name of names) {
      const attribute = geometry.attributes[name];
      const size = attribute.itemSize;
      const data = new Float32Array(rings.length * ringSize * size);
      rings.forEach((r, k) => data.set(attribute.array.subarray(r * ringSize * size, (r + 1) * ringSize * size), k * ringSize * size));
      piece.setAttribute(name, new THREE.BufferAttribute(data, size));
    }
    const index = [];
    for (let k = 0; k < rings.length - 1; k++) {
      for (let j = 0; j < ringSize - 1; j++) {
        for (const [dr, dj] of pattern) index.push((k + dr) * ringSize + j + dj);
      }
    }
    piece.setIndex(index);
    piece.computeBoundingSphere();
    chunks.push({ geometry: piece, center: piece.boundingSphere.center.clone() });
  }
  return chunks;
}

/**
 * Merge chunks that fall in the same cell of a coarse grid, so culling still
 * works per region while the draw-call count stays modest.
 *
 * @param {{ geometry: THREE.BufferGeometry, center: THREE.Vector3 }[]} chunks
 * @param {number} cellSize world units
 * @param {(geometries: THREE.BufferGeometry[]) => THREE.BufferGeometry} merge e.g. mergeGeometries
 * @returns {THREE.BufferGeometry[]}
 */
export function mergeByCell(chunks, cellSize, merge) {
  const cells = new Map();
  for (const { geometry, center } of chunks) {
    const key = `${Math.floor(center.x / cellSize)},${Math.floor(center.y / cellSize)},${Math.floor(center.z / cellSize)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(geometry);
  }
  const merged = [];
  for (const list of cells.values()) {
    const geometry = list.length === 1 ? list[0] : merge(list);
    if (list.length > 1) list.forEach((g) => g.dispose());
    geometry.computeBoundingSphere();
    merged.push(geometry);
  }
  return merged;
}

/**
 * Cut an indexed PlaneGeometry (any vertex positions, same grid layout) into
 * `tiles` × `tiles` pieces, each with its own copy of its vertices and its own
 * bounding sphere, so the renderer culls the tiles out of view. Normals and
 * other attributes are copied unchanged (compute normals before splitting),
 * so tile borders match exactly.
 *
 * @param {THREE.BufferGeometry} geometry from PlaneGeometry(w, h, segments, segments)
 * @param {number} segments grid segments per side
 * @param {number} tiles tiles per side
 * @returns {THREE.BufferGeometry[]}
 */
export function splitGrid(geometry, segments, tiles) {
  const row = segments + 1;
  const names = Object.keys(geometry.attributes);
  const pieces = [];
  const edges = Array.from({ length: tiles + 1 }, (_, i) => Math.round((i * segments) / tiles));
  for (let ty = 0; ty < tiles; ty++) {
    for (let tx = 0; tx < tiles; tx++) {
      const [x0, x1, y0, y1] = [edges[tx], edges[tx + 1], edges[ty], edges[ty + 1]];
      const width = x1 - x0 + 1;
      const piece = new THREE.BufferGeometry();
      for (const name of names) {
        const attribute = geometry.attributes[name];
        const size = attribute.itemSize;
        const data = new Float32Array(width * (y1 - y0 + 1) * size);
        let k = 0;
        for (let iy = y0; iy <= y1; iy++) {
          data.set(attribute.array.subarray((iy * row + x0) * size, (iy * row + x1 + 1) * size), k);
          k += width * size;
        }
        piece.setAttribute(name, new THREE.BufferAttribute(data, size));
      }
      const index = [];
      for (let iy = 0; iy < y1 - y0; iy++) {
        for (let ix = 0; ix < x1 - x0; ix++) {
          // Same winding as PlaneGeometry: (a, b, d), (b, c, d).
          const a = ix + width * iy;
          const b = ix + width * (iy + 1);
          const c = ix + 1 + width * (iy + 1);
          const d = ix + 1 + width * iy;
          index.push(a, b, d, b, c, d);
        }
      }
      piece.setIndex(index);
      piece.computeBoundingSphere();
      pieces.push(piece);
    }
  }
  return pieces;
}

/**
 * Split a closed surface around the origin (sphere, icosphere) into patches
 * by direction — the six faces of a cube, each cut into `cells` × `cells` —
 * so the renderer culls the patches out of view. Mostly the camera is close
 * to (or inside) these spheres and sees a small part of them.
 *
 * Triangles keep their object-space positions and attributes, so shading is
 * unchanged. `margin` (units) pads each patch's bounding sphere for surfaces
 * that the vertex shader displaces.
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {{ cells?: number, margin?: number }} [options]
 * @returns {THREE.BufferGeometry[]}
 */
export function splitByDirection(geometry, { cells = 3, margin = 0 } = {}) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.attributes.position;
  const names = Object.keys(source.attributes);
  const buckets = new Map();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  for (let t = 0; t < position.count / 3; t++) {
    a.fromBufferAttribute(position, t * 3);
    b.fromBufferAttribute(position, t * 3 + 1);
    c.fromBufferAttribute(position, t * 3 + 2);
    centroid.copy(a).add(b).add(c).normalize();
    // Cube face of the dominant axis, then a cell on that face.
    const ax = Math.abs(centroid.x);
    const ay = Math.abs(centroid.y);
    const az = Math.abs(centroid.z);
    let face;
    let u;
    let v;
    if (ax >= ay && ax >= az) [face, u, v] = [centroid.x > 0 ? 0 : 1, centroid.y / ax, centroid.z / ax];
    else if (ay >= az) [face, u, v] = [centroid.y > 0 ? 2 : 3, centroid.x / ay, centroid.z / ay];
    else [face, u, v] = [centroid.z > 0 ? 4 : 5, centroid.x / az, centroid.y / az];
    const cell = (x) => Math.min(cells - 1, Math.floor(((x + 1) / 2) * cells));
    const key = face * cells * cells + cell(u) * cells + cell(v);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(t);
  }
  const pieces = [];
  for (const triangles of buckets.values()) {
    const piece = new THREE.BufferGeometry();
    for (const name of names) {
      const attribute = source.attributes[name];
      const size = attribute.itemSize;
      const data = new Float32Array(triangles.length * 3 * size);
      triangles.forEach((t, k) => data.set(attribute.array.subarray(t * 3 * size, (t + 1) * 3 * size), k * 3 * size));
      piece.setAttribute(name, new THREE.BufferAttribute(data, size));
    }
    piece.computeBoundingSphere();
    piece.boundingSphere.radius += margin;
    pieces.push(piece);
  }
  if (source !== geometry) source.dispose();
  return pieces;
}

/**
 * Distance at which FogExp2 of `density` has covered `share` of an object
 * (default 99.7 %). Used as the camera's far plane: anything beyond would be
 * drawn as pure fog colour — the background colour — anyway, so clipping it
 * changes nothing on screen but lets whole chunks be culled.
 */
export const fogLimit = (density, share = 0.997) => Math.sqrt(-Math.log(1 - share)) / density;

/**
 * Levels of detail for chunked geometry. `levels[k]` is the chunk list for
 * level k (from sliceRings with the same ringsPerChunk, so chunk i covers the
 * same stretch at every level). Chunks are grouped per grid cell (keyed on
 * level 0); each group gets one mesh per level, and the returned controller
 * shows the level whose `distances[k]` the camera is past (distance to the
 * group's centre, with a little hysteresis). Register it with
 * scene.addCuller() so it runs every frame.
 *
 * Geometry is not re-centred: object-space positions drive the organic
 * wobble in the vertex shaders, and neighbouring groups must keep matching
 * exactly at their seams.
 *
 * @param {{ geometry: THREE.BufferGeometry, center: THREE.Vector3 }[][]} levels
 * @param {number[]} distances one per level, ascending (first is 0)
 * @param {number} cellSize
 * @param {THREE.Material} material
 * @param {(geometries: THREE.BufferGeometry[]) => THREE.BufferGeometry} merge
 * @returns {{ meshes: THREE.Mesh[], update: (camera: THREE.Camera) => void }}
 */
export function buildChunkLods(levels, distances, cellSize, material, merge) {
  const groups = new Map();
  levels[0].forEach(({ center }, i) => {
    const key = `${Math.floor(center.x / cellSize)},${Math.floor(center.y / cellSize)},${Math.floor(center.z / cellSize)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(i);
  });
  const entries = [];
  for (const members of groups.values()) {
    const meshes = levels.map((chunks, k) => {
      const list = members.map((i) => chunks[i].geometry);
      const geometry = list.length === 1 ? list[0] : merge(list);
      if (list.length > 1) list.forEach((g) => g.dispose());
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = k === 0;
      return mesh;
    });
    entries.push({ meshes, center: meshes[0].geometry.boundingSphere.center.clone(), level: 0 });
  }
  const eye = new THREE.Vector3();
  const HYSTERESIS = 0.1;
  return {
    meshes: entries.flatMap((e) => e.meshes),
    update(camera) {
      eye.setFromMatrixPosition(camera.matrixWorld);
      for (const entry of entries) {
        const d = entry.center.distanceTo(eye);
        let level = 0;
        for (let k = 1; k < distances.length; k++) {
          // Switch further out when coming from a finer level, closer when coming back.
          const edge = distances[k] * (entry.level >= k ? 1 - HYSTERESIS : 1 + HYSTERESIS);
          if (d > edge) level = k;
        }
        if (level === entry.level) continue;
        entry.meshes[entry.level].visible = false;
        entry.meshes[level].visible = true;
        entry.level = level;
      }
    },
  };
}
