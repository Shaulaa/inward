// The DNA strand: a soft, slightly mottled lilac fibre from afar. As the
// lens closes in, the double helix surfaces in its relief — two backbone
// ridges winding around it — and, only very close, a faint hint of the bases
// in the grooves. That is the structure the next scene opens on, so the dive
// reads as one continuous zoom.
uniform float uTime;
uniform float uLength;      // tube length in world units (uv.x runs 0..1 along it)
uniform float uPitch;       // one helical turn, world units
uniform float uMinorGroove; // fraction of a turn between the two backbones
uniform vec3 uColor;
uniform vec3 uRimColor;
uniform vec3 uColorA;
uniform vec3 uColorT;
uniform vec3 uColorC;
uniform vec3 uColorG;

varying vec2 vUv;
varying float vFade;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#include <fog_pars_fragment>

vec3 baseColor(float id) {
  float h = fract(sin(id * 12.9898) * 43758.5453);
  if (h < 0.25) return uColorA;
  if (h < 0.5) return uColorT;
  if (h < 0.75) return uColorC;
  return uColorG;
}

void main() {
  float alpha = smoothstep(0.0, 1.0, vFade);

  vec3 N = normalize(vNormalW);
  vec3 toCamera = cameraPosition - vWorldPos;
  float dist = length(toCamera);
  vec3 V = toCamera / dist;

  // Helical coordinate: position along the strand in turns, minus the angle around it.
  float along = vUv.x * uLength / uPitch;
  float phase = fract(along - vUv.y);
  float d1 = min(phase, 1.0 - phase);
  float d2 = abs(phase - uMinorGroove);
  // Footprint of the smooth (along, around) coordinate, not of `phase`, whose
  // fract() wraps 1 -> 0 and would draw the wrap as a dotted seam.
  float aa = footprint(vec2(along, vUv.y)) * 2.0;
  float ridge = max(1.0 - smoothstep(0.04, 0.13 + aa, d1), 1.0 - smoothstep(0.04, 0.13 + aa, d2));

  // Detail fades in with proximity; the bases only right at the end.
  float helixDetail = 1.0 - smoothstep(0.06, 0.6, dist);
  float baseDetail = 1.0 - smoothstep(0.03, 0.18, dist);

  // Organic mottling and relief.
  float mottle = fbm3(vWorldPos * 55.0 + uTime * 0.05);
  float height = ridge * helixDetail * 0.6 + mottle * 0.25;
  vec3 Nb = perturbNormal(vWorldPos, N, height * 0.004, 1.0);

  vec3 grooveTint = mix(uColor * 0.8, baseColor(floor(along * 10.5)), 0.28 * baseDetail);
  vec3 surface = mix(grooveTint, uColor * 1.08, mix(1.0, ridge, helixDetail));
  surface *= 0.92 + 0.16 * mottle;

  float ndv = clamp(dot(Nb, V), 0.0, 1.0);
  float wrap = clamp((ndv + 0.3) / 1.3, 0.0, 1.0);
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.5);
  vec3 color = surface * (0.25 + 0.8 * wrap) + uRimColor * rim * 0.55;

  // Discard only after all derivative-based work (dFdx/fwidth need every pixel of the quad).
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(color, alpha);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
