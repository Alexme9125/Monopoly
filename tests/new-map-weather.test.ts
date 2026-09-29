import { describe, expect, it } from 'vitest';
import { WEATHERS } from '../src/game/data';
import { act, createGame } from '../src/game/engine';
import { weatherWeights } from '../src/game/weather';
import type { GameConfig, GameState, MapId } from '../src/game/types';

const profiles: GameConfig['players'] = [
  { name: '旅行家', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' },
  { name: '同伴', color: '#277DA8', shape: 'diamond', ai: true, personality: 'cautious' },
];
const make = (mapId: MapId, mode: GameConfig['weatherMode'] = 'standard') => createGame({
  mapId, mode: 'pve', players: profiles, seasons: 0, weatherMode: mode, seed: 1429,
});
const extreme = new Set(['blizzard', 'freezing', 'storm', 'scorch', 'sandstorm', 'haze', 'acid', 'glitch', 'paradox']);
const groups = {
  clear: ['clear', 'soft', 'fireflies'],
  heatDry: ['warm', 'hot', 'heat', 'scorch', 'drought'],
  rain: ['drizzle', 'rain', 'thunder', 'storm'],
  frost: ['chill', 'snow', 'blizzard', 'freezing'],
};
const weightsOn = (state: GameState, day: number) => weatherWeights({ ...state, day, weatherId: 'clear', weatherHistory: ['clear', 'clear'] });
const share = (weights: Record<string, number>, ids: readonly string[]) => ids.reduce((sum, id) => sum + weights[id], 0)
  / Object.values(weights).reduce((sum, weight) => sum + weight, 0);

describe('forest and star-sands natural weather', () => {
  it('makes forest gentler with the original season gate and leaves all four older maps untouched', () => {
    for (const mode of ['standard', 'challenge'] as const) for (const day of [1, 21, 22, 43, 64, 85]) {
      const state = make('lake', mode);
      const lake = weightsOn(state, day);
      expect(weightsOn({ ...state, config: { ...state.config, mapId: 'coast' } }, day)).toEqual(lake);
      const forest = weightsOn({ ...state, config: { ...state.config, mapId: 'forest' } }, day);
      expect(share(forest, groups.clear)).toBeGreaterThan(share(lake, groups.clear));
      expect(share(forest, [...extreme])).toBeLessThan(share(lake, [...extreme]));
      const season = Math.floor((day - 1) / 21) % 4;
      for (const weather of Object.values(WEATHERS)) {
        if (!weather.seasons.includes(season) || weather.family === 'disaster' && day < 22) expect(forest[weather.id]).toBe(0);
      }
    }
  });

  it('keeps the arid summer hot and dry with little rain, while winter has no frost, rain, hot or extreme heat', () => {
    for (const mode of ['standard', 'challenge'] as const) {
      const state = make('starSands', mode);
      const spring = weightsOn(state, 1), summer = weightsOn(state, 22), autumn = weightsOn(state, 43), winter = weightsOn(state, 64);
      expect(share(spring, groups.clear)).toBeGreaterThanOrEqual(0.25);
      expect(share(autumn, groups.clear)).toBeGreaterThanOrEqual(0.25);
      expect(share(spring, groups.heatDry)).toBeGreaterThanOrEqual(0.4);
      expect(share(autumn, groups.heatDry)).toBeGreaterThanOrEqual(0.4);
      for (const shoulder of [spring, autumn]) {
        expect(shoulder.warm).toBeGreaterThan(0);
        expect(shoulder.hot).toBeGreaterThan(0);
        expect(shoulder.heat).toBe(0);
        expect(shoulder.scorch).toBe(0);
      }
      expect(share(summer, groups.heatDry)).toBeGreaterThan(0.60);
      expect(share(summer, groups.heatDry)).toBeLessThan(0.70);
      expect(share(summer, groups.clear)).toBeGreaterThan(0.15);
      expect(share(summer, groups.clear)).toBeLessThan(0.25);
      expect(share(summer, groups.rain)).toBeLessThan(0.08);
      for (const id of [...groups.frost, ...groups.rain, 'hot', 'heat', 'scorch']) expect(winter[id]).toBe(0);
      expect(share(winter, groups.clear)).toBeGreaterThan(0.4);
      expect(winter.warm).toBeGreaterThan(0);
      expect(winter.drought).toBeGreaterThan(0);
      for (const id of groups.frost) for (const day of [1, 22, 43, 64]) expect(weightsOn(state, day)[id]).toBe(0);
    }
  });

  it('retains challenge doubling, the first-spring disaster gate and the two-extreme streak suppression', () => {
    for (const mapId of ['forest', 'starSands'] as const) for (const day of [1, 22, 43, 64, 85]) {
      const standard = make(mapId), challenge = make(mapId, 'challenge');
      const baseline = weightsOn(standard, day), hard = weightsOn(challenge, day);
      for (const weather of Object.values(WEATHERS)) {
        expect(hard[weather.id]).toBeCloseTo(baseline[weather.id] * (extreme.has(weather.id) ? 2 : 1), 12);
        if (day < 22 && weather.family === 'disaster') expect(hard[weather.id]).toBe(0);
      }
      const streak = weatherWeights({ ...challenge, day, weatherHistory: ['storm', 'sandstorm'] });
      for (const weather of Object.values(WEATHERS)) {
        expect(streak[weather.id]).toBeCloseTo(hard[weather.id] * (extreme.has(weather.id) ? 0.25 : 1), 12);
      }
    }
  });

  it('draws only positive-weight weather during an 84-day natural progression on both maps', () => {
    for (const mapId of ['forest', 'starSands'] as const) for (const mode of ['standard', 'challenge'] as const) {
      let state = make(mapId, mode);
      for (let day = 1; day <= 84; day++) {
        expect(state.day).toBe(day);
        expect(weightsOn(state, day)[state.weatherId], `${mapId}/${mode}/day${day}/${state.weatherId}`).toBeGreaterThan(0);
        if (day <= 21) expect(WEATHERS[state.weatherId].family).not.toBe('disaster');
        if (day === 84) break;
        if (state.seasonReport) state = act(state, { type: 'dismissSeason' });
        let actions = 0;
        while (state.day === day) {
          const next = act(state, { type: 'endTurn' });
          expect(next).not.toBe(state);
          state = next;
          if (++actions > state.players.length) throw new Error(`day ${day} did not advance`);
        }
      }
    }
  });

  it('allows a deliberate weather-controller override across the arid season boundary', () => {
    let state = make('starSands');
    state.day = 21;
    state.weatherId = 'clear';
    state.players[0].statuses.push({ id: 'weather:snow', remaining: 1 });
    state = act(state, { type: 'endTurn' });
    state = act(state, { type: 'endTurn' });
    expect(state.day).toBe(22);
    expect(state.weatherId).toBe('snow');
    expect(weightsOn(state, 22).snow).toBe(0);
  });
});
