// Reproducible full-year roaming-encounter smoke across every map and weather mode.
// Run: node --import tsx scripts/roaming-ai-smoke.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { act, createGame, getNetWorth, runAI } from '../src/game/engine.ts';
import { MAPS } from '../src/game/maps.ts';
import { getLandPurchasePrice, getMaxLandLevel } from '../src/game/propertyRules.ts';
import { parseSave } from '../src/game/storage.ts';
import type { GameAction, GameConfig, GameState, MapId, PlayerConfig } from '../src/game/types.ts';

const maps = Object.keys(MAPS) as MapId[];
const modes = ['standard', 'challenge'] as const;
const seed = 20261007;
const players: PlayerConfig[] = [
  { name: '观察席', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' },
  { name: '谨慎温和', color: '#277DA8', shape: 'diamond', ai: true, aiLevel: 'gentle', personality: 'cautious' },
  { name: '平衡凌厉', color: '#8062C5', shape: 'hexagon', ai: true, aiLevel: 'fierce', personality: 'balanced' },
  { name: '激进凌厉', color: '#B98B14', shape: 'triangle', ai: true, aiLevel: 'fierce', personality: 'aggressive' },
];

function humanAction(state: GameState): GameAction {
  const current = state.players[state.currentPlayerIndex];
  if (state.phase === 'ready') return { type: current.stamina < 30 || current.mood < 30 ? 'rest' : 'roll' };
  if (state.phase === 'end') return { type: 'endTurn' };
  const prompt = state.pending;
  if (!prompt) throw new Error('Decision phase without pending prompt');
  const available = prompt.choices.filter(choice => !choice.disabled);
  if (!available.length) throw new Error(`No available choice at ${state.config.mapId} day ${state.day}: ${prompt.kind}`);
  let choice = available.find(entry => entry.id === 'leave')?.id ?? available[0].id;
  if (prompt.kind === 'land' || prompt.kind === 'upgrade') {
    const proposed = available.find(entry => entry.id === 'buy' || entry.id === 'upgrade');
    const nodeId = Number(prompt.data?.nodeId);
    const cost = prompt.kind === 'land' ? getLandPurchasePrice(state, nodeId)
      : Math.ceil((MAPS[state.config.mapId].nodes[nodeId]?.price ?? 0) * 0.75);
    if (proposed && current.cash >= cost + 12_000) choice = proposed.id;
  } else if (prompt.kind === 'rent') choice = available.some(entry => entry.id === 'use_card') ? 'use_card' : 'pay';
  else if (prompt.kind === 'debt') choice = available.find(entry => entry.id.startsWith('sellstock:'))?.id
    ?? available.find(entry => entry.id.startsWith('pawn:'))?.id
    ?? available.find(entry => entry.id.startsWith('mortgage:'))?.id ?? 'bankrupt';
  return { type: 'choose', choiceId: choice };
}

function verifyState(state: GameState): void {
  for (const player of state.players) {
    if (!Number.isSafeInteger(player.cash) || !Number.isFinite(getNetWorth(state, player.id))
      || player.stamina < 0 || player.stamina > 100 || player.mood < 0 || player.mood > 100) {
      throw new Error(`Invalid player values: ${state.config.mapId} day ${state.day} ${player.id}`);
    }
  }
  for (const [id, property] of Object.entries(state.properties)) {
    const node = MAPS[state.config.mapId].nodes[Number(id)];
    const maximum = node.kind === 'land' ? getMaxLandLevel(state.config.mapId) : 0;
    if (!Number.isSafeInteger(property.level) || property.level < 0 || property.level > maximum) {
      throw new Error(`Invalid property level: ${state.config.mapId} node ${id}`);
    }
  }
}

const results: Array<{mapId: MapId; weatherMode: typeof modes[number]; seed: number; endedDay: number;
  winnerId: string | null; ticks: number; maxStepsPerTurn: number; encounterChoices: number;
  continuationChecks: number; restoreChecks: number; assets: number[]}> = [];

for (const mapId of maps) for (const weatherMode of modes) {
  const config: GameConfig = { mapId, mode: 'pve', seasons: 4, weatherMode, seed, players };
  let state = createGame(config);
  let ticks = 0, consecutive = 0, maxStepsPerTurn = 0, encounterChoices = 0;
  let continuationChecks = 0, restoreChecks = 0, lastTurn = '', lastCheckpoint = '';
  while (state.phase !== 'gameover') {
    const key = `${state.day}:${state.currentPlayerIndex}`;
    consecutive = key === lastTurn ? consecutive + 1 : 1;
    lastTurn = key;
    maxStepsPerTurn = Math.max(maxStepsPerTurn, consecutive);
    if (++ticks > 18_000 || consecutive > 80) {
      throw new Error(`Loop ${mapId}/${weatherMode} day ${state.day}: ${state.phase}/${state.pending?.kind}`);
    }
    if (state.pending?.kind === 'event') {
      encounterChoices++;
      if (state.pending.data?.eventSource === 'encounter') {
        parseSave(JSON.stringify(state));
        continuationChecks++;
      }
    }
    const before = state;
    const action = state.seasonReport ? { type: 'dismissSeason' } as const
      : state.players[state.currentPlayerIndex].ai ? null : humanAction(state);
    state = action ? act(state, action) : runAI(state);
    if (state === before) throw new Error(`Stall ${mapId}/${weatherMode} day ${state.day}: ${state.phase}/${state.pending?.kind}`);
    verifyState(state);
    const checkpoint = state.phase === 'gameover' ? `final:${state.day}`
      : state.day > 1 && state.day % 21 === 1 ? `${state.day}:${state.currentPlayerIndex}` : '';
    if (checkpoint && checkpoint !== lastCheckpoint) {
      const restored = parseSave(JSON.stringify(state));
      if (restored.rng !== state.rng || restored.day !== state.day
        || JSON.stringify(restored.properties) !== JSON.stringify(state.properties)
        || restored.players.some((player, index) => player.cash !== state.players[index].cash)) {
        throw new Error(`Save changed economic state: ${mapId}/${weatherMode} day ${state.day}`);
      }
      state = restored;
      restoreChecks++;
      lastCheckpoint = checkpoint;
    }
  }
  const result = { mapId, weatherMode, seed, endedDay: state.day, winnerId: state.winnerId,
    ticks, maxStepsPerTurn, encounterChoices, continuationChecks, restoreChecks,
    assets: state.players.map(player => getNetWorth(state, player.id)) };
  results.push(result);
  console.log(JSON.stringify(result));
}

mkdirSync('artifacts/roaming-encounters', { recursive: true });
writeFileSync('artifacts/roaming-encounters/ai-year-smoke.json', JSON.stringify({games: results.length, results}, null, 2));
console.log(`Completed ${results.length} four-player year-long games without a stall.`);
