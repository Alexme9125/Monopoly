import { describe, expect, it } from 'vitest';
import { WEATHERS } from '../src/game/data';
import { act, createGame } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import type { GameConfig, GameState, MapId } from '../src/game/types';
import { getHardshipWeightMultiplier, weatherWeights } from '../src/game/weather';

const maps = Object.keys(MAPS) as MapId[];
const severe = new Set(['blizzard', 'freezing', 'storm', 'scorch', 'sandstorm', 'haze', 'acid', 'glitch', 'paradox']);
const disasters = new Set(['acid', 'glitch', 'paradox']);
const extreme = [...severe].filter(id => !disasters.has(id));
const good = ['clear', 'soft', 'fireflies'];

function game(mapId: MapId, weatherMode: GameConfig['weatherMode'], seed = 991): GameState {
  return createGame({ mapId, mode: 'pve', seasons: 0, weatherMode, seed,
    players: [
      { name: '旅者', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' },
      { name: '同行者', color: '#277DA8', shape: 'diamond', ai: true, personality: 'balanced' },
    ] });
}

const sum = (weights: Record<string, number>, ids: string[]) => ids.reduce((total, id) => total + weights[id], 0);
const share = (weights: Record<string, number>, ids: string[]) => sum(weights, ids) / Object.values(weights).reduce((total, weight) => total + weight, 0);

describe('hardship natural weather balance', () => {
  it('multiplies the established regional and seasonal baselines without changing the two older modes', () => {
    const factors: Record<MapId, [number, number]> = {
      lake: [6, 12], coast: [6, 12], valley: [6.5, 13], ashCanyon: [7, 14],
      hushedValley: [7, 14], sundered: [8, 16], forest: [5, 10],
      starSands: [7, 4], peachHaven: [6, 12], grandCity: [6, 12],
    };
    for (const mapId of maps) for (const day of [85, 22, 43, 64]) {
      const state = game(mapId, 'standard');
      state.day = day; state.weatherHistory = ['clear', 'clear'];
      const standard = weatherWeights(state);
      state.config.weatherMode = 'challenge';
      const challenge = weatherWeights(state);
      state.config.weatherMode = 'hardship';
      const hardship = weatherWeights(state);
      const season = Math.floor((day - 1) / 21) % 4;
      for (const weather of Object.values(WEATHERS)) {
        const oldFactor = severe.has(weather.id) ? 2 : 1;
        expect(challenge[weather.id], `${mapId}/${day}/${weather.id}/challenge`).toBeCloseTo(standard[weather.id] * oldFactor, 12);
        const factor = disasters.has(weather.id) ? factors[mapId][1] : extreme.includes(weather.id) ? factors[mapId][0] : 1;
        expect(getHardshipWeightMultiplier(mapId, weather.id)).toBe(factor);
        expect(hardship[weather.id], `${mapId}/${day}/${weather.id}/hardship`).toBeCloseTo(standard[weather.id] * factor, 12);
        if (mapId !== 'starSands' && !weather.seasons.includes(season)) expect(hardship[weather.id]).toBe(0);
      }
      expect(share(hardship, good)).toBeGreaterThan(0.03);
      expect(share(hardship, extreme)).toBeGreaterThan(share(standard, extreme));
      expect(share(hardship, [...disasters])).toBeGreaterThanOrEqual(share(standard, [...disasters]));
    }
  });

  it('opens natural disasters on day one only for hardship, retaining all season prohibitions', () => {
    for (const mapId of maps) {
      const state = game(mapId, 'standard');
      state.day = 1;
      for (const mode of ['standard', 'challenge'] as const) {
        state.config.weatherMode = mode;
        const weights = weatherWeights(state);
        expect(sum(weights, [...disasters]), `${mapId}/${mode}`).toBe(0);
      }
      state.config.weatherMode = 'hardship';
      const weights = weatherWeights(state);
      expect(sum(weights, [...disasters]), mapId).toBeGreaterThan(0);
      for (const weather of Object.values(WEATHERS)) if (!weather.seasons.includes(0) && mapId !== 'starSands') {
        expect(weights[weather.id], `${mapId}/${weather.id}`).toBe(0);
      }
    }
    const firstNaturalDisaster = Array.from({ length: 1000 }, (_, index) => Math.imul(index + 1, 2654435761) >>> 0)
      .map(seed => game('lake', 'hardship', seed)).find(state => disasters.has(state.weatherId));
    expect(firstNaturalDisaster).toBeDefined();
    const ordinary = game('lake', 'challenge', firstNaturalDisaster!.config.seed);
    expect(disasters.has(ordinary.weatherId)).toBe(false);
  });

  it('retains the quarter-weight shield after two consecutive severe days', () => {
    for (const mapId of maps) for (const day of [1, 22, 43, 64]) {
      const state = game(mapId, 'hardship');
      state.day = day; state.weatherHistory = ['clear', 'clear'];
      const ordinary = weatherWeights(state);
      state.weatherHistory = ['storm', 'glitch'];
      const streak = weatherWeights(state);
      for (const weather of Object.values(WEATHERS)) expect(streak[weather.id], `${mapId}/${day}/${weather.id}`)
        .toBeCloseTo(ordinary[weather.id] * (severe.has(weather.id) ? 0.25 : 1), 12);
    }
  });

  it('keeps all natural rolls seasonal in real turn progression', () => {
    for (const mapId of maps) {
      let state = game(mapId, 'hardship', 733);
      const seen = new Set<number>();
      while (state.day < 85) {
        if (state.seasonReport) state = act(state, { type: 'dismissSeason' });
        const former = state.day;
        let turns = 0;
        while (state.day === former) {
          state = act(state, { type: 'endTurn' });
          if (++turns > state.players.length) throw new Error(`Weather progression stuck at ${mapId}/${former}`);
        }
        const season = Math.floor((state.day - 1) / 21) % 4;
        seen.add(season);
        if (mapId !== 'starSands') expect(WEATHERS[state.weatherId].seasons, `${mapId}/day${state.day}`).toContain(season);
        if (mapId === 'starSands' && season === 3) {
          expect(['chill', 'snow', 'blizzard', 'freezing', 'drizzle', 'rain', 'storm', 'heat', 'scorch', 'hot']).not.toContain(state.weatherId);
        }
      }
      expect([...seen].sort()).toEqual([0, 1, 2, 3]);
    }
  });
});
