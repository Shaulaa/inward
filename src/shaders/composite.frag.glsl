// Final pass. Scenes render linear HDR into render targets; this pass blends
// the outgoing (A) and incoming (B) scene, then applies tone mapping and the
// output color space once for the whole frame.
//
// uMode 0: crossfade
// uMode 1: membrane puncture — a hole with an organic, refracting rim opens
//          from the centre of the screen, as if the camera pushes through the
//          surface that fills the end of scene A.
uniform sampler2D tA;
uniform sampler2D tB;
uniform float uMix;
uniform int uMode;
uniform float uTime;
uniform float uAspect;
uniform vec3 uRimColor;

varying vec2 vUv;

void main() {
  vec4 color;

  if (uMix <= 0.0) {
    color = texture2D(tA, vUv);
  } else if (uMode == 0) {
    float t = smoothstep(0.0, 1.0, uMix);
    color = mix(texture2D(tA, vUv), texture2D(tB, vUv), t);
  } else {
    vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
    float r = length(p);
    vec2 dir = p / max(r, 1e-4);

    // Reach the far corner (plus noise margin) by the end of the transition.
    float maxRadius = 0.5 * length(vec2(uAspect, 1.0)) + 0.3;
    float t = smoothstep(0.0, 1.0, uMix);
    float radius = t * maxRadius;

    float n = fbm3(vec3(p * 2.6, uTime * 0.25)) + 0.35 * snoise(vec3(p * 9.0, uTime * 0.6 + 4.0));
    float edge = r + n * 0.16 * (0.4 + t) - radius;

    float hole = 1.0 - smoothstep(-0.015, 0.015, edge);
    float rim = exp(-abs(edge) * 26.0) * step(0.001, uMix);

    // The membrane bends light around the rim: push A outward, pull B inward.
    vec2 warp = dir * rim * 0.035;
    vec4 a = texture2D(tA, vUv + warp * 0.6);
    vec4 b = texture2D(tB, vUv - warp);

    // Before it tears, the surface is stretched thin: brighten A slightly.
    a.rgb *= 1.0 + 0.12 * smoothstep(0.0, 0.25, uMix) * (1.0 - hole);

    color = mix(a, b, hole);
    color.rgb += uRimColor * rim * (1.0 - 0.6 * t);
  }

  gl_FragColor = vec4(color.rgb, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
