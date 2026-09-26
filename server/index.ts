import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { createServer, type Server as HttpServer } from 'node:http';
import { randomInt, randomUUID } from 'node:crypto';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';
import { act, createGame, runAI } from '../src/game/engine';
import { getMovementTimeline } from '../src/game/presentation';
import { assignPlayerColor } from '../src/game/colors';
import type { GameAction, GameState, MapId, Personality, PlayerConfig, Shape } from '../src/game/types';

type RoomConfig = { mapId: MapId; seasons: number; weatherMode: 'standard' | 'challenge'; seed: number; propertyTrading?: boolean };
type Member = { seatId: string; clientId: string | null; name: string; color: string; shape: Shape; ai: boolean; personality: Personality; ready: boolean; connected: boolean; host: boolean };
type Room = { code: string; members: Member[]; config: RoomConfig; started: boolean; state: GameState | null; sockets: Map<string, WebSocket>; timer: ReturnType<typeof setTimeout> | null; movementUntil: number; lastMovementId: number | null; touched: number };
type Session = { clientId: string | null; roomCode: string | null; seatId: string | null; received: number[] };
type Message = Record<string, unknown>;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = resolve(ROOT, 'dist');
const MAX_ROOMS = 100;
const MAX_MESSAGE_BYTES = 16 * 1024;
const MAX_MESSAGES_PER_10_SECONDS = 50;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const mapIds: MapId[] = ['lake', 'coast', 'valley', 'sundered'];
const shapes: Shape[] = ['diamond', 'circle', 'hexagon', 'triangle'];
const personalities: Personality[] = ['cautious', 'balanced', 'aggressive'];
const actionTypes: GameAction['type'][] = ['roll', 'rest', 'endTurn', 'choose', 'useItem', 'discardItem', 'stockTrade', 'offerTrade', 'listProperty', 'cancelListing', 'buyListing', 'mortgage', 'redeem', 'sellAsset', 'pawnItem', 'redeemItem', 'dismissSeason'];
const listingActions = new Set<GameAction['type']>(['listProperty', 'cancelListing', 'buyListing']);

