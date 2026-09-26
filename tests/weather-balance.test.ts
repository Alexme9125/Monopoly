import { describe, expect, it } from 'vitest';
import { WEATHERS } from '../src/game/data';
import { act, createGame } from '../src/game/engine';
import { weatherWeights } from '../src/game/weather';
import type { GameConfig, GameState } from '../src/game/types';

const summer = {
  clear: 10, soft: 6, fireflies: 3, drizzle: 15, rain: 10, thunder: 8, storm: 1.5,
  warm: 22, hot: 13, heat: 6, scorch: 0.6, breeze: 2, drought: 0.8,
  gale: 0.7, sand: 0.2, sandstorm: 0.1, mist: 0.5, fog: 0.2, haze: 0.1,
  acid: 0.1, glitch: 0.1, paradox: 0.1,
};
const winter = {
  clear: 12, soft: 7, fireflies: 5, chill: 18, snow: 46, blizzard: 2,
  breeze: 4, gale: 1.5, sand: 0.5, sandstorm: 0.1, mist: 2.5, fog: 1,
  haze: 0.2, glitch: 0.1, paradox: 0.1,
};
const extreme = ['blizzard', 'freezing', 'storm', 'scorch', 'sandstorm', 'haze', 'acid', 'glitch', 'paradox'];
const allIds = Object.keys(WEATHERS);
const total = (weights: Record<string, number>) => Object.values(weights).reduce((sum, weight) => sum + weight, 0);

function game(seed = 17, weatherMode: GameConfig['weatherMode'] = 'standard'): GameState {
  return createGame({ mapId: 'lake', mode: 'pve', seasons: 0, weatherMode, seed, players: [
    { name: '旅行家', color: '#e9635c', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '同行者', color: '#6794dd', shape: 'diamond', ai: true, personality: 'cautious' },
  ] });
}

function baseline(state: GameState, day: number) {
  state.day = day;
  state.weatherId = 'clear';
  state.weatherHistory = ['clear', 'clear'];
  return weatherWeights(state);
}

function completeDays(seed: number, mode: GameConfig['weatherMode']) {
  let state = game(seed, mode);
  const days: { day: number; weatherId: string; history: string[] }[] = [];
  while (state.day <= 84) {
    // Day 1 is created by the new-game path; keep it out of the natural day-transition sample.
    if (state.day > 1) days.push({ day: state.day, weatherId: state.weatherId, history: [...(state.weatherHistory ?? [])] });
    if (state.day === 84) break;
    if (state.seasonReport) state = act(state, { type: 'dismissSeason' });
    const previousDay = state.day;
    let actions = 0;
    while (state.day === previousDay) {
      state = act(state, { type: 'endTurn' });
      if (++actions > state.players.length) throw new Error(`Turn progression stalled on day ${previousDay}`);
    }
  }
  return days;
}

