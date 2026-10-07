import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { EVENTS, ITEMS } from '../src/game/data';
import { act, createGame, runAI } from '../src/game/engine';
import { findEligibleEvent, getEventPool, getEventWeights } from '../src/game/eventPool';
import { MAPS } from '../src/game/maps';
import { REGIONAL_EVENTS } from '../src/game/regionalEvents';
import { parseSave } from '../src/game/storage';
import type { EventDef, GameConfig, GameState, MapId } from '../src/game/types';

const mapIds = ['lake', 'coast', 'valley', 'sundered', 'forest', 'starSands', 'ashCanyon', 'peachHaven', 'hushedValley', 'grandCity'] as MapId[];
const establishedMapIds = ['lake', 'coast', 'valley', 'sundered'] as MapId[];
const config = (mapId: MapId, ai = false): GameConfig => ({
  mapId, mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 1978,
  players: [
    { name: '甲', color: '#ff0000', shape: 'circle', ai, personality: 'balanced' },
    { name: '乙', color: '#0000ff', shape: 'diamond', ai: !ai, personality: 'cautious' },
  ],
});

function awaitingEvent(mapId: MapId, event: EventDef, ai = false): GameState {
  const state = createGame(config(mapId, ai));
  state.weatherId = 'clear';
  state.encounters = [];
  state.players[0].position = MAPS[mapId].nodes.find(node => node.kind === 'event')!.id;
  state.players[0].cash = 100_000;
  state.players[0].stamina = 70;
  state.players[0].mood = 70;
  state.players[0].capacity = 100;
  state.phase = 'decision';
  state.pending = { kind: 'event', title: event.title, body: event.story,
    choices: event.choices.map(choice => ({ id: choice.id, label: choice.label, description: choice.description })),
    data: { eventId: event.id } };
  return state;
}

function itemQuantity(state: GameState, itemId: string): number {
  return state.players[0].inventory.filter(slot => slot.itemId === itemId)
    .reduce((total, slot) => total + slot.quantity, 0);
}

