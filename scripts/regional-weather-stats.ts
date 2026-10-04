import { mkdirSync, writeFileSync } from 'node:fs';
import { MAPS } from '../src/game/maps';
import { weatherWeights } from '../src/game/weather';
import type { GameState } from '../src/game/types';

const MAP_IDS = Object.values(MAPS).map(map => map.id);
const MODES: GameState['config']['weatherMode'][] = ['standard', 'challenge'];
const DAYS = { firstSpring: 1, summer: 22, autumn: 43, winter: 64, laterSpring: 85 } as const;
const GROUPS = {
  clear: ['clear', 'soft', 'fireflies'],
  frostSnow: ['chill', 'snow', 'blizzard', 'freezing'],
  rain: ['drizzle', 'rain', 'thunder', 'storm'],
  heatDry: ['warm', 'hot', 'heat', 'scorch', 'drought'],
  windSand: ['breeze', 'gale', 'sand', 'sandstorm'],
  fog: ['mist', 'fog', 'haze'],
  extreme: ['blizzard', 'freezing', 'storm', 'scorch', 'sandstorm', 'haze', 'acid', 'glitch', 'paradox'],
} as const;

const probability = (part: number, whole: number) => Math.round(part / whole * 10000) / 100;
const output: Record<string, Record<string, Record<string, unknown>>> = {};
for (const mapId of MAP_IDS) {
  output[mapId] = {};
  for (const weatherMode of MODES) {
    output[mapId][weatherMode] = {};
    for (const [season, day] of Object.entries(DAYS)) {
      const state = { config: { mapId, weatherMode }, day, weatherId: 'clear', weatherHistory: ['clear', 'clear'] } as GameState;
      const weights = weatherWeights(state);
      const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
      const groups = Object.fromEntries(Object.entries(GROUPS).map(([name, ids]) =>
        [name, probability(ids.reduce((sum, id) => sum + weights[id], 0), total)]));
      output[mapId][weatherMode][season] = { day, groupsPercent: groups, weatherPercent: Object.fromEntries(Object.entries(weights)
        .map(([id, weight]) => [id, probability(weight, total)])) };
    }
  }
}

const target = new URL('../artifacts/regional-weather-probabilities.json', import.meta.url);
mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
writeFileSync(target, `${JSON.stringify({ description: 'Natural weather draws, no extreme streak. Percent values; groups may overlap.', maps: output }, null, 2)}\n`);
console.log(`Wrote ${target.pathname}`);
