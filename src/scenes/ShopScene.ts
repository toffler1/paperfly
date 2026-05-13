// ShopScene - upgrade screen between flights.
// 2-column layout: left = Gummiband/Gleitdauer/Magnet/Schild,
//                  right = Laser/Turbo/Reifen/Bounce

import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, UpgradeKey, UPGRADE_DEFS } from '../config';
import { AudioManager } from '../audio/AudioManager';
import {
  getCoins,
  getTier,
  getMaxTier,
  getNextUpgradeCost,
  purchaseUpgrade,
  getBestDistance,
} from '../upgrades';

interface UpgradeRow {
  key: UpgradeKey;
  label: string;
  description: string;
}

// 8 upgrades — first 4 go in the left column, last 4 in the right column.
const ROWS: UpgradeRow[] = [
  { key: 'rubberBand', label: 'Gummiband',    description: 'Mehr Startkraft' },
  { key: 'glide',      label: 'Gleitdauer',   description: 'Weniger Luftwiderstand' },
  { key: 'magnet',     label: 'Münzmagnet',   description: 'Größerer Sammelradius' },
  { key: 'shield',     label: 'Schild',       description: 'Schutz vor Kollisionen' },
  { key: 'laser',      label: 'Laserkanone',  description: 'Eliminiert Hindernisse' },
  { key: 'turbo',      label: 'Turbodüsen',   description: 'Leertaste: Speedboost' },
  { key: 'tires',      label: 'Reifen',       description: 'Weiter rollen nach Landung' },
  { key: 'bounce',     label: 'Bounce',       description: 'Hochhüpfen bei Landung' },
];

export class ShopScene extends Phaser.Scene {
  private coinsLabel!: Phaser.GameObjects.Text;
  private rowRefs: Array<{
    key: UpgradeKey;
    tierText: Phaser.GameObjects.Text;
    costText: Phaser.GameObjects.Text;
    button: Phaser.GameObjects.Rectangle;
    buttonText: Phaser.GameObjects.Text;
    progressBar: Phaser.GameObjects.Rectangle;
    maxTier: number;
  }> = [];

  constructor() {
    super('ShopScene');
  }

  create(): void {
    this.rowRefs = [];
    AudioManager.getInstance().playMusic('shop');

    // Background
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x1a3a5e, 1);
    this.add.rectangle(GAME_WIDTH / 2, 36, GAME_WIDTH, 72, 0x2b5b8f, 1);

