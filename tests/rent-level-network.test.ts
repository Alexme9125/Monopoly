import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { expect, it } from 'vitest';
import { createRoomServer } from '../server/index';
import { getRent } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import type { RentLevel } from '../src/game/types';

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

  static async connect(port: number, id: string = randomUUID()): Promise<Client> {
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
      const timer = setTimeout(() => { this.events.off('message', onMessage); reject(new Error('Timed out waiting for server message')); }, 5000);
      const onMessage = (message: Wire, index: number) => {
        if (index < since || !predicate(message)) return;
        clearTimeout(timer);
        this.events.off('message', onMessage);
        resolve(message);
      };
      this.events.on('message', onMessage);
    });
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    const closed = new Promise<void>(resolve => this.socket.once('close', resolve));
    this.socket.close();
    await closed;
  }
}

const hostProfile = { name: '房主', color: '#D55B48', shape: 'circle', personality: 'balanced' };
const guestProfile = { name: '访客', color: '#277DA8', shape: 'diamond', personality: 'cautious' };
const initialConfig = { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed: 16 };

it('defaults, validates, broadcasts, and preserves rent level through reconnect and paid rent', async () => {
  const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
  const clients: Client[] = [];
  try {
    const host = await Client.connect(server.port); clients.push(host);
    const guest = await Client.connect(server.port); clients.push(guest);
    const probe = await Client.connect(server.port); clients.push(probe);

    for (const invalid of [null, 4, 'unknown']) {
      const since = probe.messages.length;
      probe.send({ type: 'create', profile: hostProfile, config: { ...initialConfig, rentLevel: invalid } });
      expect((await probe.wait(message => message.type === 'error', since)).message).toContain('设置无效');
    }

    let since = host.messages.length;
    host.send({ type: 'create', profile: hostProfile, config: initialConfig });
    const created = await host.wait(message => message.type === 'room', since);
    const code = created.room.code;
    expect(created.room.config.rentLevel).toBe('standard');

    since = guest.messages.length;
    guest.send({ type: 'join', code, profile: guestProfile });
    const joined = await guest.wait(message => message.type === 'room' && message.room.members.length === 2, since);
    expect(joined.room.config.rentLevel).toBe('standard');

    const base = created.room.config;
    for (const level of ['relaxed', 'standard', 'heavy'] as RentLevel[]) {
      const hostSince = host.messages.length, guestSince = guest.messages.length;
      host.send({ type: 'config', config: { ...base, rentLevel: level } });
      const hostUpdate = await host.wait(message => message.type === 'room' && message.room.config.rentLevel === level, hostSince);
      const guestUpdate = await guest.wait(message => message.type === 'room' && message.room.config.rentLevel === level, guestSince);
      expect(hostUpdate.room.config).toEqual(guestUpdate.room.config);
    }

    for (const invalid of [null, 4, 'unknown']) {
      since = host.messages.length;
      host.send({ type: 'config', config: { ...base, rentLevel: invalid } });
      expect((await host.wait(message => message.type === 'error', since)).message).toContain('设置无效');
    }
    since = guest.messages.length;
    guest.send({ type: 'config', config: { ...base, rentLevel: 'relaxed' } });
    expect((await guest.wait(message => message.type === 'error', since)).message).toContain('只有房主');

    since = host.messages.length;
    host.send({ type: 'config', config: base });
    expect((await host.wait(message => message.type === 'room' && message.room.config.rentLevel === 'standard', since)).room.config.rentLevel).toBe('standard');
    since = host.messages.length;
    host.send({ type: 'config', config: { ...base, rentLevel: 'heavy' } });
    await host.wait(message => message.type === 'room' && message.room.config.rentLevel === 'heavy', since);

    since = host.messages.length;
    guest.send({ type: 'ready', ready: true });
    await host.wait(message => message.type === 'room' && message.room.members[1].ready, since);
    const hostSince = host.messages.length, guestSince = guest.messages.length;
    host.send({ type: 'start' });
    const started = await host.wait(message => message.type === 'room' && message.room.started, hostSince);
    const guestStarted = await guest.wait(message => message.type === 'room' && message.room.started, guestSince);
    expect(started.room.config.rentLevel).toBe('heavy');
    expect(started.room.state.config.rentLevel).toBe('heavy');
    expect(guestStarted.room.state.config.rentLevel).toBe('heavy');

    since = host.messages.length;
    host.send({ type: 'config', config: { ...base, rentLevel: 'relaxed' } });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('开局前');

    since = host.messages.length;
    await guest.close();
    await host.wait(message => message.type === 'room' && !message.room.members[1].connected, since);
    const rejoined = await Client.connect(server.port, guest.id); clients.push(rejoined);
    since = rejoined.messages.length;
    rejoined.send({ type: 'reconnect', code });
    const restored = await rejoined.wait(message => message.type === 'room' && message.room.members[1].connected, since);
    expect(restored.room.config.rentLevel).toBe('heavy');
    expect(restored.room.state.config.rentLevel).toBe('heavy');

    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'roll' } });
    const landed = await host.wait(message => message.type === 'room' && message.room.state?.pending?.kind === 'land', since);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, landed.room.movementUntil - Date.now() + 10)));
    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'choose', choiceId: 'buy' } });
    const bought = await host.wait(message => message.type === 'room' && message.room.state?.properties?.[48]?.ownerId === 'p1', since);
    const price = MAPS.lake.nodes[48].price!;
    expect(getRent(bought.room.state, 48)).toBe(Math.ceil(price * 0.8));

    since = rejoined.messages.length;
    host.send({ type: 'action', action: { type: 'endTurn' } });
    await rejoined.wait(message => message.type === 'room' && message.room.state?.currentPlayerIndex === 1, since);
    const rentHostSince = host.messages.length, rentGuestSince = rejoined.messages.length;
    rejoined.send({ type: 'action', action: { type: 'roll' } });
    const prompted = await rejoined.wait(message => message.type === 'room' && message.room.state?.pending?.kind === 'rent', rentGuestSince);
    const hostPrompted = await host.wait(message => message.type === 'room' && message.room.state?.pending?.kind === 'rent', rentHostSince);
    const rent = Math.ceil(price * 0.8);
    expect(prompted.room.state.pending.data.amount).toBe(rent);
    expect(hostPrompted.room.state.pending).toEqual(prompted.room.state.pending);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, prompted.room.movementUntil - Date.now() + 10)));
    const payHostSince = host.messages.length, payGuestSince = rejoined.messages.length;
    rejoined.send({ type: 'action', action: { type: 'choose', choiceId: 'pay' } });
    const paid = await rejoined.wait(message => message.type === 'room' && message.room.state?.notices?.some((notice: { kind: string }) => notice.kind === 'rent'), payGuestSince);
    const observed = await host.wait(message => message.type === 'room' && message.room.state?.notices?.some((notice: { kind: string }) => notice.kind === 'rent'), payHostSince);
    expect(paid.room.state.notices.at(-1)).toMatchObject({ kind: 'rent', amount: rent, playerId: 'p2', recipientId: 'p1' });
    expect(paid.room.state.players[0].cash).toBe(bought.room.state.players[0].cash + rent);
    expect(paid.room.state.players[1].cash).toBe(prompted.room.state.players[1].cash - rent);
    expect(observed.room.state).toEqual(paid.room.state);
  } finally {
    await Promise.all(clients.map(client => client.close()));
    await server.close();
  }
}, 25_000);

