import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { expect, it } from 'vitest';
import { createRoomServer } from '../server/index';

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

const hostProfile = { name: '房主', color: '#D55B48', shape: 'circle', personality: 'balanced' };
const guestProfile = { name: '访客', color: '#277DA8', shape: 'diamond', personality: 'cautious' };
const config = { mapId: 'lake', seasons: 4, weatherMode: 'hardship', seed: 28 };

it('validates hardship, broadcasts it through a started room, and preserves it on reconnect', async () => {
  const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
  const clients: Client[] = [];
  try {
    const host = await Client.connect(server.port); clients.push(host);
    const guest = await Client.connect(server.port); clients.push(guest);
    const probe = await Client.connect(server.port); clients.push(probe);
    for (const invalid of ['__proto__', 'extreme', null]) {
      const since = probe.messages.length;
      probe.send({ type: 'create', profile: hostProfile, config: { ...config, weatherMode: invalid } });
      expect((await probe.wait(message => message.type === 'error', since)).message).toContain('设置无效');
    }
    let since = host.messages.length;
    host.send({ type: 'create', profile: hostProfile, config });
    const created = await host.wait(message => message.type === 'room', since);
    const code = created.room.code;
    expect(created.room.config.weatherMode).toBe('hardship');
    since = guest.messages.length;
    guest.send({ type: 'join', code, profile: guestProfile });
    expect((await guest.wait(message => message.type === 'room' && message.room.members.length === 2, since)).room.config.weatherMode).toBe('hardship');
    for (const weatherMode of ['standard', 'challenge', 'hardship']) {
      const hostSince = host.messages.length, guestSince = guest.messages.length;
      host.send({ type: 'config', config: { ...config, weatherMode } });
      expect((await host.wait(message => message.type === 'room' && message.room.config.weatherMode === weatherMode, hostSince)).room.config.weatherMode).toBe(weatherMode);
      expect((await guest.wait(message => message.type === 'room' && message.room.config.weatherMode === weatherMode, guestSince)).room.config.weatherMode).toBe(weatherMode);
    }
    since = host.messages.length;
    guest.send({ type: 'ready', ready: true });
    await host.wait(message => message.type === 'room' && message.room.members[1].ready, since);
    const hostSince = host.messages.length, guestSince = guest.messages.length;
    host.send({ type: 'start' });
    expect((await host.wait(message => message.type === 'room' && message.room.started, hostSince)).room.state.config.weatherMode).toBe('hardship');
    expect((await guest.wait(message => message.type === 'room' && message.room.started, guestSince)).room.state.config.weatherMode).toBe('hardship');
    await guest.close();
    const rejoined = await Client.connect(server.port, guest.id); clients.push(rejoined);
    since = rejoined.messages.length;
    rejoined.send({ type: 'reconnect', code });
    expect((await rejoined.wait(message => message.type === 'room' && message.room.started, since)).room.state.config.weatherMode).toBe('hardship');
  } finally {
    await Promise.all(clients.map(client => client.close()));
    await server.close();
  }
}, 10_000);
