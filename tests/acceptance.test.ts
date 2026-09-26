import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import WebSocket from 'ws';
import { describe, expect, it } from 'vitest';
import { AI_PRESETS, EVENTS, ITEMS, JOURNEY_REWARD_CASH, JOURNEY_REWARD_STEPS, WEATHERS } from '../src/game/data';
import { act, createGame, getNetWorth, quoteStockTrade, runAI } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import { createRoomServer } from '../server/index';
import type { GameConfig, GameState, MapId } from '../src/game/types';

const maps: MapId[] = ['lake', 'coast', 'valley'];
const allMaps: MapId[] = [...maps, 'sundered'];
const aiPlayers = AI_PRESETS.slice(0, 4);

function game(mapId: MapId = 'lake', seed = 7, weatherMode: GameConfig['weatherMode'] = 'standard', seasons = 4): GameState {
  return createGame({ mapId, mode: 'pvp', players: aiPlayers, seasons, weatherMode, seed });
}

function validState(state: GameState) {
  const nodes = MAPS[state.config.mapId].nodes;
  expect(Number.isSafeInteger(state.day)).toBe(true);
  expect(state.currentPlayerIndex).toBeGreaterThanOrEqual(0);
  expect(state.currentPlayerIndex).toBeLessThan(state.players.length);
  expect(WEATHERS[state.weatherId]).toBeDefined();
  if (state.weatherHistory) {
    expect(state.weatherHistory.length).toBeLessThanOrEqual(2);
    for (const id of state.weatherHistory) expect(WEATHERS[id]).toBeDefined();
  }
  expect(state.logs.length).toBeLessThanOrEqual(150);
  if (state.phase === 'decision') expect(state.pending).not.toBeNull();
  for (const player of state.players) {
    expect(nodes[player.position]).toBeDefined();
    expect(Number.isFinite(player.cash)).toBe(true);
    expect(Number.isFinite(player.stamina)).toBe(true);
    expect(Number.isFinite(player.mood)).toBe(true);
    expect(player.travelProgress).toBeGreaterThanOrEqual(0);
    expect(player.travelProgress).toBeLessThan(JOURNEY_REWARD_STEPS);
    expect(player.inventory.length).toBeLessThanOrEqual(player.capacity);
    expect(Number.isFinite(getNetWorth(state, player.id))).toBe(true);
    for (const slot of player.inventory) {
      expect(ITEMS[slot.itemId]).toBeDefined();
      expect(Number.isSafeInteger(slot.quantity)).toBe(true);
      expect(slot.quantity).toBeGreaterThan(0);
    }
    for (const count of Object.values(player.holdings)) expect(Number.isSafeInteger(count)).toBe(true);
  }
  for (const property of Object.values(state.properties)) {
    expect(state.players.some(p => p.id === property.ownerId)).toBe(true);
    expect(Number.isSafeInteger(property.level)).toBe(true);
    expect(property.level).toBeGreaterThanOrEqual(0);
    expect(property.level).toBeLessThanOrEqual(4);
  }
  for (const stock of state.stocks) {
    expect(Number.isFinite(stock.price)).toBe(true);
    expect(stock.price).toBeGreaterThanOrEqual(1);
    expect(stock.history.length).toBeGreaterThan(0);
  }
}

describe('four-season acceptance simulation', () => {
  it('preserves the seeded AI baselines on the original three maps', () => {
    const seeds = [7, 126, 20260925];
    for (const mapId of maps) for (const [index, seed] of seeds.entries()) {
      let state = game(mapId, seed, index === 1 ? 'challenge' : 'standard');
      let steps = 0;
      let previousDay = state.day;
      while (state.phase !== 'gameover' && steps++ < 6000) {
        validState(state);
        if (state.seasonReport) state = act(state, { type: 'dismissSeason' });
        const next = runAI(state);
        expect(next, `${mapId}/${seed} stuck on day ${state.day}, phase ${state.phase}, prompt ${state.pending?.kind}`).not.toBe(state);
        expect(next.day).toBeGreaterThanOrEqual(previousDay);
        expect(next.day).toBeLessThanOrEqual(previousDay + 1);
        previousDay = next.day;
        state = next;
      }
      validState(state);
      expect(steps, `${mapId}/${seed} exceeded action limit`).toBeLessThan(6000);
      expect(state.phase).toBe('gameover');
      expect(state.day, `${mapId}/${seed} ended before all four seasons`).toBeGreaterThanOrEqual(85);
      expect(state.winnerId).toBeTruthy();
    }
  }, 60_000);

  it.each([
    [7, 'standard'],
    [126, 'challenge'],
  ] as const)('completes a four-season mountain game with seed %i in %s weather', (seed, weatherMode) => {
    const play = (audit: boolean) => {
      let state = game('sundered', seed, weatherMode);
      let steps = 0;
      while (state.phase !== 'gameover' && steps++ < 6000) {
        if (audit) validState(state);
        if (state.seasonReport) state = act(state, { type: 'dismissSeason' });
        const next = runAI(state);
        expect(next, `sundered/${seed} stuck on day ${state.day}, phase ${state.phase}, prompt ${state.pending?.kind}`).not.toBe(state);
        expect(next.day - state.day).toBeGreaterThanOrEqual(0);
        expect(next.day - state.day).toBeLessThanOrEqual(1);
        state = next;
      }
      if (audit) validState(state);
      expect(steps).toBeLessThan(6000);
      expect(state.phase).toBe('gameover');
      expect(state.day).toBeGreaterThanOrEqual(85);
      expect(state.winnerId).toBeTruthy();
      return state;
    };
    const result = play(true);
    expect(play(false)).toEqual(result);
  }, 60_000);
});

