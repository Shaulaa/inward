/**
 * Object counts, detail levels and render settings in one place, in two
 * presets. Every scene reads its budget from here.
 *
 * - desktop: the full look.
 * - mobile:  phones (and small touch tablets). Lower render resolution and
 *            fewer, lighter objects everywhere; the nucleus and DNA scenes —
 *            the heaviest — get the largest cuts.
 *
 * The preset is picked automatically (detectTier) and can be forced with
 * ?quality=mobile or ?quality=desktop, e.g. to try the phone preset on a
 * laptop. The active one is written to <html data-quality="…">.
 */

const DESKTOP = {
  maxPixelRatio: 2,
  msaaSamples: 4,
  /** Final-image treatment: bloom strength/threshold, vignette and grain amounts. */
  post: { bloom: 0.35, threshold: 0.75, knee: 0.4, vignette: 0.28, grain: 0.018 },
  skin: {
    surfaceSize: 300,
    denseSize: 48,
    surfaceSegments: 440,
    poreFieldSize: 90,
    hairs: 260,
  },
  dermis: {
    collagen: 300,
    /** Collagen bundle segments up close / beyond lodDistance. */
    collagenSegments: [96, 32],
    elastin: 200,
    fibroblasts: 50,
    fluidParticles: 1500,
  },
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
  nucleus: {
    fibers: 40,
    particles: 2500,
    envelopeDetail: 64,
    /** Chromatin fibres near the camera's route / elsewhere: sides and ring spacing (units). */
    chromatinNear: { radial: 10, spacing: 0.1 },
    chromatinFar: { radial: 5, spacing: 0.22 },
    /** Ring spacing of the DNA wrapped around the beads, and of the naked backbones (units). */
    wrappedSpacing: 0.012,
    strandSpacing: 0.004,
    strandRadial: 10,
    histoneSegments: [48, 32],
    rungSegments: [4, 10],
  },
  dna: {
    backgroundHelices: 4,
    particles: 1500,
    /** Ribbon rings per base pair and sides: hero helix, background helices. */
    ribbonHero: [6, 18],
    ribbonBackground: [3, 10],
    /** Base-rod capsules (cap segments, sides): hero up close, hero further away, background. */
    rodsHero: [8, 20],
    rodsHeroFar: [5, 14],
    rodsBackground: [3, 8],
  },
};

const MOBILE = {
  maxPixelRatio: 1.5,
  msaaSamples: 2,
  post: { bloom: 0.35, threshold: 0.75, knee: 0.4, vignette: 0.28, grain: 0.018 },
  skin: {
    surfaceSize: 300,
    denseSize: 48,
    surfaceSegments: 260,
    poreFieldSize: 90,
    hairs: 140,
  },
  dermis: {
    collagen: 150,
    collagenSegments: [48, 20],
    elastin: 100,
    fibroblasts: 30,
    fluidParticles: 700,
  },
  vessel: {
    redCells: 900,
    plasmaParticles: 900,
    wallTubularSegments: 320,
    wallRadialSegments: 48,
  },
  cell: {
    mitochondria: 45,
    erRibosomes: 700,
    freeRibosomes: 250,
    cytosolParticles: 2200,
    filaments: 160,
    erTubules: 18,
    membraneDetail: 40,
  },
  nucleus: {
    fibers: 22,
    particles: 1000,
    envelopeDetail: 40,
    chromatinNear: { radial: 7, spacing: 0.16 },
    chromatinFar: { radial: 4, spacing: 0.32 },
    wrappedSpacing: 0.024,
    strandSpacing: 0.008,
    strandRadial: 7,
    histoneSegments: [24, 16],
    rungSegments: [2, 6],
  },
  dna: {
    backgroundHelices: 2,
    particles: 600,
    ribbonHero: [4, 12],
    ribbonBackground: [2, 8],
    rodsHero: [5, 12],
    rodsHeroFar: [3, 8],
    rodsBackground: [2, 6],
  },
};

export const PRESETS = { desktop: DESKTOP, mobile: MOBILE };

/** 'mobile' on phones and small touch tablets, 'desktop' otherwise; ?quality=… overrides. */
export function detectTier() {
  const forced = new URLSearchParams(window.location.search).get('quality');
  if (forced === 'mobile' || forced === 'desktop') return forced;
  const ua = navigator.userAgent || '';
  const uaMobile = navigator.userAgentData?.mobile ?? /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const small = Math.min(window.screen.width, window.screen.height) <= 900;
  return uaMobile || (coarse && small) ? 'mobile' : 'desktop';
}

/**
 * @param {'desktop' | 'mobile'} [tier]
 * @param {{ reducedMotion?: boolean }} [options]
 */
export function createQuality(tier = detectTier(), { reducedMotion = false } = {}) {
  const preset = PRESETS[tier] ?? DESKTOP;
  return {
    tier,
    ...structuredClone(preset),
    pixelRatio: Math.min(window.devicePixelRatio || 1, preset.maxPixelRatio),
    /**
     * Speed of ambient, time-driven motion (wobble, drifting particles,
     * flowing blood). prefers-reduced-motion slows it right down; scroll-
     * driven motion is unaffected (it only moves when the reader scrolls).
     */
    motion: reducedMotion ? 0.3 : 1,
    reducedMotion,
  };
}
