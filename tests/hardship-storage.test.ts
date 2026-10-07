import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/engine';
import { parseSave } from '../src/game/storage';
import type { GameConfig } from '../src/game/types';

const config: GameConfig = { mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'hardship', seed: 73, players: [
  { name: '玩家', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' },
  { name: '电脑', color: '#277DA8', shape: 'diamond', ai: true, personality: 'cautious' },
] };

describe('hardship save validation', () => {
  it('round-trips a hardship game without changing its rule mode', () => {
    const restored = parseSave(JSON.stringify(createGame(config)));
    expect(restored.config.weatherMode).toBe('hardship');
    expect(parseSave(JSON.stringify(restored)).config.weatherMode).toBe('hardship');
  });

  it('continues to reject unknown and inherited weather mode keys', () => {
    for (const weatherMode of ['unknown', '__proto__', null]) {
      const state = createGame(config);
      state.config.weatherMode = weatherMode as GameConfig['weatherMode'];
      expect(() => parseSave(JSON.stringify(state))).toThrow();
    }
  });
});
