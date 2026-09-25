import { useCallback, useEffect, useRef, useState, type ChangeEvent, type CSSProperties, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, BarChart3, BookOpen, BriefcaseBusiness, ChevronDown, Download, Home, Minus, Package, Plus, RotateCcw, Settings2, Upload, Volume2, VolumeX, X } from 'lucide-react';
import Board from './visual/Board';
import { CalendarBadge, WeatherButton, WeatherEffects, WeatherIcon } from './visual/EnvironmentBadge';
import { getWeatherCopy } from './visual/weatherCopy';
import Modal from './components/Modal';
import ActivityNotifications from './components/ActivityNotifications';
import TradingDesk from './components/TradingDesk';
import CasinoPanel from './components/CasinoPanel';
import ShopPanel from './components/ShopPanel';
import DiceControlPicker from './components/DiceControlPicker';
import RentDecision from './components/RentDecision';
import StationTravelPanel from './components/StationTravelPanel';
import FloorKey from './components/FloorKey';
import { act, canUseItem, createGame, getCurrentPlayer, getNetWorth, getRent, getTileRentPreview, runAI } from './game/engine';
import { normalizePlayerColors, PLAYER_COLORS } from './game/colors';
import { ITEMS, WEATHERS, AI_PRESETS, JOURNEY_REWARD_STEPS, JOURNEY_REWARD_CASH } from './game/data';
import { MAPS } from './game/maps';
import { clearSave, exportGame, loadSave, parseSave, saveGame } from './game/storage';
import { RoomClient, savedRoomCode, type NetworkEvent, type RoomSnapshot } from './game/network';
import { getMovementTimeline } from './game/presentation';
import type { GameAction, GameConfig, GameState, MapData, MapId, Player, PlayerConfig, Shape } from './game/types';

const MAP_ORDER: MapId[] = ['lake', 'coast', 'valley'];
const SHAPES: Shape[] = ['diamond', 'circle', 'hexagon', 'triangle'];
const SHAPE_NAMES: Record<Shape, string> = { diamond: '菱形', circle: '圆形', hexagon: '六边形', triangle: '三角形' };
const money = (value: number) => `PM$ ${Math.round(value).toLocaleString('zh-CN')}`;
const endOfGame = (state: GameState) => state.phase === 'gameover';

function Marker({ shape, color, size = 24 }: { shape: Shape; color: string; size?: number }) {
  const content = shape === 'circle' ? <circle cx="20" cy="20" r="12" /> : shape === 'hexagon' ? <path d="M13 7h14l7 13-7 13H13L6 20Z" /> : shape === 'triangle' ? <path d="M20 5 35 33H5Z" /> : <path d="M20 4 35 20 20 36 5 20Z" />;
  return <svg className="player-marker" width={size} height={size} viewBox="0 0 40 40" aria-hidden="true"><g fill={color} stroke="currentColor" strokeWidth="2">{content}</g></svg>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
function Button({ children, onClick, disabled = false, secondary = false, title, className = '' }: { children: ReactNode; onClick: () => void; disabled?: boolean; secondary?: boolean; title?: string; className?: string }) {
  return <button type="button" title={title} disabled={disabled} onClick={onClick} className={`${secondary ? 'secondary-button' : 'action-button'} ${className}`}>{children}</button>;
}

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return <div className="player-color-picker" role="group" aria-label="信标颜色">{PLAYER_COLORS.map(option => <button key={option.id} type="button" className="color-swatch" style={{ '--swatch': option.color } as CSSProperties} aria-label={option.name} aria-pressed={value === option.color} title={option.name} onClick={() => onChange(option.color)}><span className="swatch-color" aria-hidden="true" /><span>{option.name}</span></button>)}</div>;
}

function Landing({ save, onResume, onStart, onOnline, onGuide }: { save: GameState | null; onResume: () => void; onStart: (config: GameConfig) => void; onOnline: (kind: 'create' | 'join', profile: PlayerConfig, config: Pick<GameConfig, 'mapId' | 'seasons' | 'weatherMode' | 'seed'>, code?: string) => void; onGuide: () => void }) {
  const [mapId, setMapId] = useState<MapId>('lake');
  const [mode, setMode] = useState<'pve' | 'pvp'>('pve');
  const [humanName, setHumanName] = useState('旅行家');
  const [humanShape, setHumanShape] = useState<Shape>('diamond');
  const [humanColor, setHumanColor] = useState<string>(PLAYER_COLORS[0].color);
  const [chosenAI, setChosenAI] = useState<number[]>([0, 1]);
  const [onlineIntent, setOnlineIntent] = useState<'create' | 'join'>('create');
  const [roomCode, setRoomCode] = useState('');
  const [seasons, setSeasons] = useState(8);
  const [weatherMode, setWeatherMode] = useState<GameConfig['weatherMode']>('standard');
  const [seed, setSeed] = useState('');
  const [error, setError] = useState('');
  const map = MAPS[mapId];
  const humanProfile = { name: humanName.trim(), color: humanColor, shape: humanShape, ai: false, personality: 'balanced' as const };
  const proposedPlayers = normalizePlayerColors([humanProfile, ...chosenAI.map(index => AI_PRESETS[index])]);
  const availableAI = AI_PRESETS.map((ai, index) => {
    const selectedAt = chosenAI.indexOf(index);
    const color = selectedAt >= 0 ? proposedPlayers[selectedAt + 1].color : normalizePlayerColors([humanProfile, ...chosenAI.map(chosen => AI_PRESETS[chosen]), ai]).at(-1)!.color;
    return { ...ai, color, index };
  });
  const start = () => {
    const players = proposedPlayers;
    if (players.some(player => !player.name)) { setError('请为每位玩家取一个名字。'); return; }
    if (mode === 'pve' && new Set(players.map(player => player.name)).size !== players.length) { setError('玩家名字需要各不相同。'); return; }
    if (mode === 'pve' && (chosenAI.length < 1 || chosenAI.length > 3)) { setError('请选择 1 至 3 位代理人。'); return; }
    const parsedSeed = seed.trim() ? Number(seed) : (Date.now() >>> 0);
    if (!Number.isSafeInteger(parsedSeed) || parsedSeed < 0 || parsedSeed > 0xffff_ffff) { setError('种子须为 0 至 4294967295 的整数。'); return; }
    if (mode === 'pvp') {
      if (onlineIntent === 'join' && !/^[A-Z0-9]{6}$/.test(roomCode.trim().toUpperCase())) { setError('请输入 6 位房间码。'); return; }
      onOnline(onlineIntent, players[0], { mapId, seasons, weatherMode, seed: parsedSeed }, roomCode.trim().toUpperCase());
    } else onStart({ mapId, mode, players, seasons, weatherMode, seed: parsedSeed });
  };
  return <div className="app landing">
    <header className="landing-topbar"><div className="brand"><span className="brand-gem">◆</span><span><strong>棱镜假日</strong><small>PRISM DAYS</small></span></div><nav className="top-links"><button onClick={onGuide}>玩法指南</button>{save && <button onClick={onResume}>继续旅程 <ArrowRight size={15} /></button>}</nav></header>
    <main className="landing-layout">
      <section className="intro"><h1>大富翁·棱镜假日</h1><p className="intro-copy">选择地图与旅伴。单人模式可与电脑对局；联网模式可创建房间或输入房间码加入好友。</p>
        <div className="section-kicker">01 / 选择目的地</div><div className="map-options">{MAP_ORDER.map((id, index) => { const option = MAPS[id]; return <button key={id} className={`map-option ${mapId === id ? 'selected' : ''}`} disabled={mode === 'pvp' && onlineIntent === 'join'} title={mode === 'pvp' && onlineIntent === 'join' ? '加入房间时由房主决定地图' : undefined} onClick={() => setMapId(id)} aria-pressed={mapId === id}><span className="map-number">0{index + 1}</span><span className="map-option-main"><strong>{option.name}</strong><small>{option.subtitle}</small></span><span className="map-node-count">{option.nodes.length} 站</span></button>; })}</div>
      </section>
      <section className="world-preview" aria-label={`${map.name}地图预览`}><Board map={map} preview /><div className="preview-label"><span>地图预览</span><strong>{map.name}</strong><small>{map.nodes.length} 个地点</small></div></section>
    </main>
    <section className="setup-panel"><div className="setup-heading"><div><div className="section-kicker">02 / 选择旅伴</div><h2>设置对局</h2></div><p>选择单人或联网模式。</p></div>
      <div className="setup-main"><div className="segmented"><button className={mode === 'pve' ? 'active' : ''} onClick={() => setMode('pve')}>与代理人同行</button><button className={mode === 'pvp' ? 'active' : ''} onClick={() => setMode('pvp')}>联网好友</button></div>
        {mode === 'pve' ? <div className="opponent-picker"><div className="setup-caption">邀请代理人 · {chosenAI.length}/3</div><div className="chip-grid">{availableAI.map(ai => <button key={ai.index} className={`chip ai-chip ${chosenAI.includes(ai.index) ? 'selected' : ''}`} disabled={chosenAI.length >= 3 && !chosenAI.includes(ai.index)} onClick={() => setChosenAI(existing => existing.includes(ai.index) ? existing.length > 1 ? existing.filter(i => i !== ai.index) : existing : existing.length < 3 ? [...existing, ai.index] : existing)} aria-pressed={chosenAI.includes(ai.index)}><Marker shape={ai.shape} color={ai.color} size={20} /><span>{ai.name}</span><small>{ai.personality === 'cautious' ? '稳健' : ai.personality === 'aggressive' ? '冒险' : '灵活'}</small></button>)}</div></div> : <div className="online-picker"><div className="setup-caption">与好友共享一个房间{onlineIntent === 'join' ? ' · 地图和规则由房主决定' : ''}</div><div className="segmented"><button className={onlineIntent === 'create' ? 'active' : ''} onClick={() => setOnlineIntent('create')}>创建房间</button><button className={onlineIntent === 'join' ? 'active' : ''} onClick={() => setOnlineIntent('join')}>输入房间码</button></div>{onlineIntent === 'join' && <Field label="6 位房间码"><input value={roomCode} maxLength={6} autoCapitalize="characters" placeholder="例如 A7F3K9" onChange={event => setRoomCode(event.target.value.toUpperCase())} /></Field>}</div>}
      </div>
      <details className="setup-details" open><summary>信标与规则 <ChevronDown size={16} /></summary><div className="setup-details-body"><div className="setup-fields"><Field label="你的名字"><input maxLength={16} value={humanName} onChange={event => setHumanName(event.target.value)} /></Field><Field label="信标形状"><select value={humanShape} onChange={event => setHumanShape(event.target.value as Shape)}>{SHAPES.map(shape => <option key={shape} value={shape}>{SHAPE_NAMES[shape]}</option>)}</select></Field><div className="field"><span>信标颜色</span><ColorPicker value={humanColor} onChange={setHumanColor} /></div></div>{(mode === 'pve' || onlineIntent === 'create') && <div className="setup-fields"><Field label="旅程长度"><select value={seasons} onChange={event => setSeasons(Number(event.target.value))}><option value={4}>1 年 · 4 季</option><option value={8}>2 年 · 8 季</option><option value={16}>4 年 · 16 季</option><option value={0}>直到只剩一位玩家</option></select></Field><Field label="天气规则"><select value={weatherMode} onChange={event => setWeatherMode(event.target.value as GameConfig['weatherMode'])}><option value="standard">标准天气</option><option value="challenge">挑战天气</option></select></Field><Field label="随机种子（可选）"><input type="number" min={0} step={1} value={seed} placeholder="自动生成" onChange={event => setSeed(event.target.value)} /></Field></div>}</div></details>
      {error && <p className="form-error" role="alert">{error}</p>}<div className="setup-footer"><button className="launch-button" onClick={start}>{mode === 'pve' ? '开始游戏' : onlineIntent === 'create' ? '创建好友房间' : '加入好友房间'} <ArrowRight size={20} /></button></div>
    </section>
  </div>;
}

