import { INITIAL_STOCKS, ITEMS, JOURNEY_REWARD_CASH, JOURNEY_REWARD_STEPS, WEATHERS } from './data';
import { findEligibleEvent, getEventWeights } from './eventPool';
import { MAPS } from './maps';
import { normalizePlayerColors } from './colors';
import { drawSlotItem, SLOT_POOL_TOTAL, SLOTS_STAKE } from './casino';
import { weatherWeights } from './weather';
import { getShopOffer, SHOP_ITEM_RARITY } from './shop';
export { weatherWeights } from './weather';
import type { CasinoResult, EventDef, GameAction, GameConfig, GameEffect, GameNotice, GameState, InventorySlot, MapNode, Movement, Player, Prompt, Property, PropertyListing, Stock, TurnEncounter } from './types';

const START_CASH = 100_000;
const RENT_MULTIPLIERS = [0.24, 0.54, 1.05, 1.95, 3.6];
const UTILITY_KINDS = new Set(['power', 'water', 'telecom']);
const PROPERTY_KINDS = new Set(['land', 'power', 'water', 'telecom']);
const WIND = new Set(['breeze', 'gale', 'sand', 'sandstorm']);
const MAX_PROPERTY_PRICE = 1_000_000_000;

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const clamp = (value: number, low = 0, high = 100) => Math.max(low, Math.min(high, value));
const next = (state: GameState): number => {
  state.rng = (Math.imul(state.rng, 1664525) + 1013904223) >>> 0;
  return state.rng / 0x1_0000_0000;
};
const rand = (state: GameState, low: number, high: number) => low + Math.floor(next(state) * (high - low + 1));
const log = (state: GameState, text: string, tone: 'info' | 'good' | 'bad' = 'info') => {
  state.logs.push({ id: ++state.sequence, day: state.day, text, tone });
  if (state.logs.length > 150) state.logs.shift();
};
const notice = (state: GameState, entry: Omit<GameNotice, 'id' | 'day'>) => {
  (state.notices ??= []).push({ id: ++state.sequence, day: state.day, ...entry });
  if (state.notices.length > 30) state.notices.splice(0, state.notices.length - 30);
};
const effect = (kind: GameEffect['kind'], label: string, tone: GameEffect['tone'] = 'info'): GameEffect => ({ kind, label, tone });
const addLandingEffect = (state: GameState, entry: GameEffect) => {
  if (state.movement?.playerId === current(state).id) (state.movement.effects ??= []).push(entry);
};
const setFeedback = (state: GameState, player: Player, ...effects: GameEffect[]) => {
  state.feedback = { id: ++state.sequence, playerId: player.id, nodeId: player.position, effects };
};
const nodeAt = (state: GameState, id: number) => MAPS[state.config.mapId].nodes.find(node => node.id === id);
const current = (state: GameState) => state.players[state.currentPlayerIndex];
const status = (player: Player, id: string) => player.statuses.some(s => s.id === id && s.remaining > 0);
const addStatus = (player: Player, id: string, remaining: number) => {
  const existing = player.statuses.find(s => s.id === id);
  if (existing) existing.remaining = Math.max(existing.remaining, remaining);
  else player.statuses.push({ id, remaining });
};
const propertyOf = (state: GameState, id: number): Property | undefined => state.properties[id];
const tradingEnabled = (state: GameState) => state.config.propertyTrading !== false;
const removeListing = (state: GameState, nodeId: number) => {
  state.propertyListings = (state.propertyListings ?? []).filter(listing => listing.nodeId !== nodeId);
};
const pruneListings = (state: GameState) => {
  state.propertyListings = (state.propertyListings ?? []).filter(listing => {
    const property = state.properties[listing.nodeId];
    const seller = state.players.find(player => player.id === listing.sellerId);
    return !!seller && !seller.bankrupt && property?.ownerId === listing.sellerId && !property.mortgaged;
  });
};
const isUtility = (node: MapNode) => UTILITY_KINDS.has(node.kind);
const isProperty = (node: MapNode) => PROPERTY_KINDS.has(node.kind);
const costOf = (node: MapNode) => Math.max(0, node.price ?? 0);
const stackSlots = (player: Player) => player.inventory.length;
const inventoryItem = (player: Player, itemId: string) => player.inventory.find(s => s.itemId === itemId);
const canAdd = (player: Player, itemId: string, quantity = 1) => {
  const def = ITEMS[itemId];
  return !!def && Number.isSafeInteger(quantity) && quantity > 0 && (def.stackable
    ? (!!inventoryItem(player, itemId) || stackSlots(player) < player.capacity)
    : stackSlots(player) + quantity <= player.capacity);
};
const addItem = (state: GameState, player: Player, itemId: string, quantity = 1) => {
  const def = ITEMS[itemId];
  if (!def || !canAdd(player, itemId, quantity)) return false;
  const old = def.stackable && inventoryItem(player, itemId);
  if (old) old.quantity += quantity;
  else if (def.stackable) player.inventory.push({ uid: `${++state.sequence}`, itemId, quantity, wet: false });
  else for (let i = 0; i < quantity; i++) {
    player.inventory.push({ uid: `${++state.sequence}`, itemId, quantity: 1, wet: false });
  }
  return true;
};
const consumeItem = (player: Player, uid: string) => {
  const slot = player.inventory.find(s => s.uid === uid);
  if (!slot) return false;
  if (slot.quantity > 1) slot.quantity--;
  else player.inventory = player.inventory.filter(s => s.uid !== uid);
  return true;
};
const charge = (state: GameState, player: Player, amount: number) => {
  if (!Number.isFinite(amount) || amount < 0) return false;
  player.cash -= amount;
  return true;
};
const credit = (player: Player, amount: number) => { if (Number.isFinite(amount) && amount > 0) player.cash += amount; };

export function quoteStockTrade(price: number, quantity: number): { gross: number; fee: number; total: number } {
  if (!Number.isFinite(price) || price < 0 || !Number.isSafeInteger(quantity)) throw new RangeError('Invalid stock quote');
  const gross = price * Math.abs(quantity);
  if (!Number.isFinite(gross) || gross > Number.MAX_SAFE_INTEGER) throw new RangeError('Stock quote exceeds safe range');
  const fee = Math.ceil(gross * 0.003);
  return { gross, fee, total: quantity < 0 ? gross - fee : gross + fee };
}

export function quoteStockSale(player: Player, stock: Stock, quantity: number): {
  gross: number; fee: number; total: number; costBasis: number | null; profit: number | null; profitRate: number | null;
} | null {
  const held = player.holdings[stock.id] ?? 0;
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > held || !Number.isSafeInteger(held) || held <= 0) return null;
  const quote = quoteStockTrade(stock.price, -quantity);
  const known = player.stockCostBasis?.[stock.id];
  const costBasis = known === undefined ? null : quantity === held ? known : known * quantity / held;
  const profit = costBasis === null ? null : quote.total - costBasis;
  return { ...quote, costBasis, profit, profitRate: profit === null || costBasis === null || costBasis === 0 ? null : profit / costBasis };
}

export function getStockPosition(player: Player, stock: Stock): {
  quantity: number; costBasis: number | null; averageCost: number | null; marketValue: number;
  liquidation: { gross: number; fee: number; total: number }; profit: number | null; profitRate: number | null;
} {
  const quantity = player.holdings[stock.id] ?? 0;
  const liquidation = quoteStockTrade(stock.price, -quantity);
  const sale = quantity > 0 ? quoteStockSale(player, stock, quantity) : null;
  const costBasis = sale?.costBasis ?? null;
  return { quantity, costBasis, averageCost: costBasis === null || quantity === 0 ? null : costBasis / quantity,
    marketValue: quantity * stock.price, liquidation, profit: sale?.profit ?? null, profitRate: sale?.profitRate ?? null };
}

function buyStock(player: Player, stock: Stock, quantity: number, total: number) {
  const held = player.holdings[stock.id] ?? 0;
  const known = player.stockCostBasis?.[stock.id];
  player.holdings[stock.id] = held + quantity;
  if (held === 0) (player.stockCostBasis ??= {})[stock.id] = total;
  else if (known !== undefined) player.stockCostBasis![stock.id] = known + total;
  player.cash -= total;
}

function sellStock(player: Player, stock: Stock, quantity: number) {
  const sale = quoteStockSale(player, stock, quantity);
  if (!sale) return null;
  const remaining = player.holdings[stock.id] - quantity;
  player.holdings[stock.id] = remaining;
  if (remaining === 0) delete player.stockCostBasis?.[stock.id];
  else if (sale.costBasis !== null) player.stockCostBasis![stock.id] -= sale.costBasis;
  credit(player, sale.total);
  return sale;
}

function declareBankruptcy(state: GameState, player: Player) {
  player.bankrupt = true;
  player.cash = 0;
  player.holdings = {};
  player.stockCostBasis = {};
  player.inventory = [];
  player.pawnedItems = [];
  for (const [id, prop] of Object.entries(state.properties)) if (prop.ownerId === player.id) delete state.properties[Number(id)];
  state.propertyListings = (state.propertyListings ?? []).filter(listing => listing.sellerId !== player.id);
  log(state, `${player.name} 资不抵债，宣告破产。`, 'bad');
  const survivors = state.players.filter(p => !p.bankrupt);
  if (survivors.length <= 1) {
    state.phase = 'gameover';
    state.pending = null;
    state.turnEncounters = [];
    state.winnerId = survivors[0]?.id ?? null;
  }
}

function pawnValue(itemId: string) { const def = ITEMS[itemId]; return Math.floor((def?.shop ? def.price : 10_000) * 0.5); }

function debtPrompt(state: GameState, resumePhase: 'ready' | 'end' = 'end', resumeGlitchBacktrack = false): Prompt {
  const player = current(state);
  const choices: Prompt['choices'] = [];
  for (const [id, prop] of Object.entries(state.properties)) {
    if (prop.ownerId === player.id && !prop.mortgaged) {
      const amount = Math.floor(assetValue(state, Number(id), prop) * 0.5);
      choices.push({ id: `mortgage:${id}`, label: `抵押 ${nodeAt(state, Number(id))?.name} · +${amount} PM` });
    }
  }
  for (const slot of player.inventory) choices.push({ id: `pawn:${slot.uid}`, label: `抵押 ${ITEMS[slot.itemId]?.name ?? slot.itemId} · +${pawnValue(slot.itemId)} PM` });
  for (const stock of state.stocks) {
    const count = player.holdings[stock.id] ?? 0;
    if (count > 0) choices.push({ id: `sellstock:${stock.id}`, label: `卖出 ${stock.name} ${count} 股 · +${quoteStockTrade(stock.price, -count).total} PM` });
  }
  choices.push({ id: 'bankrupt', label: '宣布破产' });
  return simplePrompt('debt', '资金不足', `${player.name} 欠款 ${-player.cash} PM。请选择资产抵押或卖股偿还。`, choices,
    { resumePhase, ...(resumeGlitchBacktrack ? { resumeGlitchBacktrack: true } : {}) });
}

function enforceDebt(state: GameState, resumePhase?: 'ready' | 'end') {
  const player = current(state);
  if (!player || player.bankrupt || state.phase === 'gameover') return;
  if (player.cash < 0) {
    const resume = resumePhase ?? (state.pending?.kind === 'debt' ? state.pending.data?.resumePhase as 'ready' | 'end' : state.phase === 'ready' ? 'ready' : 'end');
    const resumeGlitch = state.pending?.kind === 'debt' && state.pending.data?.resumeGlitchBacktrack === true;
    state.pending = debtPrompt(state, resume, resumeGlitch);
    state.phase = 'decision';
  } else if (state.pending?.kind === 'debt') {
    state.phase = state.pending.data?.resumePhase === 'ready' ? 'ready' : 'end';
    state.pending = null;
  }
}

function assetValue(state: GameState, id: number, prop: Property) {
  const node = nodeAt(state, id);
  if (!node) return 0;
  const price = costOf(node);
  return price + (isUtility(node) ? 0 : Math.ceil(price * 0.75) * prop.level);
}

function itemWorth(itemId: string) { const def = ITEMS[itemId]; return def ? (def.shop ? def.price : 10_000) : 0; }

