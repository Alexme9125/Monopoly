import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/game/maps';
import { getLotLayout, overlap } from '../src/visual/sceneLayout';
import { getRegionPlants, REGION_SCENERY_BOUNDS } from '../src/visual/newRegionScenery';

describe('forest and star-sand scenery clearance', () => {
  for (const mapId of ['forest', 'starSands'] as const) {
    it(`${mapId} reserves roads and usable parcels around scenery`, () => {
      const map = MAPS[mapId];
      const lots = getLotLayout(map);
      const roads = map.nodes.flatMap(node => node.neighbors.filter(id => id > node.id).map(id => {
        const next = map.nodes[id];
        return { left: Math.min(node.x, next.x) - 20, right: Math.max(node.x, next.x) + 20,
          top: Math.min(node.y, next.y) - 20, bottom: Math.max(node.y, next.y) + 20 };
      }));
      const plants = getRegionPlants(map, lots);
      expect(plants.length).toBeGreaterThan(mapId === 'forest' ? 80 : 20);
      for (const scenery of [...plants.map(p => p.bounds), ...REGION_SCENERY_BOUNDS[mapId]]) {
        expect(roads.every(road => !overlap(scenery, road))).toBe(true);
        expect(Object.values(lots).every(lot => !overlap(scenery, lot.bounds))).toBe(true);
      }
      for (const p of plants) expect(REGION_SCENERY_BOUNDS[mapId].every(area => !overlap(p.bounds, area))).toBe(true);
      expect(getRegionPlants(map, lots)).toEqual(plants);
    });
  }
});
