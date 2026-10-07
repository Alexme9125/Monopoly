import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WEATHERS } from '../src/game/data';
import { act, createGame } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import { weatherWeights } from '../src/game/weather';
import type { GameConfig, GameState, MapId } from '../src/game/types';

export type ClimateMode = 'standard' | 'challenge' | 'hardship';
export const MODES: ClimateMode[] = ['standard', 'challenge', 'hardship'];
export const MAP_IDS = Object.keys(MAPS) as MapId[];
export const SEASON_DAYS = [1, 22, 43, 64] as const;
export const SUNNY = new Set(['clear', 'soft', 'fireflies']);
export const EXTREME = new Set(['blizzard', 'freezing', 'storm', 'scorch', 'sandstorm', 'haze']);
export const DISASTER = new Set(['acid', 'glitch', 'paradox']);
export const SEVERE = new Set([...EXTREME, ...DISASTER]);
interface SampleRow { mapId: MapId; mode: ClimateMode; season: number; days: number;
  sunny: number; extreme: number; disaster: number; other: number;
  afterTwoSevereDays: number; severeAfterStreak: number; }

const players: GameConfig['players'] = [
  { name: '统计员', color: '#d25c4e', shape: 'circle', ai: false, personality: 'balanced' },
  { name: '同行者', color: '#478ba8', shape: 'diamond', ai: true, personality: 'cautious' },
];

export function game(mapId: MapId, mode: ClimateMode, seed = 17): GameState {
  return createGame({ mapId, mode: 'pve', seasons: 0, weatherMode: mode as GameConfig['weatherMode'], seed, players });
}

export function distribution(weights: Record<string, number>) {
  const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  if (!(total > 0) || Object.values(weights).some(weight => !Number.isFinite(weight) || weight < 0)) {
    throw new Error('Invalid natural-weather weights');
  }
  const share = (ids: Set<string>) => [...ids].reduce((sum, id) => sum + (weights[id] ?? 0), 0) / total;
  const sunny = share(SUNNY), extreme = share(EXTREME), disaster = share(DISASTER);
  return { totalWeight: total, sunny, extreme, disaster, other: 1 - sunny - extreme - disaster };
}

/** First-year seasons, including the day-1 disaster gate, plus later spring. */
export function exactClimate() {
  const firstYear = [];
  const laterSpring = [];
  for (const mapId of MAP_IDS) for (const mode of MODES) for (const day of [...SEASON_DAYS, 85]) {
    const state = game(mapId, mode);
    state.day = day;
    state.weatherId = 'clear';
    state.weatherHistory = ['clear', 'clear'];
    const weights = weatherWeights(state);
    const ordinary = distribution(weights);
    state.weatherHistory = ['storm', 'scorch'];
    const afterStreak = distribution(weatherWeights(state));
    const row = { mapId, mode, season: Math.floor((day - 1) / 21) % 4,
      day, ...ordinary, afterStreak: { sunny: afterStreak.sunny,
        extreme: afterStreak.extreme, disaster: afterStreak.disaster } };
    if (day === 85) laterSpring.push(row); else firstYear.push(row);
  }
  return { firstYear, laterSpring };
}

