import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { expect, it } from 'vitest';
import { createRoomServer } from '../server/index';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import type { GameState, MapId } from '../src/game/types';

type Snapshot = { code: string; config: { mapId: MapId }; members: { ready: boolean; connected: boolean }[]; started: boolean; state: GameState | null };
type Wire = { type: string; room?: Snapshot; message?: string };

class Peer {
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
    const peer = new Peer(socket, id);
    peer.send({ type: 'hello', clientId: id });
    await peer.wait(message => message.type === 'hello');
    return peer;
  }
  send(message: unknown) { this.socket.send(JSON.stringify(message)); }
  wait(predicate: (message: Wire) => boolean, since = 0): Promise<Wire> {
    const existing = this.messages.slice(since).find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.events.off('message', receive); reject(new Error('Room snapshot timed out')); }, 5000);
      const receive = (message: Wire, index: number) => {
        if (index < since || !predicate(message)) return;
        clearTimeout(timer);
        this.events.off('message', receive);
        resolve(message);
      };
      this.events.on('message', receive);
    });
  }
  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    const closed = new Promise<void>(resolve => this.socket.once('close', resolve));
    this.socket.close();
    await closed;
  }
}

it.each(['hushedValley', 'grandCity'] as const)('starts and reconnects a two-person %s room with the same roll and save', async mapId => {
  const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
  const peers: Peer[] = [];
  try {
    const host = await Peer.connect(server.port); peers.push(host);
    const guest = await Peer.connect(server.port); peers.push(guest);
    const profile = (name: string, color: string) => ({ name, color, shape: 'circle', ai: false, personality: 'balanced' });
    let since = host.messages.length;
    host.send({ type: 'create', profile: profile('房主', '#D55B48'), config: { mapId, seasons: 4, weatherMode: 'standard', seed: 2309 } });
    const room = (await host.wait(message => message.type === 'room' && message.room?.members.length === 1, since)).room!;
    expect(room.config.mapId).toBe(mapId);
    since = guest.messages.length;
    guest.send({ type: 'join', code: room.code, profile: profile('访客', '#277DA8') });
    await guest.wait(message => message.type === 'room' && message.room?.members.length === 2, since);
    since = host.messages.length;
    guest.send({ type: 'ready', ready: true });
    await host.wait(message => message.type === 'room' && !!message.room?.members[1].ready, since);
    const hostSince = host.messages.length, guestSince = guest.messages.length;
    host.send({ type: 'start' });
    const [started, guestStarted] = await Promise.all([
      host.wait(message => message.type === 'room' && !!message.room?.started, hostSince),
      guest.wait(message => message.type === 'room' && !!message.room?.started, guestSince),
    ]);
    expect(started.room?.state).toEqual(guestStarted.room?.state);
    expect(started.room?.state?.config.mapId).toBe(mapId);
    expect(started.room?.state?.players.map(player => player.cash)).toEqual(mapId === 'grandCity' ? [150_000, 150_000] : [100_000, 100_000]);
    if (mapId === 'grandCity') expect(Object.keys(started.room!.state!.availablePropertyLevels ?? {}).length).toBe(50);
    const rollHostSince = host.messages.length, rollGuestSince = guest.messages.length;
    host.send({ type: 'action', action: { type: 'roll' } });
    const [rolled, observed] = await Promise.all([
      host.wait(message => message.type === 'room' && !!message.room?.state?.movement, rollHostSince),
      guest.wait(message => message.type === 'room' && !!message.room?.state?.movement, rollGuestSince),
    ]);
    expect(rolled.room?.state).toEqual(observed.room?.state);
    expect(MAPS[mapId].nodes[rolled.room!.state!.players[0].position]).toBeDefined();
    expect(parseSave(JSON.stringify(rolled.room!.state)).config.mapId).toBe(mapId);
    since = host.messages.length;
    await guest.close();
    await host.wait(message => message.type === 'room' && !message.room?.members[1].connected, since);
    const rejoined = await Peer.connect(server.port, guest.id); peers.push(rejoined);
    since = rejoined.messages.length;
    rejoined.send({ type: 'reconnect', code: room.code });
    const restored = await rejoined.wait(message => message.type === 'room' && !!message.room?.members[1].connected, since);
    expect(restored.room?.state?.config.mapId).toBe(mapId);
    expect(restored.room?.state?.movement?.id).toBe(rolled.room?.state?.movement?.id);
    expect(restored.room?.state?.availablePropertyLevels).toEqual(rolled.room?.state?.availablePropertyLevels);
  } finally {
    await Promise.all(peers.map(peer => peer.close()));
    await server.close();
  }
}, 12_000);
