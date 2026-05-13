// BiomeManager - distance-driven biome progression system.
//
// The world visually shifts as the player flies further. Six biomes are defined,
// each unlocked at a specific distance threshold (in meters). This module is
// intentionally Phaser-free: it owns only configuration data and lookup logic.
// GameScene consumes the data and applies the actual visual changes (tints,
// particles, tweens, etc.).

import type Phaser from 'phaser';

export interface BiomeConfig {
  id: string;
  label: string;            // human-readable banner label, may include emoji
  minDistance: number;       // meters at which this biome starts
  // Four-band sky gradient: top → upper-mid → lower-mid → horizon
  skyTopColor: number;
  skyUpperMidColor: number;
  skyLowerMidColor: number;
  skyBottomColor: number;
  // Banner accent color (used for the colored pill on biome change)
  accentColor: number;
  mountainFarColor: number;
  mountainNearColor: number;
  groundColor: number;
  groundDarkColor: number;
  obstacleKey: string;
  obstacleHitboxRadius: number;
  // Optional ambient particle config (key = texture key)
  ambientParticle?: {
    key: string;
    config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
  };
  // Optional second emitter for biomes that need two particle layers
  ambientParticleSecondary?: {
    key: string;
    config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
  };
}

// Six biomes, ordered by minDistance ascending. The first entry must be
// minDistance 0 to guarantee a valid lookup for any non-negative distance.
export const BIOMES: BiomeConfig[] = [
  // ── 1. Meadows (0 – 500 m) ──────────────────────────────────────────────────────
  {
    id: 'meadows',
    label: 'Wiesen',
    minDistance: 0,
    skyTopColor:      0xe8604a,  // deep sunset red-orange at zenith
    skyUpperMidColor: 0xf4845f,  // warm orange
    skyLowerMidColor: 0xfabd80,  // peachy amber
    skyBottomColor:   0xfce5b8,  // pale cream near horizon
    accentColor: 0x5aad2e,
    mountainFarColor: 0xb85e48,
    mountainNearColor: 0x7a4e3b,
    groundColor: 0x5a9e33,
    groundDarkColor: 0x3d7020,
    obstacleKey: 'tree',
    obstacleHitboxRadius: 18,
    // No ambient particles — existing clouds layer is enough.
  },

  // ── 2. City (500 – 1500 m) ───────────────────────────────────────────────────────
  {
    id: 'city',
    label: 'Stadt',
    minDistance: 500,
    skyTopColor:      0xcc3060,  // deep magenta at zenith (neon night sky)
    skyUpperMidColor: 0xff5580,  // vivid pink
    skyLowerMidColor: 0xff8855,  // coral orange
    skyBottomColor:   0xffcc88,  // warm smoggy horizon
    accentColor: 0xff4488,
    mountainFarColor: 0x3a2a4e,
    mountainNearColor: 0x1e1830,
    groundColor: 0x5a5a6a,
    groundDarkColor: 0x3a3a48,
    obstacleKey: 'building',
    obstacleHitboxRadius: 26,
    ambientParticle: {
      key: 'smokePuff',
      config: {
        x: { min: 0, max: 800 },
        y: 460,
        lifespan: 6000,
        speedY: { min: -20, max: -8 },
        speedX: { min: -12, max: 12 },
        scale: { start: 0.3, end: 1.0 },
        alpha: { start: 0.4, end: 0 },
        tint: [0x888898, 0x666676, 0x555565],
        frequency: 1200,
        quantity: 1,
        rotate: { min: 0, max: 360 },
      },
    },
    // City window twinkle — small bright lights scattered across the lower half
    ambientParticleSecondary: {
      key: 'cityLight',
      config: {
        x: { min: 0, max: 800 },
        y: { min: 200, max: 440 },
        lifespan: 1800,
        speedX: 0,
        speedY: 0,
        scale: { start: 1.5, end: 0 },
        alpha: { start: 0, end: 0 },
        // Custom alpha using hold + fade: appear, stay, vanish
        alphaCurve: 'Sine.InOut',
        frequency: 200,
        quantity: 1,
        tint: [0xffe8a0, 0xfff0c0, 0xccddff, 0xff9944],
      } as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig,
    },
  },

  // ── 3. Jungle (1500 – 3000 m) ─────────────────────────────────────────────────────────
  {
    id: 'jungle',
    label: 'Dschungel',
    minDistance: 1500,
    skyTopColor:      0x1a5a40,  // deep forest teal at zenith
    skyUpperMidColor: 0x287a55,  // mid jungle green
    skyLowerMidColor: 0x4aa870,  // lighter canopy green
    skyBottomColor:   0x70c888,  // bright misty green at horizon
    accentColor: 0x3abd5e,
    mountainFarColor: 0x1e4a2e,
    mountainNearColor: 0x0e2a18,
    groundColor: 0x2e8020,
    groundDarkColor: 0x1a5010,
    obstacleKey: 'palmTree',
    obstacleHitboxRadius: 20,
    // Falling leaves
    ambientParticle: {
      key: 'leaf',
      config: {
        x: { min: -20, max: 820 },
        y: -10,
        lifespan: 7000,
        speedY: { min: 28, max: 55 },
        speedX: { min: -30, max: 30 },
        scale: { start: 1.2, end: 0.5 },
        alpha: { start: 0.9, end: 0 },
        rotate: { min: 0, max: 360 },
        frequency: 300,
        quantity: 1,
      },
    },
    // Fireflies — bright glowing dots drifting slowly
    ambientParticleSecondary: {
      key: 'firefly',
      config: {
        x: { min: 0, max: 800 },
        y: { min: 80, max: 400 },
        lifespan: 3200,
        speedX: { min: -18, max: 18 },
        speedY: { min: -12, max: 12 },
        scale: { start: 0.8, end: 0.2 },
        alpha: { start: 0, end: 0, ease: 'Sine.InOut' },
        alphaCurve: 'Sine.InOut',
        frequency: 220,
        quantity: 1,
      } as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig,
    },
  },

  // ── 4. Desert (3000 – 5000 m) ─────────────────────────────────────────────────────────
  {
    id: 'desert',
    label: 'Wueste',
    minDistance: 3000,
    skyTopColor:      0xd86820,  // deep burnt orange at zenith
    skyUpperMidColor: 0xf08838,  // warm orange
    skyLowerMidColor: 0xf8b858,  // golden amber
    skyBottomColor:   0xffe4a0,  // pale yellow-white heat haze at horizon
    accentColor: 0xf0a028,
    mountainFarColor: 0xb86838,
    mountainNearColor: 0x7a4018,
    groundColor: 0xd8b060,
    groundDarkColor: 0xa87838,
    obstacleKey: 'cactus',
    obstacleHitboxRadius: 16,
    // Sand grains blowing right (wind)
    ambientParticle: {
      key: 'sandGrain',
      config: {
        x: -10,
        y: { min: 180, max: 440 },
        lifespan: 2200,
        speedX: { min: 240, max: 420 },
        speedY: { min: -20, max: 20 },
        scale: { start: 0.8, end: 0.2 },
        alpha: { start: 0.7, end: 0 },
        rotate: { min: 0, max: 180 },
        frequency: 60,
        quantity: 2,
      },
    },
  },

  // ── 5. Arctic (5000 – 8000 m) ─────────────────────────────────────────────────────────
  {
    id: 'arctic',
    label: 'Arktis',
    minDistance: 5000,
    skyTopColor:      0x5888c0,  // rich polar blue at zenith
    skyUpperMidColor: 0x7aaad8,  // mid cornflower blue
    skyLowerMidColor: 0xb0ccea,  // pale blue
    skyBottomColor:   0xd8eaf6,  // icy white-blue near horizon
    accentColor: 0x88ccff,
    mountainFarColor: 0x9ab8d0,
    mountainNearColor: 0x5a7a98,
    groundColor: 0xe8f4fc,
    groundDarkColor: 0xb0c8dc,
    obstacleKey: 'iceTree',
    obstacleHitboxRadius: 18,
    // Snowflakes falling with slight horizontal drift
    ambientParticle: {
      key: 'snowflake',
      config: {
        x: { min: -20, max: 840 },
        y: -14,
        lifespan: 6000,
        speedY: { min: 55, max: 120 },
        speedX: { min: -50, max: -8 },
        scale: { start: 1.0, end: 0.5 },
        alpha: { start: 0.95, end: 0.2 },
        rotate: { min: 0, max: 45 },
        frequency: 80,
        quantity: 2,
      },
    },
  },

  // ── 6. Space (8000 m+) ────────────────────────────────────────────────────────────────
  {
    id: 'space',
    label: 'Weltraum',
    minDistance: 8000,
    skyTopColor:      0x000008,  // near-absolute black at zenith
    skyUpperMidColor: 0x03030e,  // very dark blue-black
    skyLowerMidColor: 0x080820,  // deep dark indigo
    skyBottomColor:   0x10102a,  // slightly lighter dark indigo near horizon
    accentColor: 0x6644cc,
    mountainFarColor: 0x14142e,
    mountainNearColor: 0x08081a,
    groundColor: 0x14141e,
    groundDarkColor: 0x080810,
    obstacleKey: 'asteroid',
    obstacleHitboxRadius: 22,
    // Nebula wisps drifting slowly across space
    ambientParticle: {
      key: 'nebulaParticle',
      config: {
        x: { min: -20, max: 820 },
        y: { min: 20, max: 320 },
        lifespan: 8000,
        speedX: { min: -6, max: 6 },
        speedY: { min: -4, max: 4 },
        scale: { start: 2.5, end: 0.5 },
        alpha: { start: 0, end: 0 },
        alphaCurve: 'Sine.InOut',
        frequency: 600,
        quantity: 1,
      } as Phaser.Types.GameObjects.Particles.ParticleEmitterConfig,
    },
    // Shooting stars streaking across
    ambientParticleSecondary: {
      key: 'star',
      config: {
        x: -20,
        y: { min: 15, max: 220 },
        lifespan: 800,
        speedX: { min: 750, max: 1100 },
        speedY: { min: 60, max: 160 },
        scale: { start: 2.0, end: 0.3 },
        alpha: { start: 1.0, end: 0 },
        frequency: 2200,
        quantity: 1,
      },
    },
  },
];

