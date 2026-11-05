import * as THREE from 'three';
import noise from '../../shaders/noise.glsl?raw';
import nuclear from '../../shaders/nuclear.glsl?raw';
import bump from '../../shaders/bump.glsl?raw';
import organelleVertex from '../../shaders/organelle.vert.glsl?raw';
import organelleFragment from '../../shaders/organelle.frag.glsl?raw';

/** GLSL libraries, for scenes that assemble their own ShaderMaterial. */
export const glsl = { noise, nuclear, bump };

/**
 * ShaderMaterial with three's fog uniforms, a `uTime` uniform and the shared
 * GLSL libraries (noise in both stages; nuclear-envelope and bump helpers in
 * the fragment stage).
 */
export function organicMaterial({ vertexShader, fragmentShader, uniforms = {}, ...options }) {
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }, uniforms]),
    vertexShader: `${noise}\n${vertexShader}`,
    fragmentShader: `${noise}\n${nuclear}\n${bump}\n${fragmentShader}`,
    fog: true,
    ...options,
  });
}

/**
 * The generic soft-tissue look (headlamp shading + fresnel rim, slow wobble).
 * Works on plain meshes and InstancedMesh. `fade` enables the per-vertex
 * `aFade` attribute (tapered tube tips dissolve).
 */
export function tissueMaterial({ color, rimColor, wobble = 0.02, wobbleScale = 1, fade = false, ...options }) {
  return organicMaterial({
    vertexShader: organelleVertex,
    fragmentShader: organelleFragment,
    uniforms: {
      uWobble: { value: wobble },
      uWobbleScale: { value: wobbleScale },
      uColor: { value: new THREE.Color(color) },
      uRimColor: { value: new THREE.Color(rimColor) },
    },
    ...(fade ? { defines: { USE_FADE: '' }, transparent: true } : {}),
    ...options,
  });
}
