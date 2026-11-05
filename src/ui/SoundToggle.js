/**
 * The sound on/off button. Browsers only allow audio to start from a user
 * gesture, so sound is off until this button is pressed.
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
    this.label = button.querySelector('.sound-toggle__label');
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
    this.label.textContent = this.on ? 'Suara: nyala' : 'Suara: mati';
  }
}
