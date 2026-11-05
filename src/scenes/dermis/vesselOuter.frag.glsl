// A blood vessel seen from the outside: a thin, translucent wall with blood
// glowing through where it faces the camera, endothelial nuclei as soft
// bumps, and fine texture for the final close-up dive into it.
uniform float uTime;
uniform vec3 uColorWall;
uniform vec3 uColorBlood;
uniform vec3 uColorNucleus;
uniform vec3 uColorRim;

varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#include <fog_pars_fragment>

void main() {
  vec3 N = normalize(vNormalW);
  vec3 toCamera = cameraPosition - vWorldPos;
  float dist = length(toCamera);
  vec3 V = toCamera / dist;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.5);

  // Endothelial nuclei, elongated along the vessel (local Z of the tube path is world Z here).
  float cells = cellular3(vWorldPos * vec3(0.9, 0.9, 0.3));
  float nucleus = 1.0 - smoothstep(0.12, 0.3, cells);

  float closeUp = 1.0 - smoothstep(0.3, 3.0, dist);
  float grain = fbm3(vWorldPos * 3.0 + uTime * 0.04);
  float fine = fbm3(vWorldPos * 28.0);

  vec3 wall = mix(uColorWall, uColorNucleus, nucleus * 0.5) * (0.88 + 0.24 * grain);
  wall *= 1.0 + closeUp * 0.35 * fine;
  // Blood shows through the thin wall where we look straight at it.
  vec3 color = mix(wall, uColorBlood, 0.45 * ndv * (1.0 - closeUp * 0.6));
  color = color * (0.35 + 0.75 * ndv) + uColorRim * fres * 0.7;

  gl_FragColor = vec4(color, 1.0);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
