import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { describe, expect, it } from 'vitest';
import { createRoomServer } from '../server/index';
import { act, createGame } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import { parseSave } from '../src/game/storage';
import type { GameConfig, GameState, MapId } from '../src/game/types';

type Wire = { type: string; room?: {
  code: string; members: { ready: boolean; connected: boolean }[]; started: boolean;
  config: { mapId: MapId }; state: GameState | null;
}; message?: string };

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

const profiles = [
  { name: '溪云', color: '#D55B48', shape: 'circle', personality: 'balanced', ai: false },
  { name: '山岚', color: '#277DA8', shape: 'diamond', personality: 'cautious', ai: false },
] as const;
const newMaps = ['ashCanyon', 'peachHaven'] as const;

function localConfig(mapId: MapId): GameConfig {
  return { mapId, mode: 'pve', seasons: 4, weatherMode: 'standard', seed: 1217,
    players: [{ ...profiles[0] }, { ...profiles[1], ai: true }] };
}

describe.each(newMaps)('%s save and room compatibility', mapId => {
  const otherMap = newMaps.find(id => id !== mapId)!;

  it('round-trips a PVE first step and rejects invalid map or node references', () => {
    const initial = createGame(localConfig(mapId));
    const rolled = act(initial, { type: 'roll' });
    expect(rolled).not.toBe(initial);
    const restored = parseSave(JSON.stringify(rolled));
    expect(restored.config.mapId).toBe(mapId);
    expect(restored.players.map(player => player.position)).toEqual(rolled.players.map(player => player.position));
    expect(MAPS[mapId].nodes[restored.players[0].position]).toBeDefined();

    const badMap = structuredClone(rolled);
    badMap.config.mapId = '__proto__' as MapId;
    expect(() => parseSave(JSON.stringify(badMap))).toThrow('游戏设置');
    const badPosition = structuredClone(rolled);
    badPosition.players[0].position = MAPS[mapId].nodes.length;
    expect(() => parseSave(JSON.stringify(badPosition))).toThrow('玩家数据');
    const badProperty = structuredClone(rolled);
    badProperty.properties[MAPS[mapId].nodes.length] = { ownerId: 'p1', level: 0, mortgaged: false };
    expect(() => parseSave(JSON.stringify(badProperty))).toThrow('产权');
  });

  it('creates, changes, starts, rolls, and reconnects a two-client PVP room', async () => {
    const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
    const clients: Client[] = [];
    try {
      const host = await Client.connect(server.port); clients.push(host);
      const guest = await Client.connect(server.port); clients.push(guest);
      const baseConfig = { mapId, seasons: 4, weatherMode: 'standard', rentLevel: 'standard', seed: 1217 };
      let since = host.messages.length;
      host.send({ type: 'create', profile: profiles[0], config: { ...baseConfig, mapId: '__proto__' } });
      expect((await host.wait(message => message.type === 'error', since)).message).toContain('设置无效');
      since = host.messages.length;
      host.send({ type: 'create', profile: profiles[0], config: baseConfig });
      const created = await host.wait(message => message.type === 'room' && message.room?.members.length === 1, since);
      expect(created.room?.config.mapId).toBe(mapId);
      const code = created.room!.code;
      since = guest.messages.length;
      guest.send({ type: 'join', code, profile: profiles[1] });
      await guest.wait(message => message.type === 'room' && message.room?.members.length === 2, since);

      for (const selected of [otherMap, mapId]) {
        const hostSince = host.messages.length, guestSince = guest.messages.length;
        host.send({ type: 'config', config: { ...baseConfig, mapId: selected } });
        const [hostUpdate, guestUpdate] = await Promise.all([
          host.wait(message => message.type === 'room' && message.room?.config.mapId === selected, hostSince),
          guest.wait(message => message.type === 'room' && message.room?.config.mapId === selected, guestSince),
        ]);
        expect(hostUpdate.room?.config).toEqual(guestUpdate.room?.config);
      }
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

      const rollHostSince = host.messages.length, rollGuestSince = guest.messages.length;
      host.send({ type: 'action', action: { type: 'roll' } });
      const [hostRoll, guestRoll] = await Promise.all([
        host.wait(message => message.type === 'room' && !!message.room?.state?.movement, rollHostSince),
        guest.wait(message => message.type === 'room' && !!message.room?.state?.movement, rollGuestSince),
      ]);
      expect(hostRoll.room?.state).toEqual(guestRoll.room?.state);
      expect(hostRoll.room?.state?.movement?.path.length).toBeGreaterThan(1);

      since = host.messages.length;
      await guest.close();
      await host.wait(message => message.type === 'room' && !message.room?.members[1].connected, since);
      const rejoined = await Client.connect(server.port, guest.id); clients.push(rejoined);
      since = rejoined.messages.length;
      rejoined.send({ type: 'reconnect', code });
      const restored = await rejoined.wait(message => message.type === 'room' && !!message.room?.members[1].connected, since);
      expect(restored.room?.config.mapId).toBe(mapId);
      expect(restored.room?.state).toEqual(hostRoll.room?.state);
    } finally {
      await Promise.all(clients.map(client => client.close()));
      await server.close();
    }
  }, 10_000);
});
