// The shared soft-tissue look (organelles, cells, fibres, chromatin, DNA
// backbone): the camera headlamp for overall exposure, a soft key light from
// the upper left of the view so forms read in three dimensions, a faint wet
// sheen, a fresnel rim, and slow surface grain.
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

  // Key light fixed relative to the view (camera right/up from the view matrix).
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 L = normalize(V + up * 0.9 - right * 0.6);
  float key = clamp((dot(N, L) + 0.4) / 1.4, 0.0, 1.0);
  float sheen = pow(max(dot(N, normalize(L + V)), 0.0), 32.0) * 0.1;

  float grain = fbm3(vWorldPos * 3.0 + uTime * 0.05);
  vec3 color = uColor * (0.18 + 0.45 * ndv + 0.45 * key) * (0.88 + 0.24 * grain) + uRimColor * rim + sheen;

  gl_FragColor = vec4(color, alpha);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
