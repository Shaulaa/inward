/**
 * Object counts and render settings in one place. Mobile tiers are not
 * implemented yet (that is the optimisation phase); every scene reads its
 * budget from here so tiers can be added without touching scene code.
 */
export function createQuality() {
  return {
    pixelRatio: Math.min(window.devicePixelRatio || 1, 2),
    msaaSamples: 4,
    vessel: {
      redCells: 1500,
      plasmaParticles: 1800,
      wallTubularSegments: 480,
      wallRadialSegments: 64,
    },
    cell: {
      mitochondria: 70,
      erRibosomes: 1400,
      freeRibosomes: 500,
      cytosolParticles: 5000,
      filaments: 320,
      erTubules: 26,
      membraneDetail: 64,
    },
  };
}
