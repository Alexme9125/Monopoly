import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import { EVENTS } from '../src/game/data';
import { ROAMING_EVENTS } from '../src/game/roamingEvents';
import { GameView } from '../src/App';
import Board from '../src/visual/Board';
import { noticeToastPolicy } from '../src/components/ActivityNotifications';
import EventIdentity from '../src/components/EventIdentity';
import type { TurnEncounter } from '../src/game/types';

const config = { mapId: 'lake' as const, mode: 'pve' as const, seasons: 4, weatherMode: 'standard' as const, seed: 917,
  players: [{ name: '旅人甲', color: '#D55B48', shape: 'diamond' as const, ai: false, personality: 'balanced' as const },
    { name: '旅人乙', color: '#277DA8', shape: 'circle' as const, ai: true, personality: 'balanced' as const }] };

function resolvedEncounter(nodeId: number): TurnEncounter {
  return { id: 'event-920', playerId: 'p1', day: 1, nodeId, eventId: EVENTS[0].id,
    title: '节点上的故事', story: '先作一次选择。', tone: 'choice',
    choices: [{ id: 'yes', label: '带走礼物' }], selectedChoiceId: 'yes', result: '获得一件礼物。' };
}

describe('encounter presentation at a functional tile', () => {
  it('keeps the outcome in the next operation modal with current vitals', () => {
    const state = createGame(config);
    const land = MAPS.lake.nodes.find(node => node.kind === 'land')!;
    state.players[0].position = land.id;
    state.turnEncounters = [resolvedEncounter(land.id)];
    state.pending = { kind: 'land', title: land.name, body: '可以买下此地。', data: { nodeId: land.id },
      choices: [{ id: 'buy', label: '买入' }, { id: 'leave', label: '离开' }] };
    state.phase = 'decision';
    const html = renderToStaticMarkup(<GameView state={state} viewerId="p1" isOnline={false} connected busy={false} playingMovement={false}
      onMovementComplete={() => {}} onAction={() => {}} onLeave={() => {}} onGuide={() => {}} onImport={() => {}} />);
    expect(html).toContain('class="prompt-vitals"');
    expect(html).toContain('aria-label="刚才的不期而遇"');
    expect(html).toContain('刚才的不期而遇 · 节点上的故事');
    expect(html).toContain('已选择 · 带走礼物');
    expect(html).toContain('获得一件礼物。');
    expect(html).toContain('class="event-identity-roaming"');
  });

  it('puts temporary markers at the road node without covering the offset parcel', () => {
    const state = createGame(config);
    const land = MAPS.lake.nodes.find(node => node.kind === 'land')!;
    state.encounters = [land.id];
    state.weatherId = 'clear';
    const html = renderToStaticMarkup(<Board map={MAPS.lake} state={state} playing={false} />);
    expect(html.includes(`transform="translate(${land.x} ${land.y})" class="encounter-spark encounter-road-badge"`)).toBe(true);
    expect(html).toContain(`aria-label="#${land.id} 流动偶遇"`);
    state.weatherId = 'rain';
    const rainyHtml = renderToStaticMarkup(<Board map={MAPS.lake} state={state} playing={false} />);
    expect(rainyHtml.includes(`aria-label="#${land.id} 流动偶遇"`)).toBe(false);
  });

  it('pauses an active toast throughout movement and all obscuring operations', () => {
    expect(noticeToastPolicy(true, false, true)).toEqual({ canStart: false, hidden: true, ticking: false });
    expect(noticeToastPolicy(false, true, true)).toEqual({ canStart: false, hidden: true, ticking: false });
    expect(noticeToastPolicy(false, false, true)).toEqual({ canStart: false, hidden: false, ticking: true });
  });

  it('uses event metadata for roaming exclusivity and the prompt source before node-kind fallback', () => {
    const exclusive = ROAMING_EVENTS.find(event => event.mapId === 'lake')!;
    const identity = renderToStaticMarkup(<EventIdentity mapId="lake" eventId={exclusive.id} source="tile" />);
    expect(identity).toContain('流动偶遇专属');
    expect(identity).toContain('地区 DLC');

    const state = createGame(config);
    const fixedEvent = MAPS.lake.nodes.find(node => node.kind === 'event')!;
    state.players[0].position = fixedEvent.id;
    state.phase = 'decision';
    state.pending = { kind: 'event', title: '流动故事', body: '选择故事。',
      data: { eventId: EVENTS[0].id, eventSource: 'encounter', nodeId: fixedEvent.id },
      choices: [{ id: 'leave', label: '离开' }] };
    const html = renderToStaticMarkup(<GameView state={state} viewerId="p1" isOnline={false} connected busy={false} playingMovement={false}
      onMovementComplete={() => {}} onAction={() => {}} onLeave={() => {}} onGuide={() => {}} onImport={() => {}} />);
    expect(html).toContain('class="event-identity-roaming"');
  });
});
