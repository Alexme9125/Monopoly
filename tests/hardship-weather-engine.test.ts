import { describe, expect, it } from 'vitest';
import { ITEMS, WEATHERS } from '../src/game/data';
import { act, canTargetItem, createGame, runAI } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import type { GameState, MapId } from '../src/game/types';
import {
  getFogRentAvoidance, getGlitchBacktrackSteps, getGlitchPenalty, getWeatherDiceModifier,
  getWeatherDryingChance, getWeatherLandingDamage, getWeatherLightning, getWeatherMove,
  getWeatherPaperLoss, getWeatherRollDamage, getWeatherWetCount,
} from '../src/game/weatherRules';

function game(mapId: MapId = 'lake', seed = 571): GameState {
  const state = createGame({ mapId, mode: 'pve', seasons: 4, weatherMode: 'hardship', seed,
    players: [
      { name: '旅者', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' },
      { name: '同行者', color: '#277DA8', shape: 'diamond', ai: true, personality: 'cautious' },
    ] });
  state.encounters = [];
  return state;
}

function controlled(state: GameState, weatherId: string, value = 6): GameState {
  state.weatherId = weatherId;
  state.players[0].position = 0;
  state.players[0].previousPosition = null;
  state.players[0].routeNextPosition = 1;
  state.controlledRoll = value;
  return act(state, { type: 'roll' });
}

describe('hardship weather engine', () => {
  it('publishes every strengthened movement, roll, landing and chance value', () => {
    expect(['snow', 'blizzard', 'freezing', 'gale', 'sand', 'sandstorm', 'glitch'].map(id => getWeatherMove(id, 'hardship')))
      .toEqual([{ steps: 2, backward: false }, { steps: 4, backward: false }, { steps: 6, backward: false },
        { steps: 2, backward: true }, { steps: 3, backward: true }, { steps: 6, backward: true }, { steps: 3, backward: false }]);
    expect(getGlitchBacktrackSteps('hardship')).toBe(6);
    expect(['hot', 'heat', 'scorch', 'mist'].map(id => getWeatherDiceModifier(id, 'hardship'))).toEqual([-2, -3, -4, -1]);
    expect(['chill', 'snow', 'blizzard', 'warm', 'hot', 'heat', 'drought', 'acid']
      .map(id => getWeatherLandingDamage(id, 'hardship'))).toEqual([
        { stamina: 5, mood: 5 }, { stamina: 2, mood: 3 }, { stamina: 8, mood: 10 },
        { stamina: 1, mood: 3 }, { stamina: 2, mood: 5 }, { stamina: 3, mood: 8 },
        { stamina: 1, mood: 0 }, { stamina: 6, mood: 10 },
      ]);
    expect(['freezing', 'drizzle', 'rain', 'thunder', 'storm', 'drought', 'gale', 'sand', 'sandstorm', 'mist', 'fog', 'haze', 'paradox']
      .map(id => getWeatherRollDamage(id, 'hardship', 5))).toEqual([
        { stamina: 0, mood: 6 }, { stamina: 0, mood: 3 }, { stamina: 0, mood: 5 },
        { stamina: 0, mood: 3 }, { stamina: 0, mood: 5 }, { stamina: 0, mood: 3 },
        { stamina: 0, mood: 3 }, { stamina: 0, mood: 5 }, { stamina: 3, mood: 8 },
        { stamina: 0, mood: 2 }, { stamina: 0, mood: 4 }, { stamina: 1, mood: 12 },
        { stamina: 0, mood: 8 },
      ]);
    expect(getWeatherRollDamage('scorch', 'hardship', 5)).toEqual({ stamina: 15, mood: 30 });
    expect(getWeatherLightning('thunder', 'hardship')).toEqual({ chance: 0.2, stamina: 14, mood: 7 });
    expect(getWeatherLightning('storm', 'hardship')).toEqual({ chance: 0.4, stamina: 16, mood: 10 });
    expect(['gale', 'sand', 'sandstorm'].map(id => getWeatherPaperLoss(id, 'hardship'))).toEqual([
      { chance: 0.2, cashMin: 60, cashMax: 240 }, { chance: 0.3, cashMin: 60, cashMax: 240 },
      { chance: 0.4, cashMin: 60, cashMax: 240 },
    ]);
    expect([0, 1, 2].map(index => getGlitchPenalty('hardship', index))).toEqual([
      { stamina: 8, mood: 10 }, { stamina: 16, mood: 8 }, { stamina: 3, mood: 8 },
    ]);
    expect(getWeatherWetCount('drizzle', 'hardship')).toBe(2);
    expect(getWeatherWetCount('rain', 'hardship')).toBe(3);
    expect(getWeatherWetCount('storm', 'hardship')).toBe(Infinity);
    expect(getWeatherDryingChance('breeze', 'hardship')).toBe(0.75);
    expect(getWeatherDryingChance('drought', 'hardship')).toBe(1);
    expect(getFogRentAvoidance('hardship')).toBe(0.65);
  });

  it('applies controlled D6 points, heat reduction and uncapped scorch to actual normal steps', () => {
    const hot = controlled(game(), 'hot', 2);
    expect(hot.movement?.roll).toBe(2);
    expect(hot.movement?.modifier).toBe(-2);
    expect(hot.movement?.segments?.[0].path).toEqual([0]);
    expect(hot.players[0].stamina).toBe(96); // base 2, exposed start tile 2
    expect(hot.players[0].mood).toBe(94); // base 1, exposed start tile 5

    const scorch = controlled(game(), 'scorch', 6);
    expect(scorch.movement?.segments?.[0].path).toHaveLength(3);
    expect(scorch.players[0].stamina).toBe(90); // base 4 + two steps × 3
    expect(scorch.players[0].mood).toBe(87); // base 1 + two steps × 6
    expect(scorch.players[0].travelProgress).toBe(2);
  });

  it('uses one weather correction for two dice and protects with an umbrella without cancelling movement', () => {
    const state = game();
    state.weatherId = 'scorch';
    state.selectedDie = 8;
    state.twinRoll = true;
    state.players[0].statuses.push({ id: 'umbrella', remaining: 3 });
    const after = act(state, { type: 'roll' });
    expect(after.movement?.rolls).toHaveLength(2);
    expect(after.movement?.roll).toBe(after.movement!.rolls!.reduce((sum, roll) => sum + roll, 0));
    expect(after.movement?.modifier).toBe(-4);
    expect(after.movement?.segments?.[0].path.length).toBe(Math.max(0, after.movement!.roll - 4) + 1);
    expect(after.players[0].stamina).toBeGreaterThanOrEqual(96);
    expect(after.players[0].mood).toBe(99);
    expect(after.twinRoll).toBe(false);
  });

  it('wets distinct dry inventory slots and does not repeat a wet target', () => {
    const state = game();
    state.weatherId = 'rain';
    const player = state.players[0];
    player.inventory.push({ uid: 'extra1', itemId: 'tea', quantity: 1, wet: false });
    player.inventory.push({ uid: 'extra2', itemId: 'shield', quantity: 1, wet: false });
    player.inventory[0].wet = true;
    const before = new Set(player.inventory.filter(slot => slot.wet).map(slot => slot.uid));
    const after = act(state, { type: 'roll' });
    const newlyWet = after.players[0].inventory.filter(slot => slot.wet && !before.has(slot.uid));
    expect(newlyWet).toHaveLength(3);
    expect(newlyWet.some(slot => !ITEMS[slot.itemId].susceptible)).toBe(true);
    const storm = game(); storm.weatherId = 'storm';
    expect(act(storm, { type: 'roll' }).players[0].inventory.every(slot => slot.wet)).toBe(true);
  });

  it('shelters at buildings, including unowned prefabs, but harms an empty landing', () => {
    const exposed = game();
    exposed.weatherId = 'chill'; exposed.controlledRoll = 2;
    const empty = act(exposed, { type: 'roll' });
    expect(MAPS.lake.nodes[empty.players[0].position].kind).toBe('empty');
    expect(empty.players[0].stamina).toBe(93); // base 2, exposed 5
    expect(empty.players[0].mood).toBe(94); // base 1, exposed 5

    const prefab = game('grandCity');
    prefab.weatherId = 'chill'; prefab.controlledRoll = 1; prefab.players[0].routeNextPosition = 1;
    const covered = act(prefab, { type: 'roll' });
    expect(covered.players[0].position).toBe(1);
    expect(covered.properties[1]).toBeUndefined();
    expect(MAPS.grandCity.nodes[1].prefabLevel).toBeGreaterThan(0);
    expect(covered.players[0].stamina).toBe(98);
    expect(covered.players[0].mood).toBe(99);
  });

  it('allows the weather controller to select a disaster on day one only in hardship', () => {
    const hardship = game();
    hardship.players[0].inventory.push({ uid: 'weather-card', itemId: 'weather', quantity: 1, wet: false });
    expect(canTargetItem(hardship, 'p1', 'weather-card', { weatherId: 'glitch' })).toBe(true);
    const selected = act(hardship, { type: 'useItem', itemUid: 'weather-card', weatherId: 'glitch' });
    expect(selected).not.toBe(hardship);
    expect(selected.players[0].statuses.some(status => status.id === 'weather:glitch')).toBe(true);
    const standard = game(); standard.config.weatherMode = 'standard';
    standard.players[0].inventory.push({ uid: 'weather-card', itemId: 'weather', quantity: 1, wet: false });
    expect(canTargetItem(standard, 'p1', 'weather-card', { weatherId: 'glitch' })).toBe(false);
    expect(act(standard, { type: 'useItem', itemUid: 'weather-card', weatherId: 'glitch' })).toBe(standard);
  });

  it('applies one glitch penalty while serializing both +3 and -6 landing decisions', () => {
    const state = game();
    state.weatherId = 'glitch'; state.controlledRoll = 2;
    state.players[0].routeNextPosition = 1;
    const first = act(state, { type: 'roll' });
    expect(first.players[0].position).toBe(5);
    expect(first.pending?.kind).toBe('land');
    expect(first.movement?.segments?.map(segment => segment.path.length - 1)).toEqual([2, 3]);
    expect(first.players[0].stamina).toBe(90);
    expect(first.players[0].mood).toBe(89);
    const second = act(first, { type: 'choose', choiceId: 'leave' });
    expect(second.movement?.dice).toBe(false);
    expect((second.movement?.segments?.[0]?.path.length ?? 1) - 1).toBe(6);
    expect(second.players[0].stamina).toBe(90);
    expect(second.players[0].mood).toBe(89);
  });

  it('keeps an umbrella dry through sandstorm while preserving its six-step retreat', () => {
    const state = game();
    state.weatherId = 'sandstorm'; state.controlledRoll = 1;
    state.players[0].routeNextPosition = 1;
    state.players[0].statuses.push({ id: 'umbrella', remaining: 3 });
    const beforeCash = state.players[0].cash;
    const after = act(state, { type: 'roll' });
    expect((after.movement?.segments?.[1]?.path.length ?? 1) - 1).toBe(6);
    expect(after.players[0].stamina).toBe(98);
    expect(after.players[0].mood).toBe(99);
    expect(after.players[0].cash).toBe(beforeCash);
    expect(after.players[0].inventory.every(slot => !slot.wet)).toBe(true);
  });

  it('applies lightning mood damage and caps wind cash loss at available cash', () => {
    const seeds = Array.from({ length: 100 }, (_, index) => Math.imul(index + 1, 2654435761) >>> 0);
    const lightning = seeds.map(seed => {
      const state = game('lake', seed);
      state.weatherId = 'thunder'; state.controlledRoll = 1;
      state.players[0].routeNextPosition = 1;
      return act(state, { type: 'roll' });
    }).find(state => state.logs.some(log => log.text.includes('遭遇雷击')));
    expect(lightning).toBeDefined();
    expect(lightning!.players[0].stamina).toBe(84); // base 2 and lightning 14
    expect(lightning!.players[0].mood).toBe(89); // base 1, thunder 3 and lightning 7

    const wind = seeds.map(seed => {
      const state = game('lake', seed);
      state.weatherId = 'gale'; state.controlledRoll = 1;
      state.players[0].routeNextPosition = 1;
      state.players[0].inventory = [];
      state.players[0].cash = 50;
      return act(state, { type: 'roll' });
    }).find(state => state.logs.some(log => log.text.includes('被风吹走')));
    expect(wind).toBeDefined();
    expect(wind!.players[0].cash).toBe(0);
    expect(wind!.players[0].mood).toBe(96); // base 1 and gale 3
  });

  it('sends a zero-mood player away before settling the original tile', () => {
    const state = game();
    state.weatherId = 'rain'; state.controlledRoll = 1;
    state.players[0].routeNextPosition = 1;
    state.players[0].mood = 6;
    const after = act(state, { type: 'roll' });
    expect(after.players[0].confinement).toEqual({ kind: 'sanatorium', remaining: 3 });
    expect(after.phase).toBe('end');
    expect(after.pending).toBeNull();
    expect(after.movement?.segments?.at(-1)?.kind).toBe('transfer');
  });

  it('lets AI avoid an unsafe hardship multi-die scorch and rest instead', () => {
    const state = game();
    state.currentPlayerIndex = 1;
    state.weatherId = 'scorch';
    state.players[1].stamina = 50;
    state.players[1].mood = 50;
    state.selectedDie = 20;
    const after = runAI(state);
    expect(after.phase).toBe('end');
    expect(after.movement).toBeNull();
    expect(after.players[1].stamina).toBe(56);
  });

  it('keeps harmless soft weather recovery on voluntary rest', () => {
    const state = game();
    state.weatherId = 'soft';
    state.players[0].mood = 50;
    const after = act(state, { type: 'rest' });
    expect(after.players[0].mood).toBeGreaterThanOrEqual(69);
    expect(after.players[0].mood).toBeLessThanOrEqual(76);
    expect(after.players[0].stamina).toBe(100);
    expect(after.phase).toBe('end');
  });
});