describe('journey reward acceptance', () => {
  it('imports a near-milestone save and awards one normal step before an empty landing', () => {
    const state = parseSave(readFileSync(new URL('./fixtures/qa-journey.json', import.meta.url), 'utf8'));
    expect(state.config.mode).toBe('pve');
    expect(state).toMatchObject({ phase: 'ready', pending: null, weatherId: 'clear', currentPlayerIndex: 0 });
    expect(state.players[0]).toMatchObject({ cash: 100_000, travelProgress: JOURNEY_REWARD_STEPS - 1 });
    const next = act(state, { type: 'roll' });
    expect(next.movement).toMatchObject({ roll: 1, segments: [{ kind: 'normal', path: [2, 3] }] });
    expect(MAPS.lake.nodes[next.players[0].position].kind).toBe('empty');
    expect(next.pending).toBeNull();
    expect(next.players[0].travelProgress).toBe(0);
    expect(next.players[0].cash).toBe(100_000 + JOURNEY_REWARD_CASH);
    expect((next.notices ?? []).filter(notice => notice.kind === 'milestone')).toMatchObject([
      { playerId: 'p1', nodeId: 3, amount: JOURNEY_REWARD_CASH },
    ]);
    expect(next.movement?.effects?.some(effect => effect.kind === 'cash' && effect.label.includes('行进奖励'))).toBe(true);
  });

  it('gives an AI the same single reward through runAI and ignores a weather slide', () => {
    const state = game('lake', 20260925);
    state.weatherId = 'snow';
    state.weatherHistory = ['snow'];
    state.players[0].position = 2;
    state.players[0].previousPosition = 1;
    state.players[0].travelProgress = JOURNEY_REWARD_STEPS - 1;
    state.players[0].cash = 100_000;
    state.encounters = state.encounters.filter(id => id !== 3 && id !== 4);
    state.rng = 1972;
    const next = runAI(state);
    expect(next).not.toBe(state);
    expect(next.movement?.roll).toBe(1);
    expect(next.movement?.segments?.map(segment => segment.kind)).toEqual(['normal', 'weather']);
    expect(next.movement?.segments?.[0].path).toEqual([2, 3]);
    expect(next.players[0].travelProgress).toBe(0);
    expect(next.players[0].cash).toBe(100_000 + JOURNEY_REWARD_CASH);
    expect((next.notices ?? []).filter(notice => notice.kind === 'milestone')).toHaveLength(1);
    expect(next.notices?.find(notice => notice.kind === 'milestone')).toMatchObject({ amount: JOURNEY_REWARD_CASH, playerId: 'p1', nodeId: 3 });
    const afterTurn = runAI(next);
    expect((afterTurn.notices ?? []).filter(notice => notice.kind === 'milestone')).toHaveLength(1);
  });
});

