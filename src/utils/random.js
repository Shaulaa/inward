/**
 * Seeded PRNG (mulberry32). Scenes use it so procedural layouts are identical
 * on every load, which keeps camera paths and object placement predictable.
 */
export function createRng(seed = 1) {
  let state = seed >>> 0;

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const range = (min, max) => min + (max - min) * next();

  /** Uniformly distributed unit vector, written into `out` ({x,y,z}). */
  const onSphere = (out) => {
    const z = range(-1, 1);
    const a = range(0, Math.PI * 2);
    const r = Math.sqrt(1 - z * z);
    out.x = r * Math.cos(a);
    out.y = r * Math.sin(a);
    out.z = z;
    return out;
  };

  return { next, range, onSphere };
}
