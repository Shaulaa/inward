// Red blood cell (instanced). Passes the normalised radial position across
// the disc so the fragment stage can estimate local thickness.
uniform float uRadius;

varying vec3 vWorldPos;
varying vec3 vNormalW;
varying float vRho;

#include <fog_pars_vertex>

void main() {
  mat4 model = modelMatrix * instanceMatrix;
  vec4 world = model * vec4(position, 1.0);
  vWorldPos = world.xyz;
  // Instances only use uniform scale, so mat3(model) is a valid normal matrix.
  vNormalW = normalize(mat3(model) * normal);
  vRho = clamp(length(position.xz) / uRadius, 0.0, 1.0);

  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
