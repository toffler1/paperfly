// Global game configuration constants for PaperFly.
// All gameplay tunables live here so designers can tweak balance in one place.

export const GAME_WIDTH = 800;
export const GAME_HEIGHT = 450;

// World layout
export const GROUND_Y = GAME_HEIGHT - 50;      // y-coordinate where the ground starts
export const LAUNCH_X = 120;                    // launchpad x-position (in world coords)
export const LAUNCH_Y = GROUND_Y - 60;          // launchpad y-position

// Physics tunables
export const GRAVITY = 0.18;                    // vy increment per frame (pixels/frame^2)
export const BASE_LIFT_FACTOR = 0.013;          // how much forward speed converts to lift
export const LIFT_DECAY_PER_FRAME = 0.9985;    // lift slowly fades over time (simulates losing altitude potential)
export const BASE_DRAG = 0.0025;                // horizontal velocity drag per frame
export const GROUND_DRAG = 0.04;                // when the plane is rolling on the ground

// Slingshot launch tunables
export const MAX_DRAG_DISTANCE = 140;           // max pixels the rubber band can stretch
export const MIN_LAUNCH_POWER = 4;              // velocity at minimal stretch
export const BASE_MAX_LAUNCH_POWER = 18;        // velocity at full stretch (tier 0)

// Angle limits while aiming (radians).
// Player drags downward/backward from launch point - aim is the inverted direction.
// We clamp aim angle between -10° (almost flat) and -75° (steep upward).
export const MIN_AIM_ANGLE_DEG = -75;
export const MAX_AIM_ANGLE_DEG = -10;

// Coin
export const COIN_VALUE = 1;
export const COIN_RADIUS = 10;
export const BASE_MAGNET_RADIUS = 0;            // tier 0 = no magnet (touch only)

// Distance / world generation
export const PIXELS_PER_METER = 10;             // 10 px = 1 m for HUD display
export const SPAWN_AHEAD_DISTANCE = GAME_WIDTH; // how far ahead of the plane to generate coins/obstacles
export const COIN_SPAWN_INTERVAL_X = 90;        // average x-distance between coin clusters
export const OBSTACLE_SPAWN_INTERVAL_X = 320;   // average x-distance between trees

// Upgrade tier definitions
// Three tiers per upgrade. Tier 0 = baseline (already owned at start).
export interface UpgradeTier {
  cost: number;          // coins required to purchase this tier
  multiplier: number;    // applied to the relevant gameplay stat
  label: string;         // human-readable label
}

