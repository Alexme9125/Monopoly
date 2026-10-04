import { describe, expect, it } from 'vitest';
import { WEATHERS } from '../src/game/data';
import { createGame } from '../src/game/engine';
import { weatherWeights } from '../src/game/weather';
import type { GameConfig, MapId } from '../src/game/types';

const mild = new Set(['clear', 'soft', 'fireflies', 'breeze', 'drought']);
const rough = new Set(['chill', 'snow', 'drizzle', 'rain', 'thunder', 'gale', 'mist', 'fog']);
const hard = new Set(['blizzard', 'freezing', 'storm']);
const extreme = new Set(['blizzard', 'freezing', 'storm', 'scorch', 'sandstorm', 'haze', 'acid', 'glitch', 'paradox']);
const adverse = [...rough, ...hard];

function state(mapId: MapId, weatherMode: GameConfig['weatherMode']) {
  return createGame({ mapId, mode: 'pve', seasons: 4, weatherMode, seed: 2107,
    players: [
      { name: '旅人', color: '#a65b43', shape: 'circle', ai: false, personality: 'balanced' },
      { name: '同行', color: '#389582', shape: 'diamond', ai: true, personality: 'cautious' },
    ] });
}

function weights(mapId: MapId, weatherMode: GameConfig['weatherMode'], day: number, streak = false) {
  const game = state(mapId, weatherMode);
  game.day = day;
  game.weatherId = 'clear';
  game.weatherHistory = streak ? ['storm', 'scorch'] : ['clear', 'clear'];
  return weatherWeights(game);
}

const share = (result: Record<string, number>) => adverse.reduce((sum, id) => sum + result[id], 0)
  / Object.values(result).reduce((sum, weight) => sum + weight, 0);

describe('Ash Canyon and Peach Haven climate', () => {
  it('places Ash Canyon adverse-weather share strictly between Valley and Sundered every season and mode', () => {
    for (const mode of ['standard', 'challenge'] as const) for (const day of [1, 22, 43, 64]) {
      const valley = weights('valley', mode, day);
      const canyon = weights('ashCanyon', mode, day);
      const sundered = weights('sundered', mode, day);
      expect(share(valley)).toBeLessThan(share(canyon));
      expect(share(canyon)).toBeLessThan(share(sundered));
      for (const weather of Object.values(WEATHERS)) {
        const factor = mild.has(weather.id) ? 0.885 : rough.has(weather.id) ? 1.225 : hard.has(weather.id) ? 1.185 : 1;
        expect(canyon[weather.id], `${mode}/day${day}/${weather.id}`).toBeCloseTo(weights('lake', mode, day)[weather.id] * factor, 12);
      }
      const season = Math.floor((day - 1) / 21) % 4;
      for (const weather of Object.values(WEATHERS)) {
        if (!weather.seasons.includes(season) || (weather.family === 'disaster' && day < 22)) expect(canyon[weather.id]).toBe(0);
      }
      if (day === 22) for (const id of ['chill', 'snow', 'blizzard', 'freezing']) expect(canyon[id]).toBe(0);
      if (day === 64) for (const id of ['drizzle', 'rain', 'thunder', 'storm', 'acid']) expect(canyon[id]).toBe(0);
    }
  });

  it('keeps Peach Haven exactly equal to Lakeside across seasons, modes, disaster gate and extreme streak', () => {
    for (const mode of ['standard', 'challenge'] as const) for (const day of [1, 21, 22, 43, 64, 85]) {
      for (const streak of [false, true]) {
        const lake = weights('lake', mode, day, streak);
        const haven = weights('peachHaven', mode, day, streak);
        expect(haven).toEqual(lake);
        if (day < 22) for (const weather of Object.values(WEATHERS)) {
          if (weather.family === 'disaster') expect(haven[weather.id]).toBe(0);
        }
        if (streak) {
          const normal = weights('peachHaven', mode, day);
          for (const id of Object.keys(haven)) expect(haven[id]).toBeCloseTo(normal[id] * (extreme.has(id) ? 0.25 : 1), 12);
        }
      }
    }
  });
});
