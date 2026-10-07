// Generate importable, real-action encounter saves for browser acceptance.
// Run: node --import tsx scripts/roaming-browser-fixtures.ts
// The pre-roll board placement/ownership below are explicit QA preconditions;
// every pending event is produced by createGame -> act(roll), never fabricated.
import { mkdirSync, writeFileSync } from 'node:fs';
import { act, createGame } from '../src/game/engine.ts';
import { findEligibleEvent } from '../src/game/eventPool.ts';
import { MAPS } from '../src/game/maps.ts';
import { parseSave } from '../src/game/storage.ts';
import type { GameConfig, GameState, MapNode, PlayerConfig } from '../src/game/types.ts';

const output = new URL('../artifacts/roaming-encounters/', import.meta.url);
mkdirSync(output, { recursive: true });
const map = MAPS.lake;
const players: PlayerConfig[] = [
  { name: '验收玩家', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' },
  { name: '产权对手', color: '#277DA8', shape: 'diamond', ai: true, personality: 'cautious' },
];
const MAX_SEED = 40_000;

type Fixture = { id: string; seed: number; eventId: string; eventTitle: string; optionId: string;
  nodeId: number; nodeName: string; nodeKind: string; expected: string; setup: string; file: string;
  continuation: unknown; state: GameState };
const fixtures: Fixture[] = [];

function initial(seed: number): GameState {
  const config: GameConfig = { mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed, players };
  return createGame(config);
}

function placeBefore(state: GameState, target: MapNode) {
  const approach = map.nodes[target.neighbors[0]];
  state.players[0].position = approach.id;
  state.players[0].previousPosition = approach.neighbors.find(id => id !== target.id) ?? null;
  state.players[0].routeNextPosition = target.id;
}

function chosenEvent(state: GameState) {
  if (state.pending?.kind !== 'event' || state.pending.data?.eventSource !== 'encounter') return null;
  const event = findEligibleEvent('lake', String(state.pending.data.eventId), 'encounter');
  return event?.encounterOnly ? event : null;
}

function availableOptions(state: GameState) {
  const event = chosenEvent(state);
  return event?.choices.filter(option => !option.confinement && !option.damageBuilding
    && state.pending?.choices.some(choice => choice.id === option.id && !choice.disabled)) ?? [];
}

function save(id: string, seed: number, state: GameState, optionId: string, expected: string, setup: string) {
  const valid = parseSave(JSON.stringify(state));
  if (valid.pending?.kind !== 'event' || valid.pending.data?.eventSource !== 'encounter') throw new Error(`${id}: invalid event save`);
  const event = chosenEvent(state)!;
  const node = map.nodes[state.players[0].position];
  const file = `${id}.json`;
  const fixture: Fixture = { id, seed, eventId: event.id, eventTitle: event.title, optionId,
    nodeId: node.id, nodeName: node.name, nodeKind: node.kind, expected, setup, file,
    continuation: state.pending?.data?.continuation, state };
  writeFileSync(new URL(file, output), JSON.stringify(state, null, 2));
  fixtures.push(fixture);
  console.log(`${id}: seed=${seed} node=${node.id}/${node.kind} event=${event.id} choice=${optionId}`);
}

const tileCases = [
  { id: 'land-buy', kind: 'land', next: 'land', setup: '无主普通地产，事件后可整栋认购。' },
  { id: 'land-own-upgrade', kind: 'land', next: 'upgrade', setup: '当前玩家持有 1 层普通地产，事件后可升级或用餐。' },
  { id: 'rent-meal', kind: 'land', next: 'rent', setup: '对手持有 1 层地产；先选择付租或免租，付租后可用餐。' },
  { id: 'shop', kind: 'shop', next: 'shop', setup: '事件后开启随机五件的商店货架。' },
  { id: 'exchange', kind: 'exchange', next: 'exchange', setup: '事件后开启证券交易所。' },
  { id: 'casino', kind: 'casino', next: 'casino', setup: '事件后开启赌场。' },
  { id: 'station', kind: 'station', next: 'station', setup: '事件后可选择乘车或免费离开。' },
  { id: 'coin', kind: 'coin', next: null, setup: '事件后领取路上零钱，不能重复领取。' },
] as const;

for (const scenario of tileCases) {
  let found = false;
  for (let seed = 1; seed <= MAX_SEED && !found; seed++) {
    const state = initial(seed);
    if (state.weatherId !== 'clear') continue;
    for (const target of map.nodes.filter(node => node.kind === scenario.kind && state.encounters.includes(node.id))) {
      const prepared = structuredClone(state);
      placeBefore(prepared, target);
      if (scenario.id === 'land-own-upgrade') prepared.properties[target.id] = { ownerId: prepared.players[0].id, level: 1, mortgaged: false };
      if (scenario.id === 'rent-meal') prepared.properties[target.id] = { ownerId: prepared.players[1].id, level: 1, mortgaged: false };
      const landed = act(prepared, { type: 'roll' });
      if (landed.movement?.roll !== 1 || landed.players[0].position !== target.id || !chosenEvent(landed)) continue;
      for (const option of availableOptions(landed)) {
        const after = act(landed, { type: 'choose', choiceId: option.id });
        if (after.players[0].position !== target.id
          || (scenario.next === null ? after.pending !== null : after.pending?.kind !== scenario.next)) continue;
        if (scenario.id === 'rent-meal' && act(after, { type: 'choose', choiceId: 'pay' }).pending?.kind !== 'meal') continue;
        if (scenario.id === 'coin' && !after.feedback?.effects.some(entry => entry.label.startsWith('拾得 +'))) continue;
        save(scenario.id, seed, landed, option.id, scenario.next ?? '事件后拾得零钱并结束落点', scenario.setup);
        found = true;
        break;
      }
      if (found) break;
    }
  }
  if (!found) throw new Error(`Could not generate ${scenario.id} in ${MAX_SEED} seeds`);
}

// A public-room case with no fixture setup at all: same seed in two real PVP clients.
{
  let found = false;
  const pvpPlayers = players.map(player => ({ ...player, ai: false }));
  for (let seed = 1; seed <= MAX_SEED && !found; seed++) {
    const state = createGame({ mapId: 'lake', mode: 'pvp', seasons: 4, weatherMode: 'standard', seed, players: pvpPlayers });
    const landed = act(state, { type: 'roll' });
    if (!chosenEvent(landed) || map.nodes[landed.players[0].position].kind !== 'land') continue;
    for (const option of availableOptions(landed)) {
      if (act(landed, { type: 'choose', choiceId: option.id }).pending?.kind !== 'land') continue;
      save('pvp-natural-first-roll', seed, landed, option.id, '首掷自然临时偶遇 → 无主土地认购；双端公开卡同步',
        '不修改任何初始状态：两名真人创建湖图 PVP 房间，使用该 seed，房主直接掷骰。');
      found = true;
      break;
    }
  }
  if (!found) throw new Error('Could not generate pvp-natural-first-roll');
}

// An encounter choice itself lowers mood to zero; its original shop never opens.
{
  let found = false;
  for (let seed = 1; seed <= MAX_SEED && !found; seed++) {
    const base = initial(seed);
    if (base.weatherId !== 'clear') continue;
    for (const target of map.nodes.filter(node => node.kind === 'shop' && base.encounters.includes(node.id))) {
      const probe = structuredClone(base);
      placeBefore(probe, target);
      const first = act(probe, { type: 'roll' });
      const event = chosenEvent(first);
      if (first.movement?.roll !== 1 || !event) continue;
      for (const option of event.choices.filter(choice => (choice.mood ?? 0) < 0 && !choice.confinement)) {
        const prepared = structuredClone(base);
        placeBefore(prepared, target);
        prepared.players[0].mood = 1 - option.mood!;
        const landed = act(prepared, { type: 'roll' });
        if (landed.pending?.data?.eventId !== event.id || !landed.pending.choices.some(choice => choice.id === option.id && !choice.disabled)) continue;
        const after = act(landed, { type: 'choose', choiceId: option.id });
        if (after.players[0].confinement?.kind !== 'sanatorium' || after.pending !== null) continue;
        save('shop-health-cancel', seed, landed, option.id, '心情归零送疗养院；原商店不再开启',
          `掷骰前心情 ${prepared.players[0].mood}，事件选项使心情归零。`);
        found = true;
        break;
      }
      if (found) break;
    }
  }
  if (!found) throw new Error('Could not generate shop-health-cancel');
}

// A real roll reaches a station, then a legal paid transfer reaches a marked destination station.
{
  let found = false;
  const stations = map.nodes.filter(node => node.kind === 'station');
  for (let seed = 1; seed <= MAX_SEED && !found; seed++) {
    const base = initial(seed);
    if (base.weatherId !== 'clear') continue;
    for (const destination of stations.filter(node => base.encounters.includes(node.id))) {
      for (const origin of stations.filter(node => node.id !== destination.id && !base.encounters.includes(node.id))) {
        const prepared = structuredClone(base);
        placeBefore(prepared, origin);
        const atOrigin = act(prepared, { type: 'roll' });
        if (atOrigin.movement?.roll !== 1 || atOrigin.pending?.kind !== 'station') continue;
        const arrived = act(atOrigin, { type: 'choose', choiceId: `station:${destination.id}` });
        if (arrived.players[0].position !== destination.id || !chosenEvent(arrived)
          || arrived.pending?.data?.continuation == null) continue;
        const safe = availableOptions(arrived).find(option => act(arrived, { type: 'choose', choiceId: option.id }).pending?.kind !== 'station');
        if (!safe) continue;
        save('station-destination', seed, arrived, safe.id, '目的站偶遇后结束，不再次出现乘车选择',
          `真实掷骰先抵达车站 ${origin.id}，支付 100 PM 前往已有临时标记的车站 ${destination.id}。`);
        found = true;
        break;
      }
      if (found) break;
    }
  }
  if (!found) throw new Error('Could not generate station-destination');
}

// The first glitch landing is a marked land; after its choice and land decision,
// weather backtracking lands on another marked property and draws the second encounter.
{
  let found = false;
  for (let seed = 1; seed <= MAX_SEED && !found; seed++) {
    const state = initial(seed);
    state.day = 22;
    state.weatherId = 'glitch';
    state.weatherHistory = ['glitch'];
    state.encounters = [5, 1];
    state.players[0].position = 2;
    state.players[0].previousPosition = 1;
    state.players[0].routeNextPosition = 3;
    const first = act(state, { type: 'roll' });
    if (first.movement?.roll !== 1 || first.players[0].position !== 5 || !chosenEvent(first)) continue;
    for (const option of availableOptions(first)) {
      const onLand = act(first, { type: 'choose', choiceId: option.id });
      if (onLand.pending?.kind !== 'land') continue;
      const second = act(onLand, { type: 'choose', choiceId: 'leave' });
      if (second.players[0].position !== 1 || second.pending?.data?.eventSource !== 'encounter'
        || second.turnEncounters?.length !== 2) continue;
      save('glitch-double', seed, first, option.id, '先结算 5 号土地，再故障后退至 1 号触发第二次偶遇',
        'QA 前置：第 22 天故障天气，位置 2→3，标记节点 5 和 1；以真实掷骰进入首偶遇。');
      found = true;
      break;
    }
  }
  if (!found) throw new Error('Could not generate glitch-double');
}

writeFileSync(new URL('browser-fixtures.json', output), JSON.stringify({
  description: '每个 state 都由真实 act 动作生成；file 指向可单独导入的纯 GameState JSON。optionId 是推荐事件选择。',
  cases: fixtures,
}, null, 2));
console.log(`Generated ${fixtures.length} importable encounter fixtures.`);
