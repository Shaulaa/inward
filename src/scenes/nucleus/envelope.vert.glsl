// Nuclear envelope seen from inside the nucleus: a slowly breathing sphere.
uniform float uTime;
uniform float uAmplitude;

varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#include <fog_pars_vertex>

void main() {
  vec3 n = normalize(normal);
  float shape = snoise(position * 0.05 + uTime * 0.02) * 0.7 + snoise(position * 0.18 + uTime * 0.04) * 0.3;
  vec3 p = position + n * shape * uAmplitude;
  vObjPos = p;

  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorldPos = world.xyz;
  vNormalW = normalize(mat3(modelMatrix) * n);
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
