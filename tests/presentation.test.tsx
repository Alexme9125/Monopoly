import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameState, MapData, Movement } from '../src/game/types';
import { getMovementTimeline } from '../src/game/presentation';
import { TurnMoment, travelPoint, type TurnMomentState } from '../src/visual/TurnPresentation';
import Board from '../src/visual/Board';

const state = { players: [{ id: 'p1', name: '玩家', ai: false, color: '#558f9e' }] } as GameState;
const moment = (movement: Movement, stage: TurnMomentState['stage'], tick = 0): TurnMomentState => ({
  movement, point: { x: 0, y: 0 }, stage, tick, tickSecondary: Math.floor((tick * 80 + 210) / 113),
});

describe('movement presentation', () => {
  it('holds two dice long enough to read before weather adjustment and movement', () => {
    const movement: Movement = { id: 1, playerId: 'p1', path: [0, 1], roll: 8, rolls: [3, 5], face: 6,
      modifier: -2, dice: true, segments: [{ kind: 'normal', path: [0, 1] }] };
    const stages = getMovementTimeline(movement).stages;
    expect(stages.map(stage => stage.kind)).toEqual(['roll', 'result', 'adjust', 'adjusted', 'move', 'effect']);
    expect(stages[1]).toMatchObject({ start: 650, end: 1850, label: '8' });
    expect(stages[2]).toMatchObject({ start: 1850, end: 2550, label: '8 − 2 = 6' });
    expect(stages[4]).toMatchObject({ start: 3200, path: [0, 1] });
    const result = renderToStaticMarkup(<TurnMoment moment={moment(movement, 'result')} state={state}/>);
    expect(result).toContain('class="dice-pair"');
    expect(result).toContain('3 + 5 = ');
    expect(result).toContain('class="dice-total">8</strong> 点');
    const adjusting = renderToStaticMarkup(<TurnMoment moment={moment(movement, 'adjust')} state={state}/>);
    expect(adjusting).toContain('dice-adjust-cube from-pair');
    expect(adjusting).not.toContain('class="dice-pair"');
  });

  it('keeps the single-die timing and displays D100 faces numerically', () => {
    const single: Movement = { id: 2, playerId: 'p1', path: [0, 1], roll: 4, modifier: 0, face: 6, dice: true };
    const stages = getMovementTimeline(single).stages;
    expect(stages.slice(0, 2).map(stage => [stage.kind, stage.start, stage.end]))
      .toEqual([['roll', 0, 650], ['result', 650, 1550]]);
    const result = renderToStaticMarkup(<TurnMoment moment={moment(single, 'result')} state={state}/>);
    expect(result).not.toContain('class="dice-pair"');
    expect(result).toContain('原始 4 点');
    const hundred: Movement = { ...single, id: 3, roll: 101, rolls: [1, 100], face: 100 };
    const rolling = renderToStaticMarkup(<TurnMoment moment={moment(hundred, 'roll', 99)} state={state}/>);
    expect(rolling).toMatch(/<text[^>]*>100<\/text>/);
    expect(rolling).toMatch(/<text[^>]*>72<\/text>/);
  });

  it('keeps teleport transfers as one short no-dice stage before landing effects', () => {
    const transfer: Movement = { id: 4, playerId: 'p1', path: [12, 88], roll: 0, modifier: 0, dice: false,
      segments: [{ kind: 'transfer', path: [12, 88], label: '传送石抵达高脊' }] };
    const timeline = getMovementTimeline(transfer);
    expect(timeline.stages.map(stage => stage.kind)).toEqual(['move', 'effect']);
    expect(timeline.stages[0]).toMatchObject({ segmentKind: 'transfer', travelDuration: 420, label: '传送石抵达高脊' });
    expect(timeline.duration).toBe(1320);
    const from = { x: 180, y: 560 }, to = { x: 1320, y: 140 };
    expect(travelPoint(from, to, 209, 420, true, false)).toEqual(from);
    expect(travelPoint(from, to, 210, 420, true, false)).toEqual(to);
    expect(travelPoint(from, to, 210, 420, true, true)).toEqual(to);
    expect(travelPoint(from, to, 210, 420, false, false)).not.toEqual(from);
    expect(travelPoint(from, to, 210, 420, false, false)).not.toEqual(to);
  });

  it('exposes only legal item targets as keyboard-operable map nodes', () => {
    const map: MapData = { id: 'lake', name: '测试地图', subtitle: '', description: '', accent: '#558f9e', width: 1500, height: 1000,
      nodes: [
        { id: 0, x: 220, y: 150, name: '起点', kind: 'start', neighbors: [1] },
        { id: 1, x: 288, y: 150, name: '目标地块', kind: 'land', price: 1000, neighbors: [0] },
      ] };
    const html = renderToStaticMarkup(<Board map={map} onSelectNode={() => {}}
      itemSelection={{ itemName: '传送石', nodeIds: [1], selectedNodeId: 1 }}/>);
    const origin = html.match(/<g data-node-id="0"[^>]*>/)?.[0];
    const target = html.match(/<g data-node-id="1"[^>]*>/)?.[0];
    expect(origin).toBeDefined();
    expect(origin).not.toContain('role="button"');
    expect(target).toContain('item-target-node');
    expect(target).toContain('role="button"');
    expect(target).toContain('tabindex="0"');
    expect(html).toContain('传送石 · 已选目标');
    expect(html).toContain('class="item-target-outline"');
  });
});
