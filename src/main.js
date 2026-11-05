import './styles.css';
import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { gsap } from 'gsap';
import { SceneManager } from './core/SceneManager.js';
import { ScrollDirector } from './core/ScrollDirector.js';
import { createQuality } from './core/quality.js';
import { JOURNEY, SCROLL_VH_PER_UNIT } from './core/journey.js';
import { DebugHud } from './ui/DebugHud.js';
import { AudioEngine } from './audio/AudioEngine.js';
import { SoundToggle } from './ui/SoundToggle.js';
import { ScaleIndicator } from './ui/ScaleIndicator.js';
import { Captions } from './ui/Captions.js';
import { Hotspots } from './ui/Hotspots.js';
import { buildStoryline, journeyProgressAt, phaseAt } from './core/storyline.js';
import { NOTE, OUTRO, SCENES, UI } from './content/story.js';
import { smoothstep } from './utils/math.js';

function showFallback(message) {
  const fallback = document.querySelector('#fallback');
  fallback.textContent = message;
  fallback.hidden = false;
  document.documentElement.classList.add('no-webgl');
}

function boot() {
  const canvas = document.querySelector('#webgl');
  const track = document.querySelector('#track');
  const hint = document.querySelector('#scroll-hint');

  if (!WebGL.isWebGL2Available()) {
    showFallback('Browser ini belum mendukung WebGL 2, jadi perjalanan 3D-nya nggak bisa ditampilkan.');
    return;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (error) {
    console.error('[inward] WebGL renderer failed to start', error);
    showFallback('WebGL gagal dijalankan di perangkat ini.');
    return;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.info.autoReset = false;

  const quality = createQuality();
  const manager = new SceneManager({ renderer, journey: JOURNEY, quality });

  // The page scroll is the journey plus the closing sequence after DNA
  // (see storyline.js), plus one viewport for the sticky canvas.
  const storyline = buildStoryline(manager.timeline);
  track.style.height = `${storyline.total * SCROLL_VH_PER_UNIT + 100}vh`;
  /** Scroll position in timeline units. */
  let storyU = 0;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const director = new ScrollDirector({
    track,
    reducedMotion,
    onProgress: (progress) => {
      storyU = progress * storyline.total;
      manager.setProgress(journeyProgressAt(storyline, storyU));
      hint?.classList.toggle('is-hidden', progress > 0.01);
    },
  });

  // Size from the canvas's laid-out box, so the drawing buffer always matches
  // what CSS shows (window.innerWidth would include a scrollbar if one existed).
  const resize = () => {
    manager.setSize(canvas.clientWidth || window.innerWidth, canvas.clientHeight || window.innerHeight, quality.pixelRatio);
  };
  resize();
  new ResizeObserver(resize).observe(canvas);

  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault();
    console.warn('[inward] WebGL context lost');
  });

  const hud = new URLSearchParams(window.location.search).has('debug') ? new DebugHud(document.body, JOURNEY) : null;

  // Sound is opt-in (browsers require a user gesture before audio can play).
  const audio = AudioEngine.isSupported() ? new AudioEngine() : null;
  if (audio) new SoundToggle(document.querySelector('#sound-toggle'), audio, () => gsap.ticker.time);
  document.addEventListener('visibilitychange', () => audio?.setPageVisible(!document.hidden, gsap.ticker.time));
  const spans = manager.timeline.spans;
  const scale = new ScaleIndicator(document.body, JOURNEY.scenes);

  const note = Object.assign(document.createElement('p'), { className: 'note', textContent: NOTE });
  document.body.append(note);

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
  ]);

  // Click points stay clear of every other overlay.
  const fixedOverlays = [document.querySelector('.brand'), note, scale.root, document.querySelector('#sound-toggle')];
  const hotspots = new Hotspots(document.body, {
    storyline,
    content: SCENES,
    ui: UI,
    sceneAt: (index) => manager.sceneAt(index),
    blockers: () => [
      ...fixedOverlays.filter((element) => element && !element.hidden).map((element) => element.getBoundingClientRect()),
      ...(hint && !hint.classList.contains('is-hidden') ? [hint.getBoundingClientRect()] : []),
      ...captions.visibleRects(),
    ],
  });

  // Zoom blur while the closing rewind rushes back to the skin, following its speed.
  let rush = 0;
  let lastJourney = manager.progress;

  // Runs after Lenis on the same GSAP ticker, so progress is fresh each frame.
  gsap.ticker.add((time, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 0.1);
    renderer.info.reset();
    manager.render(time, dt);
    const { from, to, mix } = manager.state;
    audio?.update({ fromId: spans[from].id, toId: to !== null ? spans[to].id : null, mix, time });
    scale.update(manager.state.active);
    captions.update(storyU);
    hotspots.update({ u: storyU, state: manager.state, time, width: canvas.clientWidth || window.innerWidth, height: canvas.clientHeight || window.innerHeight });

    const speed = Math.abs(manager.progress - lastJourney) / Math.max(dt, 1e-3);
    lastJourney = manager.progress;
    const rushTarget = !reducedMotion && phaseAt(storyline, storyU) === 'rewind' ? smoothstep(0.1, 1.2, speed) : 0;
    rush += (rushTarget - rush) * Math.min(1, dt * 8);
    manager.setRush(rush < 0.002 ? 0 : rush);
    hud?.update(dt, manager, renderer);
  });

  // Exposed for manual inspection in dev tools only.
  if (import.meta.env.DEV) window.__inward = { manager, director, renderer, audio, storyline, hotspots };
}

boot();
