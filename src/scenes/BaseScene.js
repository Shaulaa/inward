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
    this.onDispose();
    this.built = false;
  }

  /** Override: release anything not attached to the scene graph. */
  onDispose() {}
}
