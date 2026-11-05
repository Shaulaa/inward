/**
 * Scale indicator: the active scene's name and scale, over a small ladder of
 * all six scales (cm down to nm) so it is clear how deep the journey is.
 * Built from the journey data, so labels and values cannot drift apart.
 * Sits in the bottom-left corner, away from the centre where the main object
 * and every transition opening are.
 */
export class ScaleIndicator {
  /**
   * @param {HTMLElement} parent
   * @param {Array<{ id: string, label: string, scale: string }>} scenes
   */
  constructor(parent, scenes) {
    this.scenes = scenes;
    this.active = -1;

    this.root = document.createElement('aside');
    this.root.className = 'scale';
    this.root.setAttribute('aria-label', 'Skala');

    this.current = document.createElement('p');
    this.current.className = 'scale__current';
    // Announce scene changes to screen readers without interrupting them.
    this.current.setAttribute('aria-live', 'polite');
    this.name = document.createElement('span');
    this.name.className = 'scale__name';
    this.value = document.createElement('span');
    this.value.className = 'scale__value';
    this.current.append(this.name, this.value);

    this.ladder = document.createElement('ol');
    this.ladder.className = 'scale__ladder';
    this.ladder.setAttribute('aria-hidden', 'true');
    this.steps = scenes.map((scene) => {
      const item = document.createElement('li');
      item.className = 'scale__step';
      item.textContent = scene.scale;
      this.ladder.append(item);
      return item;
    });

    this.root.append(this.current, this.ladder);
    parent.append(this.root);
  }

  /** @param {number} activeIndex index of the active scene in the journey */
  update(activeIndex) {
    if (activeIndex === this.active) return;
    const scene = this.scenes[activeIndex];
    if (!scene) return;
    this.active = activeIndex;
    this.name.textContent = scene.label;
    this.value.textContent = scene.scale;
    this.steps.forEach((step, i) => {
      step.classList.toggle('is-active', i === activeIndex);
      step.classList.toggle('is-past', i < activeIndex);
    });
  }
}
