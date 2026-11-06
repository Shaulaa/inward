import { FALLBACK, NOTE, OUTRO, SCENES } from '../content/story.js';

/**
 * What the page shows when the 3D journey can't run.
 *
 * - 'unsupported' (no WebGL 2) and 'failed' (the renderer couldn't start):
 *   a short explanation and the whole journey as text — every scene with its
 *   scale and caption, the closing fact and the illustration note — so the
 *   content is still there.
 * - 'contextLost' (the GPU was reset mid-way): a short notice with a reload
 *   button over the frozen frame.
 *
 * All wording comes from src/content/story.js.
 *
 * @param {'unsupported' | 'failed' | 'contextLost'} kind
 */
export function showFallback(kind) {
  const root = document.querySelector('#fallback');
  const message = FALLBACK[kind];
  root.replaceChildren();
  root.className = `fallback fallback--${kind}`;

  const card = el('div', 'fallback__card');
  card.append(el('p', 'fallback__brand', 'Inward'), el('h1', 'fallback__title', message.title), el('p', 'fallback__text', message.text));

  if (kind === 'contextLost') {
    const button = el('button', 'fallback__action', FALLBACK.reload);
    button.type = 'button';
    button.addEventListener('click', () => window.location.reload());
    card.append(button);
  } else {
    document.documentElement.classList.add('no-webgl');
    card.append(el('h2', 'fallback__heading', FALLBACK.journeyHeading));
    const list = el('ol', 'fallback__journey');
    for (const scene of Object.values(SCENES)) {
      const item = el('li', 'fallback__step');
      item.append(
        el('p', 'fallback__scale', `${scene.label} · ${scene.scale}`),
        el('h3', 'fallback__step-title', scene.caption.title),
        el('p', 'fallback__step-text', scene.caption.text),
      );
      list.append(item);
    }
    const outro = el('li', 'fallback__step');
    outro.append(el('p', 'fallback__scale', OUTRO.fact.kicker), el('h3', 'fallback__step-title', OUTRO.fact.title), el('p', 'fallback__step-text', OUTRO.fact.text));
    list.append(outro);
    card.append(list, el('p', 'fallback__note', NOTE));
  }

  root.append(card);
  root.hidden = false;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