export function getNetWorth(state: GameState, playerId: string): number {
  const player = state.players.find(p => p.id === playerId);
  if (!player || player.bankrupt) return 0;
  return player.cash + Object.entries(state.properties).reduce((sum, [id, prop]) => {
    if (prop.ownerId !== playerId) return sum;
    const value = assetValue(state, Number(id), prop);
    return sum + value - (prop.mortgaged ? Math.floor(value * 0.5) : 0);
  }, 0)
    + state.stocks.reduce((sum, stock) => sum + (player.holdings[stock.id] ?? 0) * stock.price, 0)
    + player.inventory.reduce((sum, slot) => sum + itemWorth(slot.itemId) * slot.quantity, 0)
    + player.pawnedItems.reduce((sum, pawn) => sum + itemWorth(pawn.slot.itemId) * pawn.slot.quantity - pawn.principal, 0);
}

export function getRent(state: GameState, nodeId: number): number {
  const node = nodeAt(state, nodeId);
  const prop = propertyOf(state, nodeId);
  if (!node || !prop || prop.mortgaged || state.weatherId === 'paradox') return 0;
  const owner = state.players.find(p => p.id === prop.ownerId);
  if (!owner || owner.bankrupt || owner.confinement?.kind === 'hospital' || owner.confinement?.kind === 'prison') return 0;
  if (isUtility(node)) {
    const count = Object.entries(state.properties).filter(([id, p]) => p.ownerId === prop.ownerId && !p.mortgaged && !!nodeAt(state, Number(id)) && isUtility(nodeAt(state, Number(id))!)).length;
    return Math.min(30_000, 120 * 3 ** Math.max(0, count - 1));
  }
  return Math.ceil(costOf(node) * RENT_MULTIPLIERS[clamp(prop.level, 0, 4)]);
}

export function getTileRentPreview(state: GameState, nodeId: number, playerId?: string): {
  price: number; rent: number; purchasable: boolean; prospective: boolean; reason?: string;
} {
  const node = nodeAt(state, nodeId);
  if (!node || !isProperty(node)) return { price: 0, rent: 0, purchasable: false, prospective: false, reason: '此处不是可购地块' };
  const price = costOf(node);
  const prop = propertyOf(state, nodeId);
  if (prop) {
    const rent = getRent(state, nodeId);
    const owner = state.players.find(player => player.id === prop.ownerId);
    const reason = rent > 0 ? undefined : state.weatherId === 'paradox' ? '奇异悖论期间免租'
      : prop.mortgaged ? '地块已抵押，暂停收租'
      : owner?.confinement?.kind === 'hospital' || owner?.confinement?.kind === 'prison' ? '产权人禁锢期间免租'
      : !owner || owner.bankrupt ? '产权人无法收租' : '当前无租金';
    return { price, rent, purchasable: false, prospective: false, ...(reason ? { reason } : {}) };
  }
  const viewer = state.players.find(player => player.id === (playerId ?? current(state)?.id));
  if (!viewer || viewer.bankrupt) return { price, rent: 0, purchasable: false, prospective: true, reason: '玩家无法购入' };
  const blocked = state.weatherId === 'paradox';
  const suspended = viewer.confinement?.kind === 'hospital' || viewer.confinement?.kind === 'prison';
  const ownedUtilities = isUtility(node) ? Object.entries(state.properties).filter(([id, holding]) => {
    const heldNode = nodeAt(state, Number(id));
    return holding.ownerId === viewer.id && !holding.mortgaged && !!heldNode && isUtility(heldNode);
  }).length : 0;
  const rent = blocked || suspended ? 0 : isUtility(node) ? Math.min(30_000, 120 * 3 ** ownedUtilities) : Math.ceil(price * RENT_MULTIPLIERS[0]);
  const reason = blocked ? '奇异悖论期间不可购买或收租' : suspended ? '玩家禁锢期间无法收租' : viewer.cash < price ? '资金不足，暂不可购入' : undefined;
  return { price, rent, purchasable: !blocked && viewer.cash >= price, prospective: true, ...(reason ? { reason } : {}) };
}

export const getCurrentPlayer = (state: GameState): Player => current(state);

export function canUseItem(state: GameState, playerId: string, itemUid: string): boolean {
  const player = state.players.find(p => p.id === playerId);
  const slot = player?.inventory.find(s => s.uid === itemUid);
  if (!player || player.bankrupt || player.id !== current(state)?.id || state.phase !== 'ready' || player.confinement || !slot || slot.wet || state.weatherId === 'paradox') return false;
  if (!Object.prototype.hasOwnProperty.call(ITEMS, slot.itemId) || ['rent', 'shield', 'arrest'].includes(slot.itemId)) return false;
  if (slot.itemId === 'controller') return state.selectedDie === 6 && state.controlledRoll == null;
  if (/^dice(8|12|20|100)$/.test(slot.itemId)) return state.controlledRoll == null;
  return true;
}

function chooseWeather(state: GameState) {
  const weights = weatherWeights(state);
  const valid = Object.values(WEATHERS);
  const total = valid.reduce((sum, w) => sum + weights[w.id], 0);
  let ticket = next(state) * total;
  for (const weather of valid) { ticket -= weights[weather.id]; if (ticket < 0) return weather.id; }
  return 'clear';
}

/** A pure stock quote step. Stochastic rounding keeps small prices able to recover. */
export function marketStep(price: number, referencePrice: number, dailyShock: number, eventShock: number, roundingTicket: number): number {
  if (![price, referencePrice, dailyShock, eventShock, roundingTicket].every(Number.isFinite)
    || price < 1 || referencePrice < 1 || roundingTicket < 0 || roundingTicket >= 1) throw new RangeError('Invalid market step');
  const reversion = Math.max(-0.04, Math.min(0.04, Math.log(referencePrice / price) * 0.025));
  const raw = price * Math.exp(reversion + dailyShock + eventShock);
  if (!Number.isFinite(raw) || raw > Number.MAX_SAFE_INTEGER) throw new RangeError('Stock quote exceeds safe range');
  const whole = Math.floor(raw);
  return Math.max(1, whole + (roundingTicket < raw - whole ? 1 : 0));
}

function marketDay(state: GameState) {
  const event = next(state) < 0.02;
  const eventSign = next(state) < 0.5 ? -1 : 1;
  state.lastMarketEvent = event ? (eventSign < 0 ? '黑色星期一' : '技术浪潮') : null;
  for (const stock of state.stocks) {
    // Consume the same number of draws every day, independent of event outcome.
    const dailyShock = (next(state) * 2 - 1) * 0.06;
    const eventMagnitude = 0.25 + next(state) * 0.1;
    const roundingTicket = next(state);
    const old = stock.price;
    const referencePrice = INITIAL_STOCKS.find(initial => initial.id === stock.id)?.price ?? old;
    stock.price = marketStep(old, referencePrice, dailyShock, event ? eventSign * eventMagnitude : 0, roundingTicket);
    stock.change = Math.round((stock.price / old - 1) * 1000) / 10;
    stock.history.push(stock.price);
    if (stock.history.length > 60) stock.history.shift();
  }
}

function refreshEncounters(state: GameState) {
  const nodes = MAPS[state.config.mapId].nodes.filter(n => n.kind === 'empty').map(n => n.id);
  for (let i = nodes.length - 1; i > 0; i--) { const j = rand(state, 0, i); [nodes[i], nodes[j]] = [nodes[j], nodes[i]]; }
  state.encounters = nodes.slice(0, Math.min(nodes.length, rand(state, 5, 8)));
}

function startDay(state: GameState) {
  state.day++;
  const controlled = state.players.flatMap(p => p.statuses).find(s => s.id.startsWith('weather:'))?.id.slice(8);
  const previousWeather = state.weatherId;
  // An actively used weather controller is a deliberate cross-season override; only natural draws use seasons.
  state.weatherId = controlled && Object.prototype.hasOwnProperty.call(WEATHERS, controlled) ? controlled : chooseWeather(state);
  state.weatherHistory = [...(state.weatherHistory ?? [previousWeather]), state.weatherId].slice(-2);
  for (const player of state.players) {
    if (player.bankrupt) continue;
    player.statuses = player.statuses.map(s => ({ ...s, remaining: s.remaining - 1 })).filter(s => s.remaining > 0);
    const drying = state.weatherId === 'drought' ? 1 : WIND.has(state.weatherId) ? 0.5 : 0.25;
    for (const slot of player.inventory) if (slot.wet && next(state) < drying) slot.wet = false;
  }
  marketDay(state);
  refreshEncounters(state);
  if (state.day > 1 && (state.day - 1) % 21 === 0) {
    state.seasonReport = {
      season: Math.ceil((state.day - 1) / 21), day: state.day - 1,
      rankings: state.players.map(p => ({ id: p.id, name: p.name, assets: getNetWorth(state, p.id), color: p.color })).sort((a, b) => b.assets - a.assets),
    };
    if (state.config.seasons > 0 && state.day > state.config.seasons * 21) {
      state.phase = 'gameover';
      state.winnerId = state.seasonReport.rankings.find(r => !state.players.find(p => p.id === r.id)?.bankrupt)?.id ?? null;
      log(state, `${state.seasonReport.season} 季结束，资产结算完成。`, 'good');
    }
  }
  log(state, `第 ${state.day} 天，天气：${WEATHERS[state.weatherId]?.name ?? state.weatherId}。`);
}

function openTurn(state: GameState) {
  const player = current(state);
  if (state.day > 1) charge(state, player, 120);
  if (player.confinement) {
    const kind = player.confinement.kind;
    player.confinement.remaining--;
    if (player.confinement.remaining <= 0) {
      player.confinement = null;
      if (kind === 'hospital') player.stamina = Math.max(60, player.stamina);
      if (kind === 'sanatorium') player.mood = Math.max(60, player.mood);
      log(state, `${player.name} 离开${kind === 'hospital' ? '医院' : kind === 'sanatorium' ? '疗养院' : '禁锢地'}。`);
    }
    state.phase = 'end';
  } else state.phase = 'ready';
  state.pending = null;
  state.selectedDie = 6;
  state.movement = null;
  enforceDebt(state, state.phase === 'ready' ? 'ready' : 'end');
}

function endTurn(state: GameState) {
  if (state.phase === 'gameover') return;
  state.turnEncounters = [];
  state.controlledRoll = null;
  const initial = state.currentPlayerIndex;
  do {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    if (state.currentPlayerIndex === 0) startDay(state);
    if ((state as GameState).phase === 'gameover') return;
  } while (current(state).bankrupt && state.currentPlayerIndex !== initial);
  openTurn(state);
}

export function createGame(config: GameConfig): GameState {
  if (!Object.prototype.hasOwnProperty.call(MAPS, config.mapId)) throw new Error('Unknown map');
  if (config.players.length < 2 || config.players.length > 4) throw new Error('2–4 players required');
  if (![0, 4, 8, 16].includes(config.seasons)) throw new Error('Invalid season count');
  if (!['standard', 'challenge'].includes(config.weatherMode)) throw new Error('Invalid weather mode');
  if (!Number.isSafeInteger(config.seed)) throw new Error('Invalid random seed');
  if (config.propertyTrading !== undefined && typeof config.propertyTrading !== 'boolean') throw new Error('Invalid property trading setting');
  const start = MAPS[config.mapId].nodes.find(n => n.kind === 'start')?.id ?? MAPS[config.mapId].nodes[0].id;
  const seed = config.seed >>> 0;
  const normalizedPlayers = normalizePlayerColors(config.players);
  const players: Player[] = normalizedPlayers.map((p, index) => ({
    ...copy(p), id: `p${index + 1}`, cash: START_CASH, stamina: 100, mood: 100, position: start, previousPosition: null, routeNextPosition: null, travelProgress: 0,
    inventory: [], pawnedItems: [], capacity: 10, holdings: {}, stockCostBasis: {}, confinement: null, statuses: [], bankrupt: false,
  }));
  const stocks: Stock[] = copy(INITIAL_STOCKS).map(s => ({ ...s, history: s.history?.length ? s.history : [s.price], change: s.change ?? 0 }));
  const state: GameState = { version: 1, config: { ...copy(config), propertyTrading: config.propertyTrading ?? true, players: copy(normalizedPlayers) }, players, currentPlayerIndex: 0, day: 1, weatherId: 'clear', properties: {}, propertyListings: [],
    encounters: [], turnEncounters: [], stocks, logs: [], notices: [], phase: 'ready', pending: null,
    movement: null, feedback: null, seasonReport: null, rng: seed, sequence: 0, winnerId: null, lastMarketEvent: null, selectedDie: 6, controlledRoll: null };
  for (const player of state.players) { addItem(state, player, 'snack', 2); addItem(state, player, 'rent', 1); addItem(state, player, 'dice8', 1); }
  state.weatherId = chooseWeather(state);
  state.weatherHistory = [state.weatherId];
  refreshEncounters(state);
  log(state, `第 1 天，天气：${WEATHERS[state.weatherId]?.name ?? state.weatherId}。`);
  return state;
}

