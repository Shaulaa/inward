import { clamp } from '../utils/math.js';

/**
 * The journey is one scroll axis split into scenes. Neighbouring scenes overlap
 * by their transition's duration; inside that overlap both scenes are drawn and
 * composited. Every scene keeps its own coordinate system, so the timeline only
 * deals in abstract "units", never in real-world sizes.
 *
 * @typedef {{ id: string, duration: number }} SceneSpec
 * @typedef {{ type: 'membrane' | 'crossfade', duration: number }} TransitionSpec
 * @typedef {{ id: string, index: number, start: number, end: number, duration: number, enter: number, exit: number }} Span
 *   enter / exit: fraction of the scene's own duration spent in its incoming / outgoing transition.
 */

/**
 * @param {SceneSpec[]} scenes
 * @param {TransitionSpec[]} transitions one per boundary (scenes.length - 1)
 */
export function buildTimeline(scenes, transitions) {
  if (!Array.isArray(scenes) || scenes.length === 0) {
    throw new Error('Timeline needs at least one scene.');
  }
  if (!Array.isArray(transitions) || transitions.length !== scenes.length - 1) {
    throw new Error(`Timeline needs exactly ${scenes.length - 1} transition(s), got ${transitions?.length}.`);
  }

  transitions.forEach((t, i) => {
    if (!(t.duration > 0)) throw new Error(`Transition ${i} must have a positive duration.`);
  });
  scenes.forEach((scene, i) => {
    if (!(scene.duration > 0)) throw new Error(`Scene "${scene.id}" must have a positive duration.`);
    const incoming = i > 0 ? transitions[i - 1].duration : 0;
    const outgoing = i < transitions.length ? transitions[i].duration : 0;
    // Overlaps must not touch, otherwise three scenes would be visible at once.
    if (incoming + outgoing >= scene.duration) {
      throw new Error(`Transitions around scene "${scene.id}" are longer than the scene itself.`);
    }
  });

  /** @type {Span[]} */
  const spans = [];
  scenes.forEach((scene, i) => {
    const start = i === 0 ? 0 : spans[i - 1].end - transitions[i - 1].duration;
    const enter = i > 0 ? transitions[i - 1].duration / scene.duration : 0;
    const exit = i < transitions.length ? transitions[i].duration / scene.duration : 0;
    spans.push({ id: scene.id, index: i, start, end: start + scene.duration, duration: scene.duration, enter, exit });
  });

  return { spans, transitions, total: spans[spans.length - 1].end };
}

/**
 * Resolve a global scroll progress (0..1) into what should be on screen.
 * `from` is always visible; `to` is the incoming scene during a transition.
 */
export function sampleTimeline(timeline, progress) {
  const { spans, transitions, total } = timeline;
  const u = clamp(Number.isFinite(progress) ? progress : 0) * total;

  let from = spans.length - 1;
  for (let i = 0; i < spans.length; i++) {
    if (u <= spans[i].end) {
      from = i;
      break;
    }
  }

  let to = null;
  let mix = 0;
  let transition = null;
  const next = spans[from + 1];
  if (next && u >= next.start) {
    to = from + 1;
    transition = transitions[from];
    mix = clamp((u - next.start) / transition.duration);
  }

  const active = to !== null && mix >= 0.5 ? to : from;
  const local = spans.map((span) => clamp((u - span.start) / span.duration));

  return { u, from, to, mix, transition, active, local };
}

/** Indices allowed to hold GPU resources: the active scene and its neighbours. */
export function liveWindow(active, count, radius = 1) {
  const indices = [];
  for (let i = Math.max(0, active - radius); i <= Math.min(count - 1, active + radius); i++) indices.push(i);
  return indices;
}
