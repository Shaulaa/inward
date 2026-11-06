import { clamp, smoothstep } from '../utils/math.js';

/**
 * The whole page scroll: the journey (skin → DNA, timeline units unchanged),
 * then the closing sequence after DNA. All values are timeline units
 * (1 unit = SCROLL_VH_PER_UNIT vh of scrolling).
 *
 * Closing sequence:
 *   hold    the final DNA view stays while the "2 metre" fact shows,
 *   rewind  the camera rushes back out through every scene to the skin —
 *           the journey played backwards, fast (≈180 vh for the whole
 *           journey), through the same scenes and transitions (so it obeys
 *           the same "active scene ± 1" rendering),
 *   rest    back on the skin; the closing line stays until the end.
 */
export const OUTRO_UNITS = { hold: 0.4, rewind: 0.4, rest: 0.2 };

/** Length of every text fade in and out (≈ 27 vh). */
export const TEXT_FADE = 0.06;
/** A scene's text shows over the first part of its content window. */
const CAPTION_SHARE = 0.7;
/** Click points show over this part of a scene's content window. */
const HOTSPOT_SHARE = [0.08, 0.96];

/**
 * @param {{ spans: Array<{ id: string, start: number, end: number }>, transitions: Array<{ duration: number }>, total: number }} timeline
 * @param {{ hold: number, rewind: number, rest: number }} outro
 */
export function buildStoryline(timeline, outro = OUTRO_UNITS) {
  for (const key of ['hold', 'rewind', 'rest']) {
    if (!(outro[key] > 0)) throw new Error(`Outro "${key}" must be a positive duration.`);
  }
  const journeyEnd = timeline.total;
  const holdEnd = journeyEnd + outro.hold;
  const rewindEnd = holdEnd + outro.rewind;
  const total = rewindEnd + outro.rest;

  // Content window: the part of a scene outside both transitions. Text and
  // click points live only here, so they never sit over a transition.
  const scenes = timeline.spans.map((span, i) => {
    const incoming = i > 0 ? timeline.transitions[i - 1].duration : 0;
    const outgoing = i < timeline.transitions.length ? timeline.transitions[i].duration : 0;
    const start = span.start + incoming;
    const end = span.end - outgoing;
    const length = end - start;
    return {
      id: span.id,
      index: i,
      content: { start, end },
      // The first scene's text is already up when the page opens.
      caption: { start: i === 0 ? -TEXT_FADE : start, end: start + length * CAPTION_SHARE },
      hotspots: { start: start + length * HOTSPOT_SHARE[0], end: start + length * HOTSPOT_SHARE[1] },
    };
  });

  return {
    total,
    journeyEnd,
    holdEnd,
    rewindEnd,
    scenes,
    outro: {
      fact: { start: journeyEnd + 0.02, end: holdEnd - 0.03 },
      rewind: { start: holdEnd, end: rewindEnd },
      // Appears as the camera settles back on the skin and stays to the end.
      closing: { start: rewindEnd - 0.08, end: Infinity },
    },
  };
}

/** Which part of the story `u` (units of scroll) is in. */
export function phaseAt(storyline, u) {
  if (u <= storyline.journeyEnd) return 'journey';
  if (u <= storyline.holdEnd) return 'hold';
  if (u < storyline.rewindEnd) return 'rewind';
  return 'rest';
}

/**
 * Journey progress (0..1, what the SceneManager draws) at scroll position `u`.
 * Continuous everywhere: the rewind starts and ends at rest (smoothstep), so
 * the camera eases out of the DNA view and eases back into the opening skin
 * view. Scrolling back up just runs the same function the other way.
 */
export function journeyProgressAt(storyline, u) {
  const { journeyEnd, holdEnd, rewindEnd } = storyline;
  if (!Number.isFinite(u) || u <= 0) return 0;
  if (u <= journeyEnd) return u / journeyEnd;
  if (u <= holdEnd) return 1;
  if (u < rewindEnd) return 1 - smoothstep(holdEnd, rewindEnd, u);
  return 0;
}

/**
 * Progress through the closing rewind (0 = the DNA view, 1 = back on the
 * skin), eased so it starts and ends at rest; null outside the rewind.
 * Rendered by the SceneManager from snapshots (see rewind.js).
 */
export function rewindAt(storyline, u) {
  if (phaseAt(storyline, u) !== 'rewind') return null;
  return smoothstep(storyline.holdEnd, storyline.rewindEnd, u);
}

/** Opacity (0..1) of something shown over `window`, fading in and out over `fade` units. */
export function windowOpacity(window, u, fade = TEXT_FADE) {
  const fadeIn = smoothstep(window.start, window.start + fade, u);
  const fadeOut = window.end === Infinity ? 1 : 1 - smoothstep(window.end - fade, window.end, u);
  return clamp(fadeIn * fadeOut);
}

/** True while `u` is inside `window`. */
export const inWindow = (window, u) => u >= window.start && u <= window.end;
