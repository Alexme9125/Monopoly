import { MAPS } from './maps';
import type { GameState, MapId, MapNode } from './types';

/** Only the river valley extends the ordinary land ladder beyond four floors. */
export function getMaxLandLevel(mapId: MapId): 4 | 5 {
  return mapId === 'hushedValley' ? 5 : 4;
}

export function isLandmark(mapId: MapId, node: MapNode, level: number): boolean {
  return node.kind === 'land' && level >= getMaxLandLevel(mapId);
}

export function getBuildCost(node: MapNode): number {
  return Math.ceil(Math.max(0, node.price ?? 0) * 0.75);
}

export function getPropertyAssetValue(node: MapNode, level: number): number {
  const base = Math.max(0, node.price ?? 0);
  return base + (node.kind === 'land' ? getBuildCost(node) * level : 0);
}

/** Current bank-owned floors, including a map's initial prefabricated buildings. */
export function getAvailableLandLevel(state: GameState, nodeId: number): number {
  const node = MAPS[state.config.mapId]?.nodes[nodeId];
  if (!node || node.kind !== 'land' || state.properties[nodeId]) return 0;
  return state.availablePropertyLevels?.[nodeId] ?? node.prefabLevel ?? 0;
}

/** Full building price for unsold land; utilities retain their posted base price. */
export function getLandPurchasePrice(state: GameState, nodeId: number): number {
  const node = MAPS[state.config.mapId]?.nodes[nodeId];
  if (!node || !['land', 'power', 'water', 'telecom'].includes(node.kind)) return 0;
  return getPropertyAssetValue(node, getAvailableLandLevel(state, nodeId));
}

/** One authoritative explanation for a fresh landing and a restored purchase prompt. */
export function getLandPurchaseDescription(state: GameState, nodeId: number): string {
  const node = MAPS[state.config.mapId]?.nodes[nodeId];
  if (!node) return '';
  const price = getLandPurchasePrice(state, nodeId);
  const level = getAvailableLandLevel(state, nodeId);
  if (state.config.mapId !== 'grandCity' || node.kind !== 'land' || level === 0) {
    return `购买 ${node.name} 需要 ${price} PM。`;
  }
  const base = Math.max(0, node.price ?? 0);
  const construction = getBuildCost(node) * level;
  return `整栋认购 ${node.name}，含现有 ${level} 层；基础地价 ${base} + 已有楼层建造成本 ${construction} = 总价 ${price} PM；购买后保留楼层。`;
}

export function getMealRecovery(mapId: MapId, level: number): number {
  if (!Number.isInteger(level) || level < 0 || level > getMaxLandLevel(mapId)) return 0;
  return [0, 12, 20, 30, 42, 55][level];
}
