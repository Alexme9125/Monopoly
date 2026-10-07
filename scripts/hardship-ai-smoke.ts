// Reproduce a one-year, four-player hardship AI game on every map.
// Run: node --import tsx scripts/hardship-ai-smoke.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { act, createGame, runAI } from '../src/game/engine.ts';
import { MAPS } from '../src/game/maps.ts';
import { parseSave } from '../src/game/storage.ts';
import type { GameAction, GameState, MapId, PlayerConfig } from '../src/game/types.ts';

const seed = 20261007;
const players: PlayerConfig[] = [
  { name: '谨慎温和', color: '#D55B48', shape: 'circle', ai: true, aiLevel: 'gentle', personality: 'cautious' },
  { name: '平衡凌厉', color: '#277DA8', shape: 'diamond', ai: true, aiLevel: 'fierce', personality: 'balanced' },
  { name: '激进凌厉', color: '#8062C5', shape: 'hexagon', ai: true, aiLevel: 'fierce', personality: 'aggressive' },
  { name: '观察席', color: '#B98B14', shape: 'triangle', ai: false, personality: 'balanced' },
];

function humanAction(state: GameState): GameAction {
  const player = state.players[state.currentPlayerIndex];
  if (state.phase === 'ready') return { type: player.stamina < 35 || player.mood < 35 ? 'rest' : 'roll' };
  if (state.phase === 'end') return { type: 'endTurn' };
  const available = state.pending?.choices.filter(choice => !choice.disabled);
  if (!available?.length) throw new Error(`No legal choice ${state.config.mapId} day ${state.day}`);
  const choice = state.pending?.kind === 'debt'
    ? available.find(entry => entry.id.startsWith('sellstock:'))?.id
      ?? available.find(entry => entry.id.startsWith('pawn:'))?.id
      ?? available.find(entry => entry.id.startsWith('mortgage:'))?.id ?? 'bankrupt'
    : available.find(entry => entry.id === 'leave')?.id ?? available[0].id;
  return { type: 'choose', choiceId: choice };
}

const results: Array<{ mapId: MapId; mode: 'hardship'; seasons: 4; seed: number; players: number;
  endedDay: number; winnerId: string | null; actions: number; maxActionsPerTurn: number;
  encounterActions: number; encounterRestoreChecks: number }> = [];

for (const mapId of Object.keys(MAPS) as MapId[]) {
  let state = createGame({ mapId, mode: 'pve', players, seasons: 4, weatherMode: 'hardship', seed });
  let actions = 0, consecutive = 0, maxActionsPerTurn = 0, encounterActions = 0, encounterRestoreChecks = 0;
  let lastTurn = '';
  while (state.phase !== 'gameover') {
    const key = `${state.day}:${state.currentPlayerIndex}`;
    consecutive = key === lastTurn ? consecutive + 1 : 1;
    lastTurn = key;
    maxActionsPerTurn = Math.max(maxActionsPerTurn, consecutive);
    if (++actions > 20_000 || consecutive > 80) {
      throw new Error(`Loop ${mapId} day ${state.day}: ${state.phase}/${state.pending?.kind}`);
    }
    if (state.pending?.kind === 'event') {
      encounterActions++;
      if (state.pending.data?.eventSource === 'encounter') {
        parseSave(JSON.stringify(state));
        encounterRestoreChecks++;
      }
    }
    const previous = state;
    state = state.seasonReport ? act(state, { type: 'dismissSeason' })
      : state.players[state.currentPlayerIndex].ai ? runAI(state) : act(state, humanAction(state));
    if (state === previous) throw new Error(`Stall ${mapId} day ${state.day}: ${state.phase}/${state.pending?.kind}`);
    if (state.players.some(player => !Number.isSafeInteger(player.cash) || player.stamina < 0 || player.stamina > 100
      || player.mood < 0 || player.mood > 100)) throw new Error(`Invalid player values ${mapId} day ${state.day}`);
  }
  const result = { mapId, mode: 'hardship' as const, seasons: 4 as const, seed, players: players.length,
    endedDay: state.day, winnerId: state.winnerId, actions, maxActionsPerTurn, encounterActions, encounterRestoreChecks };
  results.push(result);
  console.log(JSON.stringify(result));
}

mkdirSync('artifacts/hardship-weather', { recursive: true });
writeFileSync('artifacts/hardship-weather/ai-year-smoke.json', JSON.stringify({ games: results.length, results }, null, 2));
console.log(`Completed ${results.length} four-player hardship games.`);