function simplePrompt(kind: string, title: string, body: string, choices: Prompt['choices'], data?: Prompt['data']): Prompt {
  return { kind, title, body, choices, data };
}

function makeChoice(state: GameState, prompt: Prompt) { state.pending = prompt; state.phase = 'decision'; }
function finishDecision(state: GameState, combineTransfer = false) {
  const glitch = state.pending?.data?.glitchBacktrack === true;
  const resumeReady = state.pending?.kind === 'trade' && state.pending.data?.resumePhase === 'ready';
  state.pending = null;
  state.phase = resumeReady ? 'ready' : 'end';
  if (glitch) glitchBacktrack(state, !combineTransfer);
}

function moveStep(state: GameState, player: Player, path: number[]) {
  const here = nodeAt(state, player.position);
  if (!here?.neighbors.length) return;
  let candidates = here.neighbors;
  const incoming = path.length > 1 ? path[path.length - 2] : player.previousPosition;
  if (candidates.length > 1 && incoming !== null && here.neighbors.includes(incoming)) candidates = candidates.filter(n => n !== incoming);
  // A weather retreat may reverse the physical arrival edge. Resume once toward the road it came from,
  // then use ordinary no-U-turn routing through bends and intersections.
  const resume = path.length === 1 && player.routeNextPosition != null && here.neighbors.includes(player.routeNextPosition)
    ? player.routeNextPosition : null;
  const randomExit = candidates[rand(state, 0, candidates.length - 1)];
  const nextId = resume ?? randomExit;
  player.routeNextPosition = null;
  player.previousPosition = player.position;
  player.position = nextId;
  path.push(nextId);
  if (nodeAt(state, nextId)?.kind === 'start') { credit(player, 1200); log(state, `${player.name} 经过起点，领取 1,200 PM。`, 'good'); }
}

function walk(state: GameState, player: Player, steps: number, backwards = false, path?: number[]) {
  const trace = path ?? [player.position];
  if (!backwards) for (let i = 0; i < steps; i++) moveStep(state, player, trace);
  else {
    const initialLength = trace.length;
    const forward = trace.slice();
    for (let i = 0; i < steps; i++) {
      const here = nodeAt(state, player.position);
      if (!here) break;
      const back = forward.length > 1 ? forward[forward.length - 2] : i === 0 ? player.previousPosition : null;
      let candidate = back;
      if (candidate == null || !here.neighbors.includes(candidate)) {
        const options = here.neighbors.filter(n => n !== trace[trace.length - 2]);
        candidate = (options.length ? options : here.neighbors)[rand(state, 0, (options.length ? options : here.neighbors).length - 1)];
      }
      player.previousPosition = player.position;
      player.position = candidate;
      trace.push(candidate);
      if (forward.length > 1) forward.pop();
    }
    if (trace.length > initialLength) player.routeNextPosition = trace[trace.length - 2];
  }
  return trace;
}

function sendTo(state: GameState, player: Player, kind: 'hospital' | 'prison' | 'sanatorium' | 'parking', turns = 3, appendMovement = false) {
  if (kind === 'prison') {
    const immunity = player.inventory.find(s => !s.wet && (s.itemId === 'arrest' || s.itemId === 'shield'));
    if (immunity) { consumeItem(player, immunity.uid); log(state, `${player.name} 使用${ITEMS[immunity.itemId]?.name}免除拘留。`, 'good'); return; }
  }
  const node = MAPS[state.config.mapId].nodes.find(n => n.kind === kind);
  const destinationName = kind === 'hospital' ? '医院' : kind === 'sanatorium' ? '疗养院' : kind === 'parking' ? '停车区' : '监狱';
  if (node) {
    const from = player.position;
    player.previousPosition = null;
    player.routeNextPosition = null;
    player.position = node.id;
    const path = [from, node.id];
    if (appendMovement && state.movement?.playerId === player.id) {
      state.movement.path.push(node.id);
      (state.movement.segments ??= []).push({ kind: 'transfer', path, label: `前往${destinationName}` });
    } else state.movement = { id: ++state.sequence, playerId: player.id, path, roll: 0, modifier: 0, dice: false,
      segments: [{ kind: 'transfer', path, label: `前往${destinationName}` }], effects: [] };
  }
  player.confinement = { kind, remaining: turns };
  if (player.id === current(state).id) { state.pending = null; state.phase = 'end'; }
  state.movement?.effects?.push(effect('confinement', `前往${destinationName} · 停留${turns}回合`, 'bad'));
  log(state, `${player.name} 被送往${destinationName}，停留 ${turns} 回合。`, 'bad');
}

function checkHealth(state: GameState, player: Player, appendMovement = false) {
  if (player.bankrupt || player.confinement || state.phase === 'gameover') return true;
  if (player.stamina <= 0) { sendTo(state, player, 'hospital', 3, appendMovement); return true; }
  if (player.mood <= 0) { sendTo(state, player, 'sanatorium', 3, appendMovement); return true; }
  return false;
}

function weatherMove(state: GameState, player: Player, path: number[]) {
  const id = state.weatherId;
  const sheltered = status(player, 'umbrella');
  if (id === 'snow') walk(state, player, 1, false, path);
  if (id === 'blizzard' || id === 'glitch') walk(state, player, 2, false, path);
  if (id === 'freezing') walk(state, player, 4, false, path);
  if (id === 'gale') walk(state, player, 1, true, path);
  if (id === 'sand') walk(state, player, 2, true, path);
  if (id === 'sandstorm') walk(state, player, 4, true, path);
  if (!sheltered && id === 'sandstorm') { player.stamina = clamp(player.stamina - 2); player.mood = clamp(player.mood - 2); }
  if (!sheltered && (id === 'thunder' || id === 'storm') && next(state) < (id === 'thunder' ? 0.1 : 0.25)) {
    player.stamina = clamp(player.stamina - 12); log(state, `${player.name} 遭遇雷击，体力 -12。`, 'bad');
  }
  if (!sheltered && id === 'glitch') {
    const effect = rand(state, 0, 2);
    if (effect === 0) player.stamina = clamp(player.stamina - 6);
    if (effect === 1) player.stamina = clamp(player.stamina - 12);
    if (effect === 2) { player.stamina = clamp(player.stamina - 2); player.mood = clamp(player.mood - 2); }
    log(state, `${player.name} 遭遇故障天气的${['冻伤', '雷击', '沙尘'][effect]}影响。`, 'bad');
  }
  if (!sheltered && (id === 'gale' || id === 'sand' || id === 'sandstorm') && next(state) < (id === 'gale' ? 0.1 : id === 'sand' ? 0.15 : 0.25)) {
    const paper = player.inventory.filter(slot => ITEMS[slot.itemId]?.paper);
    if (paper.length) {
      const slot = paper[rand(state, 0, paper.length - 1)];
      consumeItem(player, slot.uid); log(state, `${player.name} 的纸质道具被风吹走。`, 'bad');
    } else {
      const lost = Math.min(player.cash, rand(state, 30, 150));
      charge(state, player, lost); log(state, `${player.name} 被风吹走 ${lost} PM。`, 'bad');
    }
  }
  if (!sheltered && (id === 'rain' || id === 'storm' || id === 'drizzle')) {
    const wettable = player.inventory.filter(slot => state.config.weatherMode === 'challenge' || ITEMS[slot.itemId]?.susceptible);
    if (id === 'storm') for (const slot of wettable) slot.wet = true;
    else if (wettable.length) wettable[rand(state, 0, wettable.length - 1)].wet = true;
  }
  if (!sheltered && id === 'haze') player.mood = clamp(player.mood - 6);
}

function weatherLand(state: GameState, player: Player, node: MapNode) {
  if (status(player, 'umbrella')) return;
  const building = !!state.properties[node.id]?.level || isUtility(node) || ['shop', 'station', 'casino', 'exchange', 'hospital', 'prison', 'sanatorium', 'parking'].includes(node.kind);
  if (building) return;
  const beforeStamina = player.stamina;
  const beforeMood = player.mood;
  const id = state.weatherId;
  if (id === 'chill') player.stamina = clamp(player.stamina - 4);
  if (id === 'snow') player.stamina = clamp(player.stamina - 1);
  if (id === 'blizzard') player.stamina = clamp(player.stamina - 6);
  if (id === 'warm') { player.mood = clamp(player.mood - 1); player.stamina = clamp(player.stamina - 1); }
  if (id === 'hot') { player.mood = clamp(player.mood - 2); player.stamina = clamp(player.stamina - 1); }
  if (id === 'heat') { player.mood = clamp(player.mood - 2); player.stamina = clamp(player.stamina - 2); }
  if (id === 'acid') player.stamina = clamp(player.stamina - 4);
  if (player.stamina < beforeStamina) addLandingEffect(state, effect('stamina', `${WEATHERS[id]?.name ?? id} · 体力 −${beforeStamina - player.stamina}`, 'bad'));
  if (player.mood < beforeMood) addLandingEffect(state, effect('mood', `${WEATHERS[id]?.name ?? id} · 心情 −${beforeMood - player.mood}`, 'bad'));
}

function mealRecovery(node: MapNode, prop: Property | undefined) { return isUtility(node) ? 12 : [0, 12, 20, 30, 42][prop?.level ?? 0]; }

function selectEvent(state: GameState): EventDef | undefined {
  const player = current(state);
  const weighted = getEventWeights(state.config.mapId, status(player, 'luck') ? 'luck' : status(player, 'unluck') ? 'unluck' : undefined);
  if (!weighted.length) return undefined;
  let ticket = next(state) * weighted.reduce((sum, item) => sum + item.weight, 0);
  for (const item of weighted) { ticket -= item.weight; if (ticket < 0) return item.event; }
  return weighted[weighted.length - 1].event;
}

function addTurnEncounter(state: GameState, event: EventDef, player: Player, nodeId: number, choices: Prompt['choices']): TurnEncounter {
  const encounter: TurnEncounter = { id: `event-${++state.sequence}`, playerId: player.id, day: state.day, nodeId,
    eventId: event.id, title: event.title, story: event.story, tone: event.tone, choices: copy(choices) };
  (state.turnEncounters ??= []).push(encounter);
  return encounter;
}

function currentTurnEncounter(state: GameState, event: EventDef, player: Player, nodeId: number): TurnEncounter {
  const prompt = state.pending;
  const encounterId = prompt?.data?.turnEncounterId;
  const match = (state.turnEncounters ?? []).find(entry => entry.id === encounterId && entry.playerId === player.id
    && entry.day === state.day && entry.nodeId === nodeId && entry.eventId === event.id && !entry.selectedChoiceId);
  if (match) return match;
  // Legacy saves may resume inside an event prompt without the new public record.
  return addTurnEncounter(state, event, player, nodeId, prompt?.choices ?? []);
}

function eventChoiceDisabled(state: GameState, event: EventDef, choiceId: string) {
  const choice = event.choices.find(c => c.id === choiceId);
  if (!choice) return true;
  const player = current(state);
  return !!((choice.cash && choice.cash < 0 && player.cash < -choice.cash) || (choice.stamina && choice.stamina < 0 && player.stamina < -choice.stamina)
    || (choice.mood && choice.mood < 0 && player.mood < -choice.mood) || (choice.item && !canAdd(player, choice.item)));
}