/** Actual game transitions; no player rolls or weather-controller overrides. */
export function sampleNaturalWeather(seedsPerCombination = 20, daysPerGame = 84) {
  const rows: SampleRow[] = [];
  const digest = createHash('sha256');
  let totalDays = 0;
  for (const mapId of MAP_IDS) for (const mode of MODES) {
    const perSeason = Array.from({ length: 4 }, () => ({ days: 0, sunny: 0, extreme: 0, disaster: 0, other: 0,
      afterTwoSevereDays: 0, severeAfterStreak: 0 }));
    for (let seedIndex = 1; seedIndex <= seedsPerCombination; seedIndex++) {
      const seed = Math.imul(seedIndex, 2654435761) >>> 0;
      let state = game(mapId, mode, seed);
      const previous: string[] = [];
      for (let sampleDay = 1; sampleDay <= daysPerGame; sampleDay++) {
        if (state.day !== sampleDay) throw new Error(`${mapId}/${mode}: day ${sampleDay} did not advance`);
        const preDrawState = { ...state, weatherId: previous.at(-1) ?? 'clear', weatherHistory: previous.slice(-2) };
        const possible = weatherWeights(preDrawState)[state.weatherId];
        if (!(possible > 0)) throw new Error(`${mapId}/${mode}/day${state.day}: ineligible ${state.weatherId}`);
        const expectedHistory = [...previous, state.weatherId].slice(-2);
        if (JSON.stringify(state.weatherHistory) !== JSON.stringify(expectedHistory)) {
          throw new Error(`${mapId}/${mode}/day${state.day}: weather history drift`);
        }
        const streak = previous.length >= 2 && previous.slice(-2).every(id => SEVERE.has(id));
        const row = perSeason[Math.floor((state.day - 1) / 21) % 4];
        row.days++;
        const bucket = SUNNY.has(state.weatherId) ? 'sunny' : EXTREME.has(state.weatherId) ? 'extreme'
          : DISASTER.has(state.weatherId) ? 'disaster' : 'other';
        row[bucket]++;
        if (streak) { row.afterTwoSevereDays++; if (SEVERE.has(state.weatherId)) row.severeAfterStreak++; }
        digest.update(`${mapId}/${mode}/${seed}/${state.day}/${state.weatherId}\n`);
        totalDays++;
        previous.push(state.weatherId);
        if (sampleDay === daysPerGame) break;
        const oldDay = state.day;
        let actions = 0;
        while (state.day === oldDay) {
          if (state.seasonReport) state = act(state, { type: 'dismissSeason' });
          const next = act(state, { type: 'endTurn' });
          if (next === state || ++actions > state.players.length) {
            throw new Error(`${mapId}/${mode}/day${oldDay}: turn progression stalled`);
          }
          state = next;
        }
      }
    }
    perSeason.forEach((counts, season) => rows.push({ mapId, mode, season, ...counts }));
  }
  return { seedsPerCombination, daysPerGame, totalDays, sha256: digest.digest('hex'), rows };
}

const percent = (value: number) => (value * 100).toFixed(4);
function markdown(exact: ReturnType<typeof exactClimate>) {
  const lines = ['# 天气自然抽取概率（%）', '',
    '春季为首年第 1 天；标准、挑战在第 22 天前禁用灾难。第二年春季另列下表。', '',
    '| 地图 | 季节 | 档位 | 晴好 | 非灾难极端 | 灾难 | 连续两天严重后极端 | 连续两天严重后灾难 |',
    '|---|---|---|---:|---:|---:|---:|---:|'];
  for (const row of exact.firstYear) lines.push(`| ${MAPS[row.mapId].name} | ${['春', '夏', '秋', '冬'][row.season]} | ${row.mode} | ${percent(row.sunny)} | ${percent(row.extreme)} | ${percent(row.disaster)} | ${percent(row.afterStreak.extreme)} | ${percent(row.afterStreak.disaster)} |`);
  lines.push('', '## 第二年春季（第 85 天）', '', '| 地图 | 档位 | 晴好 | 非灾难极端 | 灾难 |', '|---|---|---:|---:|---:|');
  for (const row of exact.laterSpring) lines.push(`| ${MAPS[row.mapId].name} | ${row.mode} | ${percent(row.sunny)} | ${percent(row.extreme)} | ${percent(row.disaster)} |`);
  return `${lines.join('\n')}\n`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const outputDir = resolve('artifacts/hardship-weather');
  mkdirSync(outputDir, { recursive: true });
  const exact = exactClimate();
  const sample = sampleNaturalWeather();
  writeFileSync(resolve(outputDir, 'probabilities.json'), `${JSON.stringify(exact, null, 2)}\n`);
  writeFileSync(resolve(outputDir, 'sample.json'), `${JSON.stringify(sample, null, 2)}\n`);
  writeFileSync(resolve(outputDir, 'probabilities.md'), markdown(exact));
  console.log(`Wrote ${exact.firstYear.length} first-year and ${exact.laterSpring.length} later-spring exact rows; sampled ${sample.totalDays} natural days.`);
  console.log(`Sample SHA256: ${sample.sha256}`);
}
