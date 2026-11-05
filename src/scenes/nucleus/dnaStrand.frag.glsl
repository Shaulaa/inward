// From afar a smooth lilac strand; as the lens closes in, the surface resolves
// into the double helix: two backbone ridges winding around it, with the
// coloured base pairs glimpsed in the grooves between them. That is the
// structure the next scene opens on, so the dive reads as one continuous zoom.
uniform float uTime;
uniform float uLength;   // tube length in world units (uv.x runs 0..1 along it)
uniform float uPitch;    // one helical turn, world units
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
  if (alpha < 0.01) discard;

  vec3 N = normalize(vNormalW);
  vec3 toCamera = cameraPosition - vWorldPos;
  float dist = length(toCamera);
  vec3 V = toCamera / dist;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float rim = pow(1.0 - ndv, 2.5);

  // Helical coordinate: position along the strand in turns, minus the angle around it.
  float along = vUv.x * uLength / uPitch;
  float phase = fract(along - vUv.y);
  // Two backbones: one at phase 0, the other a minor-groove fraction later.
  float d1 = min(phase, 1.0 - phase);
  float d2 = abs(phase - uMinorGroove);
  float aa = fwidth(phase) * 1.5;
  float backbone = max(1.0 - smoothstep(0.05, 0.09 + aa, d1), 1.0 - smoothstep(0.05, 0.09 + aa, d2));

  // Base pairs: one coloured rung per 1/10.5 of a turn in the grooves.
  vec3 rung = baseColor(floor(along * 10.5));

  float detail = 1.0 - smoothstep(0.08, 1.2, dist);
  vec3 surface = mix(uColor, mix(rung * 0.85, uColor * 1.15, backbone), detail);
  vec3 color = surface * (0.3 + 0.8 * ndv) + uRimColor * rim * 0.8;

  gl_FragColor = vec4(color, alpha);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
