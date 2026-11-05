// Fragment-shader helpers that use screen-space derivatives.
// Must be called in uniform control flow (not inside a branch that differs
// between neighbouring pixels).

// Bump mapping from screen-space derivatives (Mikkelsen 2010): tilts the
// normal by the slope of a procedural height field, no tangents needed.
// The height must be continuous: a jump (e.g. a per-cell random value) gives
// huge derivatives along the jump, which show up as dotted lines.
vec3 perturbNormal(vec3 position, vec3 normal, float height, float strength) {
  vec3 sigmaX = dFdx(position);
  vec3 sigmaY = dFdy(position);
  vec3 r1 = cross(sigmaY, normal);
  vec3 r2 = cross(normal, sigmaX);
  float det = dot(sigmaX, r1);
  vec3 grad = sign(det) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(abs(det) * normal - strength * grad);
}

// Size of one pixel in pattern units. Use this (smooth everywhere) to
// anti-alias lines, not fwidth() of a cellular distance: that one jumps
// at cell borders and draws the borders as dotted lines.
float footprint(vec2 p) {
  return length(fwidth(p));
}

float footprint(vec3 p) {
  return length(fwidth(p));
}

// |e| with the sharp crease at zero rounded off (radius k). Cellular edge
// distances (F2 − F1) are V-shaped at the border; rounding keeps bump
// derivatives continuous across it.
float softEdge(float e, float k) {
  return sqrt(e * e + k * k) - k;
}