describe('map-exclusive regional encounters', () => {
  it('keeps the 48 universal events and exposes exactly 5/3/2 regional events on all ten maps', () => {
    expect(REGIONAL_EVENTS).toEqual(JSON.parse(readFileSync(new URL('../docs/regional-events-design.json', import.meta.url), 'utf8')));
    expect(REGIONAL_EVENTS.slice(80)).toEqual(JSON.parse(readFileSync(new URL('../docs/HUSHED_CITY_EVENTS.json', import.meta.url), 'utf8')));
    expect(EVENTS).toHaveLength(48);
    expect(REGIONAL_EVENTS).toHaveLength(100);
    expect(new Set([...EVENTS, ...REGIONAL_EVENTS].map(event => event.id)).size).toBe(148);
    // Preserve all original 80 regional entries exactly, including earlier DLC additions.
    expect(createHash('sha256').update(JSON.stringify(REGIONAL_EVENTS.slice(0, 40))).digest('hex'))
      .toBe('958d5b438e1dfdcf9d57e92b4d4587b1a193001df811a76140254efc981b77ad');
    expect(createHash('sha256').update(JSON.stringify(REGIONAL_EVENTS.slice(0, 60))).digest('hex'))
      .toBe('e31a05c3fb8958e0ca57099e61ea2cc76f90fceeba168b7ebf9ed946f61d09f3');
    expect(createHash('sha256').update(JSON.stringify(REGIONAL_EVENTS.slice(0, 80))).digest('hex'))
      .toBe('dea39fbf91ef11c28dbdba66aeef6763f5ec203c108853b41bc99331973e58f4');
    expect(REGIONAL_EVENTS.slice(0, 40).every(event => establishedMapIds.includes(event.mapId!))).toBe(true);
    expect(REGIONAL_EVENTS.slice(40, 60).every(event => event.mapId === 'forest' || event.mapId === 'starSands')).toBe(true);
    expect(REGIONAL_EVENTS.slice(60, 80).every(event => event.mapId === 'ashCanyon' || event.mapId === 'peachHaven')).toBe(true);
    expect(REGIONAL_EVENTS.slice(80, 90).every(event => event.mapId === 'hushedValley')).toBe(true);
    expect(REGIONAL_EVENTS.slice(90).every(event => event.mapId === 'grandCity')).toBe(true);
    for (const mapId of mapIds) {
      const regional = REGIONAL_EVENTS.filter(event => event.mapId === mapId);
      expect(regional).toHaveLength(10);
      expect(regional.filter(event => event.rarity === 'common')).toHaveLength(5);
      expect(regional.filter(event => event.rarity === 'uncommon')).toHaveLength(3);
      expect(regional.filter(event => event.rarity === 'rare')).toHaveLength(2);
      expect(regional.every(event => event.dlc === true)).toBe(true);
      expect(getEventPool(mapId)).toHaveLength(58);
      for (const event of regional) {
        expect(findEligibleEvent(mapId, event.id)).toBe(event);
        for (const other of mapIds.filter(id => id !== mapId)) expect(findEligibleEvent(other, event.id)).toBeUndefined();
      }
      for (const event of EVENTS) expect(findEligibleEvent(mapId, event.id)).toBe(event);
    }
  });

  it('assigns 60% to universal events and 40% to the local 70/25/5 rarity split', () => {
    for (const mapId of mapIds) {
      const weighted = getEventWeights(mapId);
      const total = (items: typeof weighted) => items.reduce((sum, entry) => sum + entry.weight, 0);
      expect(total(weighted)).toBeCloseTo(1, 12);
      expect(total(weighted.filter(entry => !entry.event.dlc))).toBeCloseTo(0.6, 12);
      for (const [rarity, share] of [['common', 0.28], ['uncommon', 0.1], ['rare', 0.02]] as const) {
        const candidates = weighted.filter(entry => entry.event.rarity === rarity);
        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates.every(entry => entry.weight > 0)).toBe(true);
        expect(total(candidates)).toBeCloseTo(share, 12);
      }
      const lucky = getEventWeights(mapId, 'luck');
      const unlucky = getEventWeights(mapId, 'unluck');
      for (let i = 0; i < weighted.length; i++) {
        const tone = weighted[i].event.tone;
        expect(lucky[i].weight / weighted[i].weight).toBeCloseTo(tone === 'good' ? 3 : tone === 'bad' ? 0.5 : 1);
        expect(unlucky[i].weight / weighted[i].weight).toBeCloseTo(tone === 'bad' ? 3 : tone === 'good' ? 0.5 : 1);
      }
    }
  });

  it('draws each local rarity in actual seeded landing rolls', () => {
    const mapId = 'lake';
    const eventNode = MAPS[mapId].nodes.find(node => node.kind === 'event')!;
    const seen = new Set<string>();
    for (let seed = 1; seed <= 1000 && seen.size < 3; seed++) {
      const state = createGame(config(mapId));
      state.weatherId = 'clear'; state.encounters = [];
      state.rng = Math.imul(seed, 2654435761) >>> 0;
      state.controlledRoll = 1;
      state.players[0].position = eventNode.neighbors[0];
      state.players[0].previousPosition = null;
      state.players[0].routeNextPosition = eventNode.id;
      const landed = act(state, { type: 'roll' });
      const event = findEligibleEvent(mapId, String(landed.pending?.data?.eventId ?? ''));
      if (event?.dlc) seen.add(event.rarity!);
    }
    expect(seen).toEqual(new Set(['common', 'uncommon', 'rare']));
  });

  it('settles every local choice using its declared effects and leaves public results', () => {
    expect(REGIONAL_EVENTS.slice(80).reduce((count, event) => count + event.choices.length, 0)).toBe(40);
    for (const event of REGIONAL_EVENTS) for (const option of event.choices) {
      const before = awaitingEvent(event.mapId!, event);
      const after = act(before, { type: 'choose', choiceId: option.id });
      expect(after, `${event.id}/${option.id}`).not.toBe(before);
      expect(after.players[0].cash, `${event.id}/${option.id} cash`).toBe(before.players[0].cash + (option.cash ?? 0));
      expect(after.players[0].stamina, `${event.id}/${option.id} stamina`).toBe(Math.min(100, Math.max(0, before.players[0].stamina + (option.stamina ?? 0))));
      expect(after.players[0].mood, `${event.id}/${option.id} mood`).toBe(Math.min(100, Math.max(0, before.players[0].mood + (option.mood ?? 0))));
      if (option.item) {
        expect(ITEMS[option.item], `${event.id}/${option.id} item`).toBeDefined();
        expect(itemQuantity(after, option.item)).toBe(itemQuantity(before, option.item) + 1);
      }
      if (option.status) {
        const [statusId, duration] = option.status.split(':');
        expect(after.players[0].statuses.find(status => status.id === statusId)?.remaining,
          `${event.id}/${option.id} status`).toBe(Number(duration) || 3);
      }
      expect(after.turnEncounters?.at(-1)).toMatchObject({ eventId: event.id, selectedChoiceId: option.id });
      expect(after.notices?.at(-1)).toMatchObject({ kind: 'event', title: event.title });
      expect(parseSave(JSON.stringify(after)).turnEncounters).toEqual(after.turnEncounters);
    }
  });

  it('blocks cross-map prompt/encounter forgery while preserving legacy universal prompts', () => {
    const foreign = REGIONAL_EVENTS.find(event => event.mapId === 'coast')!;
    const forged = awaitingEvent('lake', foreign);
    expect(act(forged, { type: 'choose', choiceId: foreign.choices[0].id })).toBe(forged);
    expect(() => parseSave(JSON.stringify(forged))).toThrow('对局');
    const publicForgery = awaitingEvent('lake', EVENTS[0]);
    publicForgery.turnEncounters = [{ id: 'event-1', playerId: 'p1', day: 1, nodeId: publicForgery.players[0].position,
      eventId: foreign.id, title: foreign.title, story: foreign.story, tone: foreign.tone,
      choices: [{ id: foreign.choices[0].id, label: foreign.choices[0].label }] }];
    expect(() => parseSave(JSON.stringify(publicForgery))).toThrow('偶遇');
    for (const event of REGIONAL_EVENTS.slice(80).filter(entry => entry.id.endsWith('cairn_route') || entry.id.endsWith('stair_delivery'))) {
      for (const otherMap of mapIds.filter(id => id !== event.mapId)) {
        const wrongMap = awaitingEvent(otherMap, event);
        expect(act(wrongMap, { type: 'choose', choiceId: event.choices[0].id }), `${event.id} on ${otherMap}`).toBe(wrongMap);
        expect(() => parseSave(JSON.stringify(wrongMap)), `${event.id} save on ${otherMap}`).toThrow('对局');
      }
    }
    const legacy = awaitingEvent('lake', EVENTS[0]);
    delete legacy.turnEncounters;
    const resumed = parseSave(JSON.stringify(legacy));
    expect(resumed.turnEncounters?.at(-1)?.eventId).toBe(EVENTS[0].id);
    expect(act(resumed, { type: 'choose', choiceId: EVENTS[0].choices[0].id })).not.toBe(resumed);
  });

  it('lets riverbank damage lower a fourth floor but protects the fifth-floor landmark', () => {
    const event = REGIONAL_EVENTS.find(entry => entry.id === 'hushedValley_root_anchor')!;
    const land = MAPS.hushedValley.nodes.find(node => node.kind === 'land')!;
    const damageChoice = 'hushedValley_root_anchor_2';
    for (const [level, expected] of [[4, 3], [5, 5]] as const) {
      const before = awaitingEvent('hushedValley', event);
      before.properties[land.id] = { ownerId: 'p1', level, mortgaged: false };
      const after = act(before, { type: 'choose', choiceId: damageChoice });
      expect(after).not.toBe(before);
      expect(after.properties[land.id].level).toBe(expected);
      expect(after.players[0].mood).toBe(before.players[0].mood - 3);
      expect(after.turnEncounters?.at(-1)).toMatchObject({ eventId: event.id, selectedChoiceId: damageChoice });
      expect(after.turnEncounters?.at(-1)?.result).toContain(level === 4 ? '降至3级' : '无受损建筑');
      expect(parseSave(JSON.stringify(after)).properties[land.id].level).toBe(expected);
    }
  });

  it('lets AI resolve local choices and resource-disabled fallback without deadlock', () => {
    for (const event of REGIONAL_EVENTS) {
      const state = awaitingEvent(event.mapId!, event, true);
      const after = runAI(state);
      expect(after, `${event.id} AI`).not.toBe(state);
      expect(after.turnEncounters?.at(-1)?.selectedChoiceId).toBeDefined();
    }
    const blockedEvent = REGIONAL_EVENTS.find(event => event.id === 'lake_meter_dispute')!;
    const full = awaitingEvent('lake', blockedEvent, true);
    full.players[0].cash = 0;
    full.players[0].mood = 0;
    full.pending!.choices = [
      ...blockedEvent.choices.map(choice => ({ id: choice.id, label: choice.label, disabled: true })),
      { id: 'skip_unavailable', label: '资源不足，离开' },
    ];
    const left = runAI(full);
    expect(left).not.toBe(full);
    expect(left.pending).toBeNull();
    expect(left.turnEncounters?.at(-1)?.selectedChoiceId).toBe('skip_unavailable');
  });

  it('does not prefer confinement or building damage merely because those options cost no cash', () => {
    for (const [eventId, harmfulChoice] of [
      ['coast_customs_seal', 'coast_customs_seal_review'],
      ['valley_rockfall_monitor', 'valley_rockfall_monitor_wait'],
      ['lake_cable_alarm', 'lake_cable_alarm_defer'],
    ] as const) {
      const event = REGIONAL_EVENTS.find(entry => entry.id === eventId)!;
      const state = awaitingEvent(event.mapId!, event, true);
      if (eventId === 'lake_cable_alarm') {
        const land = MAPS.lake.nodes.find(node => node.kind === 'land')!;
        state.properties[land.id] = { ownerId: 'p1', level: 1, mortgaged: false };
      }
      const sensible = runAI(state);
      expect(sensible.turnEncounters?.at(-1)?.selectedChoiceId, eventId).not.toBe(harmfulChoice);
      const onlyOption = structuredClone(state);
      onlyOption.pending!.choices = onlyOption.pending!.choices.filter(choice => choice.id === harmfulChoice);
      const forced = runAI(onlyOption);
      expect(forced, `${eventId} sole option`).not.toBe(onlyOption);
      expect(forced.turnEncounters?.at(-1)?.selectedChoiceId).toBe(harmfulChoice);
    }
    const harmless = REGIONAL_EVENTS.find(entry => entry.id === 'lake_cable_alarm')!;
    const noBuilding = awaitingEvent('lake', harmless, true);
    expect(runAI(noBuilding).turnEncounters?.at(-1)?.selectedChoiceId).toBe('lake_cable_alarm_defer');
  });

  it('resolves real low-resource and full-bag regional landings for all 100 events', () => {
    let blockedOptions = 0;
    let fallbackCount = 0;
    for (const mapId of mapIds) {
      const eventNode = MAPS[mapId].nodes.find(node => node.kind === 'event')!;
      const weighted = getEventWeights(mapId);
      const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
      const seeds = new Map<string, number>();
      for (let seed = 1; seed <= 10000 && seeds.size < 10; seed++) {
        const initial = Math.imul(seed, 2654435761) >>> 0;
        const afterRoad = (Math.imul(initial, 1664525) + 1013904223) >>> 0;
        const afterEvent = (Math.imul(afterRoad, 1664525) + 1013904223) >>> 0;
        let ticket = afterEvent / 0x1_0000_0000 * totalWeight;
        const selected = weighted.find(entry => { ticket -= entry.weight; return ticket < 0; })?.event;
        if (selected?.dlc) seeds.set(selected.id, initial);
      }
      expect(seeds.size, `${mapId} all regional events reachable`).toBe(10);
      for (const event of REGIONAL_EVENTS.filter(entry => entry.mapId === mapId)) {
        const state = createGame(config(mapId, true));
        state.weatherId = 'clear'; state.encounters = [];
        state.rng = seeds.get(event.id)!;
        state.controlledRoll = 1;
        state.players[0].position = eventNode.neighbors[0];
        state.players[0].previousPosition = null;
        state.players[0].routeNextPosition = eventNode.id;
        state.players[0].cash = 0;
        state.players[0].stamina = 5;
        state.players[0].mood = 2;
        state.players[0].capacity = state.players[0].inventory.length;
        const landed = act(state, { type: 'roll' });
        expect(landed.pending?.data?.eventId, event.id).toBe(event.id);
        blockedOptions += landed.pending?.choices.filter(choice => choice.disabled).length ?? 0;
        if (landed.pending?.choices.some(choice => choice.id === 'skip_unavailable')) fallbackCount++;
        const after = runAI(landed);
        expect(after, `${event.id} AI low resources`).not.toBe(landed);
        expect(after.pending, `${event.id} should complete`).toBeNull();
        expect(after.turnEncounters?.at(-1)?.selectedChoiceId).toBeDefined();
        if (mapId === 'ashCanyon' || mapId === 'peachHaven') {
          const empty = structuredClone(state);
          empty.players[0].cash = 0;
          empty.players[0].stamina = 3;
          empty.players[0].mood = 2;
          const emptyLanding = act(empty, { type: 'roll' });
          expect(emptyLanding.pending?.data?.eventId, `${event.id} minimal resources`).toBe(event.id);
          expect(emptyLanding.pending?.choices.some(choice => !choice.disabled), `${event.id} escape`).toBe(true);
          if (['ashCanyon_bridge_inspection', 'ashCanyon_ash_in_gear', 'peachHaven_farmyard_detour'].includes(event.id)) {
            expect(emptyLanding.pending?.choices.some(choice => choice.id === 'skip_unavailable'), `${event.id} skip`).toBe(true);
          }
          const escaped = runAI(emptyLanding);
          expect(escaped.pending, `${event.id} minimal-resource resolution`).toBeNull();
          expect(escaped.turnEncounters?.at(-1)?.selectedChoiceId).toBeDefined();
        }
      }
    }
    expect(blockedOptions).toBeGreaterThan(0);
    expect(fallbackCount).toBeGreaterThan(0);
  });
});
