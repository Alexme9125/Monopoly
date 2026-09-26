import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { expect, it } from 'vitest';
import { createRoomServer } from '../server/index';
import { act, createGame } from '../src/game/engine';
import { MAPS } from '../src/game/maps';
import type { GameConfig } from '../src/game/types';

type Wire = { type: string; room?: any; message?: string };
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
  wait(predicate: (message: Wire) => boolean, since = 0, timeout = 7000): Promise<Wire> {
    const found = this.messages.slice(since).find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.events.off('message', onMessage); reject(new Error('Timed out waiting for server message')); }, timeout);
      const onMessage = (message: Wire, index: number) => {
        if (index < since || !predicate(message)) return;
        clearTimeout(timer); this.events.off('message', onMessage); resolve(message);
      };
      this.events.on('message', onMessage);
    });
  }
  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    const done = new Promise<void>(resolve => this.socket.once('close', () => resolve()));
    this.socket.close(); await done;
  }
}

const host = { name: '甲', color: '#D55B48', shape: 'circle' as const, ai: false, personality: 'balanced' as const };
const guest = { name: '乙', color: '#277DA8', shape: 'diamond' as const, ai: false, personality: 'cautious' as const };
function openingSeed(eventId: string): number {
  for (let seed = 1; seed <= 20000; seed++) {
    const config: GameConfig = { mapId: 'lake', mode: 'pvp', seasons: 4, weatherMode: 'standard', seed, players: [host, guest] };
    if (act(createGame(config), { type: 'roll' }).pending?.data?.eventId === eventId) return seed;
  }
  throw new Error(`No opening seed for ${eventId}`);
}

it('broadcasts earned twin rolls and teleport landings, while rejecting the other player’s item action', async () => {
  const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
  try {
    for (const [eventId, choiceId, itemId] of [
      ['twin_culture', 'twin_culture_nurture', 'twinDish'],
      ['prism_relay', 'prism_relay_calibrate', 'teleportStone'],
    ] as const) {
      const clients: Client[] = [];
      try {
        const owner = await Client.connect(server.port); clients.push(owner);
        const visitor = await Client.connect(server.port); clients.push(visitor);
        let since = owner.messages.length;
        owner.send({ type: 'create', profile: host, config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed: openingSeed(eventId) } });
        const created = await owner.wait(message => message.type === 'room' && message.room?.members.length === 1, since);
        since = visitor.messages.length;
        visitor.send({ type: 'join', code: created.room.code, profile: guest });
        await visitor.wait(message => message.type === 'room' && message.room?.members.length === 2, since);
        since = owner.messages.length;
        visitor.send({ type: 'ready', ready: true });
        await owner.wait(message => message.type === 'room' && message.room?.members[1].ready, since);
        since = owner.messages.length;
        owner.send({ type: 'start' });
        await owner.wait(message => message.type === 'room' && message.room?.started, since);
        const ownerRollSince = owner.messages.length, visitorRollSince = visitor.messages.length;
        owner.send({ type: 'action', action: { type: 'roll' } });
        const encounter = await owner.wait(message => message.type === 'room' && message.room?.state?.pending?.data?.eventId === eventId, ownerRollSince);
        await visitor.wait(message => message.type === 'room' && message.room?.state?.pending?.data?.eventId === eventId, visitorRollSince);
        await new Promise(resolve => setTimeout(resolve, Math.max(0, encounter.room.movementUntil - Date.now() + 20)));
        since = owner.messages.length;
        owner.send({ type: 'action', action: { type: 'choose', choiceId } });
        const earned = await owner.wait(message => message.type === 'room' && message.room?.state?.players[0].inventory.some((slot: any) => slot.itemId === itemId), since);
        const itemUid = earned.room.state.players[0].inventory.find((slot: any) => slot.itemId === itemId).uid;
        since = owner.messages.length;
        owner.send({ type: 'action', action: { type: 'endTurn' } });
        await owner.wait(message => message.type === 'room' && message.room?.state?.currentPlayerIndex === 1, since);
        since = visitor.messages.length;
        visitor.send({ type: 'action', action: { type: 'rest' } });
        await visitor.wait(message => message.type === 'room' && message.room?.state?.phase === 'end' && message.room.state.currentPlayerIndex === 1, since);
        since = owner.messages.length;
        visitor.send({ type: 'action', action: { type: 'endTurn' } });
        await owner.wait(message => message.type === 'room' && message.room?.state?.currentPlayerIndex === 0, since);
        since = visitor.messages.length;
        visitor.send({ type: 'action', action: { type: 'useItem', itemUid, nodeId: MAPS.lake.nodes.find(node => node.kind === 'coin')!.id } });
        expect((await visitor.wait(message => message.type === 'error', since)).message).toContain('不是你的行动回合');
        if (itemId === 'twinDish') {
          since = owner.messages.length;
          owner.send({ type: 'action', action: { type: 'useItem', itemUid } });
          await owner.wait(message => message.type === 'room' && message.room?.state?.twinRoll === true, since);
          const ownerSince = owner.messages.length, visitorSince = visitor.messages.length;
          owner.send({ type: 'action', action: { type: 'roll' } });
          const rolled = await owner.wait(message => message.type === 'room' && message.room?.state?.movement?.rolls?.length === 2, ownerSince);
          const mirrored = await visitor.wait(message => message.type === 'room' && message.room?.state?.movement?.rolls?.length === 2, visitorSince);
          expect(rolled.room.state.movement).toEqual(mirrored.room.state.movement);
          expect(rolled.room.state.movement.roll).toBe(rolled.room.state.movement.rolls.reduce((sum: number, value: number) => sum + value, 0));
          expect(rolled.room.movementUntil).toBeGreaterThan(Date.now());
        } else {
          const coin = MAPS.lake.nodes.find(node => node.kind === 'coin')!;
          const ownerSince = owner.messages.length, visitorSince = visitor.messages.length;
          owner.send({ type: 'action', action: { type: 'useItem', itemUid, nodeId: coin.id } });
          const arrived = await owner.wait(message => message.type === 'room' && message.room?.state?.players[0].position === coin.id
            && message.room?.state?.movement?.segments?.[0]?.label?.includes('传送石'), ownerSince);
          const mirrored = await visitor.wait(message => message.type === 'room' && message.room?.state?.movement?.segments?.[0]?.label?.includes('传送石'), visitorSince);
          expect(arrived.room.state.movement).toEqual(mirrored.room.state.movement);
          expect(arrived.room.state.movement.dice).toBe(false);
          expect(arrived.room.state.movement.effects.some((entry: any) => entry.kind === 'cash')).toBe(true);
          expect(arrived.room.movementUntil).toBeGreaterThan(Date.now());
        }
      } finally {
        for (const client of clients) await client.close();
      }
    }
  } finally { await server.close(); }
}, 45_000);
