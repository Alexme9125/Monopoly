import { describe, expect, it } from 'vitest';
import { act, createGame, getRent, getTileRentPreview } from '../src/game/engine';
import { BASE_STARTING_CASH, getPropertyRentMultipliers, getStartingCash, PROPERTY_RENT_MULTIPLIERS, RENT_BASE_MULTIPLIERS, RENT_LEVEL_NAMES, RENT_LEVELS, RENT_MOOD_LOSS } from '../src/game/economy';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import type { GameConfig, GameState, RentLevel } from '../src/game/types';

const config: GameConfig = { mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 1978,
  players: [
    { name: '甲', color: '#ff0000', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '乙', color: '#0000ff', shape: 'diamond', ai: true, personality: 'cautious' },
  ] };

const expected = {
  relaxed: [0.24, 0.54, 1.05, 1.95, 3.6],
  standard: [0.4, 0.9, 1.75, 3.25, 6],
  heavy: [0.8, 1.8, 3.5, 6.5, 12],
} as const;

function game(level?: RentLevel): GameState {
  const state = createGame({ ...config, ...(level ? { rentLevel: level } : {}) });
  state.weatherId = 'clear';
  return state;
}

function rentLanding(level: RentLevel): GameState {
  const state = game(level);
  state.selectedDie = 1;
  state.players[0].position = 4;
  state.players[0].previousPosition = 3;
  state.properties[5] = { ownerId: 'p2', level: 2, mortgaged: false };
  return state;
}

