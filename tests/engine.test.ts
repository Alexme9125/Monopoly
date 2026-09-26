import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { act, canUseItem, createGame, getNetWorth, getRent, getTileRentPreview, marketStep, quoteStockTrade, runAI, weatherWeights } from '../src/game/engine';
import { getMovementTimeline } from '../src/game/presentation';
import { drawSlotItem, SLOT_POOL_TOTAL, SLOT_PRIZE_POOL, SLOTS_STAKE } from '../src/game/casino';
import { PLAYER_COLORS } from '../src/game/colors';
import { parseSave } from '../src/game/storage';
import { EVENTS, ITEMS, JOURNEY_REWARD_CASH, JOURNEY_REWARD_STEPS, WEATHERS } from '../src/game/data';
import { MAPS } from '../src/game/maps';
import type { CasinoResult, GameConfig, GameState } from '../src/game/types';

const config: GameConfig = {
  mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 1978,
  players: [
    { name: '甲', color: '#ff0000', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '乙', color: '#0000ff', shape: 'diamond', ai: true, personality: 'cautious' },
  ],
};
const game = () => createGame(config);
const land = MAPS.lake.nodes.find(n => n.kind === 'land')!;
const exchange = MAPS.lake.nodes.find(n => n.kind === 'exchange')!;
const oneStepRng = Math.imul(35, 2654435761) >>> 0;

function casinoState(seed: number, cash = 100_000): GameState {
  const state = game();
  state.rng = Math.imul(seed, 2654435761) >>> 0;
  state.players[0].cash = cash;
  state.phase = 'decision';
  state.pending = { kind: 'casino', title: '星港赌场', body: '', choices: [
    { id: 'slots', label: '老虎机' }, { id: 'red', label: '押红' }, { id: 'black', label: '押黑' }, { id: 'leave', label: '离开' },
  ] };
  return state;
}

function casinoOutcome(choiceId: 'slots' | 'red' | 'black', outcome: CasinoResult['outcome'], prepare?: (state: GameState) => void) {
  for (let seed = 1; seed <= 200; seed++) {
    const before = casinoState(seed);
    prepare?.(before);
    const after = act(before, { type: 'choose', choiceId });
    if (after.pending?.casinoResult?.outcome === outcome) return { before, after, result: after.pending.casinoResult };
  }
  throw new Error(`Could not sample ${choiceId}/${outcome}`);
}

