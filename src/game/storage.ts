import type { GameState, MapId, PlayerConfig, Shape } from './types';
import { MAPS } from './maps';
import { INITIAL_STOCKS, ITEMS, JOURNEY_REWARD_STEPS, WEATHERS } from './data';
import { findEligibleEvent, getEventPool } from './eventPool';
import { normalizePlayerColors } from './colors';
import { validShopData } from './shop';

const KEY = 'prism-days-save-v1';
const MAP_IDS: MapId[] = ['lake', 'coast', 'valley'];
const SHAPES: Shape[] = ['diamond', 'circle', 'hexagon', 'triangle'];
const STOCK_IDS = new Set(INITIAL_STOCKS.map(stock => stock.id));

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validPlayerConfig(value: unknown): value is PlayerConfig {
  if (!record(value)) return false;
  return typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 32
    && typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color)
    && SHAPES.includes(value.shape as Shape) && typeof value.ai === 'boolean'
    && ['cautious', 'balanced', 'aggressive'].includes(String(value.personality));
}

function validSlot(value: unknown): boolean {
  return record(value) && typeof value.uid === 'string' && value.uid.length > 0
    && typeof value.itemId === 'string' && Object.hasOwn(ITEMS, value.itemId)
    && Number.isSafeInteger(value.quantity) && Number(value.quantity) > 0
    && typeof value.wet === 'boolean';
}

function validCasinoResult(value: unknown, sequence: unknown): boolean {
  if (!record(value) || !Number.isSafeInteger(value.id) || Number(value.id) < 1 || Number(value.id) > Number(sequence)
    || !['slots', 'roulette'].includes(String(value.game))
    || typeof value.title !== 'string' || !value.title.trim() || value.title.length > 200
    || typeof value.detail !== 'string' || !value.detail.trim() || value.detail.length > 1000
    || !Number.isSafeInteger(value.stake) || !Number.isSafeInteger(value.payout) || !Number.isSafeInteger(value.net)
    || Number(value.payout) < 0 || Number(value.net) !== Number(value.payout) - Number(value.stake)) return false;
  if (value.game === 'slots') {
    if (value.stake !== 300 || value.bet !== undefined || !['cash', 'item', 'miss', 'no_capacity'].includes(String(value.outcome))) return false;
    if (value.outcome === 'cash') return Number(value.payout) >= 300 && Number(value.payout) <= 1800 && value.itemId === undefined;
    if (value.payout !== 0) return false;
    return value.outcome === 'item' ? typeof value.itemId === 'string' && Object.hasOwn(ITEMS, value.itemId) && ITEMS[value.itemId].shop
      : value.itemId === undefined;
  }
  return value.stake === 500 && ['red', 'black'].includes(String(value.bet)) && value.itemId === undefined
    && ((value.outcome === 'win' && value.payout === 1000) || (value.outcome === 'lose' && value.payout === 0));
}

