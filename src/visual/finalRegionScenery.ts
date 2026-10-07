import type { MapData } from '../game/types';
import { overlap, type Lot, type Rect } from './sceneLayout';

export const FINAL_REGION_LANDMARKS: Record<'hushedValley' | 'grandCity', Rect[]> = {
  hushedValley: [
    { left: 255, top: 220, right: 590, bottom: 304 },
    { left: 492, top: 467, right: 602, bottom: 562 },
    { left: 1010, top: 320, right: 1190, bottom: 410 },
    { left: 285, top: 585, right: 465, bottom: 725 },
    { left: 1050, top: 614, right: 1190, bottom: 724 },
  ],
  grandCity: [
    { left: 600, top: 350, right: 900, bottom: 650 },
    { left: 140, top: 230, right: 240, bottom: 730 },
    { left: 1260, top: 230, right: 1360, bottom: 730 },
  ],
};
export type FinalPlant = { x: number; y: number; scale: number; variant: number; bounds: Rect };
const random = (i: number, salt: number) => {
  const value = Math.sin(i * 127.13 + salt * 213.47) * 43758.5453;
  return value - Math.floor(value);
};
export function getFinalRegionPlants(map: MapData, lots: Record<number, Lot>): FinalPlant[] {
  if (map.id !== 'hushedValley' && map.id !== 'grandCity') return [];
  const wild = map.id === 'hushedValley';
  const roads = map.nodes.flatMap(n => n.neighbors.filter(id => id > n.id).map(id => ({
    left: Math.min(n.x, map.nodes[id].x) - 21, right: Math.max(n.x, map.nodes[id].x) + 21,
    top: Math.min(n.y, map.nodes[id].y) - 21, bottom: Math.max(n.y, map.nodes[id].y) + 21,
  })));
  return Array.from({ length: wild ? 520 : 380 }, (_, i) => {
    const x = 130 + random(i, wild ? 31 : 43) * 1240;
    const y = 102 + random(i, 19) * 797;
    const scale = (wild ? .6 : .48) + random(i, 7) * .27;
    return { x, y, scale, variant: i % 5,
      bounds: { left: x - 24 * scale, right: x + 26 * scale, top: y - 64 * scale, bottom: y + 10 * scale } };
  }).filter(p => !(wild && p.x > 535 && p.y > 407 && p.y < 635)
    && roads.every(r => !overlap(p.bounds, r, 7))
    && Object.values(lots).every(l => !overlap(p.bounds, l.bounds, 9))
    && FINAL_REGION_LANDMARKS[map.id as 'hushedValley' | 'grandCity'].every(r => !overlap(p.bounds, r, 8)))
    .sort((a, b) => a.y - b.y);
}
