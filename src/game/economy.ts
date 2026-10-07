import type { GameConfig, MapId, RentLevel } from './types';

export const BASE_STARTING_CASH = 100_000;
export function getStartingCash(config: Pick<GameConfig, 'mapId' | 'rentLevel'>): number {
  if (config.mapId === 'grandCity') return 150_000;
  return config.mapId === 'forest' && config.rentLevel === 'heavy' ? BASE_STARTING_CASH * 2 : BASE_STARTING_CASH;
}

export const PROPERTY_RENT_MULTIPLIERS = [0.4, 0.9, 1.75, 3.25, 6] as const;
export const RENT_LEVELS = ['relaxed', 'standard', 'heavy'] as const satisfies readonly RentLevel[];
export const RENT_LEVEL_NAMES: Record<RentLevel, string> = { relaxed: '轻松', standard: '标准', heavy: '沉重' };
export const RENT_BASE_MULTIPLIERS: Record<RentLevel, number> = { relaxed: 3, standard: 5, heavy: 10 };
const PROPERTY_RENT_BY_LEVEL = {
  relaxed: [0.24, 0.54, 1.05, 1.95, 3.6],
  standard: PROPERTY_RENT_MULTIPLIERS,
  heavy: [0.8, 1.8, 3.5, 6.5, 12],
} as const satisfies Record<RentLevel, readonly number[]>;

export function getPropertyRentMultipliers(level: RentLevel = 'standard', mapId?: MapId): readonly number[] {
  const ordinary = PROPERTY_RENT_BY_LEVEL[level];
  return mapId === 'hushedValley'
    ? [...ordinary, level === 'relaxed' ? 5.4 : level === 'heavy' ? 18 : 9]
    : ordinary;
}
export const UTILITY_RENT_BASE = 150;
export const UTILITY_RENT_CAP = 37_500;
export const ROADSIDE_CASH_MIN = 100;
export const ROADSIDE_CASH_MAX = 200;
export const RENT_MOOD_LOSS = 2;
export const HOSTILE_ITEM_MOOD_LOSS = 3;
