import * as THREE from 'three';
import { CompositePass } from './CompositePass.js';
import { buildTimeline, liveWindow, sampleTimeline } from './timeline.js';

/** Seconds a scene stays built after leaving the live window, so scrolling back and forth at a boundary doesn't rebuild it every frame. */
const DISPOSE_DELAY = 1.5;

/**
 * Owns the scene lifecycle and the per-frame render:
 * - only the active scene and its neighbours hold GPU resources (others are disposed),
 * - only the one or two scenes visible on the timeline are updated and drawn,
 * - visible scenes render into HDR targets and are blended by the CompositePass.
 */
export class SceneManager {
  /**
   * @param {{ renderer: THREE.WebGLRenderer, journey: { scenes: Array<{ id: string, duration: number, create: (ctx: object) => import('../scenes/BaseScene.js').BaseScene }>, transitions: Array<{ type: string, duration: number }> }, quality: object }} options
   */
  constructor({ renderer, journey, quality }) {
    this.renderer = renderer;
    this.quality = quality;
    this.timeline = buildTimeline(journey.scenes, journey.transitions);
    this.entries = journey.scenes.map((definition) => ({ definition, instance: null, outsideSince: null }));
    this.progress = 0;
    this.width = 1;
    this.height = 1;
    this.state = sampleTimeline(this.timeline, 0);

    const targetOptions = { type: THREE.HalfFloatType, samples: quality.msaaSamples, depthBuffer: true };
    this.targetA = new THREE.WebGLRenderTarget(1, 1, targetOptions);
    this.targetB = new THREE.WebGLRenderTarget(1, 1, targetOptions);
    this.composite = new CompositePass();
  }

  setProgress(progress) {
    this.progress = progress;
  }

  setSize(width, height, pixelRatio) {
    this.width = width;
    this.height = height;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    const w = Math.max(1, Math.floor(width * pixelRatio));
    const h = Math.max(1, Math.floor(height * pixelRatio));
    this.targetA.setSize(w, h);
    this.targetB.setSize(w, h);
    for (const entry of this.entries) entry.instance?.resize(width, height);
  }

  /** Scene ids currently holding GPU resources (for debugging). */
  get liveIds() {
    return this.entries.filter((e) => e.instance).map((e) => e.definition.id);
  }

  render(time, dt) {
    const state = sampleTimeline(this.timeline, this.progress);
    this.state = state;
    this.#syncLifecycle(state, time);

    this.#drawScene(state.from, this.targetA, state, time, dt);
    const hasIncoming = state.to !== null && state.mix > 0;
    if (hasIncoming) this.#drawScene(state.to, this.targetB, state, time, dt);

    const outgoing = this.entries[state.from].instance;
    this.composite.render(this.renderer, {
      a: this.targetA.texture,
      b: hasIncoming ? this.targetB.texture : null,
      mix: state.mix,
      mode: state.transition?.type,
      time,
      aspect: this.width / this.height,
      rimColor: outgoing.exitRimColor,
    });
  }

  #syncLifecycle(state, time) {
    const keep = new Set(liveWindow(state.active, this.entries.length));
    // Visible scenes are always neighbours of the active one, but be explicit.
    keep.add(state.from);
    if (state.to !== null) keep.add(state.to);

    this.entries.forEach((entry, index) => {
      if (keep.has(index)) {
        entry.outsideSince = null;
        if (!entry.instance) this.#create(entry, index === state.from || index === state.to);
        return;
      }
      if (!entry.instance) return;
      entry.outsideSince ??= time;
      if (time - entry.outsideSince >= DISPOSE_DELAY) {
        entry.instance.dispose();
        entry.instance = null;
        entry.outsideSince = null;
      }
    });
  }

  #create(entry, visibleNow) {
    const instance = entry.definition.create({ quality: this.quality });
    instance.build();
    instance.resize(this.width, this.height);
    entry.instance = instance;

    // Warm shader programs for a neighbour before it is needed. Programs depend
    // on the bound target (tone mapping is off for render targets), so compile
    // against the same kind of target the scene will be drawn into.
    if (!visibleNow) {
      const previous = this.renderer.getRenderTarget();
      this.renderer.setRenderTarget(this.targetB);
      this.renderer.compileAsync(instance.scene, instance.camera).catch((error) => {
        console.warn(`[inward] precompile failed for "${entry.definition.id}"`, error);
      });
      this.renderer.setRenderTarget(previous);
    }
  }

  #drawScene(index, target, state, time, dt) {
    const instance = this.entries[index].instance;
    const span = this.timeline.spans[index];
    instance.update({ progress: state.local[index], enter: span.enter, exit: span.exit, time, dt });
    this.renderer.setRenderTarget(target);
    this.renderer.render(instance.scene, instance.camera);
  }

  dispose() {
    for (const entry of this.entries) {
      entry.instance?.dispose();
      entry.instance = null;
    }
    this.targetA.dispose();
    this.targetB.dispose();
    this.composite.dispose();
  }
}
