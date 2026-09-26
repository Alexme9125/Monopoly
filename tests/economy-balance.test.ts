import { describe, expect, it } from 'vitest';
import { act, createGame, getRent, getTileRentPreview } from '../src/game/engine';
import { HOSTILE_ITEM_MOOD_LOSS, PROPERTY_RENT_MULTIPLIERS, RENT_MOOD_LOSS, ROADSIDE_CASH_MAX, ROADSIDE_CASH_MIN, UTILITY_RENT_BASE, UTILITY_RENT_CAP } from '../src/game/economy';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import type { GameState } from '../src/game/types';

const game = () => createGame({ mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 1978,
  players: [
    { name: '甲', color: '#ff0000', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '乙', color: '#0000ff', shape: 'diamond', ai: true, personality: 'cautious' },
  ] });

function rentDecision(level = 1): GameState {
  const state = game();
  state.weatherId = 'clear';
  state.players[0].position = 5;
  state.properties[5] = { ownerId: 'p2', level, mortgaged: false };
  const amount = getRent(state, 5);
  state.phase = 'decision';
  state.pending = { kind: 'rent', title: '租金选择', body: '旧账单',
    choices: [{ id: 'use_card', label: '使用免租卡' }, { id: 'pay', label: '支付旧账单' }],
    data: { nodeId: 5, ownerId: 'p2', amount } };
  return state;
}

