import * as THREE from 'three';
import { CompositePass } from './CompositePass.js';
import { PostPass } from './PostPass.js';
import { REWIND_STAGES, rewindFrame } from './rewind.js';
import { buildTimeline, liveWindow, sampleTimeline } from './timeline.js';

/** Seconds a scene stays built after leaving the live window, so scrolling back and forth at a boundary doesn't rebuild it every frame. */
const DISPOSE_DELAY = 1.5;

/** Scenes captured as snapshots for the closing rewind (dermis, vessel, cell, nucleus), in the order the rewind needs them. */
const SNAPSHOT_SCENES = [4, 3, 2, 1];
const DNA = 5;
const SKIN = 0;
const NUCLEUS = 4;
/** A snapshot is taken this close (scene progress) to the middle of the scene's content. */
const CAPTURE_WINDOW = 0.12;
/** If a snapshot is missing when the rewind reaches it: the scene's deep haze colour. */
const FALLBACK = { 1: '#a0505a', 2: '#3a0b13', 3: '#123a47', 4: '#1d1238' };

/** Run `fn` when the main thread is idle (with a deadline), falling back to a short timeout. */
function scheduleIdle(fn) {
  if (typeof requestIdleCallback === 'function') return { id: requestIdleCallback(fn, { timeout: 600 }), idle: true };
  return { id: setTimeout(fn, 32), idle: false };
}

function cancelIdle(handle) {
  if (handle.idle) cancelIdleCallback(handle.id);
  else clearTimeout(handle.id);
}

/**
 * Owns the scene lifecycle and the per-frame render:
 * - only the active scene and its neighbours hold GPU resources; the rest
 *   are disposed (geometry, materials and their shader programs, textures),
 * - only the one or two scenes visible on the timeline are updated and drawn,
 * - visible scenes render into HDR targets and are blended by the CompositePass.
 *
 * The closing sequence (setOutro) keeps that budget too: the rewind zooms
 * out through full-resolution images of the middle scenes captured on the way
 * in, so only DNA and the skin are real scenes while it runs (see rewind.js).
 */
