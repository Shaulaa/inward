const gauss = (x, width) => Math.exp(-(x * x) / (width * width));

/**
 * Pulse shape of one heartbeat ("lub" then a softer "dub"), roughly 0..1.
 * Shared by everything that should feel the heart: vessel wall and blood flow.
 */
export function heartbeat(timeSeconds, bpm = 68) {
  const phase = ((timeSeconds * bpm) / 60) % 1;
  const lub = gauss(phase, 0.045) + gauss(phase - 1, 0.045);
  const dub = 0.6 * gauss(phase - 0.2, 0.05);
  return lub + dub;
}
