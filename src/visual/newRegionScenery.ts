import type { MapData } from '../game/types';
import { overlap, type Lot, type Rect } from './sceneLayout';

export const REGION_SCENERY_BOUNDS: Record<'forest' | 'starSands', Rect[]> = {
  forest: [
    { left: 605, top: 285, right: 1035, bottom: 705 },
    { left: 320, top: 398, right: 560, bottom: 685 },
    { left: 1045, top: 595, right: 1215, bottom: 740 },
  ],
  starSands: [
    { left: 290, top: 345, right: 493, bottom: 655 },
    { left: 1000, top: 345, right: 1238, bottom: 655 },
    { left: 660, top: 465, right: 831, bottom: 533 },
  ],
};

const random = (i: number, salt: number) => {
  const n = Math.sin(i * 113.19 + salt * 271.7) * 43758.5453;
  return n - Math.floor(n);
};
export type RegionPlant = { x: number; y: number; scale: number; variant: number; bounds: Rect };

export function getRegionPlants(map: MapData, lots: Record<number, Lot>): RegionPlant[] {
  if (map.id !== 'forest' && map.id !== 'starSands') return [];
  const forest = map.id === 'forest';
  const roads = map.nodes.flatMap(node => node.neighbors.filter(n => n > node.id).map(n => {
    const next = map.nodes[n];
    return { left: Math.min(node.x, next.x) - 20, right: Math.max(node.x, next.x) + 20,
      top: Math.min(node.y, next.y) - 20, bottom: Math.max(node.y, next.y) + 20 };
  }));
  const protectedAreas = REGION_SCENERY_BOUNDS[map.id];
  return Array.from({ length: forest ? 540 : 135 }, (_, i) => {
    const x = 125 + random(i, forest ? 32 : 71) * 1250;
    const y = 105 + random(i, forest ? 41 : 83) * 800;
    const scale = .65 + random(i, 57) * (forest ? .58 : .48);
    const bounds = { left: x - 22 * scale, right: x + 24 * scale,
      top: y - (forest ? 58 : 28) * scale, bottom: y + 9 * scale };
    return { x, y, scale, variant: i % 5, bounds };
  }).filter(plant => roads.every(road => !overlap(plant.bounds, road, 7))
    && Object.values(lots).every(lot => !overlap(plant.bounds, lot.bounds, 10))
    && protectedAreas.every(area => !overlap(plant.bounds, area, 8)))
    .sort((a, b) => a.y - b.y);
}
