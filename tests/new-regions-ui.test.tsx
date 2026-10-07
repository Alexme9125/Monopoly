import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TileInfo } from '../src/App';
import FloorKey from '../src/components/FloorKey';
import { createGame, getTileRentPreview } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import { getLandPurchasePrice, getPropertyAssetValue } from '../src/game/propertyRules';
import { PropertyLevelIcon, propertyLevelName } from '../src/visual/PropertyLevel';
import Board from '../src/visual/Board';

const profile = { name: '旅人', color: '#D55B48', shape: 'circle' as const, ai: false, personality: 'balanced' as const };
const companion = { ...profile, name: '同行者', color: '#277DA8', shape: 'diamond' as const };
const money = (value: number) => `PM$ ${value.toLocaleString('zh-CN')}`;

describe('new-region property presentation', () => {
  it('shows four floors as an ordinary building and five as the Hushed Valley landmark', () => {
    const key = renderToStaticMarkup(<FloorKey maxLevel={5} />);
    expect(key).toContain('aria-label="楼层图例"');
    expect(propertyLevelName(4, 5)).toBe('4层建筑');
    expect(propertyLevelName(5, 5)).toBe('地标 · 5层');
    expect(renderToStaticMarkup(<PropertyLevelIcon level={4} maxLevel={5} />)).not.toContain('level-landmark-star');
    expect(renderToStaticMarkup(<PropertyLevelIcon level={5} maxLevel={5} />)).toContain('level-landmark-star');
  });

  it('quotes base price, existing bank-owned floors and full purchase price without charging rent before ownership', () => {
    const state = createGame({ mapId: 'grandCity', mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 2411, players: [profile, companion] });
    const node = MAPS.grandCity.nodes.find(candidate => candidate.kind === 'land' && (candidate.prefabLevel ?? 0) === 4)!;
    const fullPrice = getPropertyAssetValue(node, 4);
    expect(getLandPurchasePrice(state, node.id)).toBe(fullPrice);
    expect(getTileRentPreview(state, node.id, state.players[0].id).prospective).toBe(true);
    const html = renderToStaticMarkup(<TileInfo state={state} nodeId={node.id} viewerId={state.players[0].id} />);
    expect(html).toContain(`基础地价</small><strong>${money(node.price!)}`);
    expect(html).toContain('现有楼层 · 待售');
    expect(html).toContain(`整栋认购价</small><strong>${money(fullPrice)}`);
    expect(html).toContain('购入后预计租金');
    expect(html).toContain('认购前不收租');
    const board = renderToStaticMarkup(<Board map={MAPS.grandCity} state={state} preview />);
    expect(board).toContain('parcel-prefab');
    expect(board).toContain('data-available-level="4"');
    expect(board).toContain('data-floor-level="4"');
    expect(board).not.toContain('data-ownership="P1"');
  });
});
