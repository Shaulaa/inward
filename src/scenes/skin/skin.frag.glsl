// Human skin at ~1 cm: polygonal microrelief furrows, pores, blotchy tone,
// soft subsurface warmth at the terminator and a faint oily sheen. Close up
// the corneocytes (~35 µm flakes of the outermost layer) appear, which is
// exactly what the next scene starts on.
uniform float uTime;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSkyColor;
uniform vec3 uColorBase;
uniform vec3 uColorBlush;
uniform vec3 uColorFurrow;
uniform vec3 uColorPore;

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vPore;

#include <fog_pars_fragment>

void main() {
  vec3 N = normalize(vNormalW);
  vec3 toCamera = cameraPosition - vWorldPos;
  float dist = length(toCamera);
  vec3 V = toCamera / dist;
  vec2 st = vWorldPos.xz;

  // Microrelief: furrows outlining ~1 mm polygons, warped so they don't look gridded.
  vec2 warp = vec2(snoise(vec3(st * 0.35, 2.0)), snoise(vec3(st * 0.35, 7.0)));
  vec4 plates = voronoi2(st * 0.95 + warp * 0.35, 0.0);
  float plateEdge = plates.y - plates.x;
  // Shallow, soft-edged grooves (a hard dark line reads as cracked earth).
  float furrow = 1.0 - smoothstep(0.0, 0.05 + fwidth(plateEdge) * 2.0, plateEdge);
  furrow *= 0.6;
  furrow *= 1.0 - smoothstep(12.0, 30.0, dist);

  // Corneocytes, only when close.
  float closeUp = 1.0 - smoothstep(0.4, 4.0, dist);
  vec4 flakes = voronoi2(st * 28.0 + warp * 2.0, 0.0);
  float flakeEdge = flakes.y - flakes.x;
  float flakeLine = 1.0 - smoothstep(0.0, 0.1 + fwidth(flakeEdge) * 1.5, flakeEdge);
  float flakeTint = fract(sin(dot(flakes.zw, vec2(12.9898, 78.233))) * 43758.5453);

  float height = -furrow * 0.6 + 0.25 * fbm3(vec3(st * 3.0, 0.0)) + closeUp * (0.15 * flakeTint - 0.25 * flakeLine);
  vec3 Nb = perturbNormal(vWorldPos, N, height * 0.018, 1.0);

  vec3 base = mix(uColorBase, uColorBlush, smoothstep(-0.35, 0.6, fbm3(vec3(st * 0.22, 4.0))));
  base = mix(base, uColorFurrow, furrow * 0.25);
  base = mix(base, uColorPore, vPore * 0.75);
  base *= 1.0 + closeUp * (0.1 * flakeTint - 0.12 * flakeLine);

  // Wrapped key light; light scattered under the skin warms the terminator.
  float ndl = dot(Nb, uLightDir);
  float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
  vec3 subsurface = uColorBlush * (1.0 - wrap) * 0.3 * smoothstep(-0.5, 0.2, ndl);
  vec3 halfVector = normalize(uLightDir + V);
  float sheen = pow(max(dot(Nb, halfVector), 0.0), 40.0) * 0.07 * (1.0 - vPore);
  vec3 color = base * (uSkyColor * 0.35 + uLightColor * wrap) + subsurface + sheen;

  gl_FragColor = vec4(color, 1.0);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
