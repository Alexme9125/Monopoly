import { describe, expect, it } from 'vitest';
import { act, createGame } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import { getNextStepOptions, getStepOptions } from '../src/game/routing';
import type { GameConfig, MapData, MapId } from '../src/game/types';

function game(mapId: MapId = 'lake') {
  const config: GameConfig = { mapId, mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 1978, players: [
    { name: '甲', color: '#ff0000', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '乙', color: '#0000ff', shape: 'diamond', ai: true, personality: 'cautious' },
  ] };
  return createGame(config);
}

describe('next normal-step preview', () => {
  it('matches all six maps at every node and every real incoming road', () => {
    for (const map of Object.values(MAPS)) {
      for (const node of map.nodes) {
        const bare = { position: node.id, previousPosition: null, routeNextPosition: null };
        expect(getNextStepOptions(map, bare), `${map.id}:${node.id} without a bearing`).toEqual(node.neighbors);
        for (const incoming of node.neighbors) {
          const player = { ...bare, previousPosition: incoming };
          const expected = node.neighbors.length > 1 ? node.neighbors.filter(id => id !== incoming) : node.neighbors;
          expect(getNextStepOptions(map, player), `${map.id}:${node.id} from ${incoming}`).toEqual(expected);
          for (const reserved of node.neighbors) {
            expect(getNextStepOptions(map, { ...player, routeNextPosition: reserved }),
              `${map.id}:${node.id} resumes toward ${reserved}`).toEqual([reserved]);
          }
          expect(getNextStepOptions(map, { ...player, routeNextPosition: -1 })).toEqual(expected);
        }
      }
    }
  });

  it('is pure, returns a copy, and supports a single-exit dead end', () => {
    const map = MAPS.forest;
    const player = { position: 8, previousPosition: 7, routeNextPosition: null };
    const previous = structuredClone(player);
    const neighbors = [...map.nodes[8].neighbors];
    const options = getNextStepOptions(map, player);
    options.push(999);
    expect(player).toEqual(previous);
    expect(map.nodes[8].neighbors).toEqual(neighbors);
    expect(getNextStepOptions(map, player)).not.toContain(999);

    const deadEnd: MapData = { ...map, nodes: [
      { ...map.nodes[0], id: 0, neighbors: [1] },
      { ...map.nodes[1], id: 1, neighbors: [0] },
    ] };
    expect(getNextStepOptions(deadEnd, { position: 0, previousPosition: 1, routeNextPosition: null })).toEqual([1]);
    expect(getNextStepOptions(deadEnd, { position: 99, previousPosition: null, routeNextPosition: null })).toEqual([]);
  });

  it('uses the same first-edge candidates as a real controlled one-step roll across all maps', () => {
    for (const mapId of Object.keys(MAPS) as MapId[]) {
      const map = MAPS[mapId];
      for (const node of map.nodes) {
        const state = game(mapId);
        state.weatherId = 'clear';
        state.encounters = [];
        state.controlledRoll = 1;
        state.players[0].position = node.id;
        state.players[0].previousPosition = node.neighbors[0] ?? null;
        state.players[0].routeNextPosition = null;
        const options = getNextStepOptions(map, state.players[0]);
        const moved = act(state, { type: 'roll' });
        expect(options, `${mapId}:${node.id}`).toContain(moved.movement?.segments?.[0].path[1]);
      }
    }
  });

  it('honors weather retreat on the first step, then resumes ordinary forward routing', () => {
    const state = game();
    state.weatherId = 'gale';
    state.rng = Math.imul(35, 2654435761) >>> 0;
    state.players[0].position = 1;
    state.players[0].previousPosition = 0;
    const retreated = act(state, { type: 'roll' });
    expect(retreated.players[0]).toMatchObject({ position: 1, previousPosition: 2, routeNextPosition: 2 });
    expect(getNextStepOptions(MAPS.lake, retreated.players[0])).toEqual([2]);
    const resumed = structuredClone(retreated);
    resumed.phase = 'ready'; resumed.pending = null; resumed.weatherId = 'clear'; resumed.controlledRoll = 2;
    const rolled = act(resumed, { type: 'roll' });
    expect(rolled.movement?.segments?.[0].path).toEqual([1, 2, 3]);
    expect(rolled.players[0].routeNextPosition).toBeNull();
  });

  it('consumes the historic single route RNG draw even with a forced direction', () => {
    const state = game();
    state.weatherId = 'clear'; state.encounters = [];
    state.players[0].position = 2;
    state.players[0].previousPosition = 3;
    state.players[0].routeNextPosition = 3;
    state.controlledRoll = 1; // No dice draw; the route selection is the sole RNG draw.
    state.rng = 123456;
    expect(getNextStepOptions(MAPS.lake, state.players[0])).toEqual([3]);
    const rolled = act(state, { type: 'roll' });
    expect(rolled.movement?.segments?.[0].path).toEqual([2, 3]);
    expect(rolled.rng).toBe((Math.imul(state.rng, 1664525) + 1013904223) >>> 0);
    expect(rolled.players[0].routeNextPosition).toBeNull();
  });
});
