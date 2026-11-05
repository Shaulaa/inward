// Generic translucent-looking organelle (ER, Golgi).
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uRimColor;

varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#ifdef USE_FADE
  varying float vFade;
#endif

#include <fog_pars_fragment>

void main() {
  float alpha = 1.0;
  #ifdef USE_FADE
    alpha = smoothstep(0.0, 1.0, vFade);
    if (alpha < 0.01) discard;
  #endif

  float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
  vec3 N = normalize(vNormalW) * faceDirection;
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float rim = pow(1.0 - ndv, 2.5);

  float grain = fbm3(vWorldPos * 3.0 + uTime * 0.05);
  vec3 color = uColor * (0.25 + 0.8 * ndv) * (0.88 + 0.24 * grain) + uRimColor * rim;

  gl_FragColor = vec4(color, alpha);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
