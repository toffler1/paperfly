// GameScene - core gameplay loop.
//
// Three phases:
//   1. AIMING  - player drags from launch point to set angle + power
//   2. FLYING  - manual physics integration; camera follows plane
//   3. LANDED  - shows result panel, transitions to ShopScene
//
// Physics is intentionally simple (no Matter.js):
//   vx *= (1 - drag)          // air drag
//   vy += gravity - lift      // lift counteracts gravity, proportional to forward speed
//   lift fades over time      // simulates losing energy / glide deteriorating

import Phaser from 'phaser';
import { AudioManager } from '../audio/AudioManager';
import { BiomeManager, type BiomeConfig } from '../BiomeManager';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GROUND_Y,
  LAUNCH_X,
  LAUNCH_Y,
  GRAVITY,
  BASE_LIFT_FACTOR,
  LIFT_DECAY_PER_FRAME,
  BASE_DRAG,
  GROUND_DRAG,
  MAX_DRAG_DISTANCE,
  MIN_LAUNCH_POWER,
  BASE_MAX_LAUNCH_POWER,
  MIN_AIM_ANGLE_DEG,
  MAX_AIM_ANGLE_DEG,
  COIN_VALUE,
  COIN_RADIUS,
  PIXELS_PER_METER,
  SPAWN_AHEAD_DISTANCE,
  COIN_SPAWN_INTERVAL_X,
  OBSTACLE_SPAWN_INTERVAL_X,
  COLOR_MOUNTAIN_FAR,
  COLOR_MOUNTAIN_NEAR,
  COLOR_GROUND,
} from '../config';
import {
  addCoins,
  getCurrentMultiplier,
  getTier,
  maybeUpdateBestDistance,
} from '../upgrades';

type Phase = 'aiming' | 'flying' | 'crashing' | 'landed';

interface Coin {
  sprite: Phaser.GameObjects.Image;
  collected: boolean;
}

interface Obstacle {
  sprite: Phaser.GameObjects.Image;
  hitboxRadius: number;
  type: 'hard' | 'soft';
  hit: boolean;
}

interface WindZone {
  x: number;
  y: number;
  width: number;
  height: number;
  windVx: number;
  visual: Phaser.GameObjects.Graphics;
  streakEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
}

interface Bird {
  sprite: Phaser.GameObjects.Image;
  type: 'bird' | 'plane';
  vx: number;
  baseY: number;
  minWorldX: number;
  maxWorldX: number;
  bobPhase: number;
  hit: boolean;
  frameIndex: number;
  frameTimer: number;
}

