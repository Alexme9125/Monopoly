import { describe, expect, it } from 'vitest';
import { act, canTargetItem, createGame, getNetWorth, getRent, getTileRentPreview, runAI } from '../src/game/engine';
import { EVENTS, getJourneyRewardSteps } from '../src/game/data';
import { getPropertyRentMultipliers, getStartingCash } from '../src/game/economy';
import { MAPS } from '../src/game/maps';
import { getAvailableLandLevel, getBuildCost, getLandPurchaseDescription, getLandPurchasePrice, getMaxLandLevel, getMealRecovery, getPropertyAssetValue, isLandmark } from '../src/game/propertyRules';
import { parseSave } from '../src/game/storage';
import type { GameConfig, GameState, MapId, MapNode } from '../src/game/types';

const config = (mapId: MapId, seed = 14): GameConfig => ({ mapId, mode: 'pve', seasons: 4, weatherMode: 'standard', seed,
  players: [
    { name: '甲', color: '#ff0000', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '乙', color: '#0000ff', shape: 'diamond', ai: true, personality: 'balanced' },
  ] });

function arriveAt(state: GameState, node: MapNode): GameState {
  const from = node.neighbors[0];
  state.weatherId = 'clear';
  state.encounters = [];
  state.players[state.currentPlayerIndex].position = from;
  state.players[state.currentPlayerIndex].previousPosition = null;
  state.players[state.currentPlayerIndex].routeNextPosition = node.id;
  state.controlledRoll = 1;
  return act(state, { type: 'roll' });
}

