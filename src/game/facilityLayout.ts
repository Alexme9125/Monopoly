import type { MapId } from './types';

// Version 1 is the layout after the station relocations. Each pair exchanges
// the facility at the first node with the roadside tile at the second node.
export const FACILITY_LAYOUT_SWAPS: Partial<Record<MapId, readonly (readonly [number, number])[]>> = {
  lake: [[2, 16], [7, 62], [22, 68], [27, 79], [73, 70], [82, 38], [37, 64]],
  coast: [[32, 50], [39, 48], [43, 62], [44, 27], [1, 70]],
  valley: [[17, 10], [16, 73], [42, 52], [45, 39], [82, 85], [68, 80]],
};

/** Map a node that carried content in layout 1 to its location in layout 2. */
export function relocateFacilityNode(mapId: MapId, nodeId: number): number {
  for (const [from, to] of FACILITY_LAYOUT_SWAPS[mapId] ?? []) {
    if (nodeId === from) return to;
    if (nodeId === to) return from;
  }
  return nodeId;
}
