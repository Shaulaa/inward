/**
 * Height field of the skin patch (scene units: 1 unit = 1 mm).
 *
 * Pores sit on a jittered grid and are looked up through a spatial hash, so
 * evaluating the height for every vertex of a dense plane stays cheap. Pure
 * and deterministic (given the rng), which keeps camera targets and hair
 * placement consistent with the rendered surface.
 */
export function createSkinField(rng, { size = 44, spacing = 1.5, jitter = 0.42, poreRadius = 0.2 } = {}) {
  const half = size / 2;
  const pores = [];
  const buckets = new Map();
  const key = (i, j) => `${i},${j}`;

  const count = Math.floor(size / spacing);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j < count; j++) {
      const x = -half + (i + 0.5) * spacing + rng.range(-jitter, jitter) * spacing;
      const z = -half + (j + 0.5) * spacing + rng.range(-jitter, jitter) * spacing;
      const pore = { x, z, r: poreRadius * rng.range(0.75, 1.25), depth: rng.range(0.1, 0.16) };
      pores.push(pore);
      const k = key(Math.floor(x / spacing), Math.floor(z / spacing));
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(pore);
    }
  }

  const nearbyPores = (x, z) => {
    const ci = Math.floor(x / spacing);
    const cj = Math.floor(z / spacing);
    const found = [];
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        const list = buckets.get(key(ci + di, cj + dj));
        if (list) found.push(...list);
      }
    }
    return found;
  };

  /** Gentle undulation of the skin, independent of pores. */
  const undulation = (x, z) =>
    0.07 * Math.sin(x * 0.31 + 1.3) * Math.sin(z * 0.27 + 0.4) + 0.035 * Math.sin(x * 0.83 - z * 0.61 + 2.1);

  /**
   * Height and pore openness at (x, z). `pore` is 1 at a pore centre, 0 away
   * from pores (used to darken the pit in the shader).
   */
  const sample = (x, z) => {
    let height = undulation(x, z);
    let pore = 0;
    for (const p of nearbyPores(x, z)) {
      const t = Math.hypot(x - p.x, z - p.z) / p.r;
      if (t > 1.8) continue;
      if (t < 1) {
        const pit = (1 - t * t) ** 2;
        height -= p.depth * pit;
        pore = Math.max(pore, pit);
      }
      // Slightly raised rim around the opening.
      height += 0.02 * Math.exp(-(((t - 1.08) / 0.28) ** 2));
    }
    return { height, pore };
  };

  const nearestPoreDistance = (x, z) => {
    let best = Infinity;
    for (const p of nearbyPores(x, z)) best = Math.min(best, Math.hypot(x - p.x, z - p.z));
    return best;
  };

  return { size, pores, sample, nearestPoreDistance };
}
