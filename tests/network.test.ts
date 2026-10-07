import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { act, createGame, getRent } from '../src/game/engine';
import { RENT_MOOD_LOSS } from '../src/game/economy';
import { getMovementTimeline } from '../src/game/presentation';
import { PLAYER_COLORS } from '../src/game/colors';
import { createRoomServer, type RoomServer } from '../server/index';
import type { GameConfig, Movement } from '../src/game/types';

type Wire = { type: string; room?: any; message?: string };
class Client {
  readonly id = randomUUID();
  readonly socket: WebSocket;
  readonly messages: Wire[] = [];
  private readonly events = new EventEmitter();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.on('message', raw => {
      const message = JSON.parse(raw.toString()) as Wire;
      this.messages.push(message);
      this.events.emit('message', message, this.messages.length - 1);
    });
  }

  static async connect(port: number, id?: string) {
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    const client = new Client(socket);
    if (id) Object.defineProperty(client, 'id', { value: id });
    const since = client.messages.length;
    client.send({ type: 'hello', clientId: client.id });
    await client.wait(message => message.type === 'hello', since);
    return client;
  }

  send(message: unknown) { this.socket.send(JSON.stringify(message)); }
  wait(predicate: (message: Wire) => boolean, since = 0, timeout = 5000): Promise<Wire> {
    const found = this.messages.slice(since).find(predicate);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.events.off('message', onMessage); reject(new Error('Timed out waiting for server message')); }, timeout);
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
    const done = new Promise<void>(resolve => this.socket.once('close', () => resolve()));
    this.socket.close();
    await done;
  }
}

