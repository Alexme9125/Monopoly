import { useState } from 'react';
import { Dices, Package, Ticket, Utensils, Zap } from 'lucide-react';
import { ITEMS } from '../game/data';
import type { Choice, ItemDef, Player, Prompt } from '../game/types';

const money = (value: number) => `PM$ ${Math.round(value).toLocaleString('zh-CN')}`;

function ItemCategoryIcon({ category }: { category: ItemDef['category'] }) {
  const Icon = { dice: Dices, attack: Zap, supply: Utensils, card: Ticket, special: Package }[category];
  return <Icon size={22} aria-hidden="true" />;
}

export interface ShopPanelProps {
  player: Player;
  prompt: Prompt;
  onChoose: (choiceId: string) => void;
  disabled?: boolean;
}

export default function ShopPanel({ player, prompt, onChoose, disabled = false }: ShopPanelProps) {
  const [inventoryOpen, setInventoryOpen] = useState(() => typeof window === 'undefined' || !window.matchMedia('(max-width: 640px)').matches);
  const used = player.inventory.length;
  const remaining = Math.max(0, player.capacity - used);
  const goods = prompt.choices.filter(choice => choice.id.startsWith('buy:'));
  const leave = prompt.choices.find(choice => choice.id === 'leave');
  const owned = new Map<string, { quantity: number; wet: boolean }>();
  for (const slot of player.inventory) {
    const key = `${slot.itemId}:${slot.wet ? 'wet' : 'dry'}`;
    const previous = owned.get(key);
    owned.set(key, { quantity: (previous?.quantity || 0) + slot.quantity, wet: slot.wet });
  }

  return <div className="shop-panel">
    <div className="shop-status-bar" aria-label="我的现金和背包容量">
      <div className="shop-wallet"><small>当前可用现金</small><strong>{money(player.cash)}</strong></div>
      <div className="shop-capacity"><small>背包容量</small><strong>{used}/{player.capacity} 格</strong><small>剩余 {remaining} 格</small></div>
    </div>
    <div className="shop-scroll-region">
    {prompt.body && <p className="shop-intro">{prompt.body}</p>}
    <div className="shop-layout">
      <section className="shop-goods" aria-label="商店商品">
        <div className="shop-section-head"><h3>商店商品</h3><small>可多次购买</small></div>
        <div className="shop-item-list">{goods.map((choice: Choice) => {
          const itemId = choice.id.slice(4);
          const item = Object.hasOwn(ITEMS, itemId) ? ITEMS[itemId] : null;
          if (!item) return null;
          const held = player.inventory.filter(slot => slot.itemId === itemId).reduce((sum, slot) => sum + slot.quantity, 0);
          const stacks = item.stackable && held > 0;
          const nextUsed = used + (stacks ? 0 : 1);
          const shortfall = Math.max(0, item.price - player.cash);
          const noRoom = nextUsed > player.capacity;
          const reason = shortfall ? `余额不足 · 还差 ${money(shortfall)}` : noRoom ? '背包已满，无法新增道具格' : choice.disabled ? '暂不可购买' : disabled ? '当前无法购买' : '';
          return <article className="shop-item" key={choice.id}>
            <div className="shop-item-main"><span className="shop-item-icon"><ItemCategoryIcon category={item.category} /></span><div className="shop-item-copy"><strong>{item.name}</strong><small>{choice.description || item.description}</small><small className="shop-item-held">已持有 {held} 件{stacks ? ' · 可叠加到现有道具' : ''}</small></div></div>
            <div className="shop-item-purchase"><strong className="shop-item-price">{money(item.price)}</strong><div className="shop-item-preview"><small>{shortfall ? `购买需 ${money(item.price)}` : `购买后现金 ${money(player.cash - item.price)}`}</small><small>{stacks ? `叠加现有道具 · 仍剩 ${remaining} 格` : noRoom ? '购买需要 1 个空位' : `购买后剩 ${player.capacity - nextUsed} 格`}</small></div><button className="shop-buy-button" type="button" aria-label={`购买${item.name}`} disabled={disabled || choice.disabled || !!reason} title={reason || undefined} onClick={() => onChoose(choice.id)}>购买</button>{reason && <small className="shop-item-reason">{reason}</small>}</div>
          </article>;
        })}</div>
      </section>
      <details className="shop-inventory" open={inventoryOpen} onToggle={event => setInventoryOpen(event.currentTarget.open)}>
        <summary className="shop-inventory-summary"><strong>我的背包</strong><span>{used}/{player.capacity} 格 · 剩余 {remaining} 格</span></summary>
        <div className="shop-inventory-list">{owned.size ? [...owned].map(([key, slot]) => {
          const itemId = key.slice(0, key.lastIndexOf(':'));
          const item = Object.hasOwn(ITEMS, itemId) ? ITEMS[itemId] : null;
          return <div className="shop-inventory-item" key={key}><span className="shop-inventory-icon">{item ? <ItemCategoryIcon category={item.category} /> : <Package size={22} aria-hidden="true" />}</span><div><strong>{item?.name || itemId}</strong><small>数量 {slot.quantity}{slot.wet ? ' · 已受潮' : ''}</small></div></div>;
        }) : <p className="shop-inventory-empty">背包还是空的，剩余 {remaining} 格可以装入道具。</p>}</div>
        <p className="shop-inventory-note">购物期间只能查看背包；道具可在行动前使用。</p>
      </details>
    </div>
    </div>
    <div className="shop-actions"><button type="button" className="secondary-button" disabled={disabled || leave?.disabled} onClick={() => onChoose('leave')}>离开商店</button></div>
  </div>;
}
