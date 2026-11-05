import { windowOpacity } from '../core/storyline.js';

/**
 * Short texts tied to the scroll: each one fades in and out over its window
 * (in timeline units), so it moves exactly with the scroll and is fully gone
 * before the next transition starts. They sit in a side column (desktop) or
 * a band at the bottom (phone), never over the centre of the frame.
 *
 * @typedef {{ id: string, window: { start: number, end: number }, title: string, text: string,
 *   kicker?: string, variant?: 'statement', action?: { label: string, onClick: () => void } }} CaptionItem
 */
export class Captions {
  /**
   * @param {HTMLElement} parent
   * @param {CaptionItem[]} items
   */
  constructor(parent, items) {
    this.root = document.createElement('div');
    this.root.className = 'captions';

    // One polite announcement per caption, instead of every opacity step.
    this.live = document.createElement('p');
    this.live.className = 'sr-only';
    this.live.setAttribute('aria-live', 'polite');
    this.announced = null;

    this.items = items.map((item) => {
      const element = document.createElement('section');
      element.className = `caption${item.variant ? ` caption--${item.variant}` : ''}`;
      element.setAttribute('aria-label', item.title);
      if (item.kicker) element.append(Object.assign(document.createElement('p'), { className: 'caption__kicker', textContent: item.kicker }));
      element.append(
        Object.assign(document.createElement('h2'), { className: 'caption__title', textContent: item.title }),
        Object.assign(document.createElement('p'), { className: 'caption__text', textContent: item.text }),
      );
      if (item.action) {
        const button = Object.assign(document.createElement('button'), { type: 'button', className: 'caption__action', textContent: item.action.label });
        button.addEventListener('click', item.action.onClick);
        element.append(button);
      }
      this.root.append(element);
      return { ...item, element, opacity: -1 };
    });

    this.root.append(this.live);
    parent.append(this.root);
  }

  /** @param {number} u scroll position in timeline units */
  update(u) {
    let strongest = null;
    for (const item of this.items) {
      const opacity = Math.round(windowOpacity(item.window, u) * 1000) / 1000;
      if (opacity > 0.5 && (!strongest || opacity > strongest.opacity)) strongest = item;
      if (opacity === item.opacity) continue;
      item.opacity = opacity;
      const style = item.element.style;
      style.opacity = String(opacity);
      // A small drift with the fade; invisible ones leave the accessibility tree and stop taking clicks.
      style.transform = `translate3d(0, ${((1 - opacity) * 10).toFixed(2)}px, 0)`;
      style.visibility = opacity > 0.01 ? 'visible' : 'hidden';
    }
    if (strongest && strongest.id !== this.announced) {
      this.announced = strongest.id;
      this.live.textContent = `${strongest.title}. ${strongest.text}`;
    }
  }

  /** Screen rectangles of the texts currently showing (click points keep out of them). */
  visibleRects() {
    return this.items.filter((item) => item.opacity > 0.02).map((item) => item.element.getBoundingClientRect());
  }
}
