import { describe, expect, it } from 'vitest';
import { act, createGame, runAI } from '../src/game/engine';
import { SLOTS_STAKE } from '../src/game/casino';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import type { AILevel, GameState, Personality } from '../src/game/types';

const casinoId = MAPS.lake.nodes.find(node => node.kind === 'casino')!.id;

function casinoState(personality: Personality, aiLevel: AILevel = 'fierce'): GameState {
  const state = createGame({ mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 247,
    players: [
      { name: '真人', color: '#d55b48', shape: 'circle', ai: false, personality: 'balanced' },
      { name: '电脑', color: '#277da8', shape: 'diamond', ai: true, personality, aiLevel },
    ] });
  state.currentPlayerIndex = 1;
  state.weatherId = 'clear';
  state.players[1].position = casinoId;
  state.players[1].inventory.push({ uid: 'fourth-slot', itemId: 'tea', quantity: 1, wet: false });
  state.phase = 'decision';
  state.pending = { kind: 'casino', title: '星港赌场', body: '赌场选择', data: {}, choices: [
    { id: 'slots', label: '老虎机 · 300 PM' },
    { id: 'red', label: '轮盘押红 · 500 PM' },
    { id: 'black', label: '轮盘押黑 · 500 PM' },
    { id: 'leave', label: '离开' },
  ] };
  return state;
}

const quantity = (state: GameState, itemId: string) => state.players[1].inventory
  .filter(slot => slot.itemId === itemId).reduce((sum, slot) => sum + slot.quantity, 0);

describe('AI casino decisions', () => {
  it('fierce cautious, balanced and aggressive AI each buy one slot draw and then leave', () => {
    for (const personality of ['cautious', 'balanced', 'aggressive'] as const) {
      const before = casinoState(personality);
      const played = runAI(before);
      const prize = played.pending?.casinoResult?.itemId;
      expect(played.pending?.casinoResult).toMatchObject({ game: 'slots', outcome: 'item', stake: SLOTS_STAKE });
      expect(prize).toBeDefined();
      expect(played.players[1].cash).toBe(before.players[1].cash - SLOTS_STAKE);
      expect(quantity(played, prize!) - quantity(before, prize!)).toBe(1);
      expect(played.pending?.data?.played).toBe(true);
      const left = runAI(played);
      expect(left.pending).toBeNull();
      expect(left.players[1].cash).toBe(played.players[1].cash);
      expect(left.rng).toBe(played.rng);
      const ended = runAI(left);
      expect(ended.currentPlayerIndex).toBe(0);
    }
  });

  it('requires personality-specific free slots and the fierce cash reserve', () => {
    const minimumFree = { cautious: 3, balanced: 2, aggressive: 1 } as const;
    const reserve = { cautious: 34_000, balanced: 20_000, aggressive: 9_000 } as const;
    for (const personality of ['cautious', 'balanced', 'aggressive'] as const) {
      const enough = casinoState(personality);
      enough.players[1].capacity = enough.players[1].inventory.length + minimumFree[personality];
      enough.players[1].cash = reserve[personality] + SLOTS_STAKE;
      expect(runAI(enough).pending?.casinoResult?.game).toBe('slots');

      const shortCash = casinoState(personality);
      shortCash.players[1].cash = reserve[personality] + SLOTS_STAKE - 1;
      const refused = runAI(shortCash);
      expect(refused.pending).toBeNull();
      expect(refused.players[1].cash).toBe(shortCash.players[1].cash);
      expect(refused.rng).toBe(shortCash.rng);

      const tightBag = casinoState(personality);
      tightBag.players[1].capacity = tightBag.players[1].inventory.length + minimumFree[personality] - 1;
      const alternative = runAI(tightBag);
      expect(alternative.pending?.casinoResult?.game).toBe(personality === 'aggressive' ? 'roulette' : undefined);
      if (personality !== 'aggressive') expect(alternative.pending).toBeNull();
    }
  });

  it('keeps gentle casino behavior and only lets aggressive AI take one red roulette bet', () => {
    for (const personality of ['cautious', 'balanced', 'aggressive'] as const) {
      const before = casinoState(personality, 'gentle');
      const after = runAI(before);
      if (personality === 'aggressive') {
        expect(after.pending?.casinoResult).toMatchObject({ game: 'roulette', bet: 'red', stake: 500 });
        expect(runAI(after).pending).toBeNull();
      } else {
        expect(after.pending).toBeNull();
        expect(after.players[1].cash).toBe(before.players[1].cash);
      }
    }
    const threshold = casinoState('aggressive', 'gentle');
    threshold.players[1].cash = 15_000;
    expect(runAI(threshold).pending).toBeNull();
  });

  it('exits when options are disabled, cash is low, the bag is full, or weather is paradox', () => {
    const disabled = casinoState('balanced');
    disabled.pending!.choices.find(choice => choice.id === 'slots')!.disabled = true;
    expect(runAI(disabled).pending).toBeNull();

    const rouletteDisabled = casinoState('aggressive');
    rouletteDisabled.pending!.choices.find(choice => choice.id === 'slots')!.disabled = true;
    rouletteDisabled.pending!.choices.find(choice => choice.id === 'red')!.disabled = true;
    expect(runAI(rouletteDisabled).pending).toBeNull();

    const poor = casinoState('cautious');
    poor.players[1].cash = SLOTS_STAKE - 1;
    expect(runAI(poor).pending).toBeNull();

    const full = casinoState('cautious');
    full.players[1].capacity = full.players[1].inventory.length;
    expect(runAI(full).pending).toBeNull();

    const paradox = casinoState('aggressive');
    paradox.weatherId = 'paradox';
    const left = runAI(paradox);
    expect(left.pending).toBeNull();
    expect(left.players[1].cash).toBe(paradox.players[1].cash);
  });

  it('never replays a played prompt or a restored result with a missing played flag', () => {
    const before = casinoState('aggressive');
    const played = runAI(before);
    const saved = parseSave(JSON.stringify(played));
    const left = runAI(saved);
    expect(left.pending).toBeNull();
    expect(left.players[1].cash).toBe(saved.players[1].cash);
    expect(left.rng).toBe(saved.rng);

    const old = structuredClone(played);
    delete old.pending!.data!.played;
    const restored = parseSave(JSON.stringify(old));
    expect(restored.pending?.casinoResult).toBeDefined();
    const recovered = runAI(restored);
    expect(recovered.pending).toBeNull();
    expect(recovered.players[1].cash).toBe(restored.players[1].cash);
    expect(recovered.rng).toBe(restored.rng);
  });

  it('chooses from public state without peeking at RNG or drawing twice', () => {
    const lowSeed = casinoState('balanced');
    const highSeed = structuredClone(lowSeed);
    lowSeed.rng = 1;
    highSeed.rng = 2_147_483_647;
    for (const before of [lowSeed, highSeed]) {
      const expected = act(before, { type: 'choose', choiceId: 'slots' });
      const chosen = runAI(before);
      expect(chosen.pending?.casinoResult).toEqual(expected.pending?.casinoResult);
      expect(chosen.players[1].cash).toBe(expected.players[1].cash);
      expect(chosen.players[1].inventory).toEqual(expected.players[1].inventory);
      expect(chosen.rng).toBe(expected.rng);
    }
  });
});
