import type { AILevel, GameState, MapData, MapId, PlayerConfig, Shape } from './types';
import { MAPS } from './maps';
import { INITIAL_STOCKS, ITEMS, JOURNEY_REWARD_STEPS, WEATHERS, getJourneyRewardSteps } from './data';
import { findEligibleEvent, getEventPool } from './eventPool';
import { normalizePlayerColors } from './colors';
import { validShopData } from './shop';
import { getRent } from './engine';
import { migrateMapLayout } from './layoutMigration';
import { RENT_LEVELS } from './economy';
import { getLandPurchaseDescription, getLandPurchasePrice, getMaxLandLevel } from './propertyRules';
import { isTestRoomKind, TEST_ROOM_CAPACITY } from './testRooms';

const KEY = 'prism-days-save-v1';
const SHAPES: Shape[] = ['diamond', 'circle', 'hexagon', 'triangle'];
const AI_LEVELS: AILevel[] = ['gentle', 'fierce'];
const STOCK_IDS = new Set(INITIAL_STOCKS.map(stock => stock.id));
const NORMAL_SAVE_CAPACITY_LIMIT = 100;
// A test room starts at 99 instead of 10 slots. Preserve the same 90-slot allowance
// for ordinary +4 bag upgrades that existing saves already permit (10 through 100).
const TEST_ROOM_SAVE_CAPACITY_LIMIT = TEST_ROOM_CAPACITY + (NORMAL_SAVE_CAPACITY_LIMIT - 10);

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function encounterTile(kind: string) { return kind !== 'start' && kind !== 'event'; }

function validEventPrompt(state: GameState, map: MapData): boolean {
  const prompt = state.pending;
  if (!prompt || prompt.kind !== 'event' || !record(prompt.data) || typeof prompt.data.eventId !== 'string') return false;
  const player = state.players[state.currentPlayerIndex];
  const node = player && map.nodes[player.position];
  if (!node) return false;
  const source = prompt.data.eventSource;
  const continuation = prompt.data.continuation;
  const recordEntry = state.turnEncounters?.find(entry => entry.id === prompt.data?.turnEncounterId);
  const matchingRecord = !!recordEntry && recordEntry.playerId === player.id && recordEntry.day === state.day
    && recordEntry.nodeId === node.id && recordEntry.eventId === prompt.data.eventId
    && recordEntry.selectedChoiceId === undefined;
  if (source === undefined) {
    // Old saves only drew events from fixed event tiles or marked empty tiles.
    return continuation === undefined && ['event', 'empty'].includes(node.kind)
      && !!findEligibleEvent(map.id, prompt.data.eventId, 'tile');
  }
  if (source === 'tile') return node.kind === 'event' && continuation === undefined && matchingRecord
    && !!findEligibleEvent(map.id, prompt.data.eventId, 'tile');
  if (source !== 'encounter' || !encounterTile(node.kind) || !record(continuation)
    || Object.keys(continuation).sort().join(',') !== 'glitchBacktrack,nodeId,skipStation'
    || continuation.nodeId !== player.position || typeof continuation.skipStation !== 'boolean'
    || typeof continuation.glitchBacktrack !== 'boolean'
    || continuation.skipStation && node.kind !== 'station'
    || continuation.glitchBacktrack && state.weatherId !== 'glitch'
    || state.encounters.includes(player.position)) return false;
  return !!findEligibleEvent(map.id, prompt.data.eventId, 'encounter')
    && matchingRecord;
}

