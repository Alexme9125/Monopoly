import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EVENTS, ITEMS } from '../src/game/data';
import { act, canUseItem, createGame } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import type { GameState, MapId } from '../src/game/types';
import { getLotLayout, hasLot, overlap } from '../src/visual/sceneLayout';
import { layoutStationMarkers } from '../src/visual/stationLayout';

const fixture = (name: string) => parseSave(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('browser acceptance fixtures', () => {
  it('loads the natural snow slide onto a coin with a ready human turn', () => {
    const state = fixture('qa-snow-coin.json');
    expect(state.config).toMatchObject({ mapId: 'lake', mode: 'pve', seed: 53 });
    expect(state.players.map(player => player.ai)).toEqual([false, true]);
    expect(state).toMatchObject({ day: 23, phase: 'ready', pending: null, weatherId: 'snow', currentPlayerIndex: 0 });
    expect([state.players[0].stamina, state.players[0].mood]).toEqual([80, 80]);
    const rolled = act(state, { type: 'roll' });
    expect(rolled).not.toBe(state);
    expect(rolled.movement).toMatchObject({ roll: 1, path: [30, 31, 32] });
    expect(rolled.movement?.segments?.map(segment => segment.kind)).toEqual(['normal', 'weather']);
    expect(MAPS.lake.nodes[rolled.players[0].position].kind).toBe('coin');
    expect(rolled.phase).toBe('end');
  });

  it.each(['coast', 'valley'] as MapId[])('loads the %s ready map fixture', mapId => {
    const state = fixture(`qa-${mapId}.json`);
    expect(state.config).toMatchObject({ mapId, mode: 'pve' });
    expect(state.players.map(player => player.ai)).toEqual([false, true]);
    expect(state).toMatchObject({ phase: 'ready', pending: null, currentPlayerIndex: 0 });
    expect(state.players[0].position).toBe(0);
  });

  it('loads a real exchange prompt with funded stock holdings', () => {
    const state = fixture('qa-exchange.json');
    const player = state.players[state.currentPlayerIndex];
    expect(state.config.mode).toBe('pve');
    expect(player.ai).toBe(false);
    expect(state.phase).toBe('decision');
    expect(state.pending?.kind).toBe('exchange');
    expect(state.pending?.choices.some(choice => choice.id === 'leave')).toBe(true);
    expect(state.pending?.data?.traded).not.toBe(true);
    expect(MAPS[state.config.mapId].nodes[player.position].kind).toBe('exchange');
    expect(player.position).toBe(33);
    expect(player.cash).toBe(100_000);
    expect(player.holdings.aurora).toBe(20);
    expect(act(state, { type: 'stockTrade', stockId: 'aurora', quantity: -1 })).not.toBe(state);
  });

  it('loads the four-colour ownership showcase with usable weather control', () => {
    const state = fixture('qa-ownership.json');
    expect(state.config).toMatchObject({ mapId: 'lake', mode: 'pve' });
    expect(state.players.map(player => player.ai)).toEqual([false, true, true, true]);
    expect(new Set(state.players.map(player => player.color)).size).toBe(4);
    expect(state).toMatchObject({ phase: 'ready', pending: null, weatherId: 'rain' });
    expect(state.properties[46]).toMatchObject({ ownerId: 'p1', level: 4 });
    expect(state.properties[60]).toMatchObject({ ownerId: 'p2', level: 2, mortgaged: true });
    expect([0, 1, 2, 3, 4].every(level => Object.values(state.properties).some(property => property.level === level))).toBe(true);
    expect([1, 31, 44].every(id => state.properties[id] && ['power', 'water', 'telecom'].includes(MAPS.lake.nodes[id].kind))).toBe(true);
    expect([6, 27, 59].every(id => !state.properties[id] && ['power', 'water', 'telecom'].includes(MAPS.lake.nodes[id].kind))).toBe(true);
    expect(canUseItem(state, 'p1', 'qa-weather-controller')).toBe(true);
  });
});

describe('fully developed square lots directly beside their own roads', () => {
  for (const map of Object.values(MAPS)) {
    it(`${map.id} fits every parcel at once without lot or road overlap`, () => {
      const layout = getLotLayout(map);
      const lots = Object.entries(layout);
      expect(lots).toHaveLength(map.nodes.filter(hasLot).length);
      const collisions: string[] = [];
      for (let i = 0; i < lots.length; i++) {
        const [id, a] = lots[i];
        const node = map.nodes[Number(id)];
        const size = map.id === 'lake' && [65, 66, 67, 83, 85].includes(node.id) ? 44 : 46;
        const dx = Math.abs(a.x - node.x), dy = Math.abs(a.y - node.y);
        const roadsideOffset = 20 + size / 2;
        expect(a.size, `${map.id} lot ${id} size`).toBe(size);
        expect(a.bounds.right - a.bounds.left).toBeCloseTo(size);
        expect(a.bounds.bottom - a.bounds.top).toBeCloseTo(size);
        expect(Math.hypot(dx, dy), `${map.id} lot ${id} is too far from its node`).toBeLessThanOrEqual(76);
        expect(dx >= roadsideOffset + 1 && dx <= roadsideOffset + 3
          || dy >= roadsideOffset + 1 && dy <= roadsideOffset + 3,
        `${map.id} lot ${id} misses its road edge`).toBe(true);
        expect(dx <= 12 || dy <= 12 || (dx >= roadsideOffset + 1 && dx <= roadsideOffset + 3
          && dy >= roadsideOffset + 1 && dy <= roadsideOffset + 3),
        `${map.id} lot ${id} has an invalid along-road offset`).toBe(true);
        for (let j = i + 1; j < lots.length; j++) {
          const [otherId, b] = lots[j];
          if (overlap(a.bounds, b.bounds) > 0) collisions.push(`lots ${id}/${otherId}`);
        }
        for (const node of map.nodes) for (const nextId of node.neighbors) {
          if (nextId <= node.id) continue;
          const next = map.nodes[nextId];
          const road = {
            left: Math.min(node.x, next.x) - 20,
            right: Math.max(node.x, next.x) + 20,
            top: Math.min(node.y, next.y) - 20,
            bottom: Math.max(node.y, next.y) + 20,
          };
          if (overlap(a.bounds, road) > 0) collisions.push(`lot ${id}/road ${node.id}-${nextId}`);
        }
      }
      expect(collisions).toEqual([]);
    });
  }
});

describe('station callouts at normal zoom', () => {
  it.each([[374, 500], [807, 913], [1280, 720]])('keeps every map readable inside a %i × %i board', (width, height) => {
    for (const map of Object.values(MAPS)) {
      const view = map.id === 'valley' ? { x: -90, y: -125, width: 1680, height: 1240 }
        : { x: 40, y: 15, width: 1420, height: 950 };
      const scale = Math.min(width / view.width, height / view.height);
      const letterboxX = (width - view.width * scale) / 2;
      const letterboxY = (height - view.height * scale) / 2;
      const anchors = map.nodes.filter(node => node.kind === 'station').map(node => ({
        id: node.id,
        x: letterboxX + (node.x - view.x) * scale,
        y: letterboxY + (node.y - view.y) * scale,
      }));
      const markers = layoutStationMarkers(anchors, width, height);
      expect(markers).toHaveLength(anchors.length);
      for (const [index, marker] of markers.entries()) {
        const bounds = { left: marker.x - marker.width / 2, right: marker.x + marker.width / 2,
          top: marker.y - marker.height / 2, bottom: marker.y + marker.height / 2 };
        expect(bounds.left, `${map.id} station ${marker.id} left`).toBeGreaterThanOrEqual(0);
        expect(bounds.top, `${map.id} station ${marker.id} top`).toBeGreaterThanOrEqual(0);
        expect(bounds.right, `${map.id} station ${marker.id} right`).toBeLessThanOrEqual(width);
        expect(bounds.bottom, `${map.id} station ${marker.id} bottom`).toBeLessThanOrEqual(height);
        for (const other of markers.slice(index + 1)) {
          const otherBounds = { left: other.x - other.width / 2, right: other.x + other.width / 2,
            top: other.y - other.height / 2, bottom: other.y + other.height / 2 };
          expect(overlap(bounds, otherBounds), `${map.id} ${width}×${height} station ${marker.id}/${other.id}`).toBe(0);
        }
      }
    }
  });

  it('keeps mountain station selections distinct in a 320 × 568 board', () => {
    const map = MAPS.sundered;
    const width = 320, height = 568;
    const view = { x: 40, y: 15, width: 1420, height: 950 };
    const scale = Math.min(width / view.width, height / view.height);
    const letterboxX = (width - view.width * scale) / 2;
    const letterboxY = (height - view.height * scale) / 2;
    const anchors = map.nodes.filter(node => node.kind === 'station').map(node => ({
      id: node.id,
      x: letterboxX + (node.x - view.x) * scale,
      y: letterboxY + (node.y - view.y) * scale,
    }));
    const markers = layoutStationMarkers(anchors, width, height);
    expect(markers).toHaveLength(anchors.length);
    for (const [index, marker] of markers.entries()) {
      const bounds = { left: marker.x - marker.width / 2, right: marker.x + marker.width / 2,
        top: marker.y - marker.height / 2, bottom: marker.y + marker.height / 2 };
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(width);
      expect(bounds.bottom).toBeLessThanOrEqual(height);
      for (const other of markers.slice(index + 1)) {
        const otherBounds = { left: other.x - other.width / 2, right: other.x + other.width / 2,
          top: other.y - other.height / 2, bottom: other.y + other.height / 2 };
        expect(overlap(bounds, otherBounds), `stations ${marker.id}/${other.id}`).toBe(0);
      }
    }
  });

  it('keeps all five mountain station buttons clear of the top-right controls on a compact board', () => {
    const width = 304, height = 330;
    const view = { x: 40, y: 15, width: 1420, height: 950 };
    const scale = Math.min(width / view.width, height / view.height);
    const letterboxY = (height - view.height * scale) / 2;
    const anchors = MAPS.sundered.nodes.filter(node => node.kind === 'station').map(node => ({
      id: node.id,
      x: (node.x - view.x) * scale,
      y: letterboxY + (node.y - view.y) * scale,
    }));
    const controls = { left: 235, top: 0, right: width, bottom: 104 };
    const markers = layoutStationMarkers(anchors, width, height, [controls]);
    expect(markers).toHaveLength(5);
    for (const [index, marker] of markers.entries()) {
      const bounds = { left: marker.x - marker.width / 2, right: marker.x + marker.width / 2,
        top: marker.y - marker.height / 2, bottom: marker.y + marker.height / 2 };
      expect(bounds.left).toBeGreaterThanOrEqual(0);
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.right).toBeLessThanOrEqual(width);
      expect(bounds.bottom).toBeLessThanOrEqual(height);
      expect(overlap(bounds, controls), `station ${marker.id} covers the controls`).toBe(0);
      for (const other of markers.slice(index + 1)) {
        const otherBounds = { left: other.x - other.width / 2, right: other.x + other.width / 2,
          top: other.y - other.height / 2, bottom: other.y + other.height / 2 };
        expect(overlap(bounds, otherBounds), `stations ${marker.id}/${other.id} overlap`).toBe(0);
      }
    }
  });

  it.each([[320, 568], [374, 500]])('keeps the mountain stations within a %i × %i board after zooming', (width, height) => {
    const map = MAPS.sundered;
    const view = { x: 40, y: 15, width: 1420, height: 950 };
    const scale = Math.min(width / view.width, height / view.height);
    const letterboxX = (width - view.width * scale) / 2;
    const letterboxY = (height - view.height * scale) / 2;
    const zoom = 1.8;
    const anchors = map.nodes.filter(node => node.kind === 'station').map(node => ({
      id: node.id,
      x: letterboxX + (((node.x - 750) * zoom + 750) - view.x) * scale,
      y: letterboxY + (((node.y - 500) * zoom + 500) - view.y) * scale,
    }));
    const markers = layoutStationMarkers(anchors, width, height);
    expect(markers).toHaveLength(anchors.length);
    for (const marker of markers) {
      expect(marker.x - marker.width / 2, `station ${marker.id} left`).toBeGreaterThanOrEqual(0);
      expect(marker.x + marker.width / 2, `station ${marker.id} right`).toBeLessThanOrEqual(width);
      expect(marker.y - marker.height / 2, `station ${marker.id} top`).toBeGreaterThanOrEqual(0);
      expect(marker.y + marker.height / 2, `station ${marker.id} bottom`).toBeLessThanOrEqual(height);
    }
  });
});

