import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { expect, it } from 'vitest';
import { createRoomServer } from '../server/index';
import { act, createGame } from '../src/game/engine';
import { findEligibleEvent } from '../src/game/eventPool';
import type { GameState } from '../src/game/types';

type Room = { code: string; started: boolean; movementUntil: number; members: { ready: boolean }[]; state: GameState | null };
type Wire = { type: string; room?: Room; message?: string };

class Client {
  readonly messages: Wire[] = [];
  private events = new EventEmitter();
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
    client.send({ type: 'hello', clientId: randomUUID() });
    await client.wait(message => message.type === 'hello');
    return client;
  }
  send(value: unknown) { this.socket.send(JSON.stringify(value)); }
  wait(predicate: (value: Wire) => boolean, since = 0): Promise<Wire> {
    const existing = this.messages.slice(since).find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.events.off('message', onMessage); reject(new Error('Timed out waiting for room')); }, 5000);
      const onMessage = (message: Wire, index: number) => {
        if (index < since || !predicate(message)) return;
        clearTimeout(timeout);
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

it('shares temporary land encounter and its serialized purchase continuation without guest authority', async () => {
  const hostProfile = { name: '甲', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' } as const;
  const guestProfile = { name: '乙', color: '#277DA8', shape: 'diamond', ai: false, personality: 'balanced' } as const;
  let seed = 0, preview: GameState | null = null, choiceId = '';
  for (let candidate = 1; candidate < 10_000; candidate++) {
    const rolled = act(createGame({ mapId: 'lake', mode: 'pvp', seasons: 4, weatherMode: 'standard', seed: candidate,
      players: [hostProfile, guestProfile] }), { type: 'roll' });
    if (rolled.pending?.data?.eventSource !== 'encounter') continue;
    const event = findEligibleEvent('lake', String(rolled.pending.data.eventId), 'encounter');
    const selected = event?.choices.find(choice => !choice.confinement && rolled.pending?.choices.some(entry => entry.id === choice.id && !entry.disabled));
    if (!selected || act(rolled, { type: 'choose', choiceId: selected.id }).pending?.kind !== 'land') continue;
    seed = candidate; preview = rolled; choiceId = selected.id; break;
  }
  expect(preview?.pending?.data).toMatchObject({ eventSource: 'encounter', continuation: { nodeId: preview?.players[0].position } });
  const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
  const clients: Client[] = [];
  try {
    const host = await Client.connect(server.port); clients.push(host);
    const guest = await Client.connect(server.port); clients.push(guest);
    let since = host.messages.length;
    host.send({ type: 'create', profile: hostProfile, config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed } });
    const code = (await host.wait(message => message.type === 'room' && message.room?.members.length === 1, since)).room!.code;
    since = guest.messages.length;
    guest.send({ type: 'join', code, profile: guestProfile });
    await guest.wait(message => message.type === 'room' && message.room?.members.length === 2, since);
    since = host.messages.length;
    guest.send({ type: 'ready', ready: true });
    await host.wait(message => message.type === 'room' && !!message.room?.members[1].ready, since);
    since = host.messages.length;
    host.send({ type: 'start' });
    await host.wait(message => message.type === 'room' && !!message.room?.started, since);
    const hostSince = host.messages.length, guestSince = guest.messages.length;
    host.send({ type: 'action', action: { type: 'roll' } });
    const matchesEncounter = (message: Wire) => message.type === 'room' && message.room?.state?.pending?.data?.eventSource === 'encounter';
    const [first, other] = await Promise.all([host.wait(matchesEncounter, hostSince), guest.wait(matchesEncounter, guestSince)]);
    expect(first.room!.state!.pending).toEqual(other.room!.state!.pending);
    expect(first.room!.state!.turnEncounters).toEqual(other.room!.state!.turnEncounters);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, first.room!.movementUntil - Date.now() + 10)));
    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'choose', choiceId } });
    expect((await guest.wait(message => message.type === 'error', since)).message).toContain('不是你的行动回合');
    const afterHost = host.messages.length, afterGuest = guest.messages.length;
    host.send({ type: 'action', action: { type: 'choose', choiceId } });
    const matchesLand = (message: Wire) => message.type === 'room' && message.room?.state?.pending?.kind === 'land';
    const [land, mirrored] = await Promise.all([host.wait(matchesLand, afterHost), guest.wait(matchesLand, afterGuest)]);
    expect(land.room!.state!.pending).toEqual(mirrored.room!.state!.pending);
    expect(land.room!.state!.turnEncounters?.[0]?.selectedChoiceId).toBe(choiceId);
    expect(land.room!.state!.players[0].position).toBe(preview!.players[0].position);
  } finally {
    await Promise.all(clients.map(client => client.close()));
    await server.close();
  }
}, 15_000);
