import { describe, expect, it } from 'vitest';
import { act, createGame, runAI } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import type { GameConfig, GameState } from '../src/game/types';

const config: GameConfig = { mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 184,
  players: [
    { name: '甲', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '乙', color: '#277DA8', shape: 'diamond', ai: true, personality: 'balanced' },
  ] };
const game = () => createGame(config);
const lands = MAPS.lake.nodes.filter(node => node.kind === 'land');
const utility = MAPS.lake.nodes.find(node => node.kind === 'power')!;
function own(state: GameState, nodeId: number, ownerId = 'p1', level = 0) {
  state.properties[nodeId] = { ownerId, level, mortgaged: false };
  return state;
}
function listed(nodeId = lands[0].id, price = 1000) {
  return act(own(game(), nodeId), { type: 'listProperty', nodeId, price });
}

describe('optional free property market', () => {
  it('defaults to enabled and migrates old saves without listings', () => {
    const state = game();
    expect(state.config.propertyTrading).toBe(true);
    expect(state.propertyListings).toEqual([]);
    delete state.config.propertyTrading;
    delete state.propertyListings;
    const restored = parseSave(JSON.stringify(state));
    expect(restored.config.propertyTrading).toBe(true);
    expect(restored.propertyListings).toEqual([]);
    expect(() => createGame({ ...config, propertyTrading: 'yes' as unknown as boolean })).toThrow('property trading');
  });

  it('enforces price, ownership, mortgage, single-listing and phase boundaries', () => {
    const state = own(game(), lands[0].id);
    const action = { type: 'listProperty' as const, nodeId: lands[0].id, price: 1000 };
    for (const price of [0, -1, 1.5, Number.MAX_SAFE_INTEGER, 1_000_000_001, NaN]) {
      expect(act(state, { ...action, price }), String(price)).toBe(state);
    }
    expect(act(state, { ...action, nodeId: lands[1].id })).toBe(state);
    const mortgage = structuredClone(state); mortgage.properties[lands[0].id].mortgaged = true;
    expect(act(mortgage, action)).toBe(mortgage);
    const pending = structuredClone(state); pending.phase = 'decision'; pending.pending = { kind: 'event', title: '', body: '', choices: [] };
    expect(act(pending, action)).toBe(pending);
    const report = structuredClone(state); report.seasonReport = { season: 1, day: 21, rankings: [] };
    expect(act(report, action)).toBe(report);
    expect(act(report, { type: 'offerTrade', nodeId: lands[0].id, targetId: 'p2', price: 1000 })).toBe(report);
    const listedState = act(state, action);
    expect(listedState.propertyListings).toMatchObject([{ nodeId: lands[0].id, sellerId: 'p1', price: 1000, listedDay: 1 }]);
    expect(act(listedState, action)).toBe(listedState);
  });

  it('allows non-current actors only for market actions and preserves the displayed movement', () => {
    const state = own(game(), lands[0].id);
    state.currentPlayerIndex = 1;
    state.movement = { id: 100, playerId: 'p2', path: [0, 1], roll: 1, modifier: 0, dice: true };
    expect(act(state, { type: 'listProperty', nodeId: lands[0].id, price: 900 })).toBe(state);
    expect(act(state, { type: 'roll' }, 'p1')).toBe(state);
    const listedState = act(state, { type: 'listProperty', nodeId: lands[0].id, price: 900 }, 'p1');
    expect(listedState).not.toBe(state);
    expect(listedState.currentPlayerIndex).toBe(1);
    expect(listedState.phase).toBe('ready');
    expect(listedState.movement).toEqual(state.movement);
    expect(listedState.feedback?.nodeId).toBe(lands[0].id);
  });

  it('atomically buys a listing once and publishes a structured trade notice', () => {
    const offered = listed(lands[0].id, 1234);
    const listing = offered.propertyListings![0];
    const buyerCash = offered.players[1].cash;
    const sellerCash = offered.players[0].cash;
    expect(act(offered, { type: 'buyListing', listingId: listing.id }, 'p1')).toBe(offered);
    const short = structuredClone(offered); short.players[1].cash = 1000;
    expect(act(short, { type: 'buyListing', listingId: listing.id }, 'p2')).toBe(short);
    const bought = act(offered, { type: 'buyListing', listingId: listing.id }, 'p2');
    expect(bought.players[1].cash).toBe(buyerCash - 1234);
    expect(bought.players[0].cash).toBe(sellerCash + 1234);
    expect(bought.properties[lands[0].id].ownerId).toBe('p2');
    expect(bought.propertyListings).toEqual([]);
    expect(bought.notices?.at(-1)).toMatchObject({ kind: 'trade', title: '拍卖成交', amount: 1234,
      nodeId: lands[0].id, playerId: 'p2', recipientId: 'p1' });
    expect(bought.notices?.at(-1)?.body).toContain(lands[0].name);
    expect(bought.notices?.at(-1)?.body).toContain('1,234');
    expect(bought.logs.at(-1)?.text).toContain('产权已转移');
    expect(bought.feedback?.effects).toEqual(expect.arrayContaining([expect.objectContaining({ kind: 'building' })]));
    expect(act(bought, { type: 'buyListing', listingId: listing.id }, 'p1')).toBe(bought);
  });

  it('limits cancellation to the seller and rejects stale listing IDs after relisting', () => {
    const first = listed();
    const id = first.propertyListings![0].id;
    expect(act(first, { type: 'cancelListing', listingId: id }, 'p2')).toBe(first);
    const cancelled = act(first, { type: 'cancelListing', listingId: id }, 'p1');
    expect(cancelled.propertyListings).toEqual([]);
    expect(act(cancelled, { type: 'buyListing', listingId: id }, 'p2')).toBe(cancelled);
    const again = act(cancelled, { type: 'listProperty', nodeId: lands[0].id, price: 1100 }, 'p1');
    expect(again.propertyListings![0].id).not.toBe(id);
    expect(act(again, { type: 'buyListing', listingId: id }, 'p2')).toBe(again);
    const sold = act(again, { type: 'buyListing', listingId: again.propertyListings![0].id }, 'p2');
    expect(sold.propertyListings).toEqual([]);
    expect(act(sold, { type: 'listProperty', nodeId: lands[0].id, price: 1200 }, 'p2').propertyListings?.[0].sellerId).toBe('p2');
  });

  it('permits landmarks and utilities but removes listings on asset changes', () => {
    const landmark = own(game(), lands[0].id, 'p1', 4);
    const landmarkListing = act(landmark, { type: 'listProperty', nodeId: lands[0].id, price: 20_000 });
    expect(landmarkListing.propertyListings).toHaveLength(1);
    expect(act(landmarkListing, { type: 'buyListing', listingId: landmarkListing.propertyListings![0].id }, 'p2').properties[lands[0].id]).toMatchObject({ ownerId: 'p2', level: 4 });
    const facility = own(game(), utility.id);
    const facilityListing = act(facility, { type: 'listProperty', nodeId: utility.id, price: 10_000 });
    expect(facilityListing.propertyListings).toHaveLength(1);
    expect(act(facilityListing, { type: 'buyListing', listingId: facilityListing.propertyListings![0].id }, 'p2').properties[utility.id].ownerId).toBe('p2');

    const mortgage = listed();
    expect(act(mortgage, { type: 'mortgage', nodeId: lands[0].id }).propertyListings).toEqual([]);
    const bankSale = listed();
    expect(act(bankSale, { type: 'sellAsset', nodeId: lands[0].id }).propertyListings).toEqual([]);
    const offer = listed();
    const directlySold = act(offer, { type: 'offerTrade', nodeId: lands[0].id, targetId: 'p2', price: 1000 });
    expect(directlySold.propertyListings).toEqual([]);
    expect(directlySold.notices?.at(-1)).toMatchObject({ kind: 'trade', playerId: 'p2', recipientId: 'p1', amount: 1000 });
    const bankrupt = listed();
    bankrupt.phase = 'decision'; bankrupt.pending = { kind: 'debt', title: '', body: '', choices: [{ id: 'bankrupt', label: '' }] };
    expect(act(bankrupt, { type: 'choose', choiceId: 'bankrupt' }).propertyListings).toEqual([]);
  });

  it('rejects disabled trading for both the new market and the old direct offer', () => {
    const state = createGame({ ...config, propertyTrading: false });
    own(state, lands[0].id);
    expect(state.config.propertyTrading).toBe(false);
    expect(act(state, { type: 'listProperty', nodeId: lands[0].id, price: 1000 })).toBe(state);
    expect(act(state, { type: 'offerTrade', nodeId: lands[0].id, targetId: 'p2', price: 1000 })).toBe(state);
    expect(runAI({ ...state, currentPlayerIndex: 1 })).not.toMatchObject({ propertyListings: [{ sellerId: 'p2' }] });
  });

  it('strictly validates imported listings and Boolean trading settings', () => {
    const state = listed();
    expect(parseSave(JSON.stringify(state)).propertyListings).toEqual(state.propertyListings);
    for (const flag of [null, 'true', 1]) {
      const corrupt = structuredClone(state); (corrupt.config as unknown as { propertyTrading: unknown }).propertyTrading = flag;
      expect(() => parseSave(JSON.stringify(corrupt)), String(flag)).toThrow('设置');
    }
    const cases = [
      { id: 'bad' }, { id: 'listing-999999' }, { nodeId: 999 }, { sellerId: 'p2' }, { price: 0 },
      { price: 1.5 }, { price: 1_000_000_001 }, { listedDay: state.day + 1 }, { extra: 'payload' },
    ];
    for (const patch of cases) {
      const corrupt = structuredClone(state); Object.assign(corrupt.propertyListings![0], patch);
      expect(() => parseSave(JSON.stringify(corrupt)), JSON.stringify(patch)).toThrow('拍卖');
    }
    const duplicate = structuredClone(state); duplicate.propertyListings!.push({ ...duplicate.propertyListings![0], id: 'listing-1' });
    expect(() => parseSave(JSON.stringify(duplicate))).toThrow('拍卖');
    const disabled = structuredClone(state); disabled.config.propertyTrading = false;
    expect(() => parseSave(JSON.stringify(disabled))).toThrow('拍卖');
    const impossibleTrade = createGame({ ...config, propertyTrading: false });
    impossibleTrade.phase = 'decision'; impossibleTrade.pending = { kind: 'trade', title: '产权交易', body: '', choices: [{ id: 'accept', label: '接受' }] };
    expect(() => parseSave(JSON.stringify(impossibleTrade))).toThrow('对局');
  });

  it('lets AI buy a fair listing once per day and list a non-landmark when short of cash', () => {
    const market = game();
    own(market, lands[0].id); own(market, lands[1].id);
    market.currentPlayerIndex = 1;
    const first = act(market, { type: 'listProperty', nodeId: lands[0].id, price: 1000 }, 'p1');
    const second = act(first, { type: 'listProperty', nodeId: lands[1].id, price: 1000 }, 'p1');
    const bought = runAI(second);
    expect(bought.properties[lands[0].id].ownerId).toBe('p2');
    expect(bought.notices?.at(-1)?.kind).toBe('trade');
    const next = runAI(bought);
    expect(next.propertyListings).toHaveLength(1);

    const cashPoor = own(game(), lands[0].id, 'p2');
    own(cashPoor, lands[1].id, 'p2');
    cashPoor.currentPlayerIndex = 1;
    cashPoor.players[1].cash = 6000;
    const listedByAI = runAI(cashPoor);
    expect(listedByAI.propertyListings).toHaveLength(1);
    expect(listedByAI.propertyListings?.[0].sellerId).toBe('p2');
    expect(listedByAI.properties[listedByAI.propertyListings![0].nodeId].level).toBeLessThan(4);
    expect(runAI(listedByAI).propertyListings).toHaveLength(1);
  });
});