describe('road direction and station travel acceptance', () => {
  it('offers every forward exit while excluding the incoming edge on all four maps', () => {
    const seeds = [1972, 1975, 1978]; // D6=1; the following route draw spans thirds of the RNG range.
    for (const mapId of allMaps) {
      const map = MAPS[mapId];
      const base = game(mapId, 20260925);
      base.weatherId = 'clear';
      base.weatherHistory = ['clear'];
      base.encounters = [];
      for (const node of map.nodes) {
        expect([2, 3, 4], `${mapId} node ${node.id} has an unsupported degree`).toContain(node.neighbors.length);
        for (const inbound of node.neighbors) {
          const exits = new Set<number>();
          for (const rng of seeds) {
            const state = { ...base, rng, players: base.players.map((player, index) => index ? player
              : { ...player, position: node.id, previousPosition: inbound, routeNextPosition: null }) };
            const rolled = act(state, { type: 'roll' });
            expect(rolled.movement?.roll, `${mapId} ${node.id} seed ${rng}`).toBe(1);
            const path = rolled.movement?.segments?.[0].path;
            expect(path?.[0]).toBe(node.id);
            expect(path).toHaveLength(2);
            expect(path?.[1], `${mapId} ${inbound}→${node.id} doubled back`).not.toBe(inbound);
            exits.add(path![1]);
          }
          expect([...exits].sort((a, b) => a - b), `${mapId} ${inbound}→${node.id} route choices`)
            .toEqual(node.neighbors.filter(id => id !== inbound).sort((a, b) => a - b));
        }
      }
    }
  });

  it.each([
    ['lake', 3], ['lake', 18], ['lake', 60], ['coast', 5], ['coast', 0], ['valley', 10], ['valley', 53],
  ] as const)('preserves the incoming direction at %s node %i across a full turn change', (mapId, targetId) => {
    const map = MAPS[mapId];
    const target = map.nodes[targetId];
    const inbound = target.neighbors.find(id => map.nodes[id].neighbors.length === 2)!;
    const behind = map.nodes[inbound].neighbors.find(id => id !== targetId)!;
    const state = game(mapId, 20260925);
    state.weatherId = 'clear'; state.weatherHistory = ['clear']; state.encounters = [];
    state.players[0].position = inbound; state.players[0].previousPosition = behind; state.rng = 1972;
    let entered = act(state, { type: 'roll' });
    expect(entered.movement?.segments?.[0].path).toEqual([inbound, targetId]);
    expect(entered.players[0].previousPosition).toBe(inbound);
    if (entered.pending) {
      expect(entered.pending.choices.some(choice => choice.id === 'leave')).toBe(true);
      entered = act(entered, { type: 'choose', choiceId: 'leave' });
    }
    expect(entered.phase).toBe('end');
    let next = act(entered, { type: 'endTurn' });
    next = act(next, { type: 'endTurn' });
    next = act(next, { type: 'endTurn' });
    next = act(next, { type: 'endTurn' });
    expect(next.currentPlayerIndex).toBe(0);
    expect(next.players[0].previousPosition).toBe(inbound);
    next.weatherId = 'clear'; next.weatherHistory = ['clear']; next.rng = 1975;
    const resumed = act(next, { type: 'roll' });
    expect(resumed.movement?.segments?.[0].path[0]).toBe(targetId);
    expect(resumed.movement?.segments?.[0].path[1]).not.toBe(inbound);
    expect(target.neighbors).toContain(resumed.movement?.segments?.[0].path[1]);
  });

  it('resumes the forward road after a sand retreat on the next human turn', () => {
    const state = parseSave(readFileSync(new URL('./fixtures/qa-motion-back.json', import.meta.url), 'utf8'));
    const retreated = act(state, { type: 'roll' });
    expect(retreated.movement?.segments?.map(segment => segment.path)).toEqual([[8, 9, 10, 11, 12], [12, 11, 10]]);
    expect(retreated.players[0]).toMatchObject({ position: 10, previousPosition: 11, routeNextPosition: 11 });
    let next = act(retreated, { type: 'endTurn' });
    next = act(next, { type: 'endTurn' });
    expect(next.currentPlayerIndex).toBe(0);
    next.weatherId = 'clear'; next.weatherHistory = ['clear']; next.rng = 1972;
    const resumed = act(next, { type: 'roll' });
    expect(resumed.movement?.segments?.[0].path).toEqual([10, 11]);
    expect(resumed.players[0].routeNextPosition).toBeNull();
  });

  it.each([['lake', 13], ['coast', 14], ['valley', 12]] as const)('lets a %s station visit cancel for free or travel to a listed station for 100 PM', (mapId, expectedOrigin) => {
    const state = parseSave(readFileSync(new URL(`./fixtures/qa-station-${mapId}.json`, import.meta.url), 'utf8'));
    const map = MAPS[mapId];
    const origin = state.players[0].position;
    const cash = state.players[0].cash;
    const stations = state.pending?.choices.filter(choice => choice.id.startsWith('station:')) ?? [];
    expect(state).toMatchObject({ phase: 'decision', currentPlayerIndex: 0 });
    expect(state.pending?.kind).toBe('station');
    expect(origin).toBe(expectedOrigin);
    expect(map.nodes[origin].kind).toBe('station');
    expect(stations.length).toBeGreaterThanOrEqual(2);
    expect(stations.every(choice => !choice.disabled)).toBe(true);
    const nonStation = map.nodes.find(node => node.kind !== 'station')!;
    expect(act(state, { type: 'choose', choiceId: `station:${nonStation.id}` })).toBe(state);
    expect(act(state, { type: 'choose', choiceId: `station:${origin}` })).toBe(state);
    const cancelled = act(state, { type: 'choose', choiceId: 'leave' });
    expect(cancelled.pending).toBeNull();
    expect(cancelled.phase).toBe('end');
    expect(cancelled.players[0].position).toBe(origin);
    expect(cancelled.players[0].cash).toBe(cash);
    const destination = Number(stations[0].id.slice(8));
    const travelled = act(state, { type: 'choose', choiceId: stations[0].id });
    expect(travelled.pending).toBeNull();
    expect(travelled.phase).toBe('end');
    expect(travelled.players[0]).toMatchObject({ position: destination, cash: cash - 100,
      previousPosition: null, routeNextPosition: null });
    expect(travelled.movement).toMatchObject({ dice: false, path: [origin, destination],
      segments: [{ kind: 'transfer', path: [origin, destination] }] });
    expect(parseSave(JSON.stringify(travelled)).players[0].position).toBe(destination);
  });

  it('offers mapped mountain stations, a free cancel, and a persisted 100 PM transfer', () => {
    const map = MAPS.sundered;
    const station = map.nodes.find(node => node.kind === 'station'
      && node.neighbors.some(id => map.nodes[id].neighbors.length === 2))!;
    expect(station).toBeDefined();
    const approach = map.nodes[station.neighbors.find(id => map.nodes[id].neighbors.length === 2)!];
    const inbound = approach.neighbors.find(id => id !== station.id)!;
    const state = createGame({ mapId: 'sundered', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 1972,
      players: [{ ...AI_PRESETS[0], ai: false }, AI_PRESETS[1]] });
    state.weatherId = 'clear'; state.weatherHistory = ['clear']; state.encounters = [];
    state.players[0].position = approach.id;
    state.players[0].previousPosition = inbound;
    state.rng = 1972;
    const arrived = act(state, { type: 'roll' });
    expect(arrived.players[0].position).toBe(station.id);
    expect(arrived.pending?.kind).toBe('station');
    const destinations = arrived.pending?.choices.filter(choice => choice.id.startsWith('station:')) ?? [];
    expect(destinations.length).toBeGreaterThanOrEqual(2);
    expect(destinations.every(choice => map.nodes[Number(choice.id.slice(8))]?.kind === 'station')).toBe(true);
    const cash = arrived.players[0].cash;
    const cancelled = act(arrived, { type: 'choose', choiceId: 'leave' });
    expect(cancelled.players[0]).toMatchObject({ position: station.id, cash });
    const selected = destinations.find(choice => !choice.disabled)!;
    expect(selected).toBeDefined();
    const destination = Number(selected.id.slice(8));
    const transferred = act(arrived, { type: 'choose', choiceId: selected.id });
    expect(transferred.players[0]).toMatchObject({ position: destination, cash: cash - 100 });
    expect(transferred.movement?.segments).toMatchObject([{ kind: 'transfer', path: [station.id, destination] }]);
    expect(parseSave(JSON.stringify(transferred)).players[0].position).toBe(destination);
  });

  it('loads mountain station QA saves with a real landing and a free exit at low cash', () => {
    const full = parseSave(readFileSync(new URL('./fixtures/qa-station-sundered.json', import.meta.url), 'utf8'));
    const poor = parseSave(readFileSync(new URL('./fixtures/qa-station-sundered-low.json', import.meta.url), 'utf8'));
    for (const state of [full, poor]) {
      expect(state).toMatchObject({ phase: 'decision', currentPlayerIndex: 0, pending: { kind: 'station', data: { nodeId: 6 } } });
      expect(state.players[0].position).toBe(6);
      expect(state.pending?.choices.filter(choice => choice.id.startsWith('station:')).map(choice => choice.id))
        .toEqual(['station:16', 'station:31', 'station:60', 'station:78']);
      const left = act(state, { type: 'choose', choiceId: 'leave' });
      expect(left.players[0].position).toBe(6);
      expect(left.players[0].cash).toBe(state.players[0].cash);
    }
    const destination = full.pending!.choices.find(choice => choice.id.startsWith('station:'))!;
    expect(destination.disabled).toBe(false);
    expect(act(full, { type: 'choose', choiceId: destination.id }).players[0]).toMatchObject({ position: 16, cash: full.players[0].cash - 100 });
    expect(poor.players[0].cash).toBe(50);
    expect(poor.pending!.choices.filter(choice => choice.id.startsWith('station:')).every(choice => choice.disabled)).toBe(true);
    expect(act(poor, { type: 'choose', choiceId: 'station:16' })).toBe(poor);
  });

  it('disables paid station travel at 50 PM but still lets the player leave for free', () => {
    const state = parseSave(readFileSync(new URL('./fixtures/qa-station-low.json', import.meta.url), 'utf8'));
    const choices = state.pending!.choices.filter(choice => choice.id.startsWith('station:'));
    expect(state.players[0].cash).toBe(50);
    expect(state.players[0].position).toBe(13);
    expect(choices.length).toBeGreaterThan(0);
    expect(choices.every(choice => choice.disabled)).toBe(true);
    expect(act(state, { type: 'choose', choiceId: choices[0].id })).toBe(state);
    const left = act(state, { type: 'choose', choiceId: 'leave' });
    expect(left.players[0].cash).toBe(50);
    expect(left.players[0].position).toBe(state.players[0].position);
  });
});

