// Bump mapping from screen-space derivatives (Mikkelsen 2010): tilts the
// normal by the slope of a procedural height field, no tangents needed.
// Fragment-shader only, and must be called in uniform control flow.
vec3 perturbNormal(vec3 position, vec3 normal, float height, float strength) {
  vec3 sigmaX = dFdx(position);
  vec3 sigmaY = dFdy(position);
  vec3 r1 = cross(sigmaY, normal);
  vec3 r2 = cross(normal, sigmaX);
  float det = dot(sigmaX, r1);
  vec3 grad = sign(det) * (dFdx(height) * r1 + dFdy(height) * r2);
  return normalize(abs(det) * normal - strength * grad);
}
