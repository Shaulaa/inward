import * as THREE from 'three';
import vertexShader from '../../shaders/particles.vert.glsl?raw';
import fragmentShader from '../../shaders/particles.frag.glsl?raw';

/**
 * Soft point sprites (plasma specks, cytosol molecules).
 * @param {{ positions: Float32Array, sizes: Float32Array, seeds: Float32Array, color: THREE.ColorRepresentation, opacity: number, pixelRatio: number, sizeScale?: number, drift?: number, fogFade?: boolean }} options
 *   fogFade: particles fade out with fog instead of being tinted by the fog colour.
 */
export function createParticles({ positions, sizes, seeds, color, opacity, pixelRatio, sizeScale = 40, drift = 0, fogFade = false }) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        uTime: { value: 0 },
        uPixelRatio: { value: pixelRatio },
        uSizeScale: { value: sizeScale },
        uDrift: { value: drift },
        uColor: { value: new THREE.Color(color) },
        uOpacity: { value: opacity },
      },
    ]),
    vertexShader,
    fragmentShader,
    defines: fogFade ? { FOG_FADE: '' } : {},
    transparent: true,
    depthWrite: false,
    fog: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  return points;
}
