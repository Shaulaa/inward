// Mitochondria: a smooth, softly lit outer membrane with calm, regular
// cristae (inner folds) showing faintly through it. The capsule's long axis
// is object-space Y, so the cristae run across it.
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

  // Nearly parallel folds with only a gentle wave, soft-edged and low contrast.
  float folds = sin(vObjPos.y * 6.0 + snoise(vObjPos * 0.9) * 0.5);
  float cristae = smoothstep(0.6, 0.98, folds) * 0.55;
  float grain = fbm3(vObjPos * 3.0);

  // Key light from upper left of the view, plus the camera headlamp.
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 L = normalize(V + up * 0.9 - right * 0.6);
  float key = clamp((dot(N, L) + 0.4) / 1.4, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float sheen = pow(max(dot(N, H), 0.0), 36.0) * 0.12;

  // Cristae are seen "through" the membrane, so they fade toward the silhouette.
  vec3 inner = mix(uColorMatrix, uColorCristae, cristae * (1.0 - fres)) * (0.94 + 0.12 * grain);
  vec3 color = inner * (0.2 + 0.4 * ndv + 0.45 * key) + uColorMembrane * fres * 0.8 + sheen;

  gl_FragColor = vec4(color, 1.0);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