function damageableBuildings(state: GameState, player: Player): [string, Property][] {
  return Object.entries(state.properties).filter(([id, property]) => property.ownerId === player.id
    && property.level > 0 && property.level < 4 && !!nodeAt(state, Number(id)) && !isUtility(nodeAt(state, Number(id))!));
}

function eventChoiceScore(state: GameState, event: EventDef | undefined, choiceId: string): number {
  const option = event?.choices.find(choice => choice.id === choiceId);
  if (!option) return 0;
  const player = current(state);
  let score = (option.cash ?? 0) + (option.stamina ?? 0) * 20 + (option.mood ?? 0) * 15 + (option.item ? 300 : 0);
  if (option.confinement) {
    const immunity = option.confinement === 'prison'
      ? player.inventory.find(slot => !slot.wet && (slot.itemId === 'arrest' || slot.itemId === 'shield')) : undefined;
    score -= immunity ? ITEMS[immunity.itemId].price
      : option.confinement === 'prison' ? 3000 : option.confinement === 'parking' ? 1800 : 2200;
  }
  if (option.damageBuilding) {
    const buildings = damageableBuildings(state, player);
    if (buildings.length) score -= buildings.reduce((sum, [id, property]) => {
      const node = nodeAt(state, Number(id))!;
      const price = costOf(node);
      const rentLoss = Math.ceil(price * (RENT_MULTIPLIERS[property.level] - RENT_MULTIPLIERS[property.level - 1]));
      return sum + Math.ceil(price * 0.75) + rentLoss;
    }, 0) / buildings.length;
  }
  return score;
}

function rentNotice(state: GameState, payer: Player, recipient: Player, node: MapNode, paid: number, nominal: number, reason?: string) {
  notice(state, { kind: 'rent', title: paid > 0 ? '租金已支付' : '租金已免除',
    body: paid > 0 ? `${payer.name} 在${node.name}向${recipient.name}支付了 ${paid} PM 租金。`
      : `${payer.name} 在${node.name}本应向${recipient.name}支付 ${nominal} PM 租金；${reason ?? '本次免租'}，实付 0 PM。`,
    tone: 'info', playerId: payer.id, recipientId: recipient.id, nodeId: node.id, amount: paid });
}

function settleRent(state: GameState, payer: Player, recipient: Player, node: MapNode, amount: number, card?: InventorySlot): boolean {
  if (card) {
    if (card.itemId !== 'rent' || card.wet || !payer.inventory.some(slot => slot.uid === card.uid) || !consumeItem(payer, card.uid)) return false;
    log(state, `${payer.name} 使用免租卡免去 ${node.name} 的 ${amount} PM 租金。`, 'good');
    const entry = effect('cash', `免租卡免租 · 省下${amount} PM`, 'good');
    if (state.movement?.playerId === payer.id) addLandingEffect(state, entry);
    else setFeedback(state, payer, entry);
    rentNotice(state, payer, recipient, node, 0, amount, '免租卡抵免');
  } else {
    charge(state, payer, amount); credit(recipient, amount);
    log(state, `${payer.name} 向 ${recipient.name} 支付 ${amount} PM 租金。`, 'bad');
    const entry = effect('cash', `支付租金 −${amount} PM`, 'bad');
    if (state.movement?.playerId === payer.id) addLandingEffect(state, entry);
    else setFeedback(state, payer, entry);
    rentNotice(state, payer, recipient, node, amount, amount);
  }
  return true;
}

function enterNode(state: GameState, skipStation = false, glitchBacktrack = false) {
  if (state.phase === 'gameover') return;
  const player = current(state);
  const node = nodeAt(state, player.position);
  state.pending = null;
  state.phase = 'end';
  if (!node || player.bankrupt) return;
  weatherLand(state, player, node);
  if (checkHealth(state, player, true)) return;
  const data = glitchBacktrack ? { glitchBacktrack: true } : undefined;
  if (isProperty(node)) {
    const prop = state.properties[node.id];
    if (!prop && state.weatherId !== 'paradox') {
      makeChoice(state, simplePrompt('land', node.name, `购买 ${node.name} 需要 ${costOf(node)} PM。`, [
        { id: 'buy', label: `购买 · ${costOf(node)} PM`, disabled: player.cash < costOf(node) }, { id: 'leave', label: '离开' },
      ], { ...data, nodeId: node.id }));
    } else if (prop?.ownerId === player.id && !isUtility(node) && !prop.mortgaged && prop.level < 4 && state.weatherId !== 'paradox' && state.weatherId !== 'acid') {
      const cost = Math.ceil(costOf(node) * 0.75);
      const choices: Prompt['choices'] = [{ id: 'upgrade', label: `升级 · ${cost} PM`, disabled: player.cash < cost }];
      if (prop.level > 0) choices.push({ id: 'meal', label: `用餐 · 100 PM（体力 +${[0, 12, 20, 30, 42][prop.level]}）`, disabled: player.cash < 100 });
      choices.push({ id: 'leave', label: '离开' });
      makeChoice(state, simplePrompt('upgrade', node.name, `升级至 ${prop.level + 1} 级，费用 ${cost} PM；也可用餐。`, choices, { ...data, nodeId: node.id }));
    } else if (prop && prop.ownerId !== player.id) {
      const recipient = state.players.find(p => p.id === prop.ownerId);
      if (!recipient) return;
      const rent = getRent(state, node.id);
      if (rent > 0) {
        if (state.weatherId === 'fog' && next(state) < 0.5) { log(state, `${player.name} 趁浓雾避开 ${node.name} 的租金。`, 'good'); addLandingEffect(state, effect('cash', `浓雾免租 · 省下${rent} PM`, 'good')); rentNotice(state, player, recipient, node, 0, rent, '浓雾掩护'); }
        else {
          const card = player.inventory.find(slot => slot.itemId === 'rent' && !slot.wet);
          if (card) {
            makeChoice(state, simplePrompt('rent', '租金选择', `${player.name} 到达${node.name}，应向${recipient.name}支付 ${rent} PM 租金。`, [
              { id: 'use_card', label: '使用免租卡' }, { id: 'pay', label: `支付 ${rent} PM，保留卡片` },
            ], { ...data, nodeId: node.id, ownerId: recipient.id, amount: rent }));
            return;
          }
          settleRent(state, player, recipient, node, rent);
        }
      } else rentNotice(state, player, recipient, node, 0, 0, getTileRentPreview(state, node.id).reason);
      if (player.bankrupt || checkHealth(state, player, true)) return;
    }
    if (!state.pending && prop && mealRecovery(node, prop) > 0 && player.cash >= 100 && state.weatherId !== 'paradox') {
      makeChoice(state, simplePrompt('meal', node.name, '支付 100 PM 用餐并恢复体力。', [
        { id: 'meal', label: `用餐 · 100 PM（体力 +${mealRecovery(node, prop)}）` }, { id: 'leave', label: '离开' },
      ], { ...data, nodeId: node.id }));
    }
  } else if (node.kind === 'coin') {
    const amount = rand(state, 60, 120); credit(player, amount); log(state, `${player.name} 捡到 ${amount} PM。`, 'good'); addLandingEffect(state, effect('cash', `拾得 +${amount} PM`, 'good'));
  } else if ((node.kind === 'event' || state.encounters.includes(node.id)) && state.weatherId !== 'paradox') {
    if (node.kind !== 'event') state.encounters = state.encounters.filter(id => id !== node.id);
    const event = selectEvent(state);
    if (event) {
      addLandingEffect(state, effect('event', event.title, event.tone === 'bad' ? 'bad' : event.tone === 'good' ? 'good' : 'info'));
      const choices = event.choices.map(c => ({ id: c.id, label: c.label, description: c.description, disabled: eventChoiceDisabled(state, event, c.id) }));
      if (choices.every(c => c.disabled)) choices.push({ id: 'skip_unavailable', label: '资源不足，离开', description: '', disabled: false });
      const encounter = addTurnEncounter(state, event, player, node.id, choices);
      makeChoice(state, simplePrompt('event', event.title, event.story, choices, { ...data, eventId: event.id, turnEncounterId: encounter.id }));
    }
  } else if (node.kind === 'station' && !skipStation && state.weatherId !== 'paradox') {
    const stations = MAPS[state.config.mapId].nodes.filter(n => n.kind === 'station' && n.id !== node.id);
    makeChoice(state, simplePrompt('station', node.name, '乘车前往另一站，票价 100 PM。', [
      ...stations.map(n => ({ id: `station:${n.id}`, label: n.name, disabled: player.cash < 100 })), { id: 'leave', label: '离开' },
    ], { ...data, nodeId: node.id }));
  } else if (node.kind === 'shop' && state.weatherId !== 'paradox') {
    const available = Object.values(ITEMS).filter(i => i.shop && Object.hasOwn(SHOP_ITEM_RARITY, i.id));
    const sample = [...available];
    for (let i = sample.length - 1; i > 0; i--) { const j = rand(state, 0, i); [sample[i], sample[j]] = [sample[j], sample[i]]; }
    const ids = sample.slice(0, 5).map(i => i.id);
    makeChoice(state, shopPrompt(state, ids, data));
  } else if (node.kind === 'casino' && state.weatherId !== 'paradox') {
    makeChoice(state, casinoPrompt(state, data));
  } else if (node.kind === 'exchange' && state.weatherId !== 'paradox') {
    makeChoice(state, simplePrompt('exchange', '证券交易所', '买卖股票需支付 0.3% 手续费。', [{ id: 'leave', label: '离开' }], data));
  }
  if (!state.pending && glitchBacktrack) glitchBacktrackMove(state);
}

function shopPrompt(state: GameState, ids: string[], extra?: Record<string, unknown>): Prompt {
  const player = current(state);
  const prompt = simplePrompt('shop', '道具商店', '每种商品本次进店有购买额度，重新进店刷新。', [],
    { ...extra, itemIds: ids, shopPurchases: extra?.shopPurchases ?? {} });
  prompt.choices = [
    ...ids.map(id => {
      const offer = getShopOffer(prompt, id)!;
      return { id: `buy:${id}`, label: `${ITEMS[id].name} · ${ITEMS[id].price} PM`,
        description: `${ITEMS[id].description} · ${offer.label}，本次剩余 ${offer.remaining}/${offer.limit}`,
        disabled: offer.remaining === 0 || player.cash < ITEMS[id].price || !canAdd(player, id) };
    }),
    { id: 'leave', label: '离开' },
  ];
  return prompt;
}

function casinoPrompt(state: GameState, extra?: Record<string, unknown>, casinoResult?: CasinoResult): Prompt {
  const player = current(state);
  return { ...simplePrompt('casino', '星港赌场', '老虎机投入 300 PM 必得一件道具，背包满时不能投入；轮盘押红或黑 500 PM。', [
    { id: 'slots', label: '老虎机 · 300 PM', description: '必得一件道具；背包满时不能投入。', disabled: player.cash < SLOTS_STAKE || stackSlots(player) >= player.capacity },
    { id: 'red', label: '轮盘押红 · 500 PM', disabled: player.cash < 500 },
    { id: 'black', label: '轮盘押黑 · 500 PM', disabled: player.cash < 500 },
    { id: 'leave', label: '离开' },
  ], extra), ...(casinoResult ? { casinoResult } : {}) };
}

function glitchBacktrackMove(state: GameState, separate = false) {
  const player = current(state);
  const path = separate ? [player.position] : state.movement?.path ?? [player.position];
  const boundary = path.length - 1;
  walk(state, player, 4, true, path);
  const weatherPath = path.slice(boundary);
  const segment = { kind: 'weather' as const, path: weatherPath, label: `错位 · 后退 ${Math.max(0, weatherPath.length - 1)} 格` };
  if (separate || !state.movement) state.movement = { id: ++state.sequence, playerId: player.id, path, roll: 0, modifier: 0,
    dice: false, segments: [segment], effects: [] };
  else { state.movement.path = path; (state.movement.segments ??= []).push(segment); }
  enterNode(state, false, false);
}

function glitchBacktrack(state: GameState, separate: boolean) { if (state.weatherId === 'glitch') glitchBacktrackMove(state, separate); }

