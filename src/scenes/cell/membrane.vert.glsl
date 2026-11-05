// Plasma membrane of the cell, a slowly breathing sphere.
uniform float uTime;
uniform float uAmplitude;

varying vec3 vWorldPos;
varying vec3 vNormalW;

#include <fog_pars_vertex>

void main() {
  vec3 n = normalize(normal);
  float shape = snoise(position * 0.06 + uTime * 0.02) * 0.65 + snoise(position * 0.22 + uTime * 0.05) * 0.35;
  vec3 p = position + n * shape * uAmplitude;

  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorldPos = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * n);

  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
