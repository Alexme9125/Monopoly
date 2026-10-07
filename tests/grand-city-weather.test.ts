import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/game/maps';
import { createGame } from '../src/game/engine';
import { WEATHERS } from '../src/game/data';
import { weatherWeights } from '../src/game/weather';
import { getLotLayout, hasLot, overlap } from '../src/visual/sceneLayout';
import type { GameState, MapNode, TileKind } from '../src/game/types';

const city = MAPS.grandCity;
const facilities = new Set<TileKind>(['station', 'shop', 'exchange', 'casino', 'power', 'water', 'telecom',
  'hospital', 'prison', 'sanatorium', 'parking']);
const distanceFrom = (nodes: MapNode[], start: number): number[] => {
  const distances = Array<number>(nodes.length).fill(Infinity);
  distances[start] = 0;
  const queue = [start];
  for (const id of queue) for (const next of nodes[id].neighbors) {
    if (distances[next] !== Infinity) continue;
    distances[next] = distances[id] + 1;
    queue.push(next);
  }
  return distances;
};

describe('伟岸之城', () => {
  it('has 96 connected orthogonal 60-unit road nodes in two square rings and four axial links', () => {
    expect(city).toMatchObject({ id: 'grandCity', name: '伟岸之城', subtitle: '双环都会 · 四轴相连',
      width: 1500, height: 1000, accent: '#55697b' });
    expect(city.nodes).toHaveLength(96);
    expect(city.nodes.map(node => node.id)).toEqual(Array.from({ length: 96 }, (_, id) => id));
    expect(city.nodes[0]).toMatchObject({ x: 330, y: 80, kind: 'start' });
    const outer = city.nodes.slice(0, 56);
    const inner = city.nodes.slice(56, 88);
    const links = city.nodes.slice(88);
    expect(outer.every(node => node.x === 330 || node.x === 1170 || node.y === 80 || node.y === 920)).toBe(true);
    expect(inner.every(node => node.x === 510 || node.x === 990 || node.y === 260 || node.y === 740)).toBe(true);
    expect(links.map(node => [node.x, node.y])).toEqual([
      [750, 140], [750, 200], [1110, 500], [1050, 500],
      [750, 860], [750, 800], [390, 500], [450, 500],
    ]);
    expect(city.nodes.filter(node => node.neighbors.length === 3).map(node => node.id)).toEqual([7, 21, 35, 49, 60, 68, 76, 84]);
    expect(city.nodes.every(node => node.neighbors.length === 2 || node.neighbors.length === 3)).toBe(true);
    for (const node of city.nodes) for (const nextId of node.neighbors) {
      const next = city.nodes[nextId];
      expect(next.neighbors).toContain(node.id);
      expect(Math.abs(next.x - node.x) + Math.abs(next.y - node.y)).toBe(60);
      expect(node.x === next.x || node.y === next.y).toBe(true);
    }
    expect(distanceFrom(city.nodes, 0).every(Number.isFinite)).toBe(true);
  });

  it('spreads 25 nonadjacent facilities, with stations reachable within eight road steps', () => {
    const counts = city.nodes.reduce((result, node) => {
      result[node.kind] = (result[node.kind] ?? 0) + 1;
      return result;
    }, {} as Partial<Record<TileKind, number>>);
    expect(Object.fromEntries([...facilities].map(kind => [kind, counts[kind]]))).toEqual({
      station: 6, shop: 4, exchange: 3, casino: 2, power: 2, water: 2, telecom: 2,
      hospital: 1, prison: 1, sanatorium: 1, parking: 1,
    });
    expect([...facilities].reduce((sum, kind) => sum + (counts[kind] ?? 0), 0)).toBe(25);
    const placed = city.nodes.filter(node => facilities.has(node.kind));
    expect(placed.filter(node => node.id >= 56 && node.id < 88).length).toBeGreaterThan(0);
    for (const pair of [[88, 89], [90, 91], [92, 93], [94, 95]]) {
      expect(pair.some(id => facilities.has(city.nodes[id].kind))).toBe(true);
    }
    for (const node of placed) {
      expect(node.neighbors).toHaveLength(2);
      expect(node.neighbors.every(id => !facilities.has(city.nodes[id].kind))).toBe(true);
    }
    const minKindGap: Partial<Record<TileKind, number>> = { station: 10, shop: 6, exchange: 8,
      casino: 10, power: 10, water: 10, telecom: 10 };
    for (const [kind, minimum] of Object.entries(minKindGap) as [TileKind, number][]) {
      const matching = placed.filter(node => node.kind === kind);
      for (let i = 0; i < matching.length; i++) for (const other of matching.slice(i + 1)) {
        expect(distanceFrom(city.nodes, matching[i].id)[other.id], `${kind} ${matching[i].id}/${other.id}`).toBeGreaterThanOrEqual(minimum);
      }
    }
    const stationDistances = placed.filter(node => node.kind === 'station').map(node => distanceFrom(city.nodes, node.id));
    for (const node of city.nodes) {
      expect(Math.min(...stationDistances.map(distances => distances[node.id])), `station reach at ${node.id}`).toBeLessThanOrEqual(8);
    }
  });

  it('keeps 50 priced prefabricated lots and adds eight unbuilt lots, two per district', () => {
    const lands = city.nodes.filter(node => node.kind === 'land');
    expect(lands).toHaveLength(58);
    const vacantByDistrict = { 云阶: [3, 59], 曜庭: [20, 67], 环翠: [41, 77], 天际: [33, 72] };
    const vacantIds = Object.values(vacantByDistrict).flat();
    expect(lands.filter(node => node.prefabLevel === undefined).map(node => node.id).sort((a, b) => a - b))
      .toEqual([...vacantIds].sort((a, b) => a - b));
    for (const [district, ids] of Object.entries(vacantByDistrict)) {
      for (const id of ids) expect(city.nodes[id]).toMatchObject({ kind: 'land', district });
    }
    expect(Object.fromEntries([1, 2, 3, 4].map(level => [level, lands.filter(node => node.prefabLevel === level).length])))
      .toEqual({ 1: 15, 2: 15, 3: 10, 4: 10 });
    for (const district of ['云阶', '曜庭', '环翠', '天际']) {
      expect([1, 2, 3, 4].every(level => lands.some(node => node.district === district && node.prefabLevel === level))).toBe(true);
    }
    expect(new Set(city.nodes.map(node => node.name)).size).toBe(city.nodes.length);
    expect(city.nodes.filter(node => node.kind !== 'land' && node.prefabLevel !== undefined)).toHaveLength(0);
    expect(city.nodes.filter(node => ['empty', 'coin', 'event'].includes(node.kind)).map(node => [node.id, node.kind]))
      .toEqual([[7, 'coin'], [21, 'empty'], [31, 'coin'], [35, 'empty'], [36, 'coin'],
        [49, 'empty'], [51, 'coin'], [60, 'empty'], [68, 'event'], [76, 'coin'],
        [84, 'empty'], [88, 'coin']]);
    for (const node of city.nodes.filter(node => node.kind === 'land' || facilities.has(node.kind) && node.price !== undefined)) {
      expect(node.price, `price at ${node.id}`).toBeGreaterThanOrEqual(800);
      expect(node.price, `price at ${node.id}`).toBeLessThanOrEqual(4000);
    }
  });

  it('places all 83 land and facility squares beside roads without overlap', () => {
    const layout = getLotLayout(city);
    expect(Object.keys(layout)).toHaveLength(83);
    const roads = city.nodes.flatMap(node => node.neighbors.filter(id => id > node.id).map(id => {
      const next = city.nodes[id];
      return { left: Math.min(node.x, next.x) - 20, right: Math.max(node.x, next.x) + 20,
        top: Math.min(node.y, next.y) - 20, bottom: Math.max(node.y, next.y) + 20 };
    }));
    const lots = Object.entries(layout).map(([id, lot]) => [city.nodes[Number(id)], lot] as const);
    for (const [index, [node, lot]] of lots.entries()) {
      expect(hasLot(node)).toBe(true);
      expect(lot.size).toBe(46);
      const dx = Math.abs(lot.x - node.x), dy = Math.abs(lot.y - node.y);
      expect(Math.hypot(dx, dy)).toBeLessThanOrEqual(76);
      expect(dx >= 44 && dx <= 46 || dy >= 44 && dy <= 46).toBe(true);
      for (const road of roads) expect(overlap(lot.bounds, road), `lot ${node.id} crosses road`).toBe(0);
      for (const [other, nextLot] of lots.slice(index + 1)) {
        expect(overlap(lot.bounds, nextLot.bounds), `lots ${node.id}/${other.id} overlap`).toBe(0);
      }
    }
  });
});

