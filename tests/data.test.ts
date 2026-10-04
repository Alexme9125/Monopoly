import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { AI_PRESETS, EVENTS, INITIAL_STOCKS, ITEMS, WEATHERS } from '../src/game/data';
import { MAPS } from '../src/game/maps';
import { relocateFacilityNode } from '../src/game/facilityLayout';
import type { MapId, MapNode, TileKind } from '../src/game/types';

const allKinds: TileKind[] = ['start', 'land', 'empty', 'coin', 'event', 'hospital', 'prison', 'sanatorium', 'parking', 'power', 'water', 'telecom', 'station', 'shop', 'casino', 'exchange'];
const facilityKinds = new Set<TileKind>(['hospital', 'prison', 'sanatorium', 'parking', 'power', 'water', 'telecom', 'station', 'shop', 'casino', 'exchange']);
const propertyKinds = new Set<TileKind>(['land', 'power', 'water', 'telecom']);

function roadDistances(nodes: MapNode[], startId: number): number[] {
  const distances = Array<number>(nodes.length).fill(Infinity);
  distances[startId] = 0;
  const queue = [startId];
  for (const nodeId of queue) for (const neighborId of nodes[nodeId].neighbors) {
    if (distances[neighborId] !== Infinity) continue;
    distances[neighborId] = distances[nodeId] + 1;
    queue.push(neighborId);
  }
  return distances;
}

function intersects(a: MapNode, b: MapNode, c: MapNode, d: MapNode): boolean {
  const orientation = (p: MapNode, q: MapNode, r: MapNode) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  const on = (p: MapNode, q: MapNode, r: MapNode) => Math.abs(orientation(p, q, r)) < 1e-6
    && r.x >= Math.min(p.x, q.x) - 1e-6 && r.x <= Math.max(p.x, q.x) + 1e-6
    && r.y >= Math.min(p.y, q.y) - 1e-6 && r.y <= Math.max(p.y, q.y) + 1e-6;
  return abC * abD < -1e-6 && cdA * cdB < -1e-6 || on(a, b, c) || on(a, b, d) || on(c, d, a) || on(c, d, b);
}