describe('pure deterministic engine', () => {
  it('creates a serializable, reproducible 2-player game', () => {
    const a = game(); const b = game();
    expect(a).toEqual(b);
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a.players[0].cash).toBe(100_000);
    expect(a.turnEncounters).toEqual([]);
    expect(a.players[0].inventory.find(s => s.itemId === 'snack')?.quantity).toBe(1);
    expect(a.players[0].inventory.filter(s => s.itemId === 'snack')).toHaveLength(2);
    expect(act(a, { type: 'stockTrade', stockId: a.stocks[0].id, quantity: 1 })).toBe(a);
    expect(a.encounters.length).toBeGreaterThanOrEqual(5);
    expect(a.encounters.length).toBeLessThanOrEqual(8);
    expect(a.encounters.every(id => MAPS.lake.nodes[id].kind === 'empty')).toBe(true);
    for (const mapId of ['coast', 'valley'] as const) {
      const onMap = createGame({ ...config, mapId });
      expect(onMap.encounters.length, mapId).toBeGreaterThanOrEqual(5);
      expect(onMap.encounters.every(id => MAPS[mapId].nodes[id].kind === 'empty'), mapId).toBe(true);
    }
  });

  it('publishes an encounter on landing and retains its actual choice until the turn ends', () => {
    const state = game();
    state.weatherId = 'clear'; state.encounters = []; state.rng = oneStepRng;
    state.players[0].position = 44; state.players[0].previousPosition = 43;
    const landed = act(state, { type: 'roll' });
    expect(landed.pending?.kind).toBe('event');
    expect(landed.turnEncounters).toHaveLength(1);
    expect(landed.turnEncounters?.[0]).toMatchObject({ playerId: 'p1', day: 1, nodeId: 45,
      eventId: landed.pending?.data?.eventId, title: landed.pending?.title, story: landed.pending?.body });
    expect(landed.turnEncounters?.[0].choices).toEqual(landed.pending?.choices);
    expect(landed.turnEncounters?.[0].selectedChoiceId).toBeUndefined();
    expect(act(landed, { type: 'choose', choiceId: 'invalid' })).toBe(landed);
    const disabled = structuredClone(landed);
    disabled.pending!.choices[0].disabled = true;
    expect(act(disabled, { type: 'choose', choiceId: disabled.pending!.choices[0].id })).toBe(disabled);
    const choice = landed.pending!.choices.find(entry => !entry.disabled)!;
    const settled = act(landed, { type: 'choose', choiceId: choice.id });
    expect(settled.turnEncounters).toHaveLength(1);
    expect(settled.turnEncounters?.[0]).toMatchObject({ id: landed.turnEncounters?.[0].id, selectedChoiceId: choice.id });
    expect(settled.turnEncounters?.[0].result).toBe(settled.notices?.at(-1)?.body);
    expect(settled.turnEncounters?.[0].result).toContain(choice.label);
    expect(parseSave(JSON.stringify(settled)).turnEncounters).toEqual(settled.turnEncounters);
    const next = act(settled, { type: 'endTurn' });
    expect(next.turnEncounters).toEqual([]);
  });

  it('keeps both glitch landings public and records a legacy event prompt when chosen', () => {
    const state = game();
    state.weatherId = 'glitch'; state.rng = oneStepRng;
    state.players[0].position = 59; state.players[0].previousPosition = 58;
    state.encounters = MAPS.lake.nodes.filter(node => node.kind === 'empty').map(node => node.id);
    const first = act(state, { type: 'roll' });
    expect(first.turnEncounters?.[0]).toMatchObject({ nodeId: 62, eventId: first.pending?.data?.eventId });
    const firstChoice = first.pending!.choices.find(entry => !entry.disabled)!;
    const second = act(first, { type: 'choose', choiceId: firstChoice.id });
    expect(second.turnEncounters?.map(entry => entry.nodeId)).toEqual([62, 14]);
    expect(second.turnEncounters?.[0].selectedChoiceId).toBe(firstChoice.id);
    expect(second.turnEncounters?.[1]).toMatchObject({ eventId: second.pending?.data?.eventId });
    expect(second.turnEncounters?.[1].selectedChoiceId).toBeUndefined();
    expect(act(second, { type: 'choose', choiceId: 'invalid' })).toBe(second);
    const choice = second.pending!.choices.find(entry => !entry.disabled)!;
    const settled = act(second, { type: 'choose', choiceId: choice.id });
    expect(settled.turnEncounters?.map(entry => entry.selectedChoiceId)).toEqual([firstChoice.id, choice.id]);
    expect(settled.turnEncounters?.[0].result).toBe(second.turnEncounters?.[0].result);
    expect(act(settled, { type: 'endTurn' }).turnEncounters).toEqual([]);

    const legacy = game();
    const event = EVENTS.find(entry => entry.id === 'auction')!;
    const noChange = event.choices.find(entry => entry.id === 'auction_skip')!;
    legacy.players[0].position = 45;
    legacy.phase = 'decision';
    legacy.pending = { kind: 'event', title: event.title, body: event.story,
      choices: [{ id: noChange.id, label: noChange.label, description: noChange.description }], data: { eventId: event.id } };
    delete legacy.turnEncounters;
    const resumed = parseSave(JSON.stringify(legacy));
    expect(resumed.turnEncounters).toHaveLength(1);
    expect(resumed.turnEncounters?.[0]).toMatchObject({ eventId: event.id });
    expect(resumed.turnEncounters?.[0].selectedChoiceId).toBeUndefined();
    expect(resumed.pending?.data?.turnEncounterId).toBe(resumed.turnEncounters?.[0].id);
    const chosen = act(resumed, { type: 'choose', choiceId: noChange.id });
    expect(chosen.turnEncounters?.[0]).toMatchObject({ id: resumed.turnEncounters?.[0].id, eventId: event.id, selectedChoiceId: noChange.id });
    expect(chosen.turnEncounters?.[0].result).toContain('没有额外数值变化');

    const unaffordable = game();
    const costly = EVENTS.find(entry => entry.id === 'customs')!;
    unaffordable.players[0].position = 45;
    unaffordable.players[0].cash = 0;
    unaffordable.phase = 'decision';
    unaffordable.pending = { kind: 'event', title: costly.title, body: costly.story, data: { eventId: costly.id }, choices: [
      { id: costly.choices[0].id, label: costly.choices[0].label, disabled: true },
      { id: 'skip_unavailable', label: '资源不足，离开' },
    ] };
    const skipped = act(unaffordable, { type: 'choose', choiceId: 'skip_unavailable' });
    expect(skipped.turnEncounters?.[0]).toMatchObject({ selectedChoiceId: 'skip_unavailable' });
    expect(skipped.turnEncounters?.[0].result).toContain('资源不足');
    expect(parseSave(JSON.stringify(skipped)).turnEncounters).toEqual(skipped.turnEncounters);
  });

  it('rejects malformed turn encounter snapshots and serializes the same public PVP state', () => {
    const pvp = createGame({ ...config, mode: 'pvp', players: config.players.map(player => ({ ...player, ai: false })) });
    pvp.weatherId = 'clear'; pvp.encounters = []; pvp.rng = oneStepRng;
    pvp.players[0].position = 44; pvp.players[0].previousPosition = 43;
    const landed = act(pvp, { type: 'roll' });
    expect(JSON.parse(JSON.stringify(landed)).turnEncounters).toEqual(landed.turnEncounters);
    expect(parseSave(JSON.stringify(landed)).turnEncounters).toEqual(landed.turnEncounters);
    for (const patch of [{ day: 99 }, { playerId: 'p2' }, { nodeId: -1 }, { eventId: 'unknown' },
      { tone: 'info' }, { choices: [{}] }, { selectedChoiceId: 'invalid', result: '错误' }, { result: '错误' }]) {
      const invalid = structuredClone(landed);
      Object.assign(invalid.turnEncounters![0], patch);
      expect(() => parseSave(JSON.stringify(invalid)), JSON.stringify(patch)).toThrow('偶遇');
    }
  });

  it('moves on map edges and permits the hundred-sided die', () => {
    let state = game();
    const old = state;
    const uid = state.players[0].inventory.find(s => s.itemId === 'dice8')!.uid;
    state = act(state, { type: 'useItem', itemUid: uid });
    expect(old.players[0].inventory.some(s => s.uid === uid)).toBe(true);
    expect(state.selectedDie).toBe(8);
    state = act(state, { type: 'roll' });
    expect(state.movement?.path[0]).toBe(old.players[0].position);
    const path = state.movement!.path;
    for (let i = 1; i < path.length; i++) expect(MAPS.lake.nodes[path[i - 1]].neighbors).toContain(path[i]);
    const forced = game();
    forced.players[0].inventory.push({ uid: 'hundred', itemId: 'dice100', quantity: 1, wet: false });
    const used = act(forced, { type: 'useItem', itemUid: 'hundred' });
    expect(used.selectedDie).toBe(100);
    const rolled = act(used, { type: 'roll' });
    expect(rolled.movement!.roll).toBeGreaterThanOrEqual(1);
    expect(rolled.movement!.roll).toBeLessThanOrEqual(100);
  });

  it('uses a dry controller only with a normal D6 and clears its chosen raw roll after action', () => {
    const withController = () => {
      const state = game(); state.weatherId = 'clear'; state.encounters = [];
      state.players[0].inventory.push({ uid: 'control', itemId: 'controller', quantity: 1, wet: false });
      return state;
    };
    for (const diceValue of [undefined, 0, 7, 1.5, Number.POSITIVE_INFINITY]) {
      const invalid = withController();
      expect(act(invalid, { type: 'useItem', itemUid: 'control', diceValue }), String(diceValue)).toBe(invalid);
    }
    const wet = withController(); wet.players[0].inventory.find(slot => slot.uid === 'control')!.wet = true;
    expect(canUseItem(wet, 'p1', 'control')).toBe(false);
    expect(act(wet, { type: 'useItem', itemUid: 'control', diceValue: 6 })).toBe(wet);

    const selected = act(withController(), { type: 'useItem', itemUid: 'control', diceValue: 5 });
    expect(selected.controlledRoll).toBe(5);
    expect(selected.selectedDie).toBe(6);
    expect(selected.players[0].inventory.some(slot => slot.uid === 'control')).toBe(false);
    const otherDie = selected.players[0].inventory.find(slot => slot.itemId === 'dice8')!;
    expect(canUseItem(selected, 'p1', otherDie.uid)).toBe(false);
    expect(act(selected, { type: 'useItem', itemUid: otherDie.uid })).toBe(selected);
    const rolled = act(selected, { type: 'roll' });
    expect(rolled.movement).toMatchObject({ roll: 5, controlled: true, dice: true, modifier: 0 });
    expect(rolled.movement?.segments?.[0].path).toHaveLength(6);
    expect(rolled.players[0].stamina).toBe(96);
    expect(rolled.controlledRoll).toBeNull();
    expect(rolled.selectedDie).toBe(6);

    const multiFirst = withController();
    const usedMulti = act(multiFirst, { type: 'useItem', itemUid: multiFirst.players[0].inventory.find(slot => slot.itemId === 'dice8')!.uid });
    expect(usedMulti.selectedDie).toBe(8);
    expect(canUseItem(usedMulti, 'p1', 'control')).toBe(false);
    expect(act(usedMulti, { type: 'useItem', itemUid: 'control', diceValue: 3 })).toBe(usedMulti);
    const rested = act(selected, { type: 'rest' });
    expect(rested.controlledRoll).toBeNull();
    expect(act(selected, { type: 'endTurn' }).controlledRoll).toBeNull();
  });

  it('applies weather to a controlled zero-step roll and preserves the 72-step journey reward', () => {
    const zero = game(); zero.weatherId = 'scorch'; zero.players[0].inventory.push({ uid: 'zero-control', itemId: 'controller', quantity: 1, wet: false });
    const chosenZero = act(zero, { type: 'useItem', itemUid: 'zero-control', diceValue: 1 });
    const stopped = act(chosenZero, { type: 'roll' });
    expect(stopped.movement).toMatchObject({ roll: 1, modifier: -4, controlled: true });
    expect(stopped.movement?.segments?.[0].path).toHaveLength(1);
    expect(stopped.players[0].stamina).toBe(98);
    expect(stopped.controlledRoll).toBeNull();

    const journey = game(); journey.weatherId = 'clear'; journey.players[0].travelProgress = 71;
    journey.players[0].inventory.push({ uid: 'journey-control', itemId: 'controller', quantity: 1, wet: false });
    const chosen = act(journey, { type: 'useItem', itemUid: 'journey-control', diceValue: 1 });
    const travelled = act(chosen, { type: 'roll' });
    expect(travelled.players[0].travelProgress).toBe(0);
    expect(travelled.notices?.at(-1)).toMatchObject({ kind: 'milestone', amount: JOURNEY_REWARD_CASH });
    expect(travelled.movement?.controlled).toBe(true);
    expect(travelled.players[0].stamina).toBe(98);
  });

  it('charges only the die-based 2–4 stamina cost, including zero-step and weather movement', () => {
    const rollWith = (face: number, target: number, weatherId = 'clear') => {
      for (let seed = 1; seed < 5000; seed++) {
        const rng = Math.imul(seed, 2654435761) >>> 0;
        const nextRng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
        if (1 + Math.floor(nextRng / 0x1_0000_0000 * face) !== target) continue;
        const before = game();
        before.rng = rng;
        before.selectedDie = face;
        before.weatherId = weatherId;
        before.encounters = [];
        const after = act(before, { type: 'roll' });
        expect(after.movement?.roll).toBe(target);
        return after;
      }
      throw new Error(`Could not sample D${face} roll ${target}`);
    };

    for (const [roll, cost] of [[1, 2], [2, 2], [3, 3], [4, 3], [5, 4], [6, 4]]) {
      const after = rollWith(6, roll);
      expect(after.players[0].stamina).toBe(100 - cost);
      expect(after.movement?.effects).toContainEqual({ kind: 'stamina', label: `掷骰 · 基础体力 −${cost}`, tone: 'bad' });
    }
    for (const [roll, cost] of [[1, 2], [34, 2], [35, 3], [67, 3], [68, 4], [100, 4]]) {
      const after = rollWith(100, roll);
      expect(after.players[0].stamina).toBe(100 - cost);
    }

    const zero = rollWith(6, 1, 'scorch');
    expect(zero.movement?.segments?.[0].path).toHaveLength(1);
    expect(zero.players[0].stamina).toBe(98);
    const slip = rollWith(6, 6, 'snow');
    expect(slip.movement?.segments?.map(segment => segment.kind)).toEqual(['normal', 'weather']);
    expect(slip.players[0].stamina).toBeGreaterThanOrEqual(95); // Snow may cost one extra on an unsheltered landing.
    expect(slip.players[0].stamina).toBeLessThanOrEqual(96);
    const scorch = rollWith(6, 6, 'scorch');
    expect(scorch.movement?.modifier).toBe(-4);
    expect(scorch.players[0].stamina).toBe(90); // Four base plus two traveled steps × three weather damage.
  });

  it('continues through bends across turns and chooses only real non-return exits at T and cross roads', () => {
    const valley = createGame({ ...config, mapId: 'valley' });
    const bend = MAPS.valley.nodes[9];
    expect(bend.neighbors).toEqual([8, 10]);
    expect(MAPS.valley.nodes[10].kind).toBe('empty');
    valley.encounters = [];
    valley.weatherId = 'clear';
    valley.rng = oneStepRng;
    valley.players[0].position = bend.id;
    valley.players[0].previousPosition = 8;
    const first = act(valley, { type: 'roll' });
    expect(first.movement?.roll).toBe(1);
    expect(first.movement?.segments?.[0].path).toEqual([9, 10]);
    expect(first.players[0].previousPosition).toBe(9);
    const otherTurn = act(first, { type: 'endTurn' });
    const nextDay = act(otherTurn, { type: 'endTurn' });
    expect(nextDay.currentPlayerIndex).toBe(0);
    nextDay.weatherId = 'clear'; nextDay.rng = oneStepRng; nextDay.encounters = [];
    const second = act(nextDay, { type: 'roll' });
    expect(second.movement?.segments?.[0].path).toEqual([10, 11]);

    const checks = [
      { nodeId: 6, incoming: 80, degree: 3 }, // Enter the T from its branch.
      { nodeId: 6, incoming: 5, degree: 3 }, // Enter the T along the horizontal road.
      { nodeId: 60, incoming: 59, degree: 4 },
    ];
    for (const { nodeId, incoming, degree } of checks) {
      const junction = MAPS.lake.nodes[nodeId];
      expect(junction.neighbors).toHaveLength(degree);
      const exits = junction.neighbors.filter(id => id !== incoming);
      const seen = new Set<number>();
      for (let seed = 1; seed <= 500 && seen.size < exits.length; seed++) {
        const state = game(); state.weatherId = 'clear'; state.encounters = [];
        state.rng = Math.imul(seed, 2654435761) >>> 0;
        state.players[0].position = nodeId; state.players[0].previousPosition = incoming;
        const rolled = act(state, { type: 'roll' });
        const path = rolled.movement!.segments![0].path;
        expect(exits).toContain(path[1]);
        for (let step = 1; step < path.length; step++) expect(MAPS.lake.nodes[path[step - 1]].neighbors).toContain(path[step]);
        seen.add(path[1]);
      }
      expect([...seen].sort((a, b) => a - b)).toEqual([...exits].sort((a, b) => a - b));
    }
  });

  it('recovers its forward route after weather retreats, including zero-step and repeated retreats', () => {
    const gale = game(); gale.weatherId = 'gale'; gale.rng = oneStepRng;
    gale.players[0].position = 1; gale.players[0].previousPosition = 0;
    const retreated = act(gale, { type: 'roll' });
    expect(retreated.movement?.segments?.map(segment => segment.path)).toEqual([[1, 2], [2, 1]]);
    expect(retreated.players[0]).toMatchObject({ position: 1, previousPosition: 2, routeNextPosition: 2 });
    const left = act(retreated, { type: 'choose', choiceId: 'leave' });
    const otherTurn = act(left, { type: 'endTurn' });
    const nextDay = act(otherTurn, { type: 'endTurn' });
    nextDay.weatherId = 'clear'; nextDay.rng = oneStepRng;
    const resumed = act(nextDay, { type: 'roll' });
    expect(resumed.movement?.segments?.[0].path).toEqual([1, 2]);
    expect(resumed.players[0].routeNextPosition).toBeNull();

    const stationary = game(); stationary.weatherId = 'scorch'; stationary.rng = oneStepRng;
    stationary.players[0].position = 1; stationary.players[0].previousPosition = 2; stationary.players[0].routeNextPosition = 2;
    const zero = act(stationary, { type: 'roll' });
    expect(zero.movement?.segments?.[0].path).toEqual([1]);
    expect(zero.players[0].routeNextPosition).toBe(2);

    let sand = game(); sand.weatherId = 'sandstorm'; sand.rng = oneStepRng;
    sand.players[0].position = 1; sand.players[0].previousPosition = 0;
    for (let turn = 0; turn < 2; turn++) {
      sand.phase = 'ready'; sand.pending = null; sand.rng = oneStepRng;
      sand = act(sand, { type: 'roll' });
      const lastSegment = sand.movement!.segments!.at(-1)!;
      expect(lastSegment.kind).toBe('weather');
      expect(lastSegment.path).toHaveLength(5);
      expect(sand.players[0].routeNextPosition).toBe(lastSegment.path.at(-2));
      expect(MAPS.lake.nodes[sand.players[0].position].neighbors).toContain(sand.players[0].routeNextPosition);
    }
    const direction = sand.players[0].routeNextPosition;
    sand.phase = 'ready'; sand.pending = null; sand.weatherId = 'clear'; sand.rng = oneStepRng;
    const backForward = act(sand, { type: 'roll' });
    expect(backForward.movement?.segments?.[0].path[1]).toBe(direction);
  });

  it('initializes routing after stations, teleport and confinement while keeping station cancellation free', () => {
    const stations = MAPS.lake.nodes.filter(node => node.kind === 'station');
    const source = stations[0], destination = stations[1];
    const station = game();
    station.players[0].position = source.id;
    station.players[0].previousPosition = source.neighbors[0];
    station.players[0].routeNextPosition = source.neighbors[1];
    station.phase = 'decision';
    station.pending = { kind: 'station', title: source.name, body: '', data: { nodeId: source.id }, choices: [
      { id: `station:${destination.id}`, label: destination.name }, { id: 'leave', label: '离开' },
    ] };
    const cancelled = act(station, { type: 'choose', choiceId: 'leave' });
    expect(cancelled.players[0].cash).toBe(station.players[0].cash);
    expect(cancelled.players[0].position).toBe(source.id);
    const invalid = structuredClone(station);
    invalid.pending!.choices.push({ id: 'station:1', label: '伪造站点' });
    expect(act(invalid, { type: 'choose', choiceId: 'station:1' })).toBe(invalid);
    invalid.pending!.data!.nodeId = destination.id;
    expect(act(invalid, { type: 'choose', choiceId: `station:${destination.id}` })).toBe(invalid);

    const arrived = act(station, { type: 'choose', choiceId: `station:${destination.id}` });
    expect(arrived.players[0].cash).toBe(station.players[0].cash - 100);
    expect(arrived.players[0]).toMatchObject({ position: destination.id, previousPosition: null, routeNextPosition: null });
    const next = structuredClone(arrived); next.phase = 'ready'; next.pending = null; next.weatherId = 'clear'; next.rng = oneStepRng;
    expect(destination.neighbors).toContain(act(next, { type: 'roll' }).movement?.segments?.[0].path[1]);

    const teleported = game(); teleported.players[0].position = 1; teleported.players[0].previousPosition = 0;
    teleported.players[0].routeNextPosition = 2;
    teleported.players[0].inventory.push({ uid: 'ticket', itemId: 'teleport', quantity: 1, wet: false });
    const transported = act(teleported, { type: 'useItem', itemUid: 'ticket', nodeId: destination.id });
    expect(transported.players[0]).toMatchObject({ position: destination.id, previousPosition: null, routeNextPosition: null });

    const prisonEvent = EVENTS.find(entry => entry.choices.some(choice => choice.confinement === 'prison'))!;
    const prisonChoice = prisonEvent.choices.find(choice => choice.confinement === 'prison')!;
    const detained = game(); detained.players[0].position = 1; detained.players[0].previousPosition = 0;
    detained.players[0].routeNextPosition = 2; detained.phase = 'decision';
    detained.pending = { kind: 'event', title: prisonEvent.title, body: prisonEvent.story,
      data: { eventId: prisonEvent.id }, choices: [{ id: prisonChoice.id, label: prisonChoice.label }] };
    const confined = act(detained, { type: 'choose', choiceId: prisonChoice.id });
    expect(confined.players[0].confinement?.kind).toBe('prison');
    expect(confined.players[0].previousPosition).toBeNull();
    expect(confined.players[0].routeNextPosition).toBeNull();
  });

  it('migrates old routing saves and preserves a valid weather recovery target', () => {
    const old = game();
    old.players[0].position = 1;
    old.players[0].previousPosition = MAPS.lake.nodes.find(node => node.id !== 1 && !MAPS.lake.nodes[1].neighbors.includes(node.id))!.id;
    for (const player of old.players) delete player.routeNextPosition;
    const migrated = parseSave(JSON.stringify(old));
    expect(migrated.players[0].previousPosition).toBeNull();
    expect(migrated.players.every(player => player.routeNextPosition === null)).toBe(true);
    migrated.weatherId = 'clear'; migrated.rng = oneStepRng;
    expect(MAPS.lake.nodes[1].neighbors).toContain(act(migrated, { type: 'roll' }).movement?.segments?.[0].path[1]);

    const retreat = game(); retreat.players[0].position = 1; retreat.players[0].previousPosition = 2; retreat.players[0].routeNextPosition = 2;
    const saved = parseSave(JSON.stringify(retreat));
    expect(saved.players[0].routeNextPosition).toBe(2);
    saved.weatherId = 'clear'; saved.rng = oneStepRng;
    expect(act(saved, { type: 'roll' }).movement?.segments?.[0].path[1]).toBe(2);
    for (const invalid of [1, 999, -1, 1.5]) {
      const corrupt = structuredClone(retreat);
      corrupt.players[0].routeNextPosition = invalid;
      expect(() => parseSave(JSON.stringify(corrupt)), String(invalid)).toThrow('玩家');
    }
  });

  it('awards one 72-step milestone before landing and carries the remaining normal steps', () => {
    const state = game(); state.weatherId = 'clear'; state.selectedDie = 1;
    state.players[0].previousPosition = MAPS.lake.nodes[0].neighbors.find(id => id !== 1)!;
    state.players[0].travelProgress = JOURNEY_REWARD_STEPS - 1;
    const rolled = act(state, { type: 'roll' });
    expect(rolled.movement?.segments?.[0].path).toEqual([0, 1]);
    expect(rolled.players[0].travelProgress).toBe(0);
    expect(rolled.players[0].cash - state.players[0].cash).toBe(JOURNEY_REWARD_CASH);
    expect(rolled.notices?.at(-1)).toMatchObject({ kind: 'milestone', title: '行进奖励', amount: JOURNEY_REWARD_CASH, playerId: 'p1', nodeId: 1 });
    expect(rolled.notices?.at(-1)?.body).toContain('0/72 格');
    expect(rolled.movement?.effects).toContainEqual({ kind: 'cash', label: '行进奖励 +10,000 PM', tone: 'good' });
    expect(rolled.pending?.kind).toBe('land');
    const left = act(rolled, { type: 'choose', choiceId: 'leave' });
    expect(left.notices).toHaveLength(1);
    expect(left.players[0].cash).toBe(rolled.players[0].cash);

    let withRemainder: GameState | undefined;
    for (let seed = 1; seed < 200 && !withRemainder; seed++) {
      const candidate = game(); candidate.weatherId = 'clear'; candidate.rng = Math.imul(seed, 2654435761) >>> 0; candidate.players[0].travelProgress = 70;
      candidate.players[0].previousPosition = state.players[0].previousPosition;
      const next = act(candidate, { type: 'roll' });
      if (next.movement?.roll === 3) withRemainder = next;
    }
    expect(withRemainder).toBeDefined();
    expect(withRemainder!.players[0].travelProgress).toBe(1);
    expect(withRemainder!.notices?.at(-1)?.amount).toBe(JOURNEY_REWARD_CASH);
  });

  it('credits the milestone before rent can create debt', () => {
    const state = game(); state.weatherId = 'clear'; state.selectedDie = 1;
    state.players[0].previousPosition = MAPS.lake.nodes[0].neighbors.find(id => id !== 1)!;
    state.players[0].travelProgress = 71;
    state.players[0].cash = 0;
    state.players[0].inventory = state.players[0].inventory.filter(slot => slot.itemId !== 'rent' && slot.itemId !== 'shield');
    state.properties[1] = { ownerId: 'p2', level: 0, mortgaged: false };
    const rent = getRent(state, 1);
    const rolled = act(state, { type: 'roll' });
    expect(rent).toBeGreaterThan(0);
    expect(rolled.players[0].cash).toBe(JOURNEY_REWARD_CASH - rent);
    expect(rolled.players[1].cash).toBe(state.players[1].cash + rent);
    expect(rolled.pending?.kind).not.toBe('debt');
    expect(rolled.notices?.map(entry => entry.kind)).toEqual(['milestone', 'rent']);
  });

  it('combines two hundred-sided milestones into one notice without counting weather movement', () => {
    let hundred: GameState | undefined;
    for (let seed = 1; seed < 200 && !hundred; seed++) {
      const candidate = game(); candidate.weatherId = 'clear'; candidate.rng = Math.imul(seed, 2654435761) >>> 0; candidate.selectedDie = 100;
      candidate.players[0].travelProgress = 71;
      const next = act(candidate, { type: 'roll' });
      if (next.movement!.roll >= 73) hundred = next;
    }
    expect(hundred).toBeDefined();
    const normalSteps = hundred!.movement!.segments![0].path.length - 1;
    expect(normalSteps).toBe(hundred!.movement!.roll);
    expect(hundred!.players[0].travelProgress).toBe((71 + normalSteps) % JOURNEY_REWARD_STEPS);
    expect(hundred!.notices).toHaveLength(1);
    expect(hundred!.notices?.[0]).toMatchObject({ kind: 'milestone', amount: 2 * JOURNEY_REWARD_CASH });
    expect(hundred!.notices?.[0].body).toContain('2 次 72 格');

    const snow = game(); snow.weatherId = 'snow'; snow.selectedDie = 1; snow.players[0].travelProgress = 70;
    const slid = act(snow, { type: 'roll' });
    expect(slid.movement?.segments?.map(segment => segment.kind)).toEqual(['normal', 'weather']);
    expect(slid.movement?.path.length).toBe(3);
    expect(slid.players[0].travelProgress).toBe(71);
    expect(slid.notices).toHaveLength(0);

    const glitch = game(); glitch.weatherId = 'glitch'; glitch.selectedDie = 1; glitch.players[0].travelProgress = 70;
    let glitched = act(glitch, { type: 'roll' });
    if (glitched.phase === 'decision') glitched = act(glitched, { type: 'choose', choiceId: glitched.pending!.choices.find(choice => choice.id === 'leave')?.id ?? glitched.pending!.choices.find(choice => !choice.disabled)!.id });
    expect(glitched.players[0].travelProgress).toBe(71);
    expect(glitched.notices?.filter(entry => entry.kind === 'milestone')).toHaveLength(0);
  });

  it('does not earn distance from zero-step rolls, rest, stations, teleport or confinement transfers', () => {
    const zero = game(); zero.weatherId = 'scorch'; zero.selectedDie = 1; zero.players[0].travelProgress = 71;
    const stationary = act(zero, { type: 'roll' });
    expect(stationary.movement?.segments?.[0].path).toHaveLength(1);
    expect(stationary.players[0].travelProgress).toBe(71);
    expect(stationary.notices).toHaveLength(0);
    const restState = game(); restState.players[0].travelProgress = 71;
    expect(act(restState, { type: 'rest' }).players[0].travelProgress).toBe(71);

    const stations = MAPS.lake.nodes.filter(node => node.kind === 'station');
    const stationState = game(); stationState.players[0].travelProgress = 71; stationState.players[0].position = stations[0].id;
    stationState.phase = 'decision'; stationState.pending = { kind: 'station', title: '', body: '', data: { nodeId: stations[0].id }, choices: [{ id: `station:${stations[1].id}`, label: '' }] };
    expect(act(stationState, { type: 'choose', choiceId: `station:${stations[1].id}` }).players[0].travelProgress).toBe(71);
    const teleportState = game(); teleportState.players[0].travelProgress = 71;
    teleportState.players[0].inventory.push({ uid: 'transfer-ticket', itemId: 'teleport', quantity: 1, wet: false });
    expect(act(teleportState, { type: 'useItem', itemUid: 'transfer-ticket', nodeId: stations[0].id }).players[0].travelProgress).toBe(71);

    const event = EVENTS.find(entry => entry.choices.some(choice => choice.confinement === 'prison'))!;
    const choice = event.choices.find(entry => entry.confinement === 'prison')!;
    const confined = game(); confined.players[0].travelProgress = 71; confined.phase = 'decision';
    confined.pending = { kind: 'event', title: event.title, body: event.story, data: { eventId: event.id }, choices: [{ id: choice.id, label: choice.label }] };
    expect(act(confined, { type: 'choose', choiceId: choice.id }).players[0].travelProgress).toBe(71);
  });

  it('migrates old distance saves to zero, rejects invalid residues, and tracks players independently', () => {
    const old = game();
    for (const player of old.players) delete (player as unknown as { travelProgress?: number }).travelProgress;
    const migrated = parseSave(JSON.stringify(old));
    expect(migrated.players.map(player => player.travelProgress)).toEqual([0, 0]);
    expect(migrated.notices?.filter(entry => entry.kind === 'milestone')).toHaveLength(0);
    for (const invalid of [-1, 72, 1.5, null]) {
      const malformed = structuredClone(old) as GameState;
      (malformed.players[0] as unknown as { travelProgress: unknown }).travelProgress = invalid;
      expect(() => parseSave(JSON.stringify(malformed)), String(invalid)).toThrow('玩家');
    }
    const state = game(); state.weatherId = 'clear'; state.selectedDie = 1;
    state.players[0].travelProgress = 71; state.players[1].travelProgress = 34;
    const first = act(state, { type: 'roll' });
    expect(first.players.map(player => player.travelProgress)).toEqual([0, 34]);
    const resumed = parseSave(JSON.stringify(first));
    expect(resumed.players.map(player => player.travelProgress)).toEqual([0, 34]);
    expect(resumed.notices?.filter(entry => entry.kind === 'milestone')).toHaveLength(1);
    const next = act(resumed, { type: 'choose', choiceId: 'leave' });
    expect(next.notices?.filter(entry => entry.kind === 'milestone')).toHaveLength(1);
    const other = structuredClone(next); other.currentPlayerIndex = 1; other.phase = 'ready'; other.pending = null; other.selectedDie = 1;
    const second = act(other, { type: 'roll' });
    expect(second.players.map(player => player.travelProgress)).toEqual([0, 35]);
    expect(second.notices?.filter(entry => entry.kind === 'milestone')).toHaveLength(1);
  });

  it('charges land and utility rent, suspending hospital owners', () => {
    const state = game();
    state.properties[land.id] = { ownerId: 'p1', level: 0, mortgaged: false };
    expect(getRent(state, land.id)).toBe(Math.ceil(land.price! * 0.24));
    for (const [level, multiplier] of [0.24, 0.54, 1.05, 1.95, 3.6].entries()) {
      state.properties[land.id].level = level;
      expect(getRent(state, land.id)).toBe(Math.ceil(land.price! * multiplier));
    }
    state.properties[land.id].level = 4;
    expect(getRent(state, land.id)).toBe(Math.ceil(land.price! * 3.6));
    state.players[0].confinement = { kind: 'hospital', remaining: 3 };
    expect(getRent(state, land.id)).toBe(0);
    state.players[0].confinement = { kind: 'sanatorium', remaining: 3 };
    expect(getRent(state, land.id)).toBeGreaterThan(0);
  });

  it('uses four unique palette colors and migrates older saves without replay data', () => {
    const four = createGame({ ...config, players: Array.from({ length: 4 }, (_, index) => ({ ...config.players[index % 2], name: `玩家${index}`, color: '#d55b48' })) });
    expect(four.players.map(player => player.color)).toEqual(PLAYER_COLORS.map(entry => entry.color));
    expect(four.config.players.map(player => player.color)).toEqual(four.players.map(player => player.color));
    const legacy = game(); delete legacy.notices;
    legacy.players[0].color = '#e18469'; legacy.players[1].color = '#e18469';
    legacy.config.players[0].color = '#e18469'; legacy.config.players[1].color = '#e18469';
    const imported = parseSave(JSON.stringify(legacy));
    expect(imported.notices).toEqual([]);
    expect(imported.players.map(player => player.color)).toEqual(PLAYER_COLORS.slice(0, 2).map(entry => entry.color));
    expect(imported.config.players.map(player => player.color)).toEqual(imported.players.map(player => player.color));
    const invalid = { ...imported, notices: [{ id: 1, day: 1, kind: 'rent', title: '', body: '', tone: 'info', playerId: 'ghost', nodeId: land.id }] };
    expect(() => parseSave(JSON.stringify(invalid))).toThrow('通知');
    const valid = { ...imported, notices: [{ id: imported.sequence, day: 1, kind: 'event', title: '偶遇', body: '测试通知', tone: 'info', playerId: 'p1', nodeId: land.id }] };
    expect(parseSave(JSON.stringify(valid)).notices).toEqual(valid.notices);
  });

  it('previews prospective rent and emits one structured notice for paid and waived rent', () => {
    const utility = MAPS.lake.nodes.find(node => node.kind === 'power')!;
    const start = game(); start.weatherId = 'clear';
    expect(getTileRentPreview(start, land.id)).toMatchObject({ price: land.price, rent: Math.ceil(land.price! * 0.24), purchasable: true, prospective: true });
    expect(getTileRentPreview(start, utility.id).rent).toBe(120);
    const otherUtility = MAPS.lake.nodes.find(node => node.kind === 'water')!;
    start.properties[otherUtility.id] = { ownerId: 'p1', level: 0, mortgaged: false };
    expect(getTileRentPreview(start, utility.id).rent).toBe(360);
    start.properties[land.id] = { ownerId: 'p2', level: 1, mortgaged: false };
    expect(getTileRentPreview(start, land.id)).toMatchObject({ rent: getRent(start, land.id), purchasable: false, prospective: false });

    const landFrom = land.neighbors[0];
    function landOnOwned(waive: boolean) {
      for (let seed = 1; seed <= 200; seed++) {
        const state = game(); state.weatherId = 'clear'; state.selectedDie = 1; state.rng = seed;
        state.players[0].position = landFrom; state.properties[land.id] = { ownerId: 'p2', level: 1, mortgaged: false };
        if (!waive) state.players[0].inventory = state.players[0].inventory.filter(slot => slot.itemId !== 'rent');
        const rolled = act(state, { type: 'roll' });
        if (rolled.players[0].position === land.id) return { before: state, after: rolled };
      }
      throw new Error('Could not land on the property');
    }
    const paid = landOnOwned(false);
    const paidNotice = paid.after.notices?.at(-1);
    expect(paid.after.notices).toHaveLength(1);
    expect(paidNotice).toMatchObject({ kind: 'rent', playerId: 'p1', recipientId: 'p2', nodeId: land.id, amount: getRent(paid.before, land.id), tone: 'info' });
    expect(paidNotice?.body).toContain('甲'); expect(paidNotice?.body).toContain('乙'); expect(paidNotice?.body).toContain(land.name);
    const waived = landOnOwned(true);
    expect(waived.after.pending?.kind).toBe('rent');
    expect(waived.after.notices).toHaveLength(0);
    expect(waived.after.players[0].cash).toBe(waived.before.players[0].cash);
    const used = act(waived.after, { type: 'choose', choiceId: 'use_card' });
    expect(used.notices).toHaveLength(1);
    expect(used.notices?.[0]).toMatchObject({ kind: 'rent', amount: 0, playerId: 'p1', recipientId: 'p2' });
    expect(used.notices?.[0].body).toContain('实付 0 PM');
    expect(used.players[0].cash).toBe(waived.before.players[0].cash);
    const suspended = game(); suspended.properties[land.id] = { ownerId: 'p2', level: 1, mortgaged: true };
    expect(getTileRentPreview(suspended, land.id)).toMatchObject({ rent: 0, reason: '地块已抵押，暂停收租' });
    const mortgagedLanding = structuredClone(paid.before);
    mortgagedLanding.properties[land.id].mortgaged = true;
    const withoutRent = act(mortgagedLanding, { type: 'roll' });
    expect(withoutRent.notices).toHaveLength(1);
    expect(withoutRent.notices?.[0]).toMatchObject({ kind: 'rent', amount: 0, recipientId: 'p2' });
    expect(withoutRent.notices?.[0].body).toContain('已抵押');
  });

  it('lets the payer keep a dry rent card, and never spends wet rent or shield cards', () => {
    const approach = () => {
      const state = game(); state.weatherId = 'clear'; state.selectedDie = 1;
      state.players[0].position = 4; state.players[0].previousPosition = 3;
      state.properties[5] = { ownerId: 'p2', level: 1, mortgaged: false };
      return state;
    };
    const before = approach();
    const prompted = act(before, { type: 'roll' });
    const rent = getRent(before, 5);
    expect(prompted.pending).toMatchObject({ kind: 'rent', data: { nodeId: 5, ownerId: 'p2', amount: rent } });
    expect(prompted.pending?.choices.map(choice => choice.id)).toEqual(['use_card', 'pay']);
    expect(prompted.players[0].cash).toBe(before.players[0].cash);
    expect(prompted.players[1].cash).toBe(before.players[1].cash);
    expect(prompted.notices).toHaveLength(0);
    expect(act(prompted, { type: 'choose', choiceId: 'invalid' })).toBe(prompted);
    const expired = structuredClone(prompted); expired.pending!.data!.amount = rent + 1;
    expect(act(expired, { type: 'choose', choiceId: 'pay' })).toBe(expired);
    const lostCard = structuredClone(prompted); lostCard.players[0].inventory.find(slot => slot.itemId === 'rent')!.wet = true;
    expect(act(lostCard, { type: 'choose', choiceId: 'use_card' })).toBe(lostCard);

    const paid = act(prompted, { type: 'choose', choiceId: 'pay' });
    expect(paid.players[0].cash).toBe(before.players[0].cash - rent);
    expect(paid.players[1].cash).toBe(before.players[1].cash + rent);
    expect(paid.players[0].inventory.some(slot => slot.itemId === 'rent')).toBe(true);
    expect(paid.notices).toHaveLength(1);
    expect(paid.pending?.kind).toBe('meal');
    expect(act(paid, { type: 'choose', choiceId: 'leave' }).notices).toHaveLength(1);
    const waived = act(prompted, { type: 'choose', choiceId: 'use_card' });
    expect(waived.players[0].cash).toBe(before.players[0].cash);
    expect(waived.players[1].cash).toBe(before.players[1].cash);
    expect(waived.players[0].inventory.some(slot => slot.itemId === 'rent')).toBe(false);
    expect(waived.notices).toHaveLength(1);
    expect(waived.notices?.[0]).toMatchObject({ kind: 'rent', amount: 0, recipientId: 'p2' });

    const wet = approach(); wet.players[0].inventory.find(slot => slot.itemId === 'rent')!.wet = true;
    const wetLanding = act(wet, { type: 'roll' });
    expect(wetLanding.pending?.kind).not.toBe('rent');
    expect(wetLanding.players[0].cash).toBe(wet.players[0].cash - rent);
    expect(wetLanding.players[0].inventory.some(slot => slot.itemId === 'rent' && slot.wet)).toBe(true);
    const shield = approach(); shield.players[0].inventory = shield.players[0].inventory.filter(slot => slot.itemId !== 'rent');
    shield.players[0].inventory.push({ uid: 'shield-rent', itemId: 'shield', quantity: 1, wet: false });
    const shieldLanding = act(shield, { type: 'roll' });
    expect(shieldLanding.pending?.kind).not.toBe('rent');
    expect(shieldLanding.players[0].cash).toBe(shield.players[0].cash - rent);
    expect(shieldLanding.players[0].inventory.some(slot => slot.uid === 'shield-rent')).toBe(true);
    const own = approach(); own.properties[5].ownerId = 'p1';
    expect(act(own, { type: 'roll' }).pending?.kind).not.toBe('rent');
    const mortgaged = approach(); mortgaged.properties[5].mortgaged = true;
    expect(act(mortgaged, { type: 'roll' }).pending?.kind).not.toBe('rent');

    let fogWaiver: GameState | undefined;
    for (let seed = 1; seed <= 100 && !fogWaiver; seed++) {
      const fog = approach(); fog.weatherId = 'fog'; fog.rng = Math.imul(seed, 2654435761) >>> 0;
      const result = act(fog, { type: 'roll' });
      if (result.players[0].position === 5 && result.notices?.some(entry => entry.kind === 'rent' && entry.amount === 0)) fogWaiver = result;
    }
    expect(fogWaiver).toBeDefined();
    expect(fogWaiver!.pending?.kind).not.toBe('rent');
    expect(fogWaiver!.players[0].inventory.some(slot => slot.itemId === 'rent')).toBe(true);
  });

  it('allows rent payment into debt and resumes glitch backtracking only after the rent choice', () => {
    const poor = game(); poor.weatherId = 'clear'; poor.selectedDie = 1;
    poor.players[0].position = 4; poor.players[0].previousPosition = 3; poor.players[0].cash = 100;
    poor.properties[5] = { ownerId: 'p2', level: 4, mortgaged: false };
    const asked = act(poor, { type: 'roll' });
    expect(asked.pending?.kind).toBe('rent');
    const paid = act(asked, { type: 'choose', choiceId: 'pay' });
    expect(paid.pending?.kind).toBe('debt');
    expect(paid.players[0].cash).toBe(100 - getRent(poor, 5));
    expect(paid.players[1].cash).toBe(poor.players[1].cash + getRent(poor, 5));
    expect(paid.players[0].inventory.some(slot => slot.itemId === 'rent')).toBe(true);
    expect(paid.notices?.filter(entry => entry.kind === 'rent')).toHaveLength(1);

    const glitch = game(); glitch.weatherId = 'glitch'; glitch.rng = oneStepRng;
    glitch.players[0].position = 2; glitch.players[0].previousPosition = 1;
    glitch.properties[5] = { ownerId: 'p2', level: 0, mortgaged: false };
    const first = act(glitch, { type: 'roll' });
    expect(first.pending).toMatchObject({ kind: 'rent', data: { nodeId: 5, glitchBacktrack: true } });
    expect(first.players[0].position).toBe(5);
    expect(first.notices?.filter(entry => entry.kind === 'rent')).toHaveLength(0);
    const afterChoice = act(first, { type: 'choose', choiceId: 'use_card' });
    expect(afterChoice.players[0].position).not.toBe(5);
    expect(afterChoice.movement?.dice).toBe(false);
    expect(afterChoice.notices?.filter(entry => entry.kind === 'rent')).toHaveLength(1);
    expect(afterChoice.players[0].stamina).toBe(first.players[0].stamina);
    expect(afterChoice.players[0].inventory.some(slot => slot.itemId === 'rent')).toBe(false);

    const indebtedGlitch = structuredClone(glitch);
    indebtedGlitch.players[0].cash = getRent(indebtedGlitch, 5) - 1;
    const rentChoice = act(indebtedGlitch, { type: 'roll' });
    const debt = act(rentChoice, { type: 'choose', choiceId: 'pay' });
    expect(debt.pending).toMatchObject({ kind: 'debt', data: { resumeGlitchBacktrack: true } });
    expect(debt.players[0].position).toBe(5);
    expect(debt.movement).toBeNull();
    const pawnChoice = debt.pending!.choices.find(entry => entry.id.startsWith('pawn:'))!;
    const resumed = act(debt, { type: 'choose', choiceId: pawnChoice.id });
    expect(resumed.players[0].cash).toBeGreaterThanOrEqual(0);
    expect(resumed.players[0].position).not.toBe(5);
    expect(resumed.movement?.dice).toBe(false);
    expect(resumed.notices?.filter(entry => entry.kind === 'rent')).toHaveLength(1);
  });

  it('retains a chosen D6 value through save migration and rejects corrupted controller states', () => {
    const state = game(); state.players[0].inventory.push({ uid: 'save-control', itemId: 'controller', quantity: 1, wet: false });
    const chosen = act(state, { type: 'useItem', itemUid: 'save-control', diceValue: 6 });
    const restored = parseSave(JSON.stringify(chosen));
    expect(restored.controlledRoll).toBe(6);
    expect(restored.selectedDie).toBe(6);
    expect(act(restored, { type: 'roll' }).movement).toMatchObject({ roll: 6, controlled: true });
    const legacy = game(); delete legacy.controlledRoll;
    expect(parseSave(JSON.stringify(legacy)).controlledRoll).toBeNull();
    for (const invalidValue of [0, 7, 1.5, '4']) {
      const invalid = { ...chosen, controlledRoll: invalidValue };
      expect(() => parseSave(JSON.stringify(invalid)), String(invalidValue)).toThrow('对局');
    }
    const combined = { ...chosen, selectedDie: 8 };
    expect(() => parseSave(JSON.stringify(combined))).toThrow('对局');
  });

  it('records the chosen event and actual effects once, retaining only 30 notices', () => {
    const event = EVENTS.find(entry => entry.id === 'aurora_film')!;
    const choice = event.choices.find(entry => entry.cash && entry.cash > 0)!;
    let state = game();
    for (let index = 0; index < 31; index++) {
      state.phase = 'decision'; state.players[0].position = MAPS.lake.nodes.find(node => node.kind === 'event')!.id;
      state.pending = { kind: 'event', title: event.title, body: event.story, data: { eventId: event.id }, choices: [{ id: choice.id, label: choice.label }] };
      const next = act(state, { type: 'choose', choiceId: choice.id });
      expect(next.notices?.at(-1)).toMatchObject({ kind: 'event', title: event.title, playerId: 'p1', amount: choice.cash });
      expect(next.notices?.at(-1)?.body).toContain(choice.label);
      expect(next.notices?.at(-1)?.body).toContain(`现金+${choice.cash} PM`);
      expect(act(next, { type: 'choose', choiceId: choice.id })).toBe(next);
      state = next;
    }
    expect(state.notices).toHaveLength(30);
    expect(state.notices!.every((entry, index) => index === 0 || entry.id > state.notices![index - 1].id)).toBe(true);
  });

  it('summarizes an event by its actual confinement result when an immunity card is spent', () => {
    const event = EVENTS.find(entry => entry.choices.some(choice => choice.confinement === 'prison'))!;
    const choice = event.choices.find(entry => entry.confinement === 'prison')!;
    const state = game(); state.phase = 'decision';
    state.players[0].position = MAPS.lake.nodes.find(node => node.kind === 'event')!.id;
    state.players[0].inventory.push({ uid: 'arrest-event', itemId: 'arrest', quantity: 1, wet: false });
    state.pending = { kind: 'event', title: event.title, body: event.story, data: { eventId: event.id }, choices: [{ id: choice.id, label: choice.label }] };
    const settled = act(state, { type: 'choose', choiceId: choice.id });
    expect(settled.players[0].confinement).toBeNull();
    expect(settled.notices?.at(-1)?.body).toContain('禁锢被道具免除');
    expect(settled.notices?.at(-1)?.nodeId).toBe(state.players[0].position);
  });

  it('uses Chinese status names and reports when a building event finds nothing to damage', () => {
    for (const [eventId, expected] of [['jinx', '霉运状态持续3日'], ['inspection', '无受损建筑']] as const) {
      const event = EVENTS.find(entry => entry.id === eventId)!;
      const state = game(); state.phase = 'decision';
      state.players[0].position = MAPS.lake.nodes.find(node => node.kind === 'event')!.id;
      state.pending = { kind: 'event', title: event.title, body: event.story, data: { eventId }, choices: [{ id: event.choices[0].id, label: event.choices[0].label }] };
      const settled = act(state, { type: 'choose', choiceId: event.choices[0].id });
      expect(settled.notices?.at(-1)?.body).toContain(expected);
    }
  });

  it('replays notice QA saves without replaying their two historical notices', () => {
    const rent = parseSave(readFileSync(new URL('./fixtures/qa-rent-notice.json', import.meta.url), 'utf8'));
    expect(rent.notices).toHaveLength(2);
    const rentResult = act(rent, { type: 'roll' });
    expect(rentResult.movement?.roll).toBe(1);
    expect(rentResult.notices).toHaveLength(3);
    expect(rentResult.notices?.[2]).toMatchObject({ kind: 'rent', playerId: 'p1', recipientId: 'p2', amount: getRent(rent, 5), nodeId: 5 });

    const event = parseSave(readFileSync(new URL('./fixtures/qa-event-notice.json', import.meta.url), 'utf8'));
    expect(event.notices).toHaveLength(2);
    expect(event.pending).toMatchObject({ kind: 'event', title: '星图档案馆' });
    const eventResult = act(event, { type: 'choose', choiceId: 'archive_shield' });
    expect(eventResult.notices).toHaveLength(3);
    expect(eventResult.notices?.[2]).toMatchObject({ kind: 'event', title: '星图档案馆' });
    expect(eventResult.notices?.[2].body).toContain('获得星盾卡');
  });

  it('values built property by actual upgrade payments and preserves worth on mortgage', () => {
    const state = game();
    state.properties[land.id] = { ownerId: 'p1', level: 3, mortgaged: false };
    const invested = land.price! + Math.ceil(land.price! * 0.75) * 3;
    const before = getNetWorth(state, 'p1');
    const mortgaged = act(state, { type: 'mortgage', nodeId: land.id });
    expect(mortgaged.players[0].cash - state.players[0].cash).toBe(Math.floor(invested * 0.5));
    expect(getNetWorth(mortgaged, 'p1')).toBe(before);
  });

  it('protects landmarks and forbids negative-price trades', () => {
    const state = game();
    state.properties[land.id] = { ownerId: 'p1', level: 4, mortgaged: false };
    expect(act(state, { type: 'sellAsset', nodeId: land.id })).toBe(state);
    expect(act(state, { type: 'offerTrade', nodeId: land.id, targetId: 'p2', price: -1 })).toBe(state);
    state.properties[land.id].mortgaged = true;
    expect(act(state, { type: 'offerTrade', nodeId: land.id, targetId: 'p2', price: 1000 })).toBe(state);
    state.properties[land.id].mortgaged = false;
    const dem = { ...state, players: structuredClone(state.players) };
    dem.players[0].inventory.push({ uid: 'dem', itemId: 'demolish', quantity: 1, wet: false });
    expect(act(dem, { type: 'useItem', itemUid: 'dem', nodeId: land.id })).toBe(dem);
  });

  it('requires redemption before repairs or hostile transfers of mortgaged property', () => {
    const state = game();
    const otherLand = MAPS.lake.nodes.find(n => n.kind === 'land' && n.id !== land.id)!;
    state.properties[land.id] = { ownerId: 'p1', level: 1, mortgaged: true };
    state.properties[otherLand.id] = { ownerId: 'p2', level: 1, mortgaged: true };
    state.players[0].inventory.push({ uid: 'repair-test', itemId: 'repair', quantity: 1, wet: false });
    state.players[0].inventory.push({ uid: 'acquire-test', itemId: 'acquire', quantity: 1, wet: false });
    expect(act(state, { type: 'useItem', itemUid: 'repair-test', nodeId: land.id })).toBe(state);
    expect(act(state, { type: 'useItem', itemUid: 'acquire-test', nodeId: otherLand.id })).toBe(state);
  });

  it('never damages a level-four landmark during a building event', () => {
    const inspection = EVENTS.find(e => e.id === 'inspection')!;
    const state = game();
    state.properties[land.id] = { ownerId: 'p1', level: 4, mortgaged: false };
    state.phase = 'decision';
    state.pending = { kind: 'event', title: inspection.title, body: inspection.story,
      choices: inspection.choices.map(choice => ({ id: choice.id, label: choice.label })), data: { eventId: inspection.id } };
    const result = act(state, { type: 'choose', choiceId: inspection.choices[0].id });
    expect(result).not.toBe(state);
    expect(result.properties[land.id].level).toBe(4);
  });

  it('limits bag capacity and wet items', () => {
    const state = game();
    state.players[0].inventory = Array.from({ length: 10 }, (_, i) => ({ uid: `x${i}`, itemId: 'snack', quantity: 1, wet: false }));
    state.players[0].inventory[0].wet = true;
    expect(canUseItem(state, 'p1', 'x0')).toBe(false);
    state.players[0].position = exchange.id;
    state.pending = { kind: 'shop', title: '商店', body: '', choices: [{ id: 'buy:snack', label: '买' }], data: { itemIds: ['snack'] } };
    state.phase = 'decision';
    expect(act(state, { type: 'choose', choiceId: 'buy:snack' })).toBe(state);
  });

  it('wets one eligible item in rain and all eligible items in a storm', () => {
    const state = game();
    state.weatherId = 'rain';
    state.players[0].inventory.push({ uid: 'extra-die', itemId: 'dice12', quantity: 1, wet: false });
    const rain = act(state, { type: 'roll' });
    expect(rain.players[0].inventory.filter(s => s.wet)).toHaveLength(1);
    expect(rain.players[0].inventory.filter(s => s.wet).every(s => ITEMS[s.itemId].susceptible)).toBe(true);
    const storm = game();
    storm.weatherId = 'storm';
    storm.players[0].inventory.push({ uid: 'extra-die', itemId: 'dice12', quantity: 1, wet: false });
    const wet = act(storm, { type: 'roll' });
    expect(wet.players[0].inventory.filter(s => s.wet)).toHaveLength(2);
    const challenge = game(); challenge.config.weatherMode = 'challenge'; challenge.weatherId = 'storm';
    const all = act(challenge, { type: 'roll' });
    expect(all.players[0].inventory.every(s => s.wet)).toBe(true);
  });

  it('weights weather by season and mode without any disaster before day 22', () => {
    const spring = game(); spring.day = 21;
    const first = weatherWeights(spring);
    expect(first.clear).toBeGreaterThan(0);
    expect(first.acid).toBe(0);
    expect(first.glitch).toBe(0);
    expect(first.paradox).toBe(0);
    const summer = game(); summer.day = 22;
    const winter = game(); winter.day = 64;
    const summerWeights = weatherWeights(summer);
    const winterWeights = weatherWeights(winter);
    expect(summerWeights.rain).toBeGreaterThan(winterWeights.rain);
    expect(winterWeights.chill).toBeGreaterThan(summerWeights.chill);
    const challenging = structuredClone(summer); challenging.config.weatherMode = 'challenge';
    const challengeWeights = weatherWeights(challenging);
    expect(challengeWeights.storm / summerWeights.storm).toBeCloseTo(2);
    expect(challengeWeights.acid / summerWeights.acid).toBeCloseTo(2);
    expect(challengeWeights.clear).toBe(summerWeights.clear);
    const streak = structuredClone(summer); streak.day = 25; streak.weatherId = 'scorch'; streak.weatherHistory = ['storm', 'scorch'];
    const oneSevereDay = structuredClone(streak); oneSevereDay.weatherHistory = ['clear', 'scorch'];
    expect(weatherWeights(streak).storm / weatherWeights(oneSevereDay).storm).toBeCloseTo(0.25);
  });

  it('gives every naturally out-of-season weather zero weight across two years and all boundaries', () => {
    const boundaries = [[21, 0], [22, 1], [42, 1], [43, 2], [63, 2], [64, 3], [84, 3], [85, 0]] as const;
    for (const [day, season] of boundaries) expect(Math.floor((day - 1) / 21) % 4).toBe(season);
    for (const mode of ['standard', 'challenge'] as const) {
      const state = game(); state.config.weatherMode = mode; state.weatherHistory = ['clear', 'clear'];
      for (let day = 1; day <= 168; day++) {
        state.day = day;
        const season = Math.floor((day - 1) / 21) % 4;
        const weights = weatherWeights(state);
        expect(Object.values(weights).reduce((sum, value) => sum + value, 0), `${mode} day ${day}`).toBeGreaterThan(0);
        for (const weather of Object.values(WEATHERS)) {
          if (!weather.seasons.includes(season) || weather.family === 'disaster' && day < 22) {
            expect(weights[weather.id], `${mode} day ${day}: ${weather.id}`).toBe(0);
          }
        }
      }
      state.day = 22;
      const summerWeights = weatherWeights(state);
      for (const id of ['chill', 'snow', 'blizzard', 'freezing']) expect(summerWeights[id], `${mode} summer ${id}`).toBe(0);
      for (const id of ['warm', 'hot', 'heat', 'scorch']) expect(summerWeights[id], `${mode} summer ${id}`).toBeGreaterThan(0);
      const summerTotal = Object.values(summerWeights).reduce((sum, weight) => sum + weight, 0);
      const summerRain = Object.entries(WEATHERS).filter(([, weather]) => weather.family === 'rain').reduce((sum, [id]) => sum + summerWeights[id], 0) / summerTotal;
      expect(summerRain).toBeGreaterThan(0.30);
      expect(summerRain).toBeLessThan(0.40);
      state.day = 64;
      const winterWeights = weatherWeights(state);
      for (const id of ['warm', 'hot', 'heat', 'scorch']) expect(winterWeights[id], `${mode} winter ${id}`).toBe(0);
      for (const id of ['snow', 'blizzard']) expect(winterWeights[id], `${mode} winter ${id}`).toBeGreaterThan(0);
      for (const id of ['freezing', 'drizzle', 'rain', 'acid']) expect(winterWeights[id], `${mode} winter ${id}`).toBe(0);
      const winterTotal = Object.values(winterWeights).reduce((sum, weight) => sum + weight, 0);
      const winterClear = Object.entries(WEATHERS).filter(([, weather]) => weather.family === 'clear').reduce((sum, [id]) => sum + winterWeights[id], 0) / winterTotal;
      expect(winterClear).toBeGreaterThan(0.20);
      for (const day of [1, 22, 43, 85]) {
        state.day = day;
        const weights = weatherWeights(state);
        expect(weights.blizzard).toBe(0);
      }
      for (const day of [1, 22, 64, 85]) {
        state.day = day;
        const weights = weatherWeights(state);
        expect(weights.freezing).toBe(0);
      }
      state.day = 43;
      expect(weatherWeights(state).freezing).toBe(mode === 'standard' ? 1.6 : 3.2);
      state.weatherHistory = ['storm', 'scorch'];
      expect(weatherWeights(state).freezing).toBe(mode === 'standard' ? 0.4 : 0.8);
      state.weatherHistory = ['clear', 'clear'];
      for (const day of [1, 43, 64]) {
        state.day = day;
        const weights = weatherWeights(state);
        expect(weights.heat).toBe(0);
        expect(weights.scorch).toBe(0);
      }
    }
  });

  it('keeps extreme weather uncommon while preserving mode and severe-streak multipliers', () => {
    const extreme = ['blizzard', 'freezing', 'storm', 'scorch', 'sandstorm', 'haze', 'acid', 'glitch', 'paradox'];
    for (const mode of ['standard', 'challenge'] as const) for (const day of [1, 22, 43, 64, 85]) {
      const state = game(); state.day = day; state.config.weatherMode = mode; state.weatherHistory = ['clear', 'clear'];
      const weights = weatherWeights(state);
      const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
      const extremeShare = extreme.reduce((sum, id) => sum + weights[id], 0) / total;
      expect(extremeShare, `${mode} day ${day}`).toBeLessThan(mode === 'standard' ? 0.08 : 0.15);
      for (const id of extreme) expect(weights[id] / total, `${mode} day ${day}: ${id}`).toBeLessThan(0.05);
    }
  });

  it('allows a weather controller to override seasons but not the day-22 disaster gate', () => {
    const state = game(); state.day = 21; state.weatherId = 'clear';
    state.players[0].inventory.push({ uid: 'controller-season', itemId: 'weather', quantity: 1, wet: false });
    expect(act(state, { type: 'useItem', itemUid: 'controller-season', weatherId: 'acid' })).toBe(state);
    const controlled = act(state, { type: 'useItem', itemUid: 'controller-season', weatherId: 'blizzard' });
    expect(controlled).not.toBe(state);
    let next = act(controlled, { type: 'endTurn' });
    next = act(next, { type: 'endTurn' });
    expect(next.day).toBe(22);
    expect(next.weatherId).toBe('blizzard');
    expect(weatherWeights(next).blizzard).toBe(0);

    const disaster = game(); disaster.day = 22; disaster.weatherId = 'clear';
    disaster.players[0].inventory.push({ uid: 'controller-disaster', itemId: 'weather', quantity: 1, wet: false });
    const selected = act(disaster, { type: 'useItem', itemUid: 'controller-disaster', weatherId: 'acid' });
    expect(selected).not.toBe(disaster);
    let tomorrow = act(selected, { type: 'endTurn' });
    tomorrow = act(tomorrow, { type: 'endTurn' });
    expect(tomorrow.day).toBe(23);
    expect(tomorrow.weatherId).toBe('acid');
  });

  it('skips three confined turns and restores hospital stamina', () => {
    let state = game();
    state.players[0].stamina = 0;
    state.players[0].confinement = { kind: 'hospital', remaining: 3 };
    state.currentPlayerIndex = 1; state.phase = 'end';
    for (let i = 0; i < 3; i++) {
      state = act(state, { type: 'endTurn' });
      expect(state.phase).toBe('end');
      if (i < 2) {
        state = act(state, { type: 'endTurn' });
        state.phase = 'end';
      }
    }
    expect(state.players[0].confinement).toBeNull();
    expect(state.players[0].stamina).toBeGreaterThanOrEqual(60);
  });

  it('requires exchange, valid quantity and cash for stocks', () => {
    const state = game();
    state.players[0].position = exchange.id;
    state.phase = 'decision';
    state.pending = { kind: 'exchange', title: '', body: '', choices: [{ id: 'leave', label: '' }] };
    expect(act(state, { type: 'stockTrade', stockId: state.stocks[0].id, quantity: -1 })).toBe(state);
    expect(act(state, { type: 'stockTrade', stockId: state.stocks[0].id, quantity: Number.POSITIVE_INFINITY })).toBe(state);
    const bought = act(state, { type: 'stockTrade', stockId: state.stocks[0].id, quantity: 10 });
    expect(bought.players[0].holdings[state.stocks[0].id]).toBe(10);
    expect(bought.players[0].cash).toBeLessThan(state.players[0].cash);
    expect(getNetWorth(bought, 'p1')).toBeLessThan(getNetWorth(state, 'p1'));
  });

  it('lets low stock quotes recover and keeps daily and event moves two-sided', () => {
    expect(marketStep(1, 100, 0, 0, 0)).toBe(2);
    expect(marketStep(1, 100, 0, 0, 0.99)).toBe(1);
    expect(marketStep(100, 100, -0.06, 0, 0.5)).toBeLessThan(100);
    expect(marketStep(100, 100, 0.06, 0, 0.5)).toBeGreaterThan(100);
    expect(marketStep(100, 100, 0, -0.3, 0.5)).toBeLessThan(80);
    expect(marketStep(100, 100, 0, 0.3, 0.5)).toBeGreaterThan(120);
    expect(marketStep(30, 100, 0, 0, 0.5)).toBeGreaterThan(30);
    expect(marketStep(300, 100, 0, 0, 0.5)).toBeLessThan(300);

    const low = game();
    low.config.seasons = 0;
    low.players.forEach(player => { player.cash = 1_000_000; });
    low.stocks[0].price = 1;
    low.stocks[0].history = [1];
    let after = low;
    for (let day = 0; day < 100 && after.stocks[0].price === 1; day++) {
      after = act(act(after, { type: 'endTurn' }), { type: 'endTurn' });
    }
    expect(after.stocks[0].price).toBeGreaterThan(1);
    expect(after.stocks[0].history.at(-1)).toBe(after.stocks[0].price);
    expect(after.stocks[0].change).toBeGreaterThan(0);
    expect(after.stocks[0].history.length).toBeLessThanOrEqual(60);
    expect(act(act(game(), { type: 'endTurn' }), { type: 'endTurn' })).toEqual(act(act(game(), { type: 'endTurn' }), { type: 'endTurn' }));
  });

  it('preserves a broad, two-sided stock distribution across four years', () => {
    const prices: number[] = [];
    for (let seed = 1; seed <= 128; seed++) {
      let rng = Math.imul(seed, 2654435761) >>> 0;
      const next = () => { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 0x1_0000_0000; };
      let price = 78;
      for (let day = 0; day < 336; day++) {
        const event = next() < 0.02;
        const sign = next() < 0.5 ? -1 : 1;
        const dailyShock = (next() * 2 - 1) * 0.06;
        const eventMagnitude = 0.25 + next() * 0.1;
        price = marketStep(price, 78, dailyShock, event ? sign * eventMagnitude : 0, next());
      }
      prices.push(price);
    }
    prices.sort((a, b) => a - b);
    expect(prices[64]).toBeGreaterThan(50);
    expect(prices[64]).toBeLessThan(110);
    expect(prices.filter(price => price > 78).length).toBeGreaterThan(35);
    expect(prices.filter(price => price < 78).length).toBeGreaterThan(35);
    expect(prices[12]).toBeGreaterThan(10);
  });

  it('quotes and applies the same 0.3% stock fee for buying, selling and debt liquidation', () => {
    expect(quoteStockTrade(1000, 2)).toEqual({ gross: 2000, fee: 6, total: 2006 });
    expect(quoteStockTrade(1000, -2)).toEqual({ gross: 2000, fee: 6, total: 1994 });
    expect(quoteStockTrade(1, 1)).toEqual({ gross: 1, fee: 1, total: 2 });
    expect(quoteStockTrade(1000, 0)).toEqual({ gross: 0, fee: 0, total: 0 });
    expect(() => quoteStockTrade(-1, 2)).toThrow(RangeError);
    const state = game(); const stock = state.stocks[0];
    state.players[0].position = exchange.id;
    state.phase = 'decision';
    state.pending = { kind: 'exchange', title: '', body: '', choices: [{ id: 'leave', label: '' }] };
    const bought = act(state, { type: 'stockTrade', stockId: stock.id, quantity: 7 });
    expect(state.players[0].cash - bought.players[0].cash).toBe(quoteStockTrade(stock.price, 7).total);
    const sold = act(bought, { type: 'stockTrade', stockId: stock.id, quantity: -3 });
    expect(sold.players[0].cash - bought.players[0].cash).toBe(quoteStockTrade(stock.price, -3).total);
    const debtor = game(); debtor.players[0].cash = 50; debtor.players[0].holdings[stock.id] = 7; debtor.phase = 'end';
    let due = act(debtor, { type: 'endTurn' }); due.phase = 'end'; due = act(due, { type: 'endTurn' });
    expect(due.pending?.kind).toBe('debt');
    const liquidated = act(due, { type: 'choose', choiceId: `sellstock:${stock.id}` });
    expect(liquidated.players[0].cash - due.players[0].cash).toBe(quoteStockTrade(due.stocks.find(s => s.id === stock.id)!.price, -7).total);
  });

  it('draws exactly one item from the fixed slot pool for 300 PM', () => {
    expect(SLOTS_STAKE).toBe(300);
    expect(SLOT_PRIZE_POOL.reduce((sum, prize) => sum + prize.weight, 0)).toBe(SLOT_POOL_TOTAL);
    expect(SLOT_PRIZE_POOL.slice(-13).reduce((sum, prize) => sum + prize.weight, 0)).toBe(100);
    expect(SLOT_PRIZE_POOL.every(prize => !!ITEMS[prize.itemId])).toBe(true);
    expect(SLOT_PRIZE_POOL.map(prize => prize.itemId)).not.toContain('dice100');
    expect(SLOT_PRIZE_POOL.map(prize => prize.itemId)).not.toContain('lottery');
    const expectedValue = SLOT_PRIZE_POOL.reduce((sum, prize) => sum + prize.weight * ITEMS[prize.itemId].price, 0) / SLOT_POOL_TOTAL;
    expect(expectedValue).toBeGreaterThan(300);
    expect(expectedValue).toBeLessThan(350);
    expect(expectedValue / 2).toBeLessThan(SLOTS_STAKE);
    expect(drawSlotItem(0)).toBe('snack');
    expect(drawSlotItem(SLOT_POOL_TOTAL - 1)).toBe('repair');
    expect(() => drawSlotItem(SLOT_POOL_TOTAL)).toThrow(RangeError);
    const item = casinoOutcome('slots', 'item');
    expect(item.result.itemId).toBeDefined();
    const gained = (player: GameState['players'][number]) => player.inventory.filter(slot => slot.itemId === item.result.itemId).reduce((sum, slot) => sum + slot.quantity, 0);
    expect(gained(item.after.players[0]) - gained(item.before.players[0])).toBe(1);
    expect(item.result.detail).toContain(ITEMS[item.result.itemId!].name);
    expect(item.result).toMatchObject({ stake: 300, payout: 0, net: -300 });
    expect(item.after.players[0].cash - item.before.players[0].cash).toBe(-300);
    expect(item.after.logs.at(-1)?.text).toContain(item.result.detail);
    for (let seed = 1; seed <= 200; seed++) {
      const before = casinoState(seed);
      const after = act(before, { type: 'choose', choiceId: 'slots' });
      expect(after.pending?.casinoResult?.outcome).toBe('item');
      expect(after.pending?.casinoResult?.itemId).toBeDefined();
      expect(after.players[0].cash).toBe(before.players[0].cash - SLOTS_STAKE);
    }
  });

  it('rejects a full bag before drawing, even when a card could stack', () => {
    const full = casinoState(123, 300);
    full.players[0].inventory = [{ uid: 'stack', itemId: 'rent', quantity: 1, wet: false }];
    full.players[0].capacity = 1;
    expect(act(full, { type: 'choose', choiceId: 'slots' })).toBe(full);
    expect(full.players[0].cash).toBe(300);
    expect(full.players[0].inventory[0].quantity).toBe(1);
    expect(full.rng).toBe(casinoState(123, 300).rng);
    const poor = casinoState(11, 299);
    expect(act(poor, { type: 'choose', choiceId: 'slots' })).toBe(poor);
  });

  it('reports roulette bets and payouts, replaces the casino result, and blocks unaffordable replays', () => {
    const win = casinoOutcome('red', 'win');
    expect(win.result).toMatchObject({ game: 'roulette', bet: 'red', stake: 500, payout: 1000, net: 500 });
    expect(win.result.detail).toContain('押红下注 500 PM，返还 1,000 PM，净得 500 PM');
    expect(win.after.players[0].cash - win.before.players[0].cash).toBe(500);
    const loss = casinoOutcome('black', 'lose');
    expect(loss.result).toMatchObject({ game: 'roulette', bet: 'black', stake: 500, payout: 0, net: -500 });
    expect(loss.result.detail).toContain('押黑下注 500 PM，返还 0 PM，净支出 500 PM');
    expect(loss.after.players[0].cash - loss.before.players[0].cash).toBe(-500);

    const playedAgain = act(win.after, { type: 'choose', choiceId: 'black' });
    expect(playedAgain.pending?.casinoResult?.id).toBeGreaterThan(win.result.id);
    expect(playedAgain.pending?.casinoResult?.game).toBe('roulette');
    expect(playedAgain.pending?.casinoResult?.bet).toBe('black');
    expect(act(playedAgain, { type: 'choose', choiceId: 'leave' }).pending).toBeNull();

    const poor = casinoState(11, 300);
    const exhausted = act(poor, { type: 'choose', choiceId: 'slots' });
    expect(exhausted.players[0].cash).toBe(0);
    expect(exhausted.pending?.choices.filter(entry => entry.id !== 'leave').every(entry => entry.disabled)).toBe(true);
    expect(act(exhausted, { type: 'choose', choiceId: 'slots' })).toBe(exhausted);
    expect(act(exhausted, { type: 'choose', choiceId: 'red' })).toBe(exhausted);
  });

  it('persists casino results through saves without replaying winnings and rejects malformed result data', () => {
    const played = casinoOutcome('slots', 'item').after;
    const restored = parseSave(JSON.stringify(played));
    expect(restored.pending?.casinoResult).toEqual(played.pending?.casinoResult);
    expect(restored.players[0].cash).toBe(played.players[0].cash);
    expect(restored.pending?.casinoResult?.id).toBe(played.pending?.casinoResult?.id);
    const legacy = casinoState(2);
    expect(parseSave(JSON.stringify(legacy)).pending?.casinoResult).toBeUndefined();
    for (const historical of [
      { outcome: 'cash', payout: 854, net: 554 },
      { outcome: 'miss', payout: 0, net: -300 },
      { outcome: 'no_capacity', payout: 0, net: -300 },
    ] as const) {
      const old = structuredClone(played);
      old.pending!.casinoResult = { id: played.pending!.casinoResult!.id, game: 'slots', title: '历史结果', detail: '旧版老虎机结果', stake: 300, ...historical };
      const imported = parseSave(JSON.stringify(old));
      expect(imported.pending?.casinoResult).toEqual(old.pending?.casinoResult);
      expect(imported.players[0].cash).toBe(old.players[0].cash);
      expect(imported.players[0].inventory).toEqual(old.players[0].inventory);
    }
    for (const patch of [
      { net: 100000 }, { itemId: 'dice100' }, { outcome: 'item', itemId: 'unknown', payout: 0, net: -300 },
      { title: '' }, { detail: { invalid: true } }, { id: played.sequence + 1 },
    ]) {
      const corrupted = structuredClone(played);
      corrupted.pending!.casinoResult = { ...corrupted.pending!.casinoResult!, ...patch } as CasinoResult;
      expect(() => parseSave(JSON.stringify(corrupted)), JSON.stringify(patch)).toThrow('对局');
    }
  });

  it('uses a shared staged timeline, including old saves and no-dice transfers', () => {
    const normal = { id: 1, playerId: 'p1', path: [0, 1, 2], roll: 2, modifier: 0,
      dice: true, segments: [{ kind: 'normal' as const, path: [0, 1, 2] }, { kind: 'weather' as const, path: [2, 3], label: '打滑 · 前进 1 格' }], effects: [] };
    const timeline = getMovementTimeline(normal);
    expect(timeline.stages.map(stage => stage.kind)).toEqual(['roll', 'result', 'move', 'move', 'weather', 'move', 'effect']);
    expect(timeline.stages.map(stage => [stage.start, stage.end])).toEqual([
      [0, 650], [650, 1550], [1550, 1950], [1950, 2350], [2350, 3250], [3250, 3710], [3710, 4610],
    ]);
    expect(timeline.stages[2]).toMatchObject({ path: [0, 1], segmentKind: 'normal', stepIndex: 1, stepCount: 2, travelDuration: 260 });
    expect(timeline.stages[3]).toMatchObject({ path: [1, 2], segmentKind: 'normal', stepIndex: 2, stepCount: 2, travelDuration: 260 });
    expect(timeline.stages.slice(2, 4).every(stage => stage.end - stage.start - stage.travelDuration! === 140)).toBe(true);
    expect(timeline.stages[4]).toMatchObject({ label: '打滑 · 前进 1 格', segmentKind: 'weather', stepCount: 1, path: [2] });
    expect(timeline.stages[5]).toMatchObject({ path: [2, 3], segmentKind: 'weather', stepIndex: 1, stepCount: 1, travelDuration: 300 });
    expect(timeline.stages[5].end - timeline.stages[5].start - timeline.stages[5].travelDuration!).toBe(160);
    expect(timeline.duration).toBe(4610);
    const legacy = getMovementTimeline({ id: 2, playerId: 'p1', path: [0, 1], roll: 1, modifier: 0 });
    expect(legacy.stages[0].kind).toBe('roll');
    expect(legacy.stages.find(stage => stage.kind === 'move')?.path).toEqual([0, 1]);
    const transfer = getMovementTimeline({ id: 3, playerId: 'p1', path: [5, 6], roll: 0, modifier: 0, dice: false,
      segments: [{ kind: 'transfer', path: [5, 6] }] });
    expect(transfer.stages.map(stage => stage.kind)).toEqual(['move', 'effect']);
    expect(transfer.stages[0]).toMatchObject({ segmentKind: 'transfer', path: [5, 6], travelDuration: 420 });
    expect(transfer.duration).toBe(1320);
    const hundred = getMovementTimeline({ id: 4, playerId: 'p1', path: Array.from({ length: 101 }, (_, i) => i), roll: 100, modifier: 0 });
    const longSteps = hundred.stages.filter(stage => stage.kind === 'move');
    expect(longSteps).toHaveLength(100);
    expect(longSteps.every(stage => stage.segmentKind === 'normal' && stage.travelDuration === 160 && stage.end - stage.start === 240)).toBe(true);
    expect(longSteps.map(stage => stage.path)).toEqual(Array.from({ length: 100 }, (_, index) => [index, index + 1]));
    expect(longSteps.at(-1)).toMatchObject({ path: [99, 100], stepIndex: 100, stepCount: 100, end: 25_550 });
    expect(hundred.duration).toBe(26_450);
  });

  it('shows both directions of dice adjustment before the first move, including zero steps', () => {
    const base = { id: 1, playerId: 'p1', dice: true };
    const reduced = getMovementTimeline({ ...base, path: [0], roll: 2, modifier: -4 });
    expect(reduced.stages.map(stage => stage.kind)).toEqual(['roll', 'result', 'adjust', 'adjusted', 'effect']);
    expect(reduced.stages.map(stage => stage.label)).toEqual([undefined, '2', '2 − 4 = 0', '0', undefined]);
    expect(reduced.stages[3]).toMatchObject({ start: 2250, end: 2900 });
    expect(reduced.duration).toBe(3800);
    const boosted = getMovementTimeline({ ...base, path: [0, 1, 2, 3, 4, 5, 6], roll: 4, modifier: 2 });
    expect(boosted.stages[2]).toMatchObject({ kind: 'adjust', label: '4 + 2 = 6' });
    expect(boosted.stages[3]).toMatchObject({ kind: 'adjusted', label: '6' });
    expect(boosted.stages[4]).toMatchObject({ kind: 'move', start: 2900, path: [0, 1] });
    expect(boosted.stages.filter(stage => stage.kind === 'move')).toHaveLength(6);
    expect(boosted.duration).toBe(6200);
  });

  it('segments live weather movement and gives transfers a distinct no-dice animation', () => {
    const snowy = game(); snowy.weatherId = 'snow'; snowy.selectedDie = 1;
    const rolled = act(snowy, { type: 'roll' });
    expect(rolled.movement?.dice).toBe(true);
    expect(rolled.movement?.segments?.map(segment => segment.kind)).toEqual(['normal', 'weather']);
    expect(rolled.movement?.segments?.[1].label).toBe('打滑 · 前进 1 格');
    expect(rolled.movement?.segments?.[0].path.at(-1)).toBe(rolled.movement?.segments?.[1].path[0]);
    expect(rolled.movement?.segments?.[1].path.at(-1)).toBe(rolled.players[0].position);
    expect(getMovementTimeline(rolled.movement!).stages.some(stage => stage.kind === 'weather')).toBe(true);

    const windy = game(); windy.weatherId = 'gale'; windy.selectedDie = 1;
    expect(act(windy, { type: 'roll' }).movement?.segments?.[1].label).toBe('吹回 · 后退 1 格');

    const stations = MAPS.lake.nodes.filter(node => node.kind === 'station');
    const stationState = game(); stationState.players[0].position = stations[0].id; stationState.phase = 'decision';
    stationState.pending = { kind: 'station', title: '', body: '', data: { nodeId: stations[0].id },
      choices: [{ id: `station:${stations[1].id}`, label: '' }] };
    const transferred = act(stationState, { type: 'choose', choiceId: `station:${stations[1].id}` });
    expect(transferred.movement?.dice).toBe(false);
    expect(transferred.movement?.segments?.[0].kind).toBe('transfer');
    expect(transferred.movement?.path).toEqual([stations[0].id, stations[1].id]);
  });

  it('animates glitch backtracking without a second die and reports landings separately from later choices', () => {
    let first: GameState | undefined;
    for (let seed = 1; seed <= 200 && !first; seed++) {
      const candidate = game(); candidate.weatherId = 'glitch'; candidate.rng = seed; candidate.selectedDie = 1;
      const rolled = act(candidate, { type: 'roll' });
      if (rolled.pending?.data?.glitchBacktrack && rolled.pending.choices.some(choice => choice.id === 'leave')) first = rolled;
    }
    expect(first).toBeDefined();
    const afterChoice = act(first!, { type: 'choose', choiceId: 'leave' });
    expect(afterChoice.movement?.id).not.toBe(first!.movement?.id);
    expect(afterChoice.movement?.dice).toBe(false);
    expect(afterChoice.movement?.segments?.[0].kind).toBe('weather');
    expect(first!.movement?.segments?.[1].label).toBe('错位 · 前进 2 格');
    expect(afterChoice.movement?.segments?.[0].label).toBe('错位 · 后退 4 格');
    const glitchReturn = afterChoice.movement!.segments![0].path.at(-2);
    expect(afterChoice.players[0].routeNextPosition).toBe(glitchReturn);
    const glitchResumed = structuredClone(afterChoice);
    glitchResumed.phase = 'ready'; glitchResumed.pending = null; glitchResumed.weatherId = 'clear'; glitchResumed.rng = oneStepRng;
    expect(act(glitchResumed, { type: 'roll' }).movement?.segments?.[0].path[1]).toBe(glitchReturn);
    const backtrackStages = getMovementTimeline(afterChoice.movement!).stages.filter(stage => stage.kind === 'move');
    expect(backtrackStages.map(stage => stage.path)).toEqual(afterChoice.movement!.path.slice(1).map((node, index) => [afterChoice.movement!.path[index], node]));
    expect(backtrackStages.every(stage => stage.segmentKind === 'weather' && stage.travelDuration === 300 && stage.end - stage.start === 460)).toBe(true);
    expect(afterChoice.movement?.roll).toBe(0);

    const coin = MAPS.lake.nodes.find(node => node.kind === 'coin')!;
    let coinLanding: GameState | undefined;
    for (let seed = 1; seed <= 200 && !coinLanding; seed++) {
      const candidate = game(); candidate.weatherId = 'clear'; candidate.rng = seed; candidate.selectedDie = 1;
      candidate.players[0].position = coin.neighbors[0];
      const rolled = act(candidate, { type: 'roll' });
      if (rolled.players[0].position === coin.id) coinLanding = rolled;
    }
    expect(coinLanding).toBeDefined();
    const amount = coinLanding!.players[0].cash - 100_000;
    expect(coinLanding!.movement?.effects).toContainEqual({ kind: 'cash', label: `拾得 +${amount} PM`, tone: 'good' });
    expect(coinLanding!.feedback).toBeNull();

    const purchasing = game(); purchasing.players[0].position = land.id; purchasing.phase = 'decision';
    purchasing.pending = { kind: 'land', title: '', body: '', data: { nodeId: land.id }, choices: [{ id: 'buy', label: '' }] };
    purchasing.movement = coinLanding!.movement;
    const bought = act(purchasing, { type: 'choose', choiceId: 'buy' });
    expect(bought.movement).toBeNull();
    expect(bought.feedback?.effects.some(entry => entry.kind === 'building')).toBe(true);
    const ended = act(bought, { type: 'endTurn' });
    expect(ended.feedback).toBeNull();
  });

  it('pawns an item and enforces inventory space and redemption cost', () => {
    const state = game(); const uid = state.players[0].inventory[0].uid;
    const pawned = act(state, { type: 'pawnItem', itemUid: uid });
    expect(pawned.players[0].cash - state.players[0].cash).toBe(Math.floor(ITEMS.snack.price * 0.5));
    expect(getNetWorth(pawned, 'p1')).toBe(getNetWorth(state, 'p1'));
    expect(pawned.players[0].pawnedItems).toHaveLength(1);
    const pawnUid = pawned.players[0].pawnedItems[0].slot.uid;
    pawned.players[0].inventory = Array.from({ length: 10 }, (_, i) => ({ uid: `x${i}`, itemId: 'snack', quantity: 1, wet: false }));
    expect(act(pawned, { type: 'redeemItem', itemUid: pawnUid })).toBe(pawned);
    pawned.players[0].inventory.pop();
    const redeemed = act(pawned, { type: 'redeemItem', itemUid: pawnUid });
    expect(redeemed.players[0].pawnedItems).toHaveLength(0);
    expect(redeemed.players[0].cash).toBe(pawned.players[0].cash - Math.ceil(ITEMS.snack.price * 0.5 * 1.2));
    expect(getNetWorth(redeemed, 'p1')).toBe(getNetWorth(pawned, 'p1') - Math.ceil(ITEMS.snack.price * 0.5 * 0.2));
  });

  it('gives every manually usable item a legal effect', () => {
    const otherLand = MAPS.lake.nodes.find(n => n.kind === 'land' && n.id !== land.id)!;
    const station = MAPS.lake.nodes.find(n => n.kind === 'station')!;
    for (const id of Object.keys(ITEMS)) {
      const state = game();
      state.properties[land.id] = { ownerId: 'p1', level: 1, mortgaged: false };
      state.properties[otherLand.id] = { ownerId: 'p2', level: 1, mortgaged: false };
      state.players[0].inventory.push({ uid: `test-${id}`, itemId: id, quantity: 1, wet: false });
      if (['rent', 'shield', 'arrest'].includes(id)) {
        expect(canUseItem(state, 'p1', `test-${id}`), id).toBe(false);
        continue;
      }
      expect(canUseItem(state, 'p1', `test-${id}`), id).toBe(true);
      const changed = act(state, {
        type: 'useItem', itemUid: `test-${id}`, targetId: 'p2', weatherId: 'clear',
        diceValue: id === 'controller' ? 4 : undefined,
        nodeId: id === 'repair' ? land.id : id === 'teleport' ? station.id : otherLand.id,
      });
      expect(changed, id).not.toBe(state);
      expect(changed.players[0].inventory.some(s => s.uid === `test-${id}`), id).toBe(false);
    }
  });

  it('rejects invalid weather keys and cannot import an inherited map key', () => {
    const state = game();
    state.players[0].inventory.push({ uid: 'weather-control', itemId: 'weather', quantity: 1, wet: false });
    expect(act(state, { type: 'useItem', itemUid: 'weather-control', weatherId: '__proto__' })).toBe(state);
    expect(() => createGame({ ...config, mapId: '__proto__' as GameConfig['mapId'] })).toThrow();
    expect(() => createGame({ ...config, seasons: 1 })).toThrow();
  });

  it('offers debt choices instead of automatically selling assets', () => {
    const state = game();
    state.players[0].cash = 50;
    state.properties[land.id] = { ownerId: 'p1', level: 1, mortgaged: false };
    state.phase = 'end';
    const next = act(state, { type: 'endTurn' });
    expect(next.currentPlayerIndex).toBe(1);
    // A daily fee is charged when this player next opens their turn.
    const back = act({ ...next, phase: 'end' }, { type: 'endTurn' });
    expect(back.pending?.kind).toBe('debt');
    expect(back.properties[land.id]?.ownerId).toBe('p1');
    expect(back.pending?.choices.some(c => c.id === `mortgage:${land.id}`)).toBe(true);
    const paid = act(back, { type: 'choose', choiceId: `mortgage:${land.id}` });
    expect(paid.players[0].cash).toBeGreaterThanOrEqual(0);
    expect(paid.properties[land.id].mortgaged).toBe(true);
  });

  it('reports each 21-day season and ends after the configured number of seasons', () => {
    let state = game();
    for (let turns = 0; turns < 42; turns++) {
      state.phase = 'end';
      state = act(state, { type: 'endTurn' });
    }
    expect(state.day).toBe(22);
    expect(state.seasonReport?.season).toBe(1);
    expect(state.phase).not.toBe('gameover');
    state = act(state, { type: 'dismissSeason' });
    expect(state.seasonReport).toBeNull();
    for (let turns = 42; turns < 168; turns++) {
      state.phase = 'end';
      state = act(state, { type: 'endTurn' });
    }
    expect(state.day).toBe(85);
    expect(state.phase).toBe('gameover');
    expect(state.winnerId).not.toBeNull();
  });

  it('never names a bankrupt player the duration winner on an asset tie', () => {
    const trio = structuredClone(config);
    trio.players.push({ name: '丙', color: '#00ff00', shape: 'triangle', ai: false, personality: 'balanced' });
    const state = createGame(trio);
    state.players[0].bankrupt = true;
    for (const player of state.players) { player.cash = 0; player.inventory = []; }
    state.day = 84;
    state.currentPlayerIndex = 2;
    state.phase = 'end';
    const finished = act(state, { type: 'endTurn' });
    expect(finished.phase).toBe('gameover');
    expect(finished.winnerId).toBe('p2');
  });

  it('advances one AI action and still has a legal escape from all-disabled event', () => {
    let state = game(); state.currentPlayerIndex = 1;
    const action = runAI(state);
    expect(action).not.toBe(state);
    expect(action.players[1].position).not.toBeUndefined();
  });

  it('makes one AI rent decision by card value and can plan a controlled journey reward', () => {
    const aiRent = (level: number) => {
      const state = game(); state.currentPlayerIndex = 1; state.weatherId = 'clear'; state.selectedDie = 1;
      state.players[1].position = 4; state.players[1].previousPosition = 3;
      state.players[1].inventory.push({ uid: 'ai-rent', itemId: 'rent', quantity: 1, wet: false });
      state.properties[5] = { ownerId: 'p1', level, mortgaged: false };
      return act(state, { type: 'roll' });
    };
    const cheap = aiRent(0);
    expect(cheap.pending?.kind).toBe('rent');
    const paid = runAI(cheap);
    const rentCards = (state: GameState) => state.players[1].inventory.filter(slot => slot.itemId === 'rent').reduce((sum, slot) => sum + slot.quantity, 0);
    expect(rentCards(paid)).toBe(rentCards(cheap));
    expect(paid.notices?.at(-1)).toMatchObject({ kind: 'rent', amount: getRent(cheap, 5) });
    const expensive = aiRent(4);
    const waived = runAI(expensive);
    expect(rentCards(waived)).toBe(rentCards(expensive) - 1);
    expect(waived.notices?.at(-1)).toMatchObject({ kind: 'rent', amount: 0 });

    const travel = game(); travel.currentPlayerIndex = 1; travel.weatherId = 'clear'; travel.encounters = [];
    travel.players[1].travelProgress = 67;
    travel.players[1].inventory.push({ uid: 'ai-control', itemId: 'controller', quantity: 1, wet: false });
    const planned = runAI(travel);
    expect(planned.controlledRoll).toBeGreaterThanOrEqual(5);
    expect(planned.players[1].inventory.some(slot => slot.uid === 'ai-control')).toBe(false);
    const rolled = runAI(planned);
    expect(rolled.movement).toMatchObject({ playerId: 'p2', controlled: true, roll: planned.controlledRoll });
    expect(rolled.players[1].travelProgress).toBeLessThan(6);
  });

  it('makes one AI stock decision per exchange visit then leaves', () => {
    const state = game();
    state.currentPlayerIndex = 1;
    state.players[1].position = exchange.id;
    state.phase = 'decision';
    state.pending = { kind: 'exchange', title: '交易所', body: '', choices: [{ id: 'leave', label: '离开' }] };
    const traded = runAI(state);
    expect(Object.values(traded.players[1].holdings).some(count => count > 0)).toBe(true);
    expect(traded.pending?.data?.traded).toBe(true);
    const left = runAI(traded);
    expect(left.phase).toBe('end');
  });

  it('plays a full four-season AI match without a stalled decision', () => {
    const auto = structuredClone(config);
    auto.weatherMode = 'challenge';
    auto.players[0].ai = true;
    auto.players[0].personality = 'aggressive';
    let state = createGame(auto);
    for (let step = 0; step < 5000 && state.phase !== 'gameover'; step++) {
      const next = runAI(state);
      expect(next, `AI stalled on day ${state.day}, ${state.pending?.kind ?? state.phase}`).not.toBe(state);
      state = next;
    }
    expect(state.phase).toBe('gameover');
    expect(state.winnerId).not.toBeNull();
  });
});