export class BiomeManager {
  private readonly biomes: BiomeConfig[];

  constructor(biomes: BiomeConfig[] = BIOMES) {
    // Defensive: sort by minDistance ascending in case callers pass unsorted data.
    this.biomes = [...biomes].sort((a, b) => a.minDistance - b.minDistance);
    if (this.biomes.length === 0 || this.biomes[0].minDistance !== 0) {
      throw new Error('BiomeManager requires at least one biome starting at distance 0.');
    }
  }

  // Returns the biome that the given distance falls into.
  // Always returns a valid biome (the first one if distance < 0).
  getBiomeForDistance(meters: number): BiomeConfig {
    let result = this.biomes[0];
    for (const b of this.biomes) {
      if (meters >= b.minDistance) {
        result = b;
      } else {
        break;
      }
    }
    return result;
  }

  // Returns 0..1 progress through the current biome's distance band.
  // For the last (open-ended) biome, returns 0 since there's no upper bound.
  getTransitionProgress(meters: number): number {
    const current = this.getBiomeForDistance(meters);
    const idx = this.biomes.indexOf(current);
    if (idx === this.biomes.length - 1) {
      return 0;
    }
    const next = this.biomes[idx + 1];
    const span = next.minDistance - current.minDistance;
    if (span <= 0) return 0;
    const local = meters - current.minDistance;
    return Math.min(1, Math.max(0, local / span));
  }

  // Convenience accessor for tests / debugging.
  getAllBiomes(): readonly BiomeConfig[] {
    return this.biomes;
  }
}
