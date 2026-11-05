export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

export const lerp = (a, b, t) => a + (b - a) * t;

export const invLerp = (a, b, value) => (a === b ? 0 : (value - a) / (b - a));

/** Remap value from [a, b] to [0, 1], clamped. */
export const range01 = (a, b, value) => clamp(invLerp(a, b, value));

export const smoothstep = (edge0, edge1, x) => {
  const t = range01(edge0, edge1, x);
  return t * t * (3 - 2 * t);
};

export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export const easeInOutSine = (t) => -(Math.cos(Math.PI * t) - 1) / 2;
