// Inner wall of the vessel: pulses with the heartbeat and has one endothelial
// cell (uTarget) bulging into the lumen — the cell the camera dives into.
uniform float uTime;
uniform float uBeat;
uniform vec3 uTarget;
uniform float uBulge;
uniform float uBulgeRadius;

varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#include <fog_pars_vertex>

void main() {
  vUv = uv;
  vec3 n = normalize(normal);

  // Heartbeat expands the wall; a slow wave travels along the vessel.
  float wave = 0.5 + 0.5 * sin(uv.x * 60.0 - uTime * 3.0);
  vec3 p = position + n * uBeat * (0.07 + 0.05 * wave);

  // Gaussian dome pushed inward (against the outward normal). The normal is
  // tilted by the dome's tangential gradient so lighting follows the bump.
  vec3 d = p - uTarget;
  float sigma2 = uBulgeRadius * uBulgeRadius;
  float h = uBulge * exp(-dot(d, d) / sigma2);
  vec3 grad = h * (-2.0 * d / sigma2);
  vec3 gradT = grad - n * dot(n, grad);
  p -= n * h;
  n = normalize(n + gradT);

  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorldPos = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * n);

  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