function record(value: unknown): value is Message { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function send(socket: WebSocket, value: unknown) { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value)); }
function error(socket: WebSocket, message: string) { send(socket, { type: 'error', message }); }
function code(): string { return Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join(''); }
function validClientId(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function profile(value: unknown, ai: boolean): PlayerConfig | null {
  if (!record(value) || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 24
    || typeof value.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(value.color)
    || !shapes.includes(value.shape as Shape) || !personalities.includes(value.personality as Personality)) return null;
  return { name: value.name.trim(), color: value.color, shape: value.shape as Shape, personality: value.personality as Personality, ai };
}
function config(value: unknown): RoomConfig | null {
  if (!record(value) || !mapIds.includes(value.mapId as MapId) || ![0, 4, 8, 16].includes(value.seasons as number)
    || !['standard', 'challenge'].includes(value.weatherMode as string) || !Number.isSafeInteger(value.seed)
    || (value.seed as number) < 0 || (value.seed as number) > 0xffff_ffff
    || (value.propertyTrading !== undefined && typeof value.propertyTrading !== 'boolean')) return null;
  return { mapId: value.mapId as MapId, seasons: value.seasons as number, weatherMode: value.weatherMode as RoomConfig['weatherMode'], seed: value.seed as number,
    propertyTrading: value.propertyTrading ?? true };
}
function action(value: unknown): GameAction | null {
  if (!record(value) || !actionTypes.includes(value.type as GameAction['type']) || value.actorId !== undefined) return null;
  const result: GameAction = { type: value.type as GameAction['type'] };
  for (const key of ['choiceId', 'itemUid', 'targetId', 'stockId', 'weatherId', 'listingId'] as const) {
    if (value[key] !== undefined) {
      if (typeof value[key] !== 'string' || (value[key] as string).length > 80) return null;
      result[key] = value[key] as string;
    }
  }
  for (const key of ['nodeId', 'quantity', 'price'] as const) {
    if (value[key] !== undefined) {
      if (!Number.isSafeInteger(value[key]) || Math.abs(value[key] as number) > 1_000_000_000) return null;
      result[key] = value[key] as number;
    }
  }
  if (value.diceValue !== undefined) {
    if (value.type !== 'useItem' || !Number.isSafeInteger(value.diceValue) || (value.diceValue as number) < 1 || (value.diceValue as number) > 6) return null;
    result.diceValue = value.diceValue as number;
  }
  return result;
}
function publicMember(member: Member) {
  const { clientId: _clientId, ...rest } = member;
  return rest;
}
function movementDelay(state: GameState): number { return state.movement ? getMovementTimeline(state.movement).duration + 300 : 0; }

export type RoomServer = { httpServer: HttpServer; wss: WebSocketServer; port: number; close: () => Promise<void> };

export function listenOptionsFromEnv(env: NodeJS.ProcessEnv): { port: number; host: string } {
  const rawPort = env.PORT;
  if (rawPort !== undefined && (!/^\d+$/.test(rawPort) || Number(rawPort) > 65535)) throw new Error('PORT must be an integer from 0 to 65535.');
  const host = env.HOST ?? '0.0.0.0';
  if (!host.trim() || host !== host.trim()) throw new Error('HOST must be a non-empty hostname or IP address.');
  return { port: rawPort === undefined ? 8787 : Number(rawPort), host };
}

export async function createRoomServer(options: { port?: number; host?: string; distDir?: string } = {}): Promise<RoomServer> {
  const staticDir = resolve(options.distDir ?? DIST);
  const rooms = new Map<string, Room>();
  const sessions = new Map<WebSocket, Session>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });
  wss.on('error', error => console.error('WebSocket server error:', error));

  async function staticFile(path: string): Promise<{ path: string; size: number } | null> {
    try {
      const [base, actual] = await Promise.all([realpath(staticDir), realpath(path)]);
      if (actual !== base && !actual.startsWith(base + sep)) return null;
      const info = await stat(actual);
      return info.isFile() ? { path: actual, size: info.size } : null;
    } catch { return null; }
  }

  function roomOf(socket: WebSocket): { room: Room; member: Member } | null {
    const session = sessions.get(socket);
    const room = session?.roomCode ? rooms.get(session.roomCode) : undefined;
    const member = room?.members.find(item => item.seatId === session?.seatId && item.clientId === session?.clientId);
    return room && member ? { room, member } : null;
  }

  function snapshot(room: Room, member: Member) {
    const index = room.members.findIndex(item => item.seatId === member.seatId);
    return { code: room.code, members: room.members.map(publicMember), config: room.config, started: room.started, state: room.state,
      movementUntil: room.movementUntil,
      youSeatId: member.seatId, youPlayerId: room.started && index >= 0 ? room.state?.players[index]?.id ?? null : null, isHost: member.host };
  }

  function broadcast(room: Room) {
    room.touched = Date.now();
    for (const member of room.members) {
      if (member.ai) continue;
      const socket = room.sockets.get(member.seatId);
      if (socket) send(socket, { type: 'room', room: snapshot(room, member) });
    }
  }

  function clearRoom(room: Room) {
    if (room.timer) clearTimeout(room.timer);
    room.timer = null;
    for (const socket of room.sockets.values()) {
      const session = sessions.get(socket);
      if (session) { session.roomCode = null; session.seatId = null; }
      send(socket, { type: 'left' });
    }
    room.sockets.clear();
    rooms.delete(room.code);
  }

  function transferHost(room: Room, intentional: boolean) {
    if (room.members.some(m => m.host && m.connected && !m.ai)) return;
    const successor = room.members.find(m => !m.ai && m.connected);
    if (successor) {
      for (const member of room.members) member.host = false;
      successor.host = true;
      successor.ready = true;
    } else if (intentional) clearRoom(room);
  }

  function scheduleAI(room: Room) {
    if (room.timer) { clearTimeout(room.timer); room.timer = null; }
    const state = room.state;
    if (!state || state.phase === 'gameover' || state.seasonReport || room.members.some(m => !m.ai && !m.connected)) return;
    if (state.pending?.kind === 'trade') {
      const buyerId = state.pending.data?.buyerId;
      const buyer = state.players.find(p => p.id === buyerId);
      if (!buyer?.ai) return;
    }
    const current = state.players[state.currentPlayerIndex];
    if (!current?.ai) return;
    const wait = Math.max(450, room.movementUntil - Date.now() + 50);
    room.timer = setTimeout(() => {
      room.timer = null;
      if (!room.state) return;
      const next = runAI(room.state);
      if (next === room.state) return;
      room.state = next;
      noteMovement(room);
      broadcast(room);
      scheduleAI(room);
    }, wait);
    room.timer.unref?.();
  }

  function noteMovement(room: Room) {
    const movement = room.state?.movement;
    if (movement && movement.id !== room.lastMovementId) {
      room.lastMovementId = movement.id;
      room.movementUntil = Date.now() + movementDelay(room.state!);
    }
  }

  function claim(socket: WebSocket, room: Room, member: Member) {
    const previous = room.sockets.get(member.seatId);
    if (previous && previous !== socket) {
      const old = sessions.get(previous);
      if (old) { old.roomCode = null; old.seatId = null; }
      send(previous, { type: 'left' });
      previous.close(4001, 'Session replaced');
    }
    const session = sessions.get(socket)!;
    session.roomCode = room.code;
    session.seatId = member.seatId;
    room.sockets.set(member.seatId, socket);
    member.connected = true;
    broadcast(room);
    scheduleAI(room);
  }

  function detach(socket: WebSocket, intentional: boolean) {
    const found = roomOf(socket);
    const session = sessions.get(socket);
    if (!found || !session) return;
    const { room, member } = found;
    if (room.sockets.get(member.seatId) !== socket) return;
    room.sockets.delete(member.seatId);
    session.roomCode = null;
    session.seatId = null;
    member.connected = false;
    if (!room.started && intentional) room.members = room.members.filter(m => m.seatId !== member.seatId);
    if (member.host) transferHost(room, intentional);
    if (rooms.has(room.code)) { broadcast(room); scheduleAI(room); }
  }

  function handle(socket: WebSocket, message: Message) {
    const session = sessions.get(socket)!;
    if (message.type === 'hello') {
      if (session.clientId) return error(socket, '身份已登记。');
      if (!validClientId(message.clientId)) return error(socket, '客户端身份令牌无效。');
      session.clientId = message.clientId;
      send(socket, { type: 'hello' });
      return;
    }
    if (!session.clientId) return error(socket, '请先发送 hello。');
    if (message.type === 'create') {
      if (session.roomCode) return error(socket, '请先离开当前房间。');
      if (rooms.size >= MAX_ROOMS) return error(socket, '房间数量已达上限，请稍后重试。');
      const p = profile(message.profile, false);
      const c = config(message.config);
      if (!p || !c) return error(socket, '玩家资料或房间设置无效。');
      let roomCode = code();
      while (rooms.has(roomCode)) roomCode = code();
      const member: Member = { ...p, color: assignPlayerColor(p.color), seatId: randomUUID(), clientId: session.clientId, ready: true, connected: true, host: true };
      const room: Room = { code: roomCode, members: [member], config: c, started: false, state: null, sockets: new Map(), timer: null, movementUntil: 0, lastMovementId: null, touched: Date.now() };
      rooms.set(roomCode, room);
      claim(socket, room, member);
      return;
    }
    if (message.type === 'join' || message.type === 'reconnect') {
      if (session.roomCode) return error(socket, '请先离开当前房间。');
      if (typeof message.code !== 'string' || !/^[A-HJ-NP-Z2-9]{6}$/.test(message.code)) return error(socket, '房间码格式无效。');
      const room = rooms.get(message.code);
      if (!room) return error(socket, '房间不存在或已结束。');
      const existing = room.members.find(m => m.clientId === session.clientId);
      if (message.type === 'reconnect') {
        if (!existing) return error(socket, '此身份不属于该房间。');
        claim(socket, room, existing);
        return;
      }
      if (existing) return error(socket, '你已在该房间，请使用重连。');
      if (room.started) return error(socket, '对局已开始，无法加入新玩家。');
      if (room.members.length >= 4) return error(socket, '房间已满。');
      const p = profile(message.profile, false);
      if (!p) return error(socket, '玩家资料无效。');
      const member: Member = { ...p, color: assignPlayerColor(p.color, room.members.map(seat => seat.color)), seatId: randomUUID(), clientId: session.clientId, ready: false, connected: true, host: false };
      room.members.push(member);
      claim(socket, room, member);
      return;
    }
    const found = roomOf(socket);
    if (!found) return error(socket, '你尚未加入房间。');
    const { room, member } = found;
    if (message.type === 'leave') {
      detach(socket, true);
      send(socket, { type: 'left' });
      return;
    }
    if (message.type === 'profile') {
      if (room.started) return error(socket, '对局已经开始。');
      const p = profile(message.profile, false);
      if (!p) return error(socket, '玩家资料无效。');
      Object.assign(member, p, { color: assignPlayerColor(p.color, room.members.filter(seat => seat !== member).map(seat => seat.color)) });
      broadcast(room);
      return;
    }
    if (message.type === 'config') {
      if (!member.host || room.started) return error(socket, '只有房主可在开局前修改设置。');
      const c = config(message.config);
      if (!c) return error(socket, '房间设置无效。');
      room.config = c;
      broadcast(room);
      return;
    }
    if (message.type === 'ready') {
      if (room.started || typeof message.ready !== 'boolean') return error(socket, '准备状态无效。');
      member.ready = member.host ? true : message.ready;
      broadcast(room);
      return;
    }
    if (message.type === 'addBot') {
      if (!member.host || room.started) return error(socket, '只有房主可在开局前增加电脑玩家。');
      if (room.members.length >= 4) return error(socket, '房间已满。');
      const p = profile(message.profile, true);
      if (!p) return error(socket, '电脑玩家资料无效。');
      room.members.push({ ...p, color: assignPlayerColor(p.color, room.members.map(seat => seat.color)), seatId: randomUUID(), clientId: null, ready: true, connected: true, host: false });
      broadcast(room);
      return;
    }
    if (message.type === 'remove') {
      if (!member.host || room.started) return error(socket, '只有房主可在开局前移除席位。');
      if (typeof message.seatId !== 'string' || message.seatId === member.seatId) return error(socket, '不能移除该席位。');
      const target = room.members.find(m => m.seatId === message.seatId);
      if (!target) return error(socket, '席位不存在。');
      const peer = room.sockets.get(target.seatId);
      if (peer) {
        const peerSession = sessions.get(peer);
        if (peerSession) { peerSession.roomCode = null; peerSession.seatId = null; }
        room.sockets.delete(target.seatId);
        send(peer, { type: 'left' });
      }
      room.members = room.members.filter(m => m.seatId !== target.seatId);
      broadcast(room);
      return;
    }
    if (message.type === 'start') {
      if (!member.host || room.started) return error(socket, '只有房主可开局。');
      if (room.members.length < 2 || room.members.length > 4) return error(socket, '开局需要 2–4 个席位。');
      if (room.members.some(m => !m.ai && (!m.ready || !m.connected))) return error(socket, '请等待所有真人玩家准备并保持在线。');
      try {
        room.state = createGame({ ...room.config, mode: 'pvp', players: room.members.map(m => ({ name: m.name, color: m.color, shape: m.shape, ai: m.ai, personality: m.personality })) });
      } catch { return error(socket, '对局设置无法创建。'); }
      room.started = true;
      broadcast(room);
      scheduleAI(room);
      return;
    }
    if (message.type === 'action') {
      if (!room.state) return error(socket, '对局尚未开始。');
      if (message.actorId !== undefined) return error(socket, '玩家身份只能由服务器验证。');
      const a = action(message.action);
      if (!a) return error(socket, '行动参数无效。');
      let actorId: string | undefined;
      if (a.type === 'dismissSeason') {
        if (!room.state.seasonReport) return error(socket, '当前没有季节结算。');
      } else {
        if (room.state.seasonReport) return error(socket, '请先关闭季节结算。');
        if (room.members.some(m => !m.ai && !m.connected)) return error(socket, '有真人玩家断线，对局已暂停。');
        const playerIndex = room.members.findIndex(m => m.seatId === member.seatId);
        const playerId = room.state.players[playerIndex]?.id;
        if (!playerId) return error(socket, '玩家身份无效。');
        if (listingActions.has(a.type)) {
          if (room.state.config.propertyTrading === false) return error(socket, '本局已关闭房产自由交易。');
          if (Date.now() < room.movementUntil) return error(socket, '请等待棋子移动完成。');
          if ((room.state.phase !== 'ready' && room.state.phase !== 'end') || room.state.pending) return error(socket, '请先完成当前决定。');
          if (room.state.players[playerIndex].bankrupt) return error(socket, '破产玩家无法交易房产。');
          actorId = playerId;
        } else {
          const tradeBuyerId = room.state.pending?.kind === 'trade' ? room.state.pending.data?.buyerId : null;
          const expected = tradeBuyerId && a.type === 'choose' ? tradeBuyerId : room.state.players[room.state.currentPlayerIndex]?.id;
          if (playerId !== expected) return error(socket, '现在不是你的行动回合。');
          if (tradeBuyerId && a.type !== 'choose') return error(socket, '请等待买方回应交易。');
          if (Date.now() < room.movementUntil) return error(socket, '请等待棋子移动完成。');
        }
      }
      const next = actorId ? act(room.state, a, actorId) : act(room.state, a);
      if (next === room.state) return error(socket, '此行动当前不可执行。');
      room.state = next;
      noteMovement(room);
      broadcast(room);
      // A non-current market action does not advance the turn. Keep an already
      // scheduled AI tick so repeated listings cannot postpone it indefinitely.
      if (!listingActions.has(a.type) || !room.timer) scheduleAI(room);
      return;
    }
    error(socket, '未知消息类型。');
  }

  const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.woff2': 'font/woff2' };
  const httpServer = createServer(async (request, response) => {
    let pathname: string;
    try { pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname); }
    catch { response.writeHead(400); response.end('Bad request'); return; }
    if (pathname === '/ws') { response.writeHead(426); response.end('WebSocket required'); return; }
    if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
    if (pathname === '/healthz') {
      const ready = await staticFile(resolve(staticDir, 'index.html'));
      const body = JSON.stringify({ status: ready ? 'ok' : 'unavailable' });
      response.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
      response.end(request.method === 'HEAD' ? undefined : body);
      return;
    }
    const target = resolve(staticDir, `.${pathname}`);
    if (target !== staticDir && !target.startsWith(staticDir + sep)) { response.writeHead(403); response.end(); return; }
    const path = pathname === '/' || !extname(pathname) ? resolve(staticDir, 'index.html') : target;
    const file = await staticFile(path);
    if (!file) { response.writeHead(404); response.end('Not found'); return; }
    response.writeHead(200, { 'Content-Type': mime[extname(file.path)] ?? 'application/octet-stream', 'Content-Length': file.size, 'Cache-Control': 'no-cache' });
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(file.path);
    stream.on('error', () => response.destroy());
    response.on('close', () => stream.destroy());
    response.on('error', () => stream.destroy());
    stream.pipe(response);
  });
  httpServer.on('error', error => console.error('HTTP server error:', error));

  httpServer.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try { pathname = new URL(request.url ?? '/', 'http://localhost').pathname; } catch { socket.destroy(); return; }
    if (pathname !== '/ws') { socket.destroy(); return; }
    try { wss.handleUpgrade(request, socket, head, peer => wss.emit('connection', peer, request)); }
    catch { socket.destroy(); }
  });

  wss.on('connection', socket => {
    sessions.set(socket, { clientId: null, roomCode: null, seatId: null, received: [] });
    socket.on('error', () => socket.terminate());
    socket.on('message', (raw, binary) => {
      const session = sessions.get(socket);
      if (!session) return;
      const now = Date.now();
      session.received = session.received.filter(time => time > now - 10_000);
      session.received.push(now);
      if (session.received.length > MAX_MESSAGES_PER_10_SECONDS) { socket.close(1008, 'Rate limit'); return; }
      const payload = Array.isArray(raw) ? Buffer.concat(raw) : raw instanceof ArrayBuffer ? Buffer.from(raw) : raw;
      if (binary || payload.length > MAX_MESSAGE_BYTES) { socket.close(1009, 'Message too large'); return; }
      let message: unknown;
      try { message = JSON.parse(payload.toString('utf8')); } catch { error(socket, '消息不是有效 JSON。'); return; }
      if (!record(message)) { error(socket, '消息格式无效。'); return; }
      try { handle(socket, message); } catch { error(socket, '请求处理失败。'); }
    });
    socket.on('close', () => { detach(socket, false); sessions.delete(socket); });
  });

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) if (now - room.touched > 2 * 60 * 60_000) clearRoom(room);
  }, 60_000);
  cleanup.unref?.();

  await new Promise<void>((yes, no) => {
    httpServer.once('error', no);
    httpServer.listen(options.port ?? 8787, options.host ?? '0.0.0.0', () => { httpServer.off('error', no); yes(); });
  });
  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : options.port ?? 8787;
  let closing: Promise<void> | null = null;
  const close = () => closing ??= (async () => {
    clearInterval(cleanup);
    for (const room of rooms.values()) clearRoom(room);
    const httpClosed = new Promise<void>(done => httpServer.close(() => done()));
    for (const socket of wss.clients) socket.close(1001, 'Server shutting down');
    const force = setTimeout(() => { for (const socket of wss.clients) socket.terminate(); }, 2000);
    force.unref?.();
    try { await new Promise<void>(done => wss.close(() => done())); }
    finally { clearTimeout(force); }
    await httpClosed;
  })();
  return { httpServer, wss, port, close };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let stopping = false;
  let options: { port: number; host: string } | null = null;
  try { options = listenOptionsFromEnv(process.env); }
  catch (error) { console.error(error); process.exitCode = 1; }
  if (options) createRoomServer(options).then(server => {
    console.log(`Prism Days server listening on http://${options.host}:${server.port}`);
    const shutdown = (signal: string) => {
      if (stopping) return;
      stopping = true;
      server.close().catch(error => { console.error(`${signal} shutdown failed:`, error); process.exitCode = 1; });
    };
    process.once('SIGTERM', () => shutdown('SIGTERM'));
    process.once('SIGINT', () => shutdown('SIGINT'));
  }).catch(error => {
    console.error(error); process.exitCode = 1;
  });
}
