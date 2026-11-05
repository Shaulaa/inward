// DNA backbone ribbon: soft volume and gentle reflections. The ellipse
// cross-section's normals carry the rounding; a key light from the upper left
// of the view shapes it, a crisp highlight plus a broad sheen read as a smooth
// wet surface, and a soft environment gradient (bright above, dark below, in
// view space) is reflected at grazing angles.
uniform float uTime;
uniform vec3 uColor;
uniform vec3 uRimColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;

varying vec3 vObjPos;
varying vec3 vWorldPos;
varying vec3 vNormalW;

#ifdef USE_FADE
  varying float vFade;
#endif

#include <fog_pars_fragment>

void main() {
  float alpha = 1.0;
  #ifdef USE_FADE
    alpha = smoothstep(0.0, 1.0, vFade);
    if (alpha < 0.01) discard;
  #endif

  float faceDirection = gl_FrontFacing ? 1.0 : -1.0;
  vec3 N = normalize(vNormalW) * faceDirection;
  vec3 V = normalize(cameraPosition - vWorldPos);
  float ndv = clamp(dot(N, V), 0.0, 1.0);

  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 L = normalize(V + up * 0.9 - right * 0.6);
  float diffuse = clamp((dot(N, L) + 0.25) / 1.25, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float nh = max(dot(N, H), 0.0);
  float highlight = pow(nh, 80.0) * 0.32;
  float sheen = pow(nh, 10.0) * 0.07;

  vec3 R = reflect(-V, N);
  float sky = smoothstep(-0.2, 0.9, dot(R, up));
  vec3 environment = mix(uGroundColor, uSkyColor, sky);
  float fresnel = 0.04 + 0.96 * pow(1.0 - ndv, 4.0);

  // Darker where the ribbon thins out at its edges (seen edge-on).
  float occlusion = 0.6 + 0.4 * smoothstep(0.05, 0.6, ndv);

  float grain = fbm3(vWorldPos * 4.0 + uTime * 0.03);
  vec3 color = uColor * (0.14 + 0.3 * ndv + 0.6 * diffuse) * occlusion * (0.95 + 0.1 * grain);
  color += environment * fresnel * 0.55;
  color += vec3(1.0, 0.96, 1.0) * (highlight + sheen);
  color += uRimColor * pow(1.0 - ndv, 3.0) * 0.18;

  gl_FragColor = vec4(color, alpha);

  #include <fog_fragment>
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