describe('寂静河谷', () => {
  const map = MAPS.hushedValley;
  const bridgeIds = [27, 28, 29, 61, 75, 76, 77, 88, 89, 90];

  it('joins a 66-node stepped outer ring to a 25-node interior route without loose ends', () => {
    expect(map).toMatchObject({ id: 'hushedValley', name: '寂静河谷', subtitle: '叠瀑河槽 · 五层地标',
      accent: '#527b78', width: 1500, height: 1000 });
    expect(map.nodes).toHaveLength(91);
    expect(map.nodes.map(node => node.id)).toEqual(Array.from({ length: 91 }, (_, id) => id));
    expect(map.nodes[0]).toMatchObject({ x: 180, y: 140, kind: 'start' });
    expect(map.nodes.filter(node => node.neighbors.length === 3).map(node => node.id)).toEqual([27, 61]);
    expect(map.nodes.every(node => node.neighbors.length >= 2)).toBe(true);
    expect(distanceFrom(map.nodes, 0).every(Number.isFinite)).toBe(true);
    for (const node of map.nodes) for (const nextId of node.neighbors) {
      const next = map.nodes[nextId];
      expect(next.neighbors).toContain(node.id);
      expect(Math.abs(next.x - node.x) + Math.abs(next.y - node.y)).toBe(60);
      expect(node.x === next.x || node.y === next.y).toBe(true);
    }
    expect(bridgeIds.map(id => [map.nodes[id].x, map.nodes[id].y])).toEqual([
      [1320, 500], [1320, 560], [1320, 620], [180, 440],
      [660, 440], [660, 500], [660, 560], [1140, 500], [1200, 500], [1260, 500],
    ]);
  });

  it('keeps river bridges clear and distributes 23 nonadjacent unmanned facilities', () => {
    expect(bridgeIds.every(id => ['empty', 'coin', 'event'].includes(map.nodes[id].kind))).toBe(true);
    const placed = map.nodes.filter(node => facilities.has(node.kind));
    expect(placed).toHaveLength(23);
    expect(Object.fromEntries([...facilities].map(kind => [kind, placed.filter(node => node.kind === kind).length])))
      .toEqual({ station: 5, shop: 4, exchange: 2, casino: 2, power: 2, water: 2, telecom: 2,
        hospital: 1, prison: 1, sanatorium: 1, parking: 1 });
    expect(placed.filter(node => node.id >= 66).length).toBeGreaterThanOrEqual(5);
    for (const node of placed) {
      expect(node.neighbors.every(id => !facilities.has(map.nodes[id].kind)), `facility ${node.id} has a neighbor`).toBe(true);
      if (node.kind === 'shop') expect(node.name).toContain('无人补给站');
      if (node.kind === 'exchange') expect(node.name).toContain('自动交易终端');
      if (node.kind === 'casino') expect(node.name).toContain('星运补给机');
    }
    const minKindGap: Partial<Record<TileKind, number>> = { station: 10, shop: 6,
      exchange: 8, casino: 8, power: 8, water: 8, telecom: 8 };
    for (const [kind, minimum] of Object.entries(minKindGap) as [TileKind, number][]) {
      const matching = placed.filter(node => node.kind === kind);
      for (let i = 0; i < matching.length; i++) for (const other of matching.slice(i + 1)) {
        expect(distanceFrom(map.nodes, matching[i].id)[other.id], `${kind} ${matching[i].id}/${other.id}`).toBeGreaterThanOrEqual(minimum);
      }
    }
    const stationDistances = placed.filter(node => node.kind === 'station').map(node => distanceFrom(map.nodes, node.id));
    for (const node of map.nodes) {
      expect(Math.min(...stationDistances.map(distances => distances[node.id])), `station reach at ${node.id}`).toBeLessThanOrEqual(9);
    }
  });

  it('prices 40 unbuilt lands and fits all 63 property squares beside the roads', () => {
    const lands = map.nodes.filter(node => node.kind === 'land');
    expect(lands).toHaveLength(40);
    expect(lands.every(node => node.prefabLevel === undefined)).toBe(true);
    for (const district of ['雾杉', '叠瀑', '静流', '回声']) {
      expect(lands.some(node => node.district === district)).toBe(true);
    }
    expect(new Set(map.nodes.map(node => node.name)).size).toBe(map.nodes.length);
    for (const node of map.nodes.filter(node => node.kind === 'land' || facilities.has(node.kind) && node.price !== undefined)) {
      expect(node.price, `price at ${node.id}`).toBeGreaterThanOrEqual(800);
      expect(node.price, `price at ${node.id}`).toBeLessThanOrEqual(4000);
    }
    const layout = getLotLayout(map);
    expect(Object.keys(layout)).toHaveLength(63);
    const roads = map.nodes.flatMap(node => node.neighbors.filter(id => id > node.id).map(id => {
      const next = map.nodes[id];
      return { left: Math.min(node.x, next.x) - 20, right: Math.max(node.x, next.x) + 20,
        top: Math.min(node.y, next.y) - 20, bottom: Math.max(node.y, next.y) + 20 };
    }));
    const lots = Object.entries(layout).map(([id, lot]) => [map.nodes[Number(id)], lot] as const);
    for (const [index, [node, lot]] of lots.entries()) {
      expect(hasLot(node)).toBe(true);
      expect(lot.size).toBe(46);
      expect(Math.hypot(lot.x - node.x, lot.y - node.y)).toBeLessThanOrEqual(76);
      for (const road of roads) expect(overlap(lot.bounds, road), `lot ${node.id} crosses road`).toBe(0);
      for (const [other, nextLot] of lots.slice(index + 1)) {
        expect(overlap(lot.bounds, nextLot.bounds), `lots ${node.id}/${other.id} overlap`).toBe(0);
      }
    }
  });
});

