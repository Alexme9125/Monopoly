import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AI_PRESETS, ITEMS, WEATHERS } from '../src/game/data';
import { createGame, getAcquisitionPrice } from '../src/game/engine';
import { HOSTILE_ITEM_MOOD_LOSS } from '../src/game/economy';
import { MAPS } from '../src/game/maps';
import type { GameState } from '../src/game/types';
import InventoryPanel from '../src/components/InventoryPanel';
import { MapItemTargetPanel, PlayerTargetPicker, WeatherTargetPicker } from '../src/components/ItemTargetPicker';

function readyGame(): GameState {
  return createGame({ mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 37,
    players: [{ ...AI_PRESETS[0], name: '旅行家', ai: false }, AI_PRESETS[1], AI_PRESETS[2], AI_PRESETS[3]] });
}

describe('inventory targeting views', () => {
  it('shows only public player identity and location in the replacement picker', () => {
    const state = readyGame();
    state.players[0].inventory.push({ uid: 'tax-ui', itemId: 'tax', quantity: 1, wet: false });
    state.players[1].position = 13;
    const html = renderToStaticMarkup(<PlayerTargetPicker state={state} player={state.players[0]} itemUid="tax-ui" itemName={ITEMS.tax.name}
      disabled={false} onBack={() => {}} onConfirm={() => {}} />);
    expect(html.match(/class="player-target-card/g)).toHaveLength(3);
    expect(html).toContain(state.players[1].name);
    expect(html).toContain(MAPS.lake.nodes[13].name);
    expect(html).not.toContain('PM$');
    expect(html).toContain('返回背包');
    expect(html).toContain('确认使用');
    expect(html).toContain(`受害人心情 −${HOSTILE_ITEM_MOOD_LOSS}`);
  });

  it('keeps disaster weather visible but unavailable before day 22', () => {
    const state = readyGame();
    state.players[0].inventory.push({ uid: 'weather-ui', itemId: 'weather', quantity: 1, wet: false });
    const html = renderToStaticMarkup(<WeatherTargetPicker state={state} player={state.players[0]} itemUid="weather-ui" itemName={ITEMS.weather.name}
      disabled={false} onBack={() => {}} onConfirm={() => {}} />);
    const cards = html.match(/<button[^>]*weather-target-card[^>]*>[\s\S]*?<\/button>/g) ?? [];
    const disaster = cards.find(card => card.includes(WEATHERS.acid.name));
    const ordinary = cards.find(card => card.includes(WEATHERS.clear.name));
    expect(disaster).toContain('disabled=""');
    expect(disaster).toContain('第 22 天开放');
    expect(ordinary).not.toContain('disabled=""');
    expect(html).toContain('返回背包');
  });

  it('quotes the engine price before confirming acquisition and preserves a cancel path with no targets', () => {
    const state = readyGame();
    const land = MAPS.lake.nodes.find(node => node.kind === 'land')!;
    state.properties[land.id] = { ownerId: state.players[1].id, level: 2, mortgaged: false };
    state.players[0].inventory.push({ uid: 'acquire-ui', itemId: 'acquire', quantity: 1, wet: false });
    const html = renderToStaticMarkup(<MapItemTargetPanel state={state} map={MAPS.lake} player={state.players[0]} itemUid="acquire-ui"
      selectedNodeId={land.id} eligibleCount={1} disabled={false} onCancel={() => {}} onConfirm={() => {}} />);
    const price = getAcquisitionPrice(state, land.id)!;
    expect(html).toContain(land.name);
    expect(html).toContain(`PM$ ${price.toLocaleString('zh-CN')}`);
    expect(html).toContain('取消 · 返回背包');
    expect(html).toContain('使用');
    expect(html).toContain(`原主人心情 −${HOSTILE_ITEM_MOOD_LOSS}`);
    const empty = renderToStaticMarkup(<MapItemTargetPanel state={state} map={MAPS.lake} player={state.players[0]} itemUid="acquire-ui"
      selectedNodeId={null} eligibleCount={0} disabled={false} onCancel={() => {}} onConfirm={() => {}} />);
    expect(empty).toContain('当前没有合法目标');
    expect(empty).toContain('取消 · 返回背包');
  });

  it('shows the twin and teleport equipment marks and explains the controlled-roll conflict', () => {
    const state = readyGame();
    state.players[0].inventory.push({ uid: 'twin-ui', itemId: 'twinDish', quantity: 1, wet: false });
    state.players[0].inventory.push({ uid: 'stone-ui', itemId: 'teleportStone', quantity: 1, wet: false });
    state.controlledRoll = 4;
    const html = renderToStaticMarkup(<InventoryPanel state={state} player={state.players[0]} onAction={() => {}} onSelectMapTarget={() => {}} />);
    expect(html).toContain('equipment-twin');
    expect(html).toContain('equipment-stone');
    expect(html).toContain('已指定点数，本回合不能启用双骰');
  });
});
