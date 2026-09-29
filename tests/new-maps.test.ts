import { describe, expect, it } from 'vitest';
import { act, createGame, runAI } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import type { GameConfig, MapData, MapId } from '../src/game/types';

const playable = (mapId: MapId): GameConfig => ({ mapId, mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 1429,
  players: [
    { name: '旅行家', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '同伴', color: '#277DA8', shape: 'diamond', ai: true, personality: 'cautious' },
  ] });

function distances(map: MapData, start: number): number[] {
  const result = Array<number>(map.nodes.length).fill(Infinity);
  const queue = [start]; result[start] = 0;
  for (let index = 0; index < queue.length; index++) {
    const at = queue[index];
    for (const next of map.nodes[at].neighbors) if (result[next] === Infinity) {
      result[next] = result[at] + 1;
      queue.push(next);
    }
  }
  return result;
}

describe('new map road and economy layouts', () => {
  it('makes the forest a 64-node branchless ring with evenly spaced stations and premium land only', () => {
    const map = MAPS.forest;
    expect(map).toMatchObject({ name: '始初森林', subtitle: '古木环道', width: 1500, height: 1000 });
    expect(map.nodes).toHaveLength(64);
    expect(map.nodes.every(node => node.neighbors.length === 2)).toBe(true);
    expect(map.nodes.filter(node => node.kind === 'station').map(node => node.id)).toEqual([8, 24, 40, 56]);
    expect([0, 20, 32, 52].map(id => [map.nodes[id].x, map.nodes[id].y])).toEqual([[180, 140], [1320, 140], [1320, 860], [180, 860]]);
    const land = map.nodes.filter(node => node.kind === 'land');
    expect(land).toHaveLength(29);
    expect(land.every(node => node.price! >= 8000 && node.price! <= 16_000)).toBe(true);
    const byDistrict = new Map<string, number[]>();
    for (const node of land) byDistrict.set(node.district!, [...(byDistrict.get(node.district!) ?? []), node.price!]);
    expect([...byDistrict.keys()].sort()).toEqual(['冠庭', '初芽', '眠根', '蕨溪'].sort());
    expect(Math.max(...byDistrict.get('初芽')!)).toBeLessThan(Math.min(...byDistrict.get('眠根')!));
    for (const node of map.nodes.filter(node => ['power', 'water', 'telecom'].includes(node.kind))) {
      expect(node.price).toBeLessThanOrEqual(4000);
    }
  });

  it('links two 34-node sand rings by two roads and keeps facilities separated from entrances', () => {
    const map = MAPS.starSands;
    expect(map).toMatchObject({ name: '星砂荒滩', subtitle: '双环沙洲', width: 1500, height: 1000 });
    expect(map.nodes).toHaveLength(76);
    expect(map.nodes.filter(node => node.neighbors.length === 3).map(node => node.id)).toEqual([10, 14, 61, 65]);
    expect(map.nodes.slice(68).every(node => node.neighbors.length === 2 && node.kind !== 'land')).toBe(true);
    const stations = map.nodes.filter(node => node.kind === 'station').map(node => node.id);
    expect(stations).toEqual([4, 21, 38, 55]);
    const routes = stations.map(id => distances(map, id));
    expect(Math.min(...stations.flatMap((id, index) => stations.slice(index + 1).map(other => routes[index][other])))).toBeGreaterThanOrEqual(12);
    expect(Math.max(...map.nodes.map(node => Math.min(...routes.map(route => route[node.id]))))).toBeLessThanOrEqual(11);
    const functions = new Set(['station', 'shop', 'exchange', 'casino', 'power', 'water', 'telecom', 'hospital', 'prison', 'sanatorium', 'parking']);
    const facilities = map.nodes.filter(node => functions.has(node.kind));
    expect(facilities).toHaveLength(22);
    expect([10, 14, 61, 65].every(id => !functions.has(map.nodes[id].kind))).toBe(true);
    expect(facilities.every(node => node.neighbors.every(next => !functions.has(map.nodes[next].kind)))).toBe(true);
    for (const kind of ['shop', 'exchange', 'casino', 'power', 'water', 'telecom']) {
      const expected = kind === 'shop' ? 4 : 2;
      expect(map.nodes.filter(node => node.kind === kind)).toHaveLength(expected);
    }
    expect(map.nodes.filter(node => ['hospital', 'prison', 'sanatorium', 'parking'].includes(node.kind))).toHaveLength(4);
    const land = map.nodes.filter(node => node.kind === 'land');
    expect(land).toHaveLength(34);
    expect(land.every(node => node.price! >= 800 && node.price! <= 4000)).toBe(true);
  });

  it.each(['forest', 'starSands'] as const)('round-trips a playable %s save and rejects an invalid node', mapId => {
    const state = createGame(playable(mapId));
    const restored = parseSave(JSON.stringify(state));
    expect(restored.config.mapId).toBe(mapId);
    expect(restored.players.map(player => player.position)).toEqual([0, 0]);
    const invalid = structuredClone(state); invalid.players[0].position = MAPS[mapId].nodes.length;
    expect(() => parseSave(JSON.stringify(invalid))).toThrow('玩家');
    const rolled = act(restored, { type: 'roll' });
    expect(rolled).not.toBe(restored);
    expect(MAPS[mapId].nodes[rolled.players[0].position]).toBeDefined();
  });

  it.each(['forest', 'starSands'] as const)('keeps a four-season %s AI game moving without a stuck decision', mapId => {
    const config = playable(mapId);
    config.players[0].ai = true;
    config.mode = 'pve'; // Run the pure AI loop directly; no save validator is involved.
    let state = createGame(config);
    for (let actions = 0; actions < 12_000 && state.phase !== 'gameover'; actions++) {
      if (state.seasonReport) state = act(state, { type: 'dismissSeason' });
      else {
        const next = runAI(state);
        expect(next, `${mapId} day ${state.day}, phase ${state.phase}`).not.toBe(state);
        state = next;
      }
      expect(state.players.every(player => Number.isFinite(player.cash) && player.stamina >= 0 && player.mood >= 0)).toBe(true);
    }
    expect(state.phase).toBe('gameover');
    expect(state.day).toBeLessThanOrEqual(337);
  });
});