describe('economy balance', () => {
  it('uses five-times initial land rent and updated utility quotes without changing preview semantics', () => {
    expect(PROPERTY_RENT_MULTIPLIERS).toEqual([0.4, 0.9, 1.75, 3.25, 6]);
    expect([UTILITY_RENT_BASE, UTILITY_RENT_CAP]).toEqual([150, 37_500]);
    const state = game();
    const land = MAPS.lake.nodes[5];
    state.properties[5] = { ownerId: 'p2', level: 0, mortgaged: false };
    for (const [level, multiplier] of PROPERTY_RENT_MULTIPLIERS.entries()) {
      state.properties[5].level = level;
      expect(getRent(state, 5)).toBe(Math.ceil(land.price! * multiplier));
      expect(getTileRentPreview(state, 5).rent).toBe(getRent(state, 5));
    }
    const utility = MAPS.lake.nodes.find(node => node.kind === 'power')!;
    expect(getTileRentPreview(state, utility.id, 'p1').rent).toBe(UTILITY_RENT_BASE);
    expect(UTILITY_RENT_CAP).toBe(37_500);
    const allUtilities = MAPS.lake.nodes.filter(node => ['power', 'water', 'telecom'].includes(node.kind));
    for (const [index, node] of allUtilities.entries()) {
      state.properties[node.id] = { ownerId: 'p2', level: 0, mortgaged: false };
      expect(getRent(state, node.id)).toBe(Math.min(UTILITY_RENT_CAP, UTILITY_RENT_BASE * 3 ** index));
    }
  });

  it('charges mood only for positive rent actually paid and reports the actual clamped loss', () => {
    const state = rentDecision();
    state.players[0].mood = 2;
    const rent = getRent(state, 5);
    const paid = act(state, { type: 'choose', choiceId: 'pay' });
    expect(paid.players[0].cash).toBe(state.players[0].cash - rent);
    expect(paid.players[1].cash).toBe(state.players[1].cash + rent);
    expect(paid.players[0].mood).toBe(0);
    expect(paid.players[0].confinement?.kind).toBe('sanatorium');
    expect(paid.notices?.at(-1)).toMatchObject({ kind: 'rent', amount: rent, playerId: 'p1', recipientId: 'p2' });
    expect(paid.notices?.at(-1)?.body).toContain(`心情 −${RENT_MOOD_LOSS}`);
    expect(paid.logs.some(entry => entry.text.includes(`心情 −${RENT_MOOD_LOSS}`))).toBe(true);
    expect(paid.feedback?.effects).toContainEqual({ kind: 'mood', label: `心情 −${RENT_MOOD_LOSS}`, tone: 'bad' });
    expect(paid.pending).toBeNull();

    const oneMood = rentDecision(); oneMood.players[0].mood = 1;
    const clamped = act(oneMood, { type: 'choose', choiceId: 'pay' });
    expect(clamped.notices?.at(-1)?.body).toContain('心情 −1');
    const waived = act(oneMood, { type: 'choose', choiceId: 'use_card' });
    expect(waived.players[0].mood).toBe(1);
    expect(waived.notices?.at(-1)?.amount).toBe(0);
    expect(waived.players[0].confinement).toBeNull();
  });

  it('applies the same immediate health priority to automatic rent collection', () => {
    const state = game(); state.weatherId = 'clear'; state.selectedDie = 1;
    state.players[0].position = 4; state.players[0].previousPosition = 3; state.players[0].mood = 3;
    state.players[0].inventory = state.players[0].inventory.filter(slot => slot.itemId !== 'rent');
    state.properties[5] = { ownerId: 'p2', level: 1, mortgaged: false };
    const after = act(state, { type: 'roll' });
    expect(after.notices?.filter(entry => entry.kind === 'rent')).toHaveLength(1);
    expect(after.players[0].mood).toBe(0);
    expect(after.players[0].confinement?.kind).toBe('sanatorium');
    expect(after.pending).toBeNull();
    expect(after.movement?.effects).toContainEqual({ kind: 'mood', label: '心情 −2', tone: 'bad' });
    expect(after.movement?.effects?.some(entry => entry.kind === 'confinement')).toBe(true);
  });

  it('sends a payer with zero mood to sanatorium before debt, and never resumes glitch afterward', () => {
    const state = rentDecision();
    state.weatherId = 'glitch';
    state.pending!.data!.glitchBacktrack = true;
    state.players[0].mood = 1;
    state.players[0].cash = getRent(state, 5) - 1;
    const paid = act(state, { type: 'choose', choiceId: 'pay' });
    expect(paid.players[0].cash).toBe(-1);
    expect(paid.players[0].confinement?.kind).toBe('sanatorium');
    expect(MAPS.lake.nodes[paid.players[0].position].kind).toBe('sanatorium');
    expect(paid.pending?.kind).toBe('debt');
    expect(paid.notices?.filter(entry => entry.kind === 'rent')).toHaveLength(1);
    const pawn = paid.pending!.choices.find(choice => choice.id.startsWith('pawn:'))!;
    const resolved = act(paid, { type: 'choose', choiceId: pawn.id });
    expect(resolved.players[0].cash).toBeGreaterThanOrEqual(0);
    expect(resolved.players[0].confinement?.kind).toBe('sanatorium');
    expect(resolved.players[0].position).toBe(paid.players[0].position);
    expect(resolved.phase).toBe('end');
    expect(resolved.pending).toBeNull();
  });

  it('keeps immune and suspended rents free of mood loss', () => {
    const card = rentDecision(); card.players[0].mood = 8;
    const waived = act(card, { type: 'choose', choiceId: 'use_card' });
    expect(waived.players[0].mood).toBe(8);
    const suspended = game(); suspended.weatherId = 'clear'; suspended.selectedDie = 1;
    suspended.players[0].position = 4; suspended.players[0].previousPosition = 3;
    suspended.players[0].mood = 10;
    suspended.properties[5] = { ownerId: 'p2', level: 1, mortgaged: true };
    const after = act(suspended, { type: 'roll' });
    expect(after.players[0].mood).toBe(9); // The ordinary roll costs one mood; zero rent costs none.
    expect(after.notices?.at(-1)?.amount).toBe(0);
  });

  it('penalizes the victim once per successful hostile item and preserves existing confinement', () => {
    for (const itemId of ['bomb', 'unluck', 'tax', 'demolish', 'acquire']) {
      const state = game(); state.weatherId = 'clear';
      const victim = state.players[1]; victim.mood = 4;
      state.players[0].inventory.push({ uid: `hostile-${itemId}`, itemId, quantity: 1, wet: false });
      const action = { type: 'useItem' as const, itemUid: `hostile-${itemId}`,
        ...(['demolish', 'acquire'].includes(itemId) ? { nodeId: 5 } : { targetId: victim.id }) };
      if (['demolish', 'acquire'].includes(itemId)) state.properties[5] = { ownerId: victim.id, level: 1, mortgaged: false };
      const after = act(state, action);
      expect(after, itemId).not.toBe(state);
      expect(after.players[1].mood, itemId).toBe(4 - HOSTILE_ITEM_MOOD_LOSS);
      expect(after.players[0].mood, itemId).toBe(state.players[0].mood);
      expect(after.logs.filter(entry => entry.text.includes(`心情 −${HOSTILE_ITEM_MOOD_LOSS}`))).toHaveLength(1);
      const effects = after.movement?.playerId === victim.id ? after.movement.effects : after.feedback?.effects;
      expect(effects, itemId).toContainEqual({ kind: 'mood', label: `心情 −${HOSTILE_ITEM_MOOD_LOSS}`, tone: 'bad' });
      if (itemId === 'bomb') expect(after.players[1].confinement?.kind).toBe('hospital');
    }
    const shielded = game(); shielded.players[1].mood = 1;
    shielded.players[1].inventory.push({ uid: 'defense', itemId: 'shield', quantity: 1, wet: false });
    shielded.players[0].inventory.push({ uid: 'attack', itemId: 'tax', quantity: 1, wet: false });
    const blocked = act(shielded, { type: 'useItem', itemUid: 'attack', targetId: 'p2' });
    expect(blocked.players[1].mood).toBe(1);
    expect(blocked.players[1].confinement).toBeNull();
    const low = game(); low.players[1].mood = 2;
    low.players[0].inventory.push({ uid: 'unlucky', itemId: 'unluck', quantity: 1, wet: false });
    const sent = act(low, { type: 'useItem', itemUid: 'unlucky', targetId: 'p2' });
    expect(sent.players[1].confinement?.kind).toBe('sanatorium');
    expect(sent.movement?.playerId).toBe('p2');
    expect(sent.movement?.effects).toContainEqual({ kind: 'mood', label: '心情 −2', tone: 'bad' });

    const alreadyConfined = game(); alreadyConfined.players[1].mood = 0;
    alreadyConfined.players[1].confinement = { kind: 'sanatorium', remaining: 2 };
    alreadyConfined.players[0].inventory.push({ uid: 'confined-tax', itemId: 'tax', quantity: 1, wet: false });
    const taxed = act(alreadyConfined, { type: 'useItem', itemUid: 'confined-tax', targetId: 'p2' });
    expect(taxed.players[1].confinement).toEqual(alreadyConfined.players[1].confinement);
    expect(taxed.players[1].mood).toBe(0);
    expect(taxed.logs.at(-1)?.text).toContain('心情没有继续下降');
    expect(taxed.feedback?.playerId).toBe('p2');
    expect(taxed.feedback?.effects.some(entry => entry.kind === 'mood')).toBe(false);
  });

  it('reprices an old saved rent decision but leaves other pending prompts untouched', () => {
    const old = rentDecision();
    old.pending!.data!.amount = Math.ceil(MAPS.lake.nodes[5].price! * 0.24);
    const restored = parseSave(JSON.stringify(old));
    expect(restored.pending?.data?.amount).toBe(getRent(restored, 5));
    expect(restored.pending?.choices.find(choice => choice.id === 'pay')?.label).toContain(String(getRent(restored, 5)));
    expect(act(restored, { type: 'choose', choiceId: 'pay' }).players[0].cash).toBe(old.players[0].cash - getRent(restored, 5));
    expect(parseSave(JSON.stringify(restored)).pending).toEqual(restored.pending);
    const unrelated = game(); unrelated.phase = 'decision'; unrelated.pending = { kind: 'info', title: '提示', body: '原文', choices: [{ id: 'leave', label: '离开' }], data: { amount: 120 } };
    expect(parseSave(JSON.stringify(unrelated)).pending).toEqual(unrelated.pending);
    const invalid = rentDecision(); invalid.pending!.data!.ownerId = 'p1';
    expect(() => parseSave(JSON.stringify(invalid))).toThrow('租金选择');
  });

  it('keeps roadside cash in the new inclusive range and aligns the log and movement effect', () => {
    expect([ROADSIDE_CASH_MIN, ROADSIDE_CASH_MAX]).toEqual([100, 200]);
    const coin = MAPS.lake.nodes.find(node => node.kind === 'coin')!;
    let observed = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const state = game(); state.weatherId = 'clear'; state.selectedDie = 1; state.rng = seed;
      state.players[0].position = coin.neighbors[0];
      const after = act(state, { type: 'roll' });
      if (after.players[0].position !== coin.id) continue;
      observed++;
      const amount = after.players[0].cash - state.players[0].cash;
      expect(amount).toBeGreaterThanOrEqual(ROADSIDE_CASH_MIN);
      expect(amount).toBeLessThanOrEqual(ROADSIDE_CASH_MAX);
      expect(after.logs.at(-1)?.text).toContain(`捡到 ${amount} PM`);
      expect(after.movement?.effects).toContainEqual({ kind: 'cash', label: `拾得 +${amount} PM`, tone: 'good' });
    }
    expect(observed).toBeGreaterThan(10);
  });
});