    // Title
    this.add.text(GAME_WIDTH / 2, 24, 'Shop', {
      fontFamily: '"Fredoka One", sans-serif',
      fontSize: '26px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    // Best distance
    this.add.text(16, 16, `Bestweite: ${getBestDistance()} m`, {
      fontFamily: '"Fredoka One", sans-serif',
      fontSize: '13px',
      color: '#d8e8ff',
    });

    // Coin counter
    this.add.image(GAME_WIDTH - 80, 36, 'coin');
    this.coinsLabel = this.add.text(GAME_WIDTH - 64, 36, `${getCoins()}`, {
      fontFamily: '"Fredoka One", sans-serif',
      fontSize: '22px',
      color: '#ffd23a',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    // Column divider
    this.add.rectangle(GAME_WIDTH / 2, 260, 2, 260, 0x3a6090, 0.6).setOrigin(0.5);

    // Column headers
    const headerStyle = {
      fontFamily: '"Fredoka One", sans-serif',
      fontSize: '13px',
      color: '#88aacc',
    };
    this.add.text(14, 76, 'FLIEGEN & SAMMELN', headerStyle);
    this.add.text(GAME_WIDTH / 2 + 14, 76, 'AUSRÜSTUNG', headerStyle);

    // Build rows: 0–3 left column, 4–7 right column
    const rowStartY = 98;
    const rowSpacing = 72;
    ROWS.forEach((row, i) => {
      const col = i < 4 ? 0 : 1;
      const y = rowStartY + (i % 4) * rowSpacing;
      this.buildUpgradeRow(row, y, col as 0 | 1);
    });

    this.buildFlyButton();
    this.refreshAllRows();
  }

  private buildUpgradeRow(row: UpgradeRow, y: number, col: 0 | 1): void {
    const colX = col === 0 ? 8 : GAME_WIDTH / 2 + 8;
    const cardW = GAME_WIDTH / 2 - 16;
    const cardH = 62;

    // Card background
    this.add.rectangle(colX, y, cardW, cardH, 0x244e7a, 1)
      .setOrigin(0, 0.5)
      .setStrokeStyle(1.5, 0x4a7eb2);

    // Label
    this.add.text(colX + 12, y - 11, row.label, {
      fontFamily: '"Fredoka One", sans-serif',
      fontSize: '16px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    // Description
    this.add.text(colX + 12, y + 8, row.description, {
      fontFamily: '"Fredoka One", sans-serif',
      fontSize: '11px',
      color: '#aac6e6',
    }).setOrigin(0, 0.5);

    // Tier indicator
    const tierText = this.add.text(colX + 170, y - 4, '', {
      fontFamily: '"Fredoka One", sans-serif',
      fontSize: '12px',
      color: '#ffffff',
    }).setOrigin(0, 0.5);

    // Cost text
    const costText = this.add.text(colX + 170, y + 14, '', {
      fontFamily: '"Fredoka One", sans-serif',
      fontSize: '12px',
      color: '#ffd23a',
    }).setOrigin(0, 0.5);

    // Buy button (right side of card)
    const btnX = colX + cardW - 44;
    const button = this.add.rectangle(btnX, y, 76, 40, 0x4a90e2, 1)
      .setStrokeStyle(2, 0x2a5db0)
      .setInteractive({ useHandCursor: true });
    const buttonText = this.add.text(btnX, y, '', {
      fontFamily: '"Fredoka One", sans-serif',
      fontSize: '14px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    // Progress bar
    const barX = colX + 12;
    const barY = y + 26;
    this.add.rectangle(barX, barY, 145, 4, 0x334466, 1).setOrigin(0, 0.5);
    const progressBar = this.add.rectangle(barX, barY, 1, 4, 0xffd23a, 1).setOrigin(0, 0.5);

    button.on('pointerdown', () => {
      if (purchaseUpgrade(row.key)) {
        AudioManager.getInstance().play('upgrade');
        this.refreshAllRows();
        this.tweens.add({ targets: button, scaleX: 1.08, scaleY: 1.08, duration: 80, yoyo: true });
      } else {
        AudioManager.getInstance().play('uiClick');
        const orig = button.fillColor;
        button.setFillStyle(0xc04040);
        this.tweens.add({
          targets: button, x: button.x + 4, duration: 50, yoyo: true, repeat: 2,
          onComplete: () => button.setFillStyle(orig),
        });
      }
    });

    const maxTier = getMaxTier(row.key);
    this.rowRefs.push({ key: row.key, tierText, costText, button, buttonText, progressBar, maxTier });
  }

  private buildFlyButton(): void {
    const x = GAME_WIDTH / 2;
    const y = GAME_HEIGHT - 28;

    const button = this.add.rectangle(x, y, 260, 44, 0x2eb872, 1)
      .setStrokeStyle(3, 0x1e7a4a)
      .setInteractive({ useHandCursor: true });

    this.add.text(x, y, 'Nochmal fliegen', {
      fontFamily: '"Fredoka One", sans-serif',
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    button.on('pointerdown', () => {
      AudioManager.getInstance().play('uiClick');
      this.scene.start('GameScene');
    });
    button.on('pointerover', () => button.setFillStyle(0x3fd082));
    button.on('pointerout',  () => button.setFillStyle(0x2eb872));
  }

  private refreshAllRows(): void {
    this.coinsLabel.setText(`${getCoins()}`);
    for (const ref of this.rowRefs) {
      const tier    = getTier(ref.key);
      const maxTier = ref.maxTier;
      const cost    = getNextUpgradeCost(ref.key);
      const label   = UPGRADE_DEFS[ref.key][tier].label;

      const barWidth = Math.max(1, Math.round((tier / maxTier) * 145));
      this.tweens.add({ targets: ref.progressBar, displayWidth: barWidth, duration: 300, ease: 'Cubic.Out' });

      ref.tierText.setText(`Stufe ${tier + 1}/${maxTier + 1}`);
      ref.costText.setText(label);

      if (cost === null) {
        ref.button.setFillStyle(0x666666).disableInteractive();
        ref.buttonText.setText('MAX');
      } else {
        const canAfford = getCoins() >= cost;
        ref.button.setFillStyle(canAfford ? 0x4a90e2 : 0x556680).setInteractive({ useHandCursor: true });
        ref.buttonText.setText(`${cost}`);
        ref.costText.setColor(canAfford ? '#ffd23a' : '#cc7777');
      }
    }
  }
}
