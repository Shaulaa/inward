import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

/** Keeps what is brighter than the threshold, with a soft knee (no hard cut-off). */
const brightFragment = /* glsl */ `
  uniform sampler2D tInput;
  uniform float uThreshold;
  uniform float uKnee;
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tInput, vUv).rgb;
    float brightness = max(c.r, max(c.g, c.b));
    float soft = clamp(brightness - uThreshold + uKnee, 0.0, 2.0 * uKnee);
    soft = soft * soft / (4.0 * uKnee + 1e-5);
    float contribution = max(soft, brightness - uThreshold) / max(brightness, 1e-5);
    gl_FragColor = vec4(c * contribution, 1.0);
  }
`;

/** 9-tap separable Gaussian, using bilinear taps. */
const blurFragment = /* glsl */ `
  uniform sampler2D tInput;
  uniform vec2 uDirection; // texel step along the blur axis
  varying vec2 vUv;
  void main() {
    vec3 c = texture2D(tInput, vUv).rgb * 0.2270270270;
    c += texture2D(tInput, vUv + uDirection * 1.3846153846).rgb * 0.3162162162;
    c += texture2D(tInput, vUv - uDirection * 1.3846153846).rgb * 0.3162162162;
    c += texture2D(tInput, vUv + uDirection * 3.2307692308).rgb * 0.0702702703;
    c += texture2D(tInput, vUv - uDirection * 3.2307692308).rgb * 0.0702702703;
    gl_FragColor = vec4(c, 1.0);
  }
`;

/**
 * Final image: scene + bloom, a soft vignette, tone mapping and output colour
 * space, then a fine animated grain (added after tone mapping so it is even
 * across darks and lights). During the closing rewind, `uRush` smears the
 * scene toward the centre (a zoom blur) so the fast pull-back reads as speed.
 */
const finalFragment = /* glsl */ `
  uniform sampler2D tInput;
  uniform sampler2D tBloomNear;
  uniform sampler2D tBloomWide;
  uniform float uBloom;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uTime;
  uniform float uAspect;
  uniform float uRush;
  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
    vec3 c;
    if (uRush > 0.001) {
      // Zoom blur: average along the line to the centre, nearer taps weighted more.
      vec2 toCenter = (vec2(0.5) - vUv) * uRush * 0.14;
      vec3 sum = vec3(0.0);
      float weight = 0.0;
      for (int i = 0; i < 10; i++) {
        float t = float(i) / 9.0;
        float w = 1.0 - 0.6 * t;
        sum += texture2D(tInput, vUv + toCenter * t).rgb * w;
        weight += w;
      }
      c = sum / weight;
    } else {
      c = texture2D(tInput, vUv).rgb;
    }
    c += uBloom * (texture2D(tBloomNear, vUv).rgb * 0.6 + texture2D(tBloomWide, vUv).rgb * 0.9);

    vec2 q = (vUv - 0.5) * vec2(min(uAspect, 2.0), 1.0);
    c *= 1.0 - uVignette * smoothstep(0.35, 1.0, length(q));

    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>

    float n = hash(vUv * vec2(1931.0, 1217.0) + fract(uTime * 13.7)) - 0.5;
    gl_FragColor.rgb += n * uGrain;
  }
`;

/**
 * Post-processing for the final frame. The CompositePass draws the (possibly
 * blended) scenes into `input` as linear HDR; this pass adds bloom, vignette,
 * grain, and tone-maps to the canvas.
 */
export class PostPass {
  constructor({ bloom = 0.35, threshold = 0.75, knee = 0.4, vignette = 0.28, grain = 0.018 } = {}) {
    const hdr = { type: THREE.HalfFloatType, depthBuffer: false };
    this.input = new THREE.WebGLRenderTarget(1, 1, hdr);
    this.near = [new THREE.WebGLRenderTarget(1, 1, hdr), new THREE.WebGLRenderTarget(1, 1, hdr)];
    this.wide = [new THREE.WebGLRenderTarget(1, 1, hdr), new THREE.WebGLRenderTarget(1, 1, hdr)];

    const make = (fragmentShader, uniforms, toneMapped = false) =>
      new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, depthTest: false, depthWrite: false, toneMapped });
    this.bright = make(brightFragment, { tInput: { value: null }, uThreshold: { value: threshold }, uKnee: { value: knee } });
    this.blur = make(blurFragment, { tInput: { value: null }, uDirection: { value: new THREE.Vector2() } });
    this.final = make(
      finalFragment,
      {
        tInput: { value: this.input.texture },
        tBloomNear: { value: this.near[0].texture },
        tBloomWide: { value: this.wide[0].texture },
        uBloom: { value: bloom },
        uVignette: { value: vignette },
        uGrain: { value: grain },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uRush: { value: 0 },
      },
      true,
    );

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
    this.quad = new THREE.Mesh(geometry, this.final);
    this.quad.frustumCulled = false;
  }

  setSize(width, height) {
    this.input.setSize(width, height);
    const hw = Math.max(1, Math.ceil(width / 2));
    const hh = Math.max(1, Math.ceil(height / 2));
    const qw = Math.max(1, Math.ceil(width / 4));
    const qh = Math.max(1, Math.ceil(height / 4));
    this.near.forEach((t) => t.setSize(hw, hh));
    this.wide.forEach((t) => t.setSize(qw, qh));
    this.final.uniforms.uAspect.value = width / height;
  }

  /** Zoom-blur strength, 0 (off) to 1. */
  setRush(amount) {
    this.final.uniforms.uRush.value = Math.min(1, Math.max(0, amount));
  }

  #pass(renderer, material, target) {
    this.quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.quad, this.camera);
  }

  #blurInto(renderer, [a, b]) {
    const u = this.blur.uniforms;
    u.tInput.value = a.texture;
    u.uDirection.value.set(1 / a.width, 0);
    this.#pass(renderer, this.blur, b);
    u.tInput.value = b.texture;
    u.uDirection.value.set(0, 1 / b.height);
    this.#pass(renderer, this.blur, a);
  }

  render(renderer, time) {
    // Near bloom at half resolution.
    this.bright.uniforms.tInput.value = this.input.texture;
    this.#pass(renderer, this.bright, this.near[0]);
    this.#blurInto(renderer, this.near);
    // Wide bloom: the blurred near bloom, downsampled and blurred again.
    this.blur.uniforms.tInput.value = this.near[0].texture;
    this.blur.uniforms.uDirection.value.set(0, 0);
    this.#pass(renderer, this.blur, this.wide[0]);
    this.#blurInto(renderer, this.wide);

    this.final.uniforms.uTime.value = time;
    this.#pass(renderer, this.final, null);
  }

  dispose() {
    [this.input, ...this.near, ...this.wide].forEach((t) => t.dispose());
    [this.bright, this.blur, this.final].forEach((m) => m.dispose());
    this.quad.geometry.dispose();
  }
}
