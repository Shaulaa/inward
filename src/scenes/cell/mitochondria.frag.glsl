// Mitochondria: a smooth outer membrane with folded cristae showing through.
// The capsule's long axis is object-space Y, so cristae run across it.
uniform float uTime;
uniform vec3 uColorMembrane;
uniform vec3 uColorMatrix;
uniform vec3 uColorCristae;

varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#include <fog_pars_fragment>

void main() {
  float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
  vec3 N = normalize(vNormalW) * faceDirection;
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.2);

  float folds = sin(vObjPos.y * 7.5 + snoise(vObjPos * 1.7 + uTime * 0.05) * 2.2);
  float cristae = smoothstep(0.55, 0.95, folds);
  float grain = fbm3(vObjPos * 4.0);

  // Cristae are seen "through" the membrane, so they fade toward the silhouette.
  vec3 inner = mix(uColorMatrix, uColorCristae, cristae) * (0.9 + 0.2 * grain);
  vec3 color = inner * (0.3 + 0.75 * ndv) * (1.0 - fres * 0.6) + uColorMembrane * fres * 1.1;

  gl_FragColor = vec4(color, 1.0);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