export const UPGRADE_DEFS = {
  // Rubber band: increases max launch power.
  rubberBand: [
    { cost: 0,    multiplier: 1.00, label: 'Basis' },
    { cost: 30,   multiplier: 1.22, label: 'Stärkeres Band' },
    { cost: 70,   multiplier: 1.48, label: 'Stahlgummi' },
    { cost: 140,  multiplier: 1.78, label: 'Doppelband' },
    { cost: 260,  multiplier: 2.12, label: 'Superelastik' },
    { cost: 460,  multiplier: 2.50, label: 'Turbostart' },
    { cost: 780,  multiplier: 2.92, label: 'Sprungfeder' },
    { cost: 1250, multiplier: 3.38, label: 'Titanband' },
    { cost: 1900, multiplier: 3.88, label: 'Hyperkatapult' },
    { cost: 2800, multiplier: 4.50, label: 'Quantenstart' },
  ] as UpgradeTier[],

  // Glide: reduces velocity decay (more drag-resistant => flies further).
  glide: [
    { cost: 0,    multiplier: 1.00, label: 'Basis' },
    { cost: 35,   multiplier: 0.83, label: 'Leichtpapier' },
    { cost: 85,   multiplier: 0.68, label: 'Aerodynamik I' },
    { cost: 170,  multiplier: 0.55, label: 'Aerodynamik II' },
    { cost: 310,  multiplier: 0.44, label: 'Segelflügel' },
    { cost: 530,  multiplier: 0.35, label: 'Gleitkörper' },
    { cost: 860,  multiplier: 0.27, label: 'Windschlüpfer' },
    { cost: 1350, multiplier: 0.20, label: 'Hyperprofil' },
    { cost: 2000, multiplier: 0.15, label: 'Luftakrobat' },
    { cost: 3000, multiplier: 0.10, label: 'Schallgleiter' },
  ] as UpgradeTier[],

  // Shield: absorbs bird / obstacle hits. multiplier = number of shield charges.
  shield: [
    { cost: 0,   multiplier: 0, label: 'Kein Schild' },
    { cost: 40,  multiplier: 1, label: '1 Schild' },
    { cost: 90,  multiplier: 2, label: '2 Schilder' },
    { cost: 180, multiplier: 3, label: '3 Schilder' },
    { cost: 320, multiplier: 4, label: '4 Schilder' },
    { cost: 520, multiplier: 5, label: 'Vollschutz' },
  ] as UpgradeTier[],

  // Laser cannon: auto-fires at nearest bird/plane. multiplier = reload time ms (0 = no cannon).
  laser: [
    { cost: 0,   multiplier: 0,    label: 'Keine Kanone' },
    { cost: 55,  multiplier: 4500, label: 'Laserkanone I' },
    { cost: 120, multiplier: 3000, label: 'Laserkanone II' },
    { cost: 240, multiplier: 1800, label: 'Schnelllaser' },
    { cost: 420, multiplier: 1000, label: 'Pulslaser' },
    { cost: 700, multiplier: 500,  label: 'Dauerlaser' },
  ] as UpgradeTier[],

  // Turbo jets: spacebar fires a speed burst. multiplier = vx boost added (0 = no turbo).
  turbo: [
    { cost: 0,   multiplier: 0.0, label: 'Kein Turbo' },
    { cost: 50,  multiplier: 1.0, label: 'Turbodüse I' },
    { cost: 110, multiplier: 1.6, label: 'Turbodüse II' },
    { cost: 220, multiplier: 2.4, label: 'Turbodüse III' },
    { cost: 390, multiplier: 3.3, label: 'Hyperboost' },
    { cost: 650, multiplier: 4.5, label: 'Plasmatriebwerk' },
  ] as UpgradeTier[],

  // Tires: reduces ground drag so the plane rolls further. multiplier = drag factor.
  tires: [
    { cost: 0,   multiplier: 1.00, label: 'Kein Reifen' },
    { cost: 35,  multiplier: 0.55, label: 'Reifen I' },
    { cost: 80,  multiplier: 0.28, label: 'Reifen II' },
    { cost: 160, multiplier: 0.12, label: 'Reifen III' },
    { cost: 300, multiplier: 0.05, label: 'Superreifen' },
    { cost: 500, multiplier: 0.02, label: 'Hyperreifen' },
  ] as UpgradeTier[],

  // Bounce: plane bounces back into the air on landing. multiplier = upward velocity.
  bounce: [
    { cost: 0,   multiplier: 0,  label: 'Kein Bounce' },
    { cost: 60,  multiplier: 3,  label: 'Bounce I' },
    { cost: 130, multiplier: 5,  label: 'Bounce II' },
    { cost: 260, multiplier: 7,  label: 'Bounce III' },
    { cost: 450, multiplier: 9,  label: 'Megabounce' },
    { cost: 720, multiplier: 12, label: 'Ultrabounce' },
  ] as UpgradeTier[],

  // Coin magnet: pickup radius in pixels.
  magnet: [
    { cost: 0,    multiplier: 0,   label: 'Aus' },
    { cost: 25,   multiplier: 35,  label: 'Magnetisch' },
    { cost: 60,   multiplier: 65,  label: 'Kleinfeldmagnet' },
    { cost: 120,  multiplier: 95,  label: 'Mittelfeld' },
    { cost: 210,  multiplier: 125, label: 'Großfeldmagnet' },
    { cost: 360,  multiplier: 152, label: 'Supermagnet' },
    { cost: 580,  multiplier: 175, label: 'Hochfeldmagnet' },
    { cost: 900,  multiplier: 195, label: 'Ultramagnet' },
    { cost: 1350, multiplier: 215, label: 'Megafeld' },
    { cost: 2000, multiplier: 240, label: 'Quantenmagnet' },
  ] as UpgradeTier[],
};

export type UpgradeKey = keyof typeof UPGRADE_DEFS;

// Visual palette
export const COLOR_SKY_TOP = 0xf4845f;
export const COLOR_SKY_BOTTOM = 0xfce5b8;
export const COLOR_MOUNTAIN_FAR = 0xc4705a;
export const COLOR_MOUNTAIN_NEAR = 0x7a4e3b;
export const COLOR_GROUND = 0x5a9e33;
export const COLOR_GROUND_DARK = 0x3d7020;
export const COLOR_TREE_LEAF = 0x2e7a25;
export const COLOR_TREE_TRUNK = 0x6b3e1b;
export const COLOR_COIN = 0xffd23a;
export const COLOR_COIN_HIGHLIGHT = 0xfff39c;
export const COLOR_PLANE = 0xffffff;
export const COLOR_PLANE_SHADOW = 0xc8c8c8;
export const COLOR_RUBBERBAND = 0x8a4a2a;
