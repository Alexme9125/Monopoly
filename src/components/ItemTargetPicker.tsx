import { useState, type CSSProperties } from 'react';
import { canTargetItem, getAcquisitionPrice } from '../game/engine';
import { ITEMS, WEATHERS } from '../game/data';
import { HOSTILE_ITEM_MOOD_LOSS } from '../game/economy';
import { MAPS } from '../game/maps';
import type { GameState, MapData, Player } from '../game/types';
import ItemIcon from './ItemIcon';
import { WeatherIcon } from '../visual/EnvironmentBadge';

const money = (value: number) => `PM$ ${Math.round(value).toLocaleString('zh-CN')}`;

interface SharedTargetProps {
  state: GameState;
  player: Player;
  itemUid: string;
  itemName: string;
  disabled: boolean;
  onBack: () => void;
}

export function PlayerTargetPicker({ state, player, itemUid, itemName, disabled, onBack, onConfirm }: SharedTargetProps & { onConfirm: (targetId: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const slot = player.inventory.find(entry => entry.uid === itemUid);
  const description = slot && Object.hasOwn(ITEMS, slot.itemId) ? ITEMS[slot.itemId].description : '';
  const players = state.players.filter(other => other.id !== player.id && !other.bankrupt);
  const selectedValid = !!selectedId && !disabled && canTargetItem(state, player.id, itemUid, { targetId: selectedId });
  return <div className="inventory-target-view player-target-picker">
    <div className="inventory-target-head"><div><small>指定玩家</small><h3 tabIndex={-1}>使用 {itemName}</h3>{description && <p className="player-target-effect">{description}</p>}<p>选中目标后确认使用；返回背包不会消耗道具。</p></div><button className="secondary-button" type="button" onClick={onBack}>返回背包</button></div>
    <div className="player-target-grid" role="group" aria-label="选择玩家目标">{players.map(other => {
      const eligible = !disabled && canTargetItem(state, player.id, itemUid, { targetId: other.id });
      const location = MAPS[state.config.mapId].nodes[other.position]?.name ?? '未知地点';
      return <button key={other.id} type="button" className={`player-target-card ${selectedId === other.id ? 'is-selected' : ''}`} aria-pressed={selectedId === other.id} disabled={!eligible} onClick={() => setSelectedId(other.id)}>
        <span className="player-target-color" style={{ '--target-color': other.color } as CSSProperties} aria-hidden="true" />
        <strong>{other.name}</strong><small>{other.ai ? '代理人' : '玩家'} · {other.id === state.players[state.currentPlayerIndex]?.id ? '当前行动者' : '同行者'}</small>
        <small>当前位置 · {location}</small>
      </button>;
    })}</div>
    {!players.length && <p className="inventory-target-empty">当前没有可以指定的玩家。</p>}
    <div className="inventory-target-actions"><button className="secondary-button" type="button" onClick={onBack}>取消</button><button className="action-button" type="button" disabled={!selectedValid} onClick={() => { if (selectedValid) onConfirm(selectedId!); }}>确认使用 {itemName}</button></div>
  </div>;
}

export function WeatherTargetPicker({ state, player, itemUid, itemName, disabled, onBack, onConfirm }: SharedTargetProps & { onConfirm: (weatherId: string) => void }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedValid = !!selectedId && !disabled && canTargetItem(state, player.id, itemUid, { weatherId: selectedId });
  return <div className="inventory-target-view weather-target-picker">
    <div className="inventory-target-head"><div><small>指定明日天气</small><h3 tabIndex={-1}>使用 {itemName}</h3><p>可跨季节指定天气；灾难天气从第 22 天起开放。返回背包不会消耗道具。</p></div><button className="secondary-button" type="button" onClick={onBack}>返回背包</button></div>
    <div className="weather-target-grid" role="group" aria-label="选择天气目标">{Object.values(WEATHERS).map(weather => {
      const eligible = !disabled && canTargetItem(state, player.id, itemUid, { weatherId: weather.id });
      return <button key={weather.id} type="button" className={`weather-target-card ${selectedId === weather.id ? 'is-selected' : ''}`} aria-pressed={selectedId === weather.id} disabled={!eligible} title={!eligible && weather.family === 'disaster' && state.day < 22 ? '灾难天气从第 22 天起开放' : undefined} onClick={() => setSelectedId(weather.id)}>
        <WeatherIcon weatherId={weather.id} size={24} /><strong>{weather.name}</strong>{weather.family === 'disaster' && state.day < 22 && <small>第 22 天开放</small>}
      </button>;
    })}</div>
    <div className="inventory-target-actions"><button className="secondary-button" type="button" onClick={onBack}>取消</button><button className="action-button" type="button" disabled={!selectedValid} onClick={() => { if (selectedValid) onConfirm(selectedId!); }}>确认使用 {itemName}</button></div>
  </div>;
}

export function MapItemTargetPanel({ state, map, player, itemUid, selectedNodeId, eligibleCount, disabled, onCancel, onConfirm }: {
  state: GameState;
  map: MapData;
  player: Player;
  itemUid: string;
  selectedNodeId: number | null;
  eligibleCount: number;
  disabled: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const slot = player.inventory.find(entry => entry.uid === itemUid);
  const item = slot && ITEMS[slot.itemId];
  if (!item) return null;
  const instant = slot.itemId === 'teleport' || slot.itemId === 'teleportStone';
  const node = selectedNodeId === null ? null : map.nodes[selectedNodeId];
  const property = node && state.properties[node.id];
  const owner = state.players.find(entry => entry.id === property?.ownerId);
  const eligible = !!node && !disabled && canTargetItem(state, player.id, itemUid, { nodeId: node.id });
  const acquirePrice = node ? getAcquisitionPrice(state, node.id) : null;
  const effect = slot.itemId === 'repair' ? `将这处地产由 ${property?.level ?? 0} 层提升至 ${(property?.level ?? 0) + 1} 层。`
    : slot.itemId === 'demolish' ? `将对手地产由 ${property?.level ?? 0} 层降至 ${Math.max(0, (property?.level ?? 0) - 1)} 层；成功后产权人心情 −${HOSTILE_ITEM_MOOD_LOSS}，星盾卡挡下则不损失。`
      : slot.itemId === 'acquire' ? `按完整投入的 1.5 倍收购，预计支付 ${acquirePrice === null ? '—' : money(acquirePrice)}；成功后原主人心情 −${HOSTILE_ITEM_MOOD_LOSS}，星盾卡挡下则不损失。`
        : item.description;
  return <>
    <div className="item-target-banner" role="status" tabIndex={-1}><span className="item-target-icon"><ItemIcon itemId={item.id} size={28} /></span><div><small>地图目标模式 · 可选 {eligibleCount} 处</small><strong>使用 {item.name}</strong><p>{slot.itemId === 'teleportStone' ? '点选任意其他地点即传送并结算落点；已准备的骰具效果会作废。' : slot.itemId === 'teleport' ? '点选另一座车站即换乘，本回合移动结束。' : '在地图上点选目标地产，核对效果后再确认使用。'} 可放大并拖动地图。</p>{eligibleCount === 0 && <p className="item-target-empty">当前没有合法目标；取消返回背包，不会消耗道具。</p>}</div><button className="secondary-button item-target-cancel" type="button" onClick={onCancel}>取消 · 返回背包</button></div>
    {!instant && node && <aside className="item-target-detail"><div className="item-target-detail-head"><span>目标地产 #{node.id}</span><strong tabIndex={-1}>{node.name}</strong></div><div className="item-target-detail-facts"><span>产权人 · {owner?.name ?? '未知'}</span>{node.kind === 'land' && <span>当前 {property?.level ?? 0} 层</span>}{slot.itemId === 'acquire' && <span>预计支出 · {acquirePrice === null ? '—' : money(acquirePrice)}</span>}</div><p>{effect}</p><div className="item-target-detail-actions"><button type="button" className="secondary-button" onClick={onCancel}>取消使用</button><button type="button" className="action-button" disabled={!eligible} onClick={onConfirm}>使用 {item.name}</button></div></aside>}
  </>;
}
