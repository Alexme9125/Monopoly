import { WEATHERS } from './data';
import type { GameState, MapId } from './types';
import { canSelectDisasterWeather } from './weatherRules';

const EXTREME_WEATHER = new Set(['blizzard', 'freezing', 'storm', 'scorch', 'sandstorm', 'haze', 'acid', 'glitch', 'paradox']);
const MILD = new Set(['clear', 'soft', 'fireflies', 'breeze', 'drought']);
const ROUGH = new Set(['chill', 'snow', 'drizzle', 'rain', 'thunder', 'gale', 'mist', 'fog']);
const HARD = new Set(['blizzard', 'freezing', 'storm']);
const DISASTERS = new Set(['acid', 'glitch', 'paradox']);
const HARDSHIP_MULTIPLIERS: Record<MapId, { extreme: number; disaster: number }> = {
  lake: { extreme: 6, disaster: 12 }, coast: { extreme: 6, disaster: 12 },
  valley: { extreme: 6.5, disaster: 13 }, ashCanyon: { extreme: 7, disaster: 14 },
  hushedValley: { extreme: 7, disaster: 14 }, sundered: { extreme: 8, disaster: 16 },
  forest: { extreme: 5, disaster: 10 }, starSands: { extreme: 7, disaster: 4 },
  peachHaven: { extreme: 6, disaster: 12 }, grandCity: { extreme: 6, disaster: 12 },
};

export function getHardshipWeightMultiplier(mapId: MapId, weatherId: string): number {
  const factors = HARDSHIP_MULTIPLIERS[mapId];
  return DISASTERS.has(weatherId) ? factors.disaster : EXTREME_WEATHER.has(weatherId) ? factors.extreme : 1;
}

function regionalMultiplier(mapId: MapId, weatherId: string): number {
  if (mapId === 'valley') return MILD.has(weatherId) ? 0.92 : ROUGH.has(weatherId) ? 1.15 : HARD.has(weatherId) ? 1.12 : 1;
  if (mapId === 'hushedValley') return MILD.has(weatherId) ? 0.88 : ROUGH.has(weatherId) ? 1.23 : HARD.has(weatherId) ? 1.19 : 1;
  if (mapId === 'ashCanyon') return MILD.has(weatherId) ? 0.885 : ROUGH.has(weatherId) ? 1.225 : HARD.has(weatherId) ? 1.185 : 1;
  if (mapId === 'sundered') return MILD.has(weatherId) ? 0.85 : ROUGH.has(weatherId) ? 1.30 : HARD.has(weatherId) ? 1.25 : 1;
  if (mapId === 'forest') {
    if (EXTREME_WEATHER.has(weatherId)) return 0.35;
    if (['clear', 'soft', 'fireflies'].includes(weatherId)) return 1.8;
    if (weatherId === 'breeze') return 1.4;
    if (['rain', 'frost', 'fog'].includes(WEATHERS[weatherId].family)) return 0.75;
    if (['warm', 'hot', 'heat', 'drought', 'gale', 'sand'].includes(weatherId)) return 0.7;
  }
  return 1;
}

// These are standard-mode weights before the challenge and consecutive-extreme adjustments.
// Each season totals 100 on a day when disasters are available and no extreme streak is active.
const SUMMER: Record<string, number> = {
  clear: 10, soft: 6, fireflies: 3, drizzle: 15, rain: 10, thunder: 8, storm: 1.5,
  warm: 22, hot: 13, heat: 6, scorch: 0.6, breeze: 2, drought: 0.8,
  gale: 0.7, sand: 0.2, sandstorm: 0.1, mist: 0.5, fog: 0.2, haze: 0.1,
  acid: 0.1, glitch: 0.1, paradox: 0.1,
};
const WINTER: Record<string, number> = {
  clear: 12, soft: 7, fireflies: 5, chill: 18, snow: 46, blizzard: 2,
  breeze: 4, gale: 1.5, sand: 0.5, sandstorm: 0.1, mist: 2.5, fog: 1,
  haze: 0.2, glitch: 0.1, paradox: 0.1,
};