function weatherState(mapId: GameState['config']['mapId'], day: number, mode: GameState['config']['weatherMode']): GameState {
  const state = createGame({ mapId: 'lake', mode: 'pve', seasons: 0, weatherMode: mode, seed: 503,
    players: [{ name: '测试玩家', color: '#d55b48', shape: 'circle', ai: false, personality: 'balanced' },
      { name: '测试电脑', color: '#277da8', shape: 'diamond', ai: true, personality: 'cautious' }] });
  state.config.mapId = mapId;
  state.day = day;
  state.weatherId = 'clear';
  state.weatherHistory = ['clear', 'clear'];
  return state;
}

describe('new-map weather weights', () => {
  it('makes the grand city identical to the lakeside in both modes and every season', () => {
    for (const mode of ['standard', 'challenge'] as const) for (const day of [1, 22, 43, 64, 85]) {
      expect(weatherWeights(weatherState('grandCity', day, mode)))
        .toEqual(weatherWeights(weatherState('lake', day, mode)));
    }
  });

  it('makes the hushed valley milder than the broken road but rougher than the old valley', () => {
    const mild = new Set(['clear', 'soft', 'fireflies', 'breeze', 'drought']);
    const rough = new Set(['chill', 'snow', 'drizzle', 'rain', 'thunder', 'gale', 'mist', 'fog']);
    const hard = new Set(['blizzard', 'freezing', 'storm']);
    for (const mode of ['standard', 'challenge'] as const) for (const day of [1, 22, 43, 64]) {
      const baseline = weatherWeights(weatherState('lake', day, mode));
      const hushed = weatherWeights(weatherState('hushedValley', day, mode));
      const valley = weatherWeights(weatherState('valley', day, mode));
      const sundered = weatherWeights(weatherState('sundered', day, mode));
      for (const weather of Object.values(WEATHERS)) {
        const id = weather.id;
        const multiplier = mild.has(id) ? 0.88 : rough.has(id) ? 1.23 : hard.has(id) ? 1.19 : 1;
        expect(hushed[id], `${id} day ${day}`).toBeCloseTo(baseline[id] * multiplier, 12);
        if (baseline[id] === 0 || multiplier === 1) continue;
        if (mild.has(id)) expect(hushed[id]).toBeLessThan(valley[id]);
        else expect(hushed[id]).toBeGreaterThan(valley[id]);
        if (mild.has(id)) expect(hushed[id]).toBeGreaterThan(sundered[id]);
        else expect(hushed[id]).toBeLessThan(sundered[id]);
      }
    }
  });
});
