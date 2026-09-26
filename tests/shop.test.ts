import { describe, expect, it } from 'vitest';
import { act, createGame } from '../src/game/engine';
import { ITEMS } from '../src/game/data';
import { MAPS } from '../src/game/maps';
import { getShopOffer, SHOP_ITEM_LIMITS, SHOP_ITEM_RARITY, SHOP_RARITY_LIMITS, validShopData } from '../src/game/shop';
import { parseSave } from '../src/game/storage';
import type { GameConfig, GameState } from '../src/game/types';

const config: GameConfig = {
  mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 1978,
  players: [
    { name: '甲', color: '#ff0000', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '乙', color: '#0000ff', shape: 'diamond', ai: true, personality: 'cautious' },
  ],
};
const shelf = ['snack', 'restkit', 'weather', 'rent', 'tea'];

function shopState(itemIds = shelf): GameState {
  const state = createGame(config);
  state.players[0].cash = 100_000;
  state.players[0].capacity = 100;
  state.phase = 'decision';
  state.pending = { kind: 'shop', title: '道具商店', body: '',
    choices: [...itemIds.map(id => ({ id: `buy:${id}`, label: ITEMS[id].name })), { id: 'leave', label: '离开' }],
    data: { itemIds, shopPurchases: {} } };
  return state;
}

function quantity(state: GameState, itemId: string) {
  return state.players[0].inventory.filter(slot => slot.itemId === itemId)
    .reduce((sum, slot) => sum + slot.quantity, 0);
}

function buyTimes(state: GameState, itemId: string, count: number) {
  let next = state;
  for (let i = 0; i < count; i++) {
    const bought = act(next, { type: 'choose', choiceId: `buy:${itemId}` });
    expect(bought).not.toBe(next);
    next = bought;
  }
  return next;
}

