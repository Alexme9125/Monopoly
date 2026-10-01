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
const botProfile = { name: '阿湛', color: '#8062C5', shape: 'hexagon', personality: 'aggressive' };

it('keeps lobby profile edits owned, validated, synchronized, and durable through reconnect and start', async () => {
  const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
  const clients: Client[] = [];
  try {
    const host = await Client.connect(server.port); clients.push(host);
    const guest = await Client.connect(server.port); clients.push(guest);
    let since = host.messages.length;
    host.send({ type: 'create', profile: hostProfile,
      config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed: 8 } });
    const created = await host.wait(message => message.type === 'room' && message.room?.members.length === 1, since);
    const code = created.room.code;
    const hostSeat = created.room.youSeatId;
    expect(created.room.config.weatherMode).toBe('standard');

    since = guest.messages.length;
    guest.send({ type: 'join', code, profile: { ...guestProfile, name: ' 星河 ' } });
    expect((await guest.wait(message => message.type === 'error', since)).message).toContain('同名');
    since = guest.messages.length;
    guest.send({ type: 'join', code, profile: guestProfile });
    const joined = await guest.wait(message => message.type === 'room' && message.room?.members.length === 2, since);
    const guestSeat = joined.room.youSeatId;
    expect(joined.room.members.map((member: { name: string }) => member.name)).toEqual(['星河', '云岚']);
    expect(joined.room.members[1].ready).toBe(false);

    since = host.messages.length;
    host.send({ type: 'addBot', profile: botProfile });
    const withBot = await host.wait(message => message.type === 'room' && message.room?.members.length === 3, since);
    const botSeat = withBot.room.members[2].seatId;
    since = host.messages.length;
    host.send({ type: 'addBot', profile: { ...botProfile, name: ' 云岚 ' } });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('同名');

    const hostSince = host.messages.length, guestSince = guest.messages.length;
    guest.send({ type: 'profile', seatId: hostSeat, profile: { ...guestProfile, name: '  远山  ',
      seatId: botSeat, ready: true, host: true, ai: true } });
    const hostUpdated = await host.wait(message => message.type === 'room' && message.room?.members[1]?.name === '远山', hostSince);
    const guestUpdated = await guest.wait(message => message.type === 'room' && message.room?.members[1]?.name === '远山', guestSince);
    expect(hostUpdated.room.members).toEqual(guestUpdated.room.members);
    expect(hostUpdated.room.members[0]).toMatchObject({ seatId: hostSeat, name: '星河', host: true, ready: true, ai: false });
    expect(hostUpdated.room.members[1]).toMatchObject({ seatId: guestSeat, name: '远山', host: false, ready: false, ai: false });
    expect(hostUpdated.room.members[2]).toMatchObject({ seatId: botSeat, name: '阿湛', ai: true });

    since = host.messages.length;
    host.send({ type: 'profile', seatId: guestSeat, profile: { ...hostProfile, name: '  新星河  ' } });
    const renamedHost = await host.wait(message => message.type === 'room' && message.room?.members[0]?.name === '新星河', since);
    expect(renamedHost.room.members.map((member: { name: string }) => member.name)).toEqual(['新星河', '远山', '阿湛']);
    since = host.messages.length;
    guest.send({ type: 'ready', ready: true });
    await host.wait(message => message.type === 'room' && message.room?.members[1]?.ready, since);

    // Saving an unchanged name may still update the avatar and must preserve readiness.
    since = host.messages.length;
    guest.send({ type: 'profile', profile: { ...guestProfile, name: '  远山  ', shape: 'triangle' } });
    const avatarOnly = await host.wait(message => message.type === 'room' && message.room?.members[1]?.shape === 'triangle', since);
    expect(avatarOnly.room.members[1]).toMatchObject({ name: '远山', seatId: guestSeat, ready: true, ai: false });

    for (const name of [' \t\n ', 'x'.repeat(25), ' 新星河 ', '阿湛']) {
      since = guest.messages.length;
      guest.send({ type: 'profile', profile: { ...guestProfile, name } });
      const rejected = await guest.wait(message => message.type === 'error', since);
      expect(rejected.message).toMatch(name.trim().length > 24 || !name.trim() ? /资料无效/ : /同名/);
    }
    since = host.messages.length;
    host.send({ type: 'profile', profile: { ...hostProfile, name: ' 远山 ' } });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('同名');

    since = host.messages.length;
    guest.send({ type: 'profile', profile: { ...guestProfile, name: '  远山新名  ' } });
    const readyRename = await host.wait(message => message.type === 'room' && message.room?.members[1]?.name === '远山新名', since);
    expect(readyRename.room.members[1]).toMatchObject({ seatId: guestSeat, ready: true, host: false });
    expect(readyRename.room.members).toHaveLength(3);

    since = host.messages.length;
    await guest.close();
    await host.wait(message => message.type === 'room' && !message.room?.members[1]?.connected, since);
    const rejoined = await Client.connect(server.port, guest.id); clients.push(rejoined);
    since = rejoined.messages.length;
    rejoined.send({ type: 'reconnect', code });
    const restored = await rejoined.wait(message => message.type === 'room' && message.room?.members[1]?.connected, since);
    expect(restored.room.youSeatId).toBe(guestSeat);
    expect(restored.room.members[1]).toMatchObject({ name: '远山新名', ready: true, host: false });
    expect(restored.room.members[2]).toMatchObject({ seatId: botSeat, name: '阿湛', ai: true });

    since = host.messages.length;
    host.send({ type: 'start' });
    const started = await host.wait(message => message.type === 'room' && message.room?.started, since);
    expect(started.room.state.players.map((player: { name: string }) => player.name)).toEqual(['新星河', '远山新名', '阿湛']);
    expect(started.room.state.config.weatherMode).toBe('standard');
    since = rejoined.messages.length;
    rejoined.send({ type: 'profile', profile: { ...guestProfile, name: '开局后改名' } });
    expect((await rejoined.wait(message => message.type === 'error', since)).message).toContain('已经开始');
    since = host.messages.length;
    host.send({ type: 'profile', profile: { ...hostProfile, name: '开局后房主改名' } });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('已经开始');

    // A new game uses the profile supplied to its new room; the server keeps no stale lobby name.
    since = host.messages.length;
    host.send({ type: 'leave' });
    await host.wait(message => message.type === 'left', since);
    since = host.messages.length;
    host.send({ type: 'create', profile: { ...hostProfile, name: '再次出发' },
      config: { mapId: 'coast', seasons: 4, weatherMode: 'standard', seed: 9 } });
    const newRoom = await host.wait(message => message.type === 'room' && message.room?.members.length === 1, since);
    expect(newRoom.room.members[0].name).toBe('再次出发');
    expect(newRoom.room.youSeatId).not.toBe(hostSeat);
  } finally {
    for (const client of clients) await client.close();
    await server.close();
  }
}, 20_000);

