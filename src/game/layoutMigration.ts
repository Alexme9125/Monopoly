import type { MapId } from './types';
import { MAPS } from './maps';
import { relocateFacilityNode } from './facilityLayout';

type JsonRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is JsonRecord => typeof value === 'object' && value !== null && !Array.isArray(value);
const ownNode = (mapId: MapId, value: unknown): number | null =>
  Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) < MAPS[mapId].nodes.length ? Number(value) : null;

/** Normalize saved layout 1 references before checking them against the current map. */
export function migrateMapLayout(state: JsonRecord, mapId: MapId): JsonRecord {
  const version = state.mapLayoutVersion === undefined ? 1 : state.mapLayoutVersion;
  if (version !== 1 && version !== 2) throw new Error('存档中的地图布局版本无效。');
  if (version === 2) return state;

  const map = MAPS[mapId];
  const pending = isRecord(state.pending) ? state.pending : null;
  const activePlayer = Array.isArray(state.players) && Number.isSafeInteger(state.currentPlayerIndex)
    ? state.players[Number(state.currentPlayerIndex)] : null;
  // In the layout before the earlier station move, coast 43/44 were stations.
  // A saved ride at either retired station has already been promised a free
  // exit at its original position, not a move to the shop/casino's new site.
  const historicStationOrigin = mapId === 'coast' && pending?.kind === 'station' && isRecord(activePlayer)
    && (activePlayer.position === 43 || activePlayer.position === 44) && isRecord(pending.data)
    && pending.data.nodeId === activePlayer.position ? Number(activePlayer.position) : null;
  const moved = (value: unknown): unknown => {
    const id = ownNode(mapId, value);
    return id === null ? value : relocateFacilityNode(mapId, id);
  };
  const oldKind = (id: number) => map.nodes[relocateFacilityNode(mapId, id)].kind;

  // A utility is only valid at a source utility node. Since the swap is a
  // bijection, this and the normal post-migration validation protect both the
  // old and new layouts from an invented property on a former roadside tile.
  if (isRecord(state.properties)) {
    for (const key of Object.keys(state.properties)) {
      const id = Number(key);
      if (!Number.isSafeInteger(id) || String(id) !== key || id < 0 || id >= map.nodes.length
        || !['land', 'power', 'water', 'telecom'].includes(oldKind(id))) {
        throw new Error('存档中的旧布局产权位置无效。');
      }
    }
    state.properties = Object.fromEntries(Object.entries(state.properties)
      .map(([key, property]) => [String(relocateFacilityNode(mapId, Number(key))), property]));
  }

  if (Array.isArray(state.players)) {
    state.players = state.players.map((entry: unknown, index: number) => {
      if (!isRecord(entry)) return entry;
      if (index === state.currentPlayerIndex && entry.position === historicStationOrigin) return entry;
      const oldPosition = ownNode(mapId, entry.position);
      if (oldPosition !== null && entry.routeNextPosition != null
        && (ownNode(mapId, entry.routeNextPosition) === null || !map.nodes[oldPosition].neighbors.includes(Number(entry.routeNextPosition)))) {
        throw new Error('存档中的旧布局行进方向无效。');
      }
      const position = moved(entry.position);
      const previous = moved(entry.previousPosition);
      const routeNext = moved(entry.routeNextPosition);
      const adjacent = (candidate: unknown): boolean => Number.isSafeInteger(position) && ownNode(mapId, position) !== null
        && Number.isSafeInteger(candidate) && map.nodes[Number(position)].neighbors.includes(Number(candidate));
      return { ...entry, position, previousPosition: previous === null || ownNode(mapId, previous) === null || adjacent(previous) ? previous : null,
        routeNextPosition: routeNext == null || adjacent(routeNext) ? routeNext : null };
    });
  }

  if (Array.isArray(state.propertyListings)) state.propertyListings = state.propertyListings.map((entry: unknown) =>
    isRecord(entry) ? { ...entry, nodeId: moved(entry.nodeId) } : entry);
  if (Array.isArray(state.encounters)) state.encounters = state.encounters.map(moved);
  if (Array.isArray(state.turnEncounters)) state.turnEncounters = state.turnEncounters.map((entry: unknown) =>
    isRecord(entry) ? { ...entry, nodeId: moved(entry.nodeId) } : entry);
  if (Array.isArray(state.notices)) state.notices = state.notices.map((entry: unknown) =>
    isRecord(entry) ? { ...entry, nodeId: moved(entry.nodeId) } : entry);

  if (isRecord(state.pending)) {
    const pending = state.pending;
    const nodeBearingPrompt = ['land', 'upgrade', 'meal', 'rent', 'station', 'trade'].includes(String(pending.kind));
    if (nodeBearingPrompt && (!isRecord(pending.data) || ownNode(mapId, pending.data.nodeId) === null)) {
      throw new Error('存档中的旧布局设施选择位置无效。');
    }
    const oldPromptNode = isRecord(pending.data) ? ownNode(mapId, pending.data.nodeId) : null;
    const data = isRecord(pending.data) && Object.hasOwn(pending.data, 'nodeId')
      ? { ...pending.data, nodeId: pending.kind === 'station' && pending.data.nodeId === historicStationOrigin
        ? historicStationOrigin : moved(pending.data.nodeId) } : pending.data;
    let choices = pending.choices;
    if (pending.kind === 'debt' && Array.isArray(choices)) {
      choices = choices.map((choice: unknown) => {
        if (!isRecord(choice) || typeof choice.id !== 'string') return choice;
        const match = /^mortgage:(0|[1-9]\d*)$/.exec(choice.id);
        if (!match) return choice;
        const oldId = ownNode(mapId, Number(match[1]));
        if (oldId === null) return choice;
        const newId = relocateFacilityNode(mapId, oldId);
        if (newId === oldId) return choice;
        const node = map.nodes[newId];
        return { ...choice, id: `mortgage:${newId}`, label: `抵押 ${node.name} · +${Math.floor((node.price ?? 0) * 0.5)} PM` };
      });
    }
    const updated: JsonRecord = { ...pending, data, choices };
    if (oldPromptNode !== null && relocateFacilityNode(mapId, oldPromptNode) !== oldPromptNode) {
      const node = map.nodes[relocateFacilityNode(mapId, oldPromptNode)];
      const player = Array.isArray(state.players) && Number.isSafeInteger(state.currentPlayerIndex)
        ? state.players[Number(state.currentPlayerIndex)] : null;
      const cash = isRecord(player) && typeof player.cash === 'number' ? player.cash : 0;
      if (pending.kind === 'land') {
        updated.title = node.name;
        updated.body = `购买 ${node.name} 需要 ${node.price ?? 0} PM。`;
        if (Array.isArray(choices)) updated.choices = choices.map((choice: unknown) => isRecord(choice) && choice.id === 'buy'
          ? { ...choice, label: `购买 · ${node.price ?? 0} PM`, disabled: cash < (node.price ?? 0) } : choice);
      } else if (pending.kind === 'meal' || pending.kind === 'upgrade') {
        updated.title = node.name;
        const property = isRecord(state.properties) ? state.properties[String(node.id)] : null;
        const level = isRecord(property) && typeof property.level === 'number' ? property.level : 0;
        const recovery = ['power', 'water', 'telecom'].includes(node.kind) ? 12 : [0, 12, 20, 30, 42][level] ?? 0;
        if (pending.kind === 'meal') {
          updated.body = '支付 100 PM 用餐并恢复体力。';
          if (Array.isArray(choices)) updated.choices = choices.map((choice: unknown) => isRecord(choice) && choice.id === 'meal'
            ? { ...choice, label: `用餐 · 100 PM（体力 +${recovery}）`, disabled: cash < 100 } : choice);
        } else {
          const cost = Math.ceil((node.price ?? 0) * 0.75);
          updated.body = `升级至 ${level + 1} 级，费用 ${cost} PM；也可用餐。`;
        }
      } else if (pending.kind === 'trade' && isRecord(data)) {
        const players = Array.isArray(state.players) ? state.players : [];
        const seller = players.find((entry: unknown) => isRecord(entry) && entry.id === data.sellerId);
        const buyer = players.find((entry: unknown) => isRecord(entry) && entry.id === data.buyerId);
        if (isRecord(seller) && isRecord(buyer)) updated.body = `${seller.name} 向 ${buyer.name} 出售 ${node.name}，价格 ${data.price} PM。请 ${buyer.name} 决定。`;
      }
    }
    state.pending = updated;
  }

  state.mapLayoutVersion = 2;
  return state;
}
