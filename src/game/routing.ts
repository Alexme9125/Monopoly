import type { MapData, Player } from './types';

type RoutePlayer = Pick<Player, 'position' | 'previousPosition' | 'routeNextPosition'>;

/** Legal forward exits at a node. A weather retreat can reserve one exit. */
export function getStepOptions(map: MapData, position: number, incoming: number | null | undefined,
  routeNextPosition: number | null | undefined = null): number[] {
  const node = map.nodes[position];
  if (!node || node.id !== position || !node.neighbors.length) return [];
  const candidates = node.neighbors.length > 1 && incoming != null && node.neighbors.includes(incoming)
    ? node.neighbors.filter(id => id !== incoming) : [...node.neighbors];
  return routeNextPosition != null && node.neighbors.includes(routeNextPosition)
    ? [routeNextPosition] : candidates;
}

/** Possible first steps of the next normal roll, without consuming RNG. */
export function getNextStepOptions(map: MapData, player: RoutePlayer): number[] {
  return getStepOptions(map, player.position, player.previousPosition, player.routeNextPosition);
}
