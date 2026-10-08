import { describe, expect, it } from 'vitest';
import { act, canTargetItem, createGame } from '../src/game/engine';
import { parseSave } from '../src/game/storage';
import { getTestRoomByCode, TEST_ROOMS, TEST_ROOM_CAPACITY } from '../src/game/testRooms';
import type { GameConfig, GameState, PlayerConfig } from '../src/game/types';

const human: PlayerConfig = { name: '测试者', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' };
const second: PlayerConfig = { name: '对照者', color: '#277DA8', shape: 'diamond', ai: false, personality: 'balanced' };

function config(testRoom: 'weather' | 'building'): GameConfig {
  return { mapId: 'lake', mode: 'pvp', players: [human], seasons: 0, weatherMode: 'standard', seed: 731, testRoom };
}

const restore = (state: GameState) => parseSave(JSON.stringify(state));

describe('fixed single-player test rooms', () => {
  it('publishes only the two reserved exact codes and their intended items', () => {
    expect(TEST_ROOM_CAPACITY).toBe(99);
    expect(TEST_ROOMS).toEqual({
      weather: { kind: 'weather', code: '114514', name: '天气测试房', itemId: 'weather' },
      building: { kind: 'building', code: '350234', name: '建筑测试房', itemId: 'repair' },
    });
    expect(getTestRoomByCode('114514')).toBe(TEST_ROOMS.weather);
    expect(getTestRoomByCode('350234')).toBe(TEST_ROOMS.building);
    expect(getTestRoomByCode('0114514')).toBeUndefined();
    expect(getTestRoomByCode('')).toBeUndefined();
  });

  it.each(['weather', 'building'] as const)('creates %s with 99 independent dry slots and no usual starter items', kind => {
    const state = createGame(config(kind));
    const player = state.players[0];
    expect(state.players).toHaveLength(1);
    expect(player.capacity).toBe(99);
    expect(player.inventory).toHaveLength(99);
    expect(new Set(player.inventory.map(slot => slot.uid)).size).toBe(99);
    expect(player.inventory.every(slot => slot.itemId === TEST_ROOMS[kind].itemId && slot.quantity === 1 && !slot.wet)).toBe(true);
    expect(restore(state).players[0].inventory).toEqual(player.inventory);
  });

  it('consumes a real weather controller and advances a solo room to its next day without declaring victory', () => {
    const state = createGame(config('weather'));
    const uid = state.players[0].inventory[0].uid;
    expect(canTargetItem(state, 'p1', uid, { weatherId: 'clear' })).toBe(true);
    const selected = act(state, { type: 'useItem', itemUid: uid, weatherId: 'clear' });
    expect(selected).not.toBe(state);
    expect(selected.players[0].inventory).toHaveLength(98);
    expect(selected.players[0].statuses).toContainEqual({ id: 'weather:clear', remaining: 1 });
    const secondDay = act(selected, { type: 'endTurn' });
    expect(secondDay.day).toBe(2);
    expect(secondDay.currentPlayerIndex).toBe(0);
    expect(secondDay.weatherId).toBe('clear');
    expect(secondDay.phase).toBe('ready');
    expect(secondDay.winnerId).toBeNull();
    expect(secondDay.players[0].cash).toBe(state.players[0].cash - 120);
    expect(restore(secondDay).players[0].inventory).toHaveLength(98);
    const thirdDay = act(secondDay, { type: 'endTurn' });
    expect(thirdDay.day).toBe(3);
    expect(thirdDay.phase).not.toBe('gameover');
  });

  it('uses one repair package on an owned ordinary building without spending cash', () => {
    const state = createGame(config('building'));
    state.weatherId = 'clear';
    state.properties[5] = { ownerId: 'p1', level: 0, mortgaged: false };
    const uid = state.players[0].inventory[0].uid;
    expect(canTargetItem(state, 'p1', uid, { nodeId: 5 })).toBe(true);
    const repaired = act(state, { type: 'useItem', itemUid: uid, nodeId: 5 });
    expect(repaired.properties[5].level).toBe(1);
    expect(repaired.players[0].inventory).toHaveLength(98);
    expect(repaired.players[0].cash).toBe(state.players[0].cash);
    expect(repaired.phase).toBe('ready');
    expect(restore(repaired).properties[5].level).toBe(1);
    const foreign = structuredClone(state);
    foreign.properties[5].ownerId = 'p2';
    expect(canTargetItem(foreign, 'p1', uid, { nodeId: 5 })).toBe(false);
    expect(act(foreign, { type: 'useItem', itemUid: uid, nodeId: 5 })).toBe(foreign);
  });

  it('keeps ordinary weather restrictions and wet-item rules in both rooms', () => {
    const weather = createGame(config('weather'));
    const weatherUid = weather.players[0].inventory[0].uid;
    expect(canTargetItem(weather, 'p1', weatherUid, { weatherId: 'glitch' })).toBe(false);
    expect(act(weather, { type: 'useItem', itemUid: weatherUid, weatherId: 'glitch' })).toBe(weather);
    weather.weatherId = 'rain';
    const rained = act(weather, { type: 'roll' });
    expect(rained.players[0].inventory.filter(slot => slot.wet)).toHaveLength(1);
    expect(rained.players[0].inventory).toHaveLength(99);

    const building = createGame(config('building'));
    building.properties[5] = { ownerId: 'p1', level: 0, mortgaged: false };
    const repairUid = building.players[0].inventory[0].uid;
    building.players[0].inventory[0].wet = true;
    expect(canTargetItem(building, 'p1', repairUid, { nodeId: 5 })).toBe(false);
    building.players[0].inventory[0].wet = false;
    building.weatherId = 'acid';
    expect(canTargetItem(building, 'p1', repairUid, { nodeId: 5 })).toBe(false);
  });

  it('keeps a valid bag expansion from 99 to 103 slots loadable', () => {
    const state = createGame(config('building'));
    const uid = state.players[0].inventory[0].uid;
    // A later shop or event can supply the ordinary folding bag after room supplies are used.
    state.players[0].inventory[0].itemId = 'bag';
    const expanded = act(state, { type: 'useItem', itemUid: uid });
    expect(expanded.players[0].capacity).toBe(103);
    expect(expanded.players[0].inventory).toHaveLength(98);
    expect(restore(expanded).players[0].capacity).toBe(103);
  });

  it('rejects unmarked solo games, unknown markers, AI occupants and multiplayer test markers at creation and load', () => {
    const ordinary = { ...config('weather'), testRoom: undefined };
    expect(() => createGame(ordinary)).toThrow();
    expect(() => createGame({ ...config('weather'), testRoom: '__proto__' as 'weather' })).toThrow();
    expect(() => createGame({ ...config('weather'), players: [{ ...human, ai: true }] })).toThrow();
    expect(() => createGame({ ...config('weather'), players: [human, second] })).toThrow();

    const saved = createGame(config('weather'));
    const mutate = (change: (raw: any) => void) => {
      const raw = structuredClone(saved);
      change(raw);
      expect(() => parseSave(JSON.stringify(raw))).toThrow();
    };
    mutate(raw => { delete raw.config.testRoom; });
    mutate(raw => { raw.config.testRoom = 'unknown'; });
    mutate(raw => { raw.config.players[0].ai = true; raw.players[0].ai = true; });
    mutate(raw => { raw.players[0].ai = true; });
    mutate(raw => { raw.config.players.push(second); });
    mutate(raw => { raw.players[1] = { ...raw.players[0], id: 'p2' }; raw.config.players.push(second); });
    mutate(raw => { raw.players[0].inventory[1].uid = raw.players[0].inventory[0].uid; });
    mutate(raw => { raw.players[0].capacity = 98; });
  });

  it('keeps ordinary two-player opening inventory and capacity', () => {
    const state = createGame({ ...config('weather'), testRoom: undefined, players: [human, second] });
    expect(state.players[0].capacity).toBe(10);
    expect(state.players[0].inventory.map(slot => slot.itemId)).toEqual(['snack', 'snack', 'rent', 'dice8']);
    expect(restore(state).players).toHaveLength(2);
  });
});
