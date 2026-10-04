import type { AILevel, GameAction, GameConfig, GameState, PlayerConfig, Shape, Personality } from './types';

export type RoomConfig = Pick<GameConfig, 'mapId' | 'seasons' | 'weatherMode' | 'seed' | 'propertyTrading'> & Required<Pick<GameConfig, 'rentLevel'>>;

export interface RoomMember { seatId: string; name: string; color: string; shape: Shape; ai: boolean; personality: Personality; aiLevel?: AILevel; ready: boolean; connected: boolean; host: boolean }
export interface RoomSnapshot {
  code: string;
  members: RoomMember[];
  config: RoomConfig;
  started: boolean;
  state: GameState | null;
  movementUntil?: number;
  youSeatId: string;
  youPlayerId: string | null;
  isHost: boolean;
}
export type NetworkEvent = { type: 'room'; room: RoomSnapshot } | { type: 'error'; message: string } | { type: 'left' } | { type: 'status'; connected: boolean };
type Profile = PlayerConfig;
type Outbound =
  | { type: 'hello'; clientId: string }
  | { type: 'create'; profile: Profile; config: RoomConfig }
  | { type: 'join'; code: string; profile: Profile }
  | { type: 'reconnect'; code: string }
  | { type: 'profile'; profile: Profile }
  | { type: 'config'; config: RoomConfig }
  | { type: 'ready'; ready: boolean }
  | { type: 'addBot'; profile: Profile }
  | { type: 'remove'; seatId: string }
  | { type: 'start' }
  | { type: 'action'; action: GameAction }
  | { type: 'leave' };
const ID_KEY = 'prism-days-client-id';
const ROOM_KEY = 'prism-days-room-code';
function saved(key: string): string | null { try { return localStorage.getItem(key); } catch { return null; } }
function persist(key: string, value: string | null) { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* storage disabled */ } }
function clientId(): string {
  const existing = saved(ID_KEY);
  if (existing) return existing;
  const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : (() => {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  })();
  persist(ID_KEY, id);
  return id;
}
export function savedRoomCode(): string | null { return saved(ROOM_KEY); }

export class RoomClient {
  private socket: WebSocket | null = null;
  private identity = clientId();
  private initial: Outbound | null = null;
  private queue: Outbound[] = [];
  private authorized = false;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private attempts = 0;
  private roomCode: string | null = savedRoomCode();
  private pendingJoin: { code: string; profile: Profile } | null = null;
  constructor(private onEvent: (event: NetworkEvent) => void) {}
  connect(initial?: Outbound) {
    if (initial && this.authorized && this.socket?.readyState === WebSocket.OPEN) { this.sendRaw(initial); return; }
    if (initial) this.initial = initial;
    this.stopped = false;
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) return;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/ws`);
    this.socket = socket;
    socket.onopen = () => { if (this.socket !== socket) return; this.attempts = 0; this.onEvent({ type: 'status', connected: true }); this.sendRaw({ type: 'hello', clientId: this.identity }); };
    socket.onmessage = event => {
      if (this.socket !== socket) return;
      let message: unknown;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (!message || typeof message !== 'object' || !('type' in message)) return;
      const data = message as Record<string, unknown>;
      if (data.type === 'hello') {
        this.authorized = true;
        const first = this.initial;
        this.initial = null;
        if (first) this.sendRaw(first);
        else if (this.roomCode) this.sendRaw({ type: 'reconnect', code: this.roomCode });
        for (const pending of this.queue.splice(0)) this.sendRaw(pending);
      } else if (data.type === 'room' && data.room && typeof data.room === 'object') {
        const room = data.room as RoomSnapshot;
        this.pendingJoin = null;
        this.roomCode = room.code;
        persist(ROOM_KEY, room.code);
        this.onEvent({ type: 'room', room });
      } else if (data.type === 'error' && typeof data.message === 'string') {
        if (this.pendingJoin && data.message.includes('此身份不属于该房间')) {
          this.sendRaw({ type: 'join', ...this.pendingJoin });
          this.pendingJoin = null;
        } else this.onEvent({ type: 'error', message: data.message });
      }
      else if (data.type === 'left') { this.roomCode = null; persist(ROOM_KEY, null); this.onEvent({ type: 'left' }); }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.authorized = false;
      this.socket = null;
      this.onEvent({ type: 'status', connected: false });
      if (!this.stopped) this.retryTimer = setTimeout(() => this.connect(), Math.min(10000, 700 * 2 ** Math.min(this.attempts++, 4)));
    };
    socket.onerror = () => { if (this.socket === socket) this.onEvent({ type: 'error', message: '房间连接暂时中断，正在重新连接。' }); };
  }
  send(message: Outbound) {
    if (this.authorized && this.socket?.readyState === WebSocket.OPEN) this.sendRaw(message);
    else { this.queue.push(message); this.connect(); }
  }
  private sendRaw(message: Outbound) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
  create(profile: Profile, config: RoomConfig) { this.roomCode = null; persist(ROOM_KEY, null); this.connect({ type: 'create', profile, config }); }
  join(code: string, profile: Profile) { this.roomCode = null; persist(ROOM_KEY, null); this.pendingJoin = { code: code.trim().toUpperCase(), profile }; this.connect({ type: 'reconnect', code: this.pendingJoin.code }); }
  reconnect(code?: string) { const value = code || this.roomCode; if (value) { this.roomCode = value; this.connect({ type: 'reconnect', code: value }); } }
  profile(profile: Profile) { this.send({ type: 'profile', profile }); }
  config(config: RoomConfig) { this.send({ type: 'config', config }); }
  ready(ready: boolean) { this.send({ type: 'ready', ready }); }
  addBot(profile: Profile) { this.send({ type: 'addBot', profile }); }
  remove(seatId: string) { this.send({ type: 'remove', seatId }); }
  start() { this.send({ type: 'start' }); }
  action(action: GameAction) { this.send({ type: 'action', action }); }
  leave() { if (this.authorized) this.sendRaw({ type: 'leave' }); this.roomCode = null; this.pendingJoin = null; persist(ROOM_KEY, null); this.stop(); this.onEvent({ type: 'left' }); }
  stop() { this.stopped = true; this.authorized = false; this.initial = null; this.queue = []; if (this.retryTimer) clearTimeout(this.retryTimer); this.socket?.close(); this.socket = null; }
}