function awardJourneyProgress(state: GameState, player: Player, normalPath: number[]): number {
  const previous = Number.isSafeInteger(player.travelProgress) && player.travelProgress >= 0 && player.travelProgress < JOURNEY_REWARD_STEPS
    ? player.travelProgress : 0;
  const normalSteps = Math.max(0, normalPath.length - 1);
  const total = previous + normalSteps;
  const milestones = Math.floor(total / JOURNEY_REWARD_STEPS);
  player.travelProgress = total % JOURNEY_REWARD_STEPS;
  if (!milestones) return 0;
  const amount = milestones * JOURNEY_REWARD_CASH;
  credit(player, amount);
  const lastThresholdStep = milestones * JOURNEY_REWARD_STEPS - previous;
  const achievement = milestones === 1 ? `正常行进满 ${JOURNEY_REWARD_STEPS} 格` : `正常行进累计达成 ${milestones} 次 ${JOURNEY_REWARD_STEPS} 格`;
  notice(state, { kind: 'milestone', title: '行进奖励',
    body: `${player.name} ${achievement}，获得 PM$ ${amount.toLocaleString('zh-CN')}；已累计下一轮 ${player.travelProgress}/${JOURNEY_REWARD_STEPS} 格。`,
    tone: 'good', playerId: player.id, nodeId: normalPath[lastThresholdStep] ?? player.position, amount });
  log(state, `${player.name} 达成 ${milestones} 次 ${JOURNEY_REWARD_STEPS} 格行进里程，获得 ${amount} PM。`, 'good');
  return amount;
}

function doRoll(state: GameState) {
  const player = current(state);
  const face = state.selectedDie;
  const controlled = state.controlledRoll != null;
  const roll = controlled ? state.controlledRoll! : rand(state, 1, face);
  let modifier = state.weatherId === 'hot' ? -1 : state.weatherId === 'heat' ? -2 : state.weatherId === 'scorch' ? -4 : 0;
  const steps = Math.max(0, roll + modifier);
  const path = walk(state, player, steps);
  const normalPath = [...path];
  const journeyReward = awardJourneyProgress(state, player, normalPath);
  const rollStaminaCost = 2 + Math.floor((roll - 1) * 3 / face);
  player.stamina = clamp(player.stamina - rollStaminaCost);
  player.mood = clamp(player.mood - 1);
  weatherActionMood(state, player);
  if (state.weatherId === 'scorch' && !status(player, 'umbrella')) {
    const harm = state.config.weatherMode === 'challenge' ? steps * 3 : Math.min(18, steps * 3);
    player.stamina = clamp(player.stamina - harm); player.mood = clamp(player.mood - harm);
  }
  weatherMove(state, player, path);
  const segments: Movement['segments'] = [{ kind: 'normal', path: normalPath }];
  if (path.length > normalPath.length) {
    const weatherPath = path.slice(normalPath.length - 1);
    const weatherSteps = weatherPath.length - 1;
    const label = state.weatherId === 'glitch' ? `错位 · 前进 ${weatherSteps} 格`
      : ['gale', 'sand', 'sandstorm'].includes(state.weatherId) ? `吹回 · 后退 ${weatherSteps} 格`
        : `打滑 · 前进 ${weatherSteps} 格`;
    segments.push({ kind: 'weather', path: weatherPath, label });
  }
  const effects: GameEffect[] = [effect('stamina', `掷骰 · 基础体力 −${rollStaminaCost}`, 'bad')];
  if (journeyReward > 0) effects.push(effect('cash', `行进奖励 +${journeyReward.toLocaleString('zh-CN')} PM`, 'good'));
  state.movement = { id: ++state.sequence, playerId: player.id, path, roll, modifier, dice: true, controlled, segments, effects };
  state.selectedDie = 6;
  state.controlledRoll = null;
  log(state, `${player.name} ${controlled ? '控骰得到' : '掷出'} ${roll} 点，来到 ${nodeAt(state, player.position)?.name ?? '未知地块'}。`);
  if (!checkHealth(state, player, true)) enterNode(state, false, state.weatherId === 'glitch');
}

function weatherActionMood(state: GameState, player: Player) {
  if (state.weatherId === 'soft') player.mood = clamp(player.mood + rand(state, 1, 8));
  if (state.weatherId === 'fireflies') player.mood = clamp(player.mood + rand(state, 1, 12));
}

function applyEvent(state: GameState, eventId: string, choiceId: string) {
  const event = findEligibleEvent(state.config.mapId, eventId);
  const option = event?.choices.find(c => c.id === choiceId);
  if (!event || !option || eventChoiceDisabled(state, event, choiceId)) return false;
  const player = current(state);
  const beforeCash = player.cash, beforeStamina = player.stamina, beforeMood = player.mood;
  const encounterNodeId = player.position;
  const encounter = currentTurnEncounter(state, event, player, encounterNodeId);
  let damagedBuilding: string | undefined;
  let addedItem = false;
  let statusSummary: string | undefined;
  if (option.cash) { if (option.cash > 0) credit(player, option.cash); else charge(state, player, -option.cash); }
  if (option.stamina) player.stamina = clamp(player.stamina + option.stamina);
  if (option.mood) player.mood = clamp(player.mood + option.mood);
  if (option.item) addedItem = addItem(state, player, option.item);
  if (option.status) {
    const [id, duration] = option.status.split(':');
    const before = player.statuses.find(entry => entry.id === id)?.remaining ?? 0;
    addStatus(player, id, Number(duration) || 3);
    const after = player.statuses.find(entry => entry.id === id)?.remaining ?? 0;
    const label = ({ luck: '幸运', unluck: '霉运', umbrella: '天气防护' } as Record<string, string>)[id] ?? id;
    statusSummary = after > before ? `${label}状态持续${after}日` : `${label}状态未延长`;
  }
  if (option.damageBuilding) {
    const owned = damageableBuildings(state, player);
    if (owned.length) { const [id, property] = owned[rand(state, 0, owned.length - 1)]; property.level--; removeListing(state, Number(id)); damagedBuilding = `${nodeAt(state, Number(id))?.name ?? '建筑'}降至${property.level}级`; }
  }
  if (option.confinement) sendTo(state, player, option.confinement);
  log(state, `${player.name}：${event.title} — ${option.label}`, event.tone === 'bad' ? 'bad' : 'good');
  const effects: GameEffect[] = [effect('event', `${event.title} · ${option.label}`, event.tone === 'bad' ? 'bad' : 'good')];
  if (player.cash !== beforeCash) effects.push(effect('cash', `现金 ${player.cash > beforeCash ? '+' : '−'}${Math.abs(player.cash - beforeCash)} PM`, player.cash > beforeCash ? 'good' : 'bad'));
  if (player.stamina !== beforeStamina) effects.push(effect('stamina', `体力 ${player.stamina > beforeStamina ? '+' : '−'}${Math.abs(player.stamina - beforeStamina)}`, player.stamina > beforeStamina ? 'good' : 'bad'));
  if (player.mood !== beforeMood) effects.push(effect('mood', `心情 ${player.mood > beforeMood ? '+' : '−'}${Math.abs(player.mood - beforeMood)}`, player.mood > beforeMood ? 'good' : 'bad'));
  if (option.damageBuilding) effects.push(effect('building', damagedBuilding ?? '无受损建筑', damagedBuilding ? 'bad' : 'info'));
  setFeedback(state, player, ...effects);
  state.feedback!.nodeId = encounterNodeId;
  const summary = [
    player.cash !== beforeCash ? `现金${player.cash > beforeCash ? '+' : '−'}${Math.abs(player.cash - beforeCash)} PM` : undefined,
    player.stamina !== beforeStamina ? `体力${player.stamina > beforeStamina ? '+' : '−'}${Math.abs(player.stamina - beforeStamina)}` : undefined,
    player.mood !== beforeMood ? `心情${player.mood > beforeMood ? '+' : '−'}${Math.abs(player.mood - beforeMood)}` : undefined,
    option.item ? addedItem ? `获得${ITEMS[option.item]?.name ?? option.item}` : `未获得${ITEMS[option.item]?.name ?? option.item}` : undefined,
    statusSummary,
    option.damageBuilding ? damagedBuilding ?? '无受损建筑' : undefined,
    option.confinement ? player.confinement?.kind === option.confinement
      ? `前往${option.confinement === 'hospital' ? '医院' : option.confinement === 'prison' ? '监狱' : option.confinement === 'sanatorium' ? '疗养院' : '停车区'}` : '禁锢被道具免除' : undefined,
  ].filter(Boolean).join('；') || '本次没有额外数值变化';
  const result = `${player.name}选择“${option.label}”：${summary}。`;
  encounter.selectedChoiceId = choiceId;
  encounter.result = result;
  notice(state, { kind: 'event', title: event.title, body: result,
    tone: event.tone === 'choice' ? 'info' : event.tone, playerId: player.id, nodeId: encounterNodeId,
    ...(player.cash !== beforeCash ? { amount: player.cash - beforeCash } : {}) });
  if (option.confinement) { if (!player.confinement) finishDecision(state); return true; }
  finishDecision(state);
  checkHealth(state, player);
  return true;
}

