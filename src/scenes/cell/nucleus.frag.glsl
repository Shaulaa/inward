// Nucleus seen from the cytoplasm: envelope with nuclear pores and lamina
// relief (pattern in nuclear.glsl), lit by the headlamp plus a soft key light.
// One larger pore (uHeroDir) is the one the camera dives into.
uniform float uTime;
uniform float uPoreScale;
uniform float uFogAmount;
uniform vec3 uHeroDir;
uniform float uHeroSize;
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

  float height;
  vec3 base = nuclearEnvelope(vObjPos * uPoreScale, vObjPos * 0.9 + uTime * 0.03, uColorEnvelope, uColorPoreRing, uColorPoreCenter, uHeroDir, uHeroSize, height).rgb;
  // Relief is in pore-spacing units; one spacing is 1 / uPoreScale world units.
  vec3 Nb = perturbNormal(vWorldPos, N, height * 0.035 / uPoreScale, 1.0);

  float ndv = clamp(dot(Nb, V), 0.0, 1.0);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 L = normalize(V + up * 0.9 - right * 0.6);
  float key = clamp((dot(Nb, L) + 0.3) / 1.3, 0.0, 1.0);
  float sheen = pow(max(dot(Nb, normalize(L + V)), 0.0), 40.0) * 0.08;

  vec3 color = base * (0.2 + 0.5 * ndv + 0.5 * key) + uColorRim * fres * 0.9 + sheen;

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
