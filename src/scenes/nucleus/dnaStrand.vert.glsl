// DNA strand tube (from createTaperedTube): forwards the tube's UVs, so the
// fragment stage can draw the double helix's grooves along and around it.
attribute float aFade;

varying vec2 vUv;
varying float vFade;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#include <fog_pars_vertex>

void main() {
  vUv = uv;
  vFade = aFade;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