function Guide() { return <div className="guide-content"><p>掷骰走过三张地图之一，在湖畔、海岸或山谷积累你的产业。旅程结束时，总资产最高者获胜；选择不限季数时，直到只剩一位未破产的玩家。</p><div className="guide-grid"><div><h3>一回合怎么走</h3><p>轮到你时掷骰，棋子沿道路逐格前进。每次掷骰基础消耗 2–4 点体力：普通六面骰掷出 1–2 点扣 2、3–4 点扣 3、5–6 点扣 4；大面数骰子也最多扣 4 点，天气和事件的额外影响另算。停下后处理土地、随机事件或设施。完成决定后结束回合；也可以休息来恢复状态。正常掷骰每累计行进 {JOURNEY_REWARD_STEPS} 格获 {money(JOURNEY_REWARD_CASH)}，余数保留；天气额外位移、传送和乘车不计入。</p></div><div><h3>土地与租金</h3><p>停在可购地块上才能购买。拥有的地产可升级、抵押、赎回或出售；其他玩家停在你的地块时支付租金。若持有干燥的免租卡，付租前可选择使用卡片使本次实付为零，或保留卡片直接支付；现金不足仍可支付并进入偿债。抵押地产暂不收租。</p></div><div><h3>天气与道具</h3><p>每天的天气会影响旅途。自然天气遵循季节：夏季无雪，冬季无暑热；天气控制器可主动制造反季天气。背包有容量限制，道具可以使用、抵押或赎回；定向道具需要选择目标。控骰器可在行动前指定普通六面骰原始点数 1～6，天气仍会修正点数并另行结算额外位移；确认后立即消耗一件，本回合不能与多面骰并用，休息则指定点数作废。灾难天气从第 22 天起出现。</p></div><div><h3>市场与交易</h3><p>只能停在交易所时买卖股票。资产面板会显示你的股票与地产，还可以向其他玩家提出地产报价。请留意现金与总资产不同。</p></div></div><p className="guide-note">标准天气适合熟悉旅途；挑战天气会出现更强烈的天气变化。设置中的随机种子可重现同一局起点。</p></div>; }

