import { describe, expect, it } from 'vitest';
import { act, createGame, getRent } from '../src/game/engine';
import { findEligibleEvent } from '../src/game/eventPool';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import { EVENTS } from '../src/game/data';
import type { GameState, MapNode } from '../src/game/types';

const config = { mapId: 'lake' as const, mode: 'pve' as const, seasons: 4, weatherMode: 'standard' as const, seed: 91,
  players: [
    { name: '甲', color: '#D55B48', shape: 'circle' as const, ai: false, personality: 'balanced' as const },
    { name: '乙', color: '#277DA8', shape: 'diamond' as const, ai: true, personality: 'balanced' as const },
  ] };

function readyAt(node: MapNode, seed: number, weatherId = 'clear'): GameState {
  const state = createGame(config);
  const approach = MAPS.lake.nodes[node.neighbors[0]];
  state.players[0].position = approach.id;
  state.players[0].previousPosition = null;
  state.players[0].routeNextPosition = node.id;
  state.controlledRoll = 1;
  state.selectedDie = 6;
  state.weatherId = weatherId;
  state.weatherHistory = [weatherId];
  state.rng = seed;
  state.encounters = [node.id];
  return state;
}

function safeEventChoice(state: GameState): string | null {
  if (state.pending?.kind !== 'event') return null;
  const event = findEligibleEvent(state.config.mapId, String(state.pending.data?.eventId), 'encounter');
  return event?.choices.find(option => !option.confinement && !option.damageBuilding
    && (option.stamina ?? 0) >= -10 && (option.mood ?? 0) >= -10
    && state.pending?.choices.some(choice => choice.id === option.id && !choice.disabled))?.id ?? null;
}

function safeLanding(node: MapNode, prepare?: (state: GameState) => void) {
  for (let seed = 1; seed < 500; seed++) {
    const before = readyAt(node, seed);
    prepare?.(before);
    const event = act(before, { type: 'roll' });
    const choiceId = safeEventChoice(event);
    if (choiceId) return { before, event, choiceId };
  }
  throw new Error(`No safe event draw for ${node.name}`);
}