describe('map road networks', () => {
  it.each([
    ['lake', [13, 26, 47, 77], 12, 8],
    ['coast', [14, 33, 45, 59], 13, 9],
    ['valley', [12, 24, 44, 54, 88], 12, 10],
    ['sundered', [6, 16, 31, 60, 78], 10, 10],
  ] as const)('spreads %s stations across the road network', (mapId, expectedIds, minimumGap, maximumReach) => {
    const nodes = MAPS[mapId].nodes;
    const stations = nodes.filter(node => node.kind === 'station');
    expect(stations.map(node => node.id)).toEqual(expectedIds);
    const distances = stations.map(station => roadDistances(nodes, station.id));
    for (let i = 0; i < stations.length; i++) for (let j = i + 1; j < stations.length; j++) {
      expect(distances[i][stations[j].id], `${mapId} stations ${stations[i].id}/${stations[j].id} are too close`).toBeGreaterThanOrEqual(minimumGap);
    }
    for (const node of nodes) {
      expect(Math.min(...distances.map(fromStation => fromStation[node.id])), `${mapId} node ${node.id} is too far from a station`).toBeLessThanOrEqual(maximumReach);
    }
    if (mapId === 'coast') {
      expect(stations.filter(node => node.x <= 750 && node.y <= 490)).toHaveLength(2);
      expect(stations.filter(node => node.x >= 750 && node.y >= 490)).toHaveLength(2);
    }
    if (mapId === 'valley') {
      const outer = (node: MapNode) => node.x < 200 || node.x > 1300 || node.y < 150 || node.y > 900;
      expect(stations.filter(outer)).toHaveLength(3);
      expect(stations.filter(node => !outer(node) && node.x < 750)).toHaveLength(1);
      expect(stations.filter(node => !outer(node) && node.x >= 750)).toHaveLength(1);
    }
    if (mapId === 'sundered') {
      expect(stations.filter(node => node.x <= 780 && node.y >= 560)).toHaveLength(2);
      expect(stations.filter(node => node.x <= 780 && node.y <= 440)).toHaveLength(1);
      expect(stations.filter(node => node.x >= 1020 && node.y < 440)).toHaveLength(1);
      expect(stations.filter(node => node.x >= 1020 && node.y >= 560)).toHaveLength(1);
      for (const station of stations) expect(station.name).toMatch(new RegExp(`站${station.id}号$`));
      for (const id of [47, 70]) {
        expect(nodes[id].kind).toBe('exchange');
        expect(nodes[id].name).toContain('证券所');
        expect(nodes[id].name).not.toMatch(/站\d+号$/);
      }
    }
  });

  it.each([
    ['lake', 39, 48, 26, 113260, '08fea40118c7d1c5cc6f00c192a864aa131a90bb3959e18567182e819dc4bfca', 'c9838cf4e0abf61c4120c93258a5d1179f22139dc62e82ab654a1728d73e01b4'],
    ['coast', 32, 38, 21, 97000, '72883eb0ad26dd94264a61686436b7e20b6f6e546c5b39e43ea56b5d6df8e68f', '075609f55e6f959078ba46c654543d34c88ae03d16d3766e99088ac19ff66420'],
    ['valley', 45, 54, 30, 124200, 'af12ca435b9ef4d18fc87e0bbc0dbcea70daea1b7e7f6cde3955759db41197b6', '94fc3fa566782479e228618a0669cdc771736411e06780664e9b8b5682a5d9db'],
    ['sundered', 47, 58, 32, 131540, 'b5c3cd5f47716b4eae30a4df059b3bbc3112641ec4e30d9e1348a97d01cb60e7', '8fb6f5f61a2bf2c4fc17f5ef089f62ce57c9277d74d8784e0ab775ecc031befc'],
  ] as const)('preserves %s roads and purchasable property while moving facilities', (mapId, landCount, propertyCount, facilityCount, totalPrice, propertyFingerprint, roadFingerprint) => {
    const nodes = MAPS[mapId].nodes;
    const properties = nodes.filter(node => propertyKinds.has(node.kind));
    expect(nodes.filter(node => node.kind === 'land')).toHaveLength(landCount);
    expect(properties).toHaveLength(propertyCount);
    expect(nodes.filter(node => facilityKinds.has(node.kind))).toHaveLength(facilityCount);
    expect(properties.reduce((sum, node) => sum + (node.price ?? 0), 0)).toBe(totalPrice);
    // Compare economic identity at its old content ID: land stays put, while
    // utilities keep kind and price when their facility moves to a new site.
    const listing = properties.map(node => `${relocateFacilityNode(mapId, node.id)}:${node.kind}:${node.price}`)
      .sort((a, b) => Number(a.split(':')[0]) - Number(b.split(':')[0])).join('|');
    expect(createHash('sha256').update(listing).digest('hex')).toBe(propertyFingerprint);
    const roads = JSON.stringify(nodes.map(node => [node.id, node.x, node.y, node.neighbors]));
    expect(createHash('sha256').update(roads).digest('hex')).toBe(roadFingerprint);
  });

  it('preserves the named routes and their distinguishing geometry', () => {
    expect(MAPS.lake.name).toBe('棱镜湖畔');
    expect(MAPS.coast.name).toBe('原色海岸');
    expect(MAPS.valley.name).toBe('怡人山谷');
    expect(MAPS.lake.nodes.some(n => n.x > 700 && n.x < 1050 && n.y > 300 && n.y < 650)).toBe(false);
    expect(MAPS.coast.nodes[0]).toMatchObject({ x: 750, y: 490, kind: 'start' });
    expect(MAPS.coast.nodes.filter(n => n.neighbors.length === 4)).toHaveLength(1);
    expect(MAPS.coast.nodes).toHaveLength(71);
    for (const node of MAPS.coast.nodes) {
      const northwest = node.x >= 160 && node.x <= 750 && node.y >= 150 && node.y <= 490
        && (node.x === 160 || node.x === 750 || node.y === 150 || node.y === 490);
      const southeast = node.x >= 750 && node.x <= 1340 && node.y >= 490 && node.y <= 830
        && (node.x === 750 || node.x === 1340 || node.y === 490 || node.y === 830);
      expect(northwest || southeast, `coast node ${node.id} is off both rectangular rings`).toBe(true);
    }
    expect(MAPS.valley.nodes).toHaveLength(101);
    for (const node of MAPS.valley.nodes) {
      expect(node.x > 390 && node.x < 570 && node.y > 300 && node.y < 600).toBe(false);
      expect(node.x > 930 && node.x < 1110 && node.y > 396 && node.y < 700).toBe(false);
    }
    expect(MAPS.sundered.name).toBe('破碎山道');
    expect(MAPS.sundered.nodes).toHaveLength(105);
    expect(MAPS.sundered.nodes[0]).toMatchObject({ x: 180, y: 560, kind: 'start' });
    expect(MAPS.sundered.nodes.filter(node => node.neighbors.length === 3)).toHaveLength(6);
  });
  const expectedRanges: Record<MapId, [number, number]> = { lake: [70, 90], coast: [70, 90], valley: [90, 110], sundered: [105, 105], forest: [64, 64], starSands: [76, 76], ashCanyon: [84, 84], peachHaven: [82, 82] };
  const maxEdgeLength: Record<MapId, number> = { lake: 82, coast: 75, valley: 100, sundered: 60, forest: 60, starSands: 60, ashCanyon: 60, peachHaven: 60 };
  const bounds: Record<MapId, { left: number; right: number; top: number; bottom: number }> = {
    lake: { left: 220, right: 1308, top: 150, bottom: 820 },
    coast: { left: 160, right: 1340, top: 150, bottom: 830 },
    valley: { left: 80, right: 1420, top: 30, bottom: 970 },
    sundered: { left: 180, right: 1320, top: 140, bottom: 860 },
    forest: { left: 180, right: 1320, top: 140, bottom: 860 },
    starSands: { left: 180, right: 1320, top: 200, bottom: 800 },
    ashCanyon: { left: 180, right: 1320, top: 140, bottom: 860 },
    peachHaven: { left: 180, right: 1320, top: 140, bottom: 860 },
  };
  for (const map of Object.values(MAPS)) {
    it(`${map.id} has contiguous, connected and local roads`, () => {
      const nodes = map.nodes;
      const [minimum, maximum] = expectedRanges[map.id];
      expect(nodes.length).toBeGreaterThanOrEqual(minimum);
      expect(nodes.length).toBeLessThanOrEqual(maximum);
      expect([map.width, map.height]).toEqual([1500, 1000]);
      expect(nodes[0].kind).toBe('start');
      expect(nodes.map(n => n.id)).toEqual(nodes.map((_, i) => i));
      const seen = new Set<number>([0]);
      const stack = [0];
      const edges: [MapNode, MapNode][] = [];
      while (stack.length) {
        const node = nodes[stack.pop()!];
        for (const nextId of node.neighbors) {
          const next = nodes[nextId];
          expect(next).toBeDefined();
          expect(next.neighbors).toContain(node.id);
          expect(Math.hypot(next.x - node.x, next.y - node.y)).toBeLessThanOrEqual(maxEdgeLength[map.id]);
          if (['valley', 'sundered', 'forest', 'starSands', 'ashCanyon', 'peachHaven'].includes(map.id)) expect(node.x === next.x || node.y === next.y).toBe(true);
          if (node.id < nextId) edges.push([node, next]);
          if (!seen.has(nextId)) { seen.add(nextId); stack.push(nextId); }
        }
      }
      expect(seen.size).toBe(nodes.length);
      for (const node of nodes) {
        expect(node.neighbors.length).toBeGreaterThanOrEqual(2);
        expect(new Set(node.neighbors).size).toBe(node.neighbors.length);
        expect(node.x).toBeGreaterThanOrEqual(bounds[map.id].left);
        expect(node.x).toBeLessThanOrEqual(bounds[map.id].right);
        expect(node.y).toBeGreaterThanOrEqual(bounds[map.id].top);
        expect(node.y).toBeLessThanOrEqual(bounds[map.id].bottom);
      }
      for (let i = 0; i < edges.length; i++) {
        for (let j = i + 1; j < edges.length; j++) {
          const [a, b] = edges[i];
          const [c, d] = edges[j];
          if ([a.id, b.id].some(id => id === c.id || id === d.id)) continue;
          expect(intersects(a, b, c, d), `${map.id}: ${a.id}-${b.id} touches ${c.id}-${d.id} without a junction`).toBe(false);
        }
      }
      if (['sundered', 'forest', 'starSands', 'ashCanyon', 'peachHaven'].includes(map.id)) {
        for (const [a, b] of edges) for (const node of nodes) {
          if (node.id === a.id || node.id === b.id) continue;
          const cross = (b.x - a.x) * (node.y - a.y) - (b.y - a.y) * (node.x - a.x);
          const inside = (node.x - a.x) * (node.x - b.x) + (node.y - a.y) * (node.y - b.y) < 0;
          expect(Math.abs(cross) < 1e-6 && inside, `${map.id} edge ${a.id}-${b.id} passes node ${node.id} without connecting`).toBe(false);
        }
      }
      if (['valley', 'sundered', 'forest', 'starSands', 'ashCanyon', 'peachHaven'].includes(map.id)) {
        for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
          expect(Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y), `${map.id} nodes ${i} and ${j} are too close`).toBeGreaterThanOrEqual(52);
        }
      }
    });

    it(`${map.id} includes all functional tiles and balanced inventory`, () => {
      const nodes = map.nodes;
      const counts = new Map<TileKind, number>();
      for (const node of nodes) counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
      for (const kind of allKinds) expect(counts.get(kind), kind).toBeGreaterThan(0);
      expect(counts.get('station')).toBeGreaterThanOrEqual(3);
      expect(counts.get('shop')).toBeGreaterThanOrEqual(3);
      expect(counts.get('exchange')).toBeGreaterThanOrEqual(2);
      expect((counts.get('land') ?? 0) / nodes.length).toBeGreaterThan(0.42);
      expect((counts.get('land') ?? 0) / nodes.length).toBeLessThan(0.48);
      const facilities = nodes.filter(n => facilityKinds.has(n.kind));
      expect(facilities.length / nodes.length).toBeGreaterThan(0.27);
      expect(facilities.length / nodes.length).toBeLessThan(0.33);
      expect(new Set(nodes.map(n => n.name)).size).toBe(nodes.length);
      for (const node of nodes.filter(n => n.price !== undefined)) {
        expect(node.price).toBeGreaterThanOrEqual(800);
        expect(node.price).toBeLessThanOrEqual(map.id === 'forest' && node.kind === 'land' ? 16_000 : 4000);
        if (map.id === 'forest' && node.kind === 'land') expect(node.price).toBeGreaterThanOrEqual(8000);
        expect(node.district).toBeTruthy();
      }
    });
  }
});

