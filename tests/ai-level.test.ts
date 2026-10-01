import { describe, expect, it } from 'vitest';
import { act, createGame, runAI } from '../src/game/engine';
import { EVENTS } from '../src/game/data';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import type { GameConfig, GameState } from '../src/game/types';

const base: GameConfig = {
  mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 247,
  propertyTrading: false,
  players: [
    { name: '真人', color: '#d55b48', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '电脑', color: '#277da8', shape: 'diamond', ai: true, personality: 'balanced' },
  ],
};

function ai(level: 'gentle' | 'fierce' = 'gentle'): GameState {
  const state = createGame({ ...base, players: [base.players[0], { ...base.players[1], aiLevel: level }] });
  state.currentPlayerIndex = 1;
  state.weatherId = 'clear';
  return state;
}

function eventState(eventId: string, level: 'gentle' | 'fierce' = 'gentle'): GameState {
  const state = ai(level);
  const event = EVENTS.find(entry => entry.id === eventId)!;
  state.phase = 'decision';
  state.pending = { kind: 'event', title: event.title, body: event.story, data: { eventId },
    choices: event.choices.map(choice => ({ id: choice.id, label: choice.label, description: choice.description })) };
  return state;
}

describe('AI levels and legal planning', () => {
  it('defaults old AI configuration to gentle and rejects unknown strengths', () => {
    const old = createGame(base);
    expect(old.players[1].aiLevel).toBe('gentle');
    expect(old.config.players[1].aiLevel).toBe('gentle');
    expect(parseSave(JSON.stringify(old)).players[1].aiLevel).toBe('gentle');
    expect(() => createGame({ ...base, players: [base.players[0], { ...base.players[1], aiLevel: 'impossible' as 'gentle' }] })).toThrow('AI level');
  });

  it('lets gentle AI pay a sensible event cost for a valuable usable item, but protects scarce health and full bags', () => {
    const healthy = eventState('prism_relay');
    const gained = runAI(healthy);
    expect(gained.turnEncounters?.at(-1)?.selectedChoiceId).toBe('prism_relay_calibrate');
    expect(gained.players[1].inventory.some(slot => slot.itemId === 'teleportStone')).toBe(true);
    expect(gained.players[1].cash).toBe(healthy.players[1].cash - 1200);

    const exhausted = eventState('prism_relay');
    exhausted.players[1].stamina = 8;
    const safe = runAI(exhausted);
    expect(safe.turnEncounters?.at(-1)?.selectedChoiceId).toBe('prism_relay_record');
    expect(safe.players[1].confinement).toBeNull();

    const full = eventState('prism_relay');
    full.players[1].capacity = full.players[1].inventory.length;
    const skipped = runAI(full);
    expect(skipped.turnEncounters?.at(-1)?.selectedChoiceId).toBe('prism_relay_record');
    expect(skipped.players[1].inventory.some(slot => slot.itemId === 'teleportStone')).toBe(false);
  });

  it('uses public route expectations for controller planning without advancing RNG', () => {
    const state = ai();
    state.players[1].travelProgress = 67;
    state.players[1].inventory.push({ uid: 'controller', itemId: 'controller', quantity: 1, wet: false });
    const randomState = state.rng;
    const planned = runAI(state);
    expect(planned.controlledRoll).toBeGreaterThanOrEqual(5);
    expect(planned.rng).toBe(randomState);
    expect(planned.aiTurn).toMatchObject({ actions: 1, attacks: 0, purchases: 0 });
  });

  it('fierce AI redeems productive assets and uses at most one hostile item in a turn', () => {
    const redeem = ai('fierce');
    const land = MAPS.lake.nodes.find(node => node.kind === 'land')!;
    redeem.properties[land.id] = { ownerId: 'p2', level: 2, mortgaged: true };
    const recovered = runAI(redeem);
    expect(recovered.properties[land.id].mortgaged).toBe(false);
    expect(recovered.aiTurn).toMatchObject({ actions: 1, attacks: 0 });

    const attack = ai('fierce');
    attack.players[1].inventory.push({ uid: 'tax1', itemId: 'tax', quantity: 1, wet: false },
      { uid: 'tax2', itemId: 'tax', quantity: 1, wet: false });
    const hit = runAI(attack);
    expect(hit.players[0].cash).toBe(attack.players[0].cash - 1800);
    expect(hit.aiTurn).toMatchObject({ attacks: 1, actions: 1 });
    const next = runAI(hit);
    expect(next.aiTurn?.attacks).toBe(1);
    expect(next.players[0].cash).toBe(hit.players[0].cash);

    const gentle = ai('gentle');
    gentle.players[1].inventory.push({ uid: 'gentle-tax', itemId: 'tax', quantity: 1, wet: false });
    const peaceful = runAI(gentle);
    expect(peaceful.players[0].cash).toBe(gentle.players[0].cash);
    expect(peaceful.players[1].inventory.some(slot => slot.uid === 'gentle-tax')).toBe(true);
  });

  it('lets a hidden shield block an attack and counts it toward the turn limit, while wet attacks stay unusable', () => {
    const blocked = ai('fierce');
    blocked.players[1].inventory.push({ uid: 'tax1', itemId: 'tax', quantity: 1, wet: false },
      { uid: 'tax2', itemId: 'tax', quantity: 1, wet: false });
    blocked.players[0].inventory.push({ uid: 'shield', itemId: 'shield', quantity: 1, wet: false });
    const first = runAI(blocked);
    expect(first.aiTurn?.attacks).toBe(1);
    expect(first.players[0].inventory.some(slot => slot.uid === 'shield')).toBe(false);
    expect(first.players[0].cash).toBe(blocked.players[0].cash);
    const next = runAI(first);
    expect(next.players[0].cash).toBe(first.players[0].cash);
    expect(next.aiTurn?.attacks).toBe(1);

    const wet = ai('fierce');
    wet.players[1].inventory.push({ uid: 'wet-tax', itemId: 'tax', quantity: 1, wet: true });
    const second = runAI(wet);
    expect(second.players[1].inventory.some(slot => slot.uid === 'wet-tax')).toBe(true);

    const capped = ai('fierce');
    capped.aiTurn = { playerId: 'p2', day: capped.day, actions: 8, attacks: 0, purchases: 0 };
    capped.players[1].inventory.push({ uid: 'ready-tax', itemId: 'tax', quantity: 1, wet: false });
    const rolled = runAI(capped);
    expect(rolled.movement?.dice).toBe(true);
    expect(rolled.aiTurn?.actions).toBe(9);
  });

  it('avoids a challenge-mode hundred-sided scorch without weather protection', () => {
    const state = ai('fierce');
    state.weatherId = 'scorch';
    state.config.weatherMode = 'challenge';
    state.players[1].inventory.push({ uid: 'hundred', itemId: 'dice100', quantity: 1, wet: false },
      { uid: 'twin', itemId: 'twinDish', quantity: 1, wet: false });
    const safe = runAI(state);
    expect(safe.selectedDie).not.toBe(100);
    expect(safe.twinRoll).toBe(false);
    const preselected = structuredClone(state);
    preselected.selectedDie = 100;
    const rested = runAI(preselected);
    expect(rested.phase).toBe('end');
    expect(rested.players[1].stamina).toBeGreaterThan(90);
  });

  it('uses worst-case scorching harm before choosing a large die, including one already selected', () => {
    const state = ai('fierce');
    state.config.weatherMode = 'challenge';
    state.weatherId = 'scorch';
    state.rng = Math.imul(52, 2654435761) >>> 0;
    state.players[1].stamina = 50;
    state.players[1].mood = 50;
    state.players[1].inventory = [{ uid: 'twenty', itemId: 'dice20', quantity: 1, wet: false }];
    const rolled = runAI(state);
    expect(rolled.movement?.face).toBe(6);
    expect(rolled.players[1].confinement).toBeNull();
    expect(rolled.players[1].inventory.some(slot => slot.uid === 'twenty')).toBe(true);

    const selected = structuredClone(state);
    selected.selectedDie = 20;
    const rested = runAI(selected);
    expect(rested.phase).toBe('end');
    expect(rested.movement).toBeNull();
    expect(rested.players[1].confinement).toBeNull();
  });

  it('keeps a controller when sandstorm retreat makes its final landing estimate unsafe', () => {
    const state = createGame({ ...base, mapId: 'forest', weatherMode: 'challenge', seed: 19 });
    state.currentPlayerIndex = 1;
    state.weatherId = 'sandstorm';
    state.players[1].position = 2;
    state.players[1].previousPosition = 1;
    state.players[1].inventory.push({ uid: 'route-control', itemId: 'controller', quantity: 1, wet: false });
    state.properties[3] = { ownerId: 'p1', level: 4, mortgaged: false };
    const next = runAI(state);
    expect(next.controlledRoll).toBeNull();
    expect(next.players[1].inventory.some(slot => slot.uid === 'route-control')).toBe(true);
    expect(next.movement?.controlled).not.toBe(true);
  });

  it('shops only useful items within a visit budget and retains a stock position through a routine dip', () => {
    const shopper = ai('fierce');
    shopper.players[1].stamina = 50;
    shopper.players[1].mood = 50;
    const shop = MAPS.lake.nodes.find(node => node.kind === 'shop')!;
    shopper.players[1].position = shop.id;
    shopper.phase = 'decision';
    shopper.pending = { kind: 'shop', title: '道具商店', body: '', data: { itemIds: ['restkit', 'coffee', 'tea'], shopPurchases: {} },
      choices: ['restkit', 'coffee', 'tea'].map(id => ({ id: `buy:${id}`, label: id })).concat([{ id: 'leave', label: '离开' }]) };
    const one = runAI(shopper);
    expect(one.aiTurn?.purchases).toBe(1);
    const two = runAI(one);
    expect(two.aiTurn?.purchases).toBe(2);
    const left = runAI(two);
    expect(left.phase).toBe('end');

    const investor = ai('fierce');
    const exchange = MAPS.lake.nodes.find(node => node.kind === 'exchange')!;
    investor.players[1].position = exchange.id;
    investor.players[1].holdings[investor.stocks[0].id] = 10;
    investor.stocks[0].change = -5;
    investor.phase = 'decision';
    investor.pending = { kind: 'exchange', title: '交易所', body: '', choices: [{ id: 'leave', label: '离开' }] };
    const afterDip = runAI(investor);
    expect(afterDip.players[1].holdings[investor.stocks[0].id]).toBe(10);
  });

  it('buys a useful hostile item and can stack a rent card despite a full bag', () => {
    const land = MAPS.lake.nodes.find(node => node.kind === 'land')!;
    const shop = MAPS.lake.nodes.find(node => node.kind === 'shop')!;
    const threat = ai('fierce');
    threat.properties[land.id] = { ownerId: 'p1', level: 2, mortgaged: false };
    threat.players[1].position = shop.id;
    threat.phase = 'decision';
    threat.pending = { kind: 'shop', title: '道具商店', body: '', data: { itemIds: ['demolish', 'tax'], shopPurchases: {} },
      choices: [{ id: 'buy:demolish', label: '拆迁' }, { id: 'buy:tax', label: '税务' }, { id: 'leave', label: '离开' }] };
    const bought = runAI(threat);
    expect(bought.players[1].inventory.some(slot => slot.itemId === 'demolish')).toBe(true);
    expect(bought.aiTurn?.purchases).toBe(1);
    const later = structuredClone(bought);
    later.phase = 'ready'; later.pending = null; later.aiTurn = undefined;
    const used = runAI(later);
    expect(used.properties[land.id].level).toBe(1);
    expect(used.aiTurn?.attacks).toBe(1);

    const full = ai('fierce');
    full.properties[land.id] = { ownerId: 'p1', level: 2, mortgaged: false };
    full.players[1].position = shop.id;
    while (full.players[1].inventory.length < full.players[1].capacity) {
      full.players[1].inventory.push({ uid: `fill-${full.players[1].inventory.length}`, itemId: 'snack', quantity: 1, wet: false });
    }
    const previousCards = full.players[1].inventory.filter(slot => slot.itemId === 'rent').reduce((sum, slot) => sum + slot.quantity, 0);
    full.phase = 'decision';
    full.pending = { kind: 'shop', title: '道具商店', body: '', data: { itemIds: ['rent'], shopPurchases: {} },
      choices: [{ id: 'buy:rent', label: '免租卡' }, { id: 'leave', label: '离开' }] };
    const stacked = runAI(full);
    expect(stacked.players[1].inventory.length).toBe(full.players[1].capacity);
    expect(stacked.players[1].inventory.filter(slot => slot.itemId === 'rent').reduce((sum, slot) => sum + slot.quantity, 0)).toBe(previousCards + 1);
  });

  it('does not buy repair or demolition for utilities that those items cannot target', () => {
    const utilities = MAPS.lake.nodes.filter(node => ['power', 'water', 'telecom'].includes(node.kind));
    const shop = MAPS.lake.nodes.find(node => node.kind === 'shop')!;
    const shopping = (itemId: 'repair' | 'demolish') => {
      const state = ai('fierce');
      state.players[1].position = shop.id;
      state.phase = 'decision';
      state.pending = { kind: 'shop', title: '道具商店', body: '', data: { itemIds: [itemId], shopPurchases: {} },
        choices: [{ id: `buy:${itemId}`, label: itemId }, { id: 'leave', label: '离开' }] };
      return state;
    };
    const owned = shopping('repair');
    owned.properties[utilities[0].id] = { ownerId: 'p2', level: 0, mortgaged: false };
    const noRepair = runAI(owned);
    expect(noRepair.phase).toBe('end');
    expect(noRepair.players[1].inventory.some(slot => slot.itemId === 'repair')).toBe(false);
    expect(noRepair.aiTurn?.purchases).toBe(0);

    const opposing = shopping('demolish');
    for (const node of utilities.slice(0, 3)) opposing.properties[node.id] = { ownerId: 'p1', level: 1, mortgaged: false };
    const noDemolition = runAI(opposing);
    expect(noDemolition.phase).toBe('end');
    expect(noDemolition.players[1].inventory.some(slot => slot.itemId === 'demolish')).toBe(false);
    expect(noDemolition.aiTurn?.purchases).toBe(0);
  });

  it('preserves a fierce buyer cash reserve when offered a cheap property', () => {
    const state = ai('fierce');
    state.currentPlayerIndex = 0;
    state.config.propertyTrading = true;
    const land = MAPS.lake.nodes.find(node => node.kind === 'land')!;
    state.properties[land.id] = { ownerId: 'p1', level: 0, mortgaged: false };
    state.players[1].cash = 6000;
    const rejected = act(state, { type: 'offerTrade', targetId: 'p2', nodeId: land.id, price: 1000 });
    expect(rejected).not.toBe(state);
    expect(rejected.properties[land.id].ownerId).toBe('p1');
    expect(rejected.players[1].cash).toBe(6000);
  });

  it('keeps upgrading an affordable owned property through level four when landing on it', () => {
    let state = ai('fierce');
    const land = MAPS.lake.nodes.find(node => node.kind === 'land')!;
    state.players[1].position = land.id;
    state.properties[land.id] = { ownerId: 'p2', level: 0, mortgaged: false };
    for (let level = 1; level <= 4; level++) {
      state.phase = 'decision';
      state.pending = { kind: 'upgrade', title: land.name, body: '', data: { nodeId: land.id },
        choices: [{ id: 'upgrade', label: '升级' }, { id: 'leave', label: '离开' }] };
      state = runAI(state);
      expect(state.properties[land.id].level).toBe(level);
    }
  });
});
