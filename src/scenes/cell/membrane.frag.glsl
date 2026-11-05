// Seen from outside (front faces) the membrane is a dense, almost opaque skin
// that matches the vessel wall the previous scene dives into. Seen from inside
// it is a faint glowing shell. As the lens touches it, it thins out so the
// crossing never pops.
uniform float uTime;
uniform vec3 uColorOuter;
uniform vec3 uColorInner;
uniform vec3 uColorProtein;      // outside: matches the vessel wall
uniform vec3 uColorProteinInner; // inside: the cell's own palette (no red carry-over)
uniform vec3 uColorRim;

varying vec3 vWorldPos;
varying vec3 vNormalW;

#include <fog_pars_fragment>

void main() {
  bool outside = gl_FrontFacing;
  vec3 N = normalize(vNormalW) * (outside ? 1.0 : -1.0);
  vec3 toCamera = cameraPosition - vWorldPos;
  float dist = length(toCamera);
  vec3 V = toCamera / dist;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 2.5);

  float grain = fbm3(vWorldPos * 1.8 + uTime * 0.04);
  float protein = smoothstep(0.62, 0.76, snoise(vWorldPos * 1.3 + 3.1) * 0.5 + 0.5);
  float closeUp = 1.0 - smoothstep(0.2, 2.5, dist);
  float lipid = fbm3(vWorldPos * 40.0 + uTime * 0.1);

  vec3 color;
  float alpha;
  if (outside) {
    color = uColorOuter * (0.3 + 0.8 * ndv) * (0.88 + 0.24 * grain);
    color = mix(color, uColorProtein, protein * 0.45);
    color *= 1.0 + closeUp * 0.35 * lipid;
    color += uColorRim * fres * 0.3;
    alpha = 0.97;
  } else {
    color = uColorInner * (0.35 + 0.65 * (grain + 0.5)) + uColorRim * fres * 0.8;
    color = mix(color, uColorProteinInner, protein * 0.3);
    alpha = mix(0.08, 0.7, fres) + protein * 0.08;
  }

  alpha *= smoothstep(0.0, 0.5, dist);
  gl_FragColor = vec4(color, alpha);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
