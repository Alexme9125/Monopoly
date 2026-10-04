import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/game/maps';
import { getLotLayout, overlap } from '../src/visual/sceneLayout';
import { CANYON_HAVEN_LANDMARKS, getCanyonHavenPlants } from '../src/visual/canyonHavenScenery';

describe('canyon and haven landmark clearance', () => {
  it.each(['ashCanyon', 'peachHaven'] as const)('%s keeps full scenery bounds away from roads and parcels', mapId => {
    const map = MAPS[mapId], lots = getLotLayout(map);
    const roads = map.nodes.flatMap(n => n.neighbors.filter(id => id > n.id).map(id => ({
      left: Math.min(n.x, map.nodes[id].x) - 20, right: Math.max(n.x, map.nodes[id].x) + 20,
      top: Math.min(n.y, map.nodes[id].y) - 20, bottom: Math.max(n.y, map.nodes[id].y) + 20,
    })));
    const plants = getCanyonHavenPlants(map, lots);
    expect(plants.length).toBeGreaterThan(25);
    for (const bounds of [...CANYON_HAVEN_LANDMARKS[mapId], ...plants.map(p => p.bounds)]) {
      expect(roads.every(r => !overlap(bounds, r)), `road/scenery ${JSON.stringify(bounds)}`).toBe(true);
      expect(Object.values(lots).every(l => !overlap(bounds, l.bounds)), `lot/scenery ${JSON.stringify(bounds)}`).toBe(true);
    }
    expect(getCanyonHavenPlants(map, lots)).toEqual(plants);
  });
});