function validPlayerConfig(value: unknown): value is PlayerConfig {
  if (!record(value)) return false;
  return typeof value.name === 'string' && value.name.trim().length > 0 && value.name.length <= 32
    && typeof value.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(value.color)
    && SHAPES.includes(value.shape as Shape) && typeof value.ai === 'boolean'
    && ['cautious', 'balanced', 'aggressive'].includes(String(value.personality))
    && (value.aiLevel === undefined || AI_LEVELS.includes(value.aiLevel as AILevel));
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
  if (typeof config.mapId !== 'string' || !Object.hasOwn(MAPS, config.mapId) || !['pve', 'pvp'].includes(String(config.mode))
    || !Array.isArray(config.players)
    || (config.testRoom === undefined ? config.players.length < 2 || config.players.length > 4
      : !isTestRoomKind(config.testRoom) || config.players.length !== 1 || config.players[0]?.ai !== false)
    || !config.players.every(validPlayerConfig) || !Number.isSafeInteger(config.seed)
    || ![0, 4, 8, 16].includes(Number(config.seasons))
    || !['standard', 'challenge', 'hardship'].includes(String(config.weatherMode))
    || (config.propertyTrading !== undefined && typeof config.propertyTrading !== 'boolean')
    || (config.rentLevel !== undefined && !RENT_LEVELS.includes(config.rentLevel as typeof RENT_LEVELS[number]))) {
    throw new Error('存档中的游戏设置无效。');
  }
  if (config.mode === 'pve' && config.players.filter((p: PlayerConfig) => !p.ai).length !== 1) throw new Error('PVE 存档必须有一位真人玩家。');
  if (config.mode === 'pvp' && config.players.some((p: PlayerConfig) => p.ai)) throw new Error('PVP 存档不能包含电脑玩家。');
  migrateMapLayout(state, config.mapId as MapId);
  const maxNode = MAPS[config.mapId as MapId].nodes.length;
  const eligibleEventIds = new Set(getEventPool(config.mapId as MapId, 'encounter').map(event => event.id));
  if (!Array.isArray(state.players) || state.players.length !== config.players.length
    || state.players.some((p: unknown) => !record(p) || typeof p.id !== 'string' || !validPlayerConfig(p)
      || !Number.isFinite(p.cash) || !Number.isFinite(p.stamina) || !Number.isFinite(p.mood)
      || Number(p.stamina) < 0 || Number(p.stamina) > 100 || Number(p.mood) < 0 || Number(p.mood) > 100
      || !Number.isSafeInteger(p.position) || Number(p.position) < 0 || Number(p.position) >= maxNode
      || (p.previousPosition !== null && (!Number.isSafeInteger(p.previousPosition) || Number(p.previousPosition) < 0 || Number(p.previousPosition) >= maxNode))
      || (p.routeNextPosition !== undefined && p.routeNextPosition !== null
        && (!Number.isSafeInteger(p.routeNextPosition) || Number(p.routeNextPosition) < 0 || Number(p.routeNextPosition) >= maxNode
          || !MAPS[config.mapId as MapId].nodes[Number(p.position)]?.neighbors.includes(Number(p.routeNextPosition))))
      // Forest saves from the old 72-step rule may still have residues up to 71; normalize them after validation.
      || (p.travelProgress !== undefined && (!Number.isSafeInteger(p.travelProgress) || Number(p.travelProgress) < 0
        || Number(p.travelProgress) >= (config.mapId === 'forest' ? JOURNEY_REWARD_STEPS : getJourneyRewardSteps(config.mapId as MapId))))
      || !Array.isArray(p.inventory) || !p.inventory.every(validSlot)
      || !Array.isArray(p.pawnedItems) || !p.pawnedItems.every((pawn: unknown) => record(pawn) && validSlot(pawn.slot) && Number.isFinite(pawn.principal) && Number(pawn.principal) >= 0)
      || !record(p.holdings) || Object.entries(p.holdings).some(([id, value]) => !STOCK_IDS.has(id) || !Number.isSafeInteger(value) || Number(value) < 0)
      || (p.stockCostBasis !== undefined && (!record(p.stockCostBasis)
        || Object.entries(p.stockCostBasis).some(([id, value]) => !STOCK_IDS.has(id) || !Number.isFinite(value)
          || Number(value) < 0 || Number(value) > Number.MAX_SAFE_INTEGER || !Number.isSafeInteger((p.holdings as Record<string, unknown>)[id])
          || Number((p.holdings as Record<string, unknown>)[id]) <= 0)))
      || !Number.isSafeInteger(p.capacity) || Number(p.capacity) < 1
      || Number(p.capacity) > (config.testRoom === undefined ? NORMAL_SAVE_CAPACITY_LIMIT : TEST_ROOM_SAVE_CAPACITY_LIMIT)
      || !Array.isArray(p.statuses) || p.statuses.some((status: unknown) => !record(status) || typeof status.id !== 'string' || !Number.isSafeInteger(status.remaining))
      || (p.confinement !== null && (!record(p.confinement) || !['hospital', 'prison', 'sanatorium', 'parking'].includes(String(p.confinement.kind)) || !Number.isSafeInteger(p.confinement.remaining)))
      || typeof p.bankrupt !== 'boolean')) {
    throw new Error('存档中的玩家数据无效。');
  }
  if (config.testRoom !== undefined && state.players.some((player: { ai: boolean; inventory: { uid: string }[]; capacity: number }) =>
    player.ai !== false || player.inventory.length > player.capacity
    || new Set(player.inventory.map(slot => slot.uid)).size !== player.inventory.length)) {
    throw new Error('测试房存档中的背包数据无效。');
  }
  if (config.players.some((entry: PlayerConfig, index: number) =>
    (entry.aiLevel ?? 'gentle') !== ((state.players as PlayerConfig[])[index].aiLevel ?? 'gentle'))) {
    throw new Error('存档中的 AI 强度配置与玩家数据不一致。');
  }
  const playerIds = new Set(state.players.map((p: { id: string }) => p.id));
  const notices = state.notices;
  if (notices !== undefined && (!Array.isArray(notices) || notices.length > 30
    || notices.some((item: unknown) => !record(item) || !Number.isSafeInteger(item.id) || Number(item.id) < 0 || Number(item.id) > Number(state.sequence)
      || !Number.isSafeInteger(item.day) || Number(item.day) < 1 || !['rent', 'event', 'milestone', 'trade', 'lottery'].includes(String(item.kind))
      || typeof item.title !== 'string' || item.title.length > 200 || typeof item.body !== 'string' || item.body.length > 2000
      || !['good', 'bad', 'info'].includes(String(item.tone)) || !playerIds.has(String(item.playerId))
      || !Number.isSafeInteger(item.nodeId) || Number(item.nodeId) < 0 || Number(item.nodeId) >= maxNode
      || (item.amount !== undefined && !Number.isFinite(item.amount))
      || (item.kind === 'lottery' && (!Number.isSafeInteger(item.amount) || Number(item.amount) < 100 || Number(item.amount) > 5000
        || item.recipientId !== undefined))
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
      || MAPS[config.mapId as MapId].nodes[Number(item.nodeId)].kind === 'start'
      || typeof item.eventId !== 'string' || !eligibleEventIds.has(item.eventId)
      || !findEligibleEvent(config.mapId as MapId, item.eventId,
        MAPS[config.mapId as MapId].nodes[Number(item.nodeId)].kind === 'event' ? 'tile' : 'encounter')
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
      || Number(value.level) < 0
      || Number(value.level) > (MAPS[config.mapId as MapId].nodes[nodeId].kind === 'land' ? getMaxLandLevel(config.mapId as MapId) : 0)
      || typeof value.mortgaged !== 'boolean';
  })) throw new Error('存档中的产权数据无效。');
  if (state.availablePropertyLevels !== undefined && (!record(state.availablePropertyLevels)
    || config.mapId !== 'grandCity' && Object.keys(state.availablePropertyLevels).length > 0
    || Object.entries(state.availablePropertyLevels).some(([key, value]) => {
      const nodeId = Number(key);
      return !Number.isSafeInteger(nodeId) || String(nodeId) !== key || nodeId < 0 || nodeId >= maxNode
        || MAPS[config.mapId as MapId].nodes[nodeId].kind !== 'land'
        || Object.hasOwn(state.properties as Record<string, unknown>, key)
        || !Number.isSafeInteger(value) || Number(value) < 0 || Number(value) > getMaxLandLevel(config.mapId as MapId);
    }))) throw new Error('存档中的银行待售楼层无效。');
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
    || !Array.isArray(state.encounters) || state.encounters.length > 8
    || !state.encounters.every((id: unknown) => Number.isSafeInteger(id) && Number(id) >= 0 && Number(id) < maxNode)
    || new Set(state.encounters).size !== state.encounters.length
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
      || (state.pending.kind === 'event' && !validEventPrompt(state as unknown as GameState, MAPS[config.mapId as MapId]))
      || (state.pending.kind === 'shop' && !validShopData(state.pending.data))))
    || (config.propertyTrading === false && record(state.pending) && state.pending.kind === 'trade')
    || (state.seasonReport !== null && (!record(state.seasonReport) || !Array.isArray(state.seasonReport.rankings)
      || state.seasonReport.rankings.some((row: unknown) => !record(row) || typeof row.name !== 'string' || !Number.isFinite(row.assets))))
    || !Number.isSafeInteger(state.rng) || !Number.isSafeInteger(state.sequence) || Number(state.sequence) < 0
    || ![6, 8, 12, 20, 100].includes(Number(state.selectedDie))
    || (state.twinRoll !== undefined && typeof state.twinRoll !== 'boolean')
    || (state.twinRoll === true && state.controlledRoll !== undefined && state.controlledRoll !== null)
    || (state.controlledRoll !== undefined && state.controlledRoll !== null
      && (!Number.isSafeInteger(state.controlledRoll) || Number(state.controlledRoll) < 1 || Number(state.controlledRoll) > 6 || state.selectedDie !== 6))
    || (state.winnerId !== null && !playerIds.has(String(state.winnerId)))
    || (state.lastMarketEvent !== null && typeof state.lastMarketEvent !== 'string')
    || (state.phase === 'decision' && state.pending === null)
    || (state.phase !== 'decision' && state.pending !== null)
    || !['ready', 'decision', 'end', 'gameover'].includes(String(state.phase))) {
    throw new Error('存档中的对局数据无效。');
  }
  const aiTurn = state.aiTurn;
  if (aiTurn !== undefined && (!record(aiTurn) || typeof aiTurn.playerId !== 'string' || !playerIds.has(aiTurn.playerId)
    || ![aiTurn.day, aiTurn.actions, aiTurn.attacks, aiTurn.purchases].every(value => Number.isSafeInteger(value) && Number(value) >= 0))) {
    throw new Error('存档中的电脑回合预算无效。');
  }
  // A saved path has already changed the logical position. Resume with the piece at its destination.
  const saved = state as unknown as GameState;
  const map = MAPS[saved.config.mapId];
  const players = normalizePlayerColors(saved.players).map(player => {
    // These two sanatoria exchanged places with stations. Move only patients saved at the old ward.
    const oldWard = saved.config.mapId === 'lake' ? 47 : saved.config.mapId === 'coast' ? 33 : null;
    const newWard = saved.config.mapId === 'lake' ? 4 : saved.config.mapId === 'coast' ? 68 : null;
    const relocated = player.confinement?.kind === 'sanatorium' && player.position === oldWard
      && newWard !== null && map.nodes[newWard]?.kind === 'sanatorium';
    return { ...player, ...(player.ai ? { aiLevel: player.aiLevel ?? 'gentle' } : {}), position: relocated ? newWard : player.position,
      previousPosition: !relocated && player.previousPosition !== null && map.nodes[player.position].neighbors.includes(player.previousPosition)
        ? player.previousPosition : null,
      routeNextPosition: relocated ? null : player.routeNextPosition ?? null,
      travelProgress: (player.travelProgress ?? 0) % getJourneyRewardSteps(saved.config.mapId),
    };
  });
  const normalizedConfig = { ...saved.config, propertyTrading: saved.config.propertyTrading ?? true, rentLevel: saved.config.rentLevel ?? 'standard',
    players: saved.config.players.map((entry, index) => ({ ...entry,
      ...(entry.ai ? { aiLevel: entry.aiLevel ?? 'gentle' } : {}), color: players[index].color })) };
  const publicEncounters = [...(saved.turnEncounters ?? [])];
  let pending = saved.pending;
  if (pending?.kind === 'land') {
    const player = players[saved.currentPlayerIndex];
    const node = map.nodes[player.position];
    if (node.kind !== 'land' && !['power', 'water', 'telecom'].includes(node.kind)
      || pending.data?.nodeId !== node.id || saved.properties[node.id]) throw new Error('存档中的购地选择无效。');
    const price = getLandPurchasePrice({ ...saved, players }, node.id);
    pending = { ...pending, title: node.name, body: getLandPurchaseDescription({ ...saved, players }, node.id),
      choices: [{ id: 'buy', label: `购买 · ${price} PM`, disabled: player.cash < price }, { id: 'leave', label: '离开' }] };
  }
  if (pending?.kind === 'station') {
    const player = players[saved.currentPlayerIndex];
    const origin = map.nodes[player.position];
    if (origin.kind === 'station' && pending.data?.nodeId === player.position) {
      pending = { ...pending, title: origin.name, body: '乘车前往另一站，票价 100 PM。', choices: [
        ...map.nodes.filter(node => node.kind === 'station' && node.id !== origin.id)
          .map(node => ({ id: `station:${node.id}`, label: node.name, disabled: player.cash < 100 })),
        { id: 'leave', label: '离开' },
      ] };
    } else pending = { ...pending, title: '车站已迁址', body: '该站点已迁址，本次乘车可免费结束。',
      choices: [{ id: 'leave', label: '车站已迁址，结束本次乘车' }] };
  }
  if (pending?.kind === 'exchange') {
    const position = players[saved.currentPlayerIndex].position;
    const oldExchange = saved.config.mapId === 'lake' && position === 26
      || saved.config.mapId === 'valley' && position === 12
      || saved.config.mapId === 'sundered' && (position === 31 || position === 60);
    if (oldExchange && map.nodes[position].kind === 'station') {
      pending = { ...pending, kind: 'info', title: '交易所已迁址',
        body: '现金和股票持仓保持不变，本次访问可免费结束。', choices: [{ id: 'leave', label: '离开' }] };
    }
  }
  if (pending?.kind === 'rent') {
    const payer = players[saved.currentPlayerIndex];
    const node = map.nodes[payer.position];
    const property = saved.properties[node.id];
    const owner = players.find(player => player.id === property?.ownerId);
    if (!property || !owner || owner.id === payer.id || pending.data?.nodeId !== node.id
      || pending.data?.ownerId !== owner.id || !['land', 'power', 'water', 'telecom'].includes(node.kind)) {
      throw new Error('存档中的租金选择无效。');
    }
    const amount = getRent({ ...saved, config: normalizedConfig, players }, node.id);
    pending = amount > 0
      ? { ...pending, title: '租金选择', body: `${payer.name} 到达${node.name}，应向${owner.name}支付 ${amount} PM 租金。`,
        choices: [{ id: 'use_card', label: '使用免租卡', disabled: !payer.inventory.some(slot => slot.itemId === 'rent' && !slot.wet) },
          { id: 'pay', label: `支付 ${amount} PM，保留卡片` }],
        data: { ...pending.data, nodeId: node.id, ownerId: owner.id, amount } }
      : { ...pending, kind: 'info', title: '租金已免除', body: `${node.name}当前不收租，本次访问可免费结束。`,
        choices: [{ id: 'leave', label: '离开' }] };
  }
  if (pending?.kind === 'shop' && pending.data?.shopPurchases === undefined) {
    pending = { ...pending, data: { ...pending.data, shopPurchases: {} } };
  }
  if (pending?.kind === 'event') {
    const source = pending.data?.eventSource === 'tile' || pending.data?.eventSource === 'encounter'
      ? pending.data.eventSource : 'tile';
    const event = findEligibleEvent(saved.config.mapId, String(pending?.data?.eventId ?? ''), source);
    const player = players[saved.currentPlayerIndex];
    const node = map.nodes[player.position];
    if (event && node.kind !== 'start'
      && !publicEncounters.some(entry => entry.id === pending?.data?.turnEncounterId && !entry.selectedChoiceId)) {
      let id = `legacy-event-${saved.sequence}-${publicEncounters.length + 1}`;
      while (publicEncounters.some(entry => entry.id === id)) id += '-1';
      publicEncounters.push({ id, playerId: player.id, day: saved.day, nodeId: player.position, eventId: event.id,
        title: event.title, story: event.story, tone: event.tone, choices: pending.choices.map(choice => ({ ...choice })) });
      pending = { ...pending, data: { ...pending.data, turnEncounterId: id } };
    }
  }
  const activeAiTurn = saved.aiTurn && players[saved.currentPlayerIndex].ai && saved.phase !== 'gameover'
    && saved.aiTurn.playerId === players[saved.currentPlayerIndex].id && saved.aiTurn.day === saved.day ? saved.aiTurn : undefined;
  return { ...saved, mapLayoutVersion: 2, config: normalizedConfig, players, availablePropertyLevels: saved.availablePropertyLevels ?? {}, propertyListings: saved.propertyListings ?? [], notices: saved.notices ?? [], turnEncounters: publicEncounters, pending,
    aiTurn: activeAiTurn,
    controlledRoll: saved.controlledRoll ?? null, twinRoll: saved.twinRoll ?? false, movement: null, feedback: null };
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
