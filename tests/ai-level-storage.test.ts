import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/engine';
import { parseSave } from '../src/game/storage';
import type { GameConfig, GameState } from '../src/game/types';

function game(level?: 'gentle' | 'fierce'): GameState {
  const config: GameConfig = { mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 41, players: [
    { name: '真人', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '电脑', color: '#277DA8', shape: 'diamond', ai: true, personality: 'aggressive', ...(level ? { aiLevel: level } : {}) },
  ] };
  return createGame(config);
}

const restore = (state: GameState) => parseSave(JSON.stringify(state));

describe('AI level save compatibility', () => {
  it('defaults an old AI save to gentle in both config and player without adding a human level', () => {
    const old = game();
    delete old.config.players[0].aiLevel;
    delete old.players[0].aiLevel;
    delete old.config.players[1].aiLevel;
    delete old.players[1].aiLevel;
    const restored = restore(old);
    expect(restored.config.players[1].aiLevel).toBe('gentle');
    expect(restored.players[1].aiLevel).toBe('gentle');
    expect(restored.config.players[0].aiLevel).toBeUndefined();
    expect(restored.players[0].aiLevel).toBeUndefined();
    expect(restore(restored).players[1].aiLevel).toBe('gentle');
  });

  it('preserves fierce and rejects unknown or conflicting levels', () => {
    const fierce = game('fierce');
    expect(restore(fierce).players[1].aiLevel).toBe('fierce');
    for (const location of ['config', 'player'] as const) {
      const invalid = structuredClone(fierce);
      if (location === 'config') invalid.config.players[1].aiLevel = 'unknown' as 'fierce';
      else invalid.players[1].aiLevel = 'unknown' as 'fierce';
      expect(() => restore(invalid)).toThrow();
    }
    const mismatch = structuredClone(fierce);
    delete mismatch.config.players[1].aiLevel;
    expect(() => restore(mismatch)).toThrow('AI 强度');
  });

  it('validates a current AI action budget and clears only stale valid budgets', () => {
    const active = game('fierce');
    active.currentPlayerIndex = 1;
    active.aiTurn = { playerId: active.players[1].id, day: active.day, actions: 2, attacks: 1, purchases: 0 };
    expect(restore(active).aiTurn).toEqual(active.aiTurn);
    const stale = structuredClone(active);
    stale.aiTurn!.day = active.day - 1;
    expect(restore(stale).aiTurn).toBeUndefined();
    const wrongTurn = structuredClone(active);
    wrongTurn.currentPlayerIndex = 0;
    expect(restore(wrongTurn).aiTurn).toBeUndefined();
    for (const invalid of [
      { ...active.aiTurn!, playerId: 'nonexistent' },
      { ...active.aiTurn!, actions: -1 },
      { ...active.aiTurn!, attacks: 0.5 },
      { ...active.aiTurn!, purchases: Number.MAX_SAFE_INTEGER + 1 },
    ]) {
      const broken = structuredClone(active);
      broken.aiTurn = invalid;
      expect(() => restore(broken)).toThrow('电脑回合预算');
    }
  });
});
