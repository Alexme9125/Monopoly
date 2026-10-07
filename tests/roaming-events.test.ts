import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EVENTS, ITEMS } from '../src/game/data';
import { act, createGame } from '../src/game/engine';
import { findEligibleEvent, getEventPool, getEventWeights } from '../src/game/eventPool';
import { MAPS } from '../src/game/maps';
import { REGIONAL_EVENTS } from '../src/game/regionalEvents';
import { ROAMING_EVENTS } from '../src/game/roamingEvents';
import { parseSave } from '../src/game/storage';
import type { EventDef, GameConfig, GameState, MapId } from '../src/game/types';

const mapIds = Object.keys(MAPS) as MapId[];
const config = (mapId: MapId, seed = 1978): GameConfig => ({
  mapId, mode: 'pve', seasons: 4, weatherMode: 'standard', seed,
  players: [
    { name: '甲', color: '#ff0000', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '乙', color: '#0000ff', shape: 'diamond', ai: true, personality: 'cautious' },
  ],
});

function awaitingEncounter(event: EventDef, mapId: MapId = event.mapId!): GameState {
  const state = createGame(config(mapId));
  state.weatherId = 'clear';
  state.encounters = [];
  state.players[0].position = MAPS[mapId].nodes.find(node => node.kind === 'empty')!.id;
  state.players[0].cash = 100_000;
  state.players[0].stamina = 50;
  state.players[0].mood = 50;
  state.players[0].capacity = 100;
  state.phase = 'decision';
  const encounterId = `event-${++state.sequence}`;
  const choices = event.choices.map(choice => ({ id: choice.id, label: choice.label, description: choice.description }));
  state.turnEncounters = [{ id: encounterId, playerId: 'p1', day: state.day,
    nodeId: state.players[0].position, eventId: event.id, title: event.title, story: event.story,
    tone: event.tone, choices }];
  state.pending = { kind: 'event', title: event.title, body: event.story,
    choices, data: { eventId: event.id, eventSource: 'encounter', turnEncounterId: encounterId,
      continuation: { nodeId: state.players[0].position, skipStation: false, glitchBacktrack: false } } };
  return state;
}

function itemQuantity(state: GameState, itemId: string): number {
  return state.players[0].inventory.filter(slot => slot.itemId === itemId)
    .reduce((total, slot) => total + slot.quantity, 0);
}

function landOnEvent(mapId: MapId, source: 'tile' | 'encounter', seed: number): GameState {
  const target = MAPS[mapId].nodes.find(node => node.kind === (source === 'tile' ? 'event' : 'empty'))!;
  const state = createGame(config(mapId, seed));
  state.weatherId = 'clear';
  state.encounters = source === 'encounter' ? [target.id] : [];
  state.rng = Math.imul(seed, 2654435761) >>> 0;
  state.controlledRoll = 1;
  state.players[0].position = target.neighbors[0];
  state.players[0].previousPosition = null;
  state.players[0].routeNextPosition = target.id;
  return act(state, { type: 'roll' });
}