describe('temporary encounter continuation', () => {
  it('draws 5–8 distinct markers across playable tile kinds, excluding start and fixed events', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 300; seed++) {
      const state = createGame({ ...config, seed });
      expect(state.encounters.length).toBeGreaterThanOrEqual(5);
      expect(state.encounters.length).toBeLessThanOrEqual(8);
      expect(new Set(state.encounters).size).toBe(state.encounters.length);
      for (const id of state.encounters) {
        const kind = MAPS.lake.nodes[id].kind;
        expect(['start', 'event']).not.toContain(kind);
        kinds.add(kind);
      }
    }
    expect([...kinds]).toEqual(expect.arrayContaining(['land', 'coin', 'shop', 'station', 'power', 'empty']));
  });

  it('resumes rent exactly once after the event, preserving the manual card decision across a save', () => {
    const node = MAPS.lake.nodes.find(tile => tile.kind === 'land' && tile.neighbors.every(id => MAPS.lake.nodes[id].kind !== 'start'))!;
    const { before, event, choiceId } = safeLanding(node, state => {
      state.properties[node.id] = { ownerId: state.players[1].id, level: 1, mortgaged: false };
    });
    expect(event.pending?.data).toMatchObject({ eventSource: 'encounter', continuation: { nodeId: node.id, skipStation: false, glitchBacktrack: false } });
    expect(event.players[1].cash).toBe(before.players[1].cash);
    expect(event.encounters).not.toContain(node.id);
    const restored = parseSave(JSON.stringify(event));
    const afterEvent = act(restored, { type: 'choose', choiceId });
    expect(afterEvent.pending?.kind).toBe('rent');
    const rent = getRent(afterEvent, node.id);
    const paid = act(afterEvent, { type: 'choose', choiceId: 'pay' });
    expect(paid.players[1].cash).toBe(before.players[1].cash + rent);
    expect(paid.notices?.filter(notice => notice.kind === 'rent')).toHaveLength(1);
    expect(act(paid, { type: 'choose', choiceId: 'pay' })).toBe(paid);
  });

  it('resumes an unowned land purchase and credits a coin only after its encounter', () => {
    for (const kind of ['land', 'coin'] as const) {
      const node = MAPS.lake.nodes.find(tile => tile.kind === kind && tile.neighbors.every(id => MAPS.lake.nodes[id].kind !== 'start'))!;
      const { before, event, choiceId } = safeLanding(node);
      const cashAtEvent = event.players[0].cash;
      const resolved = act(event, { type: 'choose', choiceId });
      if (kind === 'land') {
        expect(resolved.pending?.kind).toBe('land');
        expect(resolved.players[0].position).toBe(node.id);
        expect(resolved.properties[node.id]).toBeUndefined();
      } else {
        const option = findEligibleEvent(config.mapId, String(event.pending?.data?.eventId), 'encounter')!.choices.find(c => c.id === choiceId)!;
        const eventCash = option.cash ?? 0;
        expect(resolved.players[0].cash - cashAtEvent - eventCash).toBeGreaterThanOrEqual(100);
        expect(resolved.players[0].cash - cashAtEvent - eventCash).toBeLessThanOrEqual(200);
        expect(resolved.feedback?.effects.some(effect => effect.label.startsWith('拾得 +'))).toBe(true);
        expect(resolved.feedback!.id).toBeGreaterThan(resolved.notices!.filter(notice => notice.kind === 'event').at(-1)!.id);
        expect(resolved.players[0].cash).toBeGreaterThan(before.players[0].cash - 2000);
        expect(parseSave(JSON.stringify(resolved)).players[0].cash).toBe(resolved.players[0].cash);
      }
    }
  });

  it('gives automatic rent after an event a separate feedback sequence', () => {
    const node = MAPS.lake.nodes.find(tile => tile.kind === 'land')!;
    for (let seed = 1; seed < 500; seed++) {
      const state = readyAt(node, seed);
      state.properties[node.id] = { ownerId: state.players[1].id, level: 0, mortgaged: false };
      state.players[0].inventory = state.players[0].inventory.filter(slot => slot.itemId !== 'rent');
      const arrived = act(state, { type: 'roll' });
      const choiceId = safeEventChoice(arrived);
      if (!choiceId) continue;
      const paid = act(arrived, { type: 'choose', choiceId });
      if (!paid.notices?.some(notice => notice.kind === 'rent' && notice.amount! > 0)) continue;
      const eventNotice = paid.notices.filter(notice => notice.kind === 'event').at(-1)!;
      expect(paid.feedback!.id).toBeGreaterThan(eventNotice.id);
      expect(paid.feedback?.effects.some(effect => effect.label.startsWith('支付租金 −'))).toBe(true);
      expect(paid.notices.filter(notice => notice.kind === 'rent')).toHaveLength(1);
      return;
    }
    throw new Error('Could not draw an event followed by automatic rent');
  });

  it('rejects forged continuation and cross-source event without consuming the choice', () => {
    const node = MAPS.lake.nodes.find(tile => tile.kind === 'land')!;
    const { event, choiceId } = safeLanding(node);
    const forged = structuredClone(event);
    (forged.pending!.data!.continuation as { nodeId: number }).nodeId = node.neighbors[0];
    expect(act(forged, { type: 'choose', choiceId })).toBe(forged);
    expect(() => parseSave(JSON.stringify(forged))).toThrow();
    const wrongSource = structuredClone(event);
    wrongSource.pending!.data!.eventSource = 'tile';
    expect(act(wrongSource, { type: 'choose', choiceId })).toBe(wrongSource);
    expect(() => parseSave(JSON.stringify(wrongSource))).toThrow();
    const falseSkip = structuredClone(event);
    falseSkip.pending!.choices.push({ id: 'skip_unavailable', label: '资源不足，离开' });
    expect(act(falseSkip, { type: 'choose', choiceId: 'skip_unavailable' })).toBe(falseSkip);
  });

  it('settles an origin station encounter before travel and a destination encounter without offering a second ride', () => {
    const stations = MAPS.lake.nodes.filter(node => node.kind === 'station');
    const [from, to] = stations;
    let origin: GameState | null = null;
    let originChoice = '';
    for (let seed = 1; seed < 500; seed++) {
      const state = readyAt(from, seed);
      state.encounters.push(to.id);
      const landed = act(state, { type: 'roll' });
      const choice = safeEventChoice(landed);
      if (!choice) continue;
      const continued = act(landed, { type: 'choose', choiceId: choice });
      if (continued.pending?.kind !== 'station') continue;
      const transferred = act(continued, { type: 'choose', choiceId: `station:${to.id}` });
      if (safeEventChoice(transferred)) { origin = landed; originChoice = choice; break; }
    }
    expect(origin).not.toBeNull();
    const station = act(origin!, { type: 'choose', choiceId: originChoice });
    expect(station.pending?.kind).toBe('station');
    const arrived = act(station, { type: 'choose', choiceId: `station:${to.id}` });
    expect(arrived.players[0].position).toBe(to.id);
    expect(arrived.pending?.data).toMatchObject({ eventSource: 'encounter', continuation: { nodeId: to.id, skipStation: true } });
    expect(station.turnEncounters).toHaveLength(1);
    expect(arrived.turnEncounters).toHaveLength(2);
    const choiceId = safeEventChoice(arrived);
    expect(choiceId).toBeTruthy();
    const continued = act(arrived, { type: 'choose', choiceId: choiceId! });
    expect(continued.pending?.kind).not.toBe('station');
  });

  it('serializes both glitch landings without repeating the first tile or its weather', () => {
    let first: GameState | null = null;
    let choiceId: string | null = null;
    for (let seed = 1; seed < 500; seed++) {
      const state = createGame(config);
      state.weatherId = 'glitch';
      state.weatherHistory = ['glitch'];
      state.rng = seed;
      state.encounters = [5, 1];
      state.players[0].position = 2;
      state.players[0].previousPosition = 1;
      state.players[0].routeNextPosition = 3;
      state.controlledRoll = 1;
      state.selectedDie = 6;
      const arrived = act(state, { type: 'roll' });
      if (arrived.players[0].position !== 5) continue;
      const choice = safeEventChoice(arrived);
      if (choice) { first = arrived; choiceId = choice; break; }
    }
    expect(first).not.toBeNull();
    expect(first!.pending?.data).toMatchObject({ eventSource: 'encounter', continuation: { nodeId: 5, glitchBacktrack: true } });
    const firstWeather = first!.logs.filter(entry => entry.text.includes('故障')).length;
    const resolved = act(parseSave(JSON.stringify(first)), { type: 'choose', choiceId: choiceId! });
    expect(resolved.pending?.kind).toBe('land');
    expect(resolved.pending?.data?.glitchBacktrack).toBe(true);
    expect(resolved.logs.filter(entry => entry.text.includes('故障')).length).toBe(firstWeather);
    const second = act(resolved, { type: 'choose', choiceId: 'leave' });
    expect(second.players[0].position).toBe(1);
    expect(second.pending?.data).toMatchObject({ eventSource: 'encounter', continuation: { nodeId: 1, glitchBacktrack: false } });
    expect(second.turnEncounters).toHaveLength(2);
    expect(second.encounters).not.toContain(1);
    expect(second.encounters).not.toContain(5);
  });

  it('continues the original tile when an arrest card blocks detention, but stops after real detention', () => {
    const node = MAPS.lake.nodes.find(tile => tile.kind === 'land')!;
    const { event } = safeLanding(node);
    const detentionEvent = EVENTS.find(entry => entry.id === 'patrol')!;
    const detentionChoice = detentionEvent.choices.find(choice => choice.confinement === 'prison')!;
    function prepare(withCard: boolean) {
      const state = structuredClone(event);
      state.pending!.data!.eventId = detentionEvent.id;
      state.pending!.choices = [{ id: detentionChoice.id, label: detentionChoice.label }];
      const publicEntry = state.turnEncounters![0];
      publicEntry.eventId = detentionEvent.id;
      publicEntry.choices = [{ id: detentionChoice.id, label: detentionChoice.label }];
      if (withCard) state.players[0].inventory.push({ uid: 'test-arrest', itemId: 'arrest', quantity: 1, wet: false });
      return state;
    }
    const protectedResult = act(prepare(true), { type: 'choose', choiceId: detentionChoice.id });
    expect(protectedResult.players[0].position).toBe(node.id);
    expect(protectedResult.players[0].confinement).toBeNull();
    expect(protectedResult.pending?.kind).toBe('land');
    expect(protectedResult.players[0].inventory.some(slot => slot.uid === 'test-arrest')).toBe(false);
    const detained = act(prepare(false), { type: 'choose', choiceId: detentionChoice.id });
    expect(detained.players[0].confinement?.kind).toBe('prison');
    expect(detained.pending).toBeNull();
    expect(detained.properties[node.id]).toBeUndefined();
  });

  it('checks event-driven exhaustion before opening the original land prompt', () => {
    const node = MAPS.lake.nodes.find(tile => tile.kind === 'land')!;
    const { event } = safeLanding(node);
    const exhaustingEvent = EVENTS.find(entry => entry.id === 'signal_fee')!;
    const exhaustingChoice = exhaustingEvent.choices.find(choice => choice.id === 'signal_fee_work')!;
    const state = structuredClone(event);
    state.players[0].mood = 5;
    state.pending!.data!.eventId = exhaustingEvent.id;
    state.pending!.choices = [{ id: exhaustingChoice.id, label: exhaustingChoice.label }];
    state.turnEncounters![0].eventId = exhaustingEvent.id;
    state.turnEncounters![0].choices = [{ id: exhaustingChoice.id, label: exhaustingChoice.label }];
    const after = act(state, { type: 'choose', choiceId: exhaustingChoice.id });
    expect(after.players[0].mood).toBe(0);
    expect(after.players[0].confinement?.kind).toBe('sanatorium');
    expect(after.players[0].position).not.toBe(node.id);
    expect(after.pending).toBeNull();
    expect(after.properties[node.id]).toBeUndefined();
  });

  it('applies ordinary landing weather once before the event and does not repeat it on continuation', () => {
    const node = MAPS.lake.nodes.find(tile => tile.kind === 'coin')!;
    for (let seed = 1; seed < 500; seed++) {
      const state = readyAt(node, seed, 'warm');
      const event = act(state, { type: 'roll' });
      if (event.pending?.data?.eventSource !== 'encounter') continue;
      const definition = findEligibleEvent('lake', String(event.pending.data.eventId), 'encounter');
      const choice = definition?.choices.find(option => !option.stamina && !option.mood && !option.confinement
        && !option.status && event.pending?.choices.some(entry => entry.id === option.id && !entry.disabled));
      if (!choice) continue;
      const after = act(event, { type: 'choose', choiceId: choice.id });
      expect(after.players[0].stamina).toBe(event.players[0].stamina);
      expect(after.players[0].mood).toBe(event.players[0].mood);
      expect(after.pending).toBeNull();
      return;
    }
    throw new Error('Could not draw an event without stamina or mood changes');
  });

  it('resumes the original tile after the explicit all-options-unavailable fallback', () => {
    const node = MAPS.lake.nodes.find(tile => tile.kind === 'land')!;
    const { event } = safeLanding(node);
    const unavailable = EVENTS.find(entry => entry.id === 'signal_fee')!;
    const state = structuredClone(event);
    state.players[0].cash = 0;
    state.players[0].stamina = 5;
    state.players[0].mood = 4;
    state.pending!.data!.eventId = unavailable.id;
    state.pending!.choices = [
      ...unavailable.choices.map(choice => ({ id: choice.id, label: choice.label, disabled: true })),
      { id: 'skip_unavailable', label: '资源不足，离开' },
    ];
    state.turnEncounters![0].eventId = unavailable.id;
    state.turnEncounters![0].choices = structuredClone(state.pending!.choices);
    const restored = parseSave(JSON.stringify(state));
    expect(act(restored, { type: 'choose', choiceId: unavailable.choices[0].id })).toBe(restored);
    const after = act(restored, { type: 'choose', choiceId: 'skip_unavailable' });
    expect(after.pending?.kind).toBe('land');
    expect(after.pending?.choices.find(choice => choice.id === 'buy')?.disabled).toBe(true);
    expect(after.turnEncounters?.[0]).toMatchObject({ selectedChoiceId: 'skip_unavailable' });
    expect(after.players[0].cash).toBe(0);
    expect(after.players[0].position).toBe(node.id);
  });
});
