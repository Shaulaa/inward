import { SkinSurfaceScene } from '../scenes/skin/SkinSurfaceScene.js';
import { DermisScene } from '../scenes/dermis/DermisScene.js';
import { VesselScene } from '../scenes/vessel/VesselScene.js';
import { CellScene } from '../scenes/cell/CellScene.js';
import { NucleusScene } from '../scenes/nucleus/NucleusScene.js';
import { DnaScene } from '../scenes/dna/DnaScene.js';
import { SCENES } from '../content/story.js';

/**
 * Order of the journey. Durations are abstract scroll units (not physical
 * sizes); each transition overlaps the two scenes around it.
 *
 * Every transition opens a hole through the surface the outgoing scene dives
 * into (skin, vessel wall, cell membrane, nuclear envelope, the DNA strand).
 *
 * Scene durations keep only the content worth scrolling through; transition
 * durations are what the transitions were tuned at (0.22 units = ~99 vh).
 * Labels and scales (the scale indicator) live with the other text in
 * src/content/story.js.
 */
export const JOURNEY = {
  scenes: [
    { id: 'skin', label: SCENES.skin.label, scale: SCENES.skin.scale, duration: 0.6, create: (ctx) => new SkinSurfaceScene(ctx) },
    { id: 'dermis', label: SCENES.dermis.label, scale: SCENES.dermis.scale, duration: 0.85, create: (ctx) => new DermisScene(ctx) },
    { id: 'vessel', label: SCENES.vessel.label, scale: SCENES.vessel.scale, duration: 0.75, create: (ctx) => new VesselScene(ctx) },
    { id: 'cell', label: SCENES.cell.label, scale: SCENES.cell.scale, duration: 1.05, create: (ctx) => new CellScene(ctx) },
    { id: 'nucleus', label: SCENES.nucleus.label, scale: SCENES.nucleus.scale, duration: 0.9, create: (ctx) => new NucleusScene(ctx) },
    { id: 'dna', label: SCENES.dna.label, scale: SCENES.dna.scale, duration: 0.65, create: (ctx) => new DnaScene(ctx) },
  ],
  transitions: [
    { type: 'membrane', duration: 0.22 }, // skin surface -> into the skin
    { type: 'membrane', duration: 0.22 }, // dermis -> through the vessel wall
    { type: 'membrane', duration: 0.22 }, // vessel -> through the cell membrane
    { type: 'membrane', duration: 0.22 }, // cell -> through the nuclear envelope
    { type: 'membrane', duration: 0.25 }, // into the DNA strand -> inside the double helix
  ],
};

/** Viewport heights of scrolling per timeline unit. */
export const SCROLL_VH_PER_UNIT = 450;
