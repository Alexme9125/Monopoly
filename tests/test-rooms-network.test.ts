import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { expect, it } from 'vitest';
import { createRoomServer } from '../server/index';
import { TEST_ROOMS, TEST_ROOM_CAPACITY } from '../src/game/testRooms';

type Wire = { type: string; room?: any; message?: string };
class Client {
  readonly messages: Wire[] = [];
  private readonly events = new EventEmitter();
  private constructor(readonly socket: WebSocket, readonly id: string) {
    socket.on('message', raw => {
      const message = JSON.parse(raw.toString()) as Wire;
      this.messages.push(message);
      this.events.emit('message', message, this.messages.length - 1);
    });
  }
  static async connect(port: number, id: string = randomUUID()) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const client = new Client(socket, id);
    client.send({ type: 'hello', clientId: id });
    await client.wait(message => message.type === 'hello');
    return client;
  }
  send(message: unknown) { this.socket.send(JSON.stringify(message)); }
  wait(predicate: (message: Wire) => boolean, since = 0): Promise<Wire> {
    const found = this.messages.slice(since).find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.events.off('message', onMessage); reject(new Error('Timed out waiting for room message')); }, 5000);
      const onMessage = (message: Wire, index: number) => {
        if (index < since || !predicate(message)) return;
        clearTimeout(timer); this.events.off('message', onMessage); resolve(message);
      };
      this.events.on('message', onMessage);
    });
  }
  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    const done = new Promise<void>(resolve => this.socket.once('close', resolve));
    this.socket.close(); await done;
  }
}
const profile = (name: string) => ({ name, color: '#D55B48', shape: 'circle', personality: 'balanced' });
const regularConfig = { mapId: 'lake', seasons: 4, weatherMode: 'challenge', seed: 19 };

it('opens isolated personal rooms for both fixed codes with 99 real items and single-player turns', async () => {
  const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
  const clients: Client[] = [];
  try {
    for (const definition of Object.values(TEST_ROOMS)) {
      const client = await Client.connect(server.port); clients.push(client);
      let since = client.messages.length;
      client.send({ type: 'join', code: definition.code, profile: profile(definition.name) });
      let room = (await client.wait(message => message.type === 'room' && message.room.code === definition.code, since)).room;
      expect(room.testRoom).toBe(definition.kind);
      expect(room.members).toHaveLength(1);
      expect(room.isHost).toBe(true);
      expect(room.config).toMatchObject({ mapId: 'lake', weatherMode: 'challenge', seasons: 0, rentLevel: 'standard' });
      since = client.messages.length;
      client.send({ type: 'addBot', profile: { ...profile('电脑'), aiLevel: 'gentle' } });
      expect((await client.wait(message => message.type === 'error', since)).message).toContain('测试房不能增加电脑玩家');
      for (const weatherMode of ['standard', 'challenge', 'hardship']) {
        since = client.messages.length;
        client.send({ type: 'config', config: { ...room.config, mapId: 'forest', weatherMode } });
        room = (await client.wait(message => message.type === 'room' && message.room.config.mapId === 'forest' && message.room.config.weatherMode === weatherMode, since)).room;
        expect(room.config.weatherMode).toBe(weatherMode);
      }
      since = client.messages.length;
      client.send({ type: 'start' });
      room = (await client.wait(message => message.type === 'room' && message.room.started, since)).room;
      expect(room.state.config.testRoom).toBe(definition.kind);
      expect(room.state.config.mapId).toBe('forest');
      expect(room.state.players).toHaveLength(1);
      expect(room.state.players[0].capacity).toBe(TEST_ROOM_CAPACITY);
      expect(room.state.players[0].inventory).toHaveLength(TEST_ROOM_CAPACITY);
      expect(room.state.players[0].inventory.every((slot: any) => slot.itemId === definition.itemId && slot.quantity === 1 && !slot.wet)).toBe(true);
      expect(new Set(room.state.players[0].inventory.map((slot: any) => slot.uid)).size).toBe(TEST_ROOM_CAPACITY);
      since = client.messages.length;
      client.send({ type: 'action', action: { type: 'rest' } });
      room = (await client.wait(message => message.type === 'room' && message.room.state.phase === 'end', since)).room;
      since = client.messages.length;
      client.send({ type: 'action', action: { type: 'endTurn' } });
      room = (await client.wait(message => message.type === 'room' && message.room.state.day === 2, since)).room;
      expect(room.state.players).toHaveLength(1);
    }
    const first = clients[0], second = clients[1];
    const observer = await Client.connect(server.port); clients.push(observer);
    const since = observer.messages.length;
    observer.send({ type: 'join', code: TEST_ROOMS.weather.code, profile: profile('另一位') });
    const isolated = (await observer.wait(message => message.type === 'room', since)).room;
    expect(isolated.members).toHaveLength(1);
    expect(isolated.state).toBeNull();
    expect(isolated.testRoom).toBe('weather');
    expect(first.messages.at(-1)?.room?.state?.day).toBe(2);
    expect(second.messages.at(-1)?.room?.state?.day).toBe(2);
    const formerId = first.id;
    await first.close();
    const restoredClient = await Client.connect(server.port, formerId); clients.push(restoredClient);
    const reconnectSince = restoredClient.messages.length;
    restoredClient.send({ type: 'reconnect', code: TEST_ROOMS.weather.code });
    const restored = (await restoredClient.wait(message => message.type === 'room' && message.room.started, reconnectSince)).room;
    expect(restored.state.day).toBe(2);
    expect(restored.youPlayerId).toBe(restored.state.players[0].id);
    const leaveSince = restoredClient.messages.length;
    restoredClient.send({ type: 'leave' });
    await restoredClient.wait(message => message.type === 'left', leaveSince);
    const missingSince = restoredClient.messages.length;
    restoredClient.send({ type: 'reconnect', code: TEST_ROOMS.weather.code });
    expect((await restoredClient.wait(message => message.type === 'error', missingSince)).message).toContain('不存在');
    const restartSince = restoredClient.messages.length;
    restoredClient.send({ type: 'join', code: TEST_ROOMS.weather.code, profile: profile('重来') });
    const restarted = (await restoredClient.wait(message => message.type === 'room', restartSince)).room;
    expect(restarted.started).toBe(false);
    expect(restarted.state).toBeNull();
  } finally {
    await Promise.all(clients.map(client => client.close()));
    await server.close();
  }
}, 10_000);