export class SceneManager {
  /**
   * @param {{ renderer: THREE.WebGLRenderer, journey: { scenes: Array<{ id: string, duration: number, create: (ctx: object) => import('../scenes/BaseScene.js').BaseScene }>, transitions: Array<{ type: string, duration: number }> }, quality: object }} options
   */
  constructor({ renderer, journey, quality }) {
    this.renderer = renderer;
    this.quality = quality;
    this.timeline = buildTimeline(journey.scenes, journey.transitions);
    this.entries = journey.scenes.map((definition) => ({ definition, instance: null, outsideSince: null, pending: null, compiled: false }));
    /** Scene indices allowed to hold resources this frame. */
    this.wanted = new Set();
    this.progress = 0;
    /** null during the journey; { phase: 'hold' | 'rewind' | 'rest', rewind: 0..1 } in the closing sequence. */
    this.outro = null;
    this.width = 1;
    this.height = 1;
    this.state = sampleTimeline(this.timeline, 0);

    const targetOptions = { type: THREE.HalfFloatType, samples: quality.msaaSamples, depthBuffer: true };
    this.targetA = new THREE.WebGLRenderTarget(1, 1, targetOptions);
    this.targetB = new THREE.WebGLRenderTarget(1, 1, targetOptions);
    this.composite = new CompositePass();
    this.post = new PostPass(quality.post);

    // Middle of each scene's content (outside both transitions), in scene progress.
    this.captureAt = this.timeline.spans.map((span) => (span.enter + (1 - span.exit)) / 2);
    /** index → { target, stale, rim } */
    this.snapshots = new Map();
    this.fallbacks = new Map(
      Object.entries(FALLBACK).map(([index, color]) => {
        const c = new THREE.Color(color);
        const texture = new THREE.DataTexture(new Float32Array([c.r, c.g, c.b, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
        texture.needsUpdate = true;
        return [Number(index), texture];
      }),
    );
  }

  setProgress(progress) {
    this.progress = progress;
  }

  /** @param {{ phase: 'hold' | 'rewind' | 'rest', rewind: number } | null} outro */
  setOutro(outro) {
    this.outro = outro;
  }

  setSize(width, height, pixelRatio) {
    const reshaped = width !== this.width || height !== this.height;
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    this.targetA.setSize(w, h);
    this.targetB.setSize(w, h);
    this.post.setSize(w, h);
    // Snapshots of the old shape would look stretched: retake them (kept as a
    // stand-in meanwhile). A render-scale change alone doesn't matter.
    if (reshaped) for (const snapshot of this.snapshots.values()) snapshot.stale = true;
    for (const entry of this.entries) {
      entry.instance?.resize(width, height);
      entry.instance?.setPixelRatio(pixelRatio);
    }
  }

  /** The built scene at `index`, or null if it isn't live. */
  sceneAt(index) {
    return this.entries[index]?.instance ?? null;
  }

  /** Zoom-blur strength for the final image (the closing rewind). */
  setRush(amount) {
    this.post.setRush(amount);
  }

  /** Scene ids currently holding GPU resources (for debugging). */
  get liveIds() {
    return this.entries.filter((e) => e.instance).map((e) => e.definition.id);
  }

  /** Scene ids with a fresh snapshot for the closing rewind (for debugging and tests). */
  get snapshotIds() {
    return [...this.snapshots].filter(([, s]) => !s.stale).map(([i]) => this.entries[i].definition.id);
  }

  render(time, dt) {
    if (this.outro?.phase === 'rewind') {
      this.#renderRewind(time, dt);
      return;
    }
    const state = sampleTimeline(this.timeline, this.progress);
    this.state = state;
    this.#syncLifecycle(this.#residency(state), [state.from, state.to], time);
    if (this.outro?.phase === 'hold') this.#fillSnapshot(time);

    this.#drawScene(state.from, this.targetA, state.local[state.from], time, dt);
    const hasIncoming = state.to !== null && state.mix > 0;
    if (hasIncoming) this.#drawScene(state.to, this.targetB, state.local[state.to], time, dt);
    else this.#captureIfDue(state);

    this.composite.render(this.renderer, {
      a: this.targetA.texture,
      b: hasIncoming ? this.targetB.texture : null,
      mix: state.mix,
      mode: state.transition?.type,
      time,
      aspect: this.width / this.height,
      rimColor: this.entries[state.from].instance.exitRimColor,
      target: this.post.input,
    });
    this.post.render(this.renderer, time);
  }

  /** Scenes allowed to hold resources: the active one and its neighbours (closing sequence: see below). */
  #residency(state) {
    if (!this.outro) {
      const keep = new Set(liveWindow(state.active, this.entries.length));
      keep.add(state.from);
      if (state.to !== null) keep.add(state.to);
      return keep;
    }
    // Hold: DNA (on screen), the nucleus (a neighbour, if the reader scrolls
    // back) and one more — a scene being snapshotted, then the skin, which the
    // rewind ends on. Rewind and end: just the two live stages.
    if (this.outro.phase === 'hold') return new Set([NUCLEUS, DNA, this.#missingSnapshot() ?? SKIN]);
    return new Set([DNA, SKIN]);
  }

  /** @param {Set<number>} keep @param {Array<number | null>} visible needed this frame */
  #syncLifecycle(keep, visible, time) {
    this.wanted = keep;
    this.entries.forEach((entry, index) => {
      if (keep.has(index)) {
        entry.outsideSince = null;
        if (entry.instance) return;
        if (visible.includes(index)) {
          // Needed this frame: build now.
          this.#cancelPending(entry);
          this.#create(entry, true);
        } else if (!entry.pending) {
          // A neighbour: building takes up to a few hundred ms, so do it when
          // the main thread is idle rather than in the middle of a scroll frame.
          entry.pending = scheduleIdle(() => {
            entry.pending = null;
            if (!entry.instance && this.wanted.has(index)) this.#create(entry, false);
          });
        }
        return;
      }
      this.#cancelPending(entry);
      if (!entry.instance) return;
      entry.outsideSince ??= time;
      if (time - entry.outsideSince >= DISPOSE_DELAY) this.#release(entry);
    });
  }

  #release(entry) {
    entry.instance.dispose();
    entry.instance = null;
    entry.outsideSince = null;
    entry.compiled = false;
  }

  #cancelPending(entry) {
    if (!entry.pending) return;
    cancelIdle(entry.pending);
    entry.pending = null;
  }

  #create(entry, visibleNow) {
    const instance = entry.definition.create({ quality: this.quality });
    instance.build();
    instance.resize(this.width, this.height);
    entry.instance = instance;
    entry.compiled = visibleNow;

    // Warm shader programs for a neighbour before it is needed. Programs depend
    // on the bound target (tone mapping is off for render targets), so compile
    // against the same kind of target the scene will be drawn into. Compiling
    // runs in parallel (KHR_parallel_shader_compile) and doesn't block a frame.
    if (!visibleNow) {
      const previous = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(this.targetB);
      this.renderer
        .compileAsync(instance.scene, instance.camera)
        .then(() => {
          if (entry.instance === instance) entry.compiled = true;
        })
        .catch((error) => console.warn(`[inward] precompile failed for "${entry.definition.id}"`, error));
      this.renderer.setRenderTarget(previous);
    }
  }

