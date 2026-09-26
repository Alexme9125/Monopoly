import { useEffect, useLayoutEffect, useState } from 'react';
import { canTargetItem, canUseItem, getCurrentPlayer } from '../game/engine';
import { ITEMS } from '../game/data';
import type { GameAction, GameState, InventorySlot, Player } from '../game/types';
import DiceControlPicker from './DiceControlPicker';
import ItemIcon from './ItemIcon';
import { PlayerTargetPicker, WeatherTargetPicker } from './ItemTargetPicker';

const money = (value: number) => `PM$ ${Math.round(value).toLocaleString('zh-CN')}`;
const passive = new Set(['shield', 'arrest']);

export interface InventoryPanelProps {
  state: GameState;
  player: Player;
  onAction: (action: GameAction) => void;
  onSelectMapTarget: (slot: InventorySlot) => void;
  disabled?: boolean;
}

export default function InventoryPanel({ state, player, onAction, onSelectMapTarget, disabled = false }: InventoryPanelProps) {
  const [targetItem, setTargetItem] = useState<string | null>(null);
  const selected = player.inventory.find(slot => slot.uid === targetItem);
  const selectedDef = selected && Object.hasOwn(ITEMS, selected.itemId) ? ITEMS[selected.itemId] : null;
  const mayManage = !disabled && getCurrentPlayer(state).id === player.id && (state.phase === 'ready' || state.phase === 'end');
  const usable = (uid: string) => !disabled && canUseItem(state, player.id, uid);
  useEffect(() => { if (targetItem && (!selected || !usable(targetItem))) setTargetItem(null); }, [targetItem, selected, disabled, state, player.id]);
  useLayoutEffect(() => {
    if (!selected || (selectedDef?.target !== 'player' && selectedDef?.target !== 'weather')) return;
    const card = document.querySelector<HTMLElement>('.modal-inventory');
    const body = document.querySelector<HTMLElement>('.modal-inventory .modal-body');
    if (card) card.scrollTop = 0;
    if (body) body.scrollTop = 0;
    document.querySelector<HTMLElement>('.modal-inventory .inventory-target-head h3')?.focus({ preventScroll: true });
  }, [selected?.uid, selectedDef?.target]);

  const useReason = (slot: InventorySlot) => {
    if (slot.itemId === 'rent') return '需要支付租金时，再决定是否使用免租卡。';
    if (passive.has(slot.itemId)) return '遇到逮捕或攻击时自动消耗。';
    if (slot.wet) return '已受潮，暂不可用。';
    if (slot.itemId === 'controller' && state.twinRoll) return '已准备双骰，本回合不能使用控骰器。';
    if (slot.itemId === 'controller' && state.selectedDie !== 6) return '已启用多面骰，本回合不能使用控骰器。';
    if (slot.itemId === 'controller' && state.controlledRoll != null) return '已指定点数，本回合不能再次使用控骰器。';
    if (slot.itemId === 'twinDish' && state.controlledRoll != null) return '已指定点数，本回合不能启用双骰。';
    if (slot.itemId === 'twinDish' && state.twinRoll) return '本回合已准备双骰。';
    if (/^dice(8|12|20|100)$/.test(slot.itemId) && state.controlledRoll != null) return '已指定点数，不能再启用骰具。';
    if (disabled) return '当前回合或连接状态下暂不可操作。';
    if (!usable(slot.uid)) return state.phase === 'ready' ? '当前天气或状态下不可使用。' : '只能在你的行动前使用。';
    return '';
  };

  const use = (slot: InventorySlot) => {
    if (!usable(slot.uid)) return;
    const item = Object.hasOwn(ITEMS, slot.itemId) ? ITEMS[slot.itemId] : null;
    if (!item) return;
    if (item.target === 'property' || item.target === 'node' || slot.itemId === 'teleport') { onSelectMapTarget(slot); return; }
    if (item.target === 'player' || item.target === 'weather' || item.target === 'dice') { setTargetItem(slot.uid); return; }
    onAction({ type: 'useItem', itemUid: slot.uid });
  };

  if (selected && selectedDef?.target === 'dice') return <DiceControlPicker weatherId={state.weatherId} disabled={!usable(selected.uid)} onCancel={() => setTargetItem(null)} onConfirm={diceValue => {
    if (canTargetItem(state, player.id, selected.uid, { diceValue }) && !disabled) onAction({ type: 'useItem', itemUid: selected.uid, diceValue });
    setTargetItem(null);
  }} />;
  if (selected && selectedDef?.target === 'player') return <PlayerTargetPicker state={state} player={player} itemUid={selected.uid} itemName={selectedDef.name} disabled={disabled} onBack={() => setTargetItem(null)} onConfirm={targetId => {
    if (canTargetItem(state, player.id, selected.uid, { targetId }) && !disabled) onAction({ type: 'useItem', itemUid: selected.uid, targetId });
    setTargetItem(null);
  }} />;
  if (selected && selectedDef?.target === 'weather') return <WeatherTargetPicker state={state} player={player} itemUid={selected.uid} itemName={selectedDef.name} disabled={disabled} onBack={() => setTargetItem(null)} onConfirm={weatherId => {
    if (canTargetItem(state, player.id, selected.uid, { weatherId }) && !disabled) onAction({ type: 'useItem', itemUid: selected.uid, weatherId });
    setTargetItem(null);
  }} />;

  return <div className="inventory-panel"><p>背包 {player.inventory.length}/{player.capacity} 格。道具通常在行动前使用；免租卡在付租时确认，部分道具会受天气影响。</p>
    <div className="inventory-grid">{Array.from({ length: player.capacity }, (_, index) => {
      const slot = player.inventory[index];
      const item = slot && Object.hasOwn(ITEMS, slot.itemId) ? ITEMS[slot.itemId] : null;
      const reason = slot ? useReason(slot) : '';
      return <div className={`inventory-slot ${slot ? 'filled' : 'empty'}`} key={index}>{slot && item ? <>
        <span className="item-icon"><ItemIcon itemId={item.id} size={20} /></span><strong>{item.name}{slot.quantity > 1 ? ` ×${slot.quantity}` : ''}</strong><small>{item.description}</small>{slot.wet && <em>已受潮</em>}
        <div className="slot-actions"><button disabled={!usable(slot.uid)} title={reason || undefined} onClick={() => use(slot)}>{slot.itemId === 'rent' ? '付租时选择' : passive.has(slot.itemId) ? '被动生效' : '使用'}</button><button disabled={!mayManage} title={`抵押可得 ${money(Math.floor((item.shop ? item.price : 10000) * 0.5))}`} onClick={() => onAction({ type: 'pawnItem', itemUid: slot.uid })}>抵押</button><button disabled={!mayManage} onClick={() => onAction({ type: 'discardItem', itemUid: slot.uid })}>丢弃</button></div>
        {reason && <small className="item-use-reason">{reason}</small>}
      </> : <span className="slot-placeholder">空位 {index + 1}</span>}</div>;
    })}</div>
    {player.pawnedItems.length > 0 && <><h3>已抵押道具</h3><div className="panel-list">{player.pawnedItems.map(pawn => {
      const cost = Math.ceil(pawn.principal * 1.2);
      const def = Object.hasOwn(ITEMS, pawn.slot.itemId) ? ITEMS[pawn.slot.itemId] : null;
      const hasSpace = player.inventory.length < player.capacity || !!(def?.stackable && player.inventory.some(slot => slot.itemId === pawn.slot.itemId));
      return <div className="panel-row" key={pawn.slot.uid}><div><strong>{def?.name || pawn.slot.itemId}</strong><small>抵押本金 {money(pawn.principal)} · 赎回需 {money(cost)}</small></div><button disabled={!mayManage || player.cash < cost || !hasSpace} title={player.cash < cost ? '资金不足' : !hasSpace ? '背包没有空位' : undefined} onClick={() => onAction({ type: 'redeemItem', itemUid: pawn.slot.uid })}>赎回 · {money(cost)}</button></div>;
    })}</div></>}
  </div>;
}
