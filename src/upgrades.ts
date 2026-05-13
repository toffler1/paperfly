// Upgrade state manager - persists coin balance and upgrade tiers via localStorage.

import { UPGRADE_DEFS, UpgradeKey } from './config';

const STORAGE_KEY = 'paperfly_save_v1';

interface SaveData {
  coins: number;
  tiers: Record<UpgradeKey, number>;
  bestDistance: number;
}

const defaultSave = (): SaveData => ({
  coins: 0,
  tiers: { rubberBand: 0, glide: 0, magnet: 0, shield: 0, laser: 0, turbo: 0, tires: 0, bounce: 0 },
  bestDistance: 0,
});

function load(): SaveData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    return {
      coins: typeof parsed.coins === 'number' ? parsed.coins : 0,
      tiers: {
        rubberBand: parsed.tiers?.rubberBand ?? 0,
        glide:      parsed.tiers?.glide      ?? 0,
        magnet:     parsed.tiers?.magnet     ?? 0,
        shield:     parsed.tiers?.shield     ?? 0,
        laser:      parsed.tiers?.laser      ?? 0,
        turbo:      parsed.tiers?.turbo      ?? 0,
        tires:      parsed.tiers?.tires      ?? 0,
        bounce:     parsed.tiers?.bounce     ?? 0,
      },
      bestDistance: typeof parsed.bestDistance === 'number' ? parsed.bestDistance : 0,
    };
  } catch {
    return defaultSave();
  }
}

function save(data: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors - non-fatal
  }
}

// In-memory cache so we don't hit localStorage every frame.
let state: SaveData = load();

export function getCoins(): number {
  return state.coins;
}

export function addCoins(amount: number): void {
  state.coins += amount;
  save(state);
}

export function spendCoins(amount: number): boolean {
  if (state.coins < amount) return false;
  state.coins -= amount;
  save(state);
  return true;
}

export function getTier(key: UpgradeKey): number {
  return state.tiers[key];
}

export function getMaxTier(key: UpgradeKey): number {
  return UPGRADE_DEFS[key].length - 1;
}

export function getCurrentMultiplier(key: UpgradeKey): number {
  const tier = getTier(key);
  return UPGRADE_DEFS[key][tier].multiplier;
}

// Returns the cost to upgrade to the next tier, or null if already maxed.
export function getNextUpgradeCost(key: UpgradeKey): number | null {
  const tier = getTier(key);
  const next = UPGRADE_DEFS[key][tier + 1];
  return next ? next.cost : null;
}

export function getCurrentTierLabel(key: UpgradeKey): string {
  return UPGRADE_DEFS[key][getTier(key)].label;
}

// Attempts to purchase the next tier. Returns true on success.
export function purchaseUpgrade(key: UpgradeKey): boolean {
  const cost = getNextUpgradeCost(key);
  if (cost === null) return false;
  if (!spendCoins(cost)) return false;
  state.tiers[key] += 1;
  save(state);
  return true;
}

export function getBestDistance(): number {
  return state.bestDistance;
}

export function maybeUpdateBestDistance(meters: number): boolean {
  if (meters > state.bestDistance) {
    state.bestDistance = meters;
    save(state);
    return true;
  }
  return false;
}

// Convenience: reset save (handy for testing).
export function resetSave(): void {
  state = defaultSave();
  save(state);
}
