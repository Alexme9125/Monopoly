import { describe, expect, it } from 'vitest';
import { ITEMS } from '../src/game/data';
import { act, createGame } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import type { GameConfig, GameState, MapId } from '../src/game/types';

function game(mapId: MapId): GameState {
  const config: GameConfig = { mapId, mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 1217, players: [
    { name: '甲', color: '#ff0000', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '乙', color: '#0000ff', shape: 'diamond', ai: true, personality: 'cautious' },
  ] };
  return createGame(config);
}

function savedStation(mapId: MapId, oldOrigin: number, oldDestinations: number[]): GameState {
  const state = game(mapId);
  state.players[0].position = oldOrigin;
  state.phase = 'decision';
  state.pending = { kind: 'station', title: '旧站', body: '旧乘车提示',
    choices: [...oldDestinations.map(id => ({ id: `station:${id}`, label: `旧站${id}` })), { id: 'leave', label: '离开' }],
    data: { nodeId: oldOrigin } };
  return state;
}

describe('pre-relocation facility saves', () => {
  it('refreshes destinations at an unchanged station and disables travel when cash is short', () => {
    for (const [mapId, origin, oldDestinations] of [
      ['lake', 13, [4, 33, 57]],
      ['valley', 54, [20, 22, 24, 44]],
      ['sundered', 16, [14, 47, 70, 78]],
      ['sundered', 78, [14, 16, 47, 70]],
    ] as const) {
      const old = savedStation(mapId, origin, [...oldDestinations]);
      const resumed = parseSave(JSON.stringify(old));
      const expected = MAPS[mapId].nodes.filter(node => node.kind === 'station' && node.id !== origin).map(node => `station:${node.id}`);
      expect(resumed.pending?.choices.map(choice => choice.id)).toEqual([...expected, 'leave']);
      expect(resumed.pending?.title).toBe(MAPS[mapId].nodes[origin].name);
      const travelled = act(resumed, { type: 'choose', choiceId: expected[0] });
      expect(travelled.players[0].position).toBe(Number(expected[0].slice(8)));
      expect(travelled.players[0].cash).toBe(resumed.players[0].cash - 100);

      old.players[0].cash = 50;
      const poor = parseSave(JSON.stringify(old));
      expect(poor.pending?.choices.filter(choice => choice.id.startsWith('station:')).every(choice => choice.disabled)).toBe(true);
      expect(act(poor, { type: 'choose', choiceId: expected[0] })).toBe(poor);
      const left = act(poor, { type: 'choose', choiceId: 'leave' });
      expect(left.pending).toBeNull();
      expect(left.players[0].cash).toBe(50);
    }
  });

  it('offers a free exit from retired stations without accepting stale destinations', () => {
    for (const [mapId, origin, oldDestinations] of [
      ['lake', 4, [13, 33, 57]],
      ['coast', 68, [43, 44, 54]],
      ['coast', 43, [14, 33, 45, 59]],
      ['coast', 44, [14, 33, 45, 59]],
      ['valley', 22, [20, 24, 44, 54]],
      ['sundered', 14, [16, 47, 70, 78]],
      ['sundered', 47, [14, 16, 70, 78]],
      ['sundered', 70, [14, 16, 47, 78]],
    ] as const) {
      const old = savedStation(mapId, origin, [...oldDestinations]);
      delete old.mapLayoutVersion;
      expect(MAPS[mapId].nodes[origin].kind).not.toBe('station');
      const resumed = parseSave(JSON.stringify(old));
      expect(resumed.pending).toMatchObject({ kind: 'station', title: '车站已迁址', data: { nodeId: origin },
        choices: [{ id: 'leave', label: '车站已迁址，结束本次乘车' }] });
      expect(act(resumed, { type: 'choose', choiceId: `station:${oldDestinations[0]}` })).toBe(resumed);
      const left = act(resumed, { type: 'choose', choiceId: 'leave' });
      expect(left.pending).toBeNull();
      expect(left.phase).toBe('end');
      expect(left.players[0].position).toBe(origin);
      expect(left.players[0].cash).toBe(resumed.players[0].cash);
      expect(parseSave(JSON.stringify(resumed)).pending).toEqual(resumed.pending);
    }
  });

  it('keeps a retired station’s glitch continuation when the player exits for free', () => {
    const old = savedStation('lake', 4, [13, 33, 57]);
    old.weatherId = 'glitch';
    old.players[0].previousPosition = 3;
    old.pending!.data!.glitchBacktrack = true;
    const resumed = parseSave(JSON.stringify(old));
    expect(resumed.pending?.data?.glitchBacktrack).toBe(true);
    const left = act(resumed, { type: 'choose', choiceId: 'leave' });
    expect(left).not.toBe(resumed);
    expect(left.movement?.segments).toMatchObject([{ kind: 'weather', label: '错位 · 后退 4 格' }]);
    expect(left.movement?.path).toHaveLength(5);
    expect(left.players[0].cash).toBe(resumed.players[0].cash);
    expect(left.phase).not.toBe('decision');
  });

  it('moves only patients at the two former sanatoria and preserves their remaining turns', () => {
    for (const [mapId, oldWard, newWard] of [['lake', 47, 4], ['coast', 33, 68]] as const) {
      const old = game(mapId);
      old.players[1].position = oldWard;
      old.players[1].previousPosition = MAPS[mapId].nodes[oldWard].neighbors[0];
      old.players[1].routeNextPosition = MAPS[mapId].nodes[oldWard].neighbors[1];
      old.players[1].confinement = { kind: 'sanatorium', remaining: 2 };
      const cash = old.players[1].cash;
      const resumed = parseSave(JSON.stringify(old));
      expect(MAPS[mapId].nodes[newWard].kind).toBe('sanatorium');
      expect(resumed.players[1]).toMatchObject({ position: newWard, previousPosition: null, routeNextPosition: null,
        confinement: { kind: 'sanatorium', remaining: 2 }, cash });
      expect(parseSave(JSON.stringify(resumed)).players[1]).toEqual(resumed.players[1]);
      old.players[1].confinement = null;
      expect(parseSave(JSON.stringify(old)).players[1].position).toBe(oldWard);
    }
  });

  it('retains old shop and casino visit snapshots at swapped nodes', () => {
    const visits = [
      { mapId: 'coast', nodeId: 14, kind: 'shop', data: { itemIds: ['snack'], shopPurchases: { snack: 1 } }, choices: [{ id: 'buy:snack', label: '购买' }, { id: 'leave', label: '离开' }] },
      { mapId: 'lake', nodeId: 77, kind: 'casino', data: { played: true }, choices: [{ id: 'slots', label: '老虎机' }, { id: 'leave', label: '离开' }] },
      { mapId: 'sundered', nodeId: 6, kind: 'shop', data: { itemIds: ['snack'], shopPurchases: {} }, choices: [{ id: 'buy:snack', label: '购买' }, { id: 'leave', label: '离开' }] },
    ] as const;
    for (const visit of visits) {
      const old = game(visit.mapId);
      old.players[0].position = visit.nodeId;
      old.phase = 'decision';
      old.pending = { kind: visit.kind, title: '旧设施', body: '访问快照', choices: [...visit.choices], data: visit.data };
      const resumed = parseSave(JSON.stringify(old));
      expect(resumed.pending).toEqual(old.pending);
      expect(MAPS[visit.mapId].nodes[visit.nodeId].kind).not.toBe(visit.kind);
      expect(act(resumed, { type: 'choose', choiceId: 'leave' }).pending).toBeNull();
      if (visit.mapId === 'sundered') {
        const bought = act(resumed, { type: 'choose', choiceId: 'buy:snack' });
        expect(bought).not.toBe(resumed);
        expect(bought.players[0].cash).toBe(resumed.players[0].cash - ITEMS.snack.price);
        expect(bought.players[0].inventory.filter(slot => slot.itemId === 'snack').length).toBeGreaterThan(resumed.players[0].inventory.filter(slot => slot.itemId === 'snack').length);
        expect(act(bought, { type: 'choose', choiceId: 'leave' }).pending).toBeNull();
      }
    }
  });

  it('turns relocated exchange visits into free-exit information', () => {
    for (const [mapId, oldExchange] of [['lake', 26], ['valley', 12], ['sundered', 31], ['sundered', 60]] as const) {
      const old = game(mapId);
      old.players[0].position = oldExchange;
      old.players[0].previousPosition = MAPS[mapId].nodes[oldExchange].neighbors[0];
      old.players[0].holdings[old.stocks[0].id] = 3;
      old.weatherId = 'glitch';
      old.phase = 'decision';
      old.pending = { kind: 'exchange', title: '旧证券交易所', body: '原交易提示',
        choices: [{ id: 'leave', label: '离开' }], data: { glitchBacktrack: true, traded: true } };
      const resumed = parseSave(JSON.stringify(old));
      expect(resumed.pending).toMatchObject({ kind: 'info', title: '交易所已迁址',
        data: { glitchBacktrack: true, traded: true }, choices: [{ id: 'leave', label: '离开' }] });
      expect(resumed.pending?.body).toContain('现金和股票持仓保持不变');
      expect(resumed.players[0].cash).toBe(old.players[0].cash);
      expect(resumed.players[0].holdings).toEqual(old.players[0].holdings);
      expect(act(resumed, { type: 'stockTrade', stockId: old.stocks[0].id, quantity: 1 })).toBe(resumed);
      const left = act(resumed, { type: 'choose', choiceId: 'leave' });
      expect(left).not.toBe(resumed);
      expect(left.movement?.segments?.some(segment => segment.kind === 'weather')).toBe(true);
      expect(left.players[0].holdings).toEqual(resumed.players[0].holdings);
      if (left.phase === 'decision') expect(left.pending).not.toBeNull();
      const again = parseSave(JSON.stringify(resumed));
      expect(again.pending).toEqual(resumed.pending);
    }
    const live = game('lake');
    live.phase = 'decision'; live.players[0].position = 70;
    live.pending = { kind: 'exchange', title: '证券交易所', body: '交易', choices: [{ id: 'leave', label: '离开' }] };
    expect(MAPS.lake.nodes[70].kind).toBe('exchange');
    expect(parseSave(JSON.stringify(live)).pending).toEqual(live.pending);
  });
});
