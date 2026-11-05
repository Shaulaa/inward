import { DUB_PHASE, HEART_BPM, heartPhase } from '../utils/heartbeat.js';
import { blendMix } from './soundscape.js';

const BEAT_PERIOD = 60 / HEART_BPM;
/** How far ahead (s) beats are scheduled on the audio clock. */
const LOOKAHEAD = 0.25;
/** Smoothing time constant (s) for level changes as the journey moves. */
const LEVEL_SMOOTHING = 0.35;
const MASTER_LEVEL = 0.8;

/**
 * Procedural soundscape (Web Audio, no audio files): a heartbeat in sync with
 * the vessel's visual pulse, plus ambient layers whose levels follow the
 * journey. Audio can only start from a user gesture, so it is created lazily
 * in enable() (called from the sound toggle).
 */
export class AudioEngine {
  static isSupported() {
    return typeof window !== 'undefined' && typeof (window.AudioContext ?? window.webkitAudioContext) === 'function';
  }

  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.nextBeat = 0;
    this.heartLevel = 0;
    this.suspendTimer = null;
  }

  /** Must be called from a user gesture (click / key press). */
  async enable(visualTime) {
    if (!this.ctx) this.#init();
    clearTimeout(this.suspendTimer);
    await this.ctx.resume();
    this.enabled = true;
    this.#alignBeats(visualTime);
    this.#ramp(this.master.gain, MASTER_LEVEL, 0.6);
  }

  disable() {
    if (!this.ctx) return;
    this.enabled = false;
    this.#ramp(this.master.gain, 0, 0.4);
    // Stop the audio thread once faded out.
    clearTimeout(this.suspendTimer);
    this.suspendTimer = setTimeout(() => this.ctx.suspend(), 600);
  }

  /** Pause/resume with page visibility so nothing plays in a background tab. */
  setPageVisible(visible, visualTime) {
    if (!this.ctx || !this.enabled) return;
    if (visible) {
      this.ctx.resume().then(() => this.#alignBeats(visualTime));
    } else {
      this.ctx.suspend();
    }
  }

  /**
   * Per frame: follow the journey's mix and keep beats scheduled ahead.
   * @param {{ fromId: string, toId: string | null, mix: number, time: number }} state
   */
  update({ fromId, toId, mix, time }) {
    if (!this.ctx || !this.enabled || this.ctx.state !== 'running') return;
    const levels = blendMix(fromId, toId, mix);
    const now = this.ctx.currentTime;
    this.heartLevel = levels.heart;
    this.heartFilter.frequency.setTargetAtTime(levels.heartTone, now, LEVEL_SMOOTHING);
    this.flowLevel.gain.setTargetAtTime(levels.flow, now, LEVEL_SMOOTHING);
    this.air.gain.setTargetAtTime(levels.air * 0.25, now, LEVEL_SMOOTHING);
    this.drone.gain.setTargetAtTime(levels.drone * 0.5, now, LEVEL_SMOOTHING);
    this.shimmer.gain.setTargetAtTime(levels.shimmer * 0.12, now, LEVEL_SMOOTHING);

    // If the main thread stalled, skip missed beats instead of firing a burst.
    if (this.nextBeat < now) this.#alignBeats(time);
    while (this.nextBeat < now + LOOKAHEAD) {
      this.#scheduleBeat(this.nextBeat);
      this.nextBeat += BEAT_PERIOD;
    }
  }

  /** Next "lub" on the audio clock, in phase with the visual heartbeat. */
  #alignBeats(visualTime) {
    const phase = heartPhase(visualTime);
    this.nextBeat = this.ctx.currentTime + (1 - phase) * BEAT_PERIOD;
  }

  #ramp(param, value, seconds) {
    const now = this.ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + seconds);
  }

  #init() {
    const Context = window.AudioContext ?? window.webkitAudioContext;
    const ctx = new Context();
    this.ctx = ctx;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.ratio.value = 3;
    compressor.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(compressor);

    // Two seconds of white noise, generated here (no files), looped by every noise layer.
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.noise = noise;
    const noiseSource = () => {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      source.start();
      return source;
    };

    // Heartbeat bus: muffled by a low-pass that closes as the journey goes deeper.
    this.heartFilter = ctx.createBiquadFilter();
    this.heartFilter.type = 'lowpass';
    this.heartFilter.frequency.value = 300;
    this.heartFilter.connect(this.master);

    // Blood flow: band-passed noise; `flowPulse` swells after each beat, `flowLevel` follows the scene.
    const flowFilter = ctx.createBiquadFilter();
    flowFilter.type = 'bandpass';
    flowFilter.frequency.value = 420;
    flowFilter.Q.value = 0.7;
    this.flowPulse = ctx.createGain();
    this.flowPulse.gain.value = 0.35;
    this.flowLevel = ctx.createGain();
    this.flowLevel.gain.value = 0;
    noiseSource().connect(flowFilter).connect(this.flowPulse).connect(this.flowLevel).connect(this.master);

    // Air at the skin surface.
    const airFilter = ctx.createBiquadFilter();
    airFilter.type = 'highpass';
    airFilter.frequency.value = 2500;
    this.air = ctx.createGain();
    this.air.gain.value = 0;
    noiseSource().connect(airFilter).connect(this.air).connect(this.master);

    // Low drone: two slightly detuned tones through a slowly breathing low-pass.
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 260;
    const droneLfo = ctx.createOscillator();
    const droneDepth = ctx.createGain();
    droneLfo.frequency.value = 0.07;
    droneDepth.gain.value = 90;
    droneLfo.connect(droneDepth).connect(droneFilter.frequency);
    droneLfo.start();
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    for (const [frequency, type] of [[55, 'sawtooth'], [82.6, 'triangle']]) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = frequency;
      osc.detune.value = type === 'sawtooth' ? -6 : 5;
      osc.connect(droneFilter);
      osc.start();
    }
    droneFilter.connect(this.drone).connect(this.master);

    // Shimmer: soft high tones with a slow tremolo.
    const tremolo = ctx.createGain();
    tremolo.gain.value = 0.6;
    const tremoloLfo = ctx.createOscillator();
    const tremoloDepth = ctx.createGain();
    tremoloLfo.frequency.value = 0.23;
    tremoloDepth.gain.value = 0.4;
    tremoloLfo.connect(tremoloDepth).connect(tremolo.gain);
    tremoloLfo.start();
    this.shimmer = ctx.createGain();
    this.shimmer.gain.value = 0;
    for (const frequency of [660, 990, 1320]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      osc.connect(tremolo);
      osc.start();
    }
    tremolo.connect(this.shimmer).connect(this.master);
  }

  /** "Lub" at `when`, softer "dub" DUB_PHASE of a period later, and a swell in the flow. */
  #scheduleBeat(when) {
    const level = this.heartLevel;
    if (level > 0.005) {
      this.#thump(when, 58, 36, level);
      this.#thump(when + DUB_PHASE * BEAT_PERIOD, 70, 44, level * 0.6);
    }
    const pulse = this.flowPulse.gain;
    pulse.setTargetAtTime(1, when + 0.02, 0.05);
    pulse.setTargetAtTime(0.35, when + 0.18, 0.25);
  }

  #thump(when, startHz, endHz, level) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startHz, when);
    osc.frequency.exponentialRampToValueAtTime(endHz, when + 0.12);
    const body = ctx.createGain();
    body.gain.setValueAtTime(0.0001, when);
    body.gain.exponentialRampToValueAtTime(level, when + 0.008);
    body.gain.exponentialRampToValueAtTime(0.0001, when + 0.28);
    osc.connect(body).connect(this.heartFilter);
    osc.start(when);
    osc.stop(when + 0.3);

    // A short noise burst gives the thump its soft, fleshy attack.
    const click = ctx.createBufferSource();
    click.buffer = this.noise;
    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = 140;
    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.0001, when);
    clickGain.gain.exponentialRampToValueAtTime(level * 0.5, when + 0.005);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, when + 0.07);
    click.connect(clickFilter).connect(clickGain).connect(this.heartFilter);
    click.start(when, Math.random() * 1.5);
    click.stop(when + 0.08);
  }
}