function Inventory({ state, player, onAction, disabled = false }: { state: GameState; player: Player; onAction: (action: GameAction) => void; disabled?: boolean }) {
  const [targetItem, setTargetItem] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');
  const [targetNode, setTargetNode] = useState('');
  const [targetWeather, setTargetWeather] = useState('');
  const mayManage = !disabled && getCurrentPlayer(state).id === player.id && (state.phase === 'ready' || state.phase === 'end');
  const passive = new Set(['shield', 'arrest']);
  const selected = player.inventory.find(slot => slot.uid === targetItem);
  const selectedDef = selected && ITEMS[selected.itemId];
  const usable = (uid: string) => !disabled && canUseItem(state, player.id, uid);
  const useReason = (slot: Player['inventory'][number]) => {
    if (slot.itemId === 'rent') return '需要支付租金时，再决定是否使用免租卡。';
    if (passive.has(slot.itemId)) return '遇到逮捕或攻击时自动消耗。';
    if (slot.wet) return '已受潮，暂不可用。';
    if (slot.itemId === 'controller' && state.selectedDie !== 6) return '已启用多面骰，本回合不能使用控骰器。';
    if (slot.itemId === 'controller' && state.controlledRoll != null) return '已指定点数，本回合不能再次使用控骰器。';
    if (/^dice(8|12|20|100)$/.test(slot.itemId) && state.controlledRoll != null) return '已指定点数，不能再启用骰具。';
    if (disabled) return '当前回合或连接状态下暂不可操作。';
    if (!usable(slot.uid)) return state.phase === 'ready' ? '当前天气或状态下不可使用。' : '只能在你的行动前使用。';
    return '';
  };
  const use = (uid: string) => {
    const item = player.inventory.find(slot => slot.uid === uid);
    if (!item || !usable(uid)) return;
    const def = ITEMS[item.itemId];
    if (def?.target || item.itemId === 'teleport') { setTargetId(''); setTargetNode(''); setTargetWeather(''); setTargetItem(uid); return; }
    onAction({ type: 'useItem', itemUid: uid });
  };
  if (selected?.itemId === 'controller') return <DiceControlPicker weatherId={state.weatherId} disabled={!usable(selected.uid)} onCancel={() => setTargetItem(null)} onConfirm={diceValue => { if (usable(selected.uid)) onAction({ type: 'useItem', itemUid: selected.uid, diceValue }); setTargetItem(null); }} />;
  return <div className="inventory-panel"><p>背包 {player.inventory.length}/{player.capacity} 格。道具通常在行动前使用；免租卡在付租时确认，部分道具会受天气影响。</p><div className="inventory-grid">{Array.from({ length: player.capacity }, (_, index) => { const slot = player.inventory[index]; const item = slot && ITEMS[slot.itemId]; const reason = slot ? useReason(slot) : ''; return <div className={`inventory-slot ${slot ? 'filled' : 'empty'}`} key={index}>{slot && item ? <><span className="item-icon">{slot.itemId === 'controller' ? <Settings2 size={20} aria-hidden="true" /> : item.icon}</span><strong>{item.name}{slot.quantity > 1 ? ` ×${slot.quantity}` : ''}</strong><small>{item.description}</small>{slot.wet && <em>已受潮</em>}<div className="slot-actions"><button disabled={!usable(slot.uid)} title={reason || undefined} onClick={() => use(slot.uid)}>{slot.itemId === 'rent' ? '付租时选择' : passive.has(slot.itemId) ? '被动生效' : '使用'}</button><button disabled={!mayManage} title={`抵押可得 ${money(Math.floor((item.shop ? item.price : 10000) * 0.5))}`} onClick={() => onAction({ type: 'pawnItem', itemUid: slot.uid })}>抵押</button><button disabled={!mayManage} onClick={() => onAction({ type: 'discardItem', itemUid: slot.uid })}>丢弃</button></div>{reason && <small className="item-use-reason">{reason}</small>}</> : <span className="slot-placeholder">空位 {index + 1}</span>}</div>; })}</div>
    {selected && selectedDef && <div className="target-picker"><div className="target-picker-heading"><strong>使用 {selectedDef.name}</strong><button className="icon-button" onClick={() => setTargetItem(null)} aria-label="取消选择目标"><X size={16} /></button></div>
      {selectedDef.target === 'player' && <Field label="选择玩家"><select value={targetId} onChange={event => setTargetId(event.target.value)}><option value="">请选择</option>{state.players.filter(p => !p.bankrupt && p.id !== player.id).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>}
      {(selectedDef.target === 'property' || selected.itemId === 'teleport') && <Field label={selected.itemId === 'teleport' ? '选择车站' : '选择地产'}><select value={targetNode} onChange={event => setTargetNode(event.target.value)}><option value="">请选择</option>{selected.itemId === 'teleport' ? MAPS[state.config.mapId].nodes.filter(node => node.kind === 'station' && node.id !== player.position).map(node => <option key={node.id} value={node.id}>{node.name}</option>) : Object.entries(state.properties).filter(([nodeId, prop]) => { const kind = MAPS[state.config.mapId].nodes[Number(nodeId)]?.kind; if (selected.itemId === 'repair') return prop.ownerId === player.id && !prop.mortgaged && kind === 'land' && prop.level < 4; if (selected.itemId === 'demolish') return prop.ownerId !== player.id && kind === 'land' && prop.level > 0 && prop.level < 4; return prop.ownerId !== player.id && !prop.mortgaged && prop.level < 4 && ['land', 'power', 'water', 'telecom'].includes(kind); }).map(([nodeId, prop]) => <option key={nodeId} value={nodeId}>{MAPS[state.config.mapId].nodes[Number(nodeId)]?.name} · {state.players.find(p => p.id === prop.ownerId)?.name}</option>)}</select></Field>}
      {selectedDef.target === 'weather' && <><Field label="选择天气"><select value={targetWeather} onChange={event => setTargetWeather(event.target.value)}><option value="">请选择</option>{Object.values(WEATHERS).filter(w => state.day >= 22 || w.family !== 'disaster').map(w => <option value={w.id} key={w.id}>{w.name}</option>)}</select></Field><p className="guide-note">指定的是明日天气，可跨季节；灾难天气仍从第 22 天起开放。</p></>}
      <Button disabled={selectedDef.target === 'player' ? !targetId : selectedDef.target === 'property' || selected.itemId === 'teleport' ? !targetNode : !targetWeather} onClick={() => { onAction({ type: 'useItem', itemUid: selected.uid, targetId: targetId || undefined, nodeId: targetNode ? Number(targetNode) : undefined, weatherId: targetWeather || undefined }); setTargetItem(null); }}>确认使用</Button>
    </div>}
    {player.pawnedItems.length > 0 && <><h3>已抵押道具</h3><div className="panel-list">{player.pawnedItems.map(pawn => { const cost = Math.ceil(pawn.principal * 1.2); const def = ITEMS[pawn.slot.itemId]; const hasSpace = player.inventory.length < player.capacity || !!(def?.stackable && player.inventory.some(slot => slot.itemId === pawn.slot.itemId)); return <div className="panel-row" key={pawn.slot.uid}><div><strong>{def?.name || pawn.slot.itemId}</strong><small>抵押本金 {money(pawn.principal)} · 赎回需 {money(cost)}</small></div><button disabled={!mayManage || player.cash < cost || !hasSpace} title={player.cash < cost ? '资金不足' : !hasSpace ? '背包没有空位' : undefined} onClick={() => onAction({ type: 'redeemItem', itemUid: pawn.slot.uid })}>赎回 · {money(cost)}</button></div>; })}</div></>}
  </div>;
}

function Assets({ state, player, onAction }: { state: GameState; player: Player; onAction: (action: GameAction) => void }) {
  const map = MAPS[state.config.mapId];
  const owned = Object.entries(state.properties).filter(([, property]) => property.ownerId === player.id);
  const [offerNode, setOfferNode] = useState('');
  const [offerTarget, setOfferTarget] = useState('');
  const [offerPrice, setOfferPrice] = useState('');
  const openOffer = (id: number) => { setOfferNode(String(id)); setOfferTarget(''); setOfferPrice(String(map.nodes[id]?.price || 10000)); };
  const canManage = (state.phase === 'ready' || state.phase === 'end') && getCurrentPlayer(state).id === player.id;
  const travelProgress = player.travelProgress ?? 0;
  return <div className="assets-panel"><div className="asset-summary"><div><small>现金</small><strong>{money(player.cash)}</strong></div><div><small>总资产</small><strong>{money(getNetWorth(state, player.id))}</strong></div><div><small>地产</small><strong>{owned.length} 处</strong></div></div>
    <div className="panel-row journey-reward-row"><div><strong>行进奖励</strong><small>正常行进 {travelProgress} / {JOURNEY_REWARD_STEPS} 格</small></div><div><strong>再走 {JOURNEY_REWARD_STEPS - travelProgress} 格</strong><small>可获 {money(JOURNEY_REWARD_CASH)}</small></div></div>
    <h3>我的地产</h3>{owned.length ? <div className="panel-list">{owned.map(([id, property]) => { const node = map.nodes[Number(id)]; const base = node?.price || 0; const invested = base + (['power', 'water', 'telecom'].includes(node?.kind || '') ? 0 : Math.floor(base * 0.75 * property.level)); const mortgageValue = Math.floor(invested * 0.5); const redeemCost = Math.ceil(invested * 0.6); const saleValue = Math.floor(invested * 0.7); return <div className="panel-row asset-row" key={id}><div><strong>{node?.name || `地块 ${id}`}</strong><small>等级 {property.level} · {property.mortgaged ? '已抵押，暂停收租' : `租金 ${money(getRent(state, Number(id)))}`}</small><small className="asset-estimate">{property.mortgaged ? `赎回需 ${money(redeemCost)}` : `抵押可得 ${money(mortgageValue)} · 卖给银行 ${money(saleValue)}`}</small></div><div className="row-actions">{property.mortgaged ? <button disabled={!canManage || player.cash < redeemCost} title={player.cash < redeemCost ? '资金不足' : undefined} onClick={() => onAction({ type: 'redeem', nodeId: Number(id) })}>赎回</button> : <button disabled={!canManage} onClick={() => onAction({ type: 'mortgage', nodeId: Number(id) })}>抵押</button>}<button disabled={!canManage || property.mortgaged || property.level >= 4} title={property.level >= 4 ? '地标不可出售' : property.mortgaged ? '请先赎回地产' : undefined} onClick={() => onAction({ type: 'sellAsset', nodeId: Number(id) })}>出售</button><button disabled={!canManage || property.mortgaged} title={property.mortgaged ? '请先赎回地产' : undefined} onClick={() => openOffer(Number(id))}>出价交易</button></div></div>; })}</div> : <p className="empty-state">还没有地产。走到无人拥有的可购地块时，你可以选择购买。</p>}
    {offerNode && <div className="offer-form"><h3>向其他玩家出售 {map.nodes[Number(offerNode)]?.name}</h3><div className="setup-fields"><Field label="买家"><select value={offerTarget} onChange={event => setOfferTarget(event.target.value)}><option value="">请选择</option>{state.players.filter(p => p.id !== player.id && !p.bankrupt).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field><Field label="报价 PM$"><input type="number" min="1" step="1" value={offerPrice} onChange={event => setOfferPrice(event.target.value)} /></Field></div><div className="modal-actions"><Button secondary onClick={() => setOfferNode('')}>取消</Button><Button disabled={!offerTarget || !Number.isSafeInteger(Number(offerPrice)) || Number(offerPrice) <= 0} onClick={() => { onAction({ type: 'offerTrade', nodeId: Number(offerNode), targetId: offerTarget, price: Number(offerPrice) }); setOfferNode(''); }}>提交报价</Button></div></div>}
    <h3>股票持仓</h3>{state.stocks.some(stock => player.holdings[stock.id] > 0) ? <div className="panel-list">{state.stocks.filter(stock => player.holdings[stock.id] > 0).map(stock => <div className="panel-row" key={stock.id}><div><strong>{stock.name}</strong><small>{stock.code} · {player.holdings[stock.id]} 股</small></div><strong>{money(player.holdings[stock.id] * stock.price)}</strong></div>)}</div> : <p className="empty-state">暂无股票。停在交易所时可买卖。</p>}
  </div>;
}

function Ranking({ state }: { state: GameState }) {
  const ordered = [...state.players].sort((a, b) => getNetWorth(state, b.id) - getNetWorth(state, a.id));
  return <div className="ranking-list">{ordered.map((player, index) => <div className="panel-row ranking-row" key={player.id}>
    <span className="rank-number">{String(index + 1).padStart(2, '0')}</span><Marker shape={player.shape} color={player.color} />
    <span className="ranking-name"><strong>{player.name}</strong><small>{player.bankrupt ? '已破产' : player.ai ? '代理人' : '玩家'}</small><small>现金 {money(player.cash)} · 体力 {player.stamina} · 心情 {player.mood}</small><small className="ranking-statuses"><StatusLabel player={player} /></small></span>
    <strong>{money(getNetWorth(state, player.id))}</strong>
  </div>)}</div>;
}
const CONFINEMENT_NAMES: Record<NonNullable<Player['confinement']>['kind'], string> = { hospital: '医院', prison: '拘留所', sanatorium: '疗养院', parking: '停车场' };
const STATUS_NAMES: Record<string, string> = { luck: '幸运', unluck: '霉运', umbrella: '星伞' };
function StatusLabel({ player }: { player: Player }) { return <>{player.confinement && <span>{CONFINEMENT_NAMES[player.confinement.kind]} · 剩余 {player.confinement.remaining} 次</span>}{player.statuses.filter(status => status.remaining > 0).map(status => <span key={status.id}>{STATUS_NAMES[status.id] || (status.id.startsWith('weather:') ? '天气控制' : status.id)} · {status.remaining} 天</span>)}</>; }

function TileInfo({ state, nodeId, viewerId }: { state: GameState; nodeId: number; viewerId: string }) {
  const node = MAPS[state.config.mapId].nodes[nodeId];
  if (!node) return null;
  const property = state.properties[nodeId];
  const owner = state.players.find(p => p.id === property?.ownerId);
  const preview = getTileRentPreview(state, nodeId, viewerId);
  const propertyNode = ['land', 'power', 'water', 'telecom'].includes(node.kind);
  const kind: Record<string, string> = { start: '起点', land: '可购地', empty: '街道', coin: '金币', event: '偶遇', hospital: '医院', prison: '拘留所', sanatorium: '疗养院', parking: '停车场', power: '电力设施', water: '水务设施', telecom: '通信设施', station: '车站', shop: '商店', casino: '游乐场', exchange: '交易所' };
  const floorLabel = property?.level === 4 ? '地标 · 4 层' : property?.level === 0 ? '0 层 · 未建房' : `${property?.level} 层建筑`;
  return <div className="tile-details">
    <p>{kind[node.kind] || node.kind}{node.district ? ` · ${node.district}` : ''}</p>
    <div className="tile-facts">
      {propertyNode && <div><small>{property ? '原始地价' : '待售地价'}</small><strong>{money(preview.price)}</strong></div>}
      {property && <>
        <div><small>主人</small><strong>{owner?.name || '未知'}</strong></div>
        {node.kind === 'land' ? <div className="tile-floor-fact"><small>楼层</small><strong>{floorLabel}</strong></div> : <div className="tile-floor-fact"><small>建筑</small><strong>固定设施 · 无需楼层</strong></div>}
        <div><small>产权状态</small><strong>{property.mortgaged ? '已抵押' : '正常'}</strong></div>
      </>}
      {propertyNode && <div><small>{preview.prospective ? '购入后预计租金' : '经过租金'}</small><strong>{money(preview.rent)}</strong>{preview.reason && <small>{preview.reason}</small>}</div>}
    </div>
    <p className="guide-note">{node.kind === 'land' ? '购买与升级只在你停留并结算这个地块时进行。' : propertyNode ? '停在这里可购买；经济设施为固定设施，不设楼层升级。' : '停留在这里时会触发相应效果。'}</p>
  </div>;
}

function ConfirmNewGame({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) { return <Modal title="开启另一段旅程？" onClose={onCancel}><p>当前进度会由新对局覆盖。你可以先在设置里导出存档。</p><div className="modal-actions"><Button secondary onClick={onCancel}>继续这局</Button><Button onClick={onConfirm}>返回首页</Button></div></Modal>; }

function RoomLobby({ room, connected, onReady, onConfig, onAddBot, onRemove, onStart, onLeave }: { room: RoomSnapshot; connected: boolean; onReady: (ready: boolean) => void; onConfig: (config: RoomSnapshot['config']) => void; onAddBot: (profile: PlayerConfig) => void; onRemove: (seatId: string) => void; onStart: () => void; onLeave: () => void }) {
  const self = room.members.find(member => member.seatId === room.youSeatId);
  const [botIndex, setBotIndex] = useState(0);
  const [botPersonality, setBotPersonality] = useState<PlayerConfig['personality']>('balanced');
  const [copyStatus, setCopyStatus] = useState<'copied' | 'failed' | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);
  const humansReady = room.members.filter(member => !member.ai && !member.host).every(member => member.ready);
  const canStart = room.isHost && room.members.length >= 2 && humansReady && connected;
  const copyCode = async () => {
    try { await navigator.clipboard.writeText(room.code); setCopyStatus('copied'); }
    catch { setCopyStatus('failed'); }
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopyStatus(null), 2000);
  };
  return <div className="app room-lobby"><header className="landing-topbar"><div className="brand"><span className="brand-gem">◆</span><span><strong>棱镜假日</strong><small>PRISM DAYS</small></span></div><button className="text-button" onClick={onLeave}><ArrowLeft size={16} /> 离开房间</button></header><main className="lobby-layout"><div className="lobby-intro"><div className="eyebrow">好友房间 / PRIVATE JOURNEY</div><h1>旅伴已就位，<br />故事即将开始。</h1><p>把房间码发给好友，等大家准备好，再一起启程。</p><div className="room-code"><small>房间码</small><strong>{room.code}</strong><button onClick={copyCode}>{copyStatus === 'copied' ? '已复制' : '复制房间码'}</button></div>{copyStatus === 'failed' && <p className="copy-feedback" role="status">请手动复制房间码</p>}<p className="connection-status" role="status">{connected ? '● 已连接' : '○ 连接中断，正在尝试重连'}</p></div><div className="lobby-panel"><div className="section-kicker">同行名单 · {room.members.length}/4</div><div className="panel-list">{room.members.map(member => <div className="panel-row lobby-member" key={member.seatId}><Marker shape={member.shape} color={member.color} /><div><strong>{member.name}{member.seatId === room.youSeatId ? ' · 你' : ''}</strong><small>{member.host ? '房主' : member.ai ? `代理人 · ${member.personality === 'aggressive' ? '冒险' : member.personality === 'cautious' ? '稳健' : '灵活'}` : member.ready ? '已准备' : '等待准备'}{!member.connected && !member.ai ? ' · 离线' : ''}</small><small>信标 · {PLAYER_COLORS.find(option => option.color.toLowerCase() === member.color.toLowerCase())?.name ?? '专属颜色'}</small></div>{room.isHost && member.seatId !== room.youSeatId && <button className="icon-button" aria-label={`移除${member.name}`} onClick={() => onRemove(member.seatId)}><X size={16} /></button>}</div>)}</div><p className="color-hint">房间统一分配信标颜色；若颜色相同，会自动改用空闲颜色。</p>
      {room.isHost && room.members.length < 4 && <div className="lobby-bots"><h3>补一位代理人</h3><div className="setup-fields"><Field label="代理人"><select value={botIndex} onChange={event => setBotIndex(Number(event.target.value))}>{AI_PRESETS.map((bot, index) => <option value={index} key={index}>{bot.name}</option>)}</select></Field><Field label="性格"><select value={botPersonality} onChange={event => setBotPersonality(event.target.value as PlayerConfig['personality'])}><option value="cautious">稳健</option><option value="balanced">灵活</option><option value="aggressive">冒险</option></select></Field></div><Button secondary onClick={() => onAddBot({ ...AI_PRESETS[botIndex], personality: botPersonality })}>加入代理人</Button></div>}
      {room.isHost && <div className="lobby-rules"><h3>本局规则</h3><div className="setup-fields"><Field label="目的地"><select value={room.config.mapId} onChange={event => onConfig({ ...room.config, mapId: event.target.value as MapId })}>{MAP_ORDER.map(id => <option value={id} key={id}>{MAPS[id].name}</option>)}</select></Field><Field label="旅程长度"><select value={room.config.seasons} onChange={event => onConfig({ ...room.config, seasons: Number(event.target.value) })}><option value={4}>1 年 · 4 季</option><option value={8}>2 年 · 8 季</option><option value={16}>4 年 · 16 季</option><option value={0}>破产模式</option></select></Field><Field label="天气"><select value={room.config.weatherMode} onChange={event => onConfig({ ...room.config, weatherMode: event.target.value as GameConfig['weatherMode'] })}><option value="standard">标准</option><option value="challenge">挑战</option></select></Field></div></div>}
      {!room.isHost && <div className="lobby-rules"><h3>本局规则</h3><div className="panel-list"><div className="panel-row"><span>目的地</span><strong>{MAPS[room.config.mapId].name}</strong></div><div className="panel-row"><span>旅程长度</span><strong>{room.config.seasons === 0 ? '破产模式' : `${room.config.seasons / 4} 年 · ${room.config.seasons} 季`}</strong></div><div className="panel-row"><span>天气</span><strong>{room.config.weatherMode === 'standard' ? '标准' : '挑战'}</strong></div></div></div>}
      <div className="lobby-actions">{room.isHost ? <Button disabled={!canStart} onClick={onStart}>开始旅程 <ArrowRight size={17} /></Button> : <Button disabled={!connected} onClick={() => onReady(!self?.ready)}>{self?.ready ? '取消准备' : '我已准备'}</Button>}{!canStart && room.isHost && <small>需要至少 2 位旅伴，且所有真人已准备。</small>}</div>
    </div></main></div>;
}

function PlaySound() {
  try {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    [0, 0.09, 0.18].forEach((time, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.value = [480, 610, 760][index];
      gain.gain.setValueAtTime(0.001, context.currentTime + time);
      gain.gain.exponentialRampToValueAtTime(0.055, context.currentTime + time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + time + 0.08);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + time);
      oscillator.stop(context.currentTime + time + 0.09);
    });
    setTimeout(() => void context.close(), 600);
  } catch { /* audio is optional */ }
}