describe('shop visit purchase limits', () => {
  it('classifies every shop item and enforces common, uncommon and rare limits', () => {
    const shopable = Object.values(ITEMS).filter(item => item.shop).map(item => item.id).sort();
    expect(Object.keys(SHOP_ITEM_RARITY).sort()).toEqual(shopable);
    expect(SHOP_RARITY_LIMITS).toEqual({ common: 5, uncommon: 3, rare: 1 });
    expect(SHOP_ITEM_RARITY.rent).toBe('uncommon');
    expect(SHOP_ITEM_LIMITS.rent).toBe(1);

    for (const [itemId, limit] of [['snack', 5], ['restkit', 3], ['weather', 1], ['rent', 1]] as const) {
      const before = shopState();
      const initialQuantity = quantity(before, itemId);
      const after = buyTimes(before, itemId, limit);
      const offer = getShopOffer(after.pending!, itemId)!;
      expect(offer).toMatchObject({ limit, purchased: limit, remaining: 0 });
      expect(after.pending!.choices.find(choice => choice.id === `buy:${itemId}`)?.disabled).toBe(true);
      expect(after.players[0].cash).toBe(before.players[0].cash - ITEMS[itemId].price * limit);
      expect(quantity(after, itemId)).toBe(initialQuantity + limit);
      expect(act(after, { type: 'choose', choiceId: `buy:${itemId}` })).toBe(after);
    }
  });

  it('counts each stacked rent card purchase once and does not consume quota on failed purchases', () => {
    const initial = shopState();
    const originalRent = quantity(initial, 'rent');
    const rentBought = buyTimes(initial, 'rent', 1);
    expect(quantity(rentBought, 'rent')).toBe(originalRent + 1);
    expect(rentBought.players[0].inventory.filter(slot => slot.itemId === 'rent')).toHaveLength(1);
    expect(getShopOffer(rentBought.pending!, 'rent')?.remaining).toBe(0);
    expect(act(rentBought, { type: 'choose', choiceId: 'buy:rent' })).toBe(rentBought);

    const stackedAtCapacity = shopState();
    stackedAtCapacity.players[0].capacity = stackedAtCapacity.players[0].inventory.length;
    const stacked = buyTimes(stackedAtCapacity, 'rent', 1);
    expect(stacked.players[0].inventory.length).toBe(stackedAtCapacity.players[0].inventory.length);
    expect(getShopOffer(stacked.pending!, 'rent')?.purchased).toBe(1);

    const poor = shopState();
    poor.players[0].cash = ITEMS.snack.price - 1;
    expect(act(poor, { type: 'choose', choiceId: 'buy:snack' })).toBe(poor);
    expect(getShopOffer(poor.pending!, 'snack')?.purchased).toBe(0);
    poor.players[0].cash = ITEMS.snack.price;
    expect(getShopOffer(buyTimes(poor, 'snack', 1).pending!, 'snack')?.purchased).toBe(1);

    const full = shopState();
    full.players[0].capacity = full.players[0].inventory.length;
    const cash = full.players[0].cash;
    expect(act(full, { type: 'choose', choiceId: 'buy:snack' })).toBe(full);
    expect(full.players[0].cash).toBe(cash);
    expect(getShopOffer(full.pending!, 'snack')?.purchased).toBe(0);
    full.players[0].capacity += 1;
    expect(getShopOffer(buyTimes(full, 'snack', 1).pending!, 'snack')?.purchased).toBe(1);
  });

  it('preserves quota through save/load and migrates a pre-limit visit only once', () => {
    const bought = buyTimes(shopState(), 'rent', 1);
    const restored = parseSave(JSON.stringify(bought));
    expect(getShopOffer(restored.pending!, 'rent')).toMatchObject({ limit: 1, purchased: 1, remaining: 0 });
    expect(act(restored, { type: 'choose', choiceId: 'buy:rent' })).toBe(restored);
    expect(getShopOffer(parseSave(JSON.stringify(restored)).pending!, 'rent')?.remaining).toBe(0);

    const legacy = shopState();
    delete legacy.pending!.data!.shopPurchases;
    const migrated = parseSave(JSON.stringify(legacy));
    expect(migrated.pending!.data!.shopPurchases).toEqual({});
    const after = buyTimes(migrated, 'rent', 1);
    expect(getShopOffer(parseSave(JSON.stringify(after)).pending!, 'rent')?.purchased).toBe(1);
  });

  it('refreshes stock and purchase counts when a player genuinely enters the shop again', () => {
    const shop = MAPS.lake.nodes.find(node => node.kind === 'shop')!;
    const state = createGame(config);
    state.weatherId = 'clear'; state.encounters = [];
    state.rng = Math.imul(35, 2654435761) >>> 0; // First D6 roll is one step.
    state.players[0].position = shop.neighbors[0];
    state.players[0].previousPosition = null;
    state.players[0].routeNextPosition = shop.id;
    const entered = act(state, { type: 'roll' });
    expect(entered.pending?.kind).toBe('shop');
    expect(entered.pending?.data?.shopPurchases).toEqual({});
    const itemId = (entered.pending?.data?.itemIds as string[])[0];
    const bought = buyTimes(entered, itemId, 1);
    expect(getShopOffer(bought.pending!, itemId)?.purchased).toBe(1);
    const left = act(bought, { type: 'choose', choiceId: 'leave' });
    expect(left.pending).toBeNull();
    left.phase = 'ready'; left.weatherId = 'clear'; left.encounters = [];
    left.rng = Math.imul(35, 2654435761) >>> 0;
    left.players[0].position = shop.neighbors[0];
    left.players[0].previousPosition = null;
    left.players[0].routeNextPosition = shop.id;
    const reentered = act(left, { type: 'roll' });
    expect(reentered.pending?.kind).toBe('shop');
    expect(reentered.pending?.data?.shopPurchases).toEqual({});
    expect((reentered.pending?.data?.itemIds as string[])).toHaveLength(5);
    expect(new Set(reentered.pending?.data?.itemIds as string[]).size).toBe(5);
  });

  it('rejects unlisted, event-only and malformed shelf quota data', () => {
    const state = shopState();
    expect(getShopOffer(state.pending!, 'tax')).toBeNull();
    expect(getShopOffer(state.pending!, 'dice100')).toBeNull();
    expect(act(state, { type: 'choose', choiceId: 'buy:tax' })).toBe(state);
    expect(validShopData({ itemIds: ['dice100'], shopPurchases: {} })).toBe(false);
    expect(validShopData({ itemIds: ['lottery'], shopPurchases: {} })).toBe(false);
    for (const data of [
      { itemIds: ['snack', 'snack'], shopPurchases: {} },
      { itemIds: shelf, shopPurchases: null },
      { itemIds: shelf, shopPurchases: { rent: 2 } },
      { itemIds: shelf, shopPurchases: { snack: -1 } },
      { itemIds: shelf, shopPurchases: { snack: 1.5 } },
      { itemIds: shelf, shopPurchases: { tax: 1 } },
      { itemIds: ['dice100'], shopPurchases: {} },
    ]) {
      const corrupt = structuredClone(state);
      corrupt.pending!.data = data;
      expect(() => parseSave(JSON.stringify(corrupt)), JSON.stringify(data)).toThrow('对局');
    }
  });
});