it('shares bot AI level and personality with both clients through reconnect and game start', async () => {
  const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
  const clients: Client[] = [];
  try {
    const host = await Client.connect(server.port); clients.push(host);
    const guest = await Client.connect(server.port); clients.push(guest);
    let since = host.messages.length;
    host.send({ type: 'create', profile: hostProfile,
      config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed: 17 } });
    const code = (await host.wait(message => message.type === 'room', since)).room.code;
    since = guest.messages.length;
    guest.send({ type: 'join', code, profile: guestProfile });
    await guest.wait(message => message.type === 'room' && message.room?.members.length === 2, since);

    for (const aiLevel of ['unknown', ['gentle'], null]) {
      since = host.messages.length;
      host.send({ type: 'addBot', profile: { ...botProfile, name: '非法强度', aiLevel } });
      expect((await host.wait(message => message.type === 'error', since)).message).toContain('资料无效');
    }

    since = host.messages.length;
    host.send({ type: 'addBot', profile: { ...botProfile, name: '温和同伴', personality: 'cautious' } });
    const gentle = await host.wait(message => message.type === 'room' && message.room?.members.length === 3, since);
    expect(gentle.room.members[2]).toMatchObject({ name: '温和同伴', ai: true, personality: 'cautious', aiLevel: 'gentle' });
    since = host.messages.length;
    host.send({ type: 'addBot', profile: { ...botProfile, name: '凌厉对手', personality: 'aggressive', aiLevel: 'fierce' } });
    const fierce = await host.wait(message => message.type === 'room' && message.room?.members.length === 4, since);
    expect(fierce.room.members[3]).toMatchObject({ name: '凌厉对手', ai: true, personality: 'aggressive', aiLevel: 'fierce' });
    const guestView = await guest.wait(message => message.type === 'room' && message.room?.members.length === 4);
    expect(guestView.room.members.map((member: { aiLevel?: string }) => member.aiLevel)).toEqual([undefined, undefined, 'gentle', 'fierce']);

    since = host.messages.length;
    host.send({ type: 'profile', profile: { ...hostProfile, aiLevel: 'impossible' } });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('资料无效');
    since = host.messages.length;
    await guest.close();
    await host.wait(message => message.type === 'room' && !message.room?.members[1]?.connected, since);
    const rejoined = await Client.connect(server.port, guest.id); clients.push(rejoined);
    since = rejoined.messages.length;
    rejoined.send({ type: 'reconnect', code });
    const restored = await rejoined.wait(message => message.type === 'room' && message.room?.members[1]?.connected, since);
    expect(restored.room.members.slice(2).map((member: { personality: string; aiLevel: string }) =>
      [member.personality, member.aiLevel])).toEqual([['cautious', 'gentle'], ['aggressive', 'fierce']]);

    since = host.messages.length;
    rejoined.send({ type: 'ready', ready: true });
    await host.wait(message => message.type === 'room' && message.room?.members[1]?.ready, since);
    since = host.messages.length;
    host.send({ type: 'start' });
    const started = await host.wait(message => message.type === 'room' && message.room?.started, since);
    expect(started.room.state.config.players.slice(2).map((player: { personality: string; aiLevel: string }) =>
      [player.personality, player.aiLevel])).toEqual([['cautious', 'gentle'], ['aggressive', 'fierce']]);
    expect(started.room.state.players.slice(2).map((player: { personality: string; aiLevel: string }) =>
      [player.personality, player.aiLevel])).toEqual([['cautious', 'gentle'], ['aggressive', 'fierce']]);
    const guestStarted = await rejoined.wait(message => message.type === 'room' && message.room?.started);
    expect(guestStarted.room.state.players.slice(2)).toEqual(started.room.state.players.slice(2));
  } finally {
    for (const client of clients) await client.close();
    await server.close();
  }
}, 20_000);
