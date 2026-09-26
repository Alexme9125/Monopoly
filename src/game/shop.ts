import { ITEMS } from './data';
import type { Prompt } from './types';

export type ShopRarity = 'common' | 'uncommon' | 'rare';

export const SHOP_RARITY_LIMITS: Record<ShopRarity, number> = { common: 5, uncommon: 3, rare: 1 };
export const SHOP_RARITY_LABELS: Record<ShopRarity, string> = { common: '常见', uncommon: '进阶', rare: '稀有' };
export const SHOP_ITEM_LIMITS: Record<string, number> = { rent: 1 };

/** Every item that can appear on a shop shelf has an explicit rarity. */
export const SHOP_ITEM_RARITY: Record<string, ShopRarity> = {
  dice8: 'common', snack: 'common', feast: 'common', tea: 'common', coffee: 'common',
  dice12: 'uncommon', twinDish: 'uncommon', restkit: 'uncommon', dry: 'uncommon', arrest: 'uncommon', rent: 'uncommon',
  dice20: 'rare', controller: 'rare', bomb: 'rare', demolish: 'rare', acquire: 'rare',
  shield: 'rare', weather: 'rare', bag: 'rare', luck: 'rare', unluck: 'rare',
  tax: 'rare', teleport: 'rare', teleportStone: 'rare', umbrella: 'rare', repair: 'rare',
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const shopLimit = (itemId: string) => Object.hasOwn(SHOP_ITEM_LIMITS, itemId)
  ? SHOP_ITEM_LIMITS[itemId] : SHOP_RARITY_LIMITS[SHOP_ITEM_RARITY[itemId]];

export function validShopData(data: unknown): boolean {
  if (!record(data) || !Array.isArray(data.itemIds)) return false;
  const ids = data.itemIds;
  if (ids.length < 1 || ids.length > 5
    || ids.some(id => typeof id !== 'string' || !Object.hasOwn(ITEMS, id) || !ITEMS[id].shop || !Object.hasOwn(SHOP_ITEM_RARITY, id))
    || new Set(ids).size !== ids.length) return false;
  if (data.shopPurchases === undefined) return true; // Pre-limit saves start at zero on import.
  return record(data.shopPurchases) && Object.entries(data.shopPurchases).every(([id, count]) =>
    ids.includes(id) && Number.isSafeInteger(count) && Number(count) >= 0 && Number(count) <= shopLimit(id));
}

export function getShopOffer(prompt: Prompt, itemId: string): {
  rarity: ShopRarity; label: string; limit: number; purchased: number; remaining: number;
} | null {
  if (prompt.kind !== 'shop' || !validShopData(prompt.data) || !(prompt.data!.itemIds as string[]).includes(itemId)) return null;
  const rarity = SHOP_ITEM_RARITY[itemId];
  const limit = shopLimit(itemId);
  const purchased = (prompt.data!.shopPurchases as Record<string, number> | undefined)?.[itemId] ?? 0;
  return { rarity, label: SHOP_RARITY_LABELS[rarity], limit, purchased, remaining: limit - purchased };
}