describe('economy modal state acceptance', () => {
  it.each([
    ['cash', 'slots', 'item', 0, -300],
    ['item', 'slots', 'item', 0, -300],
    ['miss', 'slots', 'item', 0, -300],
    ['roulette-win', 'red', 'win', 1000, 500],
    ['roulette-lose', 'red', 'lose', 0, -500],
  ] as const)('settles the %s casino scenario and keeps its result in the open prompt and save', (name, choiceId, outcome, payout, net) => {
    const state = parseSave(readFileSync(new URL(`./fixtures/qa-casino-${name}.json`, import.meta.url), 'utf8'));
    expect(state).toMatchObject({ phase: 'decision', weatherId: 'clear', currentPlayerIndex: 0 });
    expect(state.pending?.kind).toBe('casino');
    expect(state.pending?.casinoResult).toBeUndefined();
    const beforeCash = state.players[0].cash;
    const beforeQuantity = state.players[0].inventory.reduce((sum, slot) => sum + slot.quantity, 0);
    const settled = act(state, { type: 'choose', choiceId });
    expect(settled).not.toBe(state);
    expect(settled.pending?.kind).toBe('casino');
    expect(settled.pending?.casinoResult).toMatchObject({ outcome, payout, net });
    const itemId = settled.pending?.casinoResult?.itemId;
    if (choiceId === 'slots') expect(itemId).toEqual(expect.any(String));
    else expect(itemId).toBeUndefined();
    expect(settled.players[0].cash - beforeCash).toBe(net);
    expect(settled.pending?.choices.some(choice => choice.id === 'leave')).toBe(true);
    expect(settled.players[0].inventory.reduce((sum, slot) => sum + slot.quantity, 0)).toBe(beforeQuantity + (itemId ? 1 : 0));
    const resumed = parseSave(JSON.stringify(settled));
    expect(resumed.pending?.casinoResult).toEqual(settled.pending?.casinoResult);
    expect(resumed.pending?.kind).toBe('casino');
    const left = act(resumed, { type: 'choose', choiceId: 'leave' });
    expect(left.pending).toBeNull();
    expect(left.phase).toBe('end');
  });

  it('rejects a full-bag slot play before spending or drawing', () => {
    const state = parseSave(readFileSync(new URL('./fixtures/qa-casino-full.json', import.meta.url), 'utf8'));
    expect(state.players[0].inventory).toHaveLength(state.players[0].capacity);
    const original = JSON.stringify(state);
    expect(act(state, { type: 'choose', choiceId: 'slots' })).toBe(state);
    expect(JSON.stringify(state)).toBe(original);
    expect(act(state, { type: 'choose', choiceId: 'leave' }).pending).toBeNull();
  });

  it('replaces the previous casino result when the player tries another game', () => {
    const state = parseSave(readFileSync(new URL('./fixtures/qa-casino-cash.json', import.meta.url), 'utf8'));
    const first = act(state, { type: 'choose', choiceId: 'slots' });
    const second = act(first, { type: 'choose', choiceId: 'black' });
    expect(second.pending?.kind).toBe('casino');
    expect(second.pending?.casinoResult?.game).toBe('roulette');
    expect(second.pending?.casinoResult?.id).toBeGreaterThan(first.pending!.casinoResult!.id);
    expect(second.players[0].cash - first.players[0].cash).toBe(second.pending!.casinoResult!.net);
  });

  it('keeps an exchange decision open across buying and selling 12 shares with exact fees', () => {
    const state = parseSave(readFileSync(new URL('./fixtures/qa-exchange.json', import.meta.url), 'utf8'));
    expect(state.pending?.kind).toBe('exchange');
    const stock = state.stocks[0];
    expect(stock).toMatchObject({ id: 'aurora', price: 94 });
    expect(state.players[0].holdings[stock.id]).toBe(20);
    const buyQuote = quoteStockTrade(stock.price, 12);
    const bought = act(state, { type: 'stockTrade', stockId: stock.id, quantity: 12 });
    expect(bought.pending?.kind).toBe('exchange');
    expect(bought.players[0].holdings[stock.id]).toBe(32);
    expect(bought.players[0].cash).toBe(state.players[0].cash - buyQuote.total);
    const sellQuote = quoteStockTrade(stock.price, -12);
    const sold = act(bought, { type: 'stockTrade', stockId: stock.id, quantity: -12 });
    expect(sold.pending?.kind).toBe('exchange');
    expect(sold.players[0].holdings[stock.id]).toBe(20);
    expect(sold.players[0].cash).toBe(state.players[0].cash - buyQuote.fee - sellQuote.fee);
    expect(parseSave(JSON.stringify(sold)).pending?.kind).toBe('exchange');
  });
});

