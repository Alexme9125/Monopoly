import type { MapData, MapNode } from '../game/types';

export type Point = { x: number; y: number };
export type Rect = { left: number; top: number; right: number; bottom: number };
export type Lot = Point & { bounds: Rect; size: number };
export const hasLot = (node: MapNode) => !['start', 'empty', 'coin', 'event'].includes(node.kind);

// Every property and facility occupies the same square beside the road.
export const lotBounds = (x: number, y: number): Rect => ({ left: x - 23, right: x + 23, top: y - 23, bottom: y + 23 });
const sizedBounds = (x: number, y: number, size: number): Rect => ({ left: x - size / 2, right: x + size / 2, top: y - size / 2, bottom: y + size / 2 });

export function overlap(a: Rect, b: Rect, gap = 0) {
  return Math.max(0, Math.min(a.right + gap, b.right) - Math.max(a.left - gap, b.left))
    * Math.max(0, Math.min(a.bottom + gap, b.bottom) - Math.max(a.top - gap, b.top));
}

export function segmentDistance(x: number, y: number, a: Point, b: Point) {
  const length = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  const t = length ? Math.max(0, Math.min(1, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / length)) : 0;
  return Math.hypot(x - a.x - t * (b.x - a.x), y - a.y - t * (b.y - a.y));
}

type Candidate = Lot & { score: number };

function withinMap(map: MapData, bounds: Rect): boolean {
  // Valley's drawing extends beyond its nominal 1500 × 1000 road coordinates.
  const frame = map.id === 'valley'
    ? { left: -90, top: -125, right: 1590, bottom: 1115 }
    : { left: 40, top: 15, right: 1460, bottom: 965 };
  return bounds.left >= frame.left && bounds.right <= frame.right
    && bounds.top >= frame.top && bounds.bottom <= frame.bottom;
}

function besideWater(map: MapData, bounds: Rect): boolean {
  const ponds = map.id === 'lake' ? [{ x: 876, y: 490, rx: 208, ry: 142 }]
    : map.id === 'coast' ? [{ x: 450, y: 320, rx: 150, ry: 94 }, { x: 1050, y: 660, rx: 150, ry: 87 }]
      : [{ x: 480, y: 465, rx: 59, ry: 66 }, { x: 1020, y: 565, rx: 56, ry: 65 }];
  return ponds.some(pond => {
    const nearestX = Math.max(bounds.left, Math.min(pond.x, bounds.right));
    const nearestY = Math.max(bounds.top, Math.min(pond.y, bounds.bottom));
    return ((nearestX - pond.x) / pond.rx) ** 2 + ((nearestY - pond.y) / pond.ry) ** 2 < 1;
  });
}

function roadRects(map: MapData): Rect[] {
  return map.nodes.flatMap(node => node.neighbors.filter(id => id > node.id).map(id => {
    const next = map.nodes[id];
    return {
      left: Math.min(node.x, next.x) - 20, right: Math.max(node.x, next.x) + 20,
      top: Math.min(node.y, next.y) - 20, bottom: Math.max(node.y, next.y) + 20,
    };
  }));
}

function candidatesFor(map: MapData, node: MapNode, roads: Rect[]): Candidate[] {
  const size = map.id === 'lake' && [65, 66, 67, 83, 85].includes(node.id) ? 44 : 46;
  const positions: { dx: number; dy: number; shift: number; diagonal: boolean }[] = [];
  for (const distance of [20 + size / 2 + 1, 20 + size / 2 + 2, 20 + size / 2 + 3]) {
    for (const shift of [0, -6, 6, -12, 12]) {
      positions.push({ dx: shift, dy: -distance, shift, diagonal: false });
      positions.push({ dx: shift, dy: distance, shift, diagonal: false });
      positions.push({ dx: -distance, dy: shift, shift, diagonal: false });
      positions.push({ dx: distance, dy: shift, shift, diagonal: false });
    }
    const hasHorizontal = node.neighbors.some(id => map.nodes[id].y === node.y);
    const hasVertical = node.neighbors.some(id => map.nodes[id].x === node.x);
    if (hasHorizontal && hasVertical) {
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        positions.push({ dx: sx * distance, dy: sy * distance, shift: 0, diagonal: true });
      }
    }
  }
  return positions.flatMap(({ dx, dy, shift, diagonal }) => {
    const x = node.x + dx, y = node.y + dy;
    const bounds = sizedBounds(x, y, size);
    if (!withinMap(map, bounds) || roads.some(road => overlap(bounds, road) > 0)) return [];
    const score = Math.hypot(dx, dy) + Math.abs(shift) * 0.3
      + (diagonal ? 4 : 0) + (besideWater(map, bounds) ? 1000 : 0);
    return [{ x, y, bounds, size, score }];
  }).sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
}

