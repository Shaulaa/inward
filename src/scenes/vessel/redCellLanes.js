/**
 * Collision-free blood flow without per-frame physics.
 *
 * The vessel cross-section is split into "lanes": points in an annulus placed
 * by dart-throwing so no two lanes are closer than a cell's diameter. All cells
 * in one lane share the same lateral position and speed, so their spacing
 * along the lane never changes. Cells in different lanes never get closer
 * than the lane spacing. A tumbling disc stays inside its bounding sphere, so
 * spacing >= diameter means no two cells ever intersect.
 */

/**
 * @param {{ next: () => number, range: (a: number, b: number) => number }} rng
 * @param {{ rMin: number, rMax: number, minDistance: number, attempts?: number }} options
 * @returns {Array<{ radial: number, angle: number, x: number, y: number }>}
 */
export function createLanes(rng, { rMin, rMax, minDistance, attempts = 4000 }) {
  const lanes = [];
  const minSq = minDistance * minDistance;
  for (let i = 0; i < attempts; i++) {
    // Area-uniform sample in the annulus.
    const radial = Math.sqrt(rng.range(rMin * rMin, rMax * rMax));
    const angle = rng.range(0, Math.PI * 2);
    const x = Math.cos(angle) * radial;
    const y = Math.sin(angle) * radial;
    if (lanes.every((l) => (l.x - x) ** 2 + (l.y - y) ** 2 >= minSq)) lanes.push({ radial, angle, x, y });
  }
  return lanes;
}

/**
 * Random positions (0..1 of the loop) for `count` cells on a looping lane of
 * `length`, every neighbour pair — including across the wrap — at least `gap` apart.
 * Returns fewer positions if the lane cannot hold `count`.
 */
export function distributeAlongLane(rng, count, length, gap) {
  const fit = Math.min(count, Math.floor(length / gap));
  if (fit <= 0) return [];
  const free = length - fit * gap;
  const offsets = Array.from({ length: fit }, () => rng.next() * free).sort((a, b) => a - b);
  return offsets.map((offset, i) => (offset + i * gap) / length);
}
