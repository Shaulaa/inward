import './styles.css';
import * as THREE from 'three';
import WebGL from 'three/addons/capabilities/WebGL.js';
import { gsap } from 'gsap';
import { SceneManager } from './core/SceneManager.js';
import { ScrollDirector } from './core/ScrollDirector.js';
import { createQuality } from './core/quality.js';
import { JOURNEY, SCROLL_VH_PER_UNIT } from './core/journey.js';
import { DebugHud } from './ui/DebugHud.js';

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

  // Scroll length follows the timeline, plus one viewport for the sticky canvas.
  track.style.height = `${manager.timeline.total * SCROLL_VH_PER_UNIT + 100}vh`;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const director = new ScrollDirector({
    track,
    reducedMotion,
    onProgress: (progress) => {
      manager.setProgress(progress);
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

  // Runs after Lenis on the same GSAP ticker, so progress is fresh each frame.
  gsap.ticker.add((time, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 0.1);
    renderer.info.reset();
    manager.render(time, dt);
    hud?.update(dt, manager, renderer);
  });

  // Exposed for manual inspection in dev tools only.
  if (import.meta.env.DEV) window.__inward = { manager, director, renderer };
}

boot();
