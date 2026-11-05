import * as THREE from 'three';
import noise from '../shaders/noise.glsl?raw';
import fragmentShader from '../shaders/composite.frag.glsl?raw';

const MODES = { crossfade: 0, membrane: 1 };

/** Full-screen pass that blends two scene render targets and outputs to the canvas. */
export class CompositePass {
  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        tA: { value: null },
        tB: { value: null },
        uMix: { value: 0 },
        uMode: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uRimColor: { value: new THREE.Color('#ff9a8c') },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: `${noise}\n${fragmentShader}`,
      depthTest: false,
      depthWrite: false,
    });

    // One oversized triangle covers the screen without a diagonal seam.
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.mesh = new THREE.Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
  }

  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {{ a: THREE.Texture, b?: THREE.Texture | null, mix?: number, mode?: string, time: number, aspect: number, rimColor?: THREE.Color }} input
   */
  render(renderer, { a, b = null, mix = 0, mode = 'crossfade', time, aspect, rimColor }) {
    const u = this.material.uniforms;
    u.tA.value = a;
    u.tB.value = b ?? a;
    u.uMix.value = b ? mix : 0;
    u.uMode.value = MODES[mode] ?? 0;
    u.uTime.value = time;
    u.uAspect.value = aspect;
    if (rimColor) u.uRimColor.value.copy(rimColor);

    renderer.setRenderTarget(null);
    renderer.render(this.mesh, this.camera);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
