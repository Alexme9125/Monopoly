import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { expect, it } from 'vitest';
import { createRoomServer } from '../server/index';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import type { GameState } from '../src/game/types';

type Wire = { type: string; room?: { code: string; members: { ready: boolean }[]; started: boolean; config: { mapId: string }; state: GameState | null }; message?: string };

class Client {
  readonly messages: Wire[] = [];
  private readonly events = new EventEmitter();
  private constructor(readonly socket: WebSocket) {
    socket.on('message', raw => {
      const message = JSON.parse(raw.toString()) as Wire;
      this.messages.push(message);
      this.events.emit('message', message, this.messages.length - 1);
    });
  }
  static async connect(port: number) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const client = new Client(socket);
    const since = client.messages.length;
    client.send({ type: 'hello', clientId: randomUUID() });
    await client.wait(message => message.type === 'hello', since);
    return client;
  }
  send(message: unknown) { this.socket.send(JSON.stringify(message)); }
  wait(predicate: (message: Wire) => boolean, since = 0): Promise<Wire> {
    const found = this.messages.slice(since).find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.events.off('message', onMessage); reject(new Error('Timed out waiting for room snapshot')); }, 5000);
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

it.each(['sundered', 'forest', 'starSands'] as const)('creates a two-person %s room and synchronizes the first roll and save', async mapId => {
  const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
  const clients: Client[] = [];
  try {
    const host = await Client.connect(server.port); clients.push(host);
    const guest = await Client.connect(server.port); clients.push(guest);
    const hostProfile = { name: '山岚', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' };
    const guestProfile = { name: '晨曦', color: '#277DA8', shape: 'diamond', ai: false, personality: 'cautious' };
    let since = host.messages.length;
    host.send({ type: 'create', profile: hostProfile,
      config: { mapId, seasons: 4, weatherMode: 'standard', seed: 1217 } });
    const created = await host.wait(message => message.type === 'room' && message.room?.members.length === 1, since);
    expect(created.room?.config.mapId).toBe(mapId);
    const code = created.room!.code;
    since = guest.messages.length;
    guest.send({ type: 'join', code, profile: guestProfile });
    const joined = await guest.wait(message => message.type === 'room' && message.room?.members.length === 2, since);
    expect(joined.room?.config.mapId).toBe(mapId);
    since = host.messages.length;
    guest.send({ type: 'ready', ready: true });
    await host.wait(message => message.type === 'room' && !!message.room?.members[1].ready, since);
    const hostSince = host.messages.length, guestSince = guest.messages.length;
    host.send({ type: 'start' });
    const [hostStart, guestStart] = await Promise.all([
      host.wait(message => message.type === 'room' && !!message.room?.started, hostSince),
      guest.wait(message => message.type === 'room' && !!message.room?.started, guestSince),
    ]);
    expect(hostStart.room?.state?.config.mapId).toBe(mapId);
    expect(guestStart.room?.state).toEqual(hostStart.room?.state);
    expect(MAPS[mapId].nodes[hostStart.room!.state!.players[0].position]).toBeDefined();
    const hostRollSince = host.messages.length, guestRollSince = guest.messages.length;
    host.send({ type: 'action', action: { type: 'roll' } });
    const [hostRoll, guestRoll] = await Promise.all([
      host.wait(message => message.type === 'room' && !!message.room?.state?.movement, hostRollSince),
      guest.wait(message => message.type === 'room' && !!message.room?.state?.movement, guestRollSince),
    ]);
    expect(hostRoll.room?.state).toEqual(guestRoll.room?.state);
    expect(hostRoll.room?.state?.movement?.path.length).toBeGreaterThan(1);
    const restored = parseSave(JSON.stringify(hostRoll.room!.state));
    expect(restored.config.mapId).toBe(mapId);
    expect(restored.players.map(player => player.position)).toEqual(hostRoll.room!.state!.players.map(player => player.position));
  } finally {
    for (const client of clients) await client.close();
    await server.close();
  }
}, 10_000);
