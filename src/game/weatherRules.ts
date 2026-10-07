import type { GameConfig } from './types';

export type WeatherMode = GameConfig['weatherMode'];
export type WeatherDamage = { stamina: number; mood: number };
export type WeatherMovement = { steps: number; backward: boolean };
const NONE: WeatherDamage = { stamina: 0, mood: 0 };

export const isHardshipWeather = (mode: WeatherMode): boolean => mode === 'hardship';
export const canSelectDisasterWeather = (mode: WeatherMode, day: number): boolean => mode === 'hardship' || day >= 22;

export function getWeatherDiceModifier(weatherId: string, mode: WeatherMode): number {
  if (mode === 'hardship') return ({ hot: -2, heat: -3, scorch: -4, mist: -1 } as Record<string, number>)[weatherId] ?? 0;
  return ({ hot: -1, heat: -2, scorch: -4 } as Record<string, number>)[weatherId] ?? 0;
}

export function getWeatherMove(weatherId: string, mode: WeatherMode): WeatherMovement | null {
  const hardship = mode === 'hardship';
  const steps = ({ snow: hardship ? 2 : 1, blizzard: hardship ? 4 : 2,
    freezing: hardship ? 6 : 4, glitch: hardship ? 3 : 2,
    gale: hardship ? 2 : 1, sand: hardship ? 3 : 2,
    sandstorm: hardship ? 6 : 4 } as Record<string, number>)[weatherId];
  return steps ? { steps, backward: weatherId === 'gale' || weatherId === 'sand' || weatherId === 'sandstorm' } : null;
}

export const getGlitchBacktrackSteps = (mode: WeatherMode): number => mode === 'hardship' ? 6 : 4;

export function getWeatherRollDamage(weatherId: string, mode: WeatherMode, steps: number): WeatherDamage {
  if (mode !== 'hardship') {
    if (weatherId === 'scorch') {
      const amount = mode === 'standard' ? Math.min(18, steps * 3) : steps * 3;
      return { stamina: amount, mood: amount };
    }
    if (weatherId === 'sandstorm') return { stamina: 2, mood: 2 };
    if (weatherId === 'haze') return { stamina: 0, mood: 6 };
    return NONE;
  }
  if (weatherId === 'scorch') return { stamina: steps * 3, mood: steps * 6 };
  return ({
    freezing: { stamina: 0, mood: 6 }, drizzle: { stamina: 0, mood: 3 }, rain: { stamina: 0, mood: 5 },
    thunder: { stamina: 0, mood: 3 }, storm: { stamina: 0, mood: 5 }, drought: { stamina: 0, mood: 3 },
    gale: { stamina: 0, mood: 3 }, sand: { stamina: 0, mood: 5 }, sandstorm: { stamina: 3, mood: 8 },
    mist: { stamina: 0, mood: 2 }, fog: { stamina: 0, mood: 4 }, haze: { stamina: 1, mood: 12 },
    paradox: { stamina: 0, mood: 8 },
  } as Record<string, WeatherDamage>)[weatherId] ?? NONE;
}

export function getWeatherLandingDamage(weatherId: string, mode: WeatherMode): WeatherDamage {
  if (mode === 'hardship') return ({
    chill: { stamina: 5, mood: 5 }, snow: { stamina: 2, mood: 3 }, blizzard: { stamina: 8, mood: 10 },
    warm: { stamina: 1, mood: 3 }, hot: { stamina: 2, mood: 5 }, heat: { stamina: 3, mood: 8 },
    drought: { stamina: 1, mood: 0 }, acid: { stamina: 6, mood: 10 },
  } as Record<string, WeatherDamage>)[weatherId] ?? NONE;
  return ({
    chill: { stamina: 4, mood: 0 }, snow: { stamina: 1, mood: 0 }, blizzard: { stamina: 6, mood: 0 },
    warm: { stamina: 1, mood: 1 }, hot: { stamina: 1, mood: 2 }, heat: { stamina: 2, mood: 2 },
    acid: { stamina: 4, mood: 0 },
  } as Record<string, WeatherDamage>)[weatherId] ?? NONE;
}

export function getWeatherLightning(weatherId: string, mode: WeatherMode): { chance: number; stamina: number; mood: number } | null {
  if (weatherId === 'thunder') return mode === 'hardship'
    ? { chance: 0.2, stamina: 14, mood: 7 } : { chance: 0.1, stamina: 12, mood: 0 };
  if (weatherId === 'storm') return mode === 'hardship'
    ? { chance: 0.4, stamina: 16, mood: 10 } : { chance: 0.25, stamina: 12, mood: 0 };
  return null;
}

export function getWeatherPaperLoss(weatherId: string, mode: WeatherMode): { chance: number; cashMin: number; cashMax: number } | null {
  const chance = mode === 'hardship' ? ({ gale: 0.2, sand: 0.3, sandstorm: 0.4 } as Record<string, number>)[weatherId]
    : ({ gale: 0.1, sand: 0.15, sandstorm: 0.25 } as Record<string, number>)[weatherId];
  return chance ? { chance, cashMin: mode === 'hardship' ? 60 : 30, cashMax: mode === 'hardship' ? 240 : 150 } : null;
}

export function getWeatherWetCount(weatherId: string, mode: WeatherMode): number {
  if (weatherId === 'storm') return Infinity;
  if (weatherId === 'drizzle') return mode === 'hardship' ? 2 : 1;
  if (weatherId === 'rain') return mode === 'hardship' ? 3 : 1;
  return 0;
}

export const weatherWetsAllItems = (mode: WeatherMode): boolean => mode !== 'standard';

export function getWeatherDryingChance(weatherId: string, mode: WeatherMode): number {
  if (weatherId === 'drought') return 1;
  if (['breeze', 'gale', 'sand', 'sandstorm'].includes(weatherId)) return mode === 'hardship' ? 0.75 : 0.5;
  return 0.25;
}

export const getFogRentAvoidance = (mode: WeatherMode): number => mode === 'hardship' ? 0.65 : 0.5;

export function getGlitchPenalty(mode: WeatherMode, index: number): WeatherDamage {
  if (mode === 'hardship') return [
    { stamina: 8, mood: 10 }, { stamina: 16, mood: 8 }, { stamina: 3, mood: 8 },
  ][index] ?? NONE;
  return [{ stamina: 6, mood: 0 }, { stamina: 12, mood: 0 }, { stamina: 2, mood: 2 }][index] ?? NONE;
}
