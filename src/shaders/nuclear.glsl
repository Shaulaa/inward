// Nuclear envelope pattern, shared by the nucleus seen from the cytoplasm and
// the envelope seen from inside the nucleus, so the two scenes match at the
// transition. Uses a 3D cellular pattern (no seam or pole pinching on spheres).

vec3 hash33(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return fract(sin(p) * 43758.5453);
}

/** Nearest feature point: distance in w, offset from p to the feature in xyz. */
vec4 cellular3(vec3 p) {
  vec3 n = floor(p);
  vec3 f = fract(p);
  float d = 8.0;
  vec3 offset = vec3(0.0);
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec3 g = vec3(float(i), float(j), float(k));
    vec3 r = g + hash33(n + g) * 0.8 + 0.1 - f;
    float dd = dot(r, r);
    if (dd < d) {
      d = dd;
      offset = r;
    }
  }
  return vec4(offset, sqrt(d));
}

/**
 * One nuclear pore at distance `d` from its centre (pore-spacing units),
 * `size` = 1 for an ordinary pore. A real opening rather than a painted ring:
 * a slightly raised lip (with eight barely-there lumps, the pore complex's
 * subunits) around a funnel that darkens as it goes down.
 * Returns lip, depth (0..1, deepest at the centre) and relief height.
 */
vec3 nuclearPore(float d, float angle, float size) {
  float x = d / size;
  float lip = exp(-pow((x - 0.135) / 0.04, 2.0)) * (0.92 + 0.08 * cos(angle * 8.0));
  float funnel = 1.0 - smoothstep(0.015, 0.12, x);
  float depth = funnel * funnel * (3.0 - 2.0 * funnel);
  return vec3(lip, depth, lip * 0.5 - depth);
}

/**
 * Envelope colour with nuclear pores. `p` is in envelope space (a sphere
 * around the origin) scaled so one cellular cell is one pore spacing.
 *
 * heroDir / heroSize: one larger pore at that direction (heroSize <= 0 for
 * none), with the ordinary pores cleared around it — the pore the camera
 * dives into.
 *
 * Returns colour in rgb and the pore opening in a (0..1, 1 at the deepest
 * point of a pore, where an envelope can be see-through); `height` receives
 * a relief height (roughly -1..0.5) for bump mapping.
 */
vec4 nuclearEnvelope(vec3 p, vec3 wrinkleP, vec3 envelope, vec3 ring, vec3 core, vec3 heroDir, float heroSize, out float height) {
  vec3 n = normalize(p);
  vec3 t1 = normalize(abs(n.y) < 0.95 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
  vec3 t2 = cross(n, t1);

  vec4 cell = cellular3(p);
  vec3 pore = nuclearPore(cell.w, atan(dot(cell.xyz, t2), dot(cell.xyz, t1)), 1.0);

  if (heroSize > 0.0) {
    vec3 toHero = heroDir * length(p) - p;
    float dh = length(toHero);
    vec3 hero = nuclearPore(dh, atan(dot(toHero, t2), dot(toHero, t1)), heroSize);
    float own = 1.0 - smoothstep(heroSize * 0.22, heroSize * 0.45, dh);
    pore = mix(pore, hero, own);
  }

  // Nuclear lamina: a faint meshwork just under the envelope, plus fine grain.
  float lamina = 1.0 - smoothstep(0.0, 0.08, softEdge(snoise(p * 2.2), 0.02));
  float wrinkle = fbm3(wrinkleP);
  float grain = fbm3(p * 9.0);

  vec3 color = envelope * (0.85 + 0.35 * wrinkle) * (0.94 + 0.12 * grain);
  color *= 1.0 - 0.12 * lamina;
  color = mix(color, ring, pore.x * 0.5);
  color = mix(color, core, pore.y * 0.9);

  height = pore.z + 0.25 * wrinkle + 0.15 * grain - 0.15 * lamina;
  return vec4(color, pore.y);
}
