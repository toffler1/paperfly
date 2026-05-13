// BootScene - generates all sprite textures programmatically with Phaser Graphics,
// then immediately starts the GameScene. No external image files needed.

import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  COLOR_PLANE,
  COLOR_PLANE_SHADOW,
  COLOR_COIN,
  COLOR_COIN_HIGHLIGHT,
  COLOR_TREE_LEAF,
  COLOR_TREE_TRUNK,
  COLOR_SKY_TOP,
  COLOR_SKY_BOTTOM,
} from '../config';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload(): void {
    this.generateSkyTexture();
    this.generatePlaneTexture();
    this.generateCoinTexture();
    this.generateTreeTexture();
    this.generateCloudTexture();
    this.generateSparkTexture();
    this.generateTrailTexture();

    // Biome obstacle textures
    this.generateBuildingTexture();
    this.generatePalmTreeTexture();
    this.generateCactusTexture();
    this.generateIceTreeTexture();
    this.generateAsteroidTexture();

    // Biome background silhouettes
    this.generateCitySkylineTexture();
    this.generateSpaceTerrainTexture();
    this.generateStarFieldTexture();

    // Biome ambient particle textures
    this.generateSnowflakeTexture();
    this.generateStarTexture();
    this.generateFireflyTexture();
    this.generateLeafTexture();
    this.generateSmokePuffTexture();
    this.generateSandGrainTexture();
    this.generateCityLightTexture();
    this.generateNebulaParticleTexture();

    // Soft obstacles — 3-frame animated bird (wings up / level / down)
    this.generateBirdFrames();
    this.generateAirplaneTexture();

    // Plane visual upgrade tiers (tier 0 = base 'plane' above, tiers 1–9)
    for (let t = 1; t <= 9; t++) this.drawPlaneTier(t);

    // Wind and bird-hit particles
    this.generateWindParticleTexture();
    this.generateFeatherTexture();

    // New upgrade visuals
    this.generateShieldChargeTexture();
    this.generateTurboFlameTexture();
  }

  create(): void {
    this.scene.start('GameScene');
  }

  private generateSkyTexture(): void {
    const g = this.add.graphics();
    const steps = 16;
    for (let i = 0; i < steps; i++) {
      const t = (i + 0.5) / steps;
      const r = Math.round(((COLOR_SKY_TOP >> 16) & 0xff) + (((COLOR_SKY_BOTTOM >> 16) & 0xff) - ((COLOR_SKY_TOP >> 16) & 0xff)) * t);
      const gv = Math.round(((COLOR_SKY_TOP >> 8) & 0xff) + (((COLOR_SKY_BOTTOM >> 8) & 0xff) - ((COLOR_SKY_TOP >> 8) & 0xff)) * t);
      const b = Math.round((COLOR_SKY_TOP & 0xff) + ((COLOR_SKY_BOTTOM & 0xff) - (COLOR_SKY_TOP & 0xff)) * t);
      const y0 = Math.floor(i * GAME_HEIGHT / steps);
      const y1 = Math.ceil((i + 1) * GAME_HEIGHT / steps) + 1;
      g.fillStyle((r << 16) | (gv << 8) | b, 1);
      g.fillRect(0, y0, GAME_WIDTH, y1 - y0);
    }
    g.generateTexture('sky', GAME_WIDTH, GAME_HEIGHT);
    g.destroy();
  }

  private generateSparkTexture(): void {
    const size = 8;
    const g = this.add.graphics();
    // Soft rounded square for more organic coin burst
    g.fillStyle(0xffd23a, 1);
    g.fillCircle(4, 4, 4);
    g.fillStyle(0xffffff, 0.6);
    g.fillCircle(2, 2, 2);
    g.generateTexture('spark', size, size);
    g.destroy();
  }

  private generateTrailTexture(): void {
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 4, 4);
    g.generateTexture('trail', 4, 4);
    g.destroy();
  }

  // White paper airplane viewed from the side, pointing right.
  private generatePlaneTexture(): void {
    const w = 48;
    const h = 28;
    const g = this.add.graphics();

    // Drop shadow
    g.fillStyle(0x000000, 0.18);
    g.fillTriangle(2, h - 6, w - 2, h / 2 + 2, 2, h - 14);

    // Main body (white triangle pointing right)
    g.fillStyle(COLOR_PLANE, 1);
    g.fillTriangle(0, 0, w, h / 2, 0, h);

    // Inner fold (slightly darker stripe)
    g.fillStyle(COLOR_PLANE_SHADOW, 1);
    g.fillTriangle(0, h / 2, w, h / 2, 4, h - 4);

    // Outline
    g.lineStyle(1.5, 0x444444, 0.9);
    g.strokeTriangle(0, 0, w, h / 2, 0, h);
    g.lineBetween(0, h / 2, w, h / 2);

    g.generateTexture('plane', w, h);
    g.destroy();
  }

  // Plane upgrade tier variants: plane_g1 … plane_g9.
  // Each tier grows and gains a visually distinct livery / structural feature.
  private drawPlaneTier(tier: number): void {
    const key = `plane_g${tier}`;
    // Size scales gently: base 48×28 → tier 9 ≈ 84×44
    const w = 48 + tier * 4;
    const h = 28 + tier * 2;
    const cx = h / 2; // vertical midline
    const g = this.add.graphics();

    // ── Drop shadow (all tiers) ───────────────────────────────────────────
    g.fillStyle(0x000000, 0.18);
    g.fillTriangle(2, h - 6, w - 2, cx + 2, 2, h - 14);

    // ── Main wing body (white base) ───────────────────────────────────────
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(0, 0, w, cx, 0, h);

    // ── Per-tier livery: fold color + unique structural markings ─────────
    // Fold palette — each tier gets a distinct hue
    const foldPalette = [
      0xc8c8c8, // 0 – base grey (unused here, tier 0 = 'plane')
      0x5599dd, // 1 – sky blue
      0xe07828, // 2 – burnt orange
      0x3355cc, // 3 – deep blue
      0xcc2255, // 4 – crimson
      0x22aa66, // 5 – teal
      0xaa22aa, // 6 – purple
      0xdd9900, // 7 – gold
      0x224488, // 8 – navy with chrome
      0x111111, // 9 – stealth black
    ];
    const foldColor = foldPalette[Math.min(tier, 9)];

    // Lower fold triangle
    g.fillStyle(foldColor, 1);
    g.fillTriangle(0, cx, w, cx, 4, h - 4);

    // ── Outline ───────────────────────────────────────────────────────────
    g.lineStyle(1.5, 0x444444, 0.9);
    g.strokeTriangle(0, 0, w, cx, 0, h);
    g.lineBetween(0, cx, w, cx);

    // ── Tier 1: subtle top-face shine ────────────────────────────────────
    if (tier >= 1) {
      g.lineStyle(1.5, 0x88bbff, 0.65);
      g.lineBetween(3, 3, Math.round(w * 0.72), cx - 1);
    }

    // ── Tier 2: aileron panel at trailing edge ────────────────────────────
    if (tier >= 2) {
      g.fillStyle(foldColor, 0.75);
      g.fillTriangle(0, cx, 14, cx, 0, cx + 10);
      g.lineStyle(1.2, 0xff9944, 0.9);
      g.lineBetween(8, cx - 10, 8, cx + 10);
    }

    // ── Tier 3: delta sweep highlight + nose streak ───────────────────────
    if (tier >= 3) {
      g.fillStyle(foldColor, 0.28);
      g.fillTriangle(Math.round(w * 0.38), cx - 5, w, cx, Math.round(w * 0.38), cx + 5);
      g.lineStyle(1.5, 0x88aaff, 0.8);
      g.lineBetween(Math.round(w * 0.6), cx - 5, w - 1, cx);
      g.lineBetween(Math.round(w * 0.6), cx + 5, w - 1, cx);
      g.lineStyle(1, 0xffffff, 0.35);
      g.lineBetween(Math.round(w * 0.18), cx - 11, Math.round(w * 0.58), cx - 2);
    }

    // ── Tier 4: crimson racing stripe + canard winglet ────────────────────
    if (tier >= 4) {
      // Bold diagonal racing stripe across the upper face
      g.fillStyle(0xcc2255, 0.55);
      const sx = Math.round(w * 0.28);
      g.fillTriangle(sx, cx - 9, sx + 18, cx - 2, sx, cx - 2);
      g.fillTriangle(sx + 18, cx - 2, sx + 22, cx - 2, sx + 4, cx - 9);
      // Small canard fin near the nose
      g.fillStyle(0xcc2255, 0.9);
      g.fillTriangle(w - 6, cx - 2, w + 2, cx - 8, w - 1, cx - 2);
    }

    // ── Tier 5: teal carbon-fibre pattern + double fold ──────────────────
    if (tier >= 5) {
      // Crosshatch lines simulating carbon weave
      g.lineStyle(0.8, 0x22aa66, 0.35);
      for (let xi = 10; xi < w * 0.55; xi += 10) {
        g.lineBetween(xi, cx - Math.round((cx - 2) * xi / (w * 0.55)), xi + 8, cx - 1);
      }
      // Second fold line
      g.lineStyle(1.5, 0x22aa66, 0.9);
      g.lineBetween(0, Math.round(cx * 0.5), Math.round(w * 0.55), cx - 1);
    }

    // ── Tier 6: purple delta wing extensions ─────────────────────────────
    if (tier >= 6) {
      // Winglet tips: small triangles extending past the body outline
      g.fillStyle(0xaa22aa, 0.85);
      g.fillTriangle(0, 0, 10, cx - 6, 0, cx - 8);          // top front winglet
      g.fillTriangle(0, h, 10, cx + 6, 0, cx + 8);          // bottom front winglet
      // Subtle iridescent sheen across upper face
      g.fillStyle(0xcc88ff, 0.12);
      g.fillTriangle(Math.round(w * 0.1), 1, Math.round(w * 0.8), cx - 1, Math.round(w * 0.1), cx - 4);
    }

    // ── Tier 7: gold championship livery ─────────────────────────────────
    if (tier >= 7) {
      // Gold trim along fold edge
      g.lineStyle(2, 0xffcc00, 0.9);
      g.lineBetween(4, cx + 1, Math.round(w * 0.75), cx + 1);
      // Small gold star near nose
      g.fillStyle(0xffcc00, 1);
      const starX = w - 8; const starY = cx;
      for (let p = 0; p < 5; p++) {
        const a0 = (p / 5) * Math.PI * 2 - Math.PI / 2;
        const a1 = ((p + 0.5) / 5) * Math.PI * 2 - Math.PI / 2;
        g.fillTriangle(
          starX + Math.cos(a0) * 5, starY + Math.sin(a0) * 5,
          starX + Math.cos(a1) * 2, starY + Math.sin(a1) * 2,
          starX + Math.cos(a0 + Math.PI * 2 / 5) * 5, starY + Math.sin(a0 + Math.PI * 2 / 5) * 5,
        );
      }
    }

    // ── Tier 8: navy + chrome — swept double-delta ────────────────────────
    if (tier >= 8) {
      // Chrome highlight strips across both faces
      g.fillStyle(0xddddff, 0.22);
      g.fillTriangle(Math.round(w * 0.22), 1, Math.round(w * 0.88), cx - 1, Math.round(w * 0.22), cx - 5);
      g.lineStyle(1.8, 0xaaaacc, 0.7);
      g.lineBetween(Math.round(w * 0.22), 1, Math.round(w * 0.88), cx - 1);
      // Double nose stripe
      g.lineStyle(1.5, 0x8888cc, 0.85);
      g.lineBetween(w - 12, cx - 6, w, cx);
      g.lineBetween(w - 12, cx + 6, w, cx);
    }

    // ── Tier 9: stealth black — matte with plasma-edge glow ──────────────
    if (tier >= 9) {
      // Override the whole body to matte black
      g.fillStyle(0x111111, 1);
      g.fillTriangle(0, 0, w, cx, 0, h);
      g.fillStyle(0x222222, 1);
      g.fillTriangle(0, cx, w, cx, 4, h - 4);
      // Bright plasma-blue leading edge
      g.lineStyle(2.5, 0x00ccff, 0.95);
      g.lineBetween(0, 0, w, cx);
      g.lineBetween(0, h, w, cx);
      // Plasma glow inner line
      g.lineStyle(1, 0x66eeff, 0.5);
      g.lineBetween(4, 4, w - 4, cx);
      g.lineBetween(4, h - 4, w - 4, cx);
      // Hot exhaust slit at trailing edge
      g.fillStyle(0x00ffff, 0.55);
      g.fillRect(0, cx - 2, 6, 4);
      // Re-draw outline sharp
      g.lineStyle(1, 0x333333, 1);
      g.strokeTriangle(0, 0, w, cx, 0, h);
    }

    g.generateTexture(key, w, h);
    g.destroy();
  }

  // Bright yellow coin with a highlight.
  private generateCoinTexture(): void {
    const size = 22;
    const g = this.add.graphics();

    // Outer ring
    g.fillStyle(0xcc9900, 1);
    g.fillCircle(size / 2, size / 2, size / 2);

    // Coin face
    g.fillStyle(COLOR_COIN, 1);
    g.fillCircle(size / 2, size / 2, size / 2 - 2);

    // Highlight
    g.fillStyle(COLOR_COIN_HIGHLIGHT, 0.9);
    g.fillCircle(size / 2 - 3, size / 2 - 3, 3);

    g.generateTexture('coin', size, size);
    g.destroy();
  }

  // Tree: richer crown with multiple layers and a more detailed trunk.
  private generateTreeTexture(): void {
    const w = 50;
    const h = 90;
    const g = this.add.graphics();

    // Trunk with taper
    g.fillStyle(COLOR_TREE_TRUNK, 1);
    g.fillRect(w / 2 - 7, h - 32, 14, 32);
    g.fillStyle(0x4a2a0c, 1);
    g.fillRect(w / 2 - 7, h - 32, 4, 32); // shadow stripe

    // Crown layer 3 (bottom, widest, darkest)
    g.fillStyle(0x1e5c14, 1);
    g.fillCircle(w / 2 - 10, h - 48, 16);
    g.fillCircle(w / 2 + 10, h - 48, 16);
    g.fillCircle(w / 2, h - 52, 18);

    // Crown layer 2 (mid)
    g.fillStyle(COLOR_TREE_LEAF, 1);
    g.fillCircle(w / 2 - 8, h - 58, 15);
    g.fillCircle(w / 2 + 8, h - 58, 15);
    g.fillCircle(w / 2, h - 64, 17);

    // Crown layer 1 (top, lightest)
    g.fillStyle(0x52c83a, 1);
    g.fillCircle(w / 2, h - 68, 12);

    // Top highlight
    g.fillStyle(0x7adf5e, 0.5);
    g.fillCircle(w / 2 - 4, h - 72, 5);

    g.generateTexture('tree', w, h);
    g.destroy();
  }

  // Soft white cloud for parallax mid-layer.
  private generateCloudTexture(): void {
    const w = 120;
    const h = 50;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.85);
    g.fillCircle(30, 30, 22);
    g.fillCircle(55, 22, 28);
    g.fillCircle(85, 28, 24);
    g.fillCircle(100, 34, 18);
    g.generateTexture('cloud', w, h);
    g.destroy();
  }

  // ── Biome background silhouettes ────────────────────────────────────────

  // City skyline silhouette — tiled white, tinted in GameScene like mountains.
  private generateCitySkylineTexture(): void {
    const key = 'citySkyline';
    if (this.textures.exists(key)) return;
    const w = 700;
    const h = 160;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);

    // Draw a varied cityscape silhouette. Each building is a rectangle.
    // The array encodes [x, groundY_from_bottom, width, height].
    const buildings: [number, number, number, number][] = [
      [0,   0, 40, 100],
      [42,  0, 30, 140],
      [74,  0, 55, 90],
      [131, 0, 25, 120],
      [158, 0, 45, 160],  // tallest tower
      [205, 0, 20, 80],
      [227, 0, 60, 110],
      [289, 0, 35, 130],
      [326, 0, 25, 70],
      [353, 0, 50, 155], // second tallest
      [405, 0, 30, 95],
      [437, 0, 40, 115],
      [479, 0, 55, 85],
      [536, 0, 22, 130],
      [560, 0, 45, 100],
      [607, 0, 38, 120],
      [647, 0, 53, 90],
    ];

    for (const [bx, , bw, bh] of buildings) {
      g.fillRect(bx, h - bh, bw, bh);
    }

    // Antenna spikes on a few of the tallest
    g.fillRect(158 + 20, h - 165, 3, 12); // antenna on tallest
    g.fillRect(353 + 22, h - 162, 3, 11); // antenna on second tallest
    g.fillRect(289 + 14, h - 137, 2, 9);

    // Window dot-grid on taller buildings (darker squares punched out of white)
    g.fillStyle(0xbbbbbb, 0.7);
    // A couple of buildings get a faint window grid for texture (visible under tint)
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 3; c++) {
        g.fillRect(162 + c * 12, h - 155 + r * 18, 5, 8);
        g.fillRect(357 + c * 12, h - 148 + r * 18, 5, 8);
      }
    }

    g.generateTexture(key, w, h);
    g.destroy();
  }

  // Alien rocky terrain for space biome far layer.
  private generateSpaceTerrainTexture(): void {
    const key = 'spaceTerrain';
    if (this.textures.exists(key)) return;
    const w = 600;
    const h = 100;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);

    const points: Phaser.Math.Vector2[] = [];
    points.push(new Phaser.Math.Vector2(0, h));

    // Craggy alien silhouette with more angular peaks than Earth mountains
    const crags = [
      [0, 85], [30, 55], [45, 70], [70, 30], [95, 60], [120, 40],
      [145, 68], [170, 20], [195, 55], [215, 35], [240, 65],
      [265, 42], [290, 70], [315, 28], [340, 52], [365, 72],
      [390, 38], [415, 62], [440, 25], [465, 58], [490, 40],
      [515, 68], [540, 32], [565, 55], [590, 72], [600, 80],
    ];
    for (const [cx, cy] of crags) {
      points.push(new Phaser.Math.Vector2(cx, cy));
    }
    points.push(new Phaser.Math.Vector2(w, h));

    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.closePath();
    g.fillPath();

    g.generateTexture(key, w, h);
    g.destroy();
  }

  // Star field background texture for space biome — packed with many dim/varied dots.
  private generateStarFieldTexture(): void {
    const key = 'starField';
    if (this.textures.exists(key)) return;
    const w = 800;
    const h = 260; // covers top portion of sky
    const g = this.add.graphics();

    // Background — deep space black
    g.fillStyle(0x000000, 1);
    g.fillRect(0, 0, w, h);

    // Place stars deterministically (avoid random() per frame). Use a simple LCG.
    const lcg = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) & 0xffffffff;
        return (s >>> 0) / 0xffffffff;
      };
    };
    const rand = lcg(4277);

    // Many tiny dim stars
    for (let i = 0; i < 220; i++) {
      const sx = Math.floor(rand() * w);
      const sy = Math.floor(rand() * h);
      const brightness = 0.2 + rand() * 0.7;
      const r = Math.round(255 * brightness);
      const gv = Math.round(245 * brightness);
      const b = Math.round(225 * brightness + 30);
      const col = ((r & 0xff) << 16) | ((gv & 0xff) << 8) | (b & 0xff);
      g.fillStyle(col, 1);
      const size = rand() < 0.2 ? 2 : 1;
      g.fillRect(sx, sy, size, size);
    }

    // A handful of larger brighter stars
    for (let i = 0; i < 18; i++) {
      const sx = Math.floor(rand() * w);
      const sy = Math.floor(rand() * h);
      const col = rand() < 0.4 ? 0xaad4ff : (rand() < 0.5 ? 0xffeecc : 0xffffff);
      g.fillStyle(col, 1);
      g.fillCircle(sx, sy, 1.5);
      // Tiny 4-point crosshair glint
      g.fillStyle(col, 0.4);
      g.fillRect(sx - 2, sy, 2, 1);
      g.fillRect(sx + 1, sy, 2, 1);
      g.fillRect(sx, sy - 2, 1, 2);
      g.fillRect(sx, sy + 1, 1, 2);
    }

    g.generateTexture(key, w, h);
    g.destroy();
  }

  // ── Biome obstacles ────────────────────────────────────────────────────

  // City skyscraper: multi-building silhouette variant, lit windows, neon stripe.
  private generateBuildingTexture(): void {
    const w = 70;
    const h = 140;
    const g = this.add.graphics();

    // A building cluster: one tall central + two flanking buildings
    // Left flanking building
    g.fillStyle(0x2a2838, 1);
    g.fillRect(0, 40, 24, h - 40);
    // Right flanking building
    g.fillStyle(0x2e2c3e, 1);
    g.fillRect(46, 55, 24, h - 55);

    // Central tall building
    g.fillStyle(0x3a3850, 1);
    g.fillRect(18, 8, 34, h - 8);

    // Reflective glass panels — light blue stripe on left edge of central building
    g.fillStyle(0x5a7aaa, 0.3);
    g.fillRect(18, 8, 6, h - 8);

    // Central building top edge highlight
    g.fillStyle(0x6a6885, 1);
    g.fillRect(18, 8, 34, 4);

    // Window grid — central building
    const winW = 5;
    const winH = 7;
    const cols = 4;
    const rows = 10;
    const startX = 22;
    const startY = 18;
    const gapX = 7;
    const gapY = 10;
    // Stable deterministic pattern using modulo
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = ((r * 7 + c * 13) % 11) > 3;
        const wx = startX + c * (winW + gapX);
        const wy = startY + r * (winH + gapY);
        if (lit) {
          const warm = (r + c) % 3 === 0;
          g.fillStyle(warm ? 0xffe89a : 0xd4f0ff, 1);
        } else {
          g.fillStyle(0x111118, 1);
        }
        g.fillRect(wx, wy, winW, winH);
      }
    }

    // Windows on left flanking building (sparser)
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 2; c++) {
        const lit = ((r * 5 + c * 9) % 7) > 2;
        if (lit) {
          g.fillStyle((r + c) % 2 === 0 ? 0xffe89a : 0xfff8c0, 1);
          g.fillRect(3 + c * 9, 48 + r * 14, 5, 7);
        }
      }
    }

    // Neon accent bar on central building roof edge
    g.fillStyle(0xff4488, 1);
    g.fillRect(18, 8, 34, 2);
    // Neon glow overlay (soft)
    g.fillStyle(0xff88bb, 0.35);
    g.fillRect(17, 7, 36, 5);

    // Antenna
    g.fillStyle(0x1e1c28, 1);
    g.fillRect(w / 2 - 1, 0, 2, 10);
    g.fillStyle(0xff3a3a, 1);
    g.fillCircle(w / 2, 1, 2.5);
    // Blinking light glow
    g.fillStyle(0xff6666, 0.4);
    g.fillCircle(w / 2, 1, 4);

    g.generateTexture('building', w, h);
    g.destroy();
  }

  // Jungle palm tree: multi-frond canopy, curved trunk, coconuts.
  private generatePalmTreeTexture(): void {
    const w = 70;
    const h = 110;
    const g = this.add.graphics();

    // Trunk — drawn as a series of offset segments to create an organic curve.
    // Trunk base is wider than the top.
    const segments = 18;
    for (let i = 0; i < segments; i++) {
      const t = i / segments;
      const segY = h - (i * (h - 28) / segments);
      const nextY = h - ((i + 1) * (h - 28) / segments);
      const sway = Math.sin(t * 2.5 + 0.5) * 6;
      const trunkW = 10 - t * 3; // tapers from 10 to 7
      const trunkX = w / 2 - trunkW / 2 + sway;

      // Main trunk
      g.fillStyle(0x6b4220, 1);
      g.fillRect(trunkX, nextY, trunkW, segY - nextY + 1);

      // Shadow stripe (right side)
      g.fillStyle(0x3d2510, 0.6);
      g.fillRect(trunkX + trunkW - 2, nextY, 2, segY - nextY + 1);

      // Highlight stripe (left side)
      g.fillStyle(0x8a5a2e, 0.4);
      g.fillRect(trunkX, nextY, 2, segY - nextY + 1);
    }

    // Trunk bands (horizontal notch lines)
    for (let i = 0; i < 7; i++) {
      const bandT = i / 7;
      const bSway = Math.sin(bandT * 2.5 + 0.5) * 6;
      const bandY = h - 10 - bandT * (h - 38);
      g.fillStyle(0x3d2510, 0.5);
      g.fillRect(w / 2 - 6 + bSway, bandY, 11, 1);
    }

    // Fronds — 9 large fronds radiating from the crown
    const topX = w / 2 + Math.sin(2.5) * 6;
    const topY = 28;
    const frondAngles = [-2.5, -1.9, -1.3, -0.65, 0.0, 0.65, 1.3, 1.9, 2.5];
    const frondLengths = [28, 34, 38, 40, 36, 40, 38, 34, 28];

    for (let fi = 0; fi < frondAngles.length; fi++) {
      const ang = frondAngles[fi];
      const len = frondLengths[fi];
      // Each frond is a series of progressively smaller circles along the angle
      for (let i = 1; i <= 7; i++) {
        const dist = i * (len / 7);
        const droop = Math.pow(i / 7, 1.5) * 14; // frond tips droop down
        const fx = topX + Math.sin(ang) * dist;
        const fy = topY - Math.cos(ang) * dist + droop;
        const radius = Math.max(2, 6.5 - i * 0.65);

        // Frond color varies: base is dark, tips are lighter
        const greenMix = i / 7;
        const rVal = Math.round(0x12 + greenMix * (0x3a - 0x12));
        const gVal = Math.round(0x5a + greenMix * (0x9e - 0x5a));
        const bVal = Math.round(0x14 + greenMix * (0x18 - 0x14));
        g.fillStyle((rVal << 16) | (gVal << 8) | bVal, 1);
        g.fillCircle(fx, fy, radius);
      }

      // Frond midrib (thin center line)
      g.lineStyle(1, 0x1a4a18, 0.6);
      const endX = topX + Math.sin(ang) * len * 0.9;
      const endY = topY - Math.cos(ang) * len * 0.9 + Math.pow(0.9, 1.5) * 14;
      g.lineBetween(topX, topY, endX, endY);
    }

    // Crown centre (dark knot)
    g.fillStyle(0x2a3a18, 1);
    g.fillCircle(topX, topY, 6);

    // 2-3 coconuts clustered at base of fronds
    g.fillStyle(0x7a4a22, 1);
    g.fillCircle(topX - 5, topY + 6, 4);
    g.fillCircle(topX + 4, topY + 8, 4);
    g.fillCircle(topX + 0, topY + 11, 3.5);
    g.fillStyle(0x5a3210, 1);
    g.fillCircle(topX - 5, topY + 6, 2);
    g.fillCircle(topX + 4, topY + 8, 2);

    g.generateTexture('palmTree', w, h);
    g.destroy();
  }

  // Desert cactus: tall saguaro with fat arms and surface details.
  private generateCactusTexture(): void {
    const w = 48;
    const h = 90;
    const g = this.add.graphics();

    // Main body — rounded, slightly tapered
    g.fillStyle(0x2e7a3c, 1);
    g.fillRoundedRect(w / 2 - 8, 8, 16, h - 8, 6);

    // Right arm — angles upward then has a horizontal bend at top
    g.fillStyle(0x2e7a3c, 1);
    g.fillRoundedRect(w / 2 + 8, 22, 12, 20, 4); // horizontal connector
    g.fillRoundedRect(w / 2 + 14, 12, 10, 32, 4); // vertical arm

    // Left arm — lower, shorter
    g.fillRoundedRect(4, 36, 12, 18, 4); // horizontal connector
    g.fillRoundedRect(4, 26, 10, 28, 4); // vertical arm

    // Shading on all parts — right-side darker strips
    g.fillStyle(0x1e5228, 0.6);
    g.fillRoundedRect(w / 2 + 4, 8, 4, h - 10, 3); // main body shadow
    g.fillRect(w / 2 + 16, 12, 4, 30); // right arm shadow
    g.fillRect(6, 26, 4, 28); // left arm shadow

    // Highlight — left-side lighter strip
    g.fillStyle(0x4ab85e, 0.55);
    g.fillRect(w / 2 - 8, 10, 3, h - 14);
    g.fillRect(4, 28, 3, 24);
    g.fillRect(w / 2 + 14, 14, 3, 28);

    // Spine details — pairs of tiny white dots along the ribs
    g.fillStyle(0xd8f0d0, 0.8);
    const spinePositions = [
      [w / 2 - 7, 16], [w / 2 - 7, 26], [w / 2 - 7, 36], [w / 2 - 7, 46],
      [w / 2 - 7, 56], [w / 2 - 7, 66], [w / 2 - 7, 76],
      [w / 2 + 5, 16], [w / 2 + 5, 26], [w / 2 + 5, 36], [w / 2 + 5, 46],
    ];
    for (const [sx, sy] of spinePositions) {
      g.fillRect(sx, sy, 2, 1);
      g.fillRect(sx + 3, sy, 2, 1);
    }

    // Flower on top — small pink bloom
    g.fillStyle(0xffaacc, 1);
    for (let p = 0; p < 6; p++) {
      const pa = (p / 6) * Math.PI * 2;
      g.fillCircle(w / 2 + Math.cos(pa) * 4, 8 + Math.sin(pa) * 3, 2.5);
    }
    g.fillStyle(0xffeeaa, 1);
    g.fillCircle(w / 2, 8, 3);

    g.generateTexture('cactus', w, h);
    g.destroy();
  }

  // Arctic ice tree: multi-faceted crystal formation with internal light refraction.
  private generateIceTreeTexture(): void {
    const w = 56;
    const h = 100;
    const g = this.add.graphics();

    const midX = w / 2;
    const baseY = h - 14;

    // Trunk — icy blue-white pillar
    g.fillStyle(0x8ab8cc, 1);
    g.fillRect(midX - 4, baseY - 20, 8, 22);
    g.fillStyle(0xd0eeff, 0.5);
    g.fillRect(midX - 4, baseY - 20, 2, 22);

    // Main crystal spire (center, tallest)
    const mainSpire: Phaser.Geom.Point[] = [
      new Phaser.Geom.Point(midX - 10, baseY - 16),
      new Phaser.Geom.Point(midX - 6, baseY - 48),
      new Phaser.Geom.Point(midX, 4),               // tip
      new Phaser.Geom.Point(midX + 6, baseY - 48),
      new Phaser.Geom.Point(midX + 10, baseY - 16),
    ];
    g.fillStyle(0xd8f0ff, 1);
    g.fillPoints(mainSpire, true);
    // Inner shading
    g.fillStyle(0x8ab8d8, 0.5);
    g.fillTriangle(midX, baseY - 16, midX + 5, baseY - 46, midX + 9, baseY - 16);
    // Left face lighter
    g.fillStyle(0xeef8ff, 0.7);
    g.fillTriangle(midX, baseY - 16, midX - 5, baseY - 46, midX, 4);

    // Left secondary crystal
    const leftSpire: Phaser.Geom.Point[] = [
      new Phaser.Geom.Point(midX - 18, baseY - 10),
      new Phaser.Geom.Point(midX - 14, baseY - 34),
      new Phaser.Geom.Point(midX - 8, baseY - 52),
      new Phaser.Geom.Point(midX - 6, baseY - 34),
      new Phaser.Geom.Point(midX - 4, baseY - 10),
    ];
    g.fillStyle(0xc4e8ff, 0.9);
    g.fillPoints(leftSpire, true);
    g.fillStyle(0x7aaac4, 0.4);
    g.fillTriangle(midX - 8, baseY - 10, midX - 6, baseY - 34, midX - 4, baseY - 10);

    // Right secondary crystal
    const rightSpire: Phaser.Geom.Point[] = [
      new Phaser.Geom.Point(midX + 4, baseY - 10),
      new Phaser.Geom.Point(midX + 6, baseY - 30),
      new Phaser.Geom.Point(midX + 10, baseY - 48),
      new Phaser.Geom.Point(midX + 15, baseY - 30),
      new Phaser.Geom.Point(midX + 18, baseY - 10),
    ];
    g.fillStyle(0xb8deff, 0.9);
    g.fillPoints(rightSpire, true);
    g.fillStyle(0x6898b8, 0.4);
    g.fillTriangle(midX + 10, baseY - 10, midX + 14, baseY - 30, midX + 18, baseY - 10);

    // Small outcrops at base
    g.fillStyle(0xe8f8ff, 0.8);
    g.fillTriangle(midX - 22, baseY, midX - 18, baseY - 12, midX - 10, baseY);
    g.fillTriangle(midX + 10, baseY, midX + 18, baseY - 10, midX + 22, baseY);

    // Highlight lines on main spire faces
    g.lineStyle(1.5, 0xffffff, 0.9);
    g.lineBetween(midX - 7, baseY - 22, midX - 3, baseY - 52);

    // Internal refraction glint — a small bright triangle inside
    g.fillStyle(0xffffff, 0.6);
    g.fillTriangle(midX - 2, baseY - 30, midX + 3, baseY - 30, midX, baseY - 40);

    g.generateTexture('iceTree', w, h);
    g.destroy();
  }

  // Space asteroid: chunky irregular rock with varied craters and rough surface.
  private generateAsteroidTexture(): void {
    const w = 52;
    const h = 52;
    const g = this.add.graphics();

    const cx = w / 2;
    const cy = h / 2;

    // Main body — irregular polygon
    const points: Phaser.Geom.Point[] = [];
    const segments = 12;
    const radii = [20, 17, 22, 18, 20, 16, 24, 19, 21, 17, 22, 18];
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const r = radii[i % radii.length];
      points.push(new Phaser.Geom.Point(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }

    // Base rock color — warm grey-brown
    g.fillStyle(0x7a7470, 1);
    g.fillPoints(points, true);

    // Surface layers — lighter top-left face
    g.fillStyle(0xa09890, 0.5);
    g.fillTriangle(cx - 18, cy - 6, cx - 2, cy - 20, cx + 8, cy - 14);
    g.fillTriangle(cx - 18, cy - 6, cx + 8, cy - 14, cx + 18, cy);

    // Dark shadow — bottom-right
    g.fillStyle(0x3a3430, 0.65);
    g.fillTriangle(cx, cy, cx + 20, cy, cx + 16, cy + 18);
    g.fillTriangle(cx, cy, cx + 16, cy + 18, cx - 4, cy + 20);
    g.fillTriangle(cx, cy, cx - 4, cy + 20, cx - 18, cy + 10);

    // Large crater (center-left)
    g.fillStyle(0x3e3830, 1);
    g.fillCircle(cx - 6, cy - 4, 7);
    g.fillStyle(0x4e4840, 0.7);
    g.fillCircle(cx - 6, cy - 4, 5);
    // Crater rim highlight
    g.lineStyle(1, 0x888278, 0.8);
    g.strokeCircle(cx - 6, cy - 4, 7);
    // Crater floor
    g.fillStyle(0x2e2a26, 1);
    g.fillCircle(cx - 6, cy - 4, 3);

    // Medium crater (right side)
    g.fillStyle(0x3a3428, 1);
    g.fillCircle(cx + 8, cy + 2, 5);
    g.fillStyle(0x2a2420, 1);
    g.fillCircle(cx + 8, cy + 2, 2.5);
    g.lineStyle(1, 0x807870, 0.7);
    g.strokeCircle(cx + 8, cy + 2, 5);

    // Small crater (top)
    g.fillStyle(0x444038, 1);
    g.fillCircle(cx + 2, cy - 12, 3);
    g.fillStyle(0x2c2820, 1);
    g.fillCircle(cx + 2, cy - 12, 1.5);

    // Surface rock texture — tiny raised bumps
    g.fillStyle(0x8e8880, 0.6);
    g.fillCircle(cx - 14, cy + 4, 2);
    g.fillCircle(cx + 14, cy - 8, 1.5);
    g.fillCircle(cx - 4, cy + 14, 2);

    // Highlight on top-left edge
    g.fillStyle(0xc0b8b0, 0.6);
    g.fillCircle(cx - 14, cy - 10, 3);

    g.generateTexture('asteroid', w, h);
    g.destroy();
  }

  // ── Biome ambient particles ────────────────────────────────────────────

  // Snowflake: proper 6-arm star with diagonal arms.
  private generateSnowflakeTexture(): void {
    const size = 12;
    const c = size / 2;
    const g = this.add.graphics();

    // 6-arm snowflake
    g.lineStyle(1.5, 0xddeeff, 1);
    // Cardinal arms
    g.lineBetween(c, 0, c, size);
    g.lineBetween(0, c, size, c);
    // Diagonal arms (60deg pattern)
    const d = c * 0.87;
    g.lineBetween(c - d, c - d * 0.5, c + d, c + d * 0.5);
    g.lineBetween(c + d, c - d * 0.5, c - d, c + d * 0.5);
    // Tiny crossbars on each arm
    g.lineStyle(1, 0xddeeff, 0.7);
    const barOffset = c * 0.5;
    g.lineBetween(c - 2, c - barOffset, c + 2, c - barOffset);
    g.lineBetween(c - 2, c + barOffset, c + 2, c + barOffset);
    g.lineBetween(c - barOffset, c - 2, c - barOffset, c + 2);
    g.lineBetween(c + barOffset, c - 2, c + barOffset, c + 2);

    // Centre dot
    g.fillStyle(0xffffff, 1);
    g.fillCircle(c, c, 1.5);

    g.generateTexture('snowflake', size, size);
    g.destroy();
  }

  // Star: compact bright dot with 4-point glint for space twinkling.
  private generateStarTexture(): void {
    const size = 8;
    const c = size / 2;
    const g = this.add.graphics();

    // Glow halo
    g.fillStyle(0xaaccff, 0.25);
    g.fillCircle(c, c, c);

    // Core
    g.fillStyle(0xfff8d0, 1);
    g.fillCircle(c, c, 2);

    // 4-point crosshair spike
    g.fillStyle(0xffffff, 0.8);
    g.fillRect(0, c - 0.5, size, 1);
    g.fillRect(c - 0.5, 0, 1, size);

    g.generateTexture('star', size, size);
    g.destroy();
  }

  // Firefly: soft radial glow with bright core — must be large enough to read.
  private generateFireflyTexture(): void {
    const size = 16;
    const c = size / 2;
    const g = this.add.graphics();

    // Outer glow (soft, wide)
    g.fillStyle(0x88ff44, 0.18);
    g.fillCircle(c, c, c);

    // Mid glow
    g.fillStyle(0xaaff66, 0.4);
    g.fillCircle(c, c, 5);

    // Inner bright core
    g.fillStyle(0xddff88, 0.9);
    g.fillCircle(c, c, 3);

    // Hot centre
    g.fillStyle(0xeeffbb, 1);
    g.fillCircle(c, c, 1.5);

    g.generateTexture('firefly', size, size);
    g.destroy();
  }

  // Leaf: tapered ellipse with midrib for organic jungle feel.
  private generateLeafTexture(): void {
    const w = 12;
    const h = 7;
    const g = this.add.graphics();

    // Main leaf body
    g.fillStyle(0x3a9a2a, 1);
    g.fillEllipse(w / 2, h / 2, w, h);

    // Darker underside shadow (right half)
    g.fillStyle(0x1e6618, 0.5);
    g.fillEllipse(w / 2 + 2, h / 2, w * 0.7, h * 0.9);

    // Midrib (center vein)
    g.lineStyle(1, 0x2a7a1e, 0.8);
    g.lineBetween(1, h / 2, w - 1, h / 2);

    // Tip highlight
    g.fillStyle(0x6aca4a, 0.5);
    g.fillEllipse(3, h / 2, 4, 3);

    g.generateTexture('leaf', w, h);
    g.destroy();
  }

  // Smoke puff: large soft circle for city exhaust, tintable.
  private generateSmokePuffTexture(): void {
    const size = 32;
    const c = size / 2;
    const g = this.add.graphics();

    // Multiple overlapping soft circles for a fluffy smoke look
    g.fillStyle(0xffffff, 0.15);
    g.fillCircle(c, c, c);
    g.fillStyle(0xffffff, 0.2);
    g.fillCircle(c - 4, c + 2, 10);
    g.fillStyle(0xffffff, 0.25);
    g.fillCircle(c + 3, c - 3, 9);
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(c, c, 7);
    g.fillStyle(0xffffff, 0.35);
    g.fillCircle(c - 2, c + 1, 5);

    g.generateTexture('smokePuff', size, size);
    g.destroy();
  }

  // Sand grain: tiny warm-tinted rounded rectangle for desert wind.
  private generateSandGrainTexture(): void {
    const size = 6;
    const g = this.add.graphics();

    g.fillStyle(0xe8c878, 1);
    g.fillEllipse(3, 3, 5, 3);
    g.fillStyle(0xf0d898, 0.6);
    g.fillEllipse(2, 2, 2, 2);

    g.generateTexture('sandGrain', size, size);
    g.destroy();
  }

  // City light: small bright dot for window-twinkle particle effect.
  private generateCityLightTexture(): void {
    const size = 6;
    const c = size / 2;
    const g = this.add.graphics();

    g.fillStyle(0xffd080, 0.4);
    g.fillCircle(c, c, c);
    g.fillStyle(0xffe8a0, 0.8);
    g.fillCircle(c, c, 2);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(c, c, 1);

    g.generateTexture('cityLight', size, size);
    g.destroy();
  }

  // Nebula particle: soft pink/purple glow for space atmosphere.
  private generateNebulaParticleTexture(): void {
    const size = 20;
    const c = size / 2;
    const g = this.add.graphics();

    g.fillStyle(0x8844cc, 0.08);
    g.fillCircle(c, c, c);
    g.fillStyle(0xaa66ee, 0.12);
    g.fillCircle(c, c, 8);
    g.fillStyle(0xcc99ff, 0.18);
    g.fillCircle(c, c, 5);

    g.generateTexture('nebulaParticle', size, size);
    g.destroy();
  }

  // Birds: warm reddish-brown thrush silhouette in three wing positions for
  // flap animation. wingsUp < 0 = tips high, 0 = level, > 0 = tips low.
  private generateBirdFrames(): void {
    this.drawBirdFrame('bird_0', -6);  // wings up
    this.drawBirdFrame('bird_1',  0);  // wings level
    this.drawBirdFrame('bird_2',  9);  // wings down
  }

  private drawBirdFrame(key: string, wingsUp: number): void {
    const w = 40;
    const h = 28;
    const g = this.add.graphics();
    const cx = w / 2;
    const cy = h / 2;

    const outerTipY = cy - 6 + wingsUp;
    const innerTipY = cy - 9 + wingsUp;

    g.fillStyle(0x000000, 0.18);
    g.fillEllipse(cx + 1, cy + 3, 28, 7);

    // Left wing outer (darker underside)
    g.fillStyle(0x6b3a1a, 1);
    g.fillTriangle(cx - 2, cy + 1, 0, outerTipY, cx - 10, cy + 4);
    // Left wing inner (lighter dorsal)
    g.fillStyle(0x9a5a2a, 1);
    g.fillTriangle(cx - 2, cy - 1, 4, innerTipY, cx - 10, cy + 2);

    // Right wing outer
    g.fillStyle(0x6b3a1a, 1);
    g.fillTriangle(cx + 2, cy + 1, w, outerTipY, cx + 10, cy + 4);
    // Right wing inner
    g.fillStyle(0x9a5a2a, 1);
    g.fillTriangle(cx + 2, cy - 1, w - 4, innerTipY, cx + 10, cy + 2);

    g.lineStyle(1, 0x3a1a08, 0.7);
    g.lineBetween(3, outerTipY + 1, cx - 8, cy + 3);
    g.lineBetween(w - 3, outerTipY + 1, cx + 8, cy + 3);

    g.fillStyle(0xb86030, 1);
    g.fillEllipse(cx, cy + 2, 14, 8);
    g.fillStyle(0xe07838, 0.7);
    g.fillEllipse(cx + 1, cy + 3, 8, 5);

    g.fillStyle(0x3a2010, 1);
    g.fillCircle(cx + 7, cy - 1, 5);
    g.fillStyle(0x7a4020, 1);
    g.fillCircle(cx + 7, cy + 1, 3);

    g.fillStyle(0xe09a20, 1);
    g.fillTriangle(cx + 11, cy - 2, cx + 16, cy - 1, cx + 11, cy + 1);
    g.fillStyle(0xc07a10, 1);
    g.fillTriangle(cx + 11, cy + 1, cx + 14, cy + 2, cx + 11, cy + 2);

    g.fillStyle(0xfff8e0, 1);
    g.fillCircle(cx + 8, cy - 2, 2);
    g.fillStyle(0x1a0808, 1);
    g.fillCircle(cx + 8, cy - 2, 1.1);
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(cx + 8, cy - 3, 1, 1);

    g.fillStyle(0x4a2210, 1);
    g.fillTriangle(cx - 7, cy + 2, cx - 13, cy + 6, cx - 5, cy - 1);
    g.fillStyle(0x6b3a1a, 0.8);
    g.fillTriangle(cx - 6, cy + 1, cx - 14, cy + 3, cx - 7, cy - 2);

    g.generateTexture(key, w, h);
    g.destroy();
  }

  // Small commercial airplane: side-view silhouette, white so biome tints work.
  // Faces right. Fuselage + swept wings + tail fin + cabin windows.
  private generateAirplaneTexture(): void {
    const w = 60;
    const h = 26;
    const g = this.add.graphics();
    const cy = h / 2;

    g.fillStyle(0xffffff, 1);

    // Fuselage
    g.fillRoundedRect(4, cy - 4, 46, 8, 4);
    // Nose cone — pointed right
    g.fillTriangle(50, cy - 3, 59, cy, 50, cy + 3);
    // Tail fairing (rounded bulge at rear)
    g.fillCircle(6, cy, 5);

    // Main wings — swept back, symmetric above and below fuselage
    g.fillTriangle(30, cy - 4, 44, cy - 4, 16, cy - 14);
    g.fillTriangle(30, cy + 4, 44, cy + 4, 16, cy + 14);

    // Vertical tail fin
    g.fillTriangle(6, cy - 4, 18, cy - 4, 10, cy - 13);
    // Horizontal stabilisers (small)
    g.fillTriangle(5, cy - 1, 16, cy - 1, 10, cy - 7);
    g.fillTriangle(5, cy + 1, 16, cy + 1, 10, cy + 7);

    // Engine nacelle under left wing
    g.fillRoundedRect(18, cy + 5, 14, 4, 2);

    // Cabin windows — blue tint
    g.fillStyle(0x88ccff, 0.9);
    for (let i = 0; i < 5; i++) {
      g.fillRect(32 + i * 6, cy - 2, 4, 4);
    }

    g.generateTexture('airplane', w, h);
    g.destroy();
  }

  // Hexagonal shield shard — cyan, used for shield-absorb burst.
  private generateShieldChargeTexture(): void {
    const size = 12;
    const c = size / 2;
    const g = this.add.graphics();
    const pts: Phaser.Types.Math.Vector2Like[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      pts.push({ x: c + Math.cos(a) * (c - 1), y: c + Math.sin(a) * (c - 1) });
    }
    g.fillStyle(0x88eeff, 0.7);
    g.fillPoints(pts, true);
    g.lineStyle(1.5, 0x44ddff, 1.0);
    g.strokePoints(pts, true);
    g.generateTexture('shieldCharge', size, size);
    g.destroy();
  }

  // Elongated hot-gradient flame for turbo burst.
  private generateTurboFlameTexture(): void {
    const w = 16;
    const h = 7;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.9);
    g.fillEllipse(w * 0.72, h / 2, w * 0.45, h * 0.85);
    g.fillStyle(0xffee00, 0.85);
    g.fillEllipse(w * 0.48, h / 2, w * 0.58, h * 0.78);
    g.fillStyle(0xff7700, 0.80);
    g.fillEllipse(w * 0.25, h / 2, w * 0.48, h * 0.65);
    g.fillStyle(0xff2200, 0.65);
    g.fillEllipse(w * 0.08, h / 2, w * 0.22, h * 0.45);
    g.generateTexture('turboFlame', w, h);
    g.destroy();
  }

  // Wind particle: elongated teardrop / streak — 12x4px, white-ish.
  // Rotated by the emitter angle to read as a directional gust streak.
  private generateWindParticleTexture(): void {
    const w = 12;
    const h = 4;
    const g = this.add.graphics();

    // Tapered oval — brighter at the head, trails to transparent tail.
    // Head (right side)
    g.fillStyle(0xffffff, 0.9);
    g.fillEllipse(w * 0.65, h / 2, w * 0.55, h * 0.85);
    // Mid body
    g.fillStyle(0xffffff, 0.55);
    g.fillEllipse(w * 0.35, h / 2, w * 0.55, h * 0.65);
    // Tail fade
    g.fillStyle(0xffffff, 0.18);
    g.fillEllipse(w * 0.1, h / 2, w * 0.25, h * 0.4);

    g.generateTexture('windParticle', w, h);
    g.destroy();
  }

  // Feather particle: 8x3px elongated warm-white oval with a brown vein.
  private generateFeatherTexture(): void {
    const w = 8;
    const h = 3;
    const g = this.add.graphics();

    // Pale warm feather body
    g.fillStyle(0xf5e8d0, 1);
    g.fillEllipse(w / 2, h / 2, w, h);
    // Brown rachis (centre vein)
    g.lineStyle(0.5, 0x8a5a2a, 0.8);
    g.lineBetween(1, h / 2, w - 1, h / 2);
    // Slight shadow on lower half
    g.fillStyle(0xc8a878, 0.35);
    g.fillEllipse(w / 2 + 1, h / 2 + 0.5, w * 0.7, h * 0.5);

    g.generateTexture('feather', w, h);
    g.destroy();
  }
}