  #drawScene(index, target, progress, time, dt) {
    const instance = this.entries[index].instance;
    const span = this.timeline.spans[index];
    instance.update({ progress, enter: span.enter, exit: span.exit, duration: span.duration, time, dt });
    instance.cull();
    this.renderer.setRenderTarget(target);
    this.renderer.render(instance.scene, instance.camera);
  }

  // ── Snapshots for the closing rewind ──────────────────────────────────────

  #missingSnapshot() {
    return SNAPSHOT_SCENES.find((index) => !this.snapshots.has(index) || this.snapshots.get(index).stale);
  }

  /** On the way in: a scene drawn alone, near the middle of its content, is copied once. */
  #captureIfDue(state) {
    const index = state.from;
    if (this.outro || !SNAPSHOT_SCENES.includes(index)) return;
    const existing = this.snapshots.get(index);
    // Taken already, at this size or larger (a lower render scale at the time makes a softer image: retake it).
    if (existing && !existing.stale && existing.target.width >= this.targetA.width) return;
    if (Math.abs(state.local[index] - this.captureAt[index]) > CAPTURE_WINDOW) return;
    this.#storeSnapshot(index, this.targetA.texture);
  }

  /**
   * During the hold, fill in a snapshot missed on the way in (the page was
   * opened halfway down, or the reader jumped): draw that scene once at the
   * middle of its content. A scene that isn't built yet is built in idle time
   * as the hold's extra scene, drawn once its shaders are ready, and released.
   */
  #fillSnapshot(time) {
    const index = this.#missingSnapshot();
    if (index === undefined) return;
    const entry = this.entries[index];
    if (!entry.instance || !entry.compiled) return;
    this.#drawScene(index, this.targetB, this.captureAt[index], time, 0);
    this.#storeSnapshot(index, this.targetB.texture);
    // The nucleus stays (it neighbours DNA); a scene built only for its snapshot goes again.
    if (index !== NUCLEUS) this.#release(entry);
  }

  #storeSnapshot(index, texture) {
    // Full drawing-buffer size, so the rewind shows them as sharp as the scene itself.
    const w = this.targetA.width;
    const h = this.targetA.height;
    let snapshot = this.snapshots.get(index);
    if (!snapshot) {
      snapshot = { target: new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false }), stale: false };
      this.snapshots.set(index, snapshot);
    }
    snapshot.target.setSize(w, h);
    snapshot.stale = false;
    this.composite.render(this.renderer, { a: texture, time: 0, aspect: this.width / this.height, target: snapshot.target });
  }

  // ── The closing rewind ────────────────────────────────────────────────────

  #renderRewind(time, dt) {
    const reduced = this.quality.reducedMotion;
    const frame = rewindFrame(this.outro.rewind, { reducedMotion: reduced });
    const inner = REWIND_STAGES[frame.inner];
    const outer = frame.outer === null ? null : REWIND_STAGES[frame.outer];
    // For sound and the scale indicator: leaving the inner stage for the outer one.
    const mix = outer === null ? 0 : 1 - frame.innerAlpha;
    this.state = {
      u: NaN,
      from: inner,
      to: outer,
      mix,
      active: outer !== null && mix >= 0.5 ? outer : inner,
      transition: outer === null ? null : { type: 'montage' },
      local: [],
      rewind: true,
    };
    const live = (i) => i === DNA || i === SKIN;
    this.#syncLifecycle(this.#residency(this.state), [live(inner) ? inner : null, live(outer) ? outer : null], time);

    const image = (sceneIndex, target) => {
      if (live(sceneIndex)) {
        this.#drawScene(sceneIndex, target, sceneIndex === DNA ? 1 : frame.skinProgress, time, dt);
        return target.texture;
      }
      const snapshot = this.snapshots.get(sceneIndex);
      return snapshot ? snapshot.target.texture : this.fallbacks.get(sceneIndex);
    };

    const aspect = this.width / this.height;
    if (outer === null) {
      // Only the skin is left, at its natural size.
      this.composite.render(this.renderer, { a: image(inner, this.targetB), time, aspect, target: this.post.input, zoomA: frame.innerZoom });
    } else if (frame.innerAlpha <= 0) {
      this.composite.render(this.renderer, { a: image(outer, this.targetA), time, aspect, target: this.post.input, zoomA: frame.outerZoom });
    } else {
      // Always both while the inner image shrinks: it no longer covers the
      // screen edges, and the outer one shows around it.
      this.composite.render(this.renderer, {
        a: image(outer, this.targetA),
        b: image(inner, this.targetB),
        mix: frame.innerAlpha,
        mode: reduced ? 'crossfade' : 'montage',
        time,
        aspect,
        target: this.post.input,
        zoomA: frame.outerZoom,
        zoomB: frame.innerZoom,
      });
    }
    this.post.render(this.renderer, time);
  }

  dispose() {
    for (const entry of this.entries) {
      this.#cancelPending(entry);
      entry.instance?.dispose();
      entry.instance = null;
    }
    for (const snapshot of this.snapshots.values()) snapshot.target.dispose();
    for (const texture of this.fallbacks.values()) texture.dispose();
    this.targetA.dispose();
    this.targetB.dispose();
    this.composite.dispose();
    this.post.dispose();
  }
}
