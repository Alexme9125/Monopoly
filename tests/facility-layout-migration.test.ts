import { describe, expect, it } from 'vitest';
import { act, createGame, getRent } from '../src/game/engine';
import { FACILITY_LAYOUT_SWAPS, relocateFacilityNode } from '../src/game/facilityLayout';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import type { GameConfig, GameState, MapId } from '../src/game/types';

const config = (mapId: MapId): GameConfig => ({ mapId, mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 421,
  players: [
    { name: '甲', color: '#ff0000', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '乙', color: '#0000ff', shape: 'diamond', ai: true, personality: 'cautious' },
  ] });
const legacy = (mapId: MapId): GameState => {
  const state = createGame(config(mapId));
  delete state.mapLayoutVersion;
  state.encounters = [];
  return state;
};
const restore = (state: GameState) => parseSave(JSON.stringify(state));

describe('facility layout save migration', () => {
  it('marks new games as layout 2 and preserves old content at every swapped node', () => {
    for (const mapId of ['lake', 'coast', 'valley'] as const) {
      expect(createGame(config(mapId)).mapLayoutVersion).toBe(2);
      for (const [from, to] of FACILITY_LAYOUT_SWAPS[mapId] ?? []) {
        const old = legacy(mapId);
        old.players[0].position = from;
        old.players[0].previousPosition = MAPS[mapId].nodes[from].neighbors[0];
        old.players[0].routeNextPosition = MAPS[mapId].nodes[from].neighbors.at(-1);
        old.players[1].position = to;
        const imported = restore(old);
        expect(imported.mapLayoutVersion).toBe(2);
        expect(imported.players[0].position).toBe(to);
        expect(imported.players[1].position).toBe(from);
        expect(relocateFacilityNode(mapId, to)).toBe(from);
        expect(imported.players[0].previousPosition === null
          || MAPS[mapId].nodes[to].neighbors.includes(imported.players[0].previousPosition)).toBe(true);
        expect(imported.players[0].routeNextPosition === null
          || MAPS[mapId].nodes[to].neighbors.includes(imported.players[0].routeNextPosition!)).toBe(true);
        expect(restore(imported)).toEqual(imported);
      }
    }
    for (const mapId of ['sundered', 'forest', 'starSands'] as const) {
      const old = legacy(mapId);
      expect(restore(old)).toMatchObject({ mapLayoutVersion: 2, players: old.players });
    }
  });

  it('moves utilities, ownership, listings, notifications, and one-use encounters together', () => {
    const old = legacy('lake');
    const from = 7;
    const to = relocateFacilityNode('lake', from);
    expect(MAPS.lake.nodes[to]).toMatchObject({ kind: 'water', price: 800 });
    old.properties[from] = { ownerId: 'p1', level: 0, mortgaged: false };
    old.propertyListings = [{ id: 'listing-10', nodeId: from, sellerId: 'p1', price: 1400, listedDay: 1 }];
    old.sequence = 20;
    old.notices = [{ id: 11, day: 1, kind: 'trade', title: '历史', body: '旧交易', tone: 'info', playerId: 'p1', nodeId: from, amount: 1400 }];
    old.encounters = [16]; // The old empty tile travels to node 2.
    const imported = restore(old);
    expect(imported.properties[to]).toEqual(old.properties[from]);
    expect(imported.properties[from]).toBeUndefined();
    expect(imported.propertyListings?.[0]).toMatchObject({ id: 'listing-10', nodeId: to, price: 1400 });
    expect(imported.notices?.[0].nodeId).toBe(to);
    expect(imported.encounters).toEqual([2]);
    expect(restore(imported)).toEqual(imported);
  });

  it('resumes an old utility purchase and updates its price and location in the prompt', () => {
    const old = legacy('lake');
    old.players[0].position = 7;
    old.phase = 'decision';
    old.pending = { kind: 'land', title: '旧净水厂', body: '旧地价',
      choices: [{ id: 'buy', label: '购买旧址' }, { id: 'leave', label: '离开' }], data: { nodeId: 7, glitchBacktrack: false } };
    const imported = restore(old);
    const destination = relocateFacilityNode('lake', 7);
    expect(imported.players[0].position).toBe(destination);
    expect(imported.pending).toMatchObject({ title: MAPS.lake.nodes[destination].name,
      body: `购买 ${MAPS.lake.nodes[destination].name} 需要 800 PM。`, data: { nodeId: destination } });
    const bought = act(imported, { type: 'choose', choiceId: 'buy' });
    expect(bought.properties[destination].ownerId).toBe('p1');
    expect(bought.players[0].cash).toBe(imported.players[0].cash - 800);
    expect(bought.players[0].travelProgress).toBe(0);
  });

  it('requotes old utility rent, resolves it at the new site, and does not lose debt choices', () => {
    const old = legacy('lake');
    old.players[0].position = 7;
    old.properties[7] = { ownerId: 'p2', level: 0, mortgaged: false };
    old.phase = 'decision';
    old.pending = { kind: 'rent', title: '旧租金', body: '旧地点',
      choices: [{ id: 'use_card', label: '免租' }, { id: 'pay', label: '付款' }],
      data: { nodeId: 7, ownerId: 'p2', amount: 1, glitchBacktrack: false } };
    const imported = restore(old);
    const destination = relocateFacilityNode('lake', 7);
    const rent = getRent(imported, destination);
    expect(imported.pending).toMatchObject({ kind: 'rent', data: { nodeId: destination, amount: rent } });
    const paid = act(imported, { type: 'choose', choiceId: 'pay' });
    expect(paid.players[0].cash).toBe(imported.players[0].cash - rent);
    expect(paid.players[1].cash).toBe(imported.players[1].cash + rent);

    const indebted = legacy('lake');
    indebted.players[0].cash = -100;
    indebted.properties[7] = { ownerId: 'p1', level: 0, mortgaged: false };
    indebted.phase = 'decision';
    indebted.pending = { kind: 'debt', title: '资金不足', body: '欠款 100 PM',
      choices: [{ id: 'mortgage:7', label: '旧址抵押' }, { id: 'bankrupt', label: '破产' }], data: { resumePhase: 'end' } };
    const resumed = restore(indebted);
    expect(resumed.pending?.choices[0]).toMatchObject({ id: `mortgage:${destination}`,
      label: `抵押 ${MAPS.lake.nodes[destination].name} · +400 PM` });
    const mortgaged = act(resumed, { type: 'choose', choiceId: `mortgage:${destination}` });
    expect(mortgaged.properties[destination].mortgaged).toBe(true);
    expect(mortgaged.players[0].cash).toBe(300);
  });

  it('retains a public event and its pending choice at the relocated event tile', () => {
    const old = legacy('lake');
    const eventNode = 68;
    const destination = relocateFacilityNode('lake', eventNode);
    expect(MAPS.lake.nodes[destination].kind).toBe('event');
    old.players[0].position = eventNode;
    old.sequence = 20;
    old.phase = 'decision';
    old.pending = { kind: 'event', title: '旧遇见', body: '继续选择',
      choices: [{ id: 'auction_skip', label: '暂不参与' }],
      data: { eventId: 'auction', turnEncounterId: 'event-10', nodeId: eventNode } };
    old.turnEncounters = [{ id: 'event-10', playerId: 'p1', day: 1, nodeId: eventNode, eventId: 'auction',
      title: '拍卖消息', story: '旧故事', tone: 'choice', choices: [{ id: 'auction_skip', label: '暂不参与' }] }];
    const imported = restore(old);
    expect(imported.turnEncounters?.[0].nodeId).toBe(destination);
    expect(imported.pending?.data?.nodeId).toBe(destination);
    const settled = act(imported, { type: 'choose', choiceId: 'auction_skip' });
    expect(settled.turnEncounters?.[0].selectedChoiceId).toBe('auction_skip');
    expect(settled.notices?.at(-1)?.nodeId).toBe(destination);
  });

  it('rejects a forged old roadside property, malformed layout version, and invalid old route', () => {
    const property = legacy('lake');
    property.properties[62] = { ownerId: 'p1', level: 0, mortgaged: false }; // 62 was empty, though it is now water.
    expect(() => restore(property)).toThrow('旧布局产权位置无效');
    const version = legacy('lake');
    (version as unknown as { mapLayoutVersion: number }).mapLayoutVersion = 3;
    expect(() => restore(version)).toThrow('地图布局版本无效');
    (version as unknown as { mapLayoutVersion: null }).mapLayoutVersion = null;
    expect(() => restore(version)).toThrow('地图布局版本无效');
    const route = legacy('lake');
    route.players[0].position = 7;
    route.players[0].routeNextPosition = 79;
    expect(() => restore(route)).toThrow('旧布局行进方向无效');
  });
});
