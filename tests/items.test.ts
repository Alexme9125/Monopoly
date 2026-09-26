import { describe, expect, it } from 'vitest';
import { act, canTargetItem, canUseItem, createGame, getRent, runAI } from '../src/game/engine';
import { EVENTS, ITEMS, JOURNEY_REWARD_CASH, JOURNEY_REWARD_STEPS } from '../src/game/data';
import { ROADSIDE_CASH_MAX, ROADSIDE_CASH_MIN } from '../src/game/economy';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import { getShopOffer, SHOP_ITEM_RARITY } from '../src/game/shop';
import type { GameConfig, GameState } from '../src/game/types';

const config: GameConfig = { mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 1978,
  players: [
    { name: '甲', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '乙', color: '#277DA8', shape: 'diamond', ai: true, personality: 'cautious' },
  ],
};
const game = () => { const state = createGame(config); state.weatherId = 'clear'; return state; };
const tile = (kind: string) => MAPS.lake.nodes.find(node => node.kind === kind)!;
const grant = (state: GameState, itemId: string, playerIndex = 0) => {
  const uid = `qa-${itemId}-${state.players[playerIndex].inventory.length}`;
  state.players[playerIndex].inventory.push({ uid, itemId, quantity: 1, wet: false });
  return uid;
};
const rawDice = (seed: number, face: number) => {
  const first = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  const second = (Math.imul(first, 1664525) + 1013904223) >>> 0;
  return [1 + Math.floor(first / 0x1_0000_0000 * face), 1 + Math.floor(second / 0x1_0000_0000 * face)];
};

