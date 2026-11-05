// Nuclear envelope studded with nuclear pores (3D cellular pattern, so there
// is no seam or pole pinching on the sphere).
uniform float uTime;
uniform float uPoreScale;
uniform float uFogAmount;
uniform vec3 uColorEnvelope;
uniform vec3 uColorPoreRing;
uniform vec3 uColorPoreCenter;
uniform vec3 uColorRim;

varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#include <fog_pars_fragment>

vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}

float cellular3(vec3 p) {
  vec3 n = floor(p);
  vec3 f = fract(p);
  float d = 8.0;
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 r = g + hash33(n + g) * 0.8 + 0.1 - f;
    d = min(d, dot(r, r));
  }
  return sqrt(d);
}

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.4);

  float d = cellular3(vObjPos * uPoreScale);
  float ring = smoothstep(0.1, 0.15, d) * (1.0 - smoothstep(0.2, 0.28, d));
  float core = 1.0 - smoothstep(0.03, 0.1, d);

  float wrinkle = fbm3(vObjPos * 0.9 + uTime * 0.03);
  vec3 base = uColorEnvelope * (0.85 + 0.35 * wrinkle);
  base = mix(base, uColorPoreRing, ring * 0.8);
  base = mix(base, uColorPoreCenter, core);

  vec3 color = base * (0.25 + 0.85 * ndv) + uColorRim * fres * 0.9;

  gl_FragColor = vec4(color, 1.0);

  // Like <fog_fragment>, but scaled: the nucleus is the focal point, so it
  // only takes part of the haze.
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * uFogAmount);
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
