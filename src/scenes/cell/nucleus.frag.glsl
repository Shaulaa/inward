// Nucleus seen from the cytoplasm: envelope with nuclear pores (pattern in nuclear.glsl).
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

void main() {
  vec3 N = normalize(vNormalW);
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.4);

  vec3 base = nuclearEnvelope(vObjPos * uPoreScale, vObjPos * 0.9 + uTime * 0.03, uColorEnvelope, uColorPoreRing, uColorPoreCenter).rgb;

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
