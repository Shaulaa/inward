/**
 * Developer overlay (enable with ?debug). Shows which scenes are live, the
 * transition mix and render cost, which is what this prototype needs to verify.
 */
export class DebugHud {
  constructor(parent, journey) {
    this.journey = journey;
    this.element = document.createElement('pre');
    this.element.className = 'debug-hud';
    this.element.setAttribute('aria-hidden', 'true');
    parent.appendChild(this.element);
    this.frames = 0;
    this.elapsed = 0;
    this.fps = 0;
  }

  update(dt, manager, renderer) {
    this.frames++;
    this.elapsed += dt;
    if (this.elapsed < 0.25) return;
    this.fps = Math.round(this.frames / this.elapsed);
    this.frames = 0;
    this.elapsed = 0;

    const { state } = manager;
    const scenes = this.journey.scenes;
    const name = (i) => (i === null ? '-' : `${scenes[i].id}`);
    const local = (i) => (i === null ? '' : ` ${(state.local[i] * 100).toFixed(1)}%`);

    this.element.textContent = [
      `fps        ${this.fps}`,
      `progress   ${((manager.progress ?? 0) * 100).toFixed(1)}%`,
      `scroll     ${Math.round(window.scrollY)}px (${((window.scrollY / window.innerHeight) * 100).toFixed(0)}vh)`,
      `from       ${name(state.from)}${local(state.from)}`,
      `to         ${name(state.to)}${local(state.to)}`,
      `mix        ${state.mix.toFixed(3)} ${state.transition?.type ?? ''}`,
      `active     ${name(state.active)} (${scenes[state.active].scale})`,
      `live       ${manager.liveIds.join(', ')}`,
      `draw calls ${renderer.info.render.calls}`,
      `triangles  ${renderer.info.render.triangles.toLocaleString()}`,
    ].join('\n');
  }
}