describe('game content', () => {
  it('contains 24 or more items with cards as the only stackable category', () => {
    expect(Object.keys(ITEMS).length).toBeGreaterThanOrEqual(24);
    expect(ITEMS.dice100.shop).toBe(false);
    expect(ITEMS.dice8.shop).toBe(true);
    expect(ITEMS.dice12.shop).toBe(true);
    expect(ITEMS.dice20.shop).toBe(true);
    expect(ITEMS.bomb.susceptible).toBe(true);
    expect(ITEMS.controller).toMatchObject({ name: '控骰器', category: 'dice', price: 1600, shop: true, susceptible: true, target: 'dice', stackable: false });
    expect(ITEMS.controller.description).toContain('原始点数（1～6）');
    expect(ITEMS.rent.description).toContain('可自行选择');
    expect(ITEMS.rent.description).toContain('受潮时无法抵免');
    for (const [id, def] of Object.entries(ITEMS)) {
      expect(def.id).toBe(id);
      expect(def.stackable).toBe(def.category === 'card');
      if (def.paper) expect(def.susceptible).toBe(false);
      expect(def.description.length).toBeGreaterThan(4);
    }
  });

  it('covers the listed 26 weather conditions and disaster gating metadata', () => {
    expect(Object.keys(WEATHERS)).toHaveLength(26);
    for (const id of ['acid', 'glitch', 'paradox']) {
      expect(WEATHERS[id].family).toBe('disaster');
      expect(WEATHERS[id].description).toContain('第 22 天');
    }
    expect(WEATHERS.rain.balancedNote).toContain('怕水道具');
    expect(WEATHERS.storm.balancedNote).toContain('所有道具受潮');
    expect(WEATHERS.scorch.description).toContain('各 -3');
    expect(WEATHERS.glitch.description).toContain('只抽取一种额外负面');
    for (const [id, def] of Object.entries(WEATHERS)) {
      expect(def.id).toBe(id);
      expect(def.weight).toBeGreaterThan(0);
      if (id === 'freezing') expect(def.seasons).toEqual([2]);
      else expect(def.seasons.length).toBeGreaterThan(0);
      expect(new Set(def.seasons).size).toBe(def.seasons.length);
      expect(def.seasons.every(season => Number.isInteger(season) && season >= 0 && season <= 3)).toBe(true);
    }
  });

  it('offers executable unique event choices, six AI presets and four stocks', () => {
    expect(EVENTS).toHaveLength(48);
    const newEvents = ['aurora_film', 'orchard', 'courier', 'signal_fee', 'sinkhole', 'drone', 'leasebook', 'noise', 'pollination', 'survey', 'seminar', 'baggage', 'tide_lock', 'comet_watch', 'counterfeit', 'solar_grant'];
    expect(EVENTS.slice(28, 44).map(e => e.id)).toEqual(newEvents);
    expect(EVENTS.slice(44).map(e => e.id)).toEqual(['beacon_lab', 'route_workshop', 'prism_relay', 'twin_culture']);
    const choices = EVENTS.flatMap(e => e.choices.map(c => c.id));
    expect(new Set(choices).size).toBe(choices.length);
    expect(new Set(EVENTS.map(e => e.id)).size).toBe(EVENTS.length);
    for (const event of EVENTS) {
      expect(event.story.length).toBeGreaterThan(10);
      expect(event.choices.length).toBeGreaterThan(0);
      for (const choice of event.choices) if (choice.item) expect(ITEMS[choice.item]).toBeDefined();
    }
    const choice = (eventId: string, choiceId: string) => EVENTS.find(e => e.id === eventId)?.choices.find(c => c.id === `${eventId}_${choiceId}`);
    expect(choice('orchard', 'harvest')).toMatchObject({ stamina: -8, item: 'feast' });
    expect(choice('drone', 'carry')).toMatchObject({ stamina: -10, item: 'dice8' });
    expect(choice('tide_lock', 'wait')).toMatchObject({ confinement: 'parking' });
    expect(choice('counterfeit', 'detain')).toMatchObject({ confinement: 'prison' });
    expect(choice('solar_grant', 'device')).toMatchObject({ cash: -1800, item: 'weather' });
    expect(choice('beacon_lab', 'assist')).toMatchObject({ stamina: -8, item: 'controller' });
    expect(choice('beacon_lab', 'observe')).toMatchObject({ mood: 6 });
    expect(choice('route_workshop', 'buy')).toMatchObject({ cash: -900, item: 'controller' });
    expect(choice('route_workshop', 'sort')).toMatchObject({ stamina: -4, cash: 250 });
    expect(choice('route_workshop', 'leave')).toMatchObject({ label: '暂不交易', description: '保留现有物资，继续赶路。' });
    expect(AI_PRESETS).toHaveLength(6);
    for (const personality of ['cautious', 'balanced', 'aggressive']) expect(AI_PRESETS.filter(p => p.personality === personality)).toHaveLength(2);
    expect(new Set(AI_PRESETS.map(p => p.name)).size).toBe(6);
    expect(INITIAL_STOCKS).toHaveLength(4);
    for (const stock of INITIAL_STOCKS) {
      expect(stock.price).toBeGreaterThanOrEqual(40);
      expect(stock.price).toBeLessThanOrEqual(150);
      expect(stock.sector).toBeTruthy();
    }
  });
});