export function parseSave(raw: string): GameState {
  let state: unknown;
  try { state = JSON.parse(raw); } catch { throw new Error('存档不是有效的 JSON 文件。'); }
  if (!record(state) || state.version !== 1 || !record(state.config)) throw new Error('存档版本或游戏设置无效。');
  const config = state.config;
  if (!MAP_IDS.includes(config.mapId as MapId) || !['pve', 'pvp'].includes(String(config.mode))
    || !Array.isArray(config.players) || config.players.length < 2 || config.players.length > 4
    || !config.players.every(validPlayerConfig) || !Number.isSafeInteger(config.seed)
    || ![0, 4, 8, 16].includes(Number(config.seasons))
    || !['standard', 'challenge'].includes(String(config.weatherMode))
    || (config.propertyTrading !== undefined && typeof config.propertyTrading !== 'boolean')) {
    throw new Error('存档中的游戏设置无效。');
  }
  if (config.mode === 'pve' && config.players.filter((p: PlayerConfig) => !p.ai).length !== 1) throw new Error('PVE 存档必须有一位真人玩家。');
  if (config.mode === 'pvp' && config.players.some((p: PlayerConfig) => p.ai)) throw new Error('PVP 存档不能包含电脑玩家。');
  const maxNode = MAPS[config.mapId as MapId].nodes.length;
  const eligibleEventIds = new Set(getEventPool(config.mapId as MapId).map(event => event.id));
  if (!Array.isArray(state.players) || state.players.length !== config.players.length
    || state.players.some((p: unknown) => !record(p) || typeof p.id !== 'string' || !validPlayerConfig(p)
      || !Number.isFinite(p.cash) || !Number.isFinite(p.stamina) || !Number.isFinite(p.mood)
      || Number(p.stamina) < 0 || Number(p.stamina) > 100 || Number(p.mood) < 0 || Number(p.mood) > 100
      || !Number.isSafeInteger(p.position) || Number(p.position) < 0 || Number(p.position) >= maxNode
      || (p.previousPosition !== null && (!Number.isSafeInteger(p.previousPosition) || Number(p.previousPosition) < 0 || Number(p.previousPosition) >= maxNode))
      || (p.routeNextPosition !== undefined && p.routeNextPosition !== null
        && (!Number.isSafeInteger(p.routeNextPosition) || Number(p.routeNextPosition) < 0 || Number(p.routeNextPosition) >= maxNode
          || !MAPS[config.mapId as MapId].nodes[Number(p.position)]?.neighbors.includes(Number(p.routeNextPosition))))
      || (p.travelProgress !== undefined && (!Number.isSafeInteger(p.travelProgress) || Number(p.travelProgress) < 0 || Number(p.travelProgress) >= JOURNEY_REWARD_STEPS))
      || !Array.isArray(p.inventory) || !p.inventory.every(validSlot)
      || !Array.isArray(p.pawnedItems) || !p.pawnedItems.every((pawn: unknown) => record(pawn) && validSlot(pawn.slot) && Number.isFinite(pawn.principal) && Number(pawn.principal) >= 0)
      || !record(p.holdings) || Object.entries(p.holdings).some(([id, value]) => !STOCK_IDS.has(id) || !Number.isSafeInteger(value) || Number(value) < 0)
      || (p.stockCostBasis !== undefined && (!record(p.stockCostBasis)
        || Object.entries(p.stockCostBasis).some(([id, value]) => !STOCK_IDS.has(id) || !Number.isFinite(value)
          || Number(value) < 0 || Number(value) > Number.MAX_SAFE_INTEGER || !Number.isSafeInteger((p.holdings as Record<string, unknown>)[id])
          || Number((p.holdings as Record<string, unknown>)[id]) <= 0)))
      || !Number.isSafeInteger(p.capacity) || Number(p.capacity) < 1 || Number(p.capacity) > 100
      || !Array.isArray(p.statuses) || p.statuses.some((status: unknown) => !record(status) || typeof status.id !== 'string' || !Number.isSafeInteger(status.remaining))
      || (p.confinement !== null && (!record(p.confinement) || !['hospital', 'prison', 'sanatorium', 'parking'].includes(String(p.confinement.kind)) || !Number.isSafeInteger(p.confinement.remaining)))
      || typeof p.bankrupt !== 'boolean')) {
    throw new Error('存档中的玩家数据无效。');
  }
  const playerIds = new Set(state.players.map((p: { id: string }) => p.id));
  const notices = state.notices;
  if (notices !== undefined && (!Array.isArray(notices) || notices.length > 30
    || notices.some((item: unknown) => !record(item) || !Number.isSafeInteger(item.id) || Number(item.id) < 0 || Number(item.id) > Number(state.sequence)
      || !Number.isSafeInteger(item.day) || Number(item.day) < 1 || !['rent', 'event', 'milestone', 'trade'].includes(String(item.kind))
      || typeof item.title !== 'string' || item.title.length > 200 || typeof item.body !== 'string' || item.body.length > 2000
      || !['good', 'bad', 'info'].includes(String(item.tone)) || !playerIds.has(String(item.playerId))
      || !Number.isSafeInteger(item.nodeId) || Number(item.nodeId) < 0 || Number(item.nodeId) >= maxNode
      || (item.amount !== undefined && !Number.isFinite(item.amount))
      || (item.recipientId !== undefined && !playerIds.has(String(item.recipientId))))
    || notices.some((item: { id: number }, index: number) => index > 0 && item.id <= notices[index - 1].id))) {
    throw new Error('存档中的通知数据无效。');
  }
  const turnEncounters = state.turnEncounters;
  const currentPlayerId = Number.isSafeInteger(state.currentPlayerIndex) ? state.players[Number(state.currentPlayerIndex)]?.id : undefined;
  if (turnEncounters !== undefined && (!Array.isArray(turnEncounters) || turnEncounters.length > 12
    || turnEncounters.some((item: unknown) => !record(item)
      || typeof item.id !== 'string' || !item.id.trim() || item.id.length > 100
      || item.playerId !== currentPlayerId || !playerIds.has(String(item.playerId))
      || !Number.isSafeInteger(item.day) || item.day !== state.day
      || !Number.isSafeInteger(item.nodeId) || Number(item.nodeId) < 0 || Number(item.nodeId) >= maxNode
      || !['event', 'empty'].includes(MAPS[config.mapId as MapId].nodes[Number(item.nodeId)].kind)
      || typeof item.eventId !== 'string' || !eligibleEventIds.has(item.eventId)
      || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 200
      || typeof item.story !== 'string' || !item.story.trim() || item.story.length > 2000
      || !['good', 'bad', 'choice'].includes(String(item.tone))
      || !Array.isArray(item.choices) || !item.choices.length || item.choices.length > 32
      || item.choices.some((choice: unknown) => !record(choice)
        || typeof choice.id !== 'string' || !choice.id.trim() || choice.id.length > 100
        || typeof choice.label !== 'string' || !choice.label.trim() || choice.label.length > 200
        || (choice.description !== undefined && (typeof choice.description !== 'string' || choice.description.length > 1000))
        || (choice.disabled !== undefined && typeof choice.disabled !== 'boolean'))
      || new Set(item.choices.map((choice: { id: string }) => choice.id)).size !== item.choices.length
      || (item.selectedChoiceId !== undefined && (typeof item.selectedChoiceId !== 'string'
        || !item.choices.some((choice: { id: string }) => choice.id === item.selectedChoiceId)))
      || (item.result !== undefined && (typeof item.result !== 'string' || !item.result.trim() || item.result.length > 2000))
      || (item.selectedChoiceId === undefined) !== (item.result === undefined))
    || new Set(turnEncounters.map((item: { id: string }) => item.id)).size !== turnEncounters.length)) {
    throw new Error('存档中的本回合偶遇数据无效。');
  }
  if (!record(state.properties) || playerIds.size !== state.players.length || Object.entries(state.properties).some(([key, value]) => {
    const nodeId = Number(key);
    return !Number.isSafeInteger(nodeId) || nodeId < 0 || nodeId >= maxNode
      || !['land', 'power', 'water', 'telecom'].includes(MAPS[config.mapId as MapId].nodes[nodeId].kind) || !record(value)
      || !playerIds.has(String(value.ownerId)) || !Number.isSafeInteger(value.level)
      || Number(value.level) < 0 || Number(value.level) > 4 || typeof value.mortgaged !== 'boolean';
  })) throw new Error('存档中的产权数据无效。');
  const listings = state.propertyListings;
  if (listings !== undefined && (!Array.isArray(listings) || listings.length > maxNode || config.propertyTrading === false && listings.length > 0
    || listings.some((entry: unknown) => {
      if (!record(entry) || Object.keys(entry).length !== 5
        || Object.keys(entry).some(key => !['id', 'nodeId', 'sellerId', 'price', 'listedDay'].includes(key))) return true;
      const match = typeof entry.id === 'string' ? /^listing-([1-9]\d*)$/.exec(entry.id) : null;
      const nodeId = Number(entry.nodeId);
      const seller = (state.players as { id: string; bankrupt: boolean }[]).find(player => player.id === entry.sellerId);
      const property = (state.properties as Record<string, unknown>)[String(nodeId)];
      return !match || !Number.isSafeInteger(Number(match[1])) || Number(match[1]) > Number(state.sequence)
        || !Number.isSafeInteger(entry.nodeId) || nodeId < 0 || nodeId >= maxNode
        || !['land', 'power', 'water', 'telecom'].includes(MAPS[config.mapId as MapId].nodes[nodeId].kind)
        || typeof entry.sellerId !== 'string' || !seller || seller.bankrupt || !record(property)
        || property.ownerId !== entry.sellerId || property.mortgaged !== false
        || !Number.isSafeInteger(entry.price) || Number(entry.price) < 1 || Number(entry.price) > 1_000_000_000
        || !Number.isSafeInteger(entry.listedDay) || Number(entry.listedDay) < 1 || Number(entry.listedDay) > Number(state.day);
    })
    || new Set(listings.map((entry: { id: string }) => entry.id)).size !== listings.length
    || new Set(listings.map((entry: { nodeId: number }) => entry.nodeId)).size !== listings.length)) {
    throw new Error('存档中的拍卖行数据无效。');
  }
  if (!Number.isSafeInteger(state.currentPlayerIndex) || Number(state.currentPlayerIndex) < 0
    || Number(state.currentPlayerIndex) >= state.players.length || !Number.isSafeInteger(state.day)
    || Number(state.day) < 1 || !record(state.properties) || !Array.isArray(state.stocks)
    || state.stocks.length !== INITIAL_STOCKS.length
    || state.stocks.some((stock: unknown) => !record(stock) || typeof stock.id !== 'string' || !STOCK_IDS.has(stock.id) || typeof stock.name !== 'string'
      || typeof stock.code !== 'string' || typeof stock.sector !== 'string' || !Number.isFinite(stock.price)
      || Number(stock.price) < 0 || !Number.isFinite(stock.change) || !Array.isArray(stock.history)
      || !stock.history.length || stock.history.some((value: unknown) => !Number.isFinite(value)))
    || new Set(state.stocks.map((stock: { id: string }) => stock.id)).size !== INITIAL_STOCKS.length
    || !Array.isArray(state.logs) || state.logs.some((log: unknown) => !record(log) || !Number.isSafeInteger(log.id)
      || !Number.isSafeInteger(log.day) || typeof log.text !== 'string' || !['info', 'good', 'bad'].includes(String(log.tone)))
    || !Array.isArray(state.encounters) || !state.encounters.every((id: unknown) => Number.isSafeInteger(id) && Number(id) >= 0 && Number(id) < maxNode)
    || typeof state.weatherId !== 'string' || !Object.hasOwn(WEATHERS, state.weatherId)
    || (state.weatherHistory !== undefined && (!Array.isArray(state.weatherHistory) || state.weatherHistory.length > 10
      || state.weatherHistory.some((id: unknown) => typeof id !== 'string' || !Object.hasOwn(WEATHERS, id))))
    || (state.pending !== null && (!record(state.pending) || typeof state.pending.kind !== 'string'
      || typeof state.pending.title !== 'string' || typeof state.pending.body !== 'string'
      || !Array.isArray(state.pending.choices) || state.pending.choices.length > 32
      || state.pending.choices.some((choice: unknown) => !record(choice) || typeof choice.id !== 'string' || typeof choice.label !== 'string'
        || (choice.description !== undefined && typeof choice.description !== 'string')
        || (choice.disabled !== undefined && typeof choice.disabled !== 'boolean'))
      || (state.pending.casinoResult !== undefined && (state.pending.kind !== 'casino' || !validCasinoResult(state.pending.casinoResult, state.sequence)))
      || (state.pending.kind === 'event' && (!record(state.pending.data)
        || typeof state.pending.data.eventId !== 'string' || !eligibleEventIds.has(state.pending.data.eventId)))
      || (state.pending.kind === 'shop' && !validShopData(state.pending.data))))
    || (config.propertyTrading === false && record(state.pending) && state.pending.kind === 'trade')
    || (state.seasonReport !== null && (!record(state.seasonReport) || !Array.isArray(state.seasonReport.rankings)
      || state.seasonReport.rankings.some((row: unknown) => !record(row) || typeof row.name !== 'string' || !Number.isFinite(row.assets))))
    || !Number.isSafeInteger(state.rng) || !Number.isSafeInteger(state.sequence) || Number(state.sequence) < 0
    || ![6, 8, 12, 20, 100].includes(Number(state.selectedDie))
    || (state.controlledRoll !== undefined && state.controlledRoll !== null
      && (!Number.isSafeInteger(state.controlledRoll) || Number(state.controlledRoll) < 1 || Number(state.controlledRoll) > 6 || state.selectedDie !== 6))
    || (state.winnerId !== null && !playerIds.has(String(state.winnerId)))
    || (state.lastMarketEvent !== null && typeof state.lastMarketEvent !== 'string')
    || (state.phase === 'decision' && state.pending === null)
    || (state.phase !== 'decision' && state.pending !== null)
    || !['ready', 'decision', 'end', 'gameover'].includes(String(state.phase))) {
    throw new Error('存档中的对局数据无效。');
  }
  // A saved path has already changed the logical position. Resume with the piece at its destination.
  const saved = state as unknown as GameState;
  const map = MAPS[saved.config.mapId];
  const players = normalizePlayerColors(saved.players).map(player => ({ ...player,
    previousPosition: player.previousPosition !== null && map.nodes[player.position].neighbors.includes(player.previousPosition)
      ? player.previousPosition : null,
    routeNextPosition: player.routeNextPosition ?? null,
    travelProgress: player.travelProgress ?? 0,
  }));
  const normalizedConfig = { ...saved.config, propertyTrading: saved.config.propertyTrading ?? true,
    players: saved.config.players.map((entry, index) => ({ ...entry, color: players[index].color })) };
  const publicEncounters = [...(saved.turnEncounters ?? [])];
  let pending = saved.pending;
  if (pending?.kind === 'shop' && pending.data?.shopPurchases === undefined) {
    pending = { ...pending, data: { ...pending.data, shopPurchases: {} } };
  }
  if (pending?.kind === 'event') {
    const event = findEligibleEvent(saved.config.mapId, String(pending?.data?.eventId ?? ''));
    const player = players[saved.currentPlayerIndex];
    const node = map.nodes[player.position];
    if (event && ['event', 'empty'].includes(node.kind)
      && !publicEncounters.some(entry => entry.id === pending?.data?.turnEncounterId && !entry.selectedChoiceId)) {
      let id = `legacy-event-${saved.sequence}-${publicEncounters.length + 1}`;
      while (publicEncounters.some(entry => entry.id === id)) id += '-1';
      publicEncounters.push({ id, playerId: player.id, day: saved.day, nodeId: player.position, eventId: event.id,
        title: event.title, story: event.story, tone: event.tone, choices: pending.choices.map(choice => ({ ...choice })) });
      pending = { ...pending, data: { ...pending.data, turnEncounterId: id } };
    }
  }
  return { ...saved, config: normalizedConfig, players, propertyListings: saved.propertyListings ?? [], notices: saved.notices ?? [], turnEncounters: publicEncounters, pending,
    controlledRoll: saved.controlledRoll ?? null, movement: null, feedback: null };
}

export function loadSave(): GameState | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? parseSave(raw) : null;
  } catch { return null; }
}

export function saveGame(state: GameState): void {
  try { localStorage.setItem(KEY, JSON.stringify({ ...state, movement: null, feedback: null })); } catch { /* private mode or full storage */ }
}

export function clearSave(): void {
  try { localStorage.removeItem(KEY); } catch { /* private mode */ }
}

export function exportGame(state: GameState): void {
  const blob = new Blob([JSON.stringify({ ...state, movement: null, feedback: null }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `棱镜假日-第${state.day}天-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
