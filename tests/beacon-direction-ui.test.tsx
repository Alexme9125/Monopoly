import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Board from '../src/visual/Board';
import { AI_PRESETS } from '../src/game/data';
import { createGame } from '../src/game/engine';
import { MAPS } from '../src/game/maps';

function game() {
  return createGame({ mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 35,
    players: [{ ...AI_PRESETS[0], name: '旅行家', ai: false }, AI_PRESETS[1]] });
}

describe('beacon direction affordance', () => {
  it('makes every living beacon independently focusable in the idle board', () => {
    const state = game();
    state.players[1].position = state.players[0].position;
    const html = renderToStaticMarkup(<Board map={MAPS.lake} state={state} playing={false} />);
    const beacons = [...html.matchAll(/<g data-player-id="[^"]+"[^>]*>/g)].map(match => match[0]);
    expect(beacons).toHaveLength(2);
    for (const beacon of beacons) {
      expect(beacon).toContain('role="button"');
      expect(beacon).toContain('tabindex="0"');
      expect(beacon).toContain('查看下次前进方向');
    }
    expect(html.match(/class="beacon-hit-area"/g)).toHaveLength(2);
  });

  it('removes beacon hit targets during item selection', () => {
    const state = game();
    const html = renderToStaticMarkup(<Board map={MAPS.lake} state={state} playing={false}
      itemSelection={{ itemName: '传送石', nodeIds: [1] }} />);
    const beacons = [...html.matchAll(/<g data-player-id="[^"]+"[^>]*>/g)].map(match => match[0]);
    expect(beacons).toHaveLength(2);
    for (const beacon of beacons) expect(beacon).not.toContain('role="button"');
    expect(html).not.toContain('class="beacon-hit-area"');
  });
});