function doChoice(state: GameState, choiceId?: string) {
  const prompt = state.pending;
  const player = current(state);
  const choice = prompt?.choices.find(c => c.id === choiceId);
  if (!prompt || !choice || choice.disabled) return false;
  const nodeId = Number(prompt.data?.nodeId);
  const node = nodeAt(state, nodeId);
  if (prompt.kind === 'debt') {
    const resumeGlitch = prompt.data?.resumeGlitchBacktrack === true;
    if (choiceId === 'bankrupt') { declareBankruptcy(state, player); if (state.phase !== 'gameover') { state.pending = null; state.phase = 'end'; endTurn(state); } return true; }
    if (choiceId?.startsWith('mortgage:')) {
      if (!manageAsset(state, { type: 'mortgage', nodeId: Number(choiceId.slice(9)) })) return false;
    } else if (choiceId?.startsWith('pawn:')) {
      if (!manageItemPawn(state, { type: 'pawnItem', itemUid: choiceId.slice(5) })) return false;
    } else if (choiceId?.startsWith('sellstock:')) {
      const stockId = choiceId.slice(10); const stock = state.stocks.find(s => s.id === stockId);
      const count = stock ? player.holdings[stockId] ?? 0 : 0;
      if (!stock || count <= 0) return false;
      const sale = sellStock(player, stock, count);
      if (!sale) return false;
      log(state, `${player.name} 卖出 ${count} 股 ${stock.name} 偿还债务。`);
      setFeedback(state, player, effect('cash', `卖股偿债 +${sale.total} PM`, 'good'));
    } else return false;
    enforceDebt(state);
    if (resumeGlitch && state.pending?.kind !== 'debt' && state.phase !== 'gameover') glitchBacktrack(state, true);
    return true;
  }
  if (prompt.kind === 'event') {
    const event = findEligibleEvent(state.config.mapId, String(prompt.data?.eventId ?? ''));
    if (!event) return false;
    if ((choiceId === 'skip_unavailable' || choiceId === 'skip') && !event.choices.some(entry => entry.id === choiceId)) {
      const encounter = currentTurnEncounter(state, event, player, player.position);
      encounter.selectedChoiceId = choiceId;
      encounter.result = `${player.name}因资源不足离开，本次没有发生额外变化。`;
      finishDecision(state);
      return true;
    }
    return applyEvent(state, event.id, choiceId!);
  }
  if (prompt.kind === 'rent') {
    if (choiceId !== 'use_card' && choiceId !== 'pay') return false;
    const rentNode = nodeAt(state, player.position);
    const property = rentNode && state.properties[rentNode.id];
    const owner = property && state.players.find(entry => entry.id === property.ownerId);
    const amount = rentNode ? getRent(state, rentNode.id) : 0;
    if (!rentNode || !isProperty(rentNode) || !property || !owner || owner.id === player.id
      || prompt.data?.nodeId !== rentNode.id || prompt.data?.ownerId !== owner.id
      || prompt.data?.amount !== amount || amount <= 0) return false;
    const card = choiceId === 'use_card' ? player.inventory.find(slot => slot.itemId === 'rent' && !slot.wet) : undefined;
    if (choiceId === 'use_card' && !card) return false;
    if (!settleRent(state, player, owner, rentNode, amount, card)) return false;
    if (player.cash < 0) {
      makeChoice(state, debtPrompt(state, 'end', prompt.data?.glitchBacktrack === true));
      return true;
    }
    if (mealRecovery(rentNode, property) > 0 && player.cash >= 100 && state.weatherId !== 'paradox') {
      makeChoice(state, simplePrompt('meal', rentNode.name, '支付 100 PM 用餐并恢复体力。', [
        { id: 'meal', label: `用餐 · 100 PM（体力 +${mealRecovery(rentNode, property)}）` }, { id: 'leave', label: '离开' },
      ], { nodeId: rentNode.id, ...(prompt.data?.glitchBacktrack === true ? { glitchBacktrack: true } : {}) }));
    } else finishDecision(state);
    return true;
  }
  if (choiceId === 'leave') { finishDecision(state); return true; }
  if (prompt.kind === 'land' && choiceId === 'buy' && node && !state.properties[nodeId] && state.weatherId !== 'paradox' && player.cash >= costOf(node)) {
    charge(state, player, costOf(node)); state.properties[nodeId] = { ownerId: player.id, level: 0, mortgaged: false };
    log(state, `${player.name} 购买 ${node.name}。`, 'good'); setFeedback(state, player, effect('building', `购入${node.name}`, 'good'), effect('cash', `−${costOf(node)} PM`, 'bad')); finishDecision(state); return true;
  }
  if (prompt.kind === 'upgrade' && choiceId === 'upgrade' && node && state.weatherId !== 'paradox' && state.weatherId !== 'acid') {
    const prop = state.properties[nodeId]; const cost = Math.ceil(costOf(node) * 0.75);
    if (!prop || prop.ownerId !== player.id || prop.mortgaged || prop.level >= 4 || player.cash < cost || isUtility(node)) return false;
    charge(state, player, cost); prop.level++; removeListing(state, node.id); log(state, `${player.name} 将 ${node.name} 升至 ${prop.level} 级。`, 'good');
    setFeedback(state, player, effect('building', `${node.name}升至${prop.level}级`, 'good'), effect('cash', `−${cost} PM`, 'bad')); finishDecision(state); return true;
  }
  if ((prompt.kind === 'meal' || prompt.kind === 'upgrade') && choiceId === 'meal' && node && player.cash >= 100 && state.weatherId !== 'paradox') {
    const prop = state.properties[nodeId]; if (!prop || mealRecovery(node, prop) <= 0) return false;
    const before = player.stamina; charge(state, player, 100); player.stamina = clamp(player.stamina + mealRecovery(node, prop));
    setFeedback(state, player, effect('cash', '用餐 −100 PM', 'bad'), effect('stamina', `体力 +${player.stamina - before}`, 'good')); finishDecision(state); return true;
  }
  if (prompt.kind === 'station' && choiceId?.startsWith('station:') && player.cash >= 100 && state.weatherId !== 'paradox') {
    const destination = Number(choiceId.slice(8)); const to = nodeAt(state, destination);
    if (nodeAt(state, player.position)?.kind !== 'station' || prompt.data?.nodeId !== player.position
      || !to || to.kind !== 'station' || to.id === player.position) return false;
    charge(state, player, 100); const from = player.position; player.previousPosition = null; player.routeNextPosition = null; player.position = to.id;
    state.movement = { id: ++state.sequence, playerId: player.id, path: [from, to.id], roll: 0, modifier: 0, dice: false,
      segments: [{ kind: 'transfer', path: [from, to.id], label: `乘车抵达${to.name}` }], effects: [] };
    log(state, `${player.name} 乘车抵达 ${to.name}。`); finishDecision(state, true); return true;
  }
  if (prompt.kind === 'shop' && choiceId?.startsWith('buy:') && state.weatherId !== 'paradox') {
    const itemId = choiceId.slice(4); const def = ITEMS[itemId];
    const offer = getShopOffer(prompt, itemId);
    if (!def || !offer || offer.remaining <= 0 || player.cash < def.price || !canAdd(player, itemId)) return false;
    if (!addItem(state, player, itemId)) return false;
    charge(state, player, def.price);
    log(state, `${player.name} 购买 ${def.name}。`, 'good');
    setFeedback(state, player, effect('event', `获得${def.name}`, 'good'), effect('cash', `−${def.price} PM`, 'bad'));
    state.pending = shopPrompt(state, prompt.data!.itemIds as string[],
      { ...prompt.data, shopPurchases: { ...(prompt.data?.shopPurchases as Record<string, number> | undefined), [itemId]: offer.purchased + 1 } });
    return true;
  }
  if (prompt.kind === 'casino' && state.weatherId !== 'paradox') {
    const extra = prompt.data;
    if (choiceId === 'slots' && player.cash >= SLOTS_STAKE && stackSlots(player) < player.capacity) {
      const itemId = drawSlotItem(rand(state, 0, SLOT_POOL_TOTAL - 1));
      if (!addItem(state, player, itemId)) return false;
      charge(state, player, SLOTS_STAKE);
      const result: CasinoResult = { id: ++state.sequence, game: 'slots', outcome: 'item',
        title: '老虎机 · 道具奖励', detail: `投入 ${SLOTS_STAKE} PM，获得${ITEMS[itemId].name}；道具已放入背包。`,
        stake: SLOTS_STAKE, payout: 0, net: -SLOTS_STAKE, itemId };
      log(state, `${player.name} ${result.title}：${result.detail}`, 'good');
      setFeedback(state, player, effect('event', `获得${ITEMS[itemId].name}`, 'good'), effect('cash', `−${SLOTS_STAKE} PM`, 'bad'));
      state.pending = casinoPrompt(state, { ...extra, played: true }, result); return true;
    }
    if ((choiceId === 'red' || choiceId === 'black') && player.cash >= 500) {
      charge(state, player, 500);
      const won = next(state) < 0.46;
      const payout = won ? 1000 : 0;
      if (won) credit(player, payout);
      const bet = choiceId;
      const betName = bet === 'red' ? '红' : '黑';
      const result: CasinoResult = { id: ++state.sequence, game: 'roulette', outcome: won ? 'win' : 'lose',
        title: `轮盘 · 押${betName}${won ? '获胜' : '未中奖'}`,
        detail: `押${betName}下注 500 PM，返还 ${payout.toLocaleString('zh-CN')} PM，${won ? '净得 500 PM' : '净支出 500 PM'}。`,
        stake: 500, payout, net: payout - 500, bet };
      log(state, `${player.name} ${result.title}：${result.detail}`, won ? 'good' : 'bad');
      setFeedback(state, player, effect('event', result.title, won ? 'good' : 'bad'), effect('cash', `${won ? '+' : '−'}500 PM`, won ? 'good' : 'bad'));
      state.pending = casinoPrompt(state, { ...extra, played: true }, result); return true;
    }
  }
  if (prompt.kind === 'trade' && (choiceId === 'accept' || choiceId === 'reject')) {
    const seller = state.players.find(p => p.id === prompt.data?.sellerId);
    const buyer = state.players.find(p => p.id === prompt.data?.buyerId);
    const tradeNode = Number(prompt.data?.nodeId); const price = Number(prompt.data?.price);
    if (!seller || !buyer || state.properties[tradeNode]?.ownerId !== seller.id || state.properties[tradeNode]?.mortgaged
      || !Number.isSafeInteger(price) || price <= 0 || price > MAX_PROPERTY_PRICE) return false;
    if (!tradingEnabled(state) && choiceId === 'accept') return false;
    if (choiceId === 'accept' && buyer.cash >= price && Number.isSafeInteger(seller.cash + price)) { buyer.cash -= price; seller.cash += price; state.properties[tradeNode].ownerId = buyer.id; removeListing(state, tradeNode); log(state, `${buyer.name} 以 ${price} PM 购入 ${nodeAt(state, tradeNode)?.name}。`, 'good');
      notice(state, { kind: 'trade', title: '地产交易成交', body: `${buyer.name} 向 ${seller.name} 支付 ${price.toLocaleString('zh-CN')} PM，购入 ${nodeAt(state, tradeNode)?.name}；产权已转移。`,
        tone: 'info', playerId: buyer.id, recipientId: seller.id, nodeId: tradeNode, amount: price });
      setFeedback(state, buyer, effect('building', `购入${nodeAt(state, tradeNode)?.name}`, 'good'), effect('cash', `−${price} PM`, 'bad')); }
    else { log(state, `${buyer.name} 拒绝了交易。`); setFeedback(state, buyer, effect('event', '产权交易未达成', 'info')); }
    finishDecision(state); return true;
  }
  return false;
}

function doUseItem(state: GameState, action: GameAction) {
  const player = current(state);
  const slot = player.inventory.find(s => s.uid === action.itemUid);
  if (!slot || !canUseItem(state, player.id, slot.uid)) return false;
  const id = slot.itemId;
  if (id === 'controller' && (!Number.isSafeInteger(action.diceValue) || action.diceValue! < 1 || action.diceValue! > 6)) return false;
  const target = state.players.find(p => p.id === action.targetId);
  const node = action.nodeId == null ? undefined : nodeAt(state, action.nodeId);
  const enemy = target && !target.bankrupt && target.id !== player.id;
  if (['bomb', 'unluck', 'tax'].includes(id) && !enemy) return false;
  if (['demolish', 'acquire', 'repair'].includes(id) && (!node || !isProperty(node))) return false;
  if (['teleport'].includes(id) && node?.kind !== 'station') return false;
  if (id === 'weather' && (!action.weatherId || !Object.prototype.hasOwnProperty.call(WEATHERS, action.weatherId) || (WEATHERS[action.weatherId].family === 'disaster' && state.day < 22))) return false;
  if (id === 'demolish') {
    const prop = node && state.properties[node.id];
    if (!prop || prop.ownerId === player.id || prop.level < 1 || prop.level >= 4 || isUtility(node!)) return false;
  }
  if (id === 'acquire') {
    const prop = node && state.properties[node.id];
    const owner = prop && state.players.find(p => p.id === prop.ownerId);
    const cost = node && prop ? Math.ceil(assetValue(state, node.id, prop) * 1.5) : 0;
    if (!prop || !owner || owner.id === player.id || prop.mortgaged || prop.level >= 4 || cost <= 0 || player.cash < cost) return false;
  }
  const threatened = ['demolish', 'acquire'].includes(id)
    ? state.players.find(p => p.id === (node && state.properties[node.id]?.ownerId))
    : ['bomb', 'unluck', 'tax'].includes(id) ? target : undefined;
  if (threatened && threatened.id !== player.id) {
    const defense = threatened.inventory.find(s => s.itemId === 'shield' && !s.wet);
    if (defense) {
      consumeItem(threatened, defense.uid);
      consumeItem(player, slot.uid);
      log(state, `${threatened.name} 使用星盾卡挡下 ${ITEMS[id].name}。`, 'good');
      setFeedback(state, threatened, effect('event', `星盾挡下${ITEMS[id].name}`, 'good'));
      return true;
    }
  }
  if (id === 'acquire') {
    const prop = node && state.properties[node.id]; const owner = prop && state.players.find(p => p.id === prop.ownerId);
    const price = node && prop ? Math.ceil(assetValue(state, node.id, prop) * 1.5) : 0;
    if (!prop || !owner || owner.id === player.id || player.cash < price || price <= 0 || prop.level >= 4) return false;
    player.cash -= price; owner.cash += price; prop.ownerId = player.id; removeListing(state, node!.id);
  } else if (id === 'demolish') {
    const prop = node && state.properties[node.id];
    if (!prop || prop.ownerId === player.id || prop.level < 1 || prop.level >= 4 || isUtility(node!)) return false;
    prop.level--; removeListing(state, node!.id);
  } else if (id === 'repair') {
    const prop = node && state.properties[node.id];
    if (!prop || prop.ownerId !== player.id || prop.mortgaged || prop.level >= 4 || isUtility(node!) || state.weatherId === 'acid') return false;
    prop.level++; removeListing(state, node!.id);
  } else if (id === 'bomb') {
    sendTo(state, target!, 'hospital'); target!.stamina = clamp(target!.stamina - 30);
    if (next(state) < 0.1) sendTo(state, player, 'prison');
  } else if (id === 'unluck') addStatus(target!, 'unluck', 3);
  else if (id === 'tax') charge(state, target!, 1800);
  else if (id === 'luck') addStatus(player, 'luck', 3);
  else if (id === 'umbrella') addStatus(player, 'umbrella', 3);
  else if (id === 'dry') for (const item of player.inventory) item.wet = false;
  else if (id === 'bag') player.capacity += 4;
  else if (id === 'snack') player.stamina = clamp(player.stamina + 20);
  else if (id === 'feast') player.stamina = clamp(player.stamina + 40);
  else if (id === 'tea') player.mood = clamp(player.mood + 20);
  else if (id === 'coffee') { player.stamina = clamp(player.stamina + 12); player.mood = clamp(player.mood + 8); }
  else if (id === 'restkit') { player.stamina = clamp(player.stamina + 25); player.mood = clamp(player.mood + 25); }
  else if (id === 'lottery') credit(player, rand(state, 100, 5000));
  else if (id === 'weather') addStatus(player, `weather:${action.weatherId!}`, 1);
  else if (id === 'teleport') { const from = player.position; player.previousPosition = null; player.routeNextPosition = null; player.position = node!.id;
    state.movement = { id: ++state.sequence, playerId: player.id, path: [from, node!.id], roll: 0, modifier: 0, dice: false,
      segments: [{ kind: 'transfer', path: [from, node!.id], label: `传送到${node!.name}` }], effects: [] }; state.phase = 'end'; }
  else if (/^dice(8|12|20|100)$/.test(id)) state.selectedDie = Number(id.slice(4));
  else if (id === 'controller') state.controlledRoll = action.diceValue!;
  else if (id === 'rent' || id === 'shield' || id === 'arrest') return false; // Rent is chosen on landing; defense cards react to attacks or arrest.
  else return false;
  consumeItem(player, slot.uid);
  log(state, `${player.name} 使用 ${ITEMS[id].name}${id === 'controller' ? `，指定普通骰 ${action.diceValue} 点` : ''}。`, 'good');
  setFeedback(state, player, effect('event', id === 'controller' ? `控骰指定 ${action.diceValue} 点` : `使用${ITEMS[id].name}`, 'good'));
  return true;
}

