import { VesselScene } from '../scenes/vessel/VesselScene.js';
import { CellScene } from '../scenes/cell/CellScene.js';

/**
 * Order of the journey. Durations are abstract scroll units (not physical
 * sizes); each transition overlaps the two scenes around it.
 *
 * Phase 1 prototype: blood vessel -> inside the cell only.
 */
export const JOURNEY = {
  scenes: [
    { id: 'vessel', label: 'Pembuluh darah', scale: '±100 µm', duration: 1.0, create: (ctx) => new VesselScene(ctx) },
    { id: 'cell', label: 'Dalam sel', scale: '±20 µm', duration: 1.25, create: (ctx) => new CellScene(ctx) },
  ],
  transitions: [{ type: 'membrane', duration: 0.22 }],
};

/** Viewport heights of scrolling per timeline unit. */
export const SCROLL_VH_PER_UNIT = 450;