type ExpectedEffect = { cash?: number; stamina?: number; mood?: number; item?: string; confinement?: 'parking' | 'prison' };
const newChoiceEffects: Record<string, Record<string, ExpectedEffect>> = {
  aurora_film: { fee: { cash: 650 }, screening: { mood: 18 } },
  orchard: { harvest: { stamina: -8, item: 'feast' }, taste: { stamina: 12 } },
  courier: { return: { stamina: -6, item: 'rent' }, call: { mood: 6 } },
  signal_fee: { pay: { cash: -350 }, work: { stamina: -6, mood: -5 } },
  sinkhole: { service: { cash: -500 }, detour: { stamina: -12 } },
  drone: { dry: { cash: -300, item: 'dry' }, carry: { stamina: -10, item: 'dice8' } },
  leasebook: { sort: { mood: -10, item: 'rent' }, transfer: { cash: 250 } },
  noise: { hotel: { cash: -400, mood: 8 }, endure: { mood: -14 } },
  pollination: { help: { stamina: -12, item: 'luck' }, notes: { cash: 200 } },
  survey: { permit: { cash: -650, item: 'demolish' }, record: { cash: 300 } },
  seminar: { enroll: { cash: -550, item: 'shield' }, listen: { mood: 10 } },
  baggage: { bag: { cash: -950, item: 'bag' }, carry: { stamina: -8 } },
  tide_lock: { detour: { cash: -300 }, wait: { confinement: 'parking' } },
  comet_watch: { watch: { stamina: -4, mood: 22 } },
  counterfeit: { pay: { cash: -600 }, detain: { confinement: 'prison' } },
  solar_grant: { grant: { cash: 1100 }, device: { cash: -1800, item: 'weather' } },
  beacon_lab: { assist: { stamina: -8, item: 'controller' }, observe: { mood: 6 } },
  route_workshop: { buy: { cash: -900, item: 'controller' }, sort: { stamina: -4, cash: 250 }, leave: {} },
};