describe('teleport stone and twin dish', () => {
  it('publishes the shop tiers, target kind and two universal event rewards', () => {
    expect(ITEMS.teleportStone).toMatchObject({ price: 3200, category: 'special', stackable: false, susceptible: false, shop: true, target: 'node' });
    expect(ITEMS.twinDish).toMatchObject({ price: 980, category: 'dice', stackable: false, susceptible: true, shop: true });
    expect(EVENTS).toHaveLength(48);
    expect(EVENTS.find(event => event.id === 'prism_relay')?.choices[0]).toMatchObject({ id: 'prism_relay_calibrate', cash: -1200, stamina: -8, item: 'teleportStone' });
    expect(EVENTS.find(event => event.id === 'twin_culture')?.choices[0]).toMatchObject({ id: 'twin_culture_nurture', cash: -380, mood: -6, item: 'twinDish' });
    expect(SHOP_ITEM_RARITY.teleportStone).toBe('rare');
    expect(SHOP_ITEM_RARITY.twinDish).toBe('uncommon');
    const shelf = { kind: 'shop', title: '商店', body: '', choices: [], data: { itemIds: ['teleportStone', 'twinDish'], shopPurchases: {} } };
    expect(getShopOffer(shelf, 'teleportStone')?.limit).toBe(1);
    expect(getShopOffer(shelf, 'twinDish')?.limit).toBe(3);
  });

  it('applies new event exchanges only when cash, stamina or mood and bag room suffice', () => {
    for (const [eventId, choiceId, itemId, cashCost, statusCost] of [
      ['prism_relay', 'prism_relay_calibrate', 'teleportStone', 1200, 8],
      ['twin_culture', 'twin_culture_nurture', 'twinDish', 380, 6],
    ] as const) {
      const event = EVENTS.find(entry => entry.id === eventId)!;
      const state = game(); state.encounters = [];
      state.players[0].position = tile('event').id;
      state.phase = 'decision';
      state.pending = { kind: 'event', title: event.title, body: event.story,
        choices: event.choices.map(choice => ({ id: choice.id, label: choice.label })), data: { eventId } };
      const full = structuredClone(state); full.players[0].capacity = full.players[0].inventory.length;
      expect(act(full, { type: 'choose', choiceId })).toBe(full);
      const poor = structuredClone(state); poor.players[0].cash = cashCost - 1;
      expect(act(poor, { type: 'choose', choiceId })).toBe(poor);
      const weak = structuredClone(state);
      if (eventId === 'prism_relay') weak.players[0].stamina = statusCost - 1;
      else weak.players[0].mood = statusCost - 1;
      expect(act(weak, { type: 'choose', choiceId })).toBe(weak);
      const chosen = act(state, { type: 'choose', choiceId });
      expect(chosen.players[0].cash).toBe(state.players[0].cash - cashCost);
      expect(chosen.players[0].inventory.some(slot => slot.itemId === itemId)).toBe(true);
      expect(chosen.turnEncounters?.at(-1)?.result).toContain(ITEMS[itemId].name);
    }
  });

  it('validates all target kinds before consuming an item', () => {
    const state = game();
    const stone = grant(state, 'teleportStone');
    const stationCoupon = grant(state, 'teleport');
    const acquire = grant(state, 'acquire');
    const controller = grant(state, 'controller');
    const hostile = tile('land');
    const station = tile('station');
    expect(canTargetItem(state, 'p1', stone, { nodeId: state.players[0].position })).toBe(false);
    expect(canTargetItem(state, 'p1', stone, { nodeId: 999999 })).toBe(false);
    expect(canTargetItem(state, 'p1', stone, { nodeId: hostile.id })).toBe(true);
    expect(canTargetItem(state, 'p1', stationCoupon, { nodeId: hostile.id })).toBe(false);
    expect(canTargetItem(state, 'p1', stationCoupon, { nodeId: station.id })).toBe(true);
    state.players[0].position = station.id;
    expect(canTargetItem(state, 'p1', stationCoupon, { nodeId: station.id })).toBe(false);
    expect(act(state, { type: 'useItem', itemUid: stationCoupon, nodeId: station.id })).toBe(state);
    state.players[0].position = MAPS.lake.nodes.find(node => node.kind === 'start')!.id;
    expect(canTargetItem(state, 'p1', acquire, { nodeId: hostile.id })).toBe(false);
    state.properties[hostile.id] = { ownerId: 'p2', level: 4, mortgaged: false };
    expect(canTargetItem(state, 'p1', acquire, { nodeId: hostile.id })).toBe(false);
    state.properties[hostile.id].level = 0;
    expect(canTargetItem(state, 'p1', acquire, { nodeId: hostile.id })).toBe(true);
    expect(canTargetItem(state, 'p1', controller, { diceValue: 0 })).toBe(false);
    expect(canTargetItem(state, 'p1', controller, { diceValue: 6 })).toBe(true);
    expect(act(state, { type: 'useItem', itemUid: stone, nodeId: state.players[0].position })).toBe(state);
    expect(act(state, { type: 'useItem', itemUid: stone, nodeId: 999999 })).toBe(state);
    expect(state.players[0].inventory.some(slot => slot.uid === stone)).toBe(true);
  });

  it('teleports to a coin without walking, rolling, crossing start or gaining journey progress', () => {
    const state = game(); const stone = grant(state, 'teleportStone'); const coin = tile('coin');
    state.players[0].travelProgress = 71;
    state.selectedDie = 8; state.twinRoll = true;
    const before = state.players[0];
    const arrived = act(state, { type: 'useItem', itemUid: stone, nodeId: coin.id });
    expect(arrived).not.toBe(state);
    expect(arrived.players[0].position).toBe(coin.id);
    expect(arrived.players[0].travelProgress).toBe(71);
    expect(arrived.players[0].stamina).toBe(before.stamina);
    expect(arrived.players[0].cash - before.cash).toBeGreaterThanOrEqual(ROADSIDE_CASH_MIN);
    expect(arrived.players[0].cash - before.cash).toBeLessThanOrEqual(ROADSIDE_CASH_MAX);
    expect(arrived.movement).toMatchObject({ dice: false, roll: 0, path: [before.position, coin.id], segments: [{ kind: 'transfer', path: [before.position, coin.id] }] });
    expect(arrived.movement?.effects?.some(entry => entry.kind === 'cash')).toBe(true);
    expect(arrived.selectedDie).toBe(6);
    expect(arrived.twinRoll).toBe(false);
    expect(arrived.phase).toBe('end');
    expect(arrived.players[0].inventory.some(slot => slot.uid === stone)).toBe(false);
    expect(act(arrived, { type: 'roll' })).toBe(arrived);
  });

  it('resolves property rent and manual rent-card choice after teleporting', () => {
    const state = game(); const stone = grant(state, 'teleportStone'); const land = tile('land');
    state.properties[land.id] = { ownerId: 'p2', level: 0, mortgaged: false };
    const rent = getRent(state, land.id);
    const arrival = act(state, { type: 'useItem', itemUid: stone, nodeId: land.id });
    expect(arrival.pending?.kind).toBe('rent');
    expect(arrival.players[0].cash).toBe(state.players[0].cash);
    const paid = act(arrival, { type: 'choose', choiceId: 'pay' });
    expect(paid.players[0].cash).toBe(state.players[0].cash - rent);
    expect(paid.players[1].cash).toBe(state.players[1].cash + rent);
    const waived = act(arrival, { type: 'choose', choiceId: 'use_card' });
    expect(waived.players[0].cash).toBe(state.players[0].cash);
    expect(waived.notices?.at(-1)).toMatchObject({ kind: 'rent', amount: 0, recipientId: 'p2' });
  });

  it('opens the ordinary station, land, shop and event decisions after teleporting', () => {
    for (const [kind, promptKind] of [['station', 'station'], ['land', 'land'], ['shop', 'shop'], ['event', 'event']] as const) {
      const state = game(); const stone = grant(state, 'teleportStone'); const target = tile(kind);
      state.encounters = [];
      const arrived = act(state, { type: 'useItem', itemUid: stone, nodeId: target.id });
      expect(arrived.pending?.kind, kind).toBe(promptKind);
      expect(arrived.movement?.segments?.[0]?.label).toContain('传送石');
      expect(arrived.phase).toBe('decision');
      expect(arrived.twinRoll).toBe(false);
    }
  });

  it('applies only landing weather harm when teleporting, without a weather slide', () => {
    const state = game(); state.weatherId = 'snow'; state.encounters = [];
    const stone = grant(state, 'teleportStone'); const land = tile('land');
    const arrived = act(state, { type: 'useItem', itemUid: stone, nodeId: land.id });
    expect(arrived.players[0].stamina).toBe(state.players[0].stamina - 1);
    expect(arrived.movement?.path).toEqual([state.players[0].position, land.id]);
    expect(arrived.movement?.segments).toHaveLength(1);
    expect(arrived.movement?.effects?.some(entry => entry.label.includes('体力 −1'))).toBe(true);
  });

  it('rolls two independent current dice and applies the heat modifier only once', () => {
    for (const order of ['twin-first', 'die-first'] as const) {
      const state = game(); state.weatherId = 'heat'; state.rng = 123456;
      const twin = grant(state, 'twinDish'); const die = grant(state, 'dice20');
      const first = order === 'twin-first' ? twin : die, second = order === 'twin-first' ? die : twin;
      const prepared = act(act(state, { type: 'useItem', itemUid: first }), { type: 'useItem', itemUid: second });
      expect(prepared.twinRoll).toBe(true);
      expect(prepared.selectedDie).toBe(20);
      const expected = rawDice(prepared.rng, 20);
      const rolled = act(prepared, { type: 'roll' });
      const sum = expected[0] + expected[1];
      expect(rolled.movement).toMatchObject({ rolls: expected, face: 20, roll: sum, modifier: -2 });
      expect(rolled.movement?.segments?.[0].path).toHaveLength(Math.max(0, sum - 2) + 1);
      expect(rolled.twinRoll).toBe(false);
      expect(rolled.selectedDie).toBe(6);
      const baseCost = Math.min(4, 2 + Math.floor((sum - 1) * 3 / 40));
      expect(rolled.players[0].stamina).toBeGreaterThanOrEqual(100 - baseCost - 2);
    }
  });

  it('rejects controller and twin dish in either order without consuming the second item', () => {
    const state = game(); const controller = grant(state, 'controller'); const twin = grant(state, 'twinDish');
    const controlled = act(state, { type: 'useItem', itemUid: controller, diceValue: 4 });
    expect(canUseItem(controlled, 'p1', twin)).toBe(false);
    expect(act(controlled, { type: 'useItem', itemUid: twin })).toBe(controlled);
    const doubled = act(state, { type: 'useItem', itemUid: twin });
    expect(canUseItem(doubled, 'p1', controller)).toBe(false);
    expect(act(doubled, { type: 'useItem', itemUid: controller, diceValue: 4 })).toBe(doubled);
    expect(act(doubled, { type: 'useItem', itemUid: twin })).toBe(doubled);
    expect(doubled.players[0].inventory.some(slot => slot.uid === controller)).toBe(true);
  });

  it('keeps twin progress to normal steps, not an extra snow slide, and handles zero steps', () => {
    const state = game(); state.weatherId = 'snow'; state.players[0].travelProgress = 71;
    const twin = grant(state, 'twinDish');
    const prepared = act(state, { type: 'useItem', itemUid: twin });
    const rolled = act(prepared, { type: 'roll' });
    const normal = Math.max(0, rolled.movement!.roll + rolled.movement!.modifier);
    expect(rolled.movement?.segments?.[0].path).toHaveLength(normal + 1);
    expect(rolled.movement?.segments?.[1].path).toHaveLength(2);
    expect(rolled.players[0].travelProgress).toBe((71 + normal) % JOURNEY_REWARD_STEPS);
    expect(rolled.notices?.filter(entry => entry.kind === 'milestone').at(-1)?.amount).toBe(JOURNEY_REWARD_CASH * Math.floor((71 + normal) / JOURNEY_REWARD_STEPS));
    const zeroSeed = Array.from({ length: 10000 }, (_, seed) => seed).find(seed => rawDice(seed, 6).every(value => value === 1))!;
    const zero = game(); zero.weatherId = 'heat'; zero.rng = zeroSeed;
    const zeroPrepared = act(zero, { type: 'useItem', itemUid: grant(zero, 'twinDish') });
    const stopped = act(zeroPrepared, { type: 'roll' });
    expect(stopped.movement).toMatchObject({ rolls: [1, 1], roll: 2, modifier: -2 });
    expect(stopped.movement?.segments?.[0].path).toHaveLength(1);
    expect(stopped.players[0].travelProgress).toBe(0);
    expect(stopped.players[0].stamina).toBe(96);
  });

  it('keeps two D100 rolls within one action, including multiple journey thresholds', () => {
    const state = game(); state.weatherId = 'clear'; state.selectedDie = 100;
    state.players[0].travelProgress = 71;
    state.rng = Array.from({ length: 10000 }, (_, seed) => seed).find(seed => rawDice(seed, 100)[0] + rawDice(seed, 100)[1] >= 146)!;
    const prepared = act(state, { type: 'useItem', itemUid: grant(state, 'twinDish') });
    const rolled = act(prepared, { type: 'roll' });
    const normal = rolled.movement!.segments![0].path.length - 1;
    expect(rolled.movement?.rolls).toHaveLength(2);
    expect(rolled.movement?.face).toBe(100);
    expect(normal).toBe(rolled.movement?.roll);
    expect(rolled.players[0].travelProgress).toBe((71 + normal) % JOURNEY_REWARD_STEPS);
    expect(Math.floor((71 + normal) / JOURNEY_REWARD_STEPS)).toBeGreaterThanOrEqual(2);
    expect(rolled.notices?.filter(entry => entry.kind === 'milestone').at(-1)?.amount)
      .toBe(Math.floor((71 + normal) / JOURNEY_REWARD_STEPS) * JOURNEY_REWARD_CASH);
  });

  it('migrates legacy saves and rejects malformed or controller-conflicting twin state', () => {
    const legacy = game(); delete legacy.twinRoll;
    expect(parseSave(JSON.stringify(legacy)).twinRoll).toBe(false);
    const active = game(); active.twinRoll = true; active.selectedDie = 8;
    expect(parseSave(JSON.stringify(active))).toMatchObject({ twinRoll: true, selectedDie: 8 });
    for (const invalid of ['true', 1, null]) expect(() => parseSave(JSON.stringify({ ...active, twinRoll: invalid }))).toThrow();
    expect(() => parseSave(JSON.stringify({ ...active, controlledRoll: 4 }))).toThrow();
    const twin = grant(active, 'twinDish');
    expect(canUseItem(active, 'p1', twin)).toBe(false);
    expect(act(active, { type: 'rest' }).twinRoll).toBe(false);
  });

  it('lets AI consume each item once and advance to its real follow-up decision', () => {
    const teleport = game(); teleport.currentPlayerIndex = 1; teleport.phase = 'ready';
    grant(teleport, 'teleportStone', 1);
    const jumped = runAI(teleport);
    expect(jumped.players[1].inventory.some(slot => slot.itemId === 'teleportStone')).toBe(false);
    expect(jumped.movement?.segments?.[0]).toMatchObject({ kind: 'transfer' });
    expect(jumped.pending?.kind).toBe('land');
    expect(runAI(jumped)).not.toBe(jumped);
    const twin = game(); twin.currentPlayerIndex = 1; twin.phase = 'ready';
    grant(twin, 'twinDish', 1);
    const prepared = runAI(twin);
    expect(prepared.twinRoll).toBe(true);
    expect(prepared.players[1].inventory.some(slot => slot.itemId === 'twinDish')).toBe(false);
    const rolled = runAI(prepared);
    expect(rolled.movement?.rolls).toHaveLength(2);
    expect(rolled.twinRoll).toBe(false);
  });
});
