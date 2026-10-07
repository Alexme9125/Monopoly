// Reproducible four-player, one-year smoke for the two final regions.
// Run: node --import tsx scripts/new-regions-ai-smoke.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { act, createGame, getNetWorth, runAI } from '../src/game/engine.ts';
import { MAPS } from '../src/game/maps.ts';
import { getAvailableLandLevel, getLandPurchasePrice, getMaxLandLevel } from '../src/game/propertyRules.ts';
import { parseSave } from '../src/game/storage.ts';
import type { GameAction, GameConfig, GameState, MapId, PlayerConfig } from '../src/game/types.ts';

const maps: MapId[] = ['hushedValley', 'grandCity'];
const seeds = [1978, 31027];
const modes = ['standard', 'challenge'] as const;
const players: PlayerConfig[] = [
  { name: '观察席', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' },
  { name: '谨慎温和', color: '#277DA8', shape: 'diamond', ai: true, aiLevel: 'gentle', personality: 'cautious' },
  { name: '平衡凌厉', color: '#8062C5', shape: 'hexagon', ai: true, aiLevel: 'fierce', personality: 'balanced' },
  { name: '激进凌厉', color: '#B98B14', shape: 'triangle', ai: true, aiLevel: 'fierce', personality: 'aggressive' },
];

function humanAction(state: GameState): GameAction {
  if (state.phase === 'ready') return { type: state.players[0].stamina < 30 || state.players[0].mood < 30 ? 'rest' : 'roll' };
  if (state.phase === 'end') return { type: 'endTurn' };
  const prompt = state.pending;
  if (!prompt) throw new Error('Decision phase without prompt');
  const available = prompt.choices.filter(choice => !choice.disabled);
  if (!available.length) throw new Error(`No legal human choice: ${prompt.kind}`);
  const reserve = 12_000;
  let choice = available.find(entry => entry.id === 'leave')?.id ?? available[0].id;
  if (prompt.kind === 'land' || prompt.kind === 'upgrade') {
    const proposed = available.find(entry => entry.id === 'buy' || entry.id === 'upgrade');
    const cost = prompt.kind === 'land' ? getLandPurchasePrice(state, Number(prompt.data?.nodeId))
      : Math.ceil((MAPS[state.config.mapId].nodes[Number(prompt.data?.nodeId)]?.price ?? 0) * 0.75);
    if (proposed && state.players[0].cash >= cost + reserve) choice = proposed.id;
  } else if (prompt.kind === 'rent') choice = available.some(entry => entry.id === 'use_card') ? 'use_card' : 'pay';
  else if (prompt.kind === 'debt') choice = available.find(entry => entry.id.startsWith('sellstock:'))?.id
    ?? available.find(entry => entry.id.startsWith('pawn:'))?.id
    ?? available.find(entry => entry.id.startsWith('mortgage:'))?.id ?? 'bankrupt';
  else if (prompt.kind === 'event') choice = available[0].id;
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

type Result = { mapId: MapId; weatherMode: 'standard' | 'challenge'; seed: number; endedDay: number;
  winnerId: string | null; ticks: number; maxStepsPerTurn: number; bankPurchases: number;
  prefabPurchases: number; restoreChecks: number; lastAssets: number[] };

const results: Result[] = [];
for (const mapId of maps) for (const weatherMode of modes) for (const seed of seeds) {
  const config: GameConfig = { mapId, mode: 'pve', seasons: 4, weatherMode, seed, players };
  let state = createGame(config);
  let ticks = 0, consecutive = 0, maxStepsPerTurn = 0, bankPurchases = 0, prefabPurchases = 0, restoreChecks = 0;
  let lastTurn = '';
  let lastCheckpoint = '';
  while (state.phase !== 'gameover') {
    const key = `${state.day}:${state.currentPlayerIndex}`;
    consecutive = key === lastTurn ? consecutive + 1 : 1;
    lastTurn = key;
    maxStepsPerTurn = Math.max(maxStepsPerTurn, consecutive);
    if (++ticks > 12_000 || consecutive > 60) throw new Error(`Loop ${mapId}/${weatherMode}/${seed}, day ${state.day}, ${state.phase}/${state.pending?.kind}`);
    const before = state;
    const action = state.seasonReport ? { type: 'dismissSeason' } as const
      : state.players[state.currentPlayerIndex].ai ? null : humanAction(state);
    state = action ? act(state, action) : runAI(state);
    if (state === before) throw new Error(`Stall ${mapId}/${weatherMode}/${seed}, day ${state.day}, ${state.phase}/${state.pending?.kind}`);
    verifyState(state);
    for (const [id, property] of Object.entries(state.properties)) {
      if (before.properties[Number(id)]) continue;
      const node = MAPS[mapId].nodes[Number(id)];
      const oldLevel = getAvailableLandLevel(before, Number(id));
      const price = getLandPurchasePrice(before, Number(id));
      if (property.level !== oldLevel || state.availablePropertyLevels?.[Number(id)] !== undefined) {
        throw new Error(`Wrong bank building delivery: ${mapId} node ${id}`);
      }
      if (before.weatherId !== 'glitch') {
        const formerOwnerCash = before.players.find(player => player.id === property.ownerId)!.cash;
        const currentOwnerCash = state.players.find(player => player.id === property.ownerId)!.cash;
        if (formerOwnerCash - currentOwnerCash !== price) throw new Error(`Wrong purchase price: ${mapId} node ${id}, expected ${price}, paid ${formerOwnerCash - currentOwnerCash}`);
      }
      bankPurchases++;
      if (node.prefabLevel) prefabPurchases++;
    }
    const checkpoint = state.phase === 'gameover' ? `final:${state.day}`
      : state.day === 1 && ticks === 1 ? 'initial'
        : state.day > 1 && state.day % 21 === 1 ? `${state.day}:${state.currentPlayerIndex}` : '';
    if (checkpoint && checkpoint !== lastCheckpoint) {
      const restored = parseSave(JSON.stringify(state));
      if (restored.rng !== state.rng || restored.day !== state.day
        || JSON.stringify(restored.properties) !== JSON.stringify(state.properties)
        || JSON.stringify(restored.availablePropertyLevels) !== JSON.stringify(state.availablePropertyLevels)
        || restored.players.some((player, index) => player.cash !== state.players[index].cash)) {
        throw new Error(`Save changed economic state: ${mapId}/${weatherMode}/${seed} day ${state.day}`);
      }
      state = restored;
      restoreChecks++;
      lastCheckpoint = checkpoint;
    }
  }
  results.push({ mapId, weatherMode, seed, endedDay: state.day, winnerId: state.winnerId,
    ticks, maxStepsPerTurn, bankPurchases, prefabPurchases, restoreChecks,
    lastAssets: state.players.map(player => getNetWorth(state, player.id)) });
}
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/new-regions-ai-smoke.json', JSON.stringify({ games: results.length, results }, null, 2));
for (const row of results) console.log(JSON.stringify(row));
console.log(`Completed ${results.length} four-player year-long games without a stall.`);