it('starts both players with 200000 PM on forest with heavy rent and keeps that amount after reconnect', async () => {
  const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
  const clients: Client[] = [];
  try {
    const host = await Client.connect(server.port); clients.push(host);
    const guest = await Client.connect(server.port); clients.push(guest);
    let since = host.messages.length;
    host.send({ type: 'create', profile: hostProfile,
      config: { mapId: 'forest', seasons: 4, weatherMode: 'standard', rentLevel: 'heavy', seed: 16 } });
    const created = await host.wait(message => message.type === 'room', since);
    const code = created.room.code;
    since = guest.messages.length;
    guest.send({ type: 'join', code, profile: guestProfile });
    await guest.wait(message => message.type === 'room' && message.room.members.length === 2, since);
    since = host.messages.length;
    guest.send({ type: 'ready', ready: true });
    await host.wait(message => message.type === 'room' && message.room.members[1].ready, since);
    const hostSince = host.messages.length, guestSince = guest.messages.length;
    host.send({ type: 'start' });
    const started = await host.wait(message => message.type === 'room' && message.room.started, hostSince);
    const guestStarted = await guest.wait(message => message.type === 'room' && message.room.started, guestSince);
    expect(started.room.state.players.map((player: { cash: number }) => player.cash)).toEqual([200_000, 200_000]);
    expect(guestStarted.room.state.players.map((player: { cash: number }) => player.cash)).toEqual([200_000, 200_000]);
    expect(started.room.state.config).toMatchObject({ mapId: 'forest', rentLevel: 'heavy' });

    since = host.messages.length;
    await guest.close();
    await host.wait(message => message.type === 'room' && !message.room.members[1].connected, since);
    const rejoined = await Client.connect(server.port, guest.id); clients.push(rejoined);
    since = rejoined.messages.length;
    rejoined.send({ type: 'reconnect', code });
    const restored = await rejoined.wait(message => message.type === 'room' && message.room.members[1].connected, since);
    expect(restored.room.state.players.map((player: { cash: number }) => player.cash)).toEqual([200_000, 200_000]);
    expect(restored.room.state.config).toMatchObject({ mapId: 'forest', rentLevel: 'heavy' });
  } finally {
    await Promise.all(clients.map(client => client.close()));
    await server.close();
  }
}, 10_000);
