// Translucent tissue sheet (basement membrane): a faint fibrous film that is
// most visible at grazing angles and thins out as the lens passes through it.
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uRimColor;
uniform float uOpacity;

varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#include <fog_pars_fragment>

void main() {
  float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
  vec3 N = normalize(vNormalW) * faceDirection;
  vec3 toCamera = cameraPosition - vWorldPos;
  float dist = length(toCamera);
  vec3 V = toCamera / dist;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.0);

  float fibers = fbm3(vWorldPos * vec3(2.5, 1.0, 2.5) + uTime * 0.03);
  vec3 color = uColor * (0.5 + 0.5 * ndv) * (0.85 + 0.3 * fibers) + uRimColor * fres * 0.6;
  float alpha = (uOpacity + 0.45 * fres) * smoothstep(0.05, 1.2, dist);

  gl_FragColor = vec4(color, alpha);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
