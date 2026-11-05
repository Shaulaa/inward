// Nuclear envelope pattern, shared by the nucleus seen from the cytoplasm and
// the envelope seen from inside the nucleus, so the two scenes match at the
// transition. Uses a 3D cellular pattern (no seam or pole pinching on spheres).

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

/**
 * Envelope base colour with nuclear pores. `p` is in envelope space scaled so
 * one cellular cell is one pore spacing.
 * Returns colour in rgb and pore coverage (ring or core) in a.
 */
vec4 nuclearEnvelope(vec3 p, vec3 wrinkleP, vec3 envelope, vec3 ring, vec3 core) {
  float d = cellular3(p);
  float poreRing = smoothstep(0.1, 0.15, d) * (1.0 - smoothstep(0.2, 0.28, d));
  float poreCore = 1.0 - smoothstep(0.03, 0.1, d);

  float wrinkle = fbm3(wrinkleP);
  vec3 color = envelope * (0.85 + 0.35 * wrinkle);
  color = mix(color, ring, poreRing * 0.8);
  color = mix(color, core, poreCore);
  return vec4(color, max(poreRing, poreCore));
}
