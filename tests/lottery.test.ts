import { describe, expect, it } from 'vitest';
import { act, createGame } from '../src/game/engine';
import { parseSave } from '../src/game/storage';
import type { GameConfig, GameState } from '../src/game/types';

const config: GameConfig = {
  mapId: 'lake', mode: 'pvp', seasons: 4, weatherMode: 'standard', seed: 314159,
  players: [
    { name: '甲', color: '#d55b48', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '乙', color: '#277da8', shape: 'diamond', ai: false, personality: 'cautious' },
  ],
};

function ticketState(quantity = 1): GameState {
  const state = createGame(config);
  state.weatherId = 'clear';
  state.players[0].inventory.push({ uid: 'ticket', itemId: 'lottery', quantity, wet: false });
  return state;
}

function nextPrize(seed: number) {
  const rng = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return { rng, amount: 100 + Math.floor(rng / 0x1_0000_0000 * 4901) };
}

describe('star-sea lottery ticket settlement', () => {
  it('draws exactly once, consumes the final ticket, and reports the actual cash in notice, log and feedback', () => {
    const before = ticketState();
    const expected = nextPrize(before.rng);
    const after = act(before, { type: 'useItem', itemUid: 'ticket' });
    const formatted = expected.amount.toLocaleString('zh-CN');
    expect(after).not.toBe(before);
    expect(after.rng).toBe(expected.rng);
    expect(after.players[0].cash - before.players[0].cash).toBe(expected.amount);
    expect(after.players[0].inventory.some(slot => slot.uid === 'ticket')).toBe(false);
    expect(after.phase).toBe('ready');
    expect(after.notices?.at(-1)).toMatchObject({ kind: 'lottery', title: '星海奖券开奖',
      amount: expected.amount, playerId: 'p1', nodeId: after.players[0].position, day: after.day });
    expect(after.notices?.at(-1)?.body).toBe(`甲 使用星海奖券，获得 ${formatted} PM，奖金已到账。`);
    expect(after.logs.at(-1)?.text).toContain(`获得 ${formatted} PM`);
    expect(after.feedback).toMatchObject({ playerId: 'p1', effects: [
      { kind: 'event', label: '星海奖券开奖', tone: 'good' },
      { kind: 'cash', label: `+${formatted} PM`, tone: 'good' },
    ] });
    expect(act(after, { type: 'useItem', itemUid: 'ticket' })).toBe(after);
  });

  it('decrements a stacked ticket one at a time and preserves the final result after save/load', () => {
    const initial = ticketState(2);
    const first = act(initial, { type: 'useItem', itemUid: 'ticket' });
    expect(first.players[0].inventory.find(slot => slot.uid === 'ticket')?.quantity).toBe(1);
    const second = act(first, { type: 'useItem', itemUid: 'ticket' });
    expect(second.players[0].inventory.some(slot => slot.uid === 'ticket')).toBe(false);
    const notices = second.notices?.filter(item => item.kind === 'lottery') ?? [];
    expect(notices).toHaveLength(2);
    expect(second.players[0].cash - initial.players[0].cash).toBe(notices[0].amount! + notices[1].amount!);
    const saved = parseSave(JSON.stringify(second));
    expect(saved.notices?.filter(item => item.kind === 'lottery')).toEqual(notices);
    expect(saved.players[0].cash).toBe(second.players[0].cash);
    expect(saved.players[0].inventory.some(slot => slot.uid === 'ticket')).toBe(false);
    expect(parseSave(JSON.stringify(saved)).players[0].cash).toBe(second.players[0].cash);
  });

  it('does not draw or consume a wet card, during paradox, outside ready, or for another actor', () => {
    const wet = ticketState();
    wet.players[0].inventory.at(-1)!.wet = true;
    expect(act(wet, { type: 'useItem', itemUid: 'ticket' })).toBe(wet);

    const paradox = ticketState(); paradox.weatherId = 'paradox';
    expect(act(paradox, { type: 'useItem', itemUid: 'ticket' })).toBe(paradox);

    const ended = ticketState(); ended.phase = 'end';
    expect(act(ended, { type: 'useItem', itemUid: 'ticket' })).toBe(ended);

    const otherActor = ticketState();
    expect(act(otherActor, { type: 'useItem', itemUid: 'ticket' }, 'p2')).toBe(otherActor);
    otherActor.players[1].inventory.push({ uid: 'other-ticket', itemId: 'lottery', quantity: 1, wet: false });
    expect(act(otherActor, { type: 'useItem', itemUid: 'other-ticket' })).toBe(otherActor);
    for (const state of [wet, paradox, ended, otherActor]) {
      expect(state.notices?.filter(item => item.kind === 'lottery')).toHaveLength(0);
      expect(state.players[0].inventory.find(slot => slot.uid === 'ticket')?.quantity).toBe(1);
    }
  });

  it('validates lottery amounts strictly while accepting an old save without notices', () => {
    const result = act(ticketState(), { type: 'useItem', itemUid: 'ticket' });
    for (const invalid of [99, 5001, 100.5, null, '100']) {
      const corrupted = structuredClone(result) as GameState;
      (corrupted.notices!.at(-1)! as unknown as { amount: unknown }).amount = invalid;
      expect(() => parseSave(JSON.stringify(corrupted)), String(invalid)).toThrow('通知');
    }
    const missing = structuredClone(result);
    delete missing.notices!.at(-1)!.amount;
    expect(() => parseSave(JSON.stringify(missing))).toThrow('通知');
    const recipient = structuredClone(result);
    recipient.notices!.at(-1)!.recipientId = 'p2';
    expect(() => parseSave(JSON.stringify(recipient))).toThrow('通知');
    const legacy = ticketState();
    delete legacy.notices;
    expect(parseSave(JSON.stringify(legacy)).notices).toEqual([]);
  });
});