export function GameView({ state, viewerId, isOnline, connected, busy, playingMovement, onMovementComplete, onAction, onLeave, onGuide, onImport }: { state: GameState; viewerId: string; isOnline: boolean; connected: boolean; busy: boolean; playingMovement: boolean; onMovementComplete: () => void; onAction: (action: GameAction) => void; onLeave: () => void; onGuide: () => void; onImport: (file: File) => void }) {
  const [panel, setPanel] = useState<'inventory' | 'assets' | 'ranking' | 'settings' | 'weather' | 'guide' | 'logs' | null>(null);
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [sound, setSound] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [notice, setNotice] = useState('');
  const [activeEncounter, setActiveEncounter] = useState(false);
  const [activityHeight, setActivityHeight] = useState(0);
  const importRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (state.pending || state.seasonReport || state.phase === 'gameover') setPanel(null); }, [state.pending, state.seasonReport, state.phase]);
  const map = MAPS[state.config.mapId];
  const current = getCurrentPlayer(state);
  const viewer = state.players.find(p => p.id === viewerId) || current;
  const myTurn = viewer.id === current.id && !viewer.bankrupt;
  const mayAct = myTurn && !busy && !state.seasonReport && !endOfGame(state) && (!isOnline || connected);
  const tradePromptForMe = state.pending?.kind === 'trade' && state.pending.data?.buyerId === viewer.id;
  const weather = WEATHERS[state.weatherId];
  const weatherCopy = getWeatherCopy(state.weatherId, state.config.weatherMode);
  const ownLand = Object.values(state.properties).filter(prop => prop.ownerId === viewer.id).length;
  const doAction = (action: GameAction) => { if (!mayAct && !(tradePromptForMe && action.type === 'choose' && !busy && connected) && action.type !== 'dismissSeason') return; if (action.type === 'roll' && sound) PlaySound(); onAction(action); };
  const readFile = (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; if (file) { onImport(file); setPanel(null); setSelectedNode(null); } event.target.value = ''; };
  const showPrompt = !!state.pending && !busy && !state.seasonReport && (state.pending.kind === 'trade' ? tradePromptForMe : myTurn);
  const stationSelecting = showPrompt && state.pending?.kind === 'station';
  const stationOriginId = stationSelecting && Number.isInteger(Number(state.pending?.data?.nodeId)) ? Number(state.pending?.data?.nodeId) : current.position;
  const stationChoiceIds = stationSelecting ? state.pending!.choices.filter(choice => /^station:\d+$/.test(choice.id)).map(choice => Number(choice.id.slice(8))).filter(id => map.nodes[id]?.kind === 'station' && id !== stationOriginId) : [];
  const stationPromptKey = stationSelecting ? `${state.day}:${stationOriginId}:${state.movement?.id ?? 'none'}` : null;
  const previousStationKey = useRef<string | null>(null);
  const chosenStationId = stationSelecting && previousStationKey.current === stationPromptKey && selectedNode !== null && stationChoiceIds.includes(selectedNode) ? selectedNode : null;
  const chosenStationChoice = chosenStationId === null ? null : state.pending?.choices.find(choice => choice.id === `station:${chosenStationId}`);
  useEffect(() => {
    if (previousStationKey.current === stationPromptKey) return;
    previousStationKey.current = stationPromptKey;
    setSelectedNode(null);
    if (stationPromptKey) { setZoom(1); setPanel(null); }
  }, [stationPromptKey]);
  useEffect(() => {
    if (!stationSelecting) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || panel || confirmExit) return;
      event.preventDefault();
      if (!mayAct) return;
      setSelectedNode(null);
      onAction({ type: 'choose', choiceId: 'leave' });
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [stationSelecting, mayAct, onAction, panel, confirmExit]);
  const selectMapNode = (id: number) => { if (!stationSelecting || stationChoiceIds.includes(id)) setSelectedNode(id); };
  return <div className={`app game-shell weather-${weather?.family || 'clear'} ${stationSelecting ? 'station-selecting' : ''}`}><header className="game-topbar"><div className="game-brand"><span className="brand-gem">◆</span><strong>棱镜假日</strong></div><div className="game-location"><strong>{map.name}</strong></div><CalendarBadge day={state.day} /><WeatherButton weatherId={state.weatherId} onClick={() => setPanel('weather')} /><div className="game-top-actions"><button className="icon-button" title="玩法指南" aria-label="玩法指南" onClick={() => setPanel('guide')}><BookOpen size={19} /></button><button className="icon-button" title={sound ? '关闭骰子音效' : '开启骰子音效'} aria-label={sound ? '关闭骰子音效' : '开启骰子音效'} onClick={() => setSound(value => !value)}>{sound ? <Volume2 size={19} /> : <VolumeX size={19} />}</button><button className="icon-button" title="玩家信息" aria-label="玩家信息" onClick={() => setPanel('ranking')}><BarChart3 size={19} /></button><button className="icon-button" title="设置" aria-label="设置" onClick={() => setPanel('settings')}><Settings2 size={19} /></button></div></header><WeatherEffects weatherId={state.weatherId} mode={state.config.weatherMode} />{isOnline && !connected && <div className="connection-banner" role="status">房间连接已中断，正在重连；对局会暂停到所有真人回到房间。</div>}
    <main className={`game-main ${activeEncounter ? 'has-active-encounter' : ''}`} data-active-encounter={activeEncounter} style={{ '--activity-height': `${activityHeight}px` } as CSSProperties}><div className="board-stage"><Board map={map} state={state} viewerId={viewer.id} playing={playingMovement} stationSelection={stationSelecting ? { originId: stationOriginId, destinationIds: stationChoiceIds, disabled: !mayAct } : undefined} selectedNode={stationSelecting ? chosenStationId : selectedNode} onSelectNode={selectMapNode} onMovementComplete={onMovementComplete} zoom={zoom} /><div className="map-controls"><button aria-label="放大地图" onClick={() => setZoom(value => Math.min(1.8, Number((value + 0.15).toFixed(2))))}><Plus size={18} /></button><button aria-label="缩小地图" onClick={() => setZoom(value => Math.max(0.65, Number((value - 0.15).toFixed(2))))}><Minus size={18} /></button><button aria-label="复位地图" onClick={() => setZoom(1)}><RotateCcw size={17} /></button><FloorKey hidden={stationSelecting} /></div><div className="map-legend"><span><i className="legend-road" />道路</span><span><i className="legend-sale" />待售</span><span><i className="legend-public" />公共</span>{state.players.map((player, index) => <span key={player.id}><i className="legend-owned" style={{ '--owner-color': player.color } as CSSProperties} />已购 · P{index + 1}</span>)}</div></div>
      <aside className="player-hud"><div className="hud-head"><Marker shape={viewer.shape} color={viewer.color} size={40} /><div><small>幕后老板</small><h2>{viewer.name}</h2></div></div><div className="hud-money"><small>旅途资金</small><strong>{money(viewer.cash)}</strong></div><div className="hud-net-worth">总资产 {money(getNetWorth(state, viewer.id))}</div><div className="hud-bars"><label>体力 <span>{viewer.stamina}/100</span><progress max={100} value={viewer.stamina} /></label><label>心情 <span>{viewer.mood}/100</span><progress max={100} value={viewer.mood} /></label></div><div className="hud-meta">拥有 {ownLand} 处地产 · 背包 {viewer.inventory.length}/{viewer.capacity}</div>{(viewer.confinement || viewer.statuses.some(status => status.remaining > 0)) && <div className="hud-statuses"><StatusLabel player={viewer} /></div>}<div className="hud-buttons"><button onClick={() => setPanel('inventory')}><Package size={17} />背包</button><button onClick={() => setPanel('assets')}><BriefcaseBusiness size={17} />资产</button></div></aside>
      <ActivityNotifications state={state} busy={busy} blocked={!!(showPrompt || panel || confirmExit || state.seasonReport || endOfGame(state))} onOpenLogs={() => setPanel('logs')} onEncounterVisibilityChange={setActiveEncounter} onActivityHeightChange={setActivityHeight} />
      <aside className="turn-panel"><div className="turn-kicker">CURRENT TURN · 第 {state.day} 天</div><div className="turn-player"><Marker shape={current.shape} color={current.color} size={28} /><strong>{current.name}</strong></div><p>{busy ? '代理人正在行动 · 请观察信标与步数' : `${map.nodes[current.position]?.name || '旅途中'} · ${state.phase === 'ready' ? '等待行动' : state.phase === 'decision' ? '等待决定' : state.phase === 'end' ? '可以结束回合' : '旅程结束'}`}</p>{state.phase === 'ready' && (state.controlledRoll != null ? <p className="current-die controlled-die-status">已控骰 · 指定 {state.controlledRoll} 点</p> : <p className="current-die">当前骰子 D{state.selectedDie} · 1–{state.selectedDie} 点</p>)}{state.movement && state.movement.dice !== false && !busy && <><div className="dice-face" aria-label={`最终行进 ${Math.max(0, state.movement.roll + state.movement.modifier)} 格`}>{Math.max(0, state.movement.roll + state.movement.modifier)}</div><p className="dice-result-detail">{state.movement.controlled ? '指定点数 · ' : ''}{state.movement.modifier ? `原始 ${state.movement.roll} 点 · 修正 ${state.movement.modifier > 0 ? '+' : '−'}${Math.abs(state.movement.modifier)} · 最终 ${Math.max(0, state.movement.roll + state.movement.modifier)} 格` : `骰点 ${state.movement.roll} · 行进 ${state.movement.roll} 格`}</p></>}<div className="turn-actions">{mayAct && state.phase === 'ready' ? <><Button onClick={() => doAction({ type: 'roll' })}>掷骰子 <ArrowRight size={18} /></Button><Button secondary onClick={() => doAction({ type: 'rest' })}>原地休息</Button></> : mayAct && state.phase === 'end' ? <Button onClick={() => doAction({ type: 'endTurn' })}>结束回合 <ArrowRight size={18} /></Button> : <p className="turn-wait">{busy ? '正在播放行动…' : !connected && isOnline ? '正在重新连接房间…' : state.pending?.kind === 'trade' && !tradePromptForMe ? `等待 ${state.players.find(p => p.id === state.pending?.data?.buyerId)?.name || '买方'} 回应报价` : myTurn && state.phase === 'decision' ? '请完成本次决定' : `${current.name} 正在行动`}</p>}</div></aside>
      <div className="turn-order">{state.players.map((player, index) => <div className={`${player.id === current.id ? 'current' : ''} ${player.bankrupt ? 'bankrupt' : ''}`} key={player.id}><Marker shape={player.shape} color={player.color} size={19} /><span className="player-index">P{index + 1}</span><span>{player.name}</span></div>)}</div>
      {stationSelecting && <StationTravelPanel originName={map.nodes[stationOriginId]?.name || state.pending?.title || '当前车站'} destinationName={chosenStationId === null ? undefined : map.nodes[chosenStationId]?.name} cash={viewer.cash} disabled={!mayAct} onConfirm={() => { if (mayAct && chosenStationChoice && !chosenStationChoice.disabled) doAction({ type: 'choose', choiceId: chosenStationChoice.id }); }} onCancel={() => { if (mayAct) { setSelectedNode(null); doAction({ type: 'choose', choiceId: 'leave' }); } }} />}
      {!stationSelecting && previousStationKey.current === null && selectedNode !== null && <aside className="tile-panel"><button className="icon-button" aria-label="关闭地块详情" onClick={() => setSelectedNode(null)}><X size={17} /></button><div className="section-kicker">地点 #{selectedNode}</div><h2>{map.nodes[selectedNode]?.name}</h2><TileInfo state={state} nodeId={selectedNode} viewerId={viewer.id} /></aside>}
    </main>
    {notice && <div className="toast" role="status" onClick={() => setNotice('')}>{notice}</div>}
    {showPrompt && !stationSelecting && state.pending && <Modal key={`${state.pending.kind}-${state.pending.data?.nodeId ?? 'none'}-${state.pending.title}`} title={state.pending.title} className={state.pending.kind === 'exchange' ? 'modal-exchange' : state.pending.kind === 'casino' ? 'modal-casino' : state.pending.kind === 'shop' ? 'modal-shop' : state.pending.kind === 'rent' ? 'modal-rent' : ''} closable={false} onClose={() => {}}>{state.pending.kind !== 'rent' && <p>{state.pending.body}</p>}{state.pending.kind === 'rent' && <RentDecision state={state} player={viewer} prompt={state.pending} disabled={!mayAct} onChoose={choiceId => doAction({ type: 'choose', choiceId })} />}{state.pending.kind === 'casino' && <CasinoPanel cash={viewer.cash} result={state.pending.casinoResult} />}{state.pending.kind === 'exchange' && myTurn && <TradingDesk state={state} onAction={doAction} onClose={() => doAction({ type: 'choose', choiceId: 'leave' })} />}{state.pending.kind === 'shop' && <ShopPanel player={viewer} prompt={state.pending} disabled={!mayAct} onChoose={choiceId => doAction({ type: 'choose', choiceId })} />}{state.pending.kind !== 'exchange' && state.pending.kind !== 'shop' && state.pending.kind !== 'rent' && <div className="choice-list">{state.pending.choices.map(choice => <button key={choice.id} disabled={choice.disabled || !connected && isOnline} onClick={() => doAction({ type: 'choose', choiceId: choice.id })}><strong>{choice.label}</strong>{choice.description && <small>{choice.description}</small>}</button>)}</div>}</Modal>}
    {state.seasonReport && <Modal title={`第 ${state.seasonReport.season} 季 · 旅途结算`} closable={false} onClose={() => {}}><p>又一个季节过去了。看看大家收集了怎样的风景。</p><div className="ranking-list">{state.seasonReport.rankings.map((row, index) => <div className="panel-row ranking-row" key={row.id}><span className="rank-number">{String(index + 1).padStart(2, '0')}</span><span className="ranking-name"><strong>{row.name}</strong></span><strong>{money(row.assets)}</strong></div>)}</div><div className="modal-actions"><Button disabled={isOnline && !connected} onClick={() => onAction({ type: 'dismissSeason' })}>继续旅程</Button></div></Modal>}
    {endOfGame(state) && !state.seasonReport && <Modal title="旅程抵达终点" closable={false} onClose={() => {}}><p className="gameover-winner">{state.players.find(p => p.id === state.winnerId)?.name || '大家'}，在棱镜星留下了最耀眼的印记。</p><Ranking state={state} /><div className="modal-actions"><Button secondary onClick={onLeave}>返回首页</Button><Button onClick={onLeave}>开启新一局</Button></div></Modal>}
    {panel && <Modal title={{ inventory: '旅行背包', assets: '我的资产', ranking: '玩家与资产榜', settings: '旅途设置', weather: '今日天气', guide: '玩法指南', logs: '旅途手记' }[panel]} onClose={() => setPanel(null)} className={`modal-${panel}`}>
      {panel === 'inventory' && <Inventory state={state} player={viewer} onAction={doAction} disabled={!mayAct} />}
      {panel === 'assets' && <Assets state={state} player={viewer} onAction={doAction} />}
      {panel === 'ranking' && <Ranking state={state} />}
      {panel === 'weather' && <div className="weather-detail"><div className="weather-icon"><WeatherIcon weatherId={state.weatherId} size={48} /></div><h3>{weather?.name}</h3><p className="weather-detail-intro">{weatherCopy.intro}</p><div className="weather-detail-effects"><h4>今日规则</h4>{weatherCopy.effects.map((effect, index) => <p key={`${index}:${effect}`}>{effect}</p>)}</div>{weatherCopy.protection && <p className="weather-detail-protection">{weatherCopy.protection}</p>}<p className="guide-note">{state.config.weatherMode === 'standard' ? '标准天气降低了极端天气的出现概率；普通雨天只影响怕水道具，骄阳单次额外伤害每项最多 18 点。' : '挑战天气提高了极端天气的出现概率，但仍保持低概率并遵循季节；雨天可影响所有类型道具，骄阳额外伤害不设上限。'}灾难天气从第 22 天起才可能出现。</p></div>}
      {panel === 'guide' && <Guide />}
      {panel === 'logs' && <div className="log-list">{state.logs.slice().reverse().map(log => <div className={`panel-row log-${log.tone}`} key={log.id}><small>第 {log.day} 天</small><span>{log.text}</span></div>)}</div>}
      {panel === 'settings' && <div className="settings-panel"><p>地图：{map.name} · {state.config.seasons ? `${state.config.seasons} 季` : '破产模式'} · {state.config.weatherMode === 'standard' ? '标准天气' : '挑战天气'}</p><p>随机种子：{state.config.seed}</p>{isOnline ? <p>房间码：{savedRoomCode() || '—'}。离开后可用同一设备与房间码重新加入。离开不会替你行动。</p> : <p>对局会自动保存在这台设备上。也可以导出 JSON 文件，稍后导入继续。</p>}<div className="settings-actions">{!isOnline && <><Button secondary onClick={() => exportGame(state)}><Download size={16} /> 导出存档</Button><Button secondary onClick={() => importRef.current?.click()}><Upload size={16} /> 导入存档</Button><input ref={importRef} type="file" accept="application/json,.json" hidden onChange={readFile} /></>}<Button secondary onClick={() => setConfirmExit(true)}><Home size={16} /> {isOnline ? '离开房间' : '返回首页'}</Button></div></div>}
    </Modal>}
    {confirmExit && <Modal title={isOnline ? '离开房间？' : '返回首页？'} onClose={() => setConfirmExit(false)}><p>{isOnline ? '你的座位会保留，离开后不会由代理人替你行动。你可以用同一设备和房间码重连。' : '当前旅程已经自动保存，你可以从首页继续。'}</p><div className="modal-actions"><Button secondary onClick={() => setConfirmExit(false)}>继续这局</Button><Button onClick={onLeave}>确认离开</Button></div></Modal>}
  </div>;
}

