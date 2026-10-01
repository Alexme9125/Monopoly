import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/game/maps';
import type { MapId, MapNode, TileKind } from '../src/game/types';

const facilityKinds = [
  'hospital', 'prison', 'sanatorium', 'parking', 'station', 'shop',
  'exchange', 'power', 'water', 'telecom', 'casino',
] as const satisfies readonly TileKind[];
const facilitySet = new Set<TileKind>(facilityKinds);
const infrastructureKinds = ['power', 'water', 'telecom'] as const;

type OriginalMap = 'lake' | 'coast' | 'valley';
type FacilityCounts = readonly number[];
type FacilitySwap = readonly [source: number, destination: number, kind: TileKind, sourcePrice?: number];

// Baseline taken before the facility redistribution. Each pair moves the facility
// from source to destination, exchanging it with the destination's ordinary tile.
const expectations: Record<OriginalMap, {
  counts: FacilityCounts;
  stations: readonly number[];
  stationReach: number;
  landCount: number;
  landSha256: string;
  infrastructurePrices: readonly (readonly number[])[];
  maximumFacilityReach: number;
  minimumShopGap: number;
  minimumExchangeGap: number;
  swaps: readonly FacilitySwap[];
}> = {
  lake: {
    counts: [1, 1, 1, 1, 4, 4, 3, 3, 3, 3, 2],
    stations: [13, 26, 47, 77], stationReach: 8,
    landCount: 39, landSha256: '996cf06511ccb81a8c0bd5ac454a93a1e98c8ef657032fb6b18158fb5e7594a8',
    infrastructurePrices: [[1060, 2800, 3800], [800, 2360, 3020], [2060, 2240, 2280]],
    maximumFacilityReach: 3, minimumShopGap: 7, minimumExchangeGap: 5,
    swaps: [[2, 16, 'prison'], [7, 62, 'water', 800], [22, 68, 'casino'],
      [27, 79, 'power', 3800], [73, 70, 'exchange'], [82, 38, 'exchange'], [37, 64, 'shop']],
  },
  coast: {
    counts: [1, 1, 1, 1, 4, 3, 2, 2, 2, 2, 2],
    stations: [14, 33, 45, 59], stationReach: 9,
    landCount: 32, landSha256: 'bda1d8d766a9161c5b21a76a287e75d28c727d303b0be79fb5448f3b7ea7d451',
    infrastructurePrices: [[2320, 2540], [1060, 3020], [2760, 3320]],
    maximumFacilityReach: 3, minimumShopGap: 14, minimumExchangeGap: 17,
    swaps: [[32, 50, 'power', 2320], [39, 48, 'hospital'], [43, 62, 'shop'],
      [44, 27, 'casino'], [1, 70, 'exchange']],
  },
  valley: {
    counts: [1, 1, 1, 1, 5, 5, 4, 3, 3, 3, 3],
    stations: [12, 24, 44, 54, 88], stationReach: 10,
    landCount: 45, landSha256: 'e33f78f309b07ee94eaeb1ed14f0f3b9710bfce0fbe957c9a317d28fd1b72fc6',
    infrastructurePrices: [[1280, 2540, 3800], [2320, 2540, 3280], [2060, 2500, 2800]],
    maximumFacilityReach: 5, minimumShopGap: 9, minimumExchangeGap: 7,
    swaps: [[17, 10, 'telecom', 2060], [16, 73, 'exchange'], [42, 52, 'exchange'],
      [45, 39, 'power', 2540], [82, 85, 'hospital'], [68, 80, 'casino']],
  },
};

function sha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function distancesFrom(nodes: MapNode[], start: number): number[] {
  const distance = Array<number>(nodes.length).fill(Infinity);
  distance[start] = 0;
  const queue = [start];
  for (const id of queue) for (const next of nodes[id].neighbors) {
    if (distance[next] !== Infinity) continue;
    distance[next] = distance[id] + 1;
    queue.push(next);
  }
  return distance;
}

function maximumReach(nodes: MapNode[], targets: MapNode[]): number {
  const distances = targets.map(node => distancesFrom(nodes, node.id));
  return Math.max(...nodes.map(node => Math.min(...distances.map(road => road[node.id]))));
}

function minimumGap(nodes: MapNode[], targets: MapNode[]): number {
  return Math.min(...targets.flatMap((node, index) => {
    const distances = distancesFrom(nodes, node.id);
    return targets.slice(index + 1).map(other => distances[other.id]);
  }));
}

function onRectangle(node: MapNode, left: number, right: number, top: number, bottom: number): boolean {
  return node.x >= left && node.x <= right && node.y >= top && node.y <= bottom
    && (node.x === left || node.x === right || node.y === top || node.y === bottom);
}