/** Place a 46 px square next to its own road node, with at most 12 px along-road adjustment. */
export function getLotLayout(map: MapData): Record<number, Lot> {
  const roads = roadRects(map);
  const nodes = map.nodes.filter(hasLot);
  const domains = new Map(nodes.map(node => [node.id, candidatesFor(map, node, roads)]));
  const layout: Record<number, Lot> = {};
  function compact(node: MapNode, choices: Candidate[], perSide: number): Candidate[] {
    const groups = new Map<string, Candidate[]>();
    for (const candidate of choices) {
      const dx = candidate.x - node.x, dy = candidate.y - node.y;
      const key = Math.abs(dx) >= 40 && Math.abs(dy) >= 40
        ? `${Math.sign(dx)},${Math.sign(dy)}`
        : Math.abs(dx) > Math.abs(dy) ? `${Math.sign(dx)},0` : `0,${Math.sign(dy)}`;
      const group = groups.get(key) ?? [];
      if (group.length < perSide) { group.push(candidate); groups.set(key, group); }
    }
    return [...groups.values()].flat().sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
  }
  function solve(initial: Map<number, Candidate[]>, visits: { count: number }): Map<number, Candidate[]> | null {
    const ids = [...initial.keys()];
    const neighbors = new Map(ids.map(id => [id, [] as number[]]));
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const left = initial.get(ids[i])!, right = initial.get(ids[j])!;
      if (left.some(a => right.some(b => overlap(a.bounds, b.bounds) > 0))) {
        neighbors.get(ids[i])!.push(ids[j]);
        neighbors.get(ids[j])!.push(ids[i]);
      }
    }
    function propagate(domains: Map<number, Candidate[]>, queue: [number, number][]): boolean {
      while (queue.length) {
        const [id, otherId] = queue.pop()!;
        const options = domains.get(id)!;
        const kept = options.filter(candidate => domains.get(otherId)!.some(other => overlap(candidate.bounds, other.bounds) === 0));
        if (!kept.length) return false;
        if (kept.length < options.length) {
          domains.set(id, kept);
          for (const neighbor of neighbors.get(id)!) if (neighbor !== otherId) queue.push([neighbor, id]);
        }
      }
      return true;
    }
    const initialQueue: [number, number][] = ids.flatMap(id => neighbors.get(id)!.map(otherId => [id, otherId] as [number, number]));
    if (!propagate(initial, initialQueue)) return null;
    function search(domains: Map<number, Candidate[]>): Map<number, Candidate[]> | null {
      if (++visits.count > 100_000) return null;
      const unresolved = ids.filter(id => domains.get(id)!.length > 1);
      if (!unresolved.length) return domains;
      unresolved.sort((a, b) => domains.get(a)!.length - domains.get(b)!.length
        || neighbors.get(b)!.filter(id => domains.get(id)!.length > 1).length
          - neighbors.get(a)!.filter(id => domains.get(id)!.length > 1).length || a - b);
      const id = unresolved[0];
      for (const candidate of domains.get(id)!) {
        const narrowed = new Map(domains);
        narrowed.set(id, [candidate]);
        const queue: [number, number][] = neighbors.get(id)!.map(otherId => [otherId, id]);
        if (!propagate(narrowed, queue)) continue;
        const found = search(narrowed);
        if (found) return found;
      }
      return null;
    }
    return search(initial);
  }
  for (const perSide of [1, 2, 3, 5]) {
    const compactDomains = new Map(nodes.map(node => [node.id, compact(node, domains.get(node.id)!, perSide)]));
    const visits = { count: 0 };
    const solution = solve(compactDomains, visits);
    if (solution) {
      for (const [id, [candidate]] of solution) layout[id] = { x: candidate.x, y: candidate.y, bounds: candidate.bounds, size: candidate.size };
      return layout;
    }
  }
  throw new Error(`Cannot place ${map.id} lots beside their roads`);
}