export class GameScene extends Phaser.Scene {
  private phase: Phase = 'aiming';
  private plane!: Phaser.GameObjects.Image;
  private vx: number = 0;
  private vy: number = 0;
  private liftFactor: number = BASE_LIFT_FACTOR;
  private isAiming: boolean = false;
  private aimStart = new Phaser.Math.Vector2(LAUNCH_X, LAUNCH_Y);
  private aimCurrent = new Phaser.Math.Vector2(LAUNCH_X, LAUNCH_Y);
  private rubberBandGfx!: Phaser.GameObjects.Graphics;
  private aimArrowGfx!: Phaser.GameObjects.Graphics;
  private maxLaunchPower: number = BASE_MAX_LAUNCH_POWER;
  private dragCoefficient: number = BASE_DRAG;
  private magnetRadius: number = 0;
  private coins: Coin[] = [];
  private obstacles: Obstacle[] = [];
  private coinsCollected: number = 0;
  private nextCoinSpawnX: number = 0;
  private nextObstacleSpawnX: number = 0;
  private nextWindZoneSpawnX: number = 0;
  private nextBirdSpawnX: number = 0;
  private windZones: WindZone[] = [];
  private inWindZone: boolean = false;
  private birdImpactPenalty: number = 0.55;
  private birds: Bird[] = [];
  private magnetRingGfx: Phaser.GameObjects.Graphics | null = null;
  private boostEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private static readonly BIRD_FRAMES = [0, 1, 2, 1] as const;
  private layerFarMountains!: Phaser.GameObjects.TileSprite;
  private layerNearMountains!: Phaser.GameObjects.TileSprite;
  private layerClouds!: Phaser.GameObjects.TileSprite;
  private layerClouds2!: Phaser.GameObjects.TileSprite;
  private groundGfx!: Phaser.GameObjects.TileSprite;
  private starFieldLayer: Phaser.GameObjects.Image | null = null;
  private altitudeStarLayer: Phaser.GameObjects.Image | null = null;
  private auroraGfx!: Phaser.GameObjects.Graphics;
  private horizonHazeGfx!: Phaser.GameObjects.Graphics;
  private nextAltitudeCoinX: number = 0;
  private shieldCharges: number = 0;
  private currentShieldCharges: number = 0;
  private shieldGfx: Phaser.GameObjects.Graphics | null = null;
  private laserReloadMs: number = 0;
  private laserTimer: number = 0;
  private laserFlashTimer: number = 0;
  private laserGfx: Phaser.GameObjects.Graphics | null = null;
  private turboPower: number = 0;
  private turboCooldownTimer: number = 0;
  private turboEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private turboReadyText!: Phaser.GameObjects.Text;
  private tiresGroundDragFactor: number = 1.0;
  private wheelsGfx: Phaser.GameObjects.Graphics | null = null;
  private bounceVelocity: number = 0;
  private bouncesLeft: number = 0;
  private launchpadGfx!: Phaser.GameObjects.Graphics;
  private audio!: AudioManager;
  private trailEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private windFlybyEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private distanceText!: Phaser.GameObjects.Text;
  private altitudeText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private turboBarGfx!: Phaser.GameObjects.Graphics;
  private hintText!: Phaser.GameObjects.Text;
  private resultContainer!: Phaser.GameObjects.Container;
  private biomeManager!: BiomeManager;
  private currentBiomeId: string = '';
  private currentBiome!: BiomeConfig;
  private skyBand0!: Phaser.GameObjects.Rectangle;
  private skyBand1!: Phaser.GameObjects.Rectangle;
  private skyBand2!: Phaser.GameObjects.Rectangle;
  private skyBand3!: Phaser.GameObjects.Rectangle;
  private ambientEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private ambientEmitterSecondary: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private biomeBannerContainer: Phaser.GameObjects.Container | null = null;
  private skyTweens: (Phaser.Tweens.Tween | null)[] = [null, null, null, null];

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.resetState();
    this.audio = AudioManager.getInstance();
    this.audio.playMusic('flight');
    this.biomeManager = new BiomeManager();
    this.buildParallaxBackground();
    this.buildGround();
    this.buildLaunchpad();
    this.buildPlane();
    this.buildAimingOverlays();
    this.buildHUD();
    this.setupCamera();
    this.setupInput();
    this.applyUpgradesToStats();
    this.buildUpgradeVisuals();
    this.seedInitialWorld();
    this.applyInitialBiome();
  }

  private resetState(): void {
    this.phase = 'aiming';
    this.isAiming = false;
    this.vx = 0;
    this.vy = 0;
    this.liftFactor = BASE_LIFT_FACTOR;
    this.coins = [];
    this.obstacles = [];
    this.windZones = [];
    this.birds = [];
    this.coinsCollected = 0;
    this.nextCoinSpawnX = LAUNCH_X + 200;
    this.nextObstacleSpawnX = LAUNCH_X + 400;
    this.nextWindZoneSpawnX = LAUNCH_X + 350;
    this.nextBirdSpawnX = LAUNCH_X + 280;
    this.inWindZone = false;
    this.currentBiomeId = '';
    this.nextAltitudeCoinX = 0;
    this.shieldCharges = 0;
    this.currentShieldCharges = 0;
    this.shieldGfx = null;
    this.laserReloadMs = 0;
    this.laserTimer = 0;
    this.laserFlashTimer = 0;
    this.laserGfx = null;
    this.turboPower = 0;
    this.turboCooldownTimer = 0;
    this.turboEmitter = null;
    this.tiresGroundDragFactor = 1.0;
    this.wheelsGfx = null;
    this.bounceVelocity = 0;
    this.bouncesLeft = 0;
    this.ambientEmitter = null;
    this.ambientEmitterSecondary = null;
    this.biomeBannerContainer = null;
    this.skyTweens = [null, null, null, null];
    this.starFieldLayer = null;
    this.altitudeStarLayer = null;
    this.windFlybyEmitter = null;
    this.magnetRingGfx = null;
    this.boostEmitter = null;
  }

  private applyUpgradesToStats(): void {
    this.maxLaunchPower = BASE_MAX_LAUNCH_POWER * getCurrentMultiplier('rubberBand');
    this.dragCoefficient = BASE_DRAG * getCurrentMultiplier('glide');
    this.magnetRadius = getCurrentMultiplier('magnet');
    this.shieldCharges = Math.round(getCurrentMultiplier('shield'));
    this.laserReloadMs = getCurrentMultiplier('laser');
    this.turboPower = getCurrentMultiplier('turbo');
    this.tiresGroundDragFactor = getCurrentMultiplier('tires');
    this.bounceVelocity = getCurrentMultiplier('bounce');
  }

  private buildUpgradeVisuals(): void {
    const glideTier = getTier('glide');
    if (glideTier > 0) {
      this.plane.setTexture(`plane_g${Math.min(glideTier, 9)}`);
    }

    if (this.magnetRadius > 0) {
      this.magnetRingGfx = this.add.graphics().setDepth(12);
    }

    if (this.shieldCharges > 0) {
      this.shieldGfx = this.add.graphics().setDepth(13);
      this.currentShieldCharges = this.shieldCharges;
    }

    if (this.laserReloadMs > 0) {
      this.laserGfx = this.add.graphics().setDepth(14);
      this.laserTimer = 0;
    }

    if (this.turboPower > 0) {
      this.turboEmitter = this.add.particles(0, 0, 'turboFlame', {
        speed: { min: 90, max: 220 },
        lifespan: { min: 130, max: 280 },
        scale: { start: 1.4, end: 0 },
        alpha: { start: 1, end: 0 },
        angle: { min: 155, max: 205 },
        tint: [0xff8800, 0xff4400, 0xffee00, 0xffffff],
        frequency: -1,
      }).setDepth(11);
      this.turboCooldownTimer = 0;
    }

    if (this.tiresGroundDragFactor < 1.0) {
      this.wheelsGfx = this.add.graphics().setDepth(11).setVisible(false);
    }

    const bounceTier = getTier('bounce');
    this.bouncesLeft = bounceTier >= 5 ? 4 : bounceTier >= 4 ? 3 : bounceTier >= 2 ? 2 : bounceTier >= 1 ? 1 : 0;

    const rbTier = getTier('rubberBand');
    if (rbTier > 0) {
      this.boostEmitter = this.add.particles(this.plane.x, this.plane.y, 'trail', {
        speed:    { min: 18, max: 45 },
        lifespan: { min: 70 + rbTier * 35, max: 120 + rbTier * 55 },
        scale:    { start: 0.4 + rbTier * 0.15, end: 0 },
        alpha:    { start: 0.5, end: 0 },
        angle:    { min: 165, max: 195 },
        tint:     [0xff8c00, 0xffaa44, 0xffcc88],
        frequency: 18,
        quantity:  1,
      }).setDepth(8);
      this.boostEmitter.stop();
    }
  }

  private updateUpgradeVisuals(time: number): void {
    if (this.magnetRingGfx) {
      this.magnetRingGfx.setPosition(this.plane.x, this.plane.y);
      const pulse = 0.55 + 0.45 * Math.sin(time / 380);
      const r = this.magnetRadius + 18;
      this.magnetRingGfx.clear();
      this.magnetRingGfx.lineStyle(1.5, 0xffd23a, 0.22 * pulse);
      this.magnetRingGfx.strokeCircle(0, 0, r);
      this.magnetRingGfx.lineStyle(0.8, 0xffd23a, 0.10 * pulse);
      this.magnetRingGfx.strokeCircle(0, 0, r + 6);
    }

    if (this.boostEmitter) {
      this.boostEmitter.setPosition(this.plane.x, this.plane.y);
    }

    if (this.shieldGfx) {
      this.shieldGfx.setPosition(this.plane.x, this.plane.y);
      this.drawShield(time);
    }

    if (this.wheelsGfx) {
      this.wheelsGfx.setPosition(this.plane.x, this.plane.y);
      const onGround = this.plane.y >= GROUND_Y - 12 && this.phase !== 'aiming';
      if (onGround) {
        this.wheelsGfx.setVisible(true);
        this.wheelsGfx.clear();
        this.wheelsGfx.fillStyle(0x1a1a1a, 1);
        this.wheelsGfx.fillCircle(-7, 11, 5);
        this.wheelsGfx.fillCircle(9, 11, 5);
        this.wheelsGfx.fillStyle(0x777777, 1);
        this.wheelsGfx.fillCircle(-7, 11, 2);
        this.wheelsGfx.fillCircle(9, 11, 2);
      } else {
        this.wheelsGfx.setVisible(false);
      }
    }

    if (this.turboPower > 0) {
      const airborne = this.phase === 'flying' && this.plane.y < GROUND_Y - 10;
      this.turboReadyText.setVisible(airborne);
      this.turboBarGfx.setVisible(airborne);
      if (airborne) {
        const ready = this.turboCooldownTimer <= 0;
        this.turboReadyText
          .setText(ready ? '▶ TURBO  [Leertaste]' : 'TURBO')
          .setColor(ready ? '#ffaa00' : '#556680');

        const barW = 120;
        const barH = 5;
        const bx = GAME_WIDTH / 2 - barW / 2;
        const by = GAME_HEIGHT - 8;
        const fill = ready ? 1 : 1 - (this.turboCooldownTimer / 3500);
        this.turboBarGfx.clear();
        this.turboBarGfx.fillStyle(0x334466, 1);
        this.turboBarGfx.fillRect(bx, by, barW, barH);
        this.turboBarGfx.fillStyle(ready ? 0xffaa00 : 0x4466aa, 1);
        this.turboBarGfx.fillRect(bx, by, Math.round(barW * fill), barH);
      }
    }
  }

  private drawShield(time: number): void {
    if (!this.shieldGfx || this.shieldCharges === 0) return;
    this.shieldGfx.clear();
    const pulse = 0.5 + 0.5 * Math.sin(time / 270);
    for (let c = 0; c < this.shieldCharges; c++) {
      const active = c < this.currentShieldCharges;
      const r = 26 + c * 9 + 3 * pulse;
      const alpha = active ? (0.45 + 0.35 * pulse) : 0.1;
      const color = active ? 0x44ddff : 0x224488;
      this.shieldGfx.lineStyle(active ? 2.5 : 1.2, color, alpha);
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
        pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
      }
      this.shieldGfx.strokePoints(pts, true);
    }
  }

  private updateLaser(delta: number): void {
    if (!this.laserGfx || this.laserReloadMs === 0) return;

    if (this.laserFlashTimer > 0) {
      this.laserFlashTimer -= delta;
      if (this.laserFlashTimer <= 0) this.laserGfx.clear();
    }

    this.laserTimer -= delta;
    if (this.laserTimer > 0) return;

    let targetBird: Bird | null = null;
    let targetObstacle: Obstacle | null = null;
    let minDist = Infinity;
    let tx = 0, ty = 0;
    const range = 260;

    for (const bird of this.birds) {
      if (bird.hit) continue;
      const dx = bird.sprite.x - this.plane.x;
      if (dx < -30 || dx > range) continue;
      const dist = Math.hypot(dx, bird.sprite.y - this.plane.y);
      if (dist < minDist) { minDist = dist; targetBird = bird; targetObstacle = null; tx = bird.sprite.x; ty = bird.sprite.y; }
    }

    for (const obs of this.obstacles) {
      if (obs.hit) continue;
      const dx = obs.sprite.x - this.plane.x;
      if (dx < -30 || dx > range) continue;
      const obsY = obs.sprite.originY === 0.5 ? obs.sprite.y : obs.sprite.y - 55;
      const dist = Math.hypot(dx, obsY - this.plane.y);
      if (dist < minDist) { minDist = dist; targetObstacle = obs; targetBird = null; tx = obs.sprite.x; ty = obsY; }
    }

    if (!targetBird && !targetObstacle) return;

    this.laserTimer = this.laserReloadMs;
    this.audio.play('laserFire');
    this.laserFlashTimer = 130;

    this.laserGfx.clear();
    const fx = this.plane.x + 22;
    const fy = this.plane.y;
    this.laserGfx.lineStyle(4, 0xff2200, 0.9);
    this.laserGfx.lineBetween(fx, fy, tx, ty);
    this.laserGfx.lineStyle(2, 0xff8844, 0.7);
    this.laserGfx.lineBetween(fx, fy, tx, ty);
    this.laserGfx.lineStyle(1, 0xffdd88, 0.5);
    this.laserGfx.lineBetween(fx, fy, tx, ty);

    const burst = this.add.particles(tx, ty, 'spark', {
      speed: { min: 80, max: 210 }, lifespan: 280,
      scale: { start: 1.1, end: 0 }, tint: [0xff4400, 0xff8800, 0xffdd00], frequency: -1,
    }).setDepth(16);
    burst.explode(10);
    this.time.delayedCall(400, () => burst.destroy());

    if (targetBird) {
      targetBird.hit = true;
      this.tweens.add({
        targets: targetBird.sprite, alpha: 0, scaleX: 0, scaleY: 0, duration: 240,
        onComplete: () => {
          targetBird!.sprite.destroy();
          const idx = this.birds.indexOf(targetBird!);
          if (idx !== -1) this.birds.splice(idx, 1);
        },
      });
    } else if (targetObstacle) {
      targetObstacle.hit = true;
      this.tweens.add({
        targets: targetObstacle.sprite, alpha: 0, scaleX: 0, scaleY: 0, duration: 300,
        onComplete: () => {
          targetObstacle!.sprite.destroy();
          const idx = this.obstacles.indexOf(targetObstacle!);
          if (idx !== -1) this.obstacles.splice(idx, 1);
        },
      });
    }
  }

  private updateTurbo(delta: number): void {
    if (this.turboPower === 0) return;
    if (this.turboCooldownTimer > 0) this.turboCooldownTimer -= delta;

    if (this.plane.y >= GROUND_Y - 10) return;

    if (Phaser.Input.Keyboard.JustDown(this.spaceKey) && this.turboCooldownTimer <= 0) {
      this.vx += this.turboPower;
      this.vx = Math.min(this.vx, this.maxLaunchPower * 2.5);
      this.turboCooldownTimer = 3500;
      this.audio.play('turboFire');

      if (this.turboEmitter) {
        this.turboEmitter.setPosition(this.plane.x - 10, this.plane.y + 2);
        this.turboEmitter.explode(16);
      }

      this.cameras.main.shake(90, 0.007);
      const flash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xff8800, 0)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(145);
      this.tweens.add({
        targets: flash, fillAlpha: 0.14, duration: 60, ease: 'Cubic.Out',
        yoyo: true, onComplete: () => flash.destroy(),
      });
    }
  }

  private buildParallaxBackground(): void {
    const bandH = GAME_HEIGHT / 4;
    const meadows = this.biomeManager ? this.biomeManager.getBiomeForDistance(0) : null;
    const initialTop      = meadows?.skyTopColor      ?? 0xe8604a;
    const initialUpperMid = meadows?.skyUpperMidColor ?? 0xf4845f;
    const initialLowerMid = meadows?.skyLowerMidColor ?? 0xfabd80;
    const initialBottom   = meadows?.skyBottomColor   ?? 0xfce5b8;

    this.skyBand0 = this.add.rectangle(0, 0,          GAME_WIDTH, bandH, initialTop, 1)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-40);
    this.skyBand1 = this.add.rectangle(0, bandH,      GAME_WIDTH, bandH, initialUpperMid, 1)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-40);
    this.skyBand2 = this.add.rectangle(0, bandH * 2,  GAME_WIDTH, bandH, initialLowerMid, 1)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-40);
    this.skyBand3 = this.add.rectangle(0, bandH * 3,  GAME_WIDTH, bandH, initialBottom, 1)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-40);

    this.auroraGfx = this.add.graphics().setScrollFactor(0).setDepth(-38);
    this.horizonHazeGfx = this.add.graphics().setScrollFactor(0).setDepth(-36);

    this.starFieldLayer = this.add.image(0, 0, 'starField')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-39).setAlpha(0);

    const farTex = this.makeMountainTexture('mountainsFar', 600, 130, 0xffffff, 5);
    this.layerFarMountains = this.add.tileSprite(0, GROUND_Y - 60, GAME_WIDTH, 130, farTex)
      .setOrigin(0, 1).setScrollFactor(0).setDepth(-30).setTint(COLOR_MOUNTAIN_FAR);

    this.altitudeStarLayer = this.add.image(0, 0, 'starField')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-39).setAlpha(0);

    this.layerClouds = this.add.tileSprite(0, 60, GAME_WIDTH, 80, 'cloud')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-25).setAlpha(0.9);

    this.layerClouds2 = this.add.tileSprite(0, 140, GAME_WIDTH, 60, 'cloud')
      .setOrigin(0, 0).setScrollFactor(0).setDepth(-24).setAlpha(0.45).setScale(1, 0.6);

    const nearTex = this.makeMountainTexture('mountainsNear', 500, 90, 0xffffff, 4);
    this.layerNearMountains = this.add.tileSprite(0, GROUND_Y, GAME_WIDTH, 90, nearTex)
      .setOrigin(0, 1).setScrollFactor(0).setDepth(-20).setTint(COLOR_MOUNTAIN_NEAR);
  }

  private makeMountainTexture(
    key: string, width: number, height: number, color: number, peakCount: number,
  ): string {
    if (this.textures.exists(key)) return key;
    const g = this.add.graphics();
    g.fillStyle(color, 1);
    const points: Phaser.Math.Vector2[] = [];
    points.push(new Phaser.Math.Vector2(0, height));
    const step = width / peakCount;
    for (let i = 0; i <= peakCount; i++) {
      const x = i * step;
      const peakY = height * (0.15 + 0.6 * Math.abs(Math.sin(i * 1.7)));
      points.push(new Phaser.Math.Vector2(x, height - peakY));
    }
    points.push(new Phaser.Math.Vector2(width, height));
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) g.lineTo(points[i].x, points[i].y);
    g.closePath();
    g.fillPath();
    g.generateTexture(key, width, height);
    g.destroy();
    return key;
  }

  private buildGround(): void {
    if (!this.textures.exists('ground')) {
      const tw = 256;
      const th = 64;
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.fillRect(0, 0, tw, th);
      g.fillStyle(0xdddddd, 1);
      g.fillRect(0, 0, tw, 4);
      for (let x = 0; x < tw; x += 10) {
        const len = 6 + (x % 9);
        const y = 6 + (x % 5);
        g.fillStyle(0xbbbbbb, 0.5);
        g.fillRect(x, y, len, 1);
        g.fillRect(x + 3, y + 8, len - 2, 1);
        g.fillRect(x + 1, y + 16, len, 1);
        g.fillRect(x + 5, y + 24, len - 1, 1);
      }
      for (let xi = 0; xi < tw; xi += 20) {
        for (let yi = 0; yi < th; yi += 14) {
          g.fillStyle(0xaaaaaa, 0.3);
          g.fillRect(xi + (yi % 7), yi, 2, 2);
        }
      }
      g.generateTexture('ground', tw, th);
      g.destroy();
    }
    this.groundGfx = this.add.tileSprite(0, GROUND_Y, GAME_WIDTH, 64, 'ground')
      .setOrigin(0, 0).setScrollFactor(0, 0).setDepth(-10).setTint(COLOR_GROUND);
  }

  private buildLaunchpad(): void {
    this.launchpadGfx = this.add.graphics();
    this.launchpadGfx.setDepth(0);
    this.drawLaunchpad();
  }

  private drawLaunchpad(): void {
    const g = this.launchpadGfx;
    g.clear();
    g.fillStyle(0x8a5a2a, 1);
    g.fillRect(LAUNCH_X - 30, LAUNCH_Y, 6, GROUND_Y - LAUNCH_Y);
    g.fillRect(LAUNCH_X + 24, LAUNCH_Y, 6, GROUND_Y - LAUNCH_Y);
    g.fillStyle(0x6b3e1b, 1);
    g.fillRect(LAUNCH_X - 32, LAUNCH_Y - 4, 64, 6);
    g.fillStyle(0x3a2010, 1);
    g.fillRect(LAUNCH_X - 36, GROUND_Y - 4, 76, 8);
  }

  private buildPlane(): void {
    this.plane = this.add.image(LAUNCH_X, LAUNCH_Y, 'plane');
    this.plane.setDepth(10);
    this.plane.setOrigin(0.4, 0.5);
    this.trailEmitter = this.add.particles(LAUNCH_X, LAUNCH_Y, 'trail', {
      speed: { min: 5, max: 20 },
      lifespan: { min: 150, max: 350 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.55, end: 0 },
      angle: { min: 165, max: 195 },
      quantity: 2,
      frequency: 30,
    }).setDepth(9);
    this.trailEmitter.stop();
  }

  private buildAimingOverlays(): void {
    this.rubberBandGfx = this.add.graphics().setDepth(5);
    this.aimArrowGfx = this.add.graphics().setDepth(11);
  }

  private buildHUD(): void {
    const textStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Fredoka One", sans-serif',
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    };
    this.distanceText = this.add.text(12, 10, '0 m', textStyle).setScrollFactor(0).setDepth(100);
    this.altitudeText = this.add.text(12, 34, '↑ 0 m', { ...textStyle, fontSize: '16px', color: '#aaffcc' })
      .setScrollFactor(0).setDepth(100).setVisible(false);
    this.coinText = this.add.text(GAME_WIDTH - 12, 10, '0', textStyle)
      .setScrollFactor(0).setOrigin(1, 0).setDepth(100);
    this.coinIcon = this.add.image(GAME_WIDTH - 40, 21, 'coin').setScrollFactor(0).setDepth(100);
    this.turboReadyText = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT - 12, '', {
      ...textStyle, fontSize: '14px', color: '#ffaa00',
    }).setScrollFactor(0).setOrigin(0.5, 1).setDepth(100).setVisible(false);
    this.turboBarGfx = this.add.graphics().setScrollFactor(0).setDepth(100).setVisible(false);
    this.hintText = this.add.text(
      GAME_WIDTH / 2, GAME_HEIGHT - 28,
      'Halten + ziehen, dann loslassen zum Abwerfen',
      { ...textStyle, fontSize: '16px' },
    ).setScrollFactor(0).setOrigin(0.5, 1).setDepth(100);
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(0, -GAME_HEIGHT * 68, Number.MAX_SAFE_INTEGER, GAME_HEIGHT * 69);
    cam.setScroll(0, 0);
    cam.startFollow(this.plane, true, 0.10, 0.10);
    cam.setFollowOffset(-GAME_WIDTH * 0.25, 0);
  }

  private setupInput(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.audio.onInteraction();
      if (this.phase !== 'aiming') return;
      this.isAiming = true;
      this.aimStart.set(pointer.worldX, pointer.worldY);
      this.aimCurrent.set(pointer.worldX, pointer.worldY);
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isAiming || this.phase !== 'aiming') return;
      this.aimCurrent.set(pointer.worldX, pointer.worldY);
      const { powerScalar } = this.getAimVector();
      this.audio.playStretch(powerScalar);
    });
    this.spaceKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.input.on('pointerup', () => {
      if (!this.isAiming || this.phase !== 'aiming') return;
      this.isAiming = false;
      this.launch();
    });
  }

  private seedInitialWorld(): void {
    this.generateWorldChunkUpTo(LAUNCH_X + SPAWN_AHEAD_DISTANCE * 2);
  }

  private generateWorldChunkUpTo(targetX: number): void {
    while (this.nextCoinSpawnX < targetX) {
      this.spawnCoinCluster(this.nextCoinSpawnX);
      this.nextCoinSpawnX += Phaser.Math.Between(COIN_SPAWN_INTERVAL_X * 0.7, COIN_SPAWN_INTERVAL_X * 1.4);
    }
    while (this.nextObstacleSpawnX < targetX) {
      this.spawnObstacle(this.nextObstacleSpawnX);
      this.nextObstacleSpawnX += Phaser.Math.Between(OBSTACLE_SPAWN_INTERVAL_X * 0.8, OBSTACLE_SPAWN_INTERVAL_X * 1.5);
    }
    while (this.nextWindZoneSpawnX < targetX) {
      this.spawnWindZone(this.nextWindZoneSpawnX);
      this.nextWindZoneSpawnX += Phaser.Math.Between(520, 780);
    }
    while (this.nextBirdSpawnX < targetX) {
      const meters = (this.nextBirdSpawnX - LAUNCH_X) / PIXELS_PER_METER;
      const biome = this.biomeManager.getBiomeForDistance(meters);
      if (biome.id !== 'space') this.spawnBirdFlock(this.nextBirdSpawnX, biome.id);
      this.nextBirdSpawnX += Phaser.Math.Between(320, 560);
    }
    this.windZones = this.windZones.filter(zone => {
      if (zone.x + zone.width < this.plane.x - GAME_WIDTH * 1.5) {
        zone.visual.destroy();
        zone.streakEmitter.destroy();
        return false;
      }
      return true;
    });
  }

  private spawnCoinCluster(centerX: number): void {
    const pattern = Phaser.Math.Between(0, 4);
    const positions: Array<{ x: number; y: number }> = [];
    switch (pattern) {
      case 0: {
        const count = Phaser.Math.Between(4, 7);
        const y = Phaser.Math.Between(60, GROUND_Y - 70);
        for (let i = 0; i < count; i++) positions.push({ x: centerX + i * 32, y });
        break;
      }
      case 1: {
        const count = Phaser.Math.Between(5, 8);
        const midY = Phaser.Math.Between(90, GROUND_Y - 100);
        const amp = Phaser.Math.Between(35, 70);
        for (let i = 0; i < count; i++) {
          positions.push({ x: centerX + i * 30, y: midY + Math.sin(i * 0.7) * amp });
        }
        break;
      }
      case 2: {
        const count = Phaser.Math.Between(5, 8);
        const goUp = Math.random() > 0.5;
        const startY = goUp ? Phaser.Math.Between(GROUND_Y - 80, GROUND_Y - 40) : Phaser.Math.Between(50, 120);
        const endY   = goUp ? Phaser.Math.Between(40, 120) : Phaser.Math.Between(GROUND_Y - 80, GROUND_Y - 40);
        for (let i = 0; i < count; i++) {
          const t = i / (count - 1);
          positions.push({ x: centerX + i * 34, y: startY + (endY - startY) * t });
        }
        break;
      }
      case 3: {
        const count = Phaser.Math.Between(3, 5);
        const colX = centerX + Phaser.Math.Between(0, 20);
        const topY = Phaser.Math.Between(50, 160);
        for (let i = 0; i < count; i++) {
          positions.push({ x: colX + Phaser.Math.Between(-8, 8), y: topY + i * 38 });
        }
        break;
      }
      default: {
        const count = Phaser.Math.Between(4, 7);
        const baseY = Phaser.Math.Between(60, GROUND_Y - 70);
        for (let i = 0; i < count; i++) {
          positions.push({ x: centerX + Phaser.Math.Between(0, 100), y: baseY + Phaser.Math.Between(-60, 60) });
        }
        break;
      }
    }
    for (const pos of positions) {
      const sprite = this.add.image(pos.x, pos.y, 'coin').setDepth(8);
      this.coins.push({ sprite, collected: false });
    }
  }

  private spawnObstacle(x: number): void {
    const distanceMeters = (x - LAUNCH_X) / PIXELS_PER_METER;
    const biome = this.biomeManager ? this.biomeManager.getBiomeForDistance(distanceMeters) : null;
    const key = biome ? biome.obstacleKey : 'tree';
    const radius = biome ? biome.obstacleHitboxRadius : 18;
    if (biome && biome.id === 'space') {
      const y = Phaser.Math.Between(120, GROUND_Y - 60);
      const sprite = this.add.image(x, y, key).setOrigin(0.5, 0.5).setDepth(7);
      this.obstacles.push({ sprite, hitboxRadius: radius, type: 'hard', hit: false });
    } else {
      const sprite = this.add.image(x, GROUND_Y, key).setOrigin(0.5, 1).setDepth(7);
      this.obstacles.push({ sprite, hitboxRadius: radius, type: 'hard', hit: false });
    }
  }

  private spawnWindZone(x: number): void {
    const isTailwind = Math.random() < 0.62;
    const width  = Phaser.Math.Between(220, 400);
    const height = Phaser.Math.Between(55, 80);
    const y = Phaser.Math.Between(-480, 80);
    const windVx = isTailwind
      ? Phaser.Math.FloatBetween(0.055, 0.13)
      : Phaser.Math.FloatBetween(-0.09, -0.04);
    const coreColor = isTailwind ? 0x44eebb : 0xff7744;
    const edgeColor = isTailwind ? 0x22aa77 : 0xcc4422;
    const arrowDir  = isTailwind ? 1 : -1;
    const gfx = this.add.graphics().setDepth(6);
    const top = y - height / 2;
    const tubeCount = 3;
    for (let t = 0; t < tubeCount; t++) {
      const tubeY = top + (height / (tubeCount + 1)) * (t + 1);
      gfx.fillStyle(coreColor, 0.09);
      gfx.fillEllipse(x + width / 2, tubeY, width * 0.95, height / (tubeCount + 0.5));
      gfx.fillStyle(coreColor, 0.07);
      gfx.fillEllipse(x + width / 2, tubeY, width * 0.6, height / (tubeCount + 2));
    }
    gfx.fillStyle(coreColor, 0.04);
    gfx.fillRect(x, top, width, height);
    const glowSteps = 5;
    for (let s = 0; s < glowSteps; s++) {
      const a = 0.12 * (1 - s / glowSteps);
      const offset = s * 6;
      gfx.fillStyle(coreColor, a);
      gfx.fillRect(x + offset, top + 2, 12 - s, height - 4);
      gfx.fillRect(x + width - offset - 12 + s, top + 2, 12 - s, height - 4);
    }
    const arrowCount = 3;
    const waveAmp = height * 0.18;
    const waveLen = width / arrowCount;
    for (let i = 0; i < arrowCount; i++) {
      const startX = x + i * waveLen + waveLen * 0.1;
      const endX   = x + i * waveLen + waveLen * 0.88;
      const midY   = top + height / 2;
      const steps  = 12;
      gfx.lineStyle(1.5, coreColor, 0.6);
      gfx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const wx = startX + (endX - startX) * t;
        const wy = midY + Math.sin(t * Math.PI * 2) * waveAmp * (isTailwind ? 1 : -1);
        if (s === 0) gfx.moveTo(wx, wy); else gfx.lineTo(wx, wy);
      }
      gfx.strokePath();
      const tipX = endX;
      const tipY = midY;
      const headSize = 7;
      gfx.lineStyle(2, coreColor, 0.85);
      gfx.lineBetween(tipX, tipY, tipX - headSize * arrowDir, tipY - 5);
      gfx.lineBetween(tipX, tipY, tipX - headSize * arrowDir, tipY + 5);
    }
    for (let b = 0; b < 3; b++) {
      gfx.lineStyle(1, edgeColor, 0.22 - b * 0.06);
      gfx.lineBetween(x, top + b, x + width, top + b);
      gfx.lineBetween(x, top + height - b, x + width, top + height - b);
    }
    const streakCount = Math.floor(width / 55);
    for (let s = 0; s < streakCount; s++) {
      const sx = x + Phaser.Math.Between(20, width - 20);
      const sy = top + Phaser.Math.Between(8, height - 8);
      gfx.fillStyle(coreColor, Phaser.Math.FloatBetween(0.12, 0.28));
      const len = Phaser.Math.Between(14, 32);
      gfx.fillRect(sx, sy - 1, len * arrowDir, 2);
      gfx.fillRect(sx, sy - 0.5, len * arrowDir, 1);
    }
    const particleAngle = isTailwind ? 0 : 180;
    const streakEmitter = this.add.particles(x + width / 2, y, 'windParticle', {
      x: { min: -width / 2, max: width / 2 },
      y: { min: -height / 2 + 4, max: height / 2 - 4 },
      speedX: { min: 18 * arrowDir, max: 45 * arrowDir },
      speedY: { min: -4, max: 4 },
      angle: particleAngle,
      lifespan: { min: 900, max: 1600 },
      scale: { start: 0.7, end: 0.3 },
      alpha: { start: 0.55, end: 0 },
      frequency: 90,
      quantity: 1,
      tint: coreColor,
      maxParticles: 0,
    }).setDepth(6);
    this.windZones.push({ x, y, width, height, windVx, visual: gfx, streakEmitter });
  }

  private spawnBirdFlock(centerX: number, biomeId: string): void {
    const isPlane = biomeId !== 'meadows' && biomeId !== 'city';
    const count   = isPlane ? Phaser.Math.Between(1, 2) : Phaser.Math.Between(2, 4);
    const goRight = Math.random() < 0.5;
    const rangeHalf = 550;
    const minWorldX = isPlane ? -Infinity : centerX - rangeHalf;
    const maxWorldX = isPlane ? Infinity  : centerX + rangeHalf;
    const camX = this.cameras.main.scrollX;
    for (let b = 0; b < count; b++) {
      if (this.birds.length >= 14) break;
      let startX: number, speed: number, baseY: number;
      if (isPlane) {
        startX = (goRight ? camX - 80 : camX + GAME_WIDTH + 80) + b * (goRight ? -60 : 60);
        speed  = Phaser.Math.FloatBetween(90, 140);
        baseY  = this.plane.y + Phaser.Math.Between(-80, 80);
      } else {
        startX = centerX + Phaser.Math.Between(-400, 400);
        speed  = Phaser.Math.FloatBetween(45, 80);
        baseY  = this.plane.y + Phaser.Math.Between(-90, 110);
      }
      const sprite = this.add.image(startX, baseY, isPlane ? 'airplane' : 'bird_1')
        .setDepth(7).setFlipX(!goRight);
      this.birds.push({
        sprite, type: isPlane ? 'plane' : 'bird',
        vx: goRight ? speed : -speed,
        baseY, minWorldX, maxWorldX,
        bobPhase: Math.random() * Math.PI * 2,
        hit: false, frameIndex: 1,
        frameTimer: Phaser.Math.Between(0, 150),
      });
    }
  }

  private getAimVector(): { angleRad: number; powerScalar: number } {
    const dx = this.aimCurrent.x - this.aimStart.x;
    const dy = this.aimCurrent.y - this.aimStart.y;
    const dragLen = Math.min(Math.hypot(dx, dy), MAX_DRAG_DISTANCE);
    let aimDx = -dx;
    let aimDy = -dy;
    const len = Math.hypot(aimDx, aimDy);
    if (len < 0.001) { aimDx = 1; aimDy = -1; } else { aimDx /= len; aimDy /= len; }
    let angleDeg = Phaser.Math.RadToDeg(Math.atan2(aimDy, aimDx));
    if (aimDx < 0) angleDeg = MAX_AIM_ANGLE_DEG;
    angleDeg = Phaser.Math.Clamp(angleDeg, MIN_AIM_ANGLE_DEG, MAX_AIM_ANGLE_DEG);
    const powerScalar = dx >= 0 ? 0 : dragLen / MAX_DRAG_DISTANCE;
    return { angleRad: Phaser.Math.DegToRad(angleDeg), powerScalar };
  }

  private launch(): void {
    const { angleRad, powerScalar } = this.getAimVector();
    if (powerScalar <= 0) { this.isAiming = false; return; }
    const power = MIN_LAUNCH_POWER + (this.maxLaunchPower - MIN_LAUNCH_POWER) * powerScalar;
    this.vx = Math.cos(angleRad) * power;
    this.vy = Math.sin(angleRad) * power;
    this.liftFactor = BASE_LIFT_FACTOR;
    this.phase = 'flying';
    this.hintText.setVisible(false);
    this.audio.play('launch');
    this.audio.startWhoosh();
    this.trailEmitter.start();
    if (this.boostEmitter) this.boostEmitter.start();
    this.rubberBandGfx.clear();
    this.aimArrowGfx.clear();
    this.cameras.main.setFollowOffset(-GAME_WIDTH * 0.35, 0);
  }

  update(time: number, delta: number): void {
    if (this.phase === 'aiming') {
      this.updateAiming();
    } else if (this.phase === 'flying') {
      this.updateFlying(delta);
    }
    if (this.phase !== 'landed') this.updateBirds(delta);
    this.updateParallax();
    this.updateAltitudeEffects(time);
    this.updateCoinAnimations(time);
    this.updateUpgradeVisuals(time);
  }

  private updateAiming(): void {
    this.rubberBandGfx.clear();
    this.aimArrowGfx.clear();
    if (!this.isAiming) return;
    const { angleRad, powerScalar } = this.getAimVector();
    if (powerScalar <= 0) { this.plane.setPosition(LAUNCH_X, LAUNCH_Y); return; }
    const dx = this.aimCurrent.x - this.aimStart.x;
    const dy = this.aimCurrent.y - this.aimStart.y;
    const dragLen = Math.min(Math.hypot(dx, dy), MAX_DRAG_DISTANCE);
    const normX = dragLen > 0 ? dx / Math.hypot(dx, dy) : 0;
    const normY = dragLen > 0 ? dy / Math.hypot(dx, dy) : 0;
    this.plane.setPosition(LAUNCH_X + normX * dragLen, LAUNCH_Y + normY * dragLen);
    this.plane.setRotation(angleRad);
    const leftPost = new Phaser.Math.Vector2(LAUNCH_X - 27, LAUNCH_Y - 4);
    const rightPost = new Phaser.Math.Vector2(LAUNCH_X + 27, LAUNCH_Y - 4);
    const bandWidth = 2 + 3 * powerScalar;
    const rC = Math.round(0xe8 + (0xff - 0xe8) * powerScalar);
    const gC = Math.round(0xc8 + (0x44 - 0xc8) * powerScalar);
    const bC = Math.round(0x6a + (0x22 - 0x6a) * powerScalar);
    const bandColor = (rC << 16) | (gC << 8) | bC;
    this.rubberBandGfx.lineStyle(bandWidth, bandColor, 1);
    this.rubberBandGfx.lineBetween(leftPost.x, leftPost.y, this.plane.x, this.plane.y);
    this.rubberBandGfx.lineBetween(rightPost.x, rightPost.y, this.plane.x, this.plane.y);
    const arrowLen = 30 + 80 * powerScalar;
    const ax = this.aimStart.x + Math.cos(angleRad) * arrowLen;
    const ay = this.aimStart.y + Math.sin(angleRad) * arrowLen;
    this.aimArrowGfx.lineStyle(3, 0xffffff, 0.9);
    this.aimArrowGfx.lineBetween(this.aimStart.x, this.aimStart.y, ax, ay);
    const headSize = 8;
    this.aimArrowGfx.lineBetween(ax, ay, ax - Math.cos(angleRad - 0.4) * headSize, ay - Math.sin(angleRad - 0.4) * headSize);
    this.aimArrowGfx.lineBetween(ax, ay, ax - Math.cos(angleRad + 0.4) * headSize, ay - Math.sin(angleRad + 0.4) * headSize);
  }

  private updateFlying(delta: number): void {
    const lift = this.liftFactor * this.vx;
    this.vy += GRAVITY - lift;
    this.vx *= 1 - this.dragCoefficient;
    this.plane.x += this.vx;
    this.plane.y += this.vy;
    this.trailEmitter.setPosition(this.plane.x, this.plane.y);
    if (this.boostEmitter) this.boostEmitter.setPosition(this.plane.x, this.plane.y);
    this.liftFactor *= LIFT_DECAY_PER_FRAME;
    const targetAngle = Math.atan2(this.vy, Math.max(this.vx, 0.01));
    this.plane.setRotation(Phaser.Math.Angle.RotateTo(this.plane.rotation, targetAngle, 0.05));
    this.generateWorldChunkUpTo(this.plane.x + SPAWN_AHEAD_DISTANCE);
    this.handleCoinPickup();
    this.applyWindForces();
    this.updateLaser(delta);
    this.updateTurbo(delta);
    if (this.handleObstacleHit()) {
      this.phase = 'crashing';
      this.trailEmitter.stop();
      if (this.boostEmitter) this.boostEmitter.stop();
      this.audio.play('crash');
      this.audio.stopWhoosh();
      this.cameras.main.shake(250, 0.012);
      this.time.delayedCall(80, () => { this.endFlight(); });
      return;
    }
    if (this.plane.y >= GROUND_Y - 8) {
      if (this.bouncesLeft > 0 && this.vy > 0.8) {
        this.bouncesLeft--;
        this.plane.y = GROUND_Y - 10;
        this.vy = -this.bounceVelocity;
        this.cameras.main.shake(70, 0.004);
        this.audio.play('bounce');
        this.audio.play('land');
        const bp = this.add.particles(this.plane.x, GROUND_Y - 4, 'spark', {
          speed: { min: 40, max: 110 }, lifespan: 350,
          scale: { start: 0.9, end: 0 }, angle: { min: -170, max: -10 },
          tint: [0xffd23a, 0xffffff, 0xaaddff], frequency: -1,
        }).setDepth(14);
        bp.explode(8);
        this.time.delayedCall(500, () => bp.destroy());
        return;
      }
      this.plane.y = GROUND_Y - 8;
      this.vy = 0;
      this.vx *= 1 - GROUND_DRAG * this.tiresGroundDragFactor;
      if (this.vx < 0.4) {
        this.audio.play('land');
        this.audio.stopWhoosh();
        this.cameras.main.shake(120, 0.004);
        this.endFlight();
        return;
      }
    }
    if (this.plane.y < -29600) { this.plane.y = -29600; this.vy = Math.max(this.vy, 0); }
    if (this.plane.y < 0) this.audio.playAltitudeEffect(Math.min(1, -this.plane.y / 200));
    this.updateHUD();
    this.checkBiomeTransition();
  }

  private handleCoinPickup(): void {
    const pickupRadius = COIN_RADIUS + 24 + this.magnetRadius;
    const px = this.plane.x, py = this.plane.y;
    for (const c of this.coins) {
      if (c.collected) continue;
      const dx = c.sprite.x - px, dy = c.sprite.y - py;
      if (dx * dx + dy * dy <= pickupRadius * pickupRadius) {
        c.collected = true;
        this.coinsCollected += COIN_VALUE;
        this.audio.play('coin');
        const burst = this.add.particles(c.sprite.x, c.sprite.y, 'spark', {
          speed: { min: 60, max: 130 }, lifespan: 350,
          scale: { start: 0.8, end: 0 }, alpha: { start: 1, end: 0 },
          angle: { min: 0, max: 360 }, frequency: -1,
        }).setDepth(15);
        burst.explode(8);
        this.time.delayedCall(500, () => burst.destroy());
        const popup = this.add.text(c.sprite.x, c.sprite.y - 10, '+1', {
          fontFamily: '"Fredoka One", sans-serif', fontSize: '16px',
          color: '#ffd23a', stroke: '#333333', strokeThickness: 3,
        }).setDepth(16);
        this.tweens.add({
          targets: popup, y: c.sprite.y - 50, alpha: 0, duration: 600, ease: 'Cubic.Out',
          onComplete: () => popup.destroy(),
        });
        this.tweens.add({
          targets: c.sprite, alpha: 0, scale: 1.6, duration: 180,
          onComplete: () => c.sprite.destroy(),
        });
      }
    }
  }

  private handleObstacleHit(): boolean {
    const px = this.plane.x, py = this.plane.y;
    for (const o of this.obstacles) {
      if (o.type !== 'hard' || o.hit) continue;
      if (Math.abs(o.sprite.x - px) > 60) continue;
      const hitX = o.sprite.x;
      const hitY = o.sprite.originY === 0.5 ? o.sprite.y : o.sprite.y - 55;
      const dx = hitX - px, dy = hitY - py;
      if (dx * dx + dy * dy < o.hitboxRadius * o.hitboxRadius) {
        if (this.currentShieldCharges > 0) {
          this.currentShieldCharges--;
          o.hit = true;
          this.absorbWithShield();
          return false;
        }
        return true;
      }
    }
    return false;
  }

  private absorbWithShield(): void {
    this.audio.play('shieldAbsorb');
    this.cameras.main.shake(55, 0.004);
    const burst = this.add.particles(this.plane.x, this.plane.y, 'shieldCharge', {
      speed: { min: 55, max: 140 }, lifespan: 320,
      scale: { start: 1.0, end: 0 }, tint: [0x44ddff, 0x88eeff, 0xaaffff], frequency: -1,
    }).setDepth(15);
    burst.explode(9);
    this.time.delayedCall(400, () => burst.destroy());
  }

  private applyWindForces(): void {
    const px = this.plane.x, py = this.plane.y;
    let nowInZone = false;
    let activeZoneVx = 0;
    for (const zone of this.windZones) {
      if (px >= zone.x && px <= zone.x + zone.width && Math.abs(py - zone.y) <= zone.height / 2) {
        this.vx += zone.windVx;
        this.vx = Math.min(this.vx, this.maxLaunchPower * 1.4);
        nowInZone = true;
        activeZoneVx = zone.windVx;
      }
    }
    if (nowInZone && !this.inWindZone) {
      this.audio.play('windEnter');
    } else if (!nowInZone && this.inWindZone) {
      this.audio.play('windEnter');
    }
    if (nowInZone && !this.windFlybyEmitter) {
      const isTailwind = activeZoneVx > 0;
      const flybyColor = isTailwind ? 0x88ffcc : 0xff9966;
      const flybyAngle = isTailwind ? 175 : 5;
      this.windFlybyEmitter = this.add.particles(px, py, 'windParticle', {
        speedX: { min: isTailwind ? -90 : 40, max: isTailwind ? -40 : 90 },
        speedY: { min: -12, max: 12 },
        angle: flybyAngle,
        lifespan: { min: 250, max: 480 },
        scale: { start: 0.8, end: 0 },
        alpha: { start: 0.7, end: 0 },
        x: { min: -28, max: 28 },
        y: { min: -18, max: 18 },
        quantity: 1, frequency: 55, tint: flybyColor,
      }).setDepth(12);
    } else if (!nowInZone && this.windFlybyEmitter) {
      this.windFlybyEmitter.destroy();
      this.windFlybyEmitter = null;
    }
    if (this.windFlybyEmitter) this.windFlybyEmitter.setPosition(px, py);
    this.inWindZone = nowInZone;
  }

  private updateBirds(delta: number): void {
    if (!this.birds.length) return;
    const now = this.time.now / 1000;
    const camX = this.cameras.main.scrollX;
    for (let i = this.birds.length - 1; i >= 0; i--) {
      const bird = this.birds[i];
      if (bird.hit) continue;
      if (bird.sprite.x < camX - GAME_WIDTH || bird.sprite.x > camX + GAME_WIDTH * 2.5) {
        bird.sprite.destroy();
        this.birds.splice(i, 1);
        continue;
      }
      bird.sprite.x += bird.vx * (delta / 1000);
      if (bird.type === 'bird') {
        if (bird.sprite.x <= bird.minWorldX && bird.vx < 0) {
          bird.sprite.x = bird.minWorldX;
          bird.vx = Math.abs(bird.vx);
          bird.sprite.setFlipX(false);
        } else if (bird.sprite.x >= bird.maxWorldX && bird.vx > 0) {
          bird.sprite.x = bird.maxWorldX;
          bird.vx = -Math.abs(bird.vx);
          bird.sprite.setFlipX(true);
        }
        bird.frameTimer -= delta;
        if (bird.frameTimer <= 0) {
          bird.frameTimer += 150;
          bird.frameIndex = (bird.frameIndex + 1) % GameScene.BIRD_FRAMES.length;
          bird.sprite.setTexture(`bird_${GameScene.BIRD_FRAMES[bird.frameIndex]}`);
        }
      }
      const bobAmp = bird.type === 'bird' ? 9 : 4;
      bird.sprite.y = bird.baseY + Math.sin(now * 2.2 + bird.bobPhase) * bobAmp;
      if (this.phase !== 'flying') continue;
      const dx = bird.sprite.x - this.plane.x;
      const dy = bird.sprite.y - this.plane.y;
      if (dx * dx + dy * dy < 18 * 18) {
        bird.hit = true;
        if (this.currentShieldCharges > 0) {
          this.currentShieldCharges--;
          this.absorbWithShield();
          this.tweens.add({
            targets: bird.sprite, alpha: 0, duration: 250,
            onComplete: () => { bird.sprite.destroy(); this.birds.splice(this.birds.indexOf(bird), 1); },
          });
          continue;
        }
        this.vx *= this.birdImpactPenalty;
        this.cameras.main.shake(120, 0.006);
        this.audio.play('birdHit');
        const featherBurst = this.add.particles(bird.sprite.x, bird.sprite.y, 'feather', {
          speed: { min: 40, max: 120 }, lifespan: { min: 500, max: 900 },
          scale: { start: 1.1, end: 0 }, alpha: { start: 1, end: 0 },
          angle: { min: -160, max: -20 }, rotate: { start: 0, end: 360 },
          tint: [0xf5e8d0, 0xd4b896, 0xc8a060, 0xe8d4b0], frequency: -1,
        }).setDepth(15);
        featherBurst.explode(Phaser.Math.Between(10, 14));
        const featherDrift = this.add.particles(bird.sprite.x, bird.sprite.y, 'feather', {
          speed: { min: 15, max: 40 }, lifespan: { min: 800, max: 1400 },
          scale: { start: 0.9, end: 0 }, alpha: { start: 0.8, end: 0 },
          angle: { min: 60, max: 120 }, rotate: { start: 0, end: 180 },
          gravityY: 30, tint: [0xf5e8d0, 0xe0c8a0], frequency: -1,
        }).setDepth(15);
        featherDrift.explode(Phaser.Math.Between(4, 6));
        this.time.delayedCall(1500, () => { featherBurst.destroy(); featherDrift.destroy(); });
        const tumbleX = bird.sprite.x + (bird.vx > 0 ? Phaser.Math.Between(40, 80) : -Phaser.Math.Between(40, 80));
        this.tweens.add({
          targets: bird.sprite, x: tumbleX,
          y: bird.sprite.y - Phaser.Math.Between(30, 60), alpha: 0,
          duration: 500, ease: 'Cubic.Out',
          onComplete: () => { bird.sprite.destroy(); const idx = this.birds.indexOf(bird); if (idx !== -1) this.birds.splice(idx, 1); },
        });
      }
    }
  }

  private updateAltitudeEffects(time: number): void {
    const planeY = this.plane.y;
    const camY = this.cameras.main.scrollY;
    const screenYAtHorizon = -camY;
    this.horizonHazeGfx.clear();
    if (screenYAtHorizon > -100 && screenYAtHorizon < GAME_HEIGHT + 100) {
      const hazeH = 80;
      const hazeColor = this.currentBiomeId === 'desert' ? 0xffcc44 : 0xff9055;
      const hazeSteps = 10;
      for (let i = 0; i < hazeSteps; i++) {
        const t = (i + 0.5) / hazeSteps;
        const dist = Math.abs(t - 0.5) * 2;
        const a = (1 - dist * dist) * 0.15;
        this.horizonHazeGfx.fillStyle(hazeColor, a);
        this.horizonHazeGfx.fillRect(0, screenYAtHorizon - hazeH / 2 + t * hazeH, GAME_WIDTH, Math.ceil(hazeH / hazeSteps) + 1);
      }
    }
    const noAurora = this.currentBiomeId === 'space' || this.currentBiomeId === 'city' || this.currentBiomeId === 'desert';
    const auroraStrength = noAurora ? 0 : Math.max(0, Math.min(1, (-planeY - 150) / 400));
    this.auroraGfx.clear();
    if (auroraStrength > 0.015) this.drawAurora(time, auroraStrength);
    if (this.phase === 'flying' && planeY < -80) {
      if (this.nextAltitudeCoinX === 0) this.nextAltitudeCoinX = this.plane.x + 180;
      const targetX = this.plane.x + SPAWN_AHEAD_DISTANCE * 0.8;
      while (this.nextAltitudeCoinX < targetX) {
        this.spawnAltitudeCoinTrail(this.nextAltitudeCoinX, planeY);
        this.nextAltitudeCoinX += Phaser.Math.Between(280, 520);
      }
    }
  }

  private drawAurora(time: number, strength: number): void {
    const g = this.auroraGfx;
    const phase = time * 0.0009;
    const bands = [
      { baseY: 14, color: 0x00ee77, bandH: 34 },
      { baseY: 54, color: 0x22aaff, bandH: 28 },
      { baseY: 88, color: 0x9944ee, bandH: 24 },
    ];
    const steps = 16;
    for (const band of bands) {
      for (let s = 0; s < steps; s++) {
        const t0 = s / steps, t1 = (s + 1) / steps;
        const w0 = Math.sin(t0 * 5.5 + phase) * 16 + Math.sin(t0 * 2.1 - phase * 0.8) * 9;
        const w1 = Math.sin(t1 * 5.5 + phase) * 16 + Math.sin(t1 * 2.1 - phase * 0.8) * 9;
        const v0 = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t0 * 7.3 + phase * 1.6));
        const v1 = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t1 * 7.3 + phase * 1.6));
        const a = strength * 0.24 * v0;
        if (a < 0.015) continue;
        const hh0 = (band.bandH * v0) / 2, hh1 = (band.bandH * v1) / 2;
        g.fillStyle(band.color, a);
        g.fillPoints([
          { x: t0 * GAME_WIDTH, y: band.baseY + w0 - hh0 },
          { x: t1 * GAME_WIDTH, y: band.baseY + w1 - hh1 },
          { x: t1 * GAME_WIDTH, y: band.baseY + w1 + hh1 },
          { x: t0 * GAME_WIDTH, y: band.baseY + w0 + hh0 },
        ] as Phaser.Types.Math.Vector2Like[], true);
      }
    }
  }

  private spawnAltitudeCoinTrail(startX: number, planeY: number): void {
    const count = Phaser.Math.Between(5, 9);
    const spacing = Phaser.Math.Between(28, 44);
    const baseY = Math.min(-60, planeY + Phaser.Math.Between(-55, 75));
    for (let i = 0; i < count; i++) {
      const x = startX + i * spacing;
      const y = baseY + Math.sin(i * 0.75) * 28;
      const sprite = this.add.image(x, y, 'coin').setDepth(8);
      this.coins.push({ sprite, collected: false });
    }
  }

  private updateHUD(): void {
    const distance = Math.max(0, Math.floor((this.plane.x - LAUNCH_X) / PIXELS_PER_METER));
    this.distanceText.setText(`${distance} m`);
    this.coinText.setText(`${this.coinsCollected}`);
    this.coinIcon.setX(GAME_WIDTH - 16 - this.coinText.width);
    const altitude = Math.max(0, Math.floor((GROUND_Y - this.plane.y) / PIXELS_PER_METER));
    this.altitudeText.setVisible(altitude > 0);
    if (altitude > 0) this.altitudeText.setText(`↑ ${altitude} m`);
  }

  private updateCoinAnimations(time: number): void {
    const t = time / 1000;
    for (const c of this.coins) {
      if (c.collected) continue;
      const phase = (c.sprite.x * 0.013) % (Math.PI * 2);
      const scale = 0.88 + 0.17 * (0.5 + 0.5 * Math.sin(t * Math.PI + phase));
      c.sprite.setScale(scale);
    }
  }

  private updateParallax(): void {
    const camX = this.cameras.main.scrollX;
    const camY = this.cameras.main.scrollY;
    this.layerFarMountains.tilePositionX = camX * 0.15;
    this.layerClouds.tilePositionX  = camX * 0.05  + this.time.now * 0.005;
    this.layerClouds2.tilePositionX = camX * 0.025 + this.time.now * 0.002;
    this.layerNearMountains.tilePositionX = camX * 0.4;
    this.groundGfx.tilePositionX = camX * 0.95;
    this.groundGfx.y          = GROUND_Y - camY;
    this.layerNearMountains.y = GROUND_Y - camY;
    this.layerFarMountains.y  = (GROUND_Y - 60) - camY * 0.55;
    this.layerClouds.y  = 60  - camY * 0.12;
    this.layerClouds2.y = 140 - camY * 0.08;
    if (this.altitudeStarLayer && this.phase === 'flying' && this.currentBiomeId !== 'space') {
      const t = Math.max(0, Math.min(1, -this.plane.y / 350));
      this.altitudeStarLayer.setAlpha(t * 0.55);
    }
  }

  private applyInitialBiome(): void {
    const biome = this.biomeManager.getBiomeForDistance(0);
    this.currentBiomeId = biome.id;
    this.currentBiome = biome;
    this.skyBand0.setFillStyle(biome.skyTopColor, 1);
    this.skyBand1.setFillStyle(biome.skyUpperMidColor, 1);
    this.skyBand2.setFillStyle(biome.skyLowerMidColor, 1);
    this.skyBand3.setFillStyle(biome.skyBottomColor, 1);
    this.layerFarMountains.setTint(biome.mountainFarColor);
    this.layerNearMountains.setTint(biome.mountainNearColor);
    this.groundGfx.setTint(biome.groundColor);
    this.applyAmbientEmitter(biome);
    this.applyCameraBiomeFx(biome);
    this.applyBiomeSilhouette(biome, false);
  }

  private checkBiomeTransition(): void {
    const meters = (this.plane.x - LAUNCH_X) / PIXELS_PER_METER;
    const biome = this.biomeManager.getBiomeForDistance(meters);
    if (biome.id !== this.currentBiomeId) {
      this.currentBiomeId = biome.id;
      this.currentBiome = biome;
      this.transitionToBiome(biome);
    }
  }

  private transitionToBiome(biome: BiomeConfig): void {
    this.tweenRectangleFill(this.skyBand0, biome.skyTopColor,      2000, 0);
    this.tweenRectangleFill(this.skyBand1, biome.skyUpperMidColor, 2000, 1);
    this.tweenRectangleFill(this.skyBand2, biome.skyLowerMidColor, 2000, 2);
    this.tweenRectangleFill(this.skyBand3, biome.skyBottomColor,   2000, 3);
    this.tweenTileSpriteTint(this.layerFarMountains, biome.mountainFarColor, 2000);
    this.tweenTileSpriteTint(this.layerNearMountains, biome.mountainNearColor, 2000);
    this.tweenTileSpriteTint(this.groundGfx, biome.groundColor, 2000);
    this.applyAmbientEmitter(biome);
    this.applyCameraBiomeFx(biome);
    this.applyBiomeSilhouette(biome, true);
    this.flashBiomeTransition(biome.accentColor);
    this.audio.play('biomeTransition');
    this.showBiomeBanner(biome);
  }

  private flashBiomeTransition(accentColor: number): void {
    const flash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, accentColor, 0)
      .setOrigin(0, 0).setScrollFactor(0).setDepth(140);
    this.tweens.add({
      targets: flash, fillAlpha: 0.18, duration: 80, ease: 'Cubic.Out',
      yoyo: true, onComplete: () => flash.destroy(),
    });
  }

  private applyBiomeSilhouette(biome: BiomeConfig, animated: boolean): void {
    let texKey: string, tileW: number, tileH: number, yPos: number;
    if (biome.id === 'city') {
      texKey = 'citySkyline'; tileW = 700; tileH = 160; yPos = GROUND_Y - 60;
    } else if (biome.id === 'space') {
      texKey = 'spaceTerrain'; tileW = 600; tileH = 100; yPos = GROUND_Y - 60;
    } else {
      texKey = 'mountainsFar'; tileW = 600; tileH = 130; yPos = GROUND_Y - 60;
    }
    if (this.layerFarMountains.texture.key !== texKey) {
      if (animated) {
        this.tweens.add({
          targets: this.layerFarMountains, alpha: 0, duration: 200, ease: 'Cubic.In',
          onComplete: () => {
            this.layerFarMountains.setTexture(texKey);
            this.layerFarMountains.setSize(GAME_WIDTH, tileH);
            this.layerFarMountains.y = yPos;
            this.tweens.add({ targets: this.layerFarMountains, alpha: 1, duration: 400, ease: 'Cubic.Out' });
          },
        });
      } else {
        this.layerFarMountains.setTexture(texKey);
        this.layerFarMountains.setSize(GAME_WIDTH, tileH);
        this.layerFarMountains.y = yPos;
      }
    }
    if (this.starFieldLayer) {
      const targetAlpha = biome.id === 'space' ? 1 : 0;
      if (animated) {
        this.tweens.add({ targets: this.starFieldLayer, alpha: targetAlpha, duration: 2000, ease: 'Sine.InOut' });
      } else {
        this.starFieldLayer.setAlpha(targetAlpha);
      }
    }
    const cloudTargetAlpha  = biome.id === 'space' ? 0 : 0.9;
    const cloudTargetAlpha2 = biome.id === 'space' ? 0 : 0.45;
    if (animated) {
      this.tweens.add({ targets: this.layerClouds,  alpha: cloudTargetAlpha,  duration: 1500, ease: 'Sine.InOut' });
      this.tweens.add({ targets: this.layerClouds2, alpha: cloudTargetAlpha2, duration: 1500, ease: 'Sine.InOut' });
    } else {
      this.layerClouds.setAlpha(cloudTargetAlpha);
      this.layerClouds2.setAlpha(cloudTargetAlpha2);
    }
  }

  private tweenRectangleFill(
    rect: Phaser.GameObjects.Rectangle, targetColor: number, duration: number, bandIndex: number,
  ): void {
    const fromColor = Phaser.Display.Color.IntegerToColor(rect.fillColor);
    const toColor = Phaser.Display.Color.IntegerToColor(targetColor);
    const obj = { t: 0 };
    if (this.skyTweens[bandIndex]) this.skyTweens[bandIndex]!.stop();
    const tween = this.tweens.add({
      targets: obj, t: 1, duration, ease: 'Sine.InOut',
      onUpdate: () => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(fromColor, toColor, 100, Math.round(obj.t * 100));
        rect.setFillStyle(((c.r & 0xff) << 16) | ((c.g & 0xff) << 8) | (c.b & 0xff), 1);
      },
      onComplete: () => { rect.setFillStyle(targetColor, 1); },
    });
    this.skyTweens[bandIndex] = tween;
  }

  private tweenTileSpriteTint(sprite: Phaser.GameObjects.TileSprite, targetColor: number, duration: number): void {
    const fromColor = Phaser.Display.Color.IntegerToColor(sprite.tintTopLeft);
    const toColor = Phaser.Display.Color.IntegerToColor(targetColor);
    const obj = { t: 0 };
    this.tweens.add({
      targets: obj, t: 1, duration, ease: 'Sine.InOut',
      onUpdate: () => {
        const c = Phaser.Display.Color.Interpolate.ColorWithColor(fromColor, toColor, 100, Math.round(obj.t * 100));
        sprite.setTint(((c.r & 0xff) << 16) | ((c.g & 0xff) << 8) | (c.b & 0xff));
      },
      onComplete: () => sprite.setTint(targetColor),
    });
  }

  private applyAmbientEmitter(biome: BiomeConfig): void {
    if (this.ambientEmitter) { this.ambientEmitter.destroy(); this.ambientEmitter = null; }
    if (this.ambientEmitterSecondary) { this.ambientEmitterSecondary.destroy(); this.ambientEmitterSecondary = null; }
    if (biome.ambientParticle) {
      this.ambientEmitter = this.add.particles(0, 0, biome.ambientParticle.key, biome.ambientParticle.config)
        .setScrollFactor(0).setDepth(-22);
    }
    if (biome.ambientParticleSecondary) {
      this.ambientEmitterSecondary = this.add.particles(0, 0, biome.ambientParticleSecondary.key, biome.ambientParticleSecondary.config)
        .setScrollFactor(0).setDepth(-21);
    }
  }

  private applyCameraBiomeFx(biome: BiomeConfig): void {
    const cam = this.cameras.main;
    if (biome.id === 'space') {
      cam.setBackgroundColor('#000000');
    } else {
      cam.setBackgroundColor(Phaser.Display.Color.IntegerToColor(biome.skyBottomColor).rgba);
    }
  }

  private showBiomeBanner(biome: BiomeConfig): void {
    if (this.biomeBannerContainer) { this.biomeBannerContainer.destroy(); this.biomeBannerContainer = null; }
    const cx = GAME_WIDTH / 2;
    const targetY = 62;
    const label = `${this.biomeEmoji(biome.id)}  ${biome.label}`;
    const text = this.add.text(0, 0, label, {
      fontFamily: '"Fredoka One", sans-serif', fontSize: '34px',
      color: '#ffffff', stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);
    const padX = 32, padY = 12;
    const bgW = text.width + padX * 2, bgH = text.height + padY * 2;
    const pill = this.add.graphics();
    pill.fillStyle(biome.accentColor, 0.82);
    pill.fillRoundedRect(-bgW / 2, -bgH / 2, bgW, bgH, 14);
    pill.lineStyle(2, 0xffffff, 0.35);
    pill.strokeRoundedRect(-bgW / 2, -bgH / 2, bgW, bgH, 14);
    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.25);
    shadow.fillRoundedRect(-bgW / 2 + 3, bgH / 2, bgW - 6, 4, 2);
    const container = this.add.container(cx, targetY - 30, [shadow, pill, text])
      .setScrollFactor(0).setDepth(150).setAlpha(0).setScale(0.7);
    this.biomeBannerContainer = container;
    this.tweens.add({
      targets: container, alpha: 1, scaleX: 1, scaleY: 1, y: targetY, duration: 280, ease: 'Back.Out',
    });
    this.tweens.add({
      targets: container, alpha: 0, y: targetY - 14, duration: 420, delay: 1900, ease: 'Cubic.In',
      onComplete: () => {
        if (this.biomeBannerContainer === container) this.biomeBannerContainer = null;
        container.destroy();
      },
    });
  }

  private biomeEmoji(id: string): string {
    switch (id) {
      case 'meadows': return '\u{1F33F}';
      case 'city':    return '\u{1F3D9}';
      case 'jungle':  return '\u{1F334}';
      case 'desert':  return '\u{1F335}';
      case 'arctic':  return '\u{2744}';
      case 'space':   return '\u{1F680}';
      default:        return '';
    }
  }

  private endFlight(): void {
    if (this.phase === 'landed') return;
    this.phase = 'landed';
    this.trailEmitter.stop();
    if (this.boostEmitter) this.boostEmitter.stop();
    this.audio.stopWhoosh();
    for (const zone of this.windZones) { zone.visual.destroy(); zone.streakEmitter.destroy(); }
    this.windZones = [];
    for (const bird of this.birds) bird.sprite.destroy();
    this.birds = [];
    if (this.windFlybyEmitter) { this.windFlybyEmitter.destroy(); this.windFlybyEmitter = null; }
    const distance = Math.max(0, Math.floor((this.plane.x - LAUNCH_X) / PIXELS_PER_METER));
    addCoins(this.coinsCollected);
    const isBest = maybeUpdateBestDistance(distance);
    this.showResultPanel(distance, this.coinsCollected, isBest);
  }

  private showResultPanel(distance: number, coins: number, isBest: boolean): void {
    const cx = GAME_WIDTH / 2, cy = GAME_HEIGHT / 2;
    const bg = this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.45).setScrollFactor(0);
    const panel = this.add.rectangle(cx, cy, 380, 220, 0xfffaf0, 1)
      .setScrollFactor(0).setStrokeStyle(4, 0x444444);
    const title = this.add.text(cx, cy - 80, 'Gelandet!', {
      fontFamily: '"Fredoka One", sans-serif', fontSize: '32px', color: '#333333', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0);
    const distLine = this.add.text(cx, cy - 30, `Strecke: ${distance} m${isBest ? '  (NEU!)' : ''}`, {
      fontFamily: '"Fredoka One", sans-serif', fontSize: '20px', color: isBest ? '#cc6600' : '#333333',
    }).setOrigin(0.5).setScrollFactor(0);
    const coinLine = this.add.text(cx, cy + 0, `Münzen gesammelt: ${coins}`, {
      fontFamily: '"Fredoka One", sans-serif', fontSize: '20px', color: '#333333',
    }).setOrigin(0.5).setScrollFactor(0);
    const button = this.add.rectangle(cx, cy + 60, 240, 50, 0x4a90e2, 1)
      .setScrollFactor(0).setStrokeStyle(3, 0x2a5db0).setInteractive({ useHandCursor: true });
    const buttonText = this.add.text(cx, cy + 60, 'Zum Shop', {
      fontFamily: '"Fredoka One", sans-serif', fontSize: '20px', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5).setScrollFactor(0);
    button.on('pointerover', () => this.tweens.add({ targets: button, scaleX: 1.06, scaleY: 1.06, duration: 120, ease: 'Cubic.Out' }));
    button.on('pointerout',  () => this.tweens.add({ targets: button, scaleX: 1, scaleY: 1, duration: 120, ease: 'Cubic.Out' }));
    button.on('pointerdown', () => { this.audio.play('uiClick'); this.scene.start('ShopScene'); });
    this.resultContainer = this.add.container(0, 0, [bg, panel, title, distLine, coinLine, button, buttonText])
      .setScrollFactor(0).setDepth(200);
    this.resultContainer.y = 60;
    this.resultContainer.setAlpha(0);
    this.tweens.add({ targets: this.resultContainer, y: 0, alpha: 1, duration: 320, ease: 'Back.Out' });
    if (isBest) {
      const goldenFlash = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffd23a, 0)
        .setOrigin(0, 0).setScrollFactor(0).setDepth(202);
      this.tweens.add({
        targets: goldenFlash, fillAlpha: 0.22, duration: 120, ease: 'Cubic.Out',
        yoyo: true, onComplete: () => goldenFlash.destroy(),
      });
      const bannerText = this.add.text(cx, cy - 140, '★ NEUER REKORD! ★', {
        fontFamily: '"Fredoka One", sans-serif', fontSize: '28px',
        color: '#ffd23a', stroke: '#7a4400', strokeThickness: 5,
      }).setOrigin(0.5).setScrollFactor(0).setDepth(203).setAlpha(0).setScale(0.6);
      this.tweens.add({ targets: bannerText, alpha: 1, scaleX: 1, scaleY: 1, y: cy - 118, duration: 380, ease: 'Back.Out' });
      this.tweens.add({
        targets: bannerText, alpha: 0, y: cy - 130, duration: 300, delay: 2200, ease: 'Cubic.In',
        onComplete: () => bannerText.destroy(),
      });
      this.audio.play('upgrade');
      const confetti = this.add.particles(cx, cy - 20, 'spark', {
        speed: { min: 80, max: 180 }, lifespan: 700,
        scale: { start: 1.2, end: 0 }, alpha: { start: 1, end: 0 },
        angle: { min: 0, max: 360 }, tint: [0xffd23a, 0xff6b6b, 0x6b9fff, 0x6bff9f], frequency: -1,
      }).setScrollFactor(0).setDepth(201);
      confetti.explode(28);
      this.time.delayedCall(900, () => confetti.destroy());
    }
  }
}