describe('source-isolated roaming events', () => {
  it('matches the approved 150-event catalogue without changing the 48 universal or 100 regional entries', () => {
    expect(ROAMING_EVENTS).toEqual(JSON.parse(readFileSync(new URL('../docs/roaming-events-design.json', import.meta.url), 'utf8')));
    expect(EVENTS).toHaveLength(48);
    expect(REGIONAL_EVENTS).toHaveLength(100);
    expect(ROAMING_EVENTS).toHaveLength(150);
    expect(ROAMING_EVENTS.reduce((sum, event) => sum + event.choices.length, 0)).toBe(300);
    expect(new Set([...EVENTS, ...REGIONAL_EVENTS, ...ROAMING_EVENTS].map(event => event.id)).size).toBe(298);
    expect(new Set(ROAMING_EVENTS.flatMap(event => event.choices.map(choice => choice.id))).size).toBe(300);

    for (const mapId of mapIds) {
      const local = ROAMING_EVENTS.filter(event => event.mapId === mapId);
      expect(local).toHaveLength(15);
      expect(local.filter(event => event.rarity === 'common')).toHaveLength(8);
      expect(local.filter(event => event.rarity === 'uncommon')).toHaveLength(5);
      expect(local.filter(event => event.rarity === 'rare')).toHaveLength(2);
      expect(local.every(event => event.encounterOnly === true && event.dlc === true)).toBe(true);
      expect(getEventPool(mapId)).toHaveLength(58);
      expect(getEventPool(mapId, 'tile')).toHaveLength(58);
      expect(getEventPool(mapId, 'encounter')).toHaveLength(73);
      for (const event of local) {
        expect(findEligibleEvent(mapId, event.id)).toBe(event);
        expect(findEligibleEvent(mapId, event.id, 'encounter')).toBe(event);
        expect(findEligibleEvent(mapId, event.id, 'tile')).toBeUndefined();
        for (const other of mapIds.filter(id => id !== mapId)) expect(findEligibleEvent(other, event.id)).toBeUndefined();
        for (const choice of event.choices) if (choice.item) expect(ITEMS[choice.item], `${event.id}/${choice.id}`).toBeDefined();
      }
    }
  });

  it('keeps the 60/40 split and applies rarity and luck weights within each source catalogue', () => {
    for (const mapId of mapIds) for (const source of ['tile', 'encounter'] as const) {
      const weighted = getEventWeights(mapId, undefined, source);
      const sum = (entries: typeof weighted) => entries.reduce((total, entry) => total + entry.weight, 0);
      expect(weighted).toHaveLength(source === 'tile' ? 58 : 73);
      expect(sum(weighted)).toBeCloseTo(1, 12);
      expect(sum(weighted.filter(entry => !entry.event.mapId))).toBeCloseTo(0.6, 12);
      const counts = source === 'tile' ? { common: 5, uncommon: 3, rare: 2 }
        : { common: 13, uncommon: 8, rare: 4 };
      for (const [rarity, share] of [['common', 0.28], ['uncommon', 0.10], ['rare', 0.02]] as const) {
        const local = weighted.filter(entry => entry.event.rarity === rarity);
        expect(local).toHaveLength(counts[rarity]);
        expect(sum(local)).toBeCloseTo(share, 12);
        for (const entry of local) expect(entry.weight).toBeCloseTo(share / counts[rarity], 12);
      }
      const lucky = getEventWeights(mapId, 'luck', source);
      const unlucky = getEventWeights(mapId, 'unluck', source);
      weighted.forEach((entry, index) => {
        expect(lucky[index].event).toBe(entry.event);
        expect(unlucky[index].event).toBe(entry.event);
        expect(lucky[index].weight / entry.weight).toBeCloseTo(entry.event.tone === 'good' ? 3 : entry.event.tone === 'bad' ? 0.5 : 1);
        expect(unlucky[index].weight / entry.weight).toBeCloseTo(entry.event.tone === 'bad' ? 3 : entry.event.tone === 'good' ? 0.5 : 1);
      });
    }
  });

  it('draws only the permitted source catalogue on real fixed and temporary landings', () => {
    for (const mapId of mapIds) {
      let sawRoaming = false;
      for (let seed = 1; seed <= 80; seed++) for (const source of ['tile', 'encounter'] as const) {
        const landed = landOnEvent(mapId, source, seed);
        expect(landed.pending?.kind, `${mapId}/${source}/${seed}`).toBe('event');
        expect(landed.pending?.data?.eventSource).toBe(source);
        const eventId = String(landed.pending?.data?.eventId ?? '');
        expect(findEligibleEvent(mapId, eventId, source), `${mapId}/${source}/${seed}`).toBeDefined();
        if (source === 'tile') expect(ROAMING_EVENTS.some(event => event.id === eventId)).toBe(false);
        else if (ROAMING_EVENTS.some(event => event.id === eventId)) sawRoaming = true;
      }
      expect(sawRoaming, `${mapId} temporary draws reach its own events`).toBe(true);
    }
  });

  it('rejects roaming-event prompts from another map or a fixed event tile', () => {
    for (const sourceMap of mapIds) {
      const event = ROAMING_EVENTS.find(entry => entry.mapId === sourceMap)!;
      for (const targetMap of mapIds.filter(id => id !== sourceMap)) {
        const forged = awaitingEncounter(event, targetMap);
        expect(act(forged, { type: 'choose', choiceId: event.choices[0].id }), `${event.id} on ${targetMap}`).toBe(forged);
        expect(() => parseSave(JSON.stringify(forged)), `${event.id} save on ${targetMap}`).toThrow();
      }
      const tile = createGame(config(sourceMap));
      tile.players[0].position = MAPS[sourceMap].nodes.find(node => node.kind === 'event')!.id;
      tile.phase = 'decision';
      tile.pending = { kind: 'event', title: event.title, body: event.story,
        choices: event.choices.map(choice => ({ id: choice.id, label: choice.label })),
        data: { eventId: event.id, eventSource: 'tile' } };
      expect(act(tile, { type: 'choose', choiceId: event.choices[0].id })).toBe(tile);
      expect(() => parseSave(JSON.stringify(tile))).toThrow();
    }
  });

  it('settles all 300 declared choices through act, including items, status, confinement and building damage', () => {
    for (const event of ROAMING_EVENTS) for (const option of event.choices) {
      const before = awaitingEncounter(event);
      const land = MAPS[event.mapId!].nodes.find(node => node.kind === 'land')!;
      if (option.damageBuilding) {
        before.properties[land.id] = { ownerId: 'p1', level: 1, mortgaged: false };
        delete before.availablePropertyLevels?.[land.id];
      }
      const after = act(before, { type: 'choose', choiceId: option.id });
      expect(after, `${event.id}/${option.id}`).not.toBe(before);
      expect(after.players[0].cash, `${event.id}/${option.id} cash`).toBe(before.players[0].cash + (option.cash ?? 0));
      expect(after.players[0].stamina, `${event.id}/${option.id} stamina`)
        .toBe(Math.min(100, Math.max(0, before.players[0].stamina + (option.stamina ?? 0))));
      expect(after.players[0].mood, `${event.id}/${option.id} mood`)
        .toBe(Math.min(100, Math.max(0, before.players[0].mood + (option.mood ?? 0))));
      if (option.item) expect(itemQuantity(after, option.item), `${event.id}/${option.id} item`)
        .toBe(itemQuantity(before, option.item) + 1);
      if (option.status) {
        const [statusId, duration] = option.status.split(':');
        expect(after.players[0].statuses.find(status => status.id === statusId)?.remaining)
          .toBe(Number(duration) || 3);
      }
      if (option.confinement) expect(after.players[0].confinement?.kind).toBe(option.confinement);
      if (option.damageBuilding) expect(after.properties[land.id]?.level).toBe(0);
      expect(after.turnEncounters?.at(-1)).toMatchObject({ eventId: event.id, selectedChoiceId: option.id });
      expect(after.notices?.at(-1)).toMatchObject({ kind: 'event', title: event.title });
      expect(parseSave(JSON.stringify(after)).turnEncounters).toEqual(after.turnEncounters);
    }
  });

  it('handles every full-bag item choice and respects landmark damage limits on both new maps', () => {
    let itemOptions = 0;
    for (const event of ROAMING_EVENTS) for (const option of event.choices) if (option.item) {
      itemOptions++;
      const full = awaitingEncounter(event);
      full.players[0].capacity = full.players[0].inventory.length;
      const alreadyStacked = ITEMS[option.item].stackable
        && full.players[0].inventory.some(slot => slot.itemId === option.item);
      const after = act(full, { type: 'choose', choiceId: option.id });
      if (alreadyStacked) expect(itemQuantity(after, option.item), option.id)
        .toBe(itemQuantity(full, option.item) + 1);
      else expect(after, `${option.id} cannot add to a full bag`).toBe(full);
    }
    expect(itemOptions).toBeGreaterThan(0);

    for (const [mapId, safeLevel, damagedLevel] of [['hushedValley', 5, 4], ['grandCity', 4, 3]] as const) {
      const event = ROAMING_EVENTS.find(entry => entry.mapId === mapId && entry.choices.some(choice => choice.damageBuilding))!;
      const choice = event.choices.find(entry => entry.damageBuilding)!;
      const land = MAPS[mapId].nodes.find(node => node.kind === 'land')!;
      for (const [level, expected] of [[safeLevel, safeLevel], [damagedLevel, damagedLevel - 1]]) {
        const before = awaitingEncounter(event);
        before.properties[land.id] = { ownerId: 'p1', level, mortgaged: false };
        delete before.availablePropertyLevels?.[land.id];
        const after = act(before, { type: 'choose', choiceId: choice.id });
        expect(after.properties[land.id].level, `${mapId} level ${level}`).toBe(expected);
        expect(parseSave(JSON.stringify(after)).properties[land.id].level).toBe(expected);
      }
    }
  });
});