describe('map-specific property and economy rules', () => {
  it('uses five floors only in Hushed Valley and leaves the existing tiers intact', () => {
    const node = MAPS.hushedValley.nodes.find(entry => entry.kind === 'land')!;
    expect(getMaxLandLevel('hushedValley')).toBe(5);
    expect(getMaxLandLevel('grandCity')).toBe(4);
    expect(isLandmark('hushedValley', node, 4)).toBe(false);
    expect(isLandmark('hushedValley', node, 5)).toBe(true);
    expect(isLandmark('lake', MAPS.lake.nodes.find(entry => entry.kind === 'land')!, 4)).toBe(true);
    expect(getMealRecovery('hushedValley', 5)).toBe(55);
    for (const [rentLevel, fifth] of [['relaxed', 5.4], ['standard', 9], ['heavy', 18]] as const) {
      expect(getPropertyRentMultipliers(rentLevel, 'hushedValley')).toEqual([...getPropertyRentMultipliers(rentLevel), fifth]);
      const state = createGame({ ...config('hushedValley'), rentLevel });
      state.weatherId = 'clear';
      state.properties[node.id] = { ownerId: 'p2', level: 4, mortgaged: false };
      expect(getRent(state, node.id)).toBe(Math.ceil(node.price! * getPropertyRentMultipliers(rentLevel)[4]));
      state.properties[node.id].level = 5;
      expect(getRent(state, node.id)).toBe(Math.ceil(node.price! * fifth));
      expect(getTileRentPreview(state, node.id).rent).toBe(getRent(state, node.id));
    }
  });

  it('permits fourth-floor demolition, acquisition, repair and bank sale but protects the fifth floor', () => {
    const state = createGame(config('hushedValley'));
    state.weatherId = 'clear';
    const node = MAPS.hushedValley.nodes.find(entry => entry.kind === 'land')!;
    state.players[0].cash = 100_000;
    state.players[0].inventory.push({ uid: 'demolish-test', itemId: 'demolish', quantity: 1, wet: false },
      { uid: 'acquire-test', itemId: 'acquire', quantity: 1, wet: false },
      { uid: 'repair-test', itemId: 'repair', quantity: 1, wet: false });
    state.properties[node.id] = { ownerId: 'p2', level: 4, mortgaged: false };
    expect(canTargetItem(state, 'p1', 'demolish-test', { nodeId: node.id })).toBe(true);
    expect(canTargetItem(state, 'p1', 'acquire-test', { nodeId: node.id })).toBe(true);
    const demolished = act(state, { type: 'useItem', itemUid: 'demolish-test', nodeId: node.id });
    expect(demolished.properties[node.id].level).toBe(3);
    const acquired = act(demolished, { type: 'useItem', itemUid: 'acquire-test', nodeId: node.id });
    expect(acquired.properties[node.id].ownerId).toBe('p1');
    acquired.properties[node.id].level = 4;
    expect(canTargetItem(acquired, 'p1', 'repair-test', { nodeId: node.id })).toBe(true);
    const repaired = act(acquired, { type: 'useItem', itemUid: 'repair-test', nodeId: node.id });
    expect(repaired.properties[node.id].level).toBe(5);
    expect(act(repaired, { type: 'sellAsset', nodeId: node.id })).toBe(repaired);
    const threatened = structuredClone(repaired);
    threatened.properties[node.id].ownerId = 'p2';
    expect(canTargetItem(threatened, 'p1', 'acquire-test', { nodeId: node.id })).toBe(false);
    expect(canTargetItem(threatened, 'p1', 'demolish-test', { nodeId: node.id })).toBe(false);
    const sale = structuredClone(acquired);
    const sold = act(sale, { type: 'sellAsset', nodeId: node.id });
    expect(sold.properties[node.id]).toBeUndefined();
    expect(sold.availablePropertyLevels?.[node.id]).toBeUndefined();
    expect(getAvailableLandLevel(sold, node.id)).toBe(0);
    expect(getLandPurchasePrice(sold, node.id)).toBe(node.price);
  });

  it('lets level-four buildings take event damage and level-five owners eat for 55 stamina', () => {
    const node = MAPS.hushedValley.nodes.find(entry => entry.kind === 'land')!;
    const event = EVENTS.find(entry => entry.id === 'inspection')!;
    const state = createGame(config('hushedValley'));
    state.weatherId = 'clear';
    state.players[0].position = MAPS.hushedValley.nodes.find(entry => entry.kind === 'event')!.id;
    state.properties[node.id] = { ownerId: 'p1', level: 4, mortgaged: false };
    state.phase = 'decision';
    state.pending = { kind: 'event', title: event.title, body: event.story,
      choices: [{ id: 'inspection_comply', label: '接受检修' }], data: { eventId: event.id, eventSource: 'tile' } };
    const damaged = act(state, { type: 'choose', choiceId: 'inspection_comply' });
    expect(damaged.properties[node.id].level).toBe(3);
    const protectedState = structuredClone(state);
    protectedState.properties[node.id].level = 5;
    const protectedResult = act(protectedState, { type: 'choose', choiceId: 'inspection_comply' });
    expect(protectedResult.properties[node.id].level).toBe(5);
    protectedResult.players[0].stamina = 20;
    protectedResult.phase = 'ready';
    protectedResult.pending = null;
    const landed = arriveAt(protectedResult, node);
    expect(landed.pending?.kind).toBe('meal');
    expect(landed.pending?.choices[0].label).toContain('+55');
    const beforeMeal = landed.players[0].stamina;
    const eaten = act(landed, { type: 'choose', choiceId: 'meal' });
    expect(eaten.players[0].stamina).toBe(Math.min(100, beforeMeal + 55));
  });

  it('lets a fierce Valley AI repair a fourth-floor building to its protected fifth floor', () => {
    const state = createGame(config('hushedValley'));
    const node = MAPS.hushedValley.nodes.find(entry => entry.kind === 'land')!;
    state.currentPlayerIndex = 1;
    state.players[1].aiLevel = 'fierce';
    state.weatherId = 'clear';
    state.properties[node.id] = { ownerId: 'p2', level: 4, mortgaged: false };
    state.players[1].inventory.push({ uid: 'ai-repair', itemId: 'repair', quantity: 1, wet: false });
    const after = runAI(state);
    expect(after.properties[node.id].level).toBe(5);
    expect(after.players[1].inventory.some(slot => slot.uid === 'ai-repair')).toBe(false);
  });

  it('starts Grand City at 150000 and buys its prefabricated building as one intact property', () => {
    const node = MAPS.grandCity.nodes[1];
    expect(node).toMatchObject({ kind: 'land', prefabLevel: 2 });
    expect(getStartingCash({ mapId: 'grandCity', rentLevel: 'heavy' })).toBe(150_000);
    expect(getJourneyRewardSteps('grandCity')).toBe(48);
    const state = createGame(config('grandCity'));
    const startingWorth = getNetWorth(state, 'p1');
    expect(state.players.map(player => player.cash)).toEqual([150_000, 150_000]);
    expect(Object.keys(state.properties)).toHaveLength(0);
    expect(Object.keys(state.availablePropertyLevels ?? {})).toHaveLength(50);
    expect(Object.values(state.availablePropertyLevels ?? {}).sort((a, b) => a - b)).toEqual([
      ...Array(15).fill(1), ...Array(15).fill(2), ...Array(10).fill(3), ...Array(10).fill(4),
    ]);
    const price = getPropertyAssetValue(node, 2);
    expect(price).toBe(node.price! + getBuildCost(node) * 2);
    expect(getLandPurchasePrice(state, node.id)).toBe(price);
    expect(getRent(state, node.id)).toBe(0);
    expect(getTileRentPreview(state, node.id)).toMatchObject({ price, rent: Math.ceil(node.price! * 1.75), prospective: true });
    const landed = arriveAt(state, node);
    expect(landed.pending?.kind).toBe('land');
    expect(landed.pending?.body).toContain(`${price} PM`);
    const bought = act(landed, { type: 'choose', choiceId: 'buy' });
    expect(bought.players[0].cash).toBe(150_000 - price);
    expect(bought.properties[node.id]).toMatchObject({ ownerId: 'p1', level: 2 });
    expect(bought.availablePropertyLevels?.[node.id]).toBeUndefined();
    expect(getNetWorth(bought, 'p1')).toBe(startingWorth);
    expect(getRent(bought, node.id)).toBe(Math.ceil(node.price! * 1.75));
    const mortgaged = act(bought, { type: 'mortgage', nodeId: node.id });
    expect(mortgaged.players[0].cash).toBe(bought.players[0].cash + Math.floor(price * 0.5));
    expect(getNetWorth(mortgaged, 'p1')).toBe(getNetWorth(bought, 'p1'));
    const redeemed = act(mortgaged, { type: 'redeem', nodeId: node.id });
    expect(redeemed.players[0].cash).toBe(mortgaged.players[0].cash - Math.ceil(price * 0.6));
    expect(redeemed.properties[node.id].level).toBe(2);
  });

  it('buys a newly vacant Grand City lot at base price, builds its first floor, and restores the save', () => {
    const node = MAPS.grandCity.nodes[3];
    expect(node).toMatchObject({ kind: 'land', district: '云阶' });
    expect(node.prefabLevel).toBeUndefined();
    const initial = createGame(config('grandCity'));
    expect(Object.keys(initial.availablePropertyLevels ?? {})).toHaveLength(50);
    expect(initial.availablePropertyLevels?.[node.id]).toBeUndefined();
    expect(getAvailableLandLevel(initial, node.id)).toBe(0);
    expect(getLandPurchasePrice(initial, node.id)).toBe(node.price);

    const landed = arriveAt(initial, node);
    expect(landed.pending?.kind).toBe('land');
    const bought = act(landed, { type: 'choose', choiceId: 'buy' });
    expect(bought.players[0].cash).toBe(initial.players[0].cash - node.price!);
    expect(bought.properties[node.id]).toMatchObject({ ownerId: 'p1', level: 0, mortgaged: false });
    expect(bought.availablePropertyLevels?.[node.id]).toBeUndefined();

    const ready = structuredClone(bought);
    ready.phase = 'ready';
    ready.pending = null;
    const returned = arriveAt(ready, node);
    expect(returned.pending?.kind).toBe('upgrade');
    const upgraded = act(returned, { type: 'choose', choiceId: 'upgrade' });
    expect(upgraded.players[0].cash).toBe(bought.players[0].cash - getBuildCost(node));
    expect(upgraded.properties[node.id]).toMatchObject({ ownerId: 'p1', level: 1, mortgaged: false });
    expect(parseSave(JSON.stringify(upgraded)).properties[node.id]).toMatchObject({ ownerId: 'p1', level: 1 });
  });

  it('keeps the actual bank-owned floors after sale and bankruptcy, with no prefab reset', () => {
    const node = MAPS.grandCity.nodes[2];
    expect(node.prefabLevel).toBe(3);
    let state = createGame(config('grandCity'));
    state = arriveAt(state, node);
    state = act(state, { type: 'choose', choiceId: 'buy' });
    state.properties[node.id].level = 2; // A previous demolition or event reduced the building.
    const sold = act(state, { type: 'sellAsset', nodeId: node.id });
    expect(sold.availablePropertyLevels?.[node.id]).toBe(2);
    expect(getAvailableLandLevel(sold, node.id)).toBe(2);
    expect(getLandPurchasePrice(sold, node.id)).toBe(getPropertyAssetValue(node, 2));
    expect(parseSave(JSON.stringify(sold)).availablePropertyLevels?.[node.id]).toBe(2);
    const rebought = act(arriveAt({ ...sold, phase: 'ready', pending: null }, node), { type: 'choose', choiceId: 'buy' });
    expect(rebought.properties[node.id].level).toBe(2);
    const bankrupt = structuredClone(rebought);
    bankrupt.players[0].cash = -1;
    bankrupt.phase = 'decision';
    bankrupt.pending = { kind: 'debt', title: '资金不足', body: '', choices: [{ id: 'bankrupt', label: '宣布破产' }], data: { resumePhase: 'end' } };
    const afterBankruptcy = act(bankrupt, { type: 'choose', choiceId: 'bankrupt' });
    expect(afterBankruptcy.properties[node.id]).toBeUndefined();
    expect(afterBankruptcy.availablePropertyLevels?.[node.id]).toBe(2);
  });

  it('validates bank floors and progress strictly while migrating absent fields without paying cash', () => {
    const city = createGame(config('grandCity'));
    city.players[0].travelProgress = 47;
    expect(parseSave(JSON.stringify(city)).players[0].travelProgress).toBe(47);
    const invalidProgress = structuredClone(city);
    invalidProgress.players[0].travelProgress = 48;
    expect(() => parseSave(JSON.stringify(invalidProgress))).toThrow();
    for (const value of [-1, 5, 1.5, '2', null]) {
      const invalid = structuredClone(city);
      (invalid.availablePropertyLevels as Record<number, unknown>)[1] = value;
      expect(() => parseSave(JSON.stringify(invalid)), String(value)).toThrow();
    }
    const owned = structuredClone(city);
    owned.properties[1] = { ownerId: 'p1', level: 2, mortgaged: false };
    expect(() => parseSave(JSON.stringify(owned))).toThrow();
    const invalidOwner = structuredClone(city);
    invalidOwner.properties[1] = { ownerId: 'ghost', level: 2, mortgaged: false };
    delete invalidOwner.availablePropertyLevels?.[1];
    expect(() => parseSave(JSON.stringify(invalidOwner))).toThrow();
    const invalidLevel = structuredClone(city);
    invalidLevel.properties[1] = { ownerId: 'p1', level: 5, mortgaged: false };
    delete invalidLevel.availablePropertyLevels?.[1];
    expect(() => parseSave(JSON.stringify(invalidLevel))).toThrow();
    const legacy = createGame(config('lake'));
    delete legacy.availablePropertyLevels;
    legacy.players[0].cash = 64_321;
    const loaded = parseSave(JSON.stringify(legacy));
    expect(loaded.availablePropertyLevels).toEqual({});
    expect(loaded.players[0].cash).toBe(64_321);
  });

  it('rebuilds an authentic saved land prompt at the current whole-building price', () => {
    const node = MAPS.grandCity.nodes[1];
    const landed = arriveAt(createGame(config('grandCity')), node);
    const expected = getLandPurchaseDescription(landed, node.id);
    expect(landed.pending?.body).toBe(expected);
    expect(expected).toContain('整栋认购');
    expect(expected).toContain('含现有 2 层');
    expect(expected).toContain(`基础地价 ${node.price}`);
    expect(expected).toContain(`已有楼层建造成本 ${getBuildCost(node) * 2}`);
    expect(expected).toContain(`总价 ${getLandPurchasePrice(landed, node.id)} PM`);
    expect(expected).toContain('购买后保留楼层');
    landed.pending!.body = '旧价：1 PM';
    landed.pending!.choices[0].label = '购买 · 1 PM';
    const resumed = parseSave(JSON.stringify(landed));
    const price = getLandPurchasePrice(resumed, node.id);
    expect(resumed.pending?.body).toBe(expected);
    expect(resumed.pending?.choices[0].label).toContain(`${price} PM`);
    const bought = act(resumed, { type: 'choose', choiceId: 'buy' });
    expect(bought.players[0].cash).toBe(150_000 - price);
    expect(bought.properties[node.id].level).toBe(2);
    const ordinary = createGame(config('lake'));
    const ordinaryLand = MAPS.lake.nodes.find(entry => entry.kind === 'land')!;
    const utility = MAPS.lake.nodes.find(entry => entry.kind === 'power')!;
    expect(getLandPurchaseDescription(ordinary, ordinaryLand.id)).toBe(`购买 ${ordinaryLand.name} 需要 ${ordinaryLand.price} PM。`);
    expect(getLandPurchaseDescription(ordinary, utility.id)).toBe(`购买 ${utility.name} 需要 ${utility.price} PM。`);
    const bankEmpty = structuredClone(resumed);
    bankEmpty.availablePropertyLevels![node.id] = 0;
    expect(getLandPurchaseDescription(bankEmpty, node.id)).toBe(`购买 ${node.name} 需要 ${node.price} PM。`);
  });

  it('awards Grand City normal travel at 48 steps, including a double D100 roll', () => {
    const boundary = createGame(config('grandCity'));
    boundary.players[0].travelProgress = 47;
    const oneStep = arriveAt(boundary, MAPS.grandCity.nodes[1]);
    expect(oneStep.movement?.segments?.[0].path).toEqual([0, 1]);
    expect(oneStep.players[0].travelProgress).toBe(0);
    expect(oneStep.players[0].cash).toBe(160_000);
    expect(oneStep.pending?.kind).toBe('land');

    const state = createGame(config('grandCity'));
    state.weatherId = 'clear';
    state.encounters = [];
    state.players[0].travelProgress = 47;
    state.selectedDie = 100;
    state.twinRoll = true;
    const beforeCash = state.players[0].cash;
    const rolled = act(state, { type: 'roll' });
    const normalSteps = (rolled.movement?.segments ?? []).filter(segment => segment.kind === 'normal')
      .reduce((sum, segment) => sum + segment.path.length - 1, 0);
    const milestones = Math.floor((47 + normalSteps) / 48);
    const startCrossings = (rolled.movement?.segments ?? []).filter(segment => segment.kind === 'normal')
      .flatMap(segment => segment.path.slice(1)).filter(nodeId => nodeId === 0).length;
    expect(rolled.movement?.rolls).toHaveLength(2);
    expect(milestones).toBeGreaterThanOrEqual(2);
    expect(rolled.players[0].travelProgress).toBe((47 + normalSteps) % 48);
    expect(rolled.players[0].cash).toBe(beforeCash + milestones * 10_000 + startCrossings * 1_200);
    expect(rolled.notices?.filter(entry => entry.kind === 'milestone')).toHaveLength(1);
    expect(rolled.notices?.at(-1)?.amount).toBe(milestones * 10_000);
    expect(rolled.movement?.effects?.some(entry => entry.kind === 'cash'
      && entry.label.includes((milestones * 10_000).toLocaleString('zh-CN')))).toBe(true);
    expect(getJourneyRewardSteps('lake')).toBe(72);
    expect(getJourneyRewardSteps('forest')).toBe(24);
  });

  it('lets an AI assess the whole-building quote instead of buying above its reserve', () => {
    const state = createGame(config('grandCity'));
    const node = MAPS.grandCity.nodes.find(entry => entry.kind === 'land' && entry.prefabLevel === 4)!;
    state.currentPlayerIndex = 1;
    state.players[1].cash = getLandPurchasePrice(state, node.id) + 100;
    state.players[1].position = node.id;
    state.phase = 'decision';
    state.pending = { kind: 'land', title: node.name, body: '', choices: [
      { id: 'buy', label: '购买' }, { id: 'leave', label: '离开' },
    ], data: { nodeId: node.id } };
    const after = runAI(state);
    expect(after).not.toBe(state);
    expect(after.properties[node.id]).toBeUndefined();
    expect(after.players[1].cash).toBe(state.players[1].cash);
  });
});
