import * as THREE from 'three';

// Scene units: cell radius 22 ≈ 10 µm, so 1 unit ≈ 0.45 µm.
export const CELL_RADIUS = 22;
export const NUCLEUS_RADIUS = 6.5;
/** How far outside the membrane the camera starts (it pushes through during the transition). */
export const ENTRY_OFFSET = 1.2;
/** Distance from the cell centre where the route ends, framing the whole nucleus. */
export const FINAL_DISTANCE = 14.5;

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Camera route through the cell: in through the membrane, then a slow orbit
 * past the organelles that turns to face the nucleus. Expressed in a local
 * frame (along = inward from the entry point, side, up) so the route can be
 * re-aimed by changing one direction.
 */
export function createCellRoute() {
  const entryDir = new THREE.Vector3(0.62, 0.22, 0.75).normalize();
  const side = new THREE.Vector3().crossVectors(entryDir, UP).normalize();
  const up = new THREE.Vector3().crossVectors(side, entryDir).normalize();
  const at = (a, s, u) => new THREE.Vector3().addScaledVector(entryDir, a).addScaledVector(side, s).addScaledVector(up, u);

  const points = [
    at(CELL_RADIUS + ENTRY_OFFSET, 0, 0),
    at(CELL_RADIUS - 1.8, 0, 0),
    at(16.0, 2.0, 0.8),
    at(13.0, 6.0, -0.4),
    at(10.0, 10.0, 0.8),
    at(7.0, 12.5, 1.4),
    at(4.0, 13.4, 1.8).setLength(FINAL_DISTANCE),
  ];

  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const length = curve.getLength();
  const samples = curve.getSpacedPoints(240);

  return {
    curve,
    length,
    at,
    /** Arc-length fraction at which the camera crosses the (undisplaced) membrane. */
    membraneFraction: ENTRY_OFFSET / length,
    samples,
    /** Camera positions while the shot is framed on the nucleus (end of the route). */
    framingCameras: samples.filter((_, i) => i / (samples.length - 1) >= 0.7),
    /**
     * Every few camera positions along the whole route, including the entry
     * (the nucleus is already centred in the opening membrane). Used for
     * anything that could otherwise sit on the nucleus face at some point.
     */
    viewCameras: samples.filter((_, i) => i % 3 === 0),
  };
}

/** Shortest distance from `point` to a polyline sampled from the route. */
export function distanceToRoute(point, samples) {
  let best = Infinity;
  for (const s of samples) best = Math.min(best, s.distanceToSquared(point));
  return Math.sqrt(best);
}

const toCenter = new THREE.Vector3();
const toPoint = new THREE.Vector3();

/**
 * True if `point` (with clearance `margin`) sits between any framing camera
 * and the nucleus, i.e. inside the cone from the camera to the nucleus
 * silhouette and in front of the nucleus. Used to keep the hero shot clean.
 */
export function blocksNucleusView(point, cameras, margin = 0.4) {
  for (const camera of cameras) {
    toCenter.copy(camera).negate(); // nucleus is at the origin
    const distance = toCenter.length();
    if (distance <= NUCLEUS_RADIUS) continue;
    toCenter.divideScalar(distance);

    toPoint.subVectors(point, camera);
    const along = toPoint.dot(toCenter);
    if (along <= 0 || along >= distance) continue;

    const perpendicular = Math.sqrt(Math.max(0, toPoint.lengthSq() - along * along));
    const tanHalfAngle = NUCLEUS_RADIUS / Math.sqrt(distance * distance - NUCLEUS_RADIUS * NUCLEUS_RADIUS);
    if (perpendicular < along * tanHalfAngle + margin) return true;
  }
  return false;
}
