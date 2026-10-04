import { describe, expect, it } from 'vitest';
import { getJourneyRewardSteps } from '../src/game/data';
import { getStartingCash } from '../src/game/economy';
import { MAPS } from '../src/game/maps';
import type { MapData, TileKind } from '../src/game/types';
import { getLotLayout, hasLot, overlap } from '../src/visual/sceneLayout';

const facilities = new Set<TileKind>(['station', 'shop', 'exchange', 'casino', 'power', 'water', 'telecom',
  'hospital', 'prison', 'sanatorium', 'parking']);

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

const cases = [
  { mapId: 'ashCanyon', name: '灰烬峡谷', subtitle: '折阶岩台 · 峡谷横桥', count: 84, land: 37,
    outer: 62, junctions: [26, 57], bridges: [10, 11, 12, 40, 41, 42, 73, 74, 75],
    corners: [[180, 200], [600, 200], [600, 140], [1020, 140], [1020, 260], [1320, 260],
      [1320, 800], [900, 800], [900, 860], [480, 860], [480, 740], [180, 740]],
    stations: [9, 25, 39, 55, 72], shops: [16, 45, 64, 80] },
  { mapId: 'peachHaven', name: '远境桃源', subtitle: '缘溪入境 · 阡陌田园', count: 82, land: 36,
    outer: 66, junctions: [4, 10, 37, 57, 60, 63], bridges: [66, 67, 68, 69, 70, 71],
    corners: [[180, 320], [420, 320], [420, 680], [180, 680], [660, 140], [1320, 140],
      [1320, 860], [660, 860]], stations: [13, 28, 41, 51, 61], shops: [2, 8, 24, 48] },
] as const;

describe.each(cases)('$name road and property layout', ({ mapId, name, subtitle, count, land, outer, junctions, bridges, corners, stations, shops }) => {
  const map = MAPS[mapId];

  it('follows the exact orthogonal 60 px road and stays connected without dead ends', () => {
    expect(map).toMatchObject({ id: mapId, name, subtitle, width: 1500, height: 1000 });
    expect(map.nodes).toHaveLength(count);
    expect(map.nodes[0]).toMatchObject({ kind: 'start', x: corners[0][0], y: corners[0][1] });
    for (const [x, y] of corners) expect(map.nodes.some(node => node.x === x && node.y === y)).toBe(true);
    expect(new Set(map.nodes.map(node => `${node.x},${node.y}`)).size).toBe(count);
    expect(map.nodes.filter(node => node.neighbors.length > 2).map(node => node.id)).toEqual(junctions);
    for (const node of map.nodes) {
      expect(node.neighbors.length).toBeGreaterThanOrEqual(2);
      for (const id of node.neighbors) {
        const next = map.nodes[id];
        expect(next.neighbors).toContain(node.id);
        expect(Math.abs(node.x - next.x) + Math.abs(node.y - next.y)).toBe(60);
        expect(node.x === next.x || node.y === next.y).toBe(true);
      }
    }
    expect(distances(map, 0).every(Number.isFinite)).toBe(true);
  });

  it('places 23 distinct facilities with station coverage and separated matching functions', () => {
    const placed = map.nodes.filter(node => facilities.has(node.kind));
    expect(placed).toHaveLength(23);
    expect(map.nodes.filter(node => node.kind === 'station').map(node => node.id)).toEqual(stations);
    expect(map.nodes.filter(node => node.kind === 'shop').map(node => node.id)).toEqual(shops);
    const counts = Object.fromEntries([...facilities].map(kind => [kind, placed.filter(node => node.kind === kind).length]));
    expect(counts).toEqual({ station: 5, shop: 4, exchange: 2, casino: 2, power: 2, water: 2,
      telecom: 2, hospital: 1, prison: 1, sanatorium: 1, parking: 1 });
    const routes = map.nodes.map(node => distances(map, node.id));
    for (const node of placed) {
      expect(node.neighbors.every(id => !facilities.has(map.nodes[id].kind))).toBe(true);
      expect(junctions).not.toContain(node.id);
      expect(bridges).not.toContain(node.id);
    }
    for (const node of map.nodes) expect(Math.min(...stations.map(id => routes[node.id][id]))).toBeLessThanOrEqual(11);
    for (const [kind, minimum] of [['station', 10], ['shop', 6], ['exchange', 8], ['casino', 8],
      ['power', 8], ['water', 8], ['telecom', 8]] as const) {
      const ids = placed.filter(node => node.kind === kind).map(node => node.id);
      for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
        expect(routes[ids[i]][ids[j]], `${mapId} ${kind} ${ids[i]}/${ids[j]}`).toBeGreaterThanOrEqual(minimum);
      }
    }
    expect(new Set(placed.map(node => node.district)).size).toBe(4);
    expect(placed.filter(node => node.id >= outer).length).toBeGreaterThanOrEqual(4);
  });

  it('quotes ordinary prices and places every building lot without overlap', () => {
    const lands = map.nodes.filter(node => node.kind === 'land');
    expect(lands).toHaveLength(land);
    expect(lands.every(node => node.price! >= 800 && node.price! <= 4000)).toBe(true);
    expect(map.nodes.filter(node => facilities.has(node.kind) && node.price !== undefined)
      .every(node => node.price! >= 800 && node.price! <= 4000)).toBe(true);
    expect([...junctions, ...bridges].every(id => !hasLot(map.nodes[id]))).toBe(true);
    expect(getStartingCash({ mapId })).toBe(100_000);
    expect(getJourneyRewardSteps(mapId)).toBe(72);

    const lots = getLotLayout(map);
    const entries = Object.values(lots);
    expect(entries).toHaveLength(map.nodes.filter(hasLot).length);
    const roads = map.nodes.flatMap(node => node.neighbors.filter(id => id > node.id).map(id => {
      const next = map.nodes[id];
      return { left: Math.min(node.x, next.x) - 20, right: Math.max(node.x, next.x) + 20,
        top: Math.min(node.y, next.y) - 20, bottom: Math.max(node.y, next.y) + 20 };
    }));
    for (let i = 0; i < entries.length; i++) {
      expect(roads.every(road => overlap(entries[i].bounds, road) === 0)).toBe(true);
      for (let j = i + 1; j < entries.length; j++) expect(overlap(entries[i].bounds, entries[j].bounds)).toBe(0);
    }
  });
});