it('keeps ordinary rooms multiplayer and rejects forged test-room configuration', async () => {
  const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
  const clients: Client[] = [];
  try {
    const host = await Client.connect(server.port); clients.push(host);
    let since = host.messages.length;
    host.send({ type: 'create', profile: profile('房主'), config: { ...regularConfig, testRoom: 'weather' } });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('设置无效');
    since = host.messages.length;
    host.send({ type: 'create', profile: profile('房主'), config: regularConfig });
    const room = (await host.wait(message => message.type === 'room', since)).room;
    expect(room.testRoom).toBeUndefined();
    since = host.messages.length;
    host.send({ type: 'start' });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('2–4');
    since = host.messages.length;
    host.send({ type: 'config', config: { ...room.config, testRoom: 'building' } });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('设置无效');
    const peer = await Client.connect(server.port); clients.push(peer);
    since = peer.messages.length;
    peer.send({ type: 'join', code: room.code, profile: profile('旅伴') });
    expect((await peer.wait(message => message.type === 'room' && message.room.members.length === 2, since)).room.testRoom).toBeUndefined();
    for (const name of ['第三位', '第四位']) {
      const extra = await Client.connect(server.port); clients.push(extra);
      since = extra.messages.length;
      extra.send({ type: 'join', code: room.code, profile: profile(name) });
      expect((await extra.wait(message => message.type === 'room' && message.room.members.length === clients.length, since)).room.members).toHaveLength(clients.length);
    }
    const fifth = await Client.connect(server.port); clients.push(fifth);
    since = fifth.messages.length;
    fifth.send({ type: 'join', code: room.code, profile: profile('第五位') });
    expect((await fifth.wait(message => message.type === 'error', since)).message).toContain('房间已满');
  } finally {
    await Promise.all(clients.map(client => client.close()));
    await server.close();
  }
}, 10_000);