export default function App() {
  const [localState, setLocalState] = useState<GameState | null>(null);
  const localRef = useRef<GameState | null>(null);
  const [savedState, setSavedState] = useState<GameState | null>(() => loadSave());
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [networkIntent, setNetworkIntent] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [playingMovement, setPlayingMovement] = useState(false);
  const [gameEpoch, setGameEpoch] = useState(0);
  const [dialog, setDialog] = useState<'guide' | 'new' | null>(null);
  const [error, setError] = useState('');
  const networkRef = useRef<RoomClient | null>(null);
  const lastMovementRef = useRef<number | null>(null);
  const roomSnapshotRef = useRef<RoomSnapshot | null>(null);
  const needsRoomCatchupRef = useRef(false);
  const serverMovementUntilRef = useRef(0);
  const movementReleaseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeState = room?.state || localState;
  if (!networkRef.current) networkRef.current = new RoomClient((event: NetworkEvent) => {
    if (event.type === 'room') {
      const previous = roomSnapshotRef.current;
      const catchup = event.room.started && (!previous || previous.code !== event.room.code || needsRoomCatchupRef.current);
      roomSnapshotRef.current = event.room;
      if (typeof event.room.movementUntil === 'number' && Number.isFinite(event.room.movementUntil)) serverMovementUntilRef.current = event.room.movementUntil;
      else if (catchup) serverMovementUntilRef.current = 0;
      if (catchup) {
        needsRoomCatchupRef.current = false;
        if (movementReleaseRef.current) clearTimeout(movementReleaseRef.current);
        const movement = event.room.state?.movement;
        lastMovementRef.current = movement?.id ?? null;
        setPlayingMovement(false);
        const remaining = movement ? Math.max(0, serverMovementUntilRef.current - Date.now()) : 0;
        setBusy(remaining > 0);
        if (remaining > 0) movementReleaseRef.current = setTimeout(() => setBusy(false), remaining);
      } else {
        const movement = event.room.state?.movement;
        if (movement && movement.id !== lastMovementRef.current) {
          lastMovementRef.current = movement.id;
          if (movementReleaseRef.current) clearTimeout(movementReleaseRef.current);
          setPlayingMovement(true);
          setBusy(true);
        }
      }
      setRoom(event.room); setNetworkIntent(true); setError('');
    }
    else if (event.type === 'status') { if (!event.connected && roomSnapshotRef.current?.started) needsRoomCatchupRef.current = true; setConnected(event.connected); }
    else if (event.type === 'error') setError(event.message);
    else if (event.type === 'left') { roomSnapshotRef.current = null; needsRoomCatchupRef.current = false; setRoom(null); setNetworkIntent(false); setConnected(false); setBusy(false); setPlayingMovement(false); }
  });

  useEffect(() => {
    const client = networkRef.current;
    if (savedRoomCode()) { setNetworkIntent(true); client?.connect(); }
    return () => client?.stop();
  }, []);

  useEffect(() => { if (localState) { localRef.current = localState; saveGame(localState); setSavedState(localState); } }, [localState]);
  useEffect(() => {
    const id = activeState?.movement?.id;
    if (id !== undefined && id !== null && id !== lastMovementRef.current) {
      lastMovementRef.current = id;
      if (movementReleaseRef.current) clearTimeout(movementReleaseRef.current);
      if (room && activeState?.movement) serverMovementUntilRef.current = typeof room.movementUntil === 'number' && Number.isFinite(room.movementUntil) ? room.movementUntil : Date.now() + getMovementTimeline(activeState.movement).duration + 300;
      setPlayingMovement(true);
      setBusy(true);
    }
  }, [activeState?.movement?.id]);
  useEffect(() => { if (!busy) return; const duration = activeState?.movement ? getMovementTimeline(activeState.movement).duration : 0; const timeout = setTimeout(() => setBusy(false), duration + 3000); return () => clearTimeout(timeout); }, [busy, activeState?.movement?.id]);
  const commitLocal = useCallback((next: GameState, previous: GameState) => {
    if (next === previous) return false;
    if (next.movement && next.movement.id !== previous.movement?.id) { lastMovementRef.current = next.movement.id; setPlayingMovement(true); setBusy(true); }
    localRef.current = next;
    setLocalState(next);
    return true;
  }, []);
  useEffect(() => {
    if (!localState || room || busy || localState.seasonReport || localState.phase === 'gameover' || !getCurrentPlayer(localState).ai) return;
    const timer = setTimeout(() => { const previous = localRef.current; if (!previous || !getCurrentPlayer(previous).ai) return; const next = runAI(previous); commitLocal(next, previous); }, 800);
    return () => clearTimeout(timer);
  }, [localState, room, busy, commitLocal]);

  const startLocal = (config: GameConfig) => {
    try { const state = createGame(config); clearSave(); localRef.current = state; setLocalState(state); setGameEpoch(value => value + 1); setRoom(null); roomSnapshotRef.current = null; setNetworkIntent(false); setBusy(false); setPlayingMovement(false); lastMovementRef.current = null; setError(''); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '无法开始对局，请检查设置。'); }
  };
  const startOnline = (kind: 'create' | 'join', profile: PlayerConfig, config: Pick<GameConfig, 'mapId' | 'seasons' | 'weatherMode' | 'seed'>, code?: string) => {
    setLocalState(null); localRef.current = null; lastMovementRef.current = null; roomSnapshotRef.current = null; needsRoomCatchupRef.current = false; setBusy(false); setPlayingMovement(false); setNetworkIntent(true); setError('');
    if (kind === 'create') networkRef.current?.create(profile, config);
    else networkRef.current?.join(code || '', profile);
  };
  const resumeLocal = () => { const save = loadSave(); if (save) { lastMovementRef.current = save.movement?.id ?? null; localRef.current = save; setLocalState(save); setGameEpoch(value => value + 1); setBusy(false); setPlayingMovement(false); setError(''); } else setError('本机没有可继续的存档。'); };
  const onAction = (action: GameAction) => {
    if (room) { if (connected) networkRef.current?.action(action); else setError('房间尚未连接，请稍后再试。'); return; }
    const previous = localRef.current;
    if (!previous) return;
    const next = act(previous, action);
    if (!commitLocal(next, previous)) setError('当前条件下无法执行此操作。');
    else setError('');
  };
  const onImport = async (file: File) => {
    try { if (file.size > 5_000_000) throw new Error('存档文件过大。'); const value = parseSave(await file.text()); if (value.config.mode !== 'pve') throw new Error('联机对局只能通过房间码恢复。'); lastMovementRef.current = value.movement?.id ?? null; localRef.current = value; setLocalState(value); setGameEpoch(current => current + 1); setError('存档已导入。'); setBusy(false); setPlayingMovement(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '存档导入失败。'); }
  };
  const leave = () => {
    if (movementReleaseRef.current) clearTimeout(movementReleaseRef.current);
    roomSnapshotRef.current = null; needsRoomCatchupRef.current = false; serverMovementUntilRef.current = 0;
    if (room || networkIntent) { networkRef.current?.leave(); setRoom(null); setNetworkIntent(false); }
    else { setLocalState(null); localRef.current = null; }
    lastMovementRef.current = null; setBusy(false); setPlayingMovement(false); setDialog(null);
  };
  const viewerId = room?.youPlayerId || (localState?.players.find(player => !player.ai)?.id ?? localState?.players[0]?.id);
  const movementComplete = () => {
    if (!room) { setBusy(false); return; }
    const remaining = serverMovementUntilRef.current - Date.now();
    if (movementReleaseRef.current) clearTimeout(movementReleaseRef.current);
    if (remaining <= 0) setBusy(false);
    else movementReleaseRef.current = setTimeout(() => setBusy(false), remaining);
  };
  return <>
    {room && !room.started ? <RoomLobby room={room} connected={connected} onReady={ready => networkRef.current?.ready(ready)} onConfig={config => networkRef.current?.config(config)} onAddBot={profile => networkRef.current?.addBot(profile)} onRemove={seatId => networkRef.current?.remove(seatId)} onStart={() => networkRef.current?.start()} onLeave={leave} />
      : activeState && viewerId ? <GameView key={`${room?.code ?? 'local'}-${gameEpoch}`} state={activeState} viewerId={viewerId} isOnline={!!room} connected={!!room ? connected : true} busy={busy} playingMovement={busy && playingMovement} onMovementComplete={movementComplete} onAction={onAction} onLeave={leave} onGuide={() => setDialog('guide')} onImport={onImport} />
      : networkIntent ? <div className="app connecting-screen"><div className="brand"><span className="brand-gem">◆</span><span><strong>棱镜假日</strong><small>PRISM DAYS</small></span></div><h1>正在连接旅伴…</h1><p>房间将自动同步到这台设备。</p><Button secondary onClick={leave}>返回首页</Button></div>
      : <Landing save={savedState} onResume={resumeLocal} onStart={startLocal} onOnline={startOnline} onGuide={() => setDialog('guide')} />}
    {dialog === 'guide' && <Modal title="玩法指南" onClose={() => setDialog(null)}><Guide /></Modal>}
    {dialog === 'new' && <ConfirmNewGame onConfirm={() => { leave(); setDialog(null); }} onCancel={() => setDialog(null)} />}
    {error && <div className="global-toast" role="alert"><span>{error}</span><button aria-label="关闭提示" onClick={() => setError('')}><X size={16} /></button></div>}
  </>;
}