function inventoryCount(state: GameState, itemId: string) {
  return state.players[0].inventory.filter(slot => slot.itemId === itemId).reduce((sum, slot) => sum + slot.quantity, 0);
}

describe('new event choice execution', () => {
  it('settles all 18 new events according to their visible resource descriptions', () => {
    expect(EVENTS.slice(28).map(event => event.id)).toEqual(Object.keys(newChoiceEffects));
    for (const event of EVENTS.slice(28)) {
      expect(event.choices.map(choice => choice.id)).toEqual(Object.keys(newChoiceEffects[event.id]).map(id => `${event.id}_${id}`));
      for (const choice of event.choices) {
        const effect = newChoiceEffects[event.id][choice.id.slice(event.id.length + 1)];
        expect(effect, choice.id).toBeDefined();
        const state = createGame({ mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 401,
          players: [{ name: '验收玩家', color: '#e18469', shape: 'diamond', ai: false, personality: 'balanced' },
            { name: '林岚', color: '#4caac2', shape: 'circle', ai: true, personality: 'cautious' }] });
        const player = state.players[0];
        player.cash = 100_000;
        player.stamina = 50;
        player.mood = 50;
        state.phase = 'decision';
        state.pending = { kind: 'event', title: event.title, body: event.story,
          choices: event.choices.map(option => ({ id: option.id, label: option.label, description: option.description })),
          data: { eventId: event.id } };
        const beforeItem = effect.item ? inventoryCount(state, effect.item) : 0;
        if (effect.item) {
          expect(ITEMS[effect.item], choice.id).toBeDefined();
          expect(choice.description, choice.id).toContain(ITEMS[effect.item].name);
        }
        for (const key of ['cash', 'stamina', 'mood'] as const) {
          const value = effect[key];
          if (value) expect(choice.description, `${choice.id} ${key}`).toContain(String(Math.abs(value)));
        }
        if (effect.confinement) expect(choice.description).toContain('3');
        const next = act(state, { type: 'choose', choiceId: choice.id });
        expect(next, choice.id).not.toBe(state);
        expect(next.players[0].cash - player.cash, `${choice.id} cash`).toBe(effect.cash ?? 0);
        expect(next.players[0].stamina - player.stamina, `${choice.id} stamina`).toBe(effect.stamina ?? 0);
        expect(next.players[0].mood - player.mood, `${choice.id} mood`).toBe(effect.mood ?? 0);
        if (effect.item) expect(inventoryCount(next, effect.item) - beforeItem, `${choice.id} item`).toBe(1);
        if (effect.confinement) expect(next.players[0].confinement).toEqual({ kind: effect.confinement, remaining: 3 });
        expect(next.pending, choice.id).toBeNull();
      }
    }
  });
});
