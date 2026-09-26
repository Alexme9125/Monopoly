import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import RentDecision from '../src/components/RentDecision';
import { AI_PRESETS, ITEMS } from '../src/game/data';
import { createGame } from '../src/game/engine';
import { RENT_MOOD_LOSS, HOSTILE_ITEM_MOOD_LOSS } from '../src/game/economy';
import { MAPS } from '../src/game/maps';
import type { Prompt } from '../src/game/types';

function renderRent(mood: number, cash: number, amount = 500) {
  const state = createGame({ mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 37,
    players: [{ ...AI_PRESETS[0], name: '旅行家', ai: false }, AI_PRESETS[1]] });
  const player = state.players[0];
  player.mood = mood;
  player.cash = cash;
  const node = MAPS.lake.nodes.find(entry => entry.kind === 'land')!;
  const prompt: Prompt = { kind: 'rent', title: '租金选择', body: '', data: { nodeId: node.id, ownerId: state.players[1].id, amount },
    choices: [{ id: 'use_card', label: '使用免租卡' }, { id: 'pay', label: '支付租金' }] };
  return renderToStaticMarkup(<RentDecision state={state} player={player} prompt={prompt} onChoose={() => {}} />);
}

describe('rent and hostile-item decision copy', () => {
  it('shows cash and mood after paying, and makes card relief explicit', () => {
    const html = renderRent(75, 600);
    expect(html).toContain('当前现金');
    expect(html).toContain('PM$ 600');
    expect(html).toContain('支付 PM$ 500 · 预计现金 PM$ 100');
    expect(html).toContain(`心情 −${RENT_MOOD_LOSS}，预计 ${75 - RENT_MOOD_LOSS}`);
    expect(html).toContain('免去本次付租的心情损失');
    expect(html).toContain('本次支付 0 · 剩余现金 PM$ 600');
  });

  it('caps the mood loss at the current mood and warns about sanatorium', () => {
    const html = renderRent(1, 299);
    expect(html).toContain('支付 PM$ 500 · 预计现金 PM$ -201');
    expect(html).toContain('心情 −1，预计 0');
    expect(html).toContain('心情耗尽，将前往疗养院');
    expect(html).toContain('现金缺口 PM$ 201');
    expect(renderRent(0, 600)).toContain('心情 −0，预计 0');
  });

  it('keeps every hostile-item description tied to the shared mood-loss value', () => {
    for (const itemId of ['bomb', 'unluck', 'tax', 'demolish', 'acquire']) {
      expect(ITEMS[itemId].description).toContain(`受害人心情 −${HOSTILE_ITEM_MOOD_LOSS}`);
      expect(ITEMS[itemId].description).toContain('星盾卡挡下则不损失心情');
    }
  });
});
