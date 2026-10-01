import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { expect, it, vi } from 'vitest';
import type { GameConfig } from '../src/game/types';

const HOST_TICKET = 'lottery-host-network';
const GUEST_TICKET = 'lottery-guest-network';

vi.mock('../src/game/engine', async () => {
  const real = await vi.importActual<typeof import('../src/game/engine')>('../src/game/engine');
  return { ...real, createGame: (config: GameConfig) => {
    const state = real.createGame(config);
    state.players[0].inventory.push({ uid: HOST_TICKET, itemId: 'lottery', quantity: 1, wet: false });
    state.players[1].inventory.push({ uid: GUEST_TICKET, itemId: 'lottery', quantity: 1, wet: false });
    return state;
  } };
});

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
    const closed = new Promise<void>(resolve => this.socket.once('close', () => resolve()));
    this.socket.close();
    await closed;
  }
}

const hostProfile = { name: '星河', color: '#D55B48', shape: 'circle', personality: 'balanced' };
const guestProfile = { name: '云岚', color: '#277DA8', shape: 'diamond', personality: 'cautious' };

it('broadcasts one authoritative lottery payout and keeps it after reconnect', async () => {
  const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
  const clients: Client[] = [];
  try {
    const host = await Client.connect(server.port); clients.push(host);
    const guest = await Client.connect(server.port); clients.push(guest);
    let since = host.messages.length;
    host.send({ type: 'create', profile: hostProfile,
      config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed: 29 } });
    const code = (await host.wait(message => message.type === 'room', since)).room.code;
    since = guest.messages.length;
    guest.send({ type: 'join', code, profile: guestProfile });
    await guest.wait(message => message.type === 'room' && message.room?.members.length === 2, since);
    since = host.messages.length;
    guest.send({ type: 'ready', ready: true });
    await host.wait(message => message.type === 'room' && message.room?.members[1]?.ready, since);
    since = host.messages.length;
    host.send({ type: 'start' });
    const started = await host.wait(message => message.type === 'room' && message.room?.started, since);
    const initial = started.room.state;
    expect(initial.players[0].inventory.find((slot: { uid: string }) => slot.uid === HOST_TICKET)?.quantity).toBe(1);
    expect(initial.players[1].inventory.find((slot: { uid: string }) => slot.uid === GUEST_TICKET)?.quantity).toBe(1);

    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'useItem', itemUid: HOST_TICKET } });
    expect((await guest.wait(message => message.type === 'error', since)).message).toContain('不是你的行动回合');
    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'useItem', itemUid: GUEST_TICKET } });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('不可执行');

    const hostSince = host.messages.length, guestSince = guest.messages.length;
    host.send({ type: 'action', action: { type: 'useItem', itemUid: HOST_TICKET } });
    const hostDraw = await host.wait(message => message.type === 'room' && message.room?.state?.notices?.some((entry: { kind: string }) => entry.kind === 'lottery'), hostSince);
    const guestDraw = await guest.wait(message => message.type === 'room' && message.room?.state?.notices?.some((entry: { kind: string }) => entry.kind === 'lottery'), guestSince);
    const hostState = hostDraw.room.state, guestState = guestDraw.room.state;
    const hostResult = hostState.notices.filter((entry: { kind: string }) => entry.kind === 'lottery');
    const guestResult = guestState.notices.filter((entry: { kind: string }) => entry.kind === 'lottery');
    expect(hostResult).toHaveLength(1);
    expect(guestResult).toEqual(hostResult);
    const result = hostResult[0];
    expect(result).toMatchObject({ kind: 'lottery', title: '星海奖券开奖', playerId: hostState.players[0].id,
      nodeId: hostState.players[0].position, day: hostState.day });
    expect(Number.isSafeInteger(result.id)).toBe(true);
    expect(Number.isSafeInteger(result.amount)).toBe(true);
    expect(result.amount).toBeGreaterThanOrEqual(100);
    expect(result.amount).toBeLessThanOrEqual(5000);
    expect(result.body).toContain(result.amount.toLocaleString('zh-CN'));
    expect(result.body).toContain('已到账');
    expect(hostState.players[0].cash).toBe(initial.players[0].cash + result.amount);
    expect(guestState.players[0].cash).toBe(hostState.players[0].cash);
    expect(hostState.players[1].cash).toBe(initial.players[1].cash);
    expect(hostState.players[0].inventory.some((slot: { uid: string }) => slot.uid === HOST_TICKET)).toBe(false);
    expect(hostState.players[1].inventory.find((slot: { uid: string }) => slot.uid === GUEST_TICKET)?.quantity).toBe(1);
    expect(hostState.feedback.effects.some((effect: { kind: string; label: string }) =>
      effect.kind === 'cash' && effect.label.includes(result.amount.toLocaleString('zh-CN')))).toBe(true);

    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'useItem', itemUid: HOST_TICKET } });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('不可执行');
    since = host.messages.length;
    await guest.close();
    await host.wait(message => message.type === 'room' && !message.room?.members[1]?.connected, since);
    const rejoined = await Client.connect(server.port, guest.id); clients.push(rejoined);
    since = rejoined.messages.length;
    rejoined.send({ type: 'reconnect', code });
    const restored = await rejoined.wait(message => message.type === 'room' && message.room?.members[1]?.connected, since);
    expect(restored.room.state.notices.filter((entry: { kind: string }) => entry.kind === 'lottery')).toEqual(hostResult);
    expect(restored.room.state.players[0].cash).toBe(hostState.players[0].cash);
    expect(restored.room.state.players[0].inventory.some((slot: { uid: string }) => slot.uid === HOST_TICKET)).toBe(false);
  } finally {
    for (const client of clients) await client.close();
    await server.close();
  }
}, 20_000);
