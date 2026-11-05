// From outside (front faces) the envelope looks exactly like the nucleus in
// the cell scene (same pattern and shading), which is what the camera was
// pressing into. From inside it is a faint lilac shell with glowing pores.
uniform float uTime;
uniform float uPoreScale;
uniform float uWrinkleScale;
uniform vec3 uColorEnvelope;
uniform vec3 uColorPoreRing;
uniform vec3 uColorPoreCenter;
uniform vec3 uColorRim;
uniform vec3 uColorInner;

varying vec3 vObjPos;
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
  float fres = pow(1.0 - ndv, 2.4);

  vec4 envelope = nuclearEnvelope(vObjPos * uPoreScale, vObjPos * uWrinkleScale + uTime * 0.03, uColorEnvelope, uColorPoreRing, uColorPoreCenter);

  vec3 color;
  float alpha;
  if (outside) {
    color = envelope.rgb * (0.25 + 0.85 * ndv) + uColorRim * fres * 0.9;
    alpha = 0.97;
  } else {
    color = mix(uColorInner, uColorPoreRing, envelope.a * 0.6) * (0.4 + 0.6 * fres);
    alpha = mix(0.1, 0.6, fres) + envelope.a * 0.25;
  }
  // Thin film as the lens passes through it.
  alpha *= smoothstep(0.0, 0.6, dist);

  gl_FragColor = vec4(color, alpha);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