describe('weather and property acceptance', () => {
  it('draws only in-season weather through real end-turn transitions over two years', () => {
    let state = game('lake', 20260925, 'challenge', 0);
    expect(WEATHERS[state.weatherId].seasons).toContain(0);
    for (let expectedDay = 2; expectedDay <= 169; expectedDay++) {
      for (let seat = 0; seat < state.players.length; seat++) {
        const next = act(state, { type: 'endTurn' });
        expect(next).not.toBe(state);
        state = next;
      }
      if (state.seasonReport) state = act(state, { type: 'dismissSeason' });
      expect(state.day).toBe(expectedDay);
      const season = Math.floor((state.day - 1) / 21) % 4;
      expect(WEATHERS[state.weatherId].seasons, `day ${expectedDay}: ${state.weatherId}`).toContain(season);
      if (state.day < 22) expect(WEATHERS[state.weatherId].family).not.toBe('disaster');
    }
  });

  it('settles all 26 weather conditions without invalid state', () => {
    expect(Object.keys(WEATHERS)).toHaveLength(26);
    for (const [index, id] of Object.keys(WEATHERS).entries()) {
      const state = game(maps[index % maps.length], 150 + index, index % 2 ? 'challenge' : 'standard');
      state.day = 22;
      state.weatherId = id;
      const after = act(state, { type: 'roll' });
      expect(after).not.toBe(state);
      expect(after.movement).not.toBeNull();
      validState(after);
    }
  });

  it('settles glitch at both landing points and applies exactly one extra effect', () => {
    let first: GameState | null = null;
    for (let seed = 1; seed < 1000 && !first; seed++) {
      const state = game('lake', seed);
      state.day = 22;
      state.weatherId = 'glitch';
      state.rng = seed;
      const rolled = act(state, { type: 'roll' });
      if (rolled.pending?.kind === 'land' && rolled.pending.data?.glitchBacktrack === true) first = rolled;
    }
    expect(first).not.toBeNull();
    const before = first!;
    const firstPathLength = before.movement!.path.length;
    expect(firstPathLength).toBe(before.movement!.roll + 3);
    const after = act(before, { type: 'choose', choiceId: 'leave' });
    expect(after).not.toBe(before);
    expect(after.movement!.path).toHaveLength(5);
    expect(after.movement!.path[0]).toBe(before.movement!.path.at(-1));
    expect(after.movement!.dice).toBe(false);
    expect(after.movement!.segments?.[0].kind).toBe('weather');
    expect(after.players[0].position).toBe(after.movement!.path.at(-1));
    expect(after.logs.filter(log => log.text.includes('故障天气的'))).toHaveLength(1);
    validState(after);
  });

  it('protects level-four landmarks from attacks, sale and event damage', () => {
    const node = MAPS.lake.nodes.find(n => n.kind === 'land')!;
    const state = game();
    state.players[0].inventory.push({ uid: 'demolish-test', itemId: 'demolish', quantity: 1, wet: false });
    state.players[0].inventory.push({ uid: 'acquire-test', itemId: 'acquire', quantity: 1, wet: false });
    state.properties[node.id] = { ownerId: 'p2', level: 4, mortgaged: false };
    expect(act(state, { type: 'useItem', itemUid: 'demolish-test', nodeId: node.id })).toBe(state);
    expect(act(state, { type: 'useItem', itemUid: 'acquire-test', nodeId: node.id })).toBe(state);
    state.properties[node.id].ownerId = 'p1';
    expect(act(state, { type: 'sellAsset', nodeId: node.id })).toBe(state);

    const event = EVENTS.find(e => e.choices.some(c => c.damageBuilding))!;
    const damage = event.choices.find(c => c.damageBuilding)!;
    state.pending = { kind: 'event', title: event.title, body: event.story, choices: [{ id: damage.id, label: damage.label }], data: { eventId: event.id } };
    state.phase = 'decision';
    const after = act(state, { type: 'choose', choiceId: damage.id });
    expect(after).not.toBe(state);
    expect(after.properties[node.id].level).toBe(4);
  });

  it('keeps the hundred-sided die exclusive to events', () => {
    expect(EVENTS.some(e => e.choices.some(c => c.item === 'dice100'))).toBe(true);
    const first = (seed: number) => (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const pool = Object.keys(ITEMS);
    const targetIndex = pool.indexOf('dice100');
    let trigger = 0;
    while (trigger < 10_000) {
      const one = first(trigger);
      const two = first(one);
      const outcome = Math.floor(one / 0x1_0000_0000 * 10);
      const reward = Math.floor(two / 0x1_0000_0000 * pool.length);
      if (outcome >= 3 && outcome <= 5 && reward === targetIndex) break;
      trigger++;
    }
    expect(trigger).toBeLessThan(10_000);
    const state = game();
    state.rng = trigger;
    state.phase = 'decision';
    state.pending = { kind: 'casino', title: '星港赌场', body: '测试老虎机奖励', choices: [{ id: 'slots', label: '老虎机' }, { id: 'leave', label: '离开' }] };
    const after = act(state, { type: 'choose', choiceId: 'slots' });
    expect(after).not.toBe(state);
    expect(after.players[0].inventory.some(slot => slot.itemId === 'dice100')).toBe(false);
  });

  it('lets debt repayment resume the correct phase and keeps the attacker turn after a bomb', () => {
    const node = MAPS.lake.nodes.find(n => n.kind === 'land')!;
    const debt = game();
    debt.players[0].cash = -500;
    debt.properties[node.id] = { ownerId: 'p1', level: 0, mortgaged: false };
    const prompted = act(debt, { type: 'rest' });
    expect(prompted.pending?.kind).toBe('debt');
    expect(prompted.players[0].cash).toBeLessThan(0);
    const mortgaged = act(prompted, { type: 'choose', choiceId: `mortgage:${node.id}` });
    expect(mortgaged.players[0].cash).toBeGreaterThanOrEqual(0);
    expect(mortgaged.pending).toBeNull();
    expect(mortgaged.phase).toBe('end');

    const battle = game();
    battle.players[0].inventory.push({ uid: 'bomb-test', itemId: 'bomb', quantity: 1, wet: false });
    let trigger = 0;
    while (((Math.imul(trigger, 1664525) + 1013904223) >>> 0) / 0x1_0000_0000 >= 0.1) trigger++;
    battle.rng = trigger;
    const attacked = act(battle, { type: 'useItem', itemUid: 'bomb-test', targetId: 'p2' });
    expect(attacked).not.toBe(battle);
    expect(attacked.players[1].confinement?.kind).toBe('hospital');
    expect(attacked.players[0].confinement?.kind).toBe('prison');
    expect(attacked.currentPlayerIndex).toBe(0);
    expect(attacked.phase).toBe('end');
    const following = act(attacked, { type: 'endTurn' });
    expect(following.currentPlayerIndex).toBe(1);
    expect(following.players[1].confinement).not.toBeNull();
    let cursor = following;
    const attackerTurns: number[] = [];
    const victimTurns: number[] = [cursor.players[1].confinement?.remaining ?? 0];
    for (let i = 0; i < 12; i++) {
      cursor = act(cursor, { type: 'endTurn' });
      if (cursor.currentPlayerIndex === 0) attackerTurns.push(cursor.players[0].confinement?.remaining ?? 0);
      if (cursor.currentPlayerIndex === 1) victimTurns.push(cursor.players[1].confinement?.remaining ?? 0);
    }
    expect(attackerTurns).toEqual([2, 1, 0]);
    expect(victimTurns).toEqual([2, 1, 0, 0]);
  });
});

function nextMessage(socket: WebSocket): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off('message', onMessage); reject(new Error('Timed out waiting for WebSocket reply')); }, 3000);
    const onMessage = (raw: WebSocket.RawData) => { clearTimeout(timer); socket.off('message', onMessage); resolve(JSON.parse(raw.toString())); };
    socket.on('message', onMessage);
  });
}

