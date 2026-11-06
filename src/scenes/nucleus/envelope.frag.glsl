// From outside (front faces) the envelope looks exactly like the nucleus in
// the cell scene (same pattern, relief and shading), which is what the camera
// was pressing into. From inside it is a faint lilac shell. The pores are
// real openings: the envelope turns see-through in their channels, so the
// camera enters the nucleus through the large pore at its entry point.
uniform float uTime;
uniform float uPoreScale;
uniform float uWrinkleScale;
uniform vec3 uHeroDir;
uniform float uHeroSize;
uniform vec3 uColorEnvelope;
uniform vec3 uColorPoreRing;
uniform vec3 uColorPoreCenter;
uniform vec3 uColorRim;
uniform vec3 uColorInner;
uniform float uSphereRadius; // the envelope is a sphere around the origin

varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#include <fog_pars_fragment>

void main() {
  bool outside = gl_FrontFacing;
  vec3 N = normalize(vNormalW) * (outside ? 1.0 : -1.0);
  vec3 toCamera = cameraPosition - vWorldPos;
  float dist = length(toCamera);
  // three.js draws a transparent double-sided mesh in two passes, back faces
  // first. While the camera is still outside, the back faces are the far
  // inner wall of the sphere, tens of units away and fully fogged: shading
  // them full-screen doubled this shader's cost for pixels that end up pure
  // fog colour (the background is the fog colour too). Skip them; back faces
  // close to the lens (the walls of the opening it dives through) still draw.
  // Before any derivative below, and uniform across each pass.
  if (length(cameraPosition) > uSphereRadius && !outside && dist > 6.0) discard;
  vec3 V = toCamera / dist;

  float height;
  vec4 envelope = nuclearEnvelope(vObjPos * uPoreScale, vObjPos * uWrinkleScale + uTime * 0.03, uColorEnvelope, uColorPoreRing, uColorPoreCenter, uHeroDir, uHeroSize, height);
  vec3 Nb = perturbNormal(vWorldPos, N, height * 0.035 / uPoreScale, 1.0);

  float ndv = clamp(dot(Nb, V), 0.0, 1.0);
  float fres = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 2.4);

  vec3 color;
  float alpha;
  if (outside) {
    // Same lighting as the nucleus in the cell scene.
    vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
    vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
    vec3 L = normalize(V + up * 0.9 - right * 0.6);
    float key = clamp((dot(Nb, L) + 0.3) / 1.3, 0.0, 1.0);
    float sheen = pow(max(dot(Nb, normalize(L + V)), 0.0), 40.0) * 0.08;
    color = envelope.rgb * (0.2 + 0.5 * ndv + 0.5 * key) + uColorRim * fres * 0.9 + sheen;
    alpha = 0.97;
  } else {
    color = mix(uColorInner, uColorPoreRing, smoothstep(0.0, 0.5, envelope.a) * 0.6) * (0.4 + 0.6 * fres);
    alpha = mix(0.1, 0.6, fres);
  }
  // Open pore channels, and a thin film as the lens passes through.
  alpha *= 1.0 - smoothstep(0.55, 0.95, envelope.a);
  alpha *= smoothstep(0.0, 0.6, dist);

  gl_FragColor = vec4(color, alpha);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
