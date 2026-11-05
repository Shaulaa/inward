import * as THREE from 'three';
import { clamp } from '../../utils/math.js';

/**
 * Arc-length lookup table along the vessel centreline. Sampling a curve with
 * getPointAt() for thousands of cells per frame is too slow, so positions and
 * parallel-transport frames are precomputed and linearly interpolated.
 */
export class VesselPath {
  constructor(curve, radius, samples = 512) {
    this.curve = curve;
    this.radius = radius;
    this.samples = samples;
    this.length = curve.getLength();

    const frames = curve.computeFrenetFrames(samples, false);
    this.points = [];
    for (let i = 0; i <= samples; i++) this.points.push(curve.getPointAt(i / samples));
    this.tangents = frames.tangents;
    this.normals = frames.normals;
    this.binormals = frames.binormals;
  }

  #locate(s) {
    const f = clamp(s) * this.samples;
    const i0 = Math.min(Math.floor(f), this.samples - 1);
    return { i0, i1: i0 + 1, t: f - i0 };
  }

  /** Centreline point at arc-length fraction s (0..1). */
  pointAt(s, out = new THREE.Vector3()) {
    const { i0, i1, t } = this.#locate(s);
    return out.lerpVectors(this.points[i0], this.points[i1], t);
  }

  tangentAt(s, out = new THREE.Vector3()) {
    const { i0, i1, t } = this.#locate(s);
    return out.lerpVectors(this.tangents[i0], this.tangents[i1], t).normalize();
  }

  /** Point at distance `radial` from the centreline, at `angle` around it. */
  sample(s, radial, angle, out = new THREE.Vector3()) {
    const { i0, i1, t } = this.#locate(s);
    const p0 = this.points[i0];
    const p1 = this.points[i1];
    const n0 = this.normals[i0];
    const n1 = this.normals[i1];
    const b0 = this.binormals[i0];
    const b1 = this.binormals[i1];
    const c = Math.cos(angle) * radial;
    const sn = Math.sin(angle) * radial;
    out.x = p0.x + (p1.x - p0.x) * t + (n0.x + (n1.x - n0.x) * t) * c + (b0.x + (b1.x - b0.x) * t) * sn;
    out.y = p0.y + (p1.y - p0.y) * t + (n0.y + (n1.y - n0.y) * t) * c + (b0.y + (b1.y - b0.y) * t) * sn;
    out.z = p0.z + (p1.z - p0.z) * t + (n0.z + (n1.z - n0.z) * t) * c + (b0.z + (b1.z - b0.z) * t) * sn;
    return out;
  }
}
