import * as THREE from 'three';
import { inWindow } from '../core/storyline.js';

/** Hit area of a marker (px): comfortable for touch; the visible dot is smaller. */
const HIT = 44;
/** Seconds a marker stays hidden before it may reappear on another object. */
const REAPPEAR_DELAY = 0.35;
/** The centre of the frame (main object, every transition opening): ellipse semi-axes as fractions of the viewport. */
const KEEP_CLEAR = { x: 0.2, y: 0.24 };
/**
 * Placement limits. A marker is placed with the strict set and kept while it
 * passes the loose one, so it doesn't flicker at the edges of the allowed area.
 * near / far scale the anchor's distance range; clear is the keep-clear
 * ellipse test (1 = on its edge); pad grows overlay rects; spacing is the
 * minimum distance between markers.
 */
const STRICT = { near: 1, far: 1, margin: 40, clear: 1, pad: 10, spacing: 64 };
const LOOSE = { near: 0.8, far: 1.15, margin: 26, clear: 0.85, pad: 2, spacing: 48 };

/**
 * Click points: a few markers per scene, each pinned to a real object (see
 * BaseScene.addAnchor), opening a short fact in a card at the side (desktop)
 * or bottom (phone) of the screen. Markers are buttons: Tab / Enter / Space
 * work, Esc closes the card, and the hit area is touch-sized.
 *
 * Markers only show inside a scene's click-point window (never during a
 * transition or the closing sequence), and never in the centre of the frame
 * or on top of the other overlays.
 */
