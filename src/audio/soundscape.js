/**
 * Per-scene sound mix (pure data + helpers, so it can be tested without an
 * AudioContext).
 *
 * heart:     heartbeat level — clearest in the blood vessel, fading as the
 *            journey goes deeper ("makin hilang pas makin dalam").
 * heartTone: low-pass cutoff (Hz) on the heartbeat — muffled further away.
 * flow:      rushing blood, swelling after every beat.
 * air:       faint airy hiss at the skin surface.
 * drone:     low organic hum inside the body.
 * shimmer:   soft high tones at the molecular scale.
 */
export const SCENE_MIX = {
  skin: { heart: 0.22, heartTone: 260, flow: 0, air: 0.35, drone: 0.12, shimmer: 0 },
  dermis: { heart: 0.45, heartTone: 320, flow: 0.12, air: 0.12, drone: 0.28, shimmer: 0 },
  vessel: { heart: 1, heartTone: 900, flow: 0.55, air: 0, drone: 0.32, shimmer: 0 },
  cell: { heart: 0.35, heartTone: 240, flow: 0.08, air: 0, drone: 0.45, shimmer: 0.08 },
  nucleus: { heart: 0.14, heartTone: 170, flow: 0, air: 0, drone: 0.42, shimmer: 0.22 },
  dna: { heart: 0.04, heartTone: 140, flow: 0, air: 0, drone: 0.25, shimmer: 0.42 },
};

const SILENT = { heart: 0, heartTone: 200, flow: 0, air: 0, drone: 0, shimmer: 0 };

/**
 * The mix for the current moment: the visible scene's mix, or a blend of the
 * outgoing and incoming scenes during a transition (by the transition's mix).
 * @param {string} fromId
 * @param {string | null} toId
 * @param {number} mix 0..1
 */
export function blendMix(fromId, toId, mix) {
  const a = SCENE_MIX[fromId] ?? SILENT;
  if (!toId) return { ...a };
  const b = SCENE_MIX[toId] ?? SILENT;
  const t = Math.min(Math.max(mix, 0), 1);
  const out = {};
  for (const key of Object.keys(SILENT)) {
    // The cutoff blends in log space so the muffling changes evenly to the ear.
    out[key] = key === 'heartTone' ? Math.exp(Math.log(a[key]) * (1 - t) + Math.log(b[key]) * t) : a[key] * (1 - t) + b[key] * t;
  }
  return out;
}
