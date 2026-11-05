uniform vec3 uColor;
uniform float uOpacity;

varying float vAlpha;

#include <fog_pars_fragment>

void main() {
  float d = length(gl_PointCoord - 0.5);
  // Soft disc: 1 at the centre, 0 at the edge. (Written with ascending edges:
  // smoothstep with edge0 > edge1 is undefined in GLSL and differs per GPU.)
  float alpha = (1.0 - smoothstep(0.05, 0.5, d)) * vAlpha * uOpacity;
  if (alpha < 0.003) discard;

  gl_FragColor = vec4(uColor, alpha);

  #ifdef FOG_FADE
    // Dissolve into the haze rather than taking on its colour.
    #ifdef USE_FOG
      #ifdef FOG_EXP2
        float fogFactor = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
      #else
        float fogFactor = smoothstep(fogNear, fogFar, vFogDepth);
      #endif
      gl_FragColor.a *= 1.0 - fogFactor;
    #endif
  #else
    #include <fog_fragment>
  #endif
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