const hostProfile = { name: '星河', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' };
const guestProfile = { name: '云岚', color: '#D55B48', shape: 'diamond', ai: false, personality: 'cautious' };
const botProfile = { name: '阿湛', color: '#D55B48', shape: 'hexagon', ai: true, personality: 'aggressive' };

function landSeed(): number {
  for (let seed = 1; seed < 5000; seed++) {
    const config: GameConfig = { mapId: 'lake', mode: 'pvp', seasons: 4, weatherMode: 'standard', seed, players: [hostProfile, guestProfile, botProfile] as GameConfig['players'] };
    const state = act(createGame(config), { type: 'roll' });
    if (state.pending?.kind === 'land') return seed;
  }
  throw new Error('Could not find a deterministic land roll');
}

function beaconSeed(): number {
  for (let seed = 1; seed < 20_000; seed++) {
    const config: GameConfig = { mapId: 'lake', mode: 'pvp', seasons: 4, weatherMode: 'standard', seed,
      players: [hostProfile, guestProfile] as GameConfig['players'] };
    const landed = act(createGame(config), { type: 'roll' });
    if (landed.pending?.data?.eventId === 'beacon_lab'
      && act(landed, { type: 'choose', choiceId: 'beacon_lab_assist' }).phase === 'end') return seed;
  }
  throw new Error('Could not find a deterministic beacon_lab opening');
}

function expectStepTimeline(movement: Movement) {
  const timeline = getMovementTimeline(movement);
  const stages = timeline.stages;
  expect(stages.slice(0, 2).map(stage => stage.kind)).toEqual(['roll', 'result']);
  expect(stages.at(-1)?.kind).toBe('effect');
  expect(timeline.duration).toBe(stages.at(-1)?.end);
  if (movement.modifier !== 0) {
    expect(stages.slice(2, 4).map(stage => stage.kind)).toEqual(['adjust', 'adjusted']);
    expect(stages[3].label).toBe(String(Math.max(0, movement.roll + movement.modifier)));
  }
  for (const segment of movement.segments ?? []) {
    const moves = stages.filter(stage => stage.kind === 'move' && stage.segmentKind === segment.kind);
    expect(moves).toHaveLength(segment.path.length - 1);
    segment.path.slice(1).forEach((destination, index) => {
      expect(moves[index].path).toEqual([segment.path[index], destination]);
      expect(moves[index].stepIndex).toBe(index + 1);
      expect(moves[index].stepCount).toBe(segment.path.length - 1);
    });
  }
  return timeline;
}

describe('authoritative room server', () => {
  let server: RoomServer;
  const clients: Client[] = [];
  beforeAll(async () => { server = await createRoomServer({ port: 0, host: '127.0.0.1' }); });
  afterAll(async () => { for (const client of clients) await client.close(); if (server) await server.close(); });

  it('coordinates two WebSocket clients, permissions, reconnect, movement and trade buyer', async () => {
    const host = await Client.connect(server.port); clients.push(host);
    const guest = await Client.connect(server.port); clients.push(guest);
    const seed = landSeed();
    let since = host.messages.length;
    host.send({ type: 'create', profile: hostProfile, config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed } });
    const created = await host.wait(m => m.type === 'room' && m.room.members.length === 1, since);
    const code = created.room.code;
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(JSON.stringify(created.room)).not.toContain(host.id);

    since = guest.messages.length;
    guest.send({ type: 'join', code, profile: guestProfile });
    const joined = await guest.wait(m => m.type === 'room' && m.room.members.length === 2, since);
    expect(joined.room.isHost).toBe(false);
    expect(joined.room.members[1].ready).toBe(false);
    expect(joined.room.members.map((member: { color: string }) => member.color)).toEqual(PLAYER_COLORS.slice(0, 2).map(entry => entry.color));

    since = guest.messages.length;
    guest.send({ type: 'start' });
    expect((await guest.wait(m => m.type === 'error', since)).message).toContain('房主');

    since = host.messages.length;
    guest.send({ type: 'ready', ready: true });
    await host.wait(m => m.type === 'room' && m.room.members[1].ready, since);
    since = host.messages.length;
    host.send({ type: 'addBot', profile: botProfile });
    const withBot = await host.wait(m => m.type === 'room' && m.room.members.length === 3, since);
    expect(withBot.room.members.map((member: { color: string }) => member.color)).toEqual(PLAYER_COLORS.slice(0, 3).map(entry => entry.color));

    since = guest.messages.length;
    host.send({ type: 'start' });
    const started = await guest.wait(m => m.type === 'room' && m.room.started, since);
    expect(started.room.youPlayerId).toBe('p2');
    expect(started.room.members[2].ai).toBe(true);
    expect(started.room.state.players.map((player: { color: string }) => player.color)).toEqual(PLAYER_COLORS.slice(0, 3).map(entry => entry.color));

    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'roll' } });
    expect((await guest.wait(m => m.type === 'error', since)).message).toContain('不是你的行动回合');

    const hostSince = host.messages.length;
    const guestSince = guest.messages.length;
    host.send({ type: 'action', action: { type: 'roll' } });
    const hostRoll = await host.wait(m => m.type === 'room' && !!m.room.state?.movement, hostSince);
    const guestRoll = await guest.wait(m => m.type === 'room' && !!m.room.state?.movement, guestSince);
    expect(hostRoll.room.state.movement).toEqual(guestRoll.room.state.movement);
    expect(hostRoll.room.state.movement.dice).toBe(true);
    expect(hostRoll.room.state.movement.segments?.[0]?.kind).toBe('normal');
    const hostTimeline = expectStepTimeline(hostRoll.room.state.movement);
    expect(getMovementTimeline(guestRoll.room.state.movement)).toEqual(hostTimeline);
    expect(hostRoll.room.movementUntil).toBe(guestRoll.room.movementUntil);
    expect(hostRoll.room.movementUntil).toBeGreaterThan(Date.now());
    expect(hostRoll.room.movementUntil - Date.now()).toBeLessThanOrEqual(hostTimeline.duration + 300);
    expect(hostRoll.room.state.pending?.kind).toBe('land');

    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'choose', choiceId: 'buy' } });
    expect((await host.wait(m => m.type === 'error', since)).message).toContain('移动完成');
    await new Promise(resolve => setTimeout(resolve, Math.max(0, hostRoll.room.movementUntil - Date.now() + 10)));
    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'choose', choiceId: 'buy' } });
    const bought = await host.wait(m => m.type === 'room' && Object.keys(m.room.state.properties).length > 0, since);
    const nodeId = Number(Object.keys(bought.room.state.properties)[0]);

    since = guest.messages.length;
    host.send({ type: 'action', action: { type: 'offerTrade', targetId: 'p2', nodeId, price: 1500 } });
    const offered = await guest.wait(m => m.type === 'room' && m.room.state?.pending?.kind === 'trade', since);
    expect(offered.room.state.pending.data.buyerId).toBe('p2');

    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'choose', choiceId: 'accept' } });
    expect((await host.wait(m => m.type === 'error', since)).message).toContain('不是你的行动回合');
    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'choose', choiceId: 'accept' } });
    const accepted = await guest.wait(m => m.type === 'room' && m.room.state?.properties[nodeId]?.ownerId === 'p2', since);
    expect(accepted.room.state.pending).toBeNull();

    // Both human clients have the full roll timeline before the server advances an AI turn.
    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'endTurn' } });
    await host.wait(m => m.type === 'room' && m.room.state?.currentPlayerIndex === 1, since);
    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'rest' } });
    await guest.wait(m => m.type === 'room' && m.room.state?.phase === 'end', since);
    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'endTurn' } });
    const aiStarted = await guest.wait(m => m.type === 'room' && m.room.state?.currentPlayerIndex === 2, since);
    const aiStartIndex = host.messages.length;
    const aiRoll = await host.wait(m => m.type === 'room' && m.room.state?.movement?.playerId === 'p3' && m.room.state.movement.id !== hostRoll.room.state.movement.id, aiStartIndex, 7000);
    const aiTimeline = expectStepTimeline(aiRoll.room.state.movement);
    const afterAiRoll = host.messages.length;
    const roomCount = host.messages.filter(m => m.type === 'room').length;
    await new Promise(resolve => setTimeout(resolve, Math.max(0, aiRoll.room.movementUntil - Date.now() - 120)));
    expect(host.messages.filter(m => m.type === 'room')).toHaveLength(roomCount);
    expect(aiStarted.room.state.currentPlayerIndex).toBe(2);
    await host.wait(m => m.type === 'room', afterAiRoll, Math.max(1000, aiTimeline.duration + 500));

    await guest.close();
    since = host.messages.length;
    const disconnected = await host.wait(m => m.type === 'room' && !m.room.members[1].connected, since - 1);
    expect(disconnected.room.members[1].seatId).toBe(joined.room.youSeatId);
    const rejoined = await Client.connect(server.port, guest.id); clients.push(rejoined);
    since = rejoined.messages.length;
    rejoined.send({ type: 'reconnect', code });
    const restored = await rejoined.wait(m => m.type === 'room' && m.room.members[1].connected, since);
    expect(restored.room.youSeatId).toBe(joined.room.youSeatId);
    expect(restored.room.youPlayerId).toBe('p2');
    expect(restored.room.members[1].color).toBe(PLAYER_COLORS[1].color);

    const newer = await Client.connect(server.port, guest.id); clients.push(newer);
    const oldSince = rejoined.messages.length;
    since = newer.messages.length;
    newer.send({ type: 'reconnect', code });
    const takenOver = await newer.wait(m => m.type === 'room' && m.room.members[1].connected, since);
    expect(takenOver.room.youSeatId).toBe(joined.room.youSeatId);
    expect((await rejoined.wait(m => m.type === 'left', oldSince)).type).toBe('left');
  }, 30_000);

  it('shares the current turn encounter and its selected result with both PVP clients', async () => {
    let seed = 0;
    for (let candidate = 1; candidate < 20_000; candidate++) {
      const preview: GameConfig = { mapId: 'lake', mode: 'pvp', seasons: 4, weatherMode: 'standard', seed: candidate,
        players: [hostProfile, guestProfile] as GameConfig['players'] };
      const landed = act(createGame(preview), { type: 'roll' });
      if (landed.pending?.data?.eventId !== 'archive') continue;
      const choice = landed.pending.choices.find(entry => !entry.disabled);
      if (choice && act(landed, { type: 'choose', choiceId: choice.id }).phase === 'end') { seed = candidate; break; }
    }
    expect(seed).toBeGreaterThan(0);
    const host = await Client.connect(server.port); clients.push(host);
    const guest = await Client.connect(server.port); clients.push(guest);
    let since = host.messages.length;
    host.send({ type: 'create', profile: hostProfile, config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed } });
    const created = await host.wait(message => message.type === 'room' && message.room.members.length === 1, since);
    const code = created.room.code;
    since = guest.messages.length;
    guest.send({ type: 'join', code, profile: guestProfile });
    await guest.wait(message => message.type === 'room' && message.room.code === code && message.room.members.length === 2, since);
    since = host.messages.length;
    guest.send({ type: 'ready', ready: true });
    await host.wait(message => message.type === 'room' && message.room.code === code && message.room.members[1].ready, since);
    since = guest.messages.length;
    host.send({ type: 'start' });
    await guest.wait(message => message.type === 'room' && message.room.code === code && message.room.started, since);

    const hostSince = host.messages.length, guestSince = guest.messages.length;
    host.send({ type: 'action', action: { type: 'roll' } });
    const hostEvent = await host.wait(message => message.type === 'room' && message.room.code === code && message.room.state?.pending?.kind === 'event', hostSince);
    const guestEvent = await guest.wait(message => message.type === 'room' && message.room.code === code && message.room.state?.pending?.kind === 'event', guestSince);
    expect(hostEvent.room.state.turnEncounters).toHaveLength(1);
    expect(hostEvent.room.state.turnEncounters).toEqual(guestEvent.room.state.turnEncounters);
    expect(hostEvent.room.state.turnEncounters[0]).toMatchObject({ playerId: 'p1', nodeId: hostEvent.room.state.players[0].position,
      eventId: hostEvent.room.state.pending.data.eventId, choices: hostEvent.room.state.pending.choices });

    await new Promise(resolve => setTimeout(resolve, Math.max(0, hostEvent.room.movementUntil - Date.now() + 10)));
    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'choose', choiceId: hostEvent.room.state.pending.choices[0].id } });
    expect((await guest.wait(message => message.type === 'error', since)).message).toContain('不是你的行动回合');
    const choiceId = hostEvent.room.state.pending.choices.find((choice: { disabled?: boolean }) => !choice.disabled).id;
    const hostChoiceSince = host.messages.length, guestChoiceSince = guest.messages.length;
    host.send({ type: 'action', action: { type: 'choose', choiceId } });
    const hostChosen = await host.wait(message => message.type === 'room' && message.room.code === code && message.room.state?.turnEncounters?.[0]?.selectedChoiceId === choiceId, hostChoiceSince);
    const guestChosen = await guest.wait(message => message.type === 'room' && message.room.code === code && message.room.state?.turnEncounters?.[0]?.selectedChoiceId === choiceId, guestChoiceSince);
    expect(hostChosen.room.state.turnEncounters).toEqual(guestChosen.room.state.turnEncounters);
    expect(hostChosen.room.state.turnEncounters[0].result).toContain('选择');
    since = guest.messages.length;
    host.send({ type: 'action', action: { type: 'endTurn' } });
    const nextTurn = await guest.wait(message => message.type === 'room' && message.room.code === code && message.room.state?.currentPlayerIndex === 1, since);
    expect(nextTurn.room.state.turnEncounters).toEqual([]);
  }, 15_000);

  it('shares a controlled D6 roll from an earned controller and rejects remote or invalid use', async () => {
    const seed = beaconSeed();
    const preview: GameConfig = { mapId: 'lake', mode: 'pvp', seasons: 4, weatherMode: 'standard', seed,
      players: [hostProfile, guestProfile] as GameConfig['players'] };
    expect(act(createGame(preview), { type: 'roll' }).pending?.data?.eventId).toBe('beacon_lab');
    const host = await Client.connect(server.port); clients.push(host);
    const guest = await Client.connect(server.port); clients.push(guest);
    let since = host.messages.length;
    host.send({ type: 'create', profile: hostProfile, config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed } });
    const created = await host.wait(message => message.type === 'room' && message.room.members.length === 1, since);
    const code = created.room.code;
    since = guest.messages.length;
    guest.send({ type: 'join', code, profile: guestProfile });
    await guest.wait(message => message.type === 'room' && message.room.members.length === 2, since);
    since = host.messages.length;
    guest.send({ type: 'ready', ready: true });
    await host.wait(message => message.type === 'room' && message.room.members[1].ready, since);
    since = guest.messages.length;
    host.send({ type: 'start' });
    await guest.wait(message => message.type === 'room' && message.room.started, since);

    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'roll' } });
    const encountered = await host.wait(message => message.type === 'room' && message.room.state?.pending?.data?.eventId === 'beacon_lab', since);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, encountered.room.movementUntil - Date.now() + 10)));
    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'choose', choiceId: 'beacon_lab_assist' } });
    const earned = await host.wait(message => message.type === 'room' && message.room.state?.players[0].inventory.some((slot: { itemId: string }) => slot.itemId === 'controller'), since);
    const itemUid = earned.room.state.players[0].inventory.find((slot: { itemId: string }) => slot.itemId === 'controller').uid;
    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'endTurn' } });
    await host.wait(message => message.type === 'room' && message.room.state?.currentPlayerIndex === 1, since);
    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'rest' } });
    await guest.wait(message => message.type === 'room' && message.room.state?.phase === 'end', since);
    since = host.messages.length;
    guest.send({ type: 'action', action: { type: 'endTurn' } });
    await host.wait(message => message.type === 'room' && message.room.state?.currentPlayerIndex === 0 && message.room.state?.phase === 'ready', since);

    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'useItem', itemUid, diceValue: 4 } });
    expect((await guest.wait(message => message.type === 'error', since)).message).toContain('不是你的行动回合');
    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'useItem', itemUid, diceValue: 0 } });
    expect((await host.wait(message => message.type === 'error', since)).message).toBeTruthy();
    const hostSince = host.messages.length, guestSince = guest.messages.length;
    host.send({ type: 'action', action: { type: 'useItem', itemUid, diceValue: 4 } });
    const selected = await host.wait(message => message.type === 'room' && message.room.state?.controlledRoll === 4, hostSince);
    const guestSelected = await guest.wait(message => message.type === 'room' && message.room.state?.controlledRoll === 4, guestSince);
    expect(selected.room.state.players[0].inventory.some((slot: { uid: string }) => slot.uid === itemUid)).toBe(false);
    expect(guestSelected.room.state.selectedDie).toBe(6);
    const rollSince = host.messages.length, guestRollSince = guest.messages.length;
    host.send({ type: 'action', action: { type: 'roll' } });
    const rolled = await host.wait(message => message.type === 'room' && message.room.state?.movement?.controlled === true, rollSince);
    const guestRolled = await guest.wait(message => message.type === 'room' && message.room.state?.movement?.controlled === true, guestRollSince);
    expect(rolled.room.state.movement).toEqual(guestRolled.room.state.movement);
    expect(rolled.room.state.movement).toMatchObject({ roll: 4, controlled: true, dice: true });
    expect(rolled.room.state.controlledRoll).toBeNull();
  }, 20_000);

  it('lets only the landed PVP payer decide whether to keep a rent card', async () => {
    let seed = 0;
    for (let candidate = 1; candidate < 20_000; candidate++) {
      const preview: GameConfig = { mapId: 'lake', mode: 'pvp', seasons: 4, weatherMode: 'standard', seed: candidate,
        players: [hostProfile, guestProfile] as GameConfig['players'] };
      const first = act(createGame(preview), { type: 'roll' });
      if (first.pending?.kind !== 'land' || first.players[0].position !== 1) continue;
      const second = act(act(act(first, { type: 'choose', choiceId: 'buy' }), { type: 'endTurn' }), { type: 'roll' });
      if (second.pending?.kind === 'rent' && second.pending.data?.nodeId === 1) { seed = candidate; break; }
    }
    expect(seed).toBeGreaterThan(0);
    const host = await Client.connect(server.port); clients.push(host);
    const guest = await Client.connect(server.port); clients.push(guest);
    let since = host.messages.length;
    host.send({ type: 'create', profile: hostProfile, config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed } });
    const created = await host.wait(message => message.type === 'room' && message.room.members.length === 1, since);
    const code = created.room.code;
    since = guest.messages.length;
    guest.send({ type: 'join', code, profile: guestProfile });
    await guest.wait(message => message.type === 'room' && message.room.members.length === 2, since);
    since = host.messages.length;
    guest.send({ type: 'ready', ready: true });
    await host.wait(message => message.type === 'room' && message.room.members[1].ready, since);
    since = host.messages.length;
    host.send({ type: 'start' });
    await host.wait(message => message.type === 'room' && message.room.started, since);

    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'roll' } });
    const landed = await host.wait(message => message.type === 'room' && message.room.state?.pending?.kind === 'land', since);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, landed.room.movementUntil - Date.now() + 10)));
    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'choose', choiceId: 'buy' } });
    const bought = await host.wait(message => message.type === 'room' && message.room.state?.properties?.[1]?.ownerId === 'p1', since);
    since = guest.messages.length;
    host.send({ type: 'action', action: { type: 'endTurn' } });
    await guest.wait(message => message.type === 'room' && message.room.state?.currentPlayerIndex === 1, since);
    const hostSince = host.messages.length, guestSince = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'roll' } });
    const prompted = await guest.wait(message => message.type === 'room' && message.room.state?.pending?.kind === 'rent', guestSince);
    const hostPrompted = await host.wait(message => message.type === 'room' && message.room.state?.pending?.kind === 'rent', hostSince);
    const rent = getRent(prompted.room.state, 1);
    expect(prompted.room.state.pending).toMatchObject({ data: { nodeId: 1, ownerId: 'p1', amount: rent } });
    expect(hostPrompted.room.state.pending).toEqual(prompted.room.state.pending);
    expect(prompted.room.state.players[0].cash).toBe(bought.room.state.players[0].cash);
    expect(prompted.room.state.notices?.filter((entry: { kind: string }) => entry.kind === 'rent')).toHaveLength(0);
    await new Promise(resolve => setTimeout(resolve, Math.max(0, prompted.room.movementUntil - Date.now() + 10)));
    since = host.messages.length;
    host.send({ type: 'action', action: { type: 'choose', choiceId: 'use_card' } });
    expect((await host.wait(message => message.type === 'error', since)).message).toContain('不是你的行动回合');
    const guestChoiceSince = guest.messages.length, hostChoiceSince = host.messages.length;
    guest.send({ type: 'action', action: { type: 'choose', choiceId: 'pay' } });
    const paid = await guest.wait(message => message.type === 'room' && message.room.state?.notices?.some((entry: { kind: string }) => entry.kind === 'rent'), guestChoiceSince);
    const observed = await host.wait(message => message.type === 'room' && message.room.state?.notices?.some((entry: { kind: string }) => entry.kind === 'rent'), hostChoiceSince);
    expect(paid.room.state.notices).toEqual(observed.room.state.notices);
    expect(paid.room.state.notices.filter((entry: { kind: string }) => entry.kind === 'rent')).toHaveLength(1);
    expect(paid.room.state.notices.at(-1)).toMatchObject({ amount: rent, playerId: 'p2', recipientId: 'p1' });
    expect(paid.room.state.notices.at(-1).body).toContain(`心情 −${RENT_MOOD_LOSS}`);
    expect(paid.room.state.players[1].inventory.some((slot: { itemId: string }) => slot.itemId === 'rent')).toBe(true);
    expect(paid.room.state.players[0].cash).toBe(bought.room.state.players[0].cash + rent);
    expect(paid.room.state.players[1].cash).toBe(prompted.room.state.players[1].cash - rent);
    expect(paid.room.state.players[1].mood).toBe(prompted.room.state.players[1].mood - RENT_MOOD_LOSS);
    expect(paid.room.state.players[1].mood).toBe(observed.room.state.players[1].mood);
  }, 20_000);
});
