import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import Board from '../src/visual/Board';
import { placeBeaconName } from '../src/visual/beaconNameLabel';
import { getLotLayout } from '../src/visual/sceneLayout';

const frame = { left: 40, top: 15, right: 1460, bottom: 965 };

describe('active beacon name placement', () => {
  it('moves the Hushed Valley #4 name below its fifth-floor landmark without changing the capsule size', () => {
    const map = MAPS.hushedValley, node = map.nodes[4];
    const parcels = Object.values(getLotLayout(map)).map(lot => lot.bounds);
    const label = placeBeaconName(node, 32, parcels, frame);
    expect(label.side).toBe('below');
    const lot = getLotLayout(map)[node.id].bounds;
    expect(label.bounds.top).toBeGreaterThan(lot.bottom);
    expect(label.bounds.right - label.bounds.left).toBe(64);
    expect(label.bounds.bottom - label.bounds.top).toBe(20);

    const state = createGame({ mapId: 'hushedValley', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 2309,
      players: [{ name: '验收玩家', color: '#D55B48', shape: 'diamond', ai: false, personality: 'balanced' },
        { name: '同伴', color: '#277DA8', shape: 'circle', ai: true, personality: 'balanced' }] });
    state.players[0].position = node.id;
    state.properties[node.id] = { ownerId: 'p1', level: 5, mortgaged: false };
    const html = renderToStaticMarkup(<Board map={map} state={state} playing={false} />);
    expect(html).toContain('data-label-side="below"');
    expect(html).toContain('level-landmark-star');
  });

  it('keeps the original upper placement when it is clear and uses a side when both vertical choices are blocked', () => {
    const origin = { x: 500, y: 500 };
    expect(placeBeaconName(origin, 30, [], frame).side).toBe('above');
    const parcels = [
      { left: 465, right: 535, top: 440, bottom: 465 },
      { left: 465, right: 535, top: 520, bottom: 550 },
    ];
    expect(placeBeaconName(origin, 30, parcels, frame).side).toBe('right');
  });
});