describe('ordinary property rent levels', () => {
  it('applies map-specific starting cash to every player and season length', () => {
    const players = [
      config.players[0],
      config.players[1],
      { ...config.players[1], name: '丙', color: '#00ff00' },
      { ...config.players[1], name: '丁', color: '#ff00ff' },
    ];
    expect(BASE_STARTING_CASH).toBe(100_000);
    expect(getStartingCash({ mapId: 'forest' })).toBe(BASE_STARTING_CASH);
    for (const mapId of Object.keys(MAPS) as (keyof typeof MAPS)[]) {
      for (const rentLevel of RENT_LEVELS) {
        const cash = mapId === 'grandCity' ? 150_000 : mapId === 'forest' && rentLevel === 'heavy' ? 200_000 : BASE_STARTING_CASH;
        expect(getStartingCash({ mapId, rentLevel })).toBe(cash);
        for (const seasons of [0, 4, 8, 16]) {
          const state = createGame({ ...config, mapId, rentLevel, seasons, players });
          expect(state.players.map(player => player.cash)).toEqual([cash, cash, cash, cash]);
        }
      }
    }
  });

  it('preserves earned or spent cash when loading current and legacy saves', () => {
    const current = createGame({ ...config, mapId: 'forest', rentLevel: 'heavy' });
    current.players[0].cash = 12_345;
    current.players[1].cash = 67_890;
    expect(parseSave(JSON.stringify(current)).players.map(player => player.cash)).toEqual([12_345, 67_890]);

    const legacy = structuredClone(current);
    delete legacy.config.rentLevel;
    legacy.players[0].cash = 4_321;
    legacy.players[1].cash = 98_765;
    const restored = parseSave(JSON.stringify(legacy));
    expect(restored.config.rentLevel).toBe('standard');
    expect(restored.players.map(player => player.cash)).toEqual([4_321, 98_765]);
  });

  it('quotes all five building levels from the original rent, including prospective purchases', () => {
    const price = MAPS.lake.nodes[5].price!;
    expect(PROPERTY_RENT_MULTIPLIERS).toEqual(expected.standard);
    expect(RENT_LEVELS).toEqual(['relaxed', 'standard', 'heavy']);
    expect(RENT_LEVEL_NAMES).toEqual({ relaxed: '轻松', standard: '标准', heavy: '沉重' });
    expect(RENT_BASE_MULTIPLIERS).toEqual({ relaxed: 3, standard: 5, heavy: 10 });
    expect(getPropertyRentMultipliers()).toEqual(expected.standard);
    for (const level of RENT_LEVELS) {
      const state = game(level);
      expect(getPropertyRentMultipliers(level)).toEqual(expected[level]);
      expect(getTileRentPreview(state, 5).rent).toBe(Math.ceil(price * expected[level][0]));
      state.properties[5] = { ownerId: 'p2', level: 0, mortgaged: false };
      for (const [building, multiplier] of expected[level].entries()) {
        state.properties[5].level = building;
        expect(getRent(state, 5)).toBe(Math.ceil(price * multiplier));
        expect(getTileRentPreview(state, 5).rent).toBe(getRent(state, 5));
      }
    }
  });

  it('leaves the power, water and telecom formulas unchanged at every rent level', () => {
    const utilities = (['power', 'water', 'telecom'] as const).map(kind => MAPS.lake.nodes.find(node => node.kind === kind)!);
    expect(utilities).toHaveLength(3);
    for (const level of RENT_LEVELS) {
      const state = game(level);
      expect(getTileRentPreview(state, utilities[0].id, 'p2').rent).toBe(150);
      for (const [index, node] of utilities.entries()) {
        state.properties[node.id] = { ownerId: 'p2', level: 0, mortgaged: false };
        expect(getRent(state, node.id)).toBe(Math.min(37_500, 150 * 3 ** index));
      }
    }
  });

  it('uses the selected amount for the landing prompt, payment, notice and mood', () => {
    for (const level of RENT_LEVELS) {
      const before = rentLanding(level);
      const rent = getRent(before, 5);
      const asked = act(before, { type: 'roll' });
      expect(asked.pending).toMatchObject({ kind: 'rent', data: { nodeId: 5, ownerId: 'p2', amount: rent } });
      const paid = act(asked, { type: 'choose', choiceId: 'pay' });
      expect(paid.players[0].cash).toBe(asked.players[0].cash - rent);
      expect(paid.players[1].cash).toBe(asked.players[1].cash + rent);
      expect(paid.players[0].mood).toBe(asked.players[0].mood - RENT_MOOD_LOSS);
      expect(paid.notices?.at(-1)).toMatchObject({ kind: 'rent', playerId: 'p1', recipientId: 'p2', nodeId: 5, amount: rent });

      const waived = act(asked, { type: 'choose', choiceId: 'use_card' });
      expect(waived.players[0].cash).toBe(asked.players[0].cash);
      expect(waived.players[1].cash).toBe(asked.players[1].cash);
      expect(waived.players[0].mood).toBe(asked.players[0].mood);
      expect(waived.notices?.at(-1)).toMatchObject({ kind: 'rent', amount: 0 });
    }
  });

  it('collects automatically without a rent card at every level', () => {
    for (const level of RENT_LEVELS) {
      const before = rentLanding(level);
      before.players[0].inventory = before.players[0].inventory.filter(slot => slot.itemId !== 'rent');
      const amount = getRent(before, 5);
      const settled = act(before, { type: 'roll' });
      expect(settled.players[0].position).toBe(5);
      expect(settled.pending?.kind).not.toBe('rent');
      expect(settled.players[0].cash).toBe(before.players[0].cash - amount);
      expect(settled.players[1].cash).toBe(before.players[1].cash + amount);
      expect(settled.notices?.filter(notice => notice.kind === 'rent')).toHaveLength(1);
      expect(settled.notices?.at(-1)).toMatchObject({ kind: 'rent', playerId: 'p1', recipientId: 'p2', nodeId: 5, amount });
    }
  });

  it('opens debt resolution after automatic heavy rent on a costly forest landmark', () => {
    const landmark = MAPS.forest.nodes[29];
    expect(landmark).toMatchObject({ kind: 'land', price: 16_000 });
    const before = createGame({ ...config, mapId: 'forest', rentLevel: 'heavy' });
    before.players[0].cash = 100_000; // A match already spent its larger starting balance.
    before.weatherId = 'clear';
    before.selectedDie = 1;
    before.players[0].position = 28;
    before.players[0].previousPosition = 27;
    before.players[0].inventory = before.players[0].inventory.filter(slot => slot.itemId !== 'rent');
    before.properties[29] = { ownerId: 'p2', level: 4, mortgaged: false };
    const amount = getRent(before, 29);
    expect(amount).toBe(192_000);
    const indebted = act(before, { type: 'roll' });
    expect(indebted.players[0].position).toBe(29);
    expect(indebted.players[0].cash).toBe(before.players[0].cash - amount);
    expect(indebted.players[1].cash).toBe(before.players[1].cash + amount);
    expect(indebted.notices?.at(-1)).toMatchObject({ kind: 'rent', nodeId: 29, amount });
    expect(indebted.pending?.kind).toBe('debt');
    expect(indebted.pending?.choices.some(choice => choice.id === 'bankrupt')).toBe(true);
    const resolved = act(indebted, { type: 'choose', choiceId: 'bankrupt' });
    expect(resolved.players[0].bankrupt).toBe(true);
    expect(resolved.players[0].cash).toBe(0);
    expect(resolved.phase).toBe('gameover');
    expect(resolved.winnerId).toBe('p2');
  });

  it('preserves weather, confinement and mortgage rent suspension', () => {
    const state = rentLanding('heavy');
    expect(getRent(state, 5)).toBeGreaterThan(0);
    state.weatherId = 'paradox';
    expect(getRent(state, 5)).toBe(0);
    state.weatherId = 'clear';
    state.players[1].confinement = { kind: 'prison', remaining: 1 };
    expect(getRent(state, 5)).toBe(0);
    state.players[1].confinement = null;
    state.properties[5].mortgaged = true;
    expect(getRent(state, 5)).toBe(0);
  });

  it('normalizes old saves and rejects invalid or null rent settings', () => {
    expect(game().config.rentLevel).toBe('standard');
    for (const level of RENT_LEVELS) expect(parseSave(JSON.stringify(game(level))).config.rentLevel).toBe(level);
    const old = game();
    delete old.config.rentLevel;
    const restored = parseSave(JSON.stringify(old));
    expect(restored.config.rentLevel).toBe('standard');
    for (const invalid of ['other', null, 3, false, [], {}, ['heavy'], { level: 'heavy' }]) {
      expect(() => createGame({ ...config, rentLevel: invalid as RentLevel })).toThrow('rent level');
      expect(() => parseSave(JSON.stringify({ ...old, config: { ...old.config, rentLevel: invalid } }))).toThrow('游戏设置');
    }
  });

  it('reprices saved pending rent under its selected level before payment', () => {
    for (const level of RENT_LEVELS) {
      const state = rentLanding(level);
      state.selectedDie = 6;
      state.players[0].position = 5;
      state.phase = 'decision';
      state.pending = { kind: 'rent', title: '旧租金', body: '旧账单',
        choices: [{ id: 'use_card', label: '使用免租卡' }, { id: 'pay', label: '支付旧账单' }],
        data: { nodeId: 5, ownerId: 'p2', amount: 1 } };
      const restored = parseSave(JSON.stringify(state));
      const amount = getRent(restored, 5);
      expect(restored.pending?.data?.amount).toBe(amount);
      expect(restored.pending?.choices.find(choice => choice.id === 'pay')?.label).toContain(String(amount));
      const paid = act(restored, { type: 'choose', choiceId: 'pay' });
      expect(paid.players[0].cash).toBe(state.players[0].cash - amount);
      expect(paid.players[1].cash).toBe(state.players[1].cash + amount);
    }
  });
});
