// Soft round particles with size attenuation and optional idle drift.
attribute float aSize;
attribute float aSeed;

uniform float uTime;
uniform float uPixelRatio;
uniform float uSizeScale;
uniform float uDrift;

varying float vAlpha;

#include <fog_pars_vertex>

void main() {
  vec3 p = position;
  float s = aSeed * 6.2831;
  p += uDrift * vec3(
    sin(uTime * 0.31 + s),
    sin(uTime * 0.27 + s * 1.7),
    sin(uTime * 0.23 + s * 2.3)
  );

  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float depth = max(-mvPosition.z, 0.001);
  gl_PointSize = min(aSize * uSizeScale * uPixelRatio / depth, 48.0 * uPixelRatio);

  // Fade particles that are about to hit the lens.
  vAlpha = smoothstep(0.08, 0.6, depth);

  #include <fog_vertex>
}