class Inbox {
  readonly messages: any[] = [];
  constructor(readonly socket: WebSocket) { socket.on('message', raw => this.messages.push(JSON.parse(raw.toString()))); }
  async wait(predicate: (message: any) => boolean, since = 0, timeout = 3000): Promise<any> {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      const match = this.messages.slice(since).find(predicate);
      if (match) return match;
      await new Promise(resolveDelay => setTimeout(resolveDelay, 5));
    }
    throw new Error('Timed out waiting for room update');
  }
  async sendAndWait(message: unknown, predicate: (reply: any) => boolean): Promise<any> {
    const since = this.messages.length;
    this.socket.send(JSON.stringify(message));
    return this.wait(predicate, since);
  }
}

async function connectedInbox(port: number, clientId = randomUUID()): Promise<Inbox> {
  const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const inbox = new Inbox(socket);
  await new Promise<void>((resolveOpen, rejectOpen) => { socket.once('open', resolveOpen); socket.once('error', rejectOpen); });
  await inbox.sendAndWait({ type: 'hello', clientId }, message => message.type === 'hello');
  return inbox;
}

describe('LAN server acceptance', () => {
  it('broadcasts authoritative normal travel progress and preserves it on reconnect', async () => {
    const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
    const guestId = randomUUID();
    let host: Inbox | null = null;
    let guest: Inbox | null = null;
    let replacement: Inbox | null = null;
    try {
      host = await connectedInbox(server.port);
      guest = await connectedInbox(server.port, guestId);
      const created = await host.sendAndWait({ type: 'create', profile: { name: '房主', color: '#336699', shape: 'circle', ai: false, personality: 'balanced' },
        config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed: 1972 } }, message => message.type === 'room' && message.room.members.length === 1);
      const code = created.room.code;
      await guest.sendAndWait({ type: 'join', code, profile: { name: '访客', color: '#bb8866', shape: 'diamond', ai: false, personality: 'balanced' } },
        message => message.type === 'room' && message.room.members.length === 2);
      await guest.sendAndWait({ type: 'ready', ready: true }, message => message.type === 'room' && message.room.members[1].ready);
      const started = await host.sendAndWait({ type: 'start' }, message => message.type === 'room' && message.room.started);
      expect(started.room.state.weatherId).toBe('clear');
      const initialCash = started.room.state.players[0].cash;
      const hostSince = host.messages.length, guestSince = guest.messages.length;
      // Extra client-supplied progress and cash must never become server state.
      host.socket.send(JSON.stringify({ type: 'action', action: { type: 'roll', travelProgress: 71, cash: 999_999 } }));
      const hostRoll = await host.wait(message => message.type === 'room' && message.room.state?.movement?.dice === true, hostSince);
      const guestRoll = await guest.wait(message => message.type === 'room' && message.room.state?.movement?.dice === true, guestSince);
      const state = hostRoll.room.state;
      const normalSteps = state.movement.segments[0].path.length - 1;
      expect(normalSteps).toBeGreaterThan(0);
      expect(state.players[0].travelProgress).toBe(normalSteps);
      expect(state.players[0].cash).toBe(initialCash);
      expect(state.notices.filter((notice: { kind: string }) => notice.kind === 'milestone')).toHaveLength(0);
      expect(guestRoll.room.state.players.map((player: { travelProgress: number; cash: number }) => [player.travelProgress, player.cash]))
        .toEqual(state.players.map((player: { travelProgress: number; cash: number }) => [player.travelProgress, player.cash]));
      expect(guestRoll.room.state.notices).toEqual(state.notices);
      const closed = new Promise<void>(resolveClosed => guest!.socket.once('close', () => resolveClosed()));
      guest.socket.close();
      await closed;
      replacement = await connectedInbox(server.port, guestId);
      const restored = await replacement.sendAndWait({ type: 'reconnect', code },
        message => message.type === 'room' && message.room.youPlayerId === 'p2' && message.room.members[1].connected);
      expect(restored.room.state.players[0].travelProgress).toBe(normalSteps);
      expect(restored.room.state.players[0].cash).toBe(initialCash);
      expect(restored.room.state.notices).toEqual(state.notices);
    } finally {
      host?.socket.close();
      guest?.socket.close();
      replacement?.socket.close();
      await server.close();
    }
  }, 10_000);

  it('pauses at season reports and lets either online human dismiss them', async () => {
    const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
    let host: Inbox | null = null;
    let guest: Inbox | null = null;
    try {
      host = await connectedInbox(server.port);
      guest = await connectedInbox(server.port);
      const created = await host.sendAndWait({ type: 'create', profile: { name: '房主', color: '#336699', shape: 'circle', ai: false, personality: 'balanced' }, config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed: 1 } }, message => message.type === 'room');
      await guest.sendAndWait({ type: 'join', code: created.room.code, profile: { name: '访客', color: '#bb8866', shape: 'diamond', ai: false, personality: 'balanced' } }, message => message.type === 'room' && message.room.members.length === 2);
      await guest.sendAndWait({ type: 'ready', ready: true }, message => message.type === 'room' && message.room.members[1].ready);
      await host.sendAndWait({ type: 'start' }, message => message.type === 'room' && message.room.started);
      for (let day = 1; day <= 21; day++) {
        await host.sendAndWait({ type: 'action', action: { type: 'rest' } }, message => message.type === 'room' && message.room.state?.phase === 'end' && message.room.state.currentPlayerIndex === 0);
        await host.sendAndWait({ type: 'action', action: { type: 'endTurn' } }, message => message.type === 'room' && message.room.state?.currentPlayerIndex === 1);
        await guest.sendAndWait({ type: 'action', action: { type: 'rest' } }, message => message.type === 'room' && message.room.state?.phase === 'end' && message.room.state.currentPlayerIndex === 1);
        const advanced = await guest.sendAndWait({ type: 'action', action: { type: 'endTurn' } }, message => message.type === 'room' && message.room.state?.day === day + 1 && message.room.state.currentPlayerIndex === 0);
        if (day === 21) expect(advanced.room.state.seasonReport?.season).toBe(1);
      }
      const blocked = await guest.sendAndWait({ type: 'action', action: { type: 'roll' } }, message => message.type === 'error');
      expect(blocked.message).toContain('季节结算');
      const dismissed = await guest.sendAndWait({ type: 'action', action: { type: 'dismissSeason' } }, message => message.type === 'room' && message.room.state?.seasonReport === null);
      expect(dismissed.room.state.currentPlayerIndex).toBe(0);
      expect(dismissed.room.youPlayerId).toBe('p2');
    } finally {
      host?.socket.close();
      guest?.socket.close();
      await server.close();
    }
  }, 20_000);

  it('serves the built app over a host IP and accepts the current season options', async () => {
    const server = await createRoomServer({ port: 0, host: '0.0.0.0' });
    let socket: WebSocket | null = null;
    try {
      const lan = Object.values(networkInterfaces()).flat().find(address => address?.family === 'IPv4' && !address.internal)?.address ?? '127.0.0.1';
      if (existsSync(new URL('../dist/index.html', import.meta.url))) {
        const response = await fetch(`http://${lan}:${server.port}/`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/html');
        expect(await response.text()).toContain('id="root"');
      }
      socket = new WebSocket(`ws://127.0.0.1:${server.port}/ws`);
      await new Promise<void>((resolveOpen, rejectOpen) => { socket!.once('open', resolveOpen); socket!.once('error', rejectOpen); });
      socket.send(JSON.stringify({ type: 'hello', clientId: randomUUID() }));
      expect((await nextMessage(socket)).type).toBe('hello');
      for (const seasons of [8, 16]) {
        socket.send(JSON.stringify({ type: 'create', profile: { name: '验收玩家', color: '#336699', shape: 'circle', ai: false, personality: 'balanced' }, config: { mapId: 'lake', seasons, weatherMode: 'standard', seed: 1 } }));
        const reply = await nextMessage(socket);
        expect(reply.type, reply.message).toBe('room');
        expect(reply.room.config.seasons).toBe(seasons);
        socket.send(JSON.stringify({ type: 'leave' }));
        expect((await nextMessage(socket)).type).toBe('left');
      }

      const progress: any[] = [];
      socket.on('message', raw => progress.push(JSON.parse(raw.toString())));
      const waitFor = async (predicate: (message: any) => boolean, timeout = 10_000) => {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          const match = progress.find(predicate);
          if (match) return match;
          await new Promise(resolveDelay => setTimeout(resolveDelay, 25));
        }
        throw new Error('Timed out waiting for authoritative AI progress');
      };
      socket.send(JSON.stringify({ type: 'create', profile: { name: '验收玩家', color: '#336699', shape: 'circle', ai: false, personality: 'balanced' }, config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed: 1 } }));
      await waitFor(m => m.type === 'room' && m.room?.members.length === 1);
      socket.send(JSON.stringify({ type: 'addBot', profile: { name: '自动旅伴', color: '#77aa88', shape: 'hexagon', ai: true, personality: 'balanced' } }));
      await waitFor(m => m.type === 'room' && m.room?.members.length === 2);
      socket.send(JSON.stringify({ type: 'start' }));
      await waitFor(m => m.type === 'room' && m.room?.started);
      socket.send(JSON.stringify({ type: 'action', action: { type: 'rest' } }));
      await waitFor(m => m.type === 'room' && m.room?.state?.phase === 'end');
      socket.send(JSON.stringify({ type: 'action', action: { type: 'endTurn' } }));
      await waitFor(m => m.type === 'room' && m.room?.state?.currentPlayerIndex === 1);
      const returned = await waitFor(m => m.type === 'room' && m.room?.state?.day >= 2 && m.room?.state?.currentPlayerIndex === 0);
      expect(returned.room.state.players[1].ai).toBe(true);
      expect(returned.room.state.sequence).toBeGreaterThan(0);
    } finally {
      socket?.close();
      await server.close();
    }
  }, 10_000);
});