function manageAsset(state: GameState, action: GameAction) {
  const player = current(state); const node = action.nodeId == null ? undefined : nodeAt(state, action.nodeId);
  const prop = node && state.properties[node.id];
  if (!node || !prop || prop.ownerId !== player.id) return false;
  if (action.type === 'mortgage' && !prop.mortgaged) { const amount = Math.floor(assetValue(state, node.id, prop) * 0.5); prop.mortgaged = true; removeListing(state, node.id); credit(player, amount);
    log(state, `${player.name} 抵押 ${node.name}。`); setFeedback(state, player, effect('building', `抵押${node.name}`, 'info'), effect('cash', `+${amount} PM`, 'good')); return true; }
  if (action.type === 'redeem' && prop.mortgaged) { const cost = Math.ceil(assetValue(state, node.id, prop) * 0.6); if (player.cash < cost) return false; player.cash -= cost; prop.mortgaged = false; removeListing(state, node.id);
    log(state, `${player.name} 赎回 ${node.name}。`); setFeedback(state, player, effect('building', `赎回${node.name}`, 'good'), effect('cash', `−${cost} PM`, 'bad')); return true; }
  if (action.type === 'sellAsset' && prop.level < 4 && !prop.mortgaged) { const amount = Math.floor(assetValue(state, node.id, prop) * 0.7); credit(player, amount); delete state.properties[node.id]; removeListing(state, node.id);
    log(state, `${player.name} 将 ${node.name} 卖给银行。`); setFeedback(state, player, effect('building', `售出${node.name}`, 'info'), effect('cash', `+${amount} PM`, 'good')); return true; }
  return false;
}

function manageItemPawn(state: GameState, action: GameAction) {
  const player = current(state);
  if (!action.itemUid) return false;
  if (action.type === 'pawnItem') {
    const slot = player.inventory.find(s => s.uid === action.itemUid);
    if (!slot || !ITEMS[slot.itemId]) return false;
    const principal = pawnValue(slot.itemId);
    const pawnedSlot: InventorySlot = { ...slot, uid: `${++state.sequence}`, quantity: 1 };
    consumeItem(player, slot.uid);
    player.pawnedItems.push({ slot: pawnedSlot, principal });
    credit(player, principal);
    log(state, `${player.name} 抵押 ${ITEMS[pawnedSlot.itemId].name}，获得 ${principal} PM。`);
    setFeedback(state, player, effect('event', `抵押${ITEMS[pawnedSlot.itemId].name}`, 'info'), effect('cash', `+${principal} PM`, 'good'));
    return true;
  }
  if (action.type === 'redeemItem') {
    const pawned = player.pawnedItems.find(p => p.slot.uid === action.itemUid);
    if (!pawned) return false;
    const cost = Math.ceil(pawned.principal * 1.2);
    if (player.cash < cost || !canAdd(player, pawned.slot.itemId)) return false;
    player.cash -= cost;
    const item = ITEMS[pawned.slot.itemId];
    const original = item.stackable && inventoryItem(player, item.id);
    if (original) original.quantity++;
    else player.inventory.push(pawned.slot);
    player.pawnedItems = player.pawnedItems.filter(p => p.slot.uid !== action.itemUid);
    log(state, `${player.name} 赎回 ${item.name}，支付 ${cost} PM。`);
    setFeedback(state, player, effect('event', `赎回${item.name}`, 'good'), effect('cash', `−${cost} PM`, 'bad'));
    return true;
  }
  return false;
}

function stockTrade(state: GameState, action: GameAction) {
  const player = current(state); const stock = state.stocks.find(s => s.id === action.stockId);
  const qty = action.quantity;
  if (state.pending?.kind !== 'exchange' || state.weatherId === 'paradox' || nodeAt(state, player.position)?.kind !== 'exchange' || !stock || !Number.isSafeInteger(qty) || !qty || Math.abs(qty) > 1_000_000) return false;
  const quote = quoteStockTrade(stock.price, qty);
  if (qty > 0) { if (player.cash < quote.total) return false; buyStock(player, stock, qty, quote.total); }
  else if (!sellStock(player, stock, -qty)) return false;
  state.pending!.data = { ...state.pending!.data, traded: true };
  log(state, `${player.name} ${qty > 0 ? '买入' : '卖出'} ${Math.abs(qty)} 股 ${stock.name}。`);
  setFeedback(state, player, effect('event', `${qty > 0 ? '买入' : '卖出'}${Math.abs(qty)}股${stock.name}`, 'info'),
    effect('cash', `${qty > 0 ? '−' : '+'}${quote.total} PM · 手续费${quote.fee}`, qty > 0 ? 'bad' : 'good'));
  return true;
}

function propertyMarketAction(state: GameState, action: GameAction, actor: Player): boolean {
  if (!tradingEnabled(state) || !['ready', 'end'].includes(state.phase) || state.pending || state.seasonReport || actor.bankrupt) return false;
  if (action.type === 'listProperty') {
    const node = action.nodeId == null ? undefined : nodeAt(state, action.nodeId);
    const property = node && state.properties[node.id];
    const price = action.price;
    if (!node || !isProperty(node) || !property || property.ownerId !== actor.id || property.mortgaged
      || !Number.isSafeInteger(price) || price! < 1 || price! > MAX_PROPERTY_PRICE
      || (state.propertyListings ?? []).some(listing => listing.nodeId === node.id)) return false;
    const listing: PropertyListing = { id: `listing-${++state.sequence}`, nodeId: node.id, sellerId: actor.id, price: price!, listedDay: state.day };
    (state.propertyListings ??= []).push(listing);
    log(state, `${actor.name} 将 ${node.name} 以 ${price} PM 挂牌拍卖行。`);
    setFeedback(state, actor, effect('building', `${node.name}已挂牌`, 'info'));
    state.feedback!.nodeId = node.id;
    return true;
  }
  const listing = (state.propertyListings ?? []).find(entry => entry.id === action.listingId);
  if (!listing) return false;
  const node = nodeAt(state, listing.nodeId);
  const property = node && state.properties[node.id];
  const seller = state.players.find(player => player.id === listing.sellerId);
  if (!node || !isProperty(node) || !property || property.ownerId !== listing.sellerId || property.mortgaged
    || !seller || seller.bankrupt || !Number.isSafeInteger(listing.price) || listing.price < 1 || listing.price > MAX_PROPERTY_PRICE) return false;
  if (action.type === 'cancelListing') {
    if (actor.id !== seller.id) return false;
    removeListing(state, node.id);
    log(state, `${seller.name} 将 ${node.name} 从拍卖行下架。`);
    setFeedback(state, seller, effect('building', `${node.name}已下架`, 'info'));
    state.feedback!.nodeId = node.id;
    return true;
  }
  if (action.type === 'buyListing') {
    if (actor.id === seller.id || actor.cash < listing.price || !Number.isSafeInteger(actor.cash - listing.price)
      || !Number.isSafeInteger(seller.cash + listing.price)) return false;
    actor.cash -= listing.price;
    seller.cash += listing.price;
    property.ownerId = actor.id;
    removeListing(state, node.id);
    const amount = listing.price.toLocaleString('zh-CN');
    log(state, `${actor.name} 从拍卖行以 ${amount} PM 购买 ${seller.name} 的 ${node.name}，产权已转移。`, 'good');
    notice(state, { kind: 'trade', title: '拍卖成交', body: `${actor.name} 向 ${seller.name} 支付 ${amount} PM，购入 ${node.name}；产权已转移。`,
      tone: 'info', playerId: actor.id, recipientId: seller.id, nodeId: node.id, amount: listing.price });
    setFeedback(state, actor, effect('building', `购入${node.name}`, 'good'), effect('cash', `−${amount} PM`, 'bad'));
    state.feedback!.nodeId = node.id;
    return true;
  }
  return false;
}

function offerTrade(state: GameState, action: GameAction) {
  const seller = current(state); const buyer = state.players.find(p => p.id === action.targetId); const node = action.nodeId == null ? undefined : nodeAt(state, action.nodeId);
  const prop = node && state.properties[node.id]; const price = action.price;
  if (!tradingEnabled(state) || state.seasonReport || state.phase !== 'ready' && state.phase !== 'end' || !buyer || buyer.id === seller.id || buyer.bankrupt || !node || !prop || prop.ownerId !== seller.id || prop.mortgaged || !Number.isSafeInteger(price) || price! <= 0 || price! > MAX_PROPERTY_PRICE || buyer.cash < price!) return false;
  if (buyer.ai) {
    const multiplier = buyer.personality === 'cautious' ? 1.05 : buyer.personality === 'aggressive' ? 1.6 : 1.3;
    if (price! <= assetValue(state, node.id, prop) * multiplier && Number.isSafeInteger(seller.cash + price!)) { buyer.cash -= price!; seller.cash += price!; prop.ownerId = buyer.id; removeListing(state, node.id); log(state, `${buyer.name} 接受交易，以 ${price} PM 买入 ${node.name}。`, 'good');
      notice(state, { kind: 'trade', title: '地产交易成交', body: `${buyer.name} 向 ${seller.name} 支付 ${price!.toLocaleString('zh-CN')} PM，购入 ${node.name}；产权已转移。`,
        tone: 'info', playerId: buyer.id, recipientId: seller.id, nodeId: node.id, amount: price! });
      setFeedback(state, seller, effect('building', `出售${node.name}`, 'good'), effect('cash', `+${price} PM`, 'good')); }
    else { log(state, `${buyer.name} 拒绝了交易。`); setFeedback(state, seller, effect('event', '交易报价被拒绝', 'info')); }
    return true;
  }
  makeChoice(state, simplePrompt('trade', '产权交易', `${seller.name} 向 ${buyer.name} 出售 ${node.name}，价格 ${price} PM。请 ${buyer.name} 决定。`,
    [{ id: 'accept', label: '接受' }, { id: 'reject', label: '拒绝' }], { sellerId: seller.id, buyerId: buyer.id, nodeId: node.id, price, resumePhase: state.phase }));
  return true;
}

