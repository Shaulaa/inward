import * as THREE from 'three';

/**
 * Contract for every scene in the journey.
 *
 * Each scene owns its own THREE.Scene, camera and coordinate system; nothing is
 * shared between scenes except the renderer. The SceneManager decides when a
 * scene is built and disposed, so constructors must stay cheap: all GPU
 * resources are created in build() and released in dispose().
 */
export class BaseScene {
  constructor({ quality }) {
    this.quality = quality;
    /** Colour of the glowing rim when a membrane transition leaves this scene. */
    this.exitRimColor = new THREE.Color('#ffffff');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 200);
    this.built = false;
    /** Materials whose `uTime` uniform follows the clock (see animate / tick). */
    this.timed = [];
    /** Click-point anchors (see addAnchor), keyed by the hotspot id in src/content/story.js. */
    this.anchors = new Map();
    /** Per-instance culling for instanced layers (see InstanceCuller), run after every camera move. */
    this.cullers = [];
  }

  /** Follow a render-scale change: point sprites are sized in device pixels. */
  setPixelRatio(pixelRatio) {
    this.scene.traverse((object) => {
      const uniform = object.material?.uniforms?.uPixelRatio;
      if (uniform) uniform.value = pixelRatio;
    });
  }

  /** Register an InstanceCuller; the SceneManager runs it each time this scene is drawn. */
  addCuller(culler) {
    this.cullers.push(culler);
    return culler;
  }

  /** Pack only the visible instances of every culled layer, for this frame's camera. */
  cull() {
    for (const culler of this.cullers) culler.update(this.camera);
  }

  /**
   * Register where a click point may sit: candidate positions on real objects
   * of one kind (every mitochondrion, every hair…), in this scene's world
   * space. The overlay picks one that is on screen and clear of the centre.
   * `points` may be a function returning the array, for anchors that move
   * with the camera. near / far: camera distances (scene units) at which the
   * object reads well — closer it fills the lens, further it is lost in haze.
   *
   * @param {string} name
   * @param {THREE.Vector3[] | (() => THREE.Vector3[])} points
   * @param {{ near?: number, far?: number }} [range]
   */
  addAnchor(name, points, { near = 0, far = Infinity } = {}) {
    this.anchors.set(name, { points, near, far });
  }

  /** Current candidates for a click point, or null if this scene has no such anchor. */
  anchorCandidates(name) {
    const anchor = this.anchors.get(name);
    if (!anchor) return null;
    const points = typeof anchor.points === 'function' ? anchor.points() : anchor.points;
    return { points, near: anchor.near, far: anchor.far };
  }

  /** Register a material whose `uTime` uniform should follow the clock. */
  animate(material) {
    this.timed.push(material);
    return material;
  }

  /** Advance `uTime` on every registered material. */
  tick(time) {
    for (const material of this.timed) material.uniforms.uTime.value = time;
  }

  build() {
    if (this.built) return;
    this.onBuild();
    this.built = true;
  }

  /** Override: create geometry, materials and meshes. */
  onBuild() {}

  /**
   * Override: advance the scene.
   * @param {{ progress: number, enter: number, exit: number, duration: number, time: number, dt: number }} frame
   *   progress: 0..1 across the scene's whole span, including overlaps.
   *   enter / exit: fractions of that span shared with the previous / next scene.
   *   duration: the span's length in timeline units, for choreography that should
   *   last a fixed amount of scrolling regardless of the scene's total length.
   */
  update(frame) {} // eslint-disable-line no-unused-vars

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    if (!this.built) return;
    // Everything the scene put on the GPU goes: geometry, textures, and the
    // materials — which also releases their shader programs once no other
    // live scene shares them (they are compiled again, in parallel, the next
    // time the scene is built as a neighbour).
    const disposeMaterial = (material) => {
      for (const value of Object.values(material)) {
        if (value?.isTexture) value.dispose();
      }
      if (material.uniforms) {
        for (const { value } of Object.values(material.uniforms)) {
          if (value?.isTexture) value.dispose();
        }
      }
      material.dispose();
    };

    this.scene.traverse((object) => {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) object.material.forEach(disposeMaterial);
      else if (object.material) disposeMaterial(object.material);
      object.dispose?.(); // InstancedMesh / lights
    });
    this.scene.clear();
    this.timed = [];
    this.anchors.clear();
    this.cullers = [];
    this.onDispose();
    this.built = false;
  }

  /** Override: release anything not attached to the scene graph. */
  onDispose() {}
}
