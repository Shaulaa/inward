// Shared vertex stage for organelles. Works for plain meshes and InstancedMesh
// (three.js defines USE_INSTANCING and the instanceMatrix attribute).
uniform float uTime;
uniform float uWobble;
uniform float uWobbleScale;

varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#ifdef USE_FADE
  // 0 at the tips of a tapered tube, 1 along its body (see createTaperedTube).
  attribute float aFade;
  varying float vFade;
#endif

#include <fog_pars_vertex>

void main() {
  #ifdef USE_FADE
    vFade = aFade;
  #endif

  mat4 model = modelMatrix;
  vec3 seed = vec3(0.0);
  #ifdef USE_INSTANCING
    model = modelMatrix * instanceMatrix;
    seed = instanceMatrix[3].xyz;
  #endif

  // Slow organic wobble; the instance position decorrelates neighbours.
  vec3 p = position;
  p += normal * snoise(p * uWobbleScale + seed * 0.37 + uTime * 0.12) * uWobble;
  vObjPos = p;

  vec4 world = model * vec4(p, 1.0);
  vWorldPos = world.xyz;
  vNormalW = normalize(mat3(model) * normal);

  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}
