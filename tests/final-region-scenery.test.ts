import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/game/maps';
import { getLotLayout, overlap } from '../src/visual/sceneLayout';
import { FINAL_REGION_LANDMARKS, getFinalRegionPlants } from '../src/visual/finalRegionScenery';

describe('river wilderness and city scenery clearance', () => {
  it.each(['hushedValley','grandCity'] as const)('%s keeps complete landmarks and tree crowns off roads and lots', mapId => {
    const map=MAPS[mapId],lots=getLotLayout(map);
    const roads=map.nodes.flatMap(n=>n.neighbors.filter(id=>id>n.id).map(id=>({
      left:Math.min(n.x,map.nodes[id].x)-20,right:Math.max(n.x,map.nodes[id].x)+20,
      top:Math.min(n.y,map.nodes[id].y)-20,bottom:Math.max(n.y,map.nodes[id].y)+20,
    })));
    const plants=getFinalRegionPlants(map,lots);
    expect(plants.length).toBeGreaterThan(20);
    for(const bounds of [...FINAL_REGION_LANDMARKS[mapId],...plants.map(p=>p.bounds)]){
      expect(roads.every(r=>!overlap(bounds,r)),`road ${JSON.stringify(bounds)}`).toBe(true);
      expect(Object.values(lots).every(l=>!overlap(bounds,l.bounds)),`lot ${JSON.stringify(bounds)}`).toBe(true);
    }
    expect(getFinalRegionPlants(map,lots)).toEqual(plants);
  });
});
