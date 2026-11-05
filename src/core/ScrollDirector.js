import Lenis from 'lenis';
import 'lenis/dist/lenis.css';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/**
 * Turns page scroll into a single 0..1 journey progress.
 * Lenis smooths the scroll, ScrollTrigger maps the track to progress, and both
 * run on GSAP's ticker so there is exactly one requestAnimationFrame loop.
 */
export class ScrollDirector {
  /**
   * @param {{ track: HTMLElement, onProgress: (progress: number) => void, reducedMotion?: boolean }} options
   */
  constructor({ track, onProgress, reducedMotion = false }) {
    this.lenis = new Lenis({
      lerp: reducedMotion ? 1 : 0.075,
      smoothWheel: !reducedMotion,
      wheelMultiplier: 0.9,
    });
    this.lenis.on('scroll', ScrollTrigger.update);

    this.tick = (time) => this.lenis.raf(time * 1000);
    gsap.ticker.add(this.tick);
    gsap.ticker.lagSmoothing(0);

    this.trigger = ScrollTrigger.create({
      trigger: track,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => onProgress(self.progress),
      onRefresh: (self) => onProgress(self.progress),
    });
    onProgress(this.trigger.progress);
  }

  refresh() {
    ScrollTrigger.refresh();
  }

  destroy() {
    gsap.ticker.remove(this.tick);
    this.trigger.kill();
    this.lenis.destroy();
  }
}