describe('original map facility distribution', () => {
  for (const mapId of ['lake', 'coast', 'valley'] as const) {
    const expected = expectations[mapId];

    it(`${mapId} preserves facilities, stations, land, and infrastructure prices`, () => {
      const nodes = MAPS[mapId].nodes;
      expect(facilityKinds.map(kind => nodes.filter(node => node.kind === kind).length)).toEqual(expected.counts);
      const stations = nodes.filter(node => node.kind === 'station');
      expect(stations.map(node => node.id)).toEqual(expected.stations);
      expect(maximumReach(nodes, stations)).toBe(expected.stationReach);

      const land = nodes.filter(node => node.kind === 'land').map(node => [node.id, node.name, node.price]);
      expect(land).toHaveLength(expected.landCount);
      expect(sha256(land)).toBe(expected.landSha256);

      for (const [index, kind] of infrastructureKinds.entries()) {
        const prices = nodes.filter(node => node.kind === kind).map(node => node.price).sort((a, b) => a! - b!);
        expect(prices, `${mapId} ${kind} must retain source prices and total value`).toEqual(expected.infrastructurePrices[index]);
      }
      for (const [source, destination, kind, sourcePrice] of expected.swaps) {
        expect(nodes[destination].kind, `${mapId} ${kind} should move from ${source} to ${destination}`).toBe(kind);
        expect(facilitySet.has(nodes[source].kind), `${mapId} ${source} should no longer be a facility`).toBe(false);
        if (sourcePrice !== undefined) expect(nodes[destination].price).toBe(sourcePrice);
      }
    });

    it(`${mapId} has no adjacent facilities and keeps facilities within reach`, () => {
      const nodes = MAPS[mapId].nodes;
      const facilities = nodes.filter(node => facilitySet.has(node.kind));
      for (const node of facilities) for (const neighbor of node.neighbors) {
        expect(facilitySet.has(nodes[neighbor].kind), `${mapId} adjacent facilities ${node.id}/${neighbor}`).toBe(false);
      }
      expect(maximumReach(nodes, facilities)).toBeLessThanOrEqual(expected.maximumFacilityReach);
      expect(minimumGap(nodes, nodes.filter(node => node.kind === 'shop'))).toBeGreaterThanOrEqual(expected.minimumShopGap);
      expect(minimumGap(nodes, nodes.filter(node => node.kind === 'exchange'))).toBeGreaterThanOrEqual(expected.minimumExchangeGap);
    });
  }

  it('keeps a shop on both lake rings', () => {
    const shops = MAPS.lake.nodes.filter(node => node.kind === 'shop');
    expect(shops.some(node => onRectangle(node, 220, 1308, 150, 820))).toBe(true);
    expect(shops.some(node => onRectangle(node, 628, 1172, 284, 686))).toBe(true);
  });

  it('supplies both coast loops with an exchange and casino', () => {
    const nodes = MAPS.coast.nodes;
    const loops = [
      (node: MapNode) => onRectangle(node, 160, 750, 150, 490),
      (node: MapNode) => onRectangle(node, 750, 1340, 490, 830),
    ];
    for (const loop of loops) for (const kind of ['exchange', 'casino'] as const) {
      expect(nodes.some(node => node.kind === kind && loop(node)), `coast loop missing ${kind}`).toBe(true);
    }
  });

  it('supplies both inner valley loops with an exchange and casino', () => {
    const nodes = MAPS.valley.nodes;
    const loops = [
      (node: MapNode) => onRectangle(node, 360, 600, 270, 630),
      (node: MapNode) => onRectangle(node, 900, 1140, 366, 730),
    ];
    for (const loop of loops) for (const kind of ['exchange', 'casino'] as const) {
      expect(nodes.some(node => node.kind === kind && loop(node)), `valley inner loop missing ${kind}`).toBe(true);
    }
  });

  it.each([
    ['sundered', 'aa4679a5e853ecff1f40e789afcd3e512e031dd3497e330e66395bf7666bd138'],
    ['forest', '10a85d71d7432028cc6fd233e61112910e029d074b9028142728f7f30e5b3c03'],
    ['starSands', 'cf31f9d1a12102862c1004726a4e65a65e6121df4e5fac7aa572a9bf8d77eb5d'],
  ] as const satisfies readonly (readonly [MapId, string])[])('keeps %s map data unchanged', (mapId, baselineSha256) => {
    expect(sha256(MAPS[mapId])).toBe(baselineSha256);
  });
});
