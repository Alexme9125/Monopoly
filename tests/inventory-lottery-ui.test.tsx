import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import InventoryPanel from '../src/components/InventoryPanel';
import { AI_PRESETS } from '../src/game/data';
import { createGame } from '../src/game/engine';

function game() {
  return createGame({ mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 37,
    players: [{ ...AI_PRESETS[0], name: '旅行家', ai: false }, AI_PRESETS[1]] });
}

describe('inventory lottery result', () => {
  it('keeps the wallet and the latest own authoritative payout visible after the ticket is gone', () => {
    const state = game();
    const player = state.players[0];
    player.cash = 104_600;
    state.notices = [
      { id: 41, day: 3, kind: 'lottery', title: '星海奖券开奖', body: '历史中奖', tone: 'good', playerId: player.id, nodeId: 0, amount: 300 },
      { id: 44, day: 5, kind: 'lottery', title: '星海奖券开奖', body: '本人的最新中奖', tone: 'good', playerId: player.id, nodeId: 0, amount: 4_600 },
      { id: 45, day: 5, kind: 'lottery', title: '星海奖券开奖', body: '对手的中奖', tone: 'good', playerId: state.players[1].id, nodeId: 0, amount: 5_000 },
    ];
    const html = renderToStaticMarkup(<InventoryPanel state={state} player={player} onAction={() => {}} onSelectMapTarget={() => {}} />);
    expect(html).toContain('可用现金');
    expect(html).toContain('PM$ 104,600');
    expect(html).toContain('data-result-id="44"');
    expect(html).toContain('获得 PM$ 4,600');
    expect(html).toContain('第 5 天 · 奖金已到账 · 消耗 1 张');
    expect(html).not.toContain('获得 PM$ 5,000');
  });

  it('does not show another player’s result as this player’s own', () => {
    const state = game();
    state.notices = [{ id: 9, day: 2, kind: 'lottery', title: '星海奖券开奖', body: '对手中奖', tone: 'good',
      playerId: state.players[1].id, nodeId: 0, amount: 2_200 }];
    const html = renderToStaticMarkup(<InventoryPanel state={state} player={state.players[0]} onAction={() => {}} onSelectMapTarget={() => {}} />);
    expect(html).toContain('可用现金');
    expect(html).not.toContain('inventory-lottery-result');
  });
});
