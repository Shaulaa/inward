// Soft, fleshy red cell instead of glossy plastic:
// - wrapped diffuse from the camera headlamp (no hard terminator),
// - a barely-there broad highlight,
// - fake subsurface: light "leaks" through where the disc is thin (the dimple
//   in the middle and the very rim) and a soft fresnel brightens the edges.
uniform vec3 uColorCore;
uniform vec3 uColorShadow;
uniform vec3 uColorGlow;

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vRho;

#include <fog_pars_fragment>

void main() {
  float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
  vec3 N = normalize(vNormalW) * faceDirection;
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndv = clamp(dot(N, V), 0.0, 1.0);

  // Evans–Fung thickness, normalised to its maximum (~0.66 R).
  float r2 = vRho * vRho;
  float thickness = sqrt(max(0.0, 1.0 - r2)) * (0.207 + 2.003 * r2 - 1.123 * r2 * r2) / 0.66;
  float thin = 1.0 - clamp(thickness, 0.0, 1.0);

  // Wrapped (half-Lambert style) so there is no hard terminator, but enough
  // falloff that the biconcave shape still reads.
  float wrap = clamp((ndv + 0.25) / 1.25, 0.0, 1.0);
  vec3 color = mix(uColorShadow, uColorCore, wrap * wrap);

  // Light scattered through the cell: brighter, warmer edges...
  float fresnel = pow(1.0 - ndv, 2.5);
  color += uColorGlow * fresnel * 0.6;
  // ...and a faint glow where the disc is thin (centre dimple and rim).
  color += uColorGlow * thin * thin * 0.22 * wrap;

  // Broad, weak sheen (wet membrane) instead of a sharp specular dot.
  color += vec3(1.0, 0.75, 0.7) * pow(ndv, 10.0) * 0.05;

  gl_FragColor = vec4(color, 1.0);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
