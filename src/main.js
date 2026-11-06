import './styles.css';
import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { gsap } from 'gsap';
import { SceneManager } from './core/SceneManager.js';
import { ScrollDirector } from './core/ScrollDirector.js';
import { createQuality, detectTier } from './core/quality.js';
import { ResolutionGovernor } from './core/resolution.js';
import { JOURNEY, SCROLL_VH_PER_UNIT } from './core/journey.js';
import { DebugHud } from './ui/DebugHud.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { SoundToggle } from './ui/SoundToggle.js';
import { ScaleIndicator } from './ui/ScaleIndicator.js';
import { showFallback } from './ui/Fallback.js';
import { Captions } from './ui/Captions.js';
import { Hotspots } from './ui/Hotspots.js';
import { buildStoryline, journeyProgressAt, phaseAt, rewindAt } from './core/storyline.js';
import { NOTE, OUTRO, SCENES, UI } from './content/story.js';
import { smoothstep } from './utils/math.js';

/** Seconds the illustration note stays up after the page opens. */
const NOTE_SECONDS = 7;

function boot() {
  const canvas = document.querySelector('#webgl');
  const track = document.querySelector('#track');
  const hint = document.querySelector('#scroll-hint');

  if (!WebGL.isWebGL2Available()) {
    showFallback('unsupported');
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (error) {
    console.error('[inward] WebGL renderer failed to start', error);
    showFallback('failed');
    return;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.info.autoReset = false;

  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const quality = createQuality(detectTier(), { reducedMotion: motionQuery.matches });
  // The active preset, for styling and for checking which one a device got.
  document.documentElement.dataset.quality = quality.tier;
  const manager = new SceneManager({ renderer, journey: JOURNEY, quality });

  // The page scroll is the journey plus the closing sequence after DNA
  // (see storyline.js), plus one viewport for the sticky canvas.
  const storyline = buildStoryline(manager.timeline);
  track.style.height = `${storyline.total * SCROLL_VH_PER_UNIT + 100}vh`;
  /** Scroll position in timeline units. */
  let storyU = 0;

  /** @type {ResolutionGovernor | null} Set up below, once the canvas size is known. */
  let governor = null;
  const director = new ScrollDirector({
    track,
    reducedMotion: quality.reducedMotion,
    onProgress: (progress) => {
      storyU = progress * storyline.total;
      manager.setProgress(journeyProgressAt(storyline, storyU));
      const phase = phaseAt(storyline, storyU);
      manager.setOutro(phase === 'journey' ? null : { phase, rewind: rewindAt(storyline, storyU) });
      // No resolution changes during the rewind: a resize there would show as a hitch.
      if (governor) governor.paused = phase === 'rewind';
      hint?.classList.toggle('is-hidden', progress > 0.01);
    },
  });

  // prefers-reduced-motion, followed live if the reader changes it: no scroll
  // smoothing, no zoom blur, gentle crossfades instead of the rushing rewind,
  // slow ambient motion, and no drifting or pulsing overlays (styles.css).
  motionQuery.addEventListener?.('change', (event) => {
    quality.reducedMotion = event.matches;
    quality.motion = event.matches ? 0.3 : 1;
    director.setReducedMotion(event.matches);
  });

  // Size from the canvas's laid-out box, so the drawing buffer always matches
  // what CSS shows (window.innerWidth would include a scrollbar if one existed).
  // Render scale: the preset's pixel ratio (the device's, capped). The
  // governor lowers it in steps while the frame rate is low — to 1× CSS at
  // most, below that only when frames are really slow — and raises it again
  // once it has recovered (see resolution.js). ?scale=fixed keeps it constant.
  governor = new URLSearchParams(window.location.search).get('scale') === 'fixed' ? null : new ResolutionGovernor({ max: quality.pixelRatio });
  const resize = () => {
    manager.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, quality.pixelRatio);
    document.documentElement.dataset.renderScale = quality.pixelRatio.toFixed(2);
  };
  resize();
  new ResizeObserver(resize).observe(canvas);

  // The GPU was reset (driver update, out of memory): say so and offer a reload.
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    showFallback('contextLost');
  });

  const hud = new URLSearchParams(window.location.search).has('debug') ? new DebugHud(document.body, JOURNEY) : null;

  // Sound is opt-in (browsers require a user gesture before audio can play).
  const audio = AudioEngine.isSupported() ? new AudioEngine() : null;
  if (audio) new SoundToggle(document.querySelector('#sound-toggle'), audio, () => gsap.ticker.time);
  document.addEventListener('visibilitychange', () => {
    audio?.setPageVisible(!document.hidden, gsap.ticker.time);
    // A background tab's slow (throttled) frames say nothing about the device.
    governor?.reset();
  });
  const spans = manager.timeline.spans;
  const scale = new ScaleIndicator(document.body, JOURNEY.scenes);

  // The illustration note is read at the start, fades after a few seconds,
  // and comes back with the closing text at the very end.
  const note = Object.assign(document.createElement('p'), { className: 'note', textContent: NOTE });
  document.body.append(note);
  let noteExpired = false;
  setTimeout(() => {
    noteExpired = true;
  }, NOTE_SECONDS * 1000);

  const captions = new Captions(document.body, [
    ...storyline.scenes.map((scene) => ({ id: scene.id, window: scene.caption, ...SCENES[scene.id].caption })),
    { id: 'outro-fact', window: storyline.outro.fact, variant: 'statement', ...OUTRO.fact },
    {
      id: 'outro-closing',
      window: storyline.outro.closing,
      ...OUTRO.closing,
      action: {
        label: OUTRO.replay,
        onClick: () => {
          director.restart();
          // The button is gone at the top; start keyboard focus from the page again.
          document.activeElement?.blur();
        },
      },
    },
  ], { reducedMotion: () => quality.reducedMotion });

  // Click points stay clear of every other overlay.
  const fixedOverlays = [document.querySelector('.brand'), note, scale.root, document.querySelector('#sound-toggle')];
  const hotspots = new Hotspots(document.body, {
    storyline,
    content: SCENES,
    ui: UI,
    sceneAt: (index) => manager.sceneAt(index),
    blockers: () => [
      ...fixedOverlays
        .filter((element) => element && !element.hidden && !element.classList.contains('is-faded'))
        .map((element) => element.getBoundingClientRect()),
      ...(hint && !hint.classList.contains('is-hidden') ? [hint.getBoundingClientRect()] : []),
      ...captions.visibleRects(),
    ],
  });

  // Zoom blur while the closing rewind rushes back to the skin, following its speed.
  let rush = 0;
  let lastRewind = 0;
  // Ambient (time-driven) motion runs on its own clock, slowed under reduced motion.
  let sceneTime = 0;

  // Runs after Lenis on the same GSAP ticker, so progress is fresh each frame.
  gsap.ticker.add((time, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 0.1);
    const renderScale = document.hidden ? null : governor?.update(deltaMs / 1000);
    if (renderScale) {
      quality.pixelRatio = renderScale;
      resize();
    }
    renderer.info.reset();
    // Full motion uses the real clock (the vessel's heartbeat stays in step
    // with the audio); reduced motion a slowed one (its pulse is off anyway).
    sceneTime = quality.motion === 1 ? time : sceneTime + dt * quality.motion;
    manager.render(sceneTime, dt * quality.motion);
    const { from, to, mix } = manager.state;
    audio?.update({ fromId: spans[from].id, toId: to !== null ? spans[to].id : null, mix, time });
    scale.update(manager.state.active);
    captions.update(storyU);
    note.classList.toggle('is-faded', noteExpired && storyU < storyline.outro.closing.start);
    hotspots.update({ u: storyU, state: manager.state, time, width: canvas.clientWidth || window.innerWidth, height: canvas.clientHeight || window.innerHeight });

    const rewind = rewindAt(storyline, storyU);
    const speed = rewind === null ? 0 : Math.abs(rewind - lastRewind) / Math.max(dt, 1e-3);
    lastRewind = rewind ?? lastRewind;
    const rushTarget = !quality.reducedMotion && rewind !== null ? smoothstep(0.1, 1.2, speed) : 0;
    rush += (rushTarget - rush) * Math.min(1, dt * 8);
    manager.setRush(rush < 0.002 ? 0 : rush);
    hud?.update(dt, manager, renderer);
  });

  // Exposed for manual inspection in dev tools only.
  if (import.meta.env.DEV) window.__inward = { manager, director, renderer, audio, storyline, hotspots, quality };
}

boot();