// The arid map has its own natural seasons. Its table deliberately permits mild heat and
// drought in spring/autumn/winter while excluding every frost event, winter rain, and
// non-summer heat/scorch. Explicit weather-controller choices remain unrestricted.
const STAR_SANDS: readonly Record<string, number>[] = [
  {
    clear: 13, soft: 8, fireflies: 5, warm: 18, hot: 9, drought: 14,
    drizzle: 5, rain: 3, breeze: 8, gale: 5, sand: 4, sandstorm: 0.4,
    mist: 4, fog: 3, haze: 0.3, glitch: 0.2, paradox: 0.1,
  },
  {
    clear: 10.7, soft: 6, fireflies: 4, warm: 20, hot: 17, heat: 11,
    scorch: 0.8, drought: 16, drizzle: 2, rain: 1.5, thunder: 1, storm: 0.2,
    breeze: 2, gale: 2, sand: 3, sandstorm: 0.3, mist: 1, fog: 0.6,
    haze: 0.1, acid: 0.1, glitch: 0.4, paradox: 0.3,
  },
  {
    clear: 14, soft: 8, fireflies: 6, warm: 18, hot: 8, drought: 15,
    drizzle: 4, rain: 2, thunder: 1, storm: 0.2, breeze: 6, gale: 5,
    sand: 6, sandstorm: 0.4, mist: 3, fog: 2, haze: 0.2,
    acid: 0.3, glitch: 0.5, paradox: 0.4,
  },
  {
    clear: 20, soft: 12, fireflies: 10, warm: 8, drought: 30,
    breeze: 6, gale: 3, sand: 5, sandstorm: 0.3,
    mist: 3, fog: 2, haze: 0.2, glitch: 0.3, paradox: 0.2,
  },
];

/** Weights for the weather about to be drawn on state.day, before its day-start log. */
export function weatherWeights(state: GameState): Record<string, number> {
  const season = Math.floor((state.day - 1) / 21) % 4;
  const recent = state.weatherHistory ?? [state.weatherId];
  const severeStreak = recent.length >= 2 && recent.slice(-2).every(id => EXTREME_WEATHER.has(id));
  const families = [new Set(['clear', 'rain', 'wind']), new Set(['rain', 'heat']), new Set(['clear', 'wind', 'fog']), new Set(['frost', 'fog'])];
  return Object.fromEntries(Object.values(WEATHERS).map(weather => {
    if (state.config.mapId === 'starSands') {
      let weight = STAR_SANDS[season][weather.id] ?? 0;
      if (weather.family === 'disaster' && !canSelectDisasterWeather(state.config.weatherMode, state.day)) weight = 0;
      if (state.config.weatherMode === 'challenge' && EXTREME_WEATHER.has(weather.id)) weight *= 2;
      if (state.config.weatherMode === 'hardship') weight *= getHardshipWeightMultiplier(state.config.mapId, weather.id);
      if (severeStreak && EXTREME_WEATHER.has(weather.id)) weight *= 0.25;
      return [weather.id, weight];
    }
    // Natural draws obey seasons and the disaster gate; a weather controller is handled separately by the engine.
    if (!weather.seasons.includes(season) || weather.family === 'disaster' && !canSelectDisasterWeather(state.config.weatherMode, state.day)) return [weather.id, 0];

    let weight: number;
    if (season === 1 || season === 3) {
      weight = (season === 1 ? SUMMER : WINTER)[weather.id] ?? 0;
    } else {
      // Preserve the original spring and autumn formula, including its standard-mode extreme damping.
      const familyMultiplier = families[season].has(weather.family) ? 1.6 : 0.45;
      weight = Math.max(0, weather.weight) * familyMultiplier;
      if (weather.family === 'rain' && season === 0) weight *= 1.45;
      if (weather.family === 'disaster') weight *= 0.08;
      else if (EXTREME_WEATHER.has(weather.id)) weight *= 0.3;
      if (season === 2 && weather.id === 'freezing') weight = 1.6;
    }
    if (state.config.weatherMode === 'challenge' && EXTREME_WEATHER.has(weather.id)) weight *= 2;
    if (state.config.weatherMode === 'hardship') weight *= getHardshipWeightMultiplier(state.config.mapId, weather.id);
    if (severeStreak && EXTREME_WEATHER.has(weather.id)) weight *= 0.25;
    return [weather.id, weight * regionalMultiplier(state.config.mapId, weather.id)];
  }));
}
