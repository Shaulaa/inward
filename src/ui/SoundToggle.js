import { heartbeat } from '../utils/heartbeat.js';

/** Hover text per state (the accessible name stays "Suara"; aria-pressed carries on / off). */
const TITLE = { on: 'Suara: nyala', off: 'Suara: mati' };

/**
 * The sound on/off button: a speaker icon, struck through while off; while
 * on, three small bars pulse with the same heartbeat the audio plays (the
 * visual clock drives both, so they stay in step). Browsers only allow audio
 * to start from a user gesture, so sound is off until this button is pressed.
 * Under prefers-reduced-motion the bars stand still.
 */
export class SoundToggle {
  /**
   * @param {HTMLButtonElement} button
   * @param {import('../audio/AudioEngine.js').AudioEngine} engine
   * @param {() => number} clock visual time in seconds (keeps the heartbeat in sync)
   */
  constructor(button, engine, clock) {
    this.button = button;
    this.engine = engine;
    this.clock = clock;
    this.on = false;
    this.frame = 0;
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.motionQuery.addEventListener?.('change', () => this.#animate());
    button.hidden = false;
    button.addEventListener('click', () => this.toggle());
    this.#render();
  }

  async toggle() {
    this.on = !this.on;
    this.#render();
    try {
      if (this.on) await this.engine.enable(this.clock());
      else this.engine.disable();
    } catch (error) {
      console.warn('[inward] audio could not start', error);
      this.on = false;
      this.button.disabled = true;
      this.#render();
    }
  }

  #render() {
    this.button.setAttribute('aria-pressed', String(this.on));
    this.button.title = this.on ? TITLE.on : TITLE.off;
    this.#animate();
  }

  /** Pulse the bars while sound is on (and motion is allowed); otherwise hold them still. */
  #animate() {
    cancelAnimationFrame(this.frame);
    const style = this.button.style;
    if (!this.on || this.motionQuery.matches) {
      style.setProperty('--beat', this.on ? '0.6' : '0');
      return;
    }
    const tick = () => {
      style.setProperty('--beat', Math.min(1, heartbeat(this.clock())).toFixed(3));
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }
}
