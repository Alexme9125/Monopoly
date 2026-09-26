import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRoomServer, type RoomServer } from '../server/index';
import { act, createGame } from '../src/game/engine';
import type { GameConfig, PlayerConfig } from '../src/game/types';

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
    const since = client.messages.length;
    client.send({ type: 'hello', clientId: id });
    await client.wait(message => message.type === 'hello', since);
    return client;
  }

  send(message: unknown) { this.socket.send(JSON.stringify(message)); }
  wait(predicate: (message: Wire) => boolean, since = 0, timeout = 5000): Promise<Wire> {
    const found = this.messages.slice(since).find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const onMessage = (message: Wire, index: number) => {
        if (index < since || !predicate(message)) return;
        clearTimeout(timer);
        this.events.off('message', onMessage);
        resolve(message);
      };
      const timer = setTimeout(() => { this.events.off('message', onMessage); reject(new Error('Timed out waiting for server message')); }, timeout);
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

const profiles = [
  { name: '星河', color: '#db6052', shape: 'circle', ai: false, personality: 'balanced' },
  { name: '云岚', color: '#5488e4', shape: 'diamond', ai: false, personality: 'cautious' },
  { name: '岸青', color: '#54ad8a', shape: 'hexagon', ai: false, personality: 'aggressive' },
] as PlayerConfig[];
const botProfile: PlayerConfig = { name: '泊星', color: '#9b72d6', shape: 'triangle', ai: true, personality: 'cautious' };

function landSeed(players: PlayerConfig[]): number {
  for (let seed = 1; seed < 5000; seed++) {
    const config: GameConfig = { mapId: 'lake', mode: 'pvp', seasons: 4, weatherMode: 'standard', seed, players };
    if (act(createGame(config), { type: 'roll' }).pending?.kind === 'land') return seed;
  }
  throw new Error('No initial land roll found');
}

describe('authoritative listed-property market', () => {
  let server: RoomServer;
  const clients: Client[] = [];
  beforeAll(async () => { server = await createRoomServer({ port: 0, host: '127.0.0.1' }); });
  afterAll(async () => { for (const client of clients) await client.close(); if (server) await server.close(); });

  async function startRoom(playerCount: 2 | 3, propertyTrading?: boolean, toggleBeforeStart = false, withBot = false) {
    const participants = await Promise.all(profiles.slice(0, playerCount).map(async () => {
      const client = await Client.connect(server.port);
      clients.push(client);
      return client;
    }));
    const [host, ...guests] = participants;
    const seed = landSeed(withBot ? [...profiles.slice(0, playerCount), botProfile] : profiles.slice(0, playerCount));
    let since = host.messages.length;
    host.send({ type: 'create', profile: profiles[0], config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed, ...(propertyTrading === undefined ? {} : { propertyTrading }) } });
    const created = await host.wait(message => message.type === 'room' && message.room.members.length === 1, since);
    const code = created.room.code as string;
    expect(created.room.config.propertyTrading).toBe(propertyTrading ?? true);
    for (const [index, guest] of guests.entries()) {
      since = guest.messages.length;
      guest.send({ type: 'join', code, profile: profiles[index + 1] });
      await guest.wait(message => message.type === 'room' && message.room.members.length === index + 2, since);
      since = host.messages.length;
      guest.send({ type: 'ready', ready: true });
      await host.wait(message => message.type === 'room' && message.room.members[index + 1].ready, since);
    }
    if (withBot) {
      since = host.messages.length;
      host.send({ type: 'addBot', profile: botProfile });
      await host.wait(message => message.type === 'room' && message.room.members.length === playerCount + 1, since);
    }
    if (toggleBeforeStart) {
      expect(propertyTrading).toBeUndefined();
      const setting = (enabled: boolean) => ({ mapId: 'lake', seasons: 4, weatherMode: 'standard', seed, propertyTrading: enabled });
      let hostSince = host.messages.length;
      let guestSince = guests.map(guest => guest.messages.length);
      host.send({ type: 'config', config: setting(false) });
      await host.wait(message => message.type === 'room' && message.room.config.propertyTrading === false, hostSince);
      await Promise.all(guests.map((guest, index) => guest.wait(message => message.type === 'room' && message.room.config.propertyTrading === false, guestSince[index])));
      const firstGuest = guests[0];
      since = firstGuest.messages.length;
      firstGuest.send({ type: 'config', config: setting(true) });
      expect((await firstGuest.wait(message => message.type === 'error', since)).message).toContain('房主');
      hostSince = host.messages.length;
      guestSince = guests.map(guest => guest.messages.length);
      host.send({ type: 'config', config: setting(true) });
      await host.wait(message => message.type === 'room' && message.room.config.propertyTrading === true, hostSince);
      await Promise.all(guests.map((guest, index) => guest.wait(message => message.type === 'room' && message.room.config.propertyTrading === true, guestSince[index])));
    }
    since = host.messages.length;
    host.send({ type: 'start' });
    const started = await host.wait(message => message.type === 'room' && message.room.started, since);
    expect(started.room.state.config.propertyTrading).toBe(propertyTrading ?? true);
    return { host, guests, code };
  }

  async function purchaseFirstLand(host: Client, marketEnabled = true) {
    let since = host.messages.length;
    host.send({ type: 'action', action: { type: 'roll' } });
    const landed = await host.wait(message => message.type === 'room' && message.room.state?.pending?.kind === 'land', since);
    const nodeId = landed.room.state.players[0].position as number;
    since = host.messages.length;
    host.send({ type: 'action', action: marketEnabled ? { type: 'listProperty', nodeId, price: 1000 } : { type: 'choose', choiceId: 'buy' } });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('移动完成');
    await new Promise(resolve => setTimeout(resolve, Math.max(0, landed.room.movementUntil - Date.now() + 10)));
    if (marketEnabled) {
      since = host.messages.length;
      host.send({ type: 'action', action: { type: 'listProperty', nodeId, price: 1000 } });
      expect((await host.wait(message => message.type === 'error', since)).message).toContain('当前决定');
    }
    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'choose', choiceId: 'buy' } });
    const bought = await host.wait(message => message.type === 'room' && message.room.state?.properties[nodeId]?.ownerId === 'p1', since);
    expect(bought.room.state.phase).toBe('end');
    return { nodeId, bought };
  }

  it('accepts only authenticated sellers and atomically settles non-current purchases', async () => {
    const { host, guests: [guest, third], code } = await startRoom(3, undefined, true);
    const { nodeId, bought } = await purchaseFirstLand(host);
    const originalCash = bought.room.state.players.map((player: { cash: number }) => player.cash) as number[];

    let since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'listProperty', nodeId, price: 1200, actorId: 'p1' } });
    expect((await guest.wait(message => message.type === 'error', since)).message).toContain('参数无效');
    since = guest.messages.length;
    guest.send({ type: 'action', actorId: 'p1', action: { type: 'listProperty', nodeId, price: 1200 } });
    expect((await guest.wait(message => message.type === 'error', since)).message).toContain('服务器验证');
    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'listProperty', nodeId, price: 1200 } });
    expect((await guest.wait(message => message.type === 'error', since)).message).toContain('不可执行');

    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'listProperty', nodeId, price: 1200 } });
    const listed = await host.wait(message => message.type === 'room' && message.room.state?.propertyListings?.length === 1, since);
    let listingId = listed.room.state.propertyListings[0].id as string;
    expect(listed.room.state.propertyListings[0]).toMatchObject({ nodeId, sellerId: 'p1', price: 1200 });
    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'cancelListing', listingId } });
    expect((await guest.wait(message => message.type === 'error', since)).message).toContain('不可执行');
    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'cancelListing', listingId } });
    await host.wait(message => message.type === 'room' && message.room.state?.propertyListings?.length === 0, since);
    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'listProperty', nodeId, price: 1200 } });
    const listedAgain = await host.wait(message => message.type === 'room' && message.room.state?.propertyListings?.length === 1, since);
    listingId = listedAgain.room.state.propertyListings[0].id as string;

    // A disconnected human freezes the market, even though the seller and buyer are online.
    since = host.messages.length;
    await third.close();
    await host.wait(message => message.type === 'room' && message.room.members[2].connected === false, since);
    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'buyListing', listingId } });
    expect((await guest.wait(message => message.type === 'error', since)).message).toContain('断线');
    const reconnected = await Client.connect(server.port, third.id);
    clients.push(reconnected);
    since = reconnected.messages.length;
    reconnected.send({ type: 'reconnect', code });
    await reconnected.wait(message => message.type === 'room' && message.room.members[2].connected, since);

    const hostSince = host.messages.length;
    const guestSince = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'buyListing', listingId } });
    const sold = await guest.wait(message => message.type === 'room' && message.room.state?.properties[nodeId]?.ownerId === 'p2', guestSince);
    const mirrored = await host.wait(message => message.type === 'room' && message.room.state?.properties[nodeId]?.ownerId === 'p2', hostSince);
    expect(sold.room.state.propertyListings).toEqual([]);
    expect(mirrored.room.state.propertyListings).toEqual(sold.room.state.propertyListings);
    expect(mirrored.room.state.notices).toEqual(sold.room.state.notices);
    expect(sold.room.state.notices.at(-1)).toMatchObject({ kind: 'trade', playerId: 'p2', recipientId: 'p1', amount: 1200 });
    expect(sold.room.state.players[0].cash).toBe(originalCash[0] + 1200);
    expect(sold.room.state.players[1].cash).toBe(originalCash[1] - 1200);
    expect(sold.room.state.currentPlayerIndex).toBe(0);
    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'buyListing', listingId } });
    expect((await guest.wait(message => message.type === 'error', since)).message).toContain('不可执行');

    // The new owner can list outside their turn; simultaneous buyers race through one state update.
    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'listProperty', nodeId, price: 1500 } });
    const relisted = await guest.wait(message => message.type === 'room' && message.room.state?.propertyListings?.length === 1, since);
    const nextId = relisted.room.state.propertyListings[0].id as string;
    const p1Cash = relisted.room.state.players[0].cash as number;
    const p2Cash = relisted.room.state.players[1].cash as number;
    const p3Cash = relisted.room.state.players[2].cash as number;
    const firstSince = host.messages.length;
    const thirdSince = reconnected.messages.length;
    host.send({ type: 'action', action: { type: 'buyListing', listingId: nextId } });
    reconnected.send({ type: 'action', action: { type: 'buyListing', listingId: nextId } });
    const [firstResult, thirdResult] = await Promise.all([
      host.wait(message => message.type === 'error' || (message.type === 'room' && message.room.state?.properties[nodeId]?.ownerId === 'p1'), firstSince),
      reconnected.wait(message => message.type === 'error' || (message.type === 'room' && message.room.state?.properties[nodeId]?.ownerId === 'p3'), thirdSince),
    ]);
    expect([firstResult.type, thirdResult.type].sort()).toEqual(['error', 'room']);
    const latest = [...host.messages].reverse().find(message => message.type === 'room' && message.room.state?.propertyListings?.length === 0);
    const thirdLatest = [...reconnected.messages].reverse().find(message => message.type === 'room' && message.room.state?.propertyListings?.length === 0);
    expect(latest).toBeDefined();
    expect(thirdLatest?.room.state.propertyListings).toEqual(latest?.room.state.propertyListings);
    const final = latest!.room.state;
    expect(thirdLatest?.room.state.properties[nodeId]).toEqual(final.properties[nodeId]);
    expect(['p1', 'p3']).toContain(final.properties[nodeId].ownerId);
    expect(final.players[1].cash).toBe(p2Cash + 1500);
    expect(final.players[0].cash).toBe(p1Cash - (final.properties[nodeId].ownerId === 'p1' ? 1500 : 0));
    expect(final.players[2].cash).toBe(p3Cash - (final.properties[nodeId].ownerId === 'p3' ? 1500 : 0));
  }, 20_000);

  it('keeps the original AI turn timer while another player repeatedly lists and cancels', async () => {
    const { host, guests: [guest] } = await startRoom(2, undefined, false, true);
    const { nodeId } = await purchaseFirstLand(host);
    let since = host.messages.length;
    host.send({ type: 'action', action: { type: 'endTurn' } });
    await host.wait(message => message.type === 'room' && message.room.state?.currentPlayerIndex === 1, since);
    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'rest' } });
    await guest.wait(message => message.type === 'room' && message.room.state?.phase === 'end', since);
    since = host.messages.length;
    guest.send({ type: 'action', action: { type: 'endTurn' } });
    const botReady = await host.wait(message => message.type === 'room' && message.room.state?.currentPlayerIndex === 2 && message.room.state?.phase === 'ready', since);
    expect(botReady.room.state.players[2].ai).toBe(true);

    const scheduledAt = Date.now();
    let moved = false;
    const movementSince = host.messages.length;
    const movementPromise = host.wait(message => message.type === 'room' && message.room.state?.movement?.playerId === 'p3', movementSince, 1250)
      .then(message => { moved = true; return message; });
    let listingId: string | null = null;
    let lastListings: any[] = [];
    let changes = 0;
    while (!moved && Date.now() - scheduledAt < 1100) {
      const expectedCount: number = listingId ? 0 : 1;
      since = host.messages.length;
      host.send({ type: 'action', action: listingId
        ? { type: 'cancelListing', listingId }
        : { type: 'listProperty', nodeId, price: 1_000_000_000 } });
      const answer = await host.wait(message => message.type === 'error'
        || (message.type === 'room' && message.room.state?.propertyListings?.length === expectedCount), since);
      if (answer.type === 'error') {
        expect(answer.message).toContain('移动完成');
        break;
      }
      lastListings = answer.room.state.propertyListings;
      listingId = expectedCount ? lastListings[0].id : null;
      changes++;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    const aiMove = await movementPromise;
    expect(changes).toBeGreaterThanOrEqual(2);
    expect(Date.now() - scheduledAt).toBeLessThan(1250);
    expect(aiMove.room.state.propertyListings).toEqual(lastListings);
    expect(aiMove.room.state.movement).toMatchObject({ playerId: 'p3', dice: true });
  }, 15_000);

  it('rejects a non-boolean setting and disables both listing and direct offers when switched off', async () => {
    const probe = await Client.connect(server.port); clients.push(probe);
    let since = probe.messages.length;
    probe.send({ type: 'create', profile: profiles[0], config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed: 1, propertyTrading: 'false' } });
    expect((await probe.wait(message => message.type === 'error', since)).message).toContain('设置');

    const { host } = await startRoom(2, false);
    const { nodeId } = await purchaseFirstLand(host, false);
    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'listProperty', nodeId, price: 1000 } });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('关闭房产自由交易');
    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'offerTrade', targetId: 'p2', nodeId, price: 1000 } });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('不可执行');
    since = host.messages.length;
    host.send({ type: 'config', config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed: 2, propertyTrading: true } });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('开局前');
  }, 15_000);
});