function bestControlledRoll(state: GameState): number | null {
  const player = current(state);
  const prospects = Array.from({ length: 6 }, (_, index) => {
    const value = index + 1;
    const probe = copy(state);
    probe.controlledRoll = value;
    const rolled = act(probe, { type: 'roll' });
    const landed = rolled.players[rolled.currentPlayerIndex];
    const node = nodeAt(rolled, landed.position);
    const property = node && rolled.properties[node.id];
    let score = landed.cash - player.cash + (landed.stamina - player.stamina) * 25 + (landed.mood - player.mood) * 15;
    if (node && isProperty(node) && !property && landed.cash >= costOf(node)) score += Math.min(4000, costOf(node) * 0.35);
    if (node && property?.ownerId !== player.id) score -= getRent(rolled, node.id);
    return { value, score };
  });
  const best = prospects.reduce((winner, option) => option.score > winner.score ? option : winner);
  const average = prospects.reduce((sum, option) => sum + option.score, 0) / prospects.length;
  return best.score - average >= (player.personality === 'aggressive' ? 900 : 1400) ? best.value : null;
}

export function act(state: GameState, action: GameAction, actorId?: string): GameState {
  if (action.type === 'listProperty' || action.type === 'cancelListing' || action.type === 'buyListing') {
    const actor = state.players.find(player => player.id === (actorId ?? current(state)?.id));
    if (!actor || state.phase === 'gameover') return state;
    const draft = copy(state);
    draft.feedback = null;
    const draftActor = draft.players.find(player => player.id === actor.id)!;
    if (!propertyMarketAction(draft, action, draftActor)) return state;
    pruneListings(draft);
    return draft;
  }
  if (actorId !== undefined && actorId !== current(state)?.id) return state;
  if (state.phase === 'gameover' && action.type !== 'dismissSeason') return state;
  if (action.type === 'dismissSeason') { if (!state.seasonReport) return state; const draft = copy(state); draft.seasonReport = null; draft.feedback = null; draft.movement = null; return draft; }
  const player = current(state);
  if (!player || player.bankrupt) return state;
  const draft = copy(state);
  draft.feedback = null;
  draft.movement = null;
  let valid = false;
  if (action.type === 'roll' && draft.phase === 'ready' && !current(draft).confinement
    && (draft.controlledRoll == null || draft.selectedDie === 6 && Number.isSafeInteger(draft.controlledRoll) && draft.controlledRoll >= 1 && draft.controlledRoll <= 6)) { doRoll(draft); valid = true; }
  else if (action.type === 'rest' && draft.phase === 'ready' && !current(draft).confinement) {
    const beforeStamina = current(draft).stamina, beforeMood = current(draft).mood;
    current(draft).stamina = clamp(current(draft).stamina + 6); current(draft).mood = clamp(current(draft).mood + 18);
    draft.controlledRoll = null;
    weatherActionMood(draft, current(draft));
    draft.phase = 'end'; log(draft, `${current(draft).name} 原地休息。`);
    setFeedback(draft, current(draft), effect('stamina', `休息 · 体力 +${current(draft).stamina - beforeStamina}`, 'good'),
      effect('mood', `心情 +${current(draft).mood - beforeMood}`, 'good')); valid = true;
  } else if (action.type === 'endTurn' && (draft.phase === 'end' || draft.phase === 'ready')) { endTurn(draft); valid = true; }
  else if (action.type === 'choose' && draft.phase === 'decision') valid = doChoice(draft, action.choiceId);
  else if (action.type === 'useItem' && draft.phase === 'ready') valid = doUseItem(draft, action);
  else if (action.type === 'discardItem' && (draft.phase === 'ready' || draft.phase === 'end')) {
    const discarded = current(draft).inventory.find(slot => slot.uid === action.itemUid);
    valid = !!action.itemUid && consumeItem(current(draft), action.itemUid);
    if (valid && discarded) setFeedback(draft, current(draft), effect('event', `丢弃${ITEMS[discarded.itemId]?.name ?? discarded.itemId}`, 'info'));
  } else if (action.type === 'stockTrade') valid = stockTrade(draft, action);
  else if (action.type === 'offerTrade') valid = offerTrade(draft, action);
  else if ((action.type === 'pawnItem' || action.type === 'redeemItem') && (draft.phase === 'ready' || draft.phase === 'end')) valid = manageItemPawn(draft, action);
  else if (['mortgage', 'redeem', 'sellAsset'].includes(action.type) && (draft.phase === 'ready' || draft.phase === 'end')) valid = manageAsset(draft, action);
  if (valid) { pruneListings(draft); enforceDebt(draft); }
  return valid ? draft : state;
}

export function runAI(state: GameState): GameState {
  const player = current(state);
  if (!player?.ai || state.phase === 'gameover') return state;
  if (state.phase === 'decision') {
    const prompt = state.pending;
    if (!prompt) return state;
    if (prompt.kind === 'exchange') {
      const reserve = player.personality === 'cautious' ? 40_000 : player.personality === 'aggressive' ? 12_000 : 25_000;
      if (prompt.data?.traded) return act(state, { type: 'choose', choiceId: 'leave' });
      const held = state.stocks.find(s => (player.holdings[s.id] ?? 0) > 0);
      if (held && (player.cash < reserve || held.change < (player.personality === 'cautious' ? -3 : -5))) {
        return act(state, { type: 'stockTrade', stockId: held.id, quantity: -(player.holdings[held.id] ?? 0) });
      }
      const stock = state.stocks.reduce((best, s) => s.change > best.change ? s : best, state.stocks[0]);
      if (stock && !Object.values(player.holdings).some(n => n > 0) && player.cash > reserve + quoteStockTrade(stock.price, 5).total) {
        return act(state, { type: 'stockTrade', stockId: stock.id, quantity: 5 });
      }
      return act(state, { type: 'choose', choiceId: 'leave' });
    }
    const available = prompt.choices.filter(c => !c.disabled);
    let choice = available.find(c => c.id === 'leave')?.id ?? available[0]?.id;
    if (prompt.kind === 'rent') {
      const amount = Number(prompt.data?.amount);
      const hasCard = player.inventory.some(slot => slot.itemId === 'rent' && !slot.wet);
      choice = hasCard && (amount >= ITEMS.rent.price || player.cash - amount < 500) ? 'use_card' : 'pay';
    } else if (prompt.kind === 'land' || prompt.kind === 'upgrade') {
      const reserve = player.personality === 'cautious' ? 30_000 : player.personality === 'aggressive' ? 7_000 : 17_000;
      const action = available.find(c => c.id === 'buy' || c.id === 'upgrade');
      if (action && player.cash > reserve + (Number(nodeAt(state, Number(prompt.data?.nodeId))?.price) || 0)) choice = action.id;
    } else if (prompt.kind === 'event') choice = available.reduce((best, item) => {
      const event = findEligibleEvent(state.config.mapId, String(prompt.data?.eventId ?? ''));
      return eventChoiceScore(state, event, item.id) > eventChoiceScore(state, event, best.id) ? item : best;
    }, available[0]).id;
    else if (prompt.kind === 'trade') choice = 'reject';
    else if (prompt.kind === 'debt') choice = available.find(c => c.id.startsWith('sellstock:'))?.id
      ?? available.find(c => c.id.startsWith('pawn:'))?.id
      ?? available.find(c => c.id.startsWith('mortgage:'))?.id ?? 'bankrupt';
    else if (prompt.kind === 'upgrade' && player.stamina < 40) choice = available.find(c => c.id === 'meal')?.id ?? choice;
    else if (prompt.kind === 'meal' && player.stamina < 60) choice = 'meal';
    else if (prompt.kind === 'station' && player.cash > 10_000) choice = available.find(c => c.id.startsWith('station:'))?.id ?? choice;
    else if (prompt.kind === 'casino' && player.personality === 'aggressive' && !prompt.data?.played && player.cash > 15_000) choice = available.find(c => c.id === 'red')?.id ?? choice;
    else if (prompt.kind === 'shop' && player.cash > 20_000 && player.inventory.length < player.capacity) {
      const preferred = available.find(c => c.id.startsWith('buy:') && ['snack', 'restkit', 'dice8'].includes(c.id.slice(4)) && !player.inventory.some(i => i.itemId === c.id.slice(4)));
      if (preferred) choice = preferred.id;
    }
    if (!choice) return state;
    return act(state, { type: 'choose', choiceId: choice });
  }
  if (state.phase === 'end') return act(state, { type: 'endTurn' });
  if (tradingEnabled(state) && state.phase === 'ready' && !state.pending && !state.seasonReport) {
    const reserve = player.personality === 'cautious' ? 40_000 : player.personality === 'balanced' ? 25_000 : 12_000;
    const willing = player.personality === 'cautious' ? 0.95 : player.personality === 'balanced' ? 1.1 : 1.3;
    const boughtToday = (state.notices ?? []).some(entry => entry.kind === 'trade' && entry.playerId === player.id && entry.day === state.day);
    if (!boughtToday) {
      const worthBuying = (state.propertyListings ?? []).filter(listing => {
        const property = state.properties[listing.nodeId];
        return listing.sellerId !== player.id && property?.ownerId === listing.sellerId && !property.mortgaged
          && listing.price <= assetValue(state, listing.nodeId, property) * willing && player.cash - listing.price >= reserve;
      }).sort((a, b) => a.price / assetValue(state, a.nodeId, state.properties[a.nodeId])
        - b.price / assetValue(state, b.nodeId, state.properties[b.nodeId]));
      if (worthBuying.length) return act(state, { type: 'buyListing', listingId: worthBuying[0].id });
    }
    const lowCash = player.personality === 'cautious' ? 18_000 : player.personality === 'balanced' ? 12_000 : 7_000;
    const alreadyListed = (state.propertyListings ?? []).some(listing => listing.sellerId === player.id && listing.listedDay === state.day);
    const soldToday = (state.notices ?? []).some(entry => entry.kind === 'trade' && entry.recipientId === player.id && entry.day === state.day);
    if (player.cash < lowCash && !alreadyListed && !soldToday) {
      const candidates = Object.entries(state.properties).filter(([id, property]) => property.ownerId === player.id && !property.mortgaged
        && property.level < 4 && !(state.propertyListings ?? []).some(listing => listing.nodeId === Number(id)))
        .sort(([a, first], [b, second]) => assetValue(state, Number(a), first) - assetValue(state, Number(b), second));
      const [id, property] = candidates[0] ?? [];
      if (id && property) {
        const ask = player.personality === 'cautious' ? 1.25 : player.personality === 'balanced' ? 1.15 : 1.08;
        const price = Math.min(MAX_PROPERTY_PRICE, Math.max(1, Math.ceil(assetValue(state, Number(id), property) * ask)));
        return act(state, { type: 'listProperty', nodeId: Number(id), price });
      }
    }
  }
  if (player.stamina < 25 || player.mood < 25) {
    const wanted = player.stamina < 25 && player.mood < 25 ? ['restkit', 'coffee', 'feast', 'snack', 'tea']
      : player.stamina < 25 ? ['feast', 'snack', 'restkit', 'coffee'] : ['tea', 'restkit', 'coffee'];
    const usable = wanted.map(id => player.inventory.find(s => s.itemId === id && canUseItem(state, player.id, s.uid))).find(Boolean);
    if (usable) return act(state, { type: 'useItem', itemUid: usable.uid });
    return act(state, { type: 'rest' });
  }
  if (state.controlledRoll != null) return act(state, { type: 'roll' });
  const controller = player.inventory.find(slot => slot.itemId === 'controller' && canUseItem(state, player.id, slot.uid));
  if (controller) {
    const diceValue = bestControlledRoll(state);
    if (diceValue !== null) return act(state, { type: 'useItem', itemUid: controller.uid, diceValue });
  }
  const die = player.inventory.find(s => s.itemId === 'dice8' && canUseItem(state, player.id, s.uid));
  if (die && state.selectedDie === 6 && player.personality === 'aggressive') return act(state, { type: 'useItem', itemUid: die.uid });
  return act(state, { type: 'roll' });
}
