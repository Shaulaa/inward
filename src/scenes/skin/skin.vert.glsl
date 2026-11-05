// Skin surface. Geometry is displaced on the CPU (see skinField.js); the
// vertex stage only forwards world-space data and the pore mask.
attribute float aPore;

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vPore;

#include <fog_pars_vertex>

void main() {
  vPore = aPore;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
