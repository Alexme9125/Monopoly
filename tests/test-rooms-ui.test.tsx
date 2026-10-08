import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { GameView, RoomLobby } from '../src/App';
import { JourneyLengthControl } from '../src/components/SetupControls';
import { createGame } from '../src/game/engine';
import { TEST_ROOMS } from '../src/game/testRooms';
import type { GameConfig } from '../src/game/types';
import type { RoomSnapshot } from '../src/game/network';

const member = { seatId: 'seat', name: '玩家', color: '#D55B48', shape: 'circle' as const,
  ai: false, personality: 'balanced' as const, ready: true, connected: true, host: true };
const config: RoomSnapshot['config'] = { mapId: 'lake', seasons: 0, weatherMode: 'challenge', seed: 19,
  rentLevel: 'standard', propertyTrading: true };
function lobby(kind: 'weather' | 'building'): RoomSnapshot {
  return { code: TEST_ROOMS[kind].code, testRoom: kind, members: [member], config, started: false, state: null,
    youSeatId: 'seat', youPlayerId: null, isHost: true };
}
const noOp = () => {};

it('renders fixed-code test rooms as one-person rooms with their own supplies and start action', () => {
  for (const kind of ['weather', 'building'] as const) {
    const html = renderToStaticMarkup(<RoomLobby room={lobby(kind)} connected profileError="" onReady={noOp}
      onProfile={noOp} onConfig={noOp} onAddBot={noOp} onRemove={noOp} onStart={noOp} onLeave={noOp} />);
    expect(html).toContain(`data-test-room="${kind}"`);
    expect(html).toContain(TEST_ROOMS[kind].name);
    expect(html).toContain(TEST_ROOMS[kind].code);
    expect(html).toContain('单人席位 · 1/1');
    expect(html).toContain('背包 99 格');
    expect(html).toContain('开始测试');
    expect(html).toContain('持续测试');
    expect(html).toContain('不限天数 · 每次结束回合进入下一天');
    expect(html).not.toContain('破产决胜');
    expect(html).not.toContain('房间统一分配信标颜色');
    expect(html).not.toContain('补一位代理人');
    expect(html).not.toContain('需要至少 2 位旅伴');
  }
});

it('keeps multiplayer staging and marks a started test game in the map header', () => {
  const regular = { ...lobby('weather'), code: 'ABC234', testRoom: undefined };
  const regularHtml = renderToStaticMarkup(<RoomLobby room={regular} connected profileError="" onReady={noOp}
    onProfile={noOp} onConfig={noOp} onAddBot={noOp} onRemove={noOp} onStart={noOp} onLeave={noOp} />);
  expect(regularHtml).toContain('补一位代理人');
  expect(regularHtml).toContain('需要至少 2 位旅伴');
  expect(renderToStaticMarkup(<JourneyLengthControl value={0} onChange={noOp} />)).toContain('破产决胜');
  const gameConfig: GameConfig = { ...config, mode: 'pvp', testRoom: 'weather', players: [member] };
  const state = createGame(gameConfig);
  const gameHtml = renderToStaticMarkup(<GameView state={state} viewerId={state.players[0].id} isOnline connected busy={false}
    playingMovement={false} onMovementComplete={noOp} onAction={noOp} onLeave={noOp} onGuide={noOp} onImport={noOp} />);
  expect(gameHtml).toContain('class="game-location is-test-room"');
  expect(gameHtml).toContain('class="test-room-badge" data-test-room="weather"');
  expect(gameHtml).toContain('天气测试房');
});
