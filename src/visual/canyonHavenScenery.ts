import type { MapData } from '../game/types';
import { overlap, type Lot, type Rect } from './sceneLayout';

export const CANYON_HAVEN_LANDMARKS: Record<'ashCanyon' | 'peachHaven', Rect[]> = {
  ashCanyon: [
    { left: 260, top: 276, right: 550, bottom: 373 },
    { left: 1050, top: 326, right: 1240, bottom: 424 },
    { left: 262, top: 578, right: 518, bottom: 663 },
  ],
  peachHaven: [
    { left: 790, top: 238, right: 1205, bottom: 415 },
    { left: 800, top: 602, right: 1120, bottom: 779 },
    { left: 1140, top: 594, right: 1247, bottom: 779 },
    { left: 256, top: 415, right: 344, bottom: 593 },
    { left: 467, top: 410, right: 581, bottom: 594 },
  ],
};

export type CanyonHavenPlant = { x: number; y: number; scale: number; variant: number; bounds: Rect };
const random = (i: number, salt: number) => {
  const value = Math.sin(i * 109.17 + salt * 291.3) * 43758.5453;
  return value - Math.floor(value);
};

export function getCanyonHavenPlants(map: MapData, lots: Record<number, Lot>): CanyonHavenPlant[] {
  if (map.id !== 'ashCanyon' && map.id !== 'peachHaven') return [];
  const ash = map.id === 'ashCanyon';
  const roads = map.nodes.flatMap(n => n.neighbors.filter(id => id > n.id).map(id => ({
    left: Math.min(n.x, map.nodes[id].x) - 21, right: Math.max(n.x, map.nodes[id].x) + 21,
    top: Math.min(n.y, map.nodes[id].y) - 21, bottom: Math.max(n.y, map.nodes[id].y) + 21,
  })));
  return Array.from({ length: ash ? 420 : 580 }, (_, i) => {
    const x = 122 + random(i, ash ? 17 : 23) * 1260;
    const y = 105 + random(i, 29) * 800;
    const scale = .56 + random(i, 7) * .4;
    return { x, y, scale, variant: i % 5,
      bounds: { left: x - 25 * scale, right: x + 26 * scale, top: y - 61 * scale, bottom: y + 10 * scale } };
  }).filter(p => !(ash && p.x > 687 && p.x < 924)
    && roads.every(r => !overlap(p.bounds, r, 6))
    && Object.values(lots).every(l => !overlap(p.bounds, l.bounds, 10))
    && CANYON_HAVEN_LANDMARKS[map.id as 'ashCanyon' | 'peachHaven'].every(r => !overlap(p.bounds, r, 8)))
    .sort((a, b) => a.y - b.y);
}
