import { describe, expect, it } from 'vitest';
import { act, createGame } from '../src/game/engine';
import { getJourneyRewardSteps, JOURNEY_REWARD_CASH, JOURNEY_REWARD_STEPS } from '../src/game/data';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import type { GameConfig, GameState, MapId } from '../src/game/types';

const config: GameConfig = {
  mapId: 'forest', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 1978,
  players: [
    { name: '甲', color: '#d55b48', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '乙', color: '#277da8', shape: 'diamond', ai: true, personality: 'cautious' },
  ],
};

function forestRoll(progress: number, weatherId = 'clear'): GameState {
  const state = createGame(config);
  state.weatherId = weatherId;
  state.selectedDie = 1;
  state.players[0].travelProgress = progress;
  state.players[0].previousPosition = MAPS.forest.nodes[0].neighbors.find(id => id !== 1)!;
  return act(state, { type: 'roll' });
}

describe('map-specific journey rewards', () => {
  it('uses 24 steps in the forest and preserves the 72-step rule on all other maps', () => {
    expect(JOURNEY_REWARD_STEPS).toBe(72);
    expect(getJourneyRewardSteps('forest')).toBe(24);
    for (const mapId of ['lake', 'coast', 'valley', 'sundered', 'starSands'] as MapId[]) {
      expect(getJourneyRewardSteps(mapId), mapId).toBe(72);
    }
  });

  it('awards the forest milestone on an actual 23+1 roll and carries the next residue', () => {
    const before = forestRoll(22);
    expect(before.players[0].travelProgress).toBe(23);
    expect(before.notices?.filter(item => item.kind === 'milestone')).toHaveLength(0);

    const earned = forestRoll(23);
    expect(earned.movement?.segments?.[0].path).toEqual([0, 1]);
    expect(earned.players[0].travelProgress).toBe(0);
    expect(earned.notices?.filter(item => item.kind === 'milestone')).toMatchObject([
      { amount: JOURNEY_REWARD_CASH, playerId: 'p1', nodeId: 1 },
    ]);
    expect(earned.notices?.find(item => item.kind === 'milestone')?.body).toContain('0/24 格');
    expect(earned.movement?.effects).toContainEqual({ kind: 'cash', label: '行进奖励 +10,000 PM', tone: 'good' });
    expect(earned.players[0].cash - before.players[0].cash).toBe(JOURNEY_REWARD_CASH);
  });

  it('combines multiple forest thresholds from two hundred-sided dice, counting only normal steps', () => {
    let earned: GameState | undefined;
    for (let seed = 1; seed <= 100 && !earned; seed++) {
      const state = createGame({ ...config, seed });
      state.weatherId = 'snow';
      state.selectedDie = 100;
      state.twinRoll = true;
      state.players[0].travelProgress = 23;
      const next = act(state, { type: 'roll' });
      if ((next.movement?.segments?.[0].path.length ?? 0) >= 74) earned = next;
    }
    expect(earned).toBeDefined();
    const movement = earned!.movement!;
    expect(movement.rolls).toHaveLength(2);
    expect(movement.face).toBe(100);
    expect(movement.segments?.map(segment => segment.kind)).toEqual(['normal', 'weather']);
    const normalSteps = movement.segments![0].path.length - 1;
    const count = Math.floor((23 + normalSteps) / 24);
    expect(count).toBeGreaterThanOrEqual(4);
    expect(earned!.players[0].travelProgress).toBe((23 + normalSteps) % 24);
    expect(earned!.notices?.filter(item => item.kind === 'milestone')).toMatchObject([
      { amount: count * JOURNEY_REWARD_CASH },
    ]);
    expect(earned!.notices?.find(item => item.kind === 'milestone')?.body).toContain(`${count} 次 24 格`);
    expect(movement.effects).toContainEqual({ kind: 'cash', label: `行进奖励 +${(count * JOURNEY_REWARD_CASH).toLocaleString('zh-CN')} PM`, tone: 'good' });
    expect(movement.segments![1].path.length).toBe(2);
  });

  it('excludes weather slides, zero-step rolls, rest and transfers from forest progress', () => {
    const slid = forestRoll(22, 'snow');
    expect(slid.movement?.segments?.map(segment => segment.kind)).toEqual(['normal', 'weather']);
    expect(slid.players[0].travelProgress).toBe(23);
    expect(slid.notices?.filter(item => item.kind === 'milestone')).toHaveLength(0);

    const stationary = forestRoll(23, 'scorch');
    expect(stationary.movement?.segments?.[0].path).toHaveLength(1);
    expect(stationary.players[0].travelProgress).toBe(23);
    expect(stationary.notices?.filter(item => item.kind === 'milestone')).toHaveLength(0);

    const resting = createGame(config);
    resting.players[0].travelProgress = 23;
    expect(act(resting, { type: 'rest' }).players[0].travelProgress).toBe(23);

    const stations = MAPS.forest.nodes.filter(node => node.kind === 'station');
    const station = createGame(config);
    station.players[0].travelProgress = 23;
    station.players[0].position = stations[0].id;
    station.phase = 'decision';
    station.pending = { kind: 'station', title: '', body: '', data: { nodeId: stations[0].id },
      choices: [{ id: `station:${stations[1].id}`, label: '' }] };
    const transferred = act(station, { type: 'choose', choiceId: `station:${stations[1].id}` });
    expect(transferred.players[0].travelProgress).toBe(23);
    expect(transferred.notices?.filter(item => item.kind === 'milestone')).toHaveLength(0);

    const stone = createGame(config);
    stone.players[0].travelProgress = 23;
    stone.players[0].inventory.push({ uid: 'stone', itemId: 'teleportStone', quantity: 1, wet: false });
    const teleported = act(stone, { type: 'useItem', itemUid: 'stone', nodeId: 1 });
    expect(teleported.players[0].travelProgress).toBe(23);
    expect(teleported.notices?.filter(item => item.kind === 'milestone')).toHaveLength(0);
  });

  it('normalizes legacy forest residues once on load without paying rewards', () => {
    const old = createGame(config);
    const cash = old.players.map(player => player.cash);
    const logs = old.logs.length;
    old.players[0].travelProgress = 71;
    old.players[1].travelProgress = 24;
    const restored = parseSave(JSON.stringify(old));
    expect(restored.players.map(player => player.travelProgress)).toEqual([23, 0]);
    expect(restored.players.map(player => player.cash)).toEqual(cash);
    expect(restored.logs).toHaveLength(logs);
    expect(restored.notices?.filter(item => item.kind === 'milestone')).toHaveLength(0);
    expect(parseSave(JSON.stringify(restored)).players.map(player => player.travelProgress)).toEqual([23, 0]);
    restored.weatherId = 'clear';
    restored.selectedDie = 1;
    restored.players[0].previousPosition = MAPS.forest.nodes[0].neighbors.find(id => id !== 1)!;
    const earned = act(restored, { type: 'roll' });
    expect(earned.players[0].travelProgress).toBe(0);
    expect(earned.notices?.filter(item => item.kind === 'milestone')).toMatchObject([{ amount: JOURNEY_REWARD_CASH }]);

    for (const invalid of [-1, 72, 1.5, null]) {
      const malformed = structuredClone(old);
      (malformed.players[0] as unknown as { travelProgress: unknown }).travelProgress = invalid;
      expect(() => parseSave(JSON.stringify(malformed)), String(invalid)).toThrow('玩家');
    }
    const otherMap = createGame({ ...config, mapId: 'lake' });
    otherMap.players[0].travelProgress = 71;
    expect(parseSave(JSON.stringify(otherMap)).players[0].travelProgress).toBe(71);
  });
});
