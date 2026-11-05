/**
 * Colours that must match across a scene boundary. The cell membrane seen
 * from outside has to look like the vessel wall the camera dives into, so the
 * membrane transition reads as one continuous surface.
 */
export const ENDOTHELIUM = '#741a28';
export const ENDOTHELIUM_HIGHLIGHT = '#94374a';

/**
 * The nuclear envelope, seen from the cytoplasm (cell scene) and from inside
 * the nucleus (nucleus scene). Pores are only slightly lighter than the
 * envelope with a dim channel, so they read as pores rather than eyes.
 */
export const NUCLEAR_ENVELOPE = {
  envelope: '#4a3fbf',
  ring: '#8a80e0',
  core: '#2b2470',
  rim: '#8f7bff',
};
