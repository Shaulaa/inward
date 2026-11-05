const gauss = (x, width) => Math.exp(-(x * x) / (width * width));

/** Resting heart rate used by every visual and audio heartbeat. */
export const HEART_BPM = 68;
/** Where in the beat (fraction of one period) the softer "dub" follows the "lub". */
export const DUB_PHASE = 0.2;

/** Phase (0..1) of the heartbeat at a given time; the "lub" is at phase 0. */
export function heartPhase(timeSeconds, bpm = HEART_BPM) {
  return ((timeSeconds * bpm) / 60) % 1;
}

/**
 * Pulse shape of one heartbeat ("lub" then a softer "dub"), roughly 0..1.
 * Shared by everything that should feel the heart: vessel wall, blood flow
 * and the audio heartbeat (which fires on the same phases).
 */
export function heartbeat(timeSeconds, bpm = HEART_BPM) {
  const phase = heartPhase(timeSeconds, bpm);
  const lub = gauss(phase, 0.045) + gauss(phase - 1, 0.045);
  const dub = 0.6 * gauss(phase - DUB_PHASE, 0.05);
  return lub + dub;
}
