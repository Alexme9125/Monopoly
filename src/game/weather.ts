import { WEATHERS } from './data';
import type { GameState } from './types';

const EXTREME_WEATHER = new Set(['blizzard', 'freezing', 'storm', 'scorch', 'sandstorm', 'haze', 'acid', 'glitch', 'paradox']);

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

/** Weights for the weather about to be drawn on state.day, before its day-start log. */
export function weatherWeights(state: GameState): Record<string, number> {
  const season = Math.floor((state.day - 1) / 21) % 4;
  const recent = state.weatherHistory ?? [state.weatherId];
  const severeStreak = recent.length >= 2 && recent.slice(-2).every(id => EXTREME_WEATHER.has(id));
  const families = [new Set(['clear', 'rain', 'wind']), new Set(['rain', 'heat']), new Set(['clear', 'wind', 'fog']), new Set(['frost', 'fog'])];
  return Object.fromEntries(Object.values(WEATHERS).map(weather => {
    // Natural draws obey seasons and the disaster gate; a weather controller is handled separately by the engine.
    if (!weather.seasons.includes(season) || weather.family === 'disaster' && state.day < 22) return [weather.id, 0];

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
    if (severeStreak && EXTREME_WEATHER.has(weather.id)) weight *= 0.25;
    return [weather.id, weight];
  }));
}
