uniform float uTime;
uniform float uLength;
uniform float uCircumference;
uniform vec3 uTarget;
uniform float uFocus;
uniform vec3 uColorWall;
uniform vec3 uColorBorder;
uniform vec3 uColorNucleus;
uniform vec3 uColorRim;
uniform vec3 uColorTarget;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#include <fog_pars_fragment>

// Membrane microstructure for the close-up dive (all in world units on the
// wall): a cobblestone of lipid domains, small pits (caveolae) and fine
// protein specks. Returns height in x and colour modifiers in yzw.
vec4 membraneDetail(vec2 st, float circumference) {
  // Cobblestones, ~0.12 units across, seamless around the tube.
  float aroundA = floor(circumference * 8.0 + 0.5);
  vec2 pa = vec2(st.x * 8.0, st.y / circumference * aroundA);
  vec2 paw = pa + 0.25 * vec2(snoise(vec3(pa * 0.6, 3.0)), snoise(vec3(pa * 0.6, 9.0)));
  vec4 cobble = voronoi2(paw, aroundA);
  float seam = softEdge(cobble.y - cobble.x, 0.03);
  float ridge = 1.0 - smoothstep(0.0, 0.12 + footprint(paw), seam);
  float dome = 1.0 - smoothstep(0.0, 0.7, cobble.x);

  // Caveolae: sparse small pits.
  float aroundB = floor(circumference * 15.0 + 0.5);
  vec2 pb = vec2(st.x * 15.0, st.y / circumference * aroundB);
  vec4 pits = voronoi2(pb, aroundB);
  float pitId = fract(sin(dot(pits.zw, vec2(41.3, 289.1))) * 15731.743);
  float pit = (1.0 - smoothstep(0.08, 0.16 + footprint(pb), pits.x)) * step(0.55, pitId);

  // Protein specks.
  float speck = smoothstep(0.55, 0.8, snoise(vec3(st * 38.0, 1.7)) * 0.5 + 0.5);

  float height = dome * 0.6 - ridge * 0.25 - pit * 0.8;
  return vec4(height, ridge, pit, speck);
}

void main() {
  float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
  vec3 N = normalize(vNormalW) * faceDirection;
  vec3 toCamera = cameraPosition - vWorldPos;
  float dist = length(toCamera);
  vec3 V = toCamera / dist;

  // Endothelial cells: long along the flow, narrow around the vessel. The
  // number of cells around the circumference is an integer and the warp comes
  // from world position, so the pattern has no seam where the tube's UV wraps.
  float cellsAround = floor(uCircumference * 1.45 + 0.5);
  vec2 cellSpace = vec2(vUv.x * uLength * 0.38, vUv.y * cellsAround);
  vec2 warp = vec2(snoise(vWorldPos * 0.3 + 1.3), snoise(vWorldPos * 0.3 + 8.1));
  vec4 cells = voronoi2(cellSpace + warp * 0.2, cellsAround);

  // Thin, low-contrast cell junctions. fwidth keeps the line width stable in
  // screen space (no aliasing); they fade out with distance before they shimmer.
  float edge = softEdge(cells.y - cells.x, 0.01);
  float aa = footprint(cellSpace);
  float border = 1.0 - smoothstep(0.012, 0.045 + aa * 1.5, edge);
  border *= 1.0 - smoothstep(6.0, 18.0, dist);
  float nucleus = 1.0 - smoothstep(0.12, 0.32, cells.x);
  float tint = fract(sin(dot(cells.zw, vec2(12.9898, 78.233))) * 43758.5453);

  vec3 base = uColorWall * (0.9 + 0.18 * tint);
  base = mix(base, uColorNucleus, nucleus * 0.45);
  base = mix(base, uColorBorder, border * 0.4);

  // Mid-scale grain, plus fine membrane texture that only appears up close
  // (keeps the dive into the wall detailed without shimmering far away).
  base *= 0.9 + 0.2 * fbm3(vWorldPos * 5.0 + vec3(0.0, 0.0, uTime * 0.05));
  float closeUp = 1.0 - smoothstep(0.25, 2.5, dist);
  base *= 1.0 + closeUp * 0.4 * fbm3(vWorldPos * 42.0 + uTime * 0.08);

  // Close-up microstructure: colour variation plus relief through the normal,
  // weighted by closeUp so it is invisible at distance. Deliberately not inside
  // an `if`: dFdx/fwidth are undefined in non-uniform control flow on real GPUs.
  vec4 detail = membraneDetail(vec2(vUv.x * uLength, vUv.y * uCircumference), uCircumference);
  base *= 1.0 + closeUp * (0.18 * detail.y - 0.45 * detail.z + 0.22 * detail.w);
  vec3 Nlit = normalize(mix(N, perturbNormal(vWorldPos, N, detail.x * 0.035, 1.0), closeUp));

  // Dim headlamp lighting with a deep, dark rim: the wall stays a maroon
  // backdrop so the brighter red cells pop in front of it. A weak key light
  // from above makes the close-up relief read even when the headlamp hits
  // the wall head-on.
  float ndv = clamp(dot(Nlit, V), 0.0, 1.0);
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  vec3 key = normalize(V + vec3(0.0, 0.8, 0.0));
  float relief = clamp(dot(Nlit, key), 0.0, 1.0) - clamp(dot(N, key), 0.0, 1.0);
  vec3 color = base * (0.45 + 0.65 * ndv + closeUp * 1.6 * relief) + uColorRim * rim * 0.35;

  // Guide the eye toward the cell we are about to enter. The glow tints the
  // surface (multiplied, so texture survives) and only breathes by ±3%; it
  // backs off as the lens gets close, where the surface detail takes over.
  float dT = distance(vWorldPos, uTarget);
  float breathe = 0.97 + 0.03 * sin(uTime * 2.2);
  float glow = exp(-dT * dT / 1.6) * uFocus * breathe * mix(0.6, 1.0, smoothstep(0.3, 3.0, dist));
  color += (base * 2.2 + uColorTarget * 0.04) * uColorTarget * glow;

  gl_FragColor = vec4(color, 1.0);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
