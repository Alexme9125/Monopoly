import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { WEATHERS } from '../src/game/data';
import { createGame } from '../src/game/engine';
import { weatherWeights } from '../src/game/weather';
import { DISASTER, EXTREME, MAP_IDS, MODES, SEASON_DAYS, SEVERE,
  distribution, exactClimate, game, sampleNaturalWeather } from '../scripts/hardship-weather-stats';
import type { GameState } from '../src/game/types';

function atDay(state: GameState, day: number, streak = false) {
  state.day = day;
  state.weatherId = 'clear';
  state.weatherHistory = streak ? ['storm', 'scorch'] : ['clear', 'clear'];
  return weatherWeights(state);
}

describe('hardship natural climate and legacy compatibility', () => {
  it('keeps every standard and challenge weight unchanged at all seasons and both spring disaster gates', () => {
    // Captured from the pre-hardship implementation. Hash sorted full weather vectors,
    // not rounded category percentages, so even a small legacy drift fails.
    const rows = [];
    for (const mode of ['standard', 'challenge'] as const) for (const mapId of MAP_IDS) for (const day of [1, ...SEASON_DAYS.slice(1), 85]) {
      const weights = atDay(game(mapId, mode), day);
      rows.push([mode, mapId, day, Object.entries(weights).sort(([a], [b]) => a.localeCompare(b))]);
    }
    expect(rows).toHaveLength(100);
    expect(createHash('sha256').update(JSON.stringify(rows)).digest('hex'))
      .toBe('a469c5d5b38cdc80201c1a744f8702af7dae1219a2fe67d0bfa93c0f53145943');
  });

  it('makes hardship more severe without removing sunshine or overriding seasonal bans', () => {
    const exact = exactClimate();
    expect(exact.firstYear).toHaveLength(120);
    expect(exact.laterSpring).toHaveLength(30);
    for (const mapId of MAP_IDS) for (const day of SEASON_DAYS) {
      const season = Math.floor((day - 1) / 21) % 4;
      const byMode = Object.fromEntries(MODES.map(mode => {
        const weights = atDay(game(mapId, mode), day);
        const stats = distribution(weights);
        expect(stats.sunny, `${mapId}/${mode}/season${season} sunshine`).toBeGreaterThan(0);
        expect(stats.other).toBeGreaterThanOrEqual(0);
        for (const weather of Object.values(WEATHERS)) {
          expect(weights[weather.id]).toBeGreaterThanOrEqual(0);
          if (mapId !== 'starSands' && !weather.seasons.includes(season)) expect(weights[weather.id]).toBe(0);
        }
        if (day === 1 && mode !== 'hardship') expect(stats.disaster).toBe(0);
        if (day === 1 && mode === 'hardship') expect(stats.disaster).toBeGreaterThan(0);
        return [mode, stats];
      })) as Record<typeof MODES[number], ReturnType<typeof distribution>>;
      expect(byMode.hardship.extreme, `${mapId}/season${season} extreme`).toBeGreaterThan(byMode.challenge.extreme);
      expect(byMode.hardship.disaster, `${mapId}/season${season} disaster`).toBeGreaterThan(byMode.challenge.disaster);
    }
    for (const mapId of MAP_IDS) for (const mode of MODES) {
      const beforeUnlock = distribution(atDay(game(mapId, mode), 21));
      const laterSpring = distribution(atDay(game(mapId, mode), 85));
      if (mode === 'hardship') expect(beforeUnlock.disaster).toBeGreaterThan(0);
      else expect(beforeUnlock.disaster).toBe(0);
      expect(laterSpring.disaster, `${mapId}/${mode} second spring`).toBeGreaterThan(0);
    }
  });

  it('preserves regional climate identities and the consecutive-severe adjustment', () => {
    for (const mode of MODES) for (const day of [...SEASON_DAYS, 85]) {
      const lake = atDay(game('lake', mode), day);
      for (const mapId of ['coast', 'peachHaven', 'grandCity'] as const) {
        expect(atDay(game(mapId, mode), day), `${mapId}/${mode}/day${day}`).toEqual(lake);
      }
      const forest = distribution(atDay(game('forest', mode), day));
      const lakeShare = distribution(lake);
      expect(forest.sunny, `${mode}/day${day} forest sunshine`).toBeGreaterThan(lakeShare.sunny);
      expect(forest.extreme + forest.disaster, `${mode}/day${day} forest severe`)
        .toBeLessThan(lakeShare.extreme + lakeShare.disaster);

      for (const mapId of MAP_IDS) {
        const normal = atDay(game(mapId, mode), day);
        const afterStreak = atDay(game(mapId, mode), day, true);
        for (const id of Object.keys(WEATHERS)) {
          expect(afterStreak[id], `${mapId}/${mode}/day${day}/${id} streak`)
            .toBeCloseTo(normal[id] * (SEVERE.has(id) ? 0.25 : 1), 12);
        }
      }
    }
    for (const day of [...SEASON_DAYS, 85]) {
      const pressure = (mapId: typeof MAP_IDS[number]) => {
        const stats = distribution(atDay(game(mapId, 'hardship'), day));
        return stats.extreme + stats.disaster;
      };
      const mountainOrder = ['lake', 'valley', 'ashCanyon', 'hushedValley', 'sundered'] as const;
      for (let index = 1; index < mountainOrder.length; index++) {
        expect(pressure(mountainOrder[index]), `day ${day}: ${mountainOrder[index - 1]} < ${mountainOrder[index]}`)
          .toBeGreaterThan(pressure(mountainOrder[index - 1]));
      }
    }
    for (const mode of MODES) for (const day of SEASON_DAYS) {
      const sands = atDay(game('starSands', mode), day);
      for (const weather of Object.values(WEATHERS).filter(entry => entry.family === 'frost')) expect(sands[weather.id]).toBe(0);
      if (day === 64) {
        for (const id of ['drizzle', 'rain', 'thunder', 'storm', 'acid', 'heat', 'scorch']) expect(sands[id]).toBe(0);
      }
    }
  });

  it('uses real createGame and act day transitions with reproducible, in-pool draws', () => {
    const sample = sampleNaturalWeather(3, 84);
    expect(sample.totalDays).toBe(10 * 3 * 3 * 84);
    expect(sample.rows).toHaveLength(120);
    for (const row of sample.rows) {
      expect(row.days).toBe(63);
      expect(row.sunny + row.extreme + row.disaster + row.other).toBe(row.days);
      if (row.season === 0 && row.mode !== 'hardship') expect(row.disaster).toBe(0);
    }
    expect(sampleNaturalWeather(1, 21).sha256).toBe(sampleNaturalWeather(1, 21).sha256);
    let firstDayDisaster = false;
    const baseConfig = game('lake', 'standard').config;
    for (let seed = 1; seed <= 1000 && !firstDayDisaster; seed++) {
      const state = createGame({ ...baseConfig,
        weatherMode: 'hardship' as GameState['config']['weatherMode'], seed: Math.imul(seed, 2654435761) >>> 0 });
      firstDayDisaster = DISASTER.has(state.weatherId);
    }
    expect(firstDayDisaster).toBe(true);
    expect([...EXTREME].every(id => !DISASTER.has(id))).toBe(true);
  });
});
