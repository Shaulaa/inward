import * as THREE from 'three';

// Evans & Fung (1972) red blood cell shape, normalised by the cell radius
// (R = 3.91 µm): thickness(ρ) = sqrt(1 - ρ²) · (C0 + C2·ρ² + C4·ρ⁴).
const R = 3.91;
const C0 = 0.81 / R;
const C2 = 7.83 / R;
const C4 = -4.39 / R;

const halfThickness = (rho) => 0.5 * Math.sqrt(Math.max(0, 1 - rho * rho)) * (C0 + C2 * rho * rho + C4 * rho ** 4);

/**
 * Biconcave disc lying in the XZ plane, thickness along Y.
 * Profile points run bottom-centre -> rim -> top-centre (increasing y) so the
 * lathe faces point outward.
 */
export function createRedCellGeometry({ radius = 1, profileSegments = 9, radialSegments = 26 } = {}) {
  const points = [];
  // Sine spacing packs more samples near the rim where curvature is highest.
  for (let i = 0; i <= profileSegments; i++) {
    const rho = Math.sin((i / profileSegments) * (Math.PI / 2));
    points.push(new THREE.Vector2(rho * radius, -halfThickness(rho) * radius));
  }
  for (let i = profileSegments - 1; i >= 0; i--) {
    const rho = Math.sin((i / profileSegments) * (Math.PI / 2));
    points.push(new THREE.Vector2(rho * radius, halfThickness(rho) * radius));
  }
  return new THREE.LatheGeometry(points, radialSegments);
}