describe('seasonal weather balance', () => {
  it('uses the exact 100-point summer and winter standard weights before history adjustments', () => {
    const state = game();
    for (const [day, expected] of [[22, summer], [64, winter]] as const) {
      const weights = baseline(state, day);
      const full = Object.fromEntries(allIds.map(id => [id, expected[id as keyof typeof expected] ?? 0]));
      expect(weights).toEqual(full);
      expect(total(weights)).toBeCloseTo(100, 12);
    }
    expect(baseline(state, 64).freezing).toBe(0);
    for (const id of ['drizzle', 'rain', 'thunder', 'storm', 'acid']) expect(baseline(state, 64)[id]).toBe(0);
    for (const id of ['chill', 'snow', 'blizzard', 'freezing']) expect(baseline(state, 22)[id]).toBe(0);
  });

  it('preserves spring/autumn weighting and applies mode, gate and streak after seasonal eligibility', () => {
    const state = game();
    const spring = baseline(state, 1);
    expect(spring.clear).toBeCloseTo(9 * 1.6);
    expect(spring.rain).toBeCloseTo(4 * 1.6 * 1.45);
    expect(spring.sandstorm).toBeCloseTo(1 * 1.6 * 0.3);
    expect(spring.acid).toBe(0);
    const autumn = baseline(state, 43);
    expect(autumn.clear).toBeCloseTo(9 * 1.6);
    expect(autumn.rain).toBeCloseTo(4 * 0.45);
    expect(autumn.storm).toBeCloseTo(1 * 0.45 * 0.3);
    expect(autumn.acid).toBeCloseTo(1 * 0.45 * 0.08);
    expect(autumn.freezing).toBe(1.6);
    expect(baseline(state, 1).freezing).toBe(0);
    expect(baseline(state, 85).freezing).toBe(0);
    expect(baseline(state, 85).acid).toBeGreaterThan(0);

    for (const day of [22, 43, 64]) {
      state.config.weatherMode = 'standard';
      const standard = baseline(state, day);
      state.config.weatherMode = 'challenge';
      const challenge = baseline(state, day);
      for (const id of allIds) expect(challenge[id]).toBeCloseTo(standard[id] * (extreme.includes(id) ? 2 : 1));
      state.weatherHistory = ['storm', 'scorch'];
      const streak = weatherWeights(state);
      for (const id of allIds) expect(streak[id]).toBeCloseTo(challenge[id] * (extreme.includes(id) ? 0.25 : 1));
      if (day === 43) {
        expect(challenge.freezing).toBe(3.2);
        expect(streak.freezing).toBe(0.8);
      }
    }
    for (const day of [1, 21, 22, 43, 64]) {
      const season = Math.floor((day - 1) / 21) % 4;
      const weights = baseline(state, day);
      for (const weather of Object.values(WEATHERS)) {
        if (!weather.seasons.includes(season) || weather.family === 'disaster' && day < 22) expect(weights[weather.id]).toBe(0);
      }
    }
  });

  it('draws only season-eligible weather over complete 21-day seasons through real turn transitions', () => {
    const count = 32;
    const results: Record<string, Record<string, number>> = {};
    for (const mode of ['standard', 'challenge'] as const) {
      results[mode] = {};
      for (let seed = 1; seed <= count; seed++) {
        const days = completeDays(seed, mode);
        expect(days).toHaveLength(83);
        for (const sample of days) {
          const season = Math.floor((sample.day - 1) / 21) % 4;
          expect(WEATHERS[sample.weatherId].seasons).toContain(season);
          if (sample.day < 22) expect(WEATHERS[sample.weatherId].family).not.toBe('disaster');
          expect(sample.history.at(-1)).toBe(sample.weatherId);
          expect(sample.history.length).toBeLessThanOrEqual(2);
          const key = `${season}:${sample.weatherId}`;
          results[mode][key] = (results[mode][key] ?? 0) + 1;
        }
      }
      const summerHeat = ['warm', 'hot', 'heat', 'scorch'].reduce((sum, id) => sum + (results[mode][`1:${id}`] ?? 0), 0);
      expect(summerHeat).toBeGreaterThan(count * 21 * 0.25);
      const summerRain = ['drizzle', 'rain', 'thunder', 'storm'].reduce((sum, id) => sum + (results[mode][`1:${id}`] ?? 0), 0);
      expect(summerRain).toBeGreaterThan(count * 21 * 0.2);
      expect(summerRain).toBeLessThan(count * 21 * 0.45);
      const summerClear = ['clear', 'soft', 'fireflies'].reduce((sum, id) => sum + (results[mode][`1:${id}`] ?? 0), 0);
      expect(summerClear).toBeGreaterThan(count * 21 * 0.1);
      const winterSnow = results[mode]['3:snow'] ?? 0;
      expect(winterSnow).toBeGreaterThan(count * 21 * 0.3);
      const winterClear = ['clear', 'soft', 'fireflies'].reduce((sum, id) => sum + (results[mode][`3:${id}`] ?? 0), 0);
      expect(winterClear).toBeGreaterThan(count * 21 * 0.12);
      const winterFrost = ['chill', 'snow', 'blizzard', 'freezing'].reduce((sum, id) => sum + (results[mode][`3:${id}`] ?? 0), 0);
      expect(winterFrost).toBeGreaterThan(count * 21 * 0.5);
      expect(results[mode]['2:freezing'] ?? 0).toBeGreaterThan(0);
      for (const season of [0, 1, 3]) expect(results[mode][`${season}:freezing`] ?? 0).toBe(0);
      for (const id of ['drizzle', 'rain', 'thunder', 'storm', 'acid', 'freezing']) expect(results[mode][`3:${id}`] ?? 0).toBe(0);
    }
    expect(completeDays(7, 'standard')).toEqual(completeDays(7, 'standard'));
  });
});
