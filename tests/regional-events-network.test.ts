import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import WebSocket from 'ws';
import { expect, it } from 'vitest';
import { createRoomServer } from '../server/index';
import { findEligibleEvent } from '../src/game/eventPool';

type Wire = { type: string; room?: any; message?: string };

class Client {
  private readonly events = new EventEmitter();
  readonly messages: Wire[] = [];
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
    const closed = new Promise<void>(resolve => this.socket.once('close', () => resolve()));
    this.socket.close();
    await closed;
  }
}

const hostProfile = { name: '星河', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' };
const guestProfile = { name: '云岚', color: '#277DA8', shape: 'diamond', ai: false, personality: 'cautious' };

it('shares a lake DLC encounter, restricts selection, and retains the result until endTurn', async () => {
  const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
  const clients: Client[] = [];
  try {
    const host = await Client.connect(server.port); clients.push(host);
    const guest = await Client.connect(server.port); clients.push(guest);
    let since = host.messages.length;
    host.send({ type: 'create', profile: hostProfile, config: { mapId: 'lake', seasons: 4, weatherMode: 'standard', seed: 43 } });
    const created = await host.wait(message => message.type === 'room' && message.room?.members.length === 1, since);
    const code = created.room.code;
    since = guest.messages.length;
    guest.send({ type: 'join', code, profile: guestProfile });
    await guest.wait(message => message.type === 'room' && message.room?.members.length === 2, since);
    since = host.messages.length;
    guest.send({ type: 'ready', ready: true });
    await host.wait(message => message.type === 'room' && message.room?.members[1].ready, since);
    since = guest.messages.length;
    host.send({ type: 'start' });
    await guest.wait(message => message.type === 'room' && message.room?.started, since);

    const hostSince = host.messages.length, guestSince = guest.messages.length;
    host.send({ type: 'action', action: { type: 'roll' } });
    const isRegionalEncounter = (message: Wire) => message.type === 'room'
      && message.room?.state?.pending?.data?.eventId === 'lake_ferry_queue';
    const hostEvent = await host.wait(isRegionalEncounter, hostSince);
    const guestEvent = await guest.wait(isRegionalEncounter, guestSince);
    const event = findEligibleEvent('lake', 'lake_ferry_queue');
    expect(event?.dlc).toBe(true);
    expect(hostEvent.room.state.pending.body).toBe(event?.story);
    expect(hostEvent.room.state.pending).toEqual(guestEvent.room.state.pending);
    expect(hostEvent.room.state.turnEncounters).toEqual(guestEvent.room.state.turnEncounters);
    expect(hostEvent.room.state.turnEncounters).toHaveLength(1);
    expect(hostEvent.room.state.turnEncounters[0]).toMatchObject({
      eventId: event?.id, story: event?.story, choices: hostEvent.room.state.pending.choices,
    });

    await new Promise(resolve => setTimeout(resolve, Math.max(0, hostEvent.room.movementUntil - Date.now() + 10)));
    since = guest.messages.length;
    guest.send({ type: 'action', action: { type: 'choose', choiceId: 'lake_ferry_queue_help' } });
    expect((await guest.wait(message => message.type === 'error', since)).message).toContain('不是你的行动回合');
    expect(host.messages.at(-1)?.room?.state?.turnEncounters?.[0]?.selectedChoiceId).toBeUndefined();

    const hostChoiceSince = host.messages.length, guestChoiceSince = guest.messages.length;
    host.send({ type: 'action', action: { type: 'choose', choiceId: 'lake_ferry_queue_help' } });
    const isChosen = (message: Wire) => message.type === 'room'
      && message.room?.state?.turnEncounters?.[0]?.selectedChoiceId === 'lake_ferry_queue_help';
    const hostChosen = await host.wait(isChosen, hostChoiceSince);
    const guestChosen = await guest.wait(isChosen, guestChoiceSince);
    expect(hostChosen.room.state.turnEncounters).toEqual(guestChosen.room.state.turnEncounters);
    expect(hostChosen.room.state.turnEncounters[0].result).toContain('整理候船栈道');
    expect(hostChosen.room.state.turnEncounters[0].result).toContain('现金+120 PM');
    expect(hostChosen.room.state.currentPlayerIndex).toBe(0);
    expect(hostChosen.room.state.turnEncounters).toHaveLength(1);

    const endSince = guest.messages.length;
    host.send({ type: 'action', action: { type: 'endTurn' } });
    const nextTurn = await guest.wait(message => message.type === 'room' && message.room?.state?.currentPlayerIndex === 1, endSince);
    expect(nextTurn.room.state.turnEncounters).toEqual([]);
  } finally {
    for (const client of clients) await client.close();
    await server.close();
  }
}, 15_000);

it('synchronizes both new-map DLC encounters and keeps their choices private to the active player', async () => {
  const server = await createRoomServer({ port: 0, host: '127.0.0.1' });
  try {
    for (const { mapId, seed, eventId, choiceId } of [
      { mapId: 'forest', seed: 43, eventId: 'forest_root_marker', choiceId: 'forest_root_marker_pay' },
      { mapId: 'starSands', seed: 20, eventId: 'sands_night_awning', choiceId: 'sands_night_awning_snack' },
    ] as const) {
      const clients: Client[] = [];
      try {
        const host = await Client.connect(server.port); clients.push(host);
        const guest = await Client.connect(server.port); clients.push(guest);
        let since = host.messages.length;
        host.send({ type: 'create', profile: hostProfile, config: { mapId, seasons: 4, weatherMode: 'standard', seed } });
        const created = await host.wait(message => message.type === 'room' && message.room?.members.length === 1, since);
        since = guest.messages.length;
        guest.send({ type: 'join', code: created.room.code, profile: guestProfile });
        await guest.wait(message => message.type === 'room' && message.room?.members.length === 2, since);
        since = host.messages.length;
        guest.send({ type: 'ready', ready: true });
        await host.wait(message => message.type === 'room' && message.room?.members[1].ready, since);
        since = host.messages.length;
        host.send({ type: 'start' });
        await host.wait(message => message.type === 'room' && message.room?.started, since);

        const hostSince = host.messages.length, guestSince = guest.messages.length;
        host.send({ type: 'action', action: { type: 'roll' } });
        const isEvent = (message: Wire) => message.type === 'room'
          && message.room?.state?.pending?.data?.eventId === eventId;
        const hostEvent = await host.wait(isEvent, hostSince);
        const guestEvent = await guest.wait(isEvent, guestSince);
        const event = findEligibleEvent(mapId, eventId)!;
        expect(event).toMatchObject({ mapId, dlc: true });
        expect(hostEvent.room.state.pending).toEqual(guestEvent.room.state.pending);
        expect(hostEvent.room.state.pending.body).toBe(event.story);
        expect(hostEvent.room.state.pending.choices).toEqual(event.choices.map(choice => ({
          id: choice.id, label: choice.label, description: choice.description, disabled: false,
        })));
        expect(hostEvent.room.state.turnEncounters).toEqual(guestEvent.room.state.turnEncounters);
        expect(hostEvent.room.state.turnEncounters[0]).toMatchObject({ eventId, story: event.story });

        await new Promise(resolve => setTimeout(resolve, Math.max(0, hostEvent.room.movementUntil - Date.now() + 10)));
        since = guest.messages.length;
        guest.send({ type: 'action', action: { type: 'choose', choiceId } });
        expect((await guest.wait(message => message.type === 'error', since)).message).toContain('不是你的行动回合');
        expect(host.messages.at(-1)?.room?.state?.turnEncounters?.[0]?.selectedChoiceId).toBeUndefined();

        const choiceHostSince = host.messages.length, choiceGuestSince = guest.messages.length;
        host.send({ type: 'action', action: { type: 'choose', choiceId } });
        const isChosen = (message: Wire) => message.type === 'room'
          && message.room?.state?.turnEncounters?.[0]?.selectedChoiceId === choiceId;
        const hostChosen = await host.wait(isChosen, choiceHostSince);
        const guestChosen = await guest.wait(isChosen, choiceGuestSince);
        expect(hostChosen.room.state.turnEncounters).toEqual(guestChosen.room.state.turnEncounters);
        expect(hostChosen.room.state.turnEncounters[0].result).toContain(event.choices.find(choice => choice.id === choiceId)!.label);
        if (mapId === 'forest') expect(hostChosen.room.state.players[0].cash).toBe(hostEvent.room.state.players[0].cash - 350);
        else expect(hostChosen.room.state.players[0].inventory.filter((slot: { itemId: string }) => slot.itemId === 'snack').length)
          .toBe(hostEvent.room.state.players[0].inventory.filter((slot: { itemId: string }) => slot.itemId === 'snack').length + 1);
        expect(hostChosen.room.state.currentPlayerIndex).toBe(0);

        since = guest.messages.length;
        host.send({ type: 'action', action: { type: 'endTurn' } });
        const next = await guest.wait(message => message.type === 'room' && message.room?.state?.currentPlayerIndex === 1, since);
        expect(next.room.state.turnEncounters).toEqual([]);
      } finally {
        for (const client of clients) await client.close();
      }
    }
  } finally {
    await server.close();
  }
}, 30_000);