export class Hotspots {
  /**
   * @param {HTMLElement} parent
   * @param {{
   *   storyline: ReturnType<typeof import('../core/storyline.js').buildStoryline>,
   *   content: typeof import('../content/story.js').SCENES,
   *   ui: typeof import('../content/story.js').UI,
   *   sceneAt: (index: number) => import('../scenes/BaseScene.js').BaseScene | null,
   *   blockers: () => DOMRect[],
   * }} options
   */
  constructor(parent, { storyline, content, ui, sceneAt, blockers }) {
    this.storyline = storyline;
    this.sceneAt = sceneAt;
    this.blockers = blockers;
    this.open = null;
    this.view = new THREE.Vector3();

    this.layer = document.createElement('div');
    this.layer.className = 'hotspots';

    this.markers = [];
    for (const scene of storyline.scenes) {
      const data = content[scene.id];
      for (const spot of data.hotspots) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'hotspot';
        button.setAttribute('aria-label', `${ui.hotspotPrefix} ${spot.label}`);
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', 'fact-card');
        const dot = Object.assign(document.createElement('span'), { className: 'hotspot__dot' });
        const label = Object.assign(document.createElement('span'), { className: 'hotspot__label', textContent: spot.label });
        dot.setAttribute('aria-hidden', 'true');
        label.setAttribute('aria-hidden', 'true');
        button.append(dot, label);
        const marker = { spot, sceneIndex: scene.index, sceneLabel: data.label, sceneScale: data.scale, button, candidate: -1, shown: false, lostAt: -Infinity };
        // detail === 0: activated from the keyboard (Enter / Space), not a pointer.
        button.addEventListener('click', (event) => this.#toggle(marker, event.detail === 0));
        this.layer.append(button);
        this.markers.push(marker);
      }
    }

    this.card = document.createElement('aside');
    this.card.id = 'fact-card';
    this.card.className = 'fact';
    this.card.tabIndex = -1;
    this.card.setAttribute('aria-labelledby', 'fact-title');
    // Scene name (uppercase) and its scale (never uppercased: "µm" would turn into "ΜM").
    this.cardKicker = Object.assign(document.createElement('p'), { className: 'fact__kicker' });
    this.cardScene = Object.assign(document.createElement('span'), { className: 'fact__scene' });
    this.cardScale = Object.assign(document.createElement('span'), { className: 'fact__scale' });
    this.cardKicker.append(this.cardScene, this.cardScale);
    this.cardTitle = Object.assign(document.createElement('h2'), { className: 'fact__title', id: 'fact-title' });
    this.cardText = Object.assign(document.createElement('p'), { className: 'fact__text' });
    const close = Object.assign(document.createElement('button'), { type: 'button', className: 'fact__close' });
    close.setAttribute('aria-label', ui.closeFact);
    close.innerHTML = '<span aria-hidden="true">×</span>';
    close.addEventListener('click', () => this.#close(true));
    this.card.append(this.cardKicker, this.cardTitle, this.cardText, close);

    parent.append(this.layer, this.card);

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.open) return;
      const focus = document.activeElement;
      this.#close(this.card.contains(focus) || focus === this.open.button);
    });
    // A tap or click anywhere else closes the card (a scroll gesture doesn't fire click).
    document.addEventListener('click', (event) => {
      if (!this.open || this.card.contains(event.target) || event.target.closest?.('.hotspot')) return;
      this.#close(false);
    });
  }

  /**
   * @param {{ u: number, state: { active: number, to: number | null }, time: number, width: number, height: number }} frame
   *   u: scroll position (timeline units); state: the SceneManager's state this frame.
   */
  update({ u, state, time, width, height }) {
    const active = this.#activeScene(u, state);
    const scene = active >= 0 ? this.sceneAt(active) : null;
    let rects = null;
    const placed = [];

    for (const marker of this.markers) {
      let point = null;
      if (scene && marker.sceneIndex === active) {
        rects ??= this.blockers();
        point = this.#place(marker, scene, { rects, placed, width, height, time });
      } else if (marker.candidate >= 0) {
        marker.candidate = -1;
        marker.lostAt = time;
      }
      if (point) {
        placed.push(point);
        marker.button.style.transform = `translate3d(${(point.x - HIT / 2).toFixed(1)}px, ${(point.y - HIT / 2).toFixed(1)}px, 0)`;
        // The label reads toward the middle of the screen, so it never runs off an edge.
        marker.button.classList.toggle('is-flipped', point.x > width / 2);
      }
      this.#setShown(marker, Boolean(point));
    }

    // The card belongs to its scene's window: gone before the transition starts.
    if (this.open && this.open.sceneIndex !== active) this.#close(false);
  }

  /** Index of the scene whose click points may show now, or -1. */
  #activeScene(u, state) {
    if (u > this.storyline.journeyEnd || state.to !== null) return -1;
    const scene = this.storyline.scenes[state.active];
    return scene && inWindow(scene.hotspots, u) ? scene.index : -1;
  }

  #place(marker, scene, frame) {
    const anchor = scene.anchorCandidates(marker.spot.id);
    if (!anchor || anchor.points.length === 0) return null;

    // Keep the current object while it stays acceptable.
    if (marker.candidate >= 0 && marker.candidate < anchor.points.length) {
      const point = this.#project(anchor.points[marker.candidate], scene.camera, anchor, marker, frame, LOOSE);
      if (point) return point;
      marker.candidate = -1;
      marker.lostAt = frame.time;
      return null;
    }
    // Let a lost marker fade out before it shows up somewhere else.
    if (frame.time - marker.lostAt < REAPPEAR_DELAY) return null;

    // Prefer an object at a comfortable distance: big enough to read, not filling the lens.
    const ideal = Math.sqrt(Math.max(anchor.near, 0.05) * anchor.far);
    let best = null;
    let bestScore = Infinity;
    anchor.points.forEach((p, i) => {
      const point = this.#project(p, scene.camera, anchor, marker, frame, STRICT);
      if (!point) return;
      const score = Math.abs(Math.log(point.distance / ideal));
      if (score < bestScore) {
        bestScore = score;
        best = point;
        marker.candidate = i;
      }
    });
    return best;
  }

  /** Screen position of `world` if a marker may sit there, else null. */
  #project(world, camera, anchor, marker, { rects, placed, width, height }, limits) {
    const v = this.view.copy(world).applyMatrix4(camera.matrixWorldInverse);
    if (v.z > -camera.near) return null; // behind the lens
    const distance = v.length();
    if (distance < anchor.near * limits.near || distance > anchor.far * limits.far) return null;

    v.applyMatrix4(camera.projectionMatrix);
    const x = ((v.x + 1) / 2) * width;
    const y = ((1 - v.y) / 2) * height;
    const m = limits.margin;
    if (x < m || x > width - m || y < m || y > height - m) return null;

    const ex = (x - width / 2) / (width * KEEP_CLEAR.x);
    const ey = (y - height / 2) / (height * KEEP_CLEAR.y);
    if (ex * ex + ey * ey < limits.clear) return null;

    const r = HIT / 2 + limits.pad;
    const overlaps = (rect) => x + r > rect.left && x - r < rect.right && y + r > rect.top && y - r < rect.bottom;
    if (rects.some(overlaps)) return null;
    // Other markers, and the card (except for the marker it belongs to).
    if (this.open && this.open !== marker && overlaps(this.card.getBoundingClientRect())) return null;
    if (placed.some((p) => Math.hypot(p.x - x, p.y - y) < limits.spacing)) return null;
    return { x, y, distance };
  }

  #setShown(marker, shown) {
    if (shown === marker.shown) return;
    marker.shown = shown;
    marker.button.classList.toggle('is-visible', shown);
  }

  #toggle(marker, fromKeyboard) {
    if (this.open === marker) this.#close(fromKeyboard);
    else this.#openCard(marker, fromKeyboard);
  }

  #openCard(marker, moveFocus) {
    if (this.open) this.#markExpanded(this.open, false);
    this.open = marker;
    this.cardScene.textContent = marker.sceneLabel;
    this.cardScale.textContent = marker.sceneScale;
    this.cardTitle.textContent = marker.spot.title;
    this.cardText.textContent = marker.spot.text;
    this.card.classList.add('is-open');
    document.body.classList.add('has-fact');
    this.#markExpanded(marker, true);
    // Keyboard users land in the card (screen readers read it); Esc brings them back.
    if (moveFocus) this.card.focus({ preventScroll: true });
  }

  #close(restoreFocus) {
    const marker = this.open;
    if (!marker) return;
    this.open = null;
    this.card.classList.remove('is-open');
    document.body.classList.remove('has-fact');
    this.#markExpanded(marker, false);
    if (restoreFocus && marker.shown) marker.button.focus({ preventScroll: true });
  }

  #markExpanded(marker, expanded) {
    marker.button.setAttribute('aria-expanded', String(expanded));
    marker.button.classList.toggle('is-active', expanded);
  }
}
