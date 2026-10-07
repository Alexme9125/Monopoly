import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { getRent } from '../game/engine';
import { MAPS } from '../game/maps';
import { getMaxLandLevel } from '../game/propertyRules';
import { PropertyLevelIcon, propertyLevelName } from '../visual/PropertyLevel';
import type { GameAction, GameState, Player } from '../game/types';

const money = (value: number) => `PM$ ${Math.round(value).toLocaleString('zh-CN')}`;

export interface AuctionHouseProps {
  state: GameState;
  player: Player;
  canTrade: boolean;
  onAction: (action: GameAction) => void;
  onClose: () => void;
}

export default function AuctionHouse({ state, player, canTrade, onAction, onClose }: AuctionHouseProps) {
  const [tab, setTab] = useState<'market' | 'mine'>('market');
  const [nodeId, setNodeId] = useState<number | null>(null);
  const [priceText, setPriceText] = useState('');
  const [receipt, setReceipt] = useState<{ key: string; title: string; body: string } | null>(null);
  const scrollRegion = useRef<HTMLDivElement>(null);
  const seenNoticeId = useRef(Math.max(0, ...(state.notices ?? []).map(notice => notice.id)));
  const pendingMutation = useRef<{ kind: 'list'; nodeId: number; price: number } | { kind: 'cancel'; listingId: string; nodeId: number; nodeName: string } | null>(null);
  const tabPanelId = useId();
  const map = MAPS[state.config.mapId];
  const listings = state.propertyListings ?? [];
  const myListings = listings.filter(listing => listing.sellerId === player.id);
  const listedIds = new Set(listings.map(listing => listing.nodeId));
  const owned = Object.entries(state.properties).filter(([, property]) => property.ownerId === player.id);
  const available = owned.filter(([id, property]) => !property.mortgaged && !listedIds.has(Number(id)));
  const selectedNodeId = available.some(([id]) => Number(id) === nodeId) ? nodeId : available.length ? Number(available[0][0]) : null;
  const validPrice = /^\d+$/.test(priceText) && Number.isSafeInteger(Number(priceText)) && Number(priceText) >= 1 && Number(priceText) <= 1_000_000_000;

  useEffect(() => {
    const notices = state.notices ?? [];
    const fresh = notices.filter(notice => notice.id > seenNoticeId.current);
    seenNoticeId.current = Math.max(seenNoticeId.current, ...fresh.map(notice => notice.id));
    const trade = fresh.filter(notice => notice.kind === 'trade' && (notice.playerId === player.id || notice.recipientId === player.id)).at(-1);
    if (trade) setReceipt({ key: `trade:${trade.id}`, title: trade.title, body: trade.body });
  }, [state.notices, player.id]);

  useEffect(() => {
    const pending = pendingMutation.current;
    if (!pending) return;
    if (pending.kind === 'list') {
      const listing = listings.find(item => item.nodeId === pending.nodeId && item.sellerId === player.id && item.price === pending.price);
      if (!listing) return;
      setReceipt({ key: `list:${listing.id}`, title: '挂牌成功', body: `${map.nodes[pending.nodeId]?.name || '地产'}已按 ${money(pending.price)} 挂牌。` });
      setPriceText('');
    } else {
      if (listings.some(item => item.id === pending.listingId)) return;
      if (state.properties[pending.nodeId]?.ownerId === player.id) setReceipt({ key: `cancel:${pending.listingId}`, title: '已下架', body: `${pending.nodeName}已撤下，可重新设定价格。` });
    }
    pendingMutation.current = null;
  }, [listings, player.id, map.nodes, state.properties]);

  useEffect(() => {
    if (!receipt) return;
    scrollRegion.current?.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [receipt?.key]);

  const propertyDescription = (id: number) => {
    const node = map.nodes[id];
    const property = state.properties[id];
    if (!node || !property) return null;
    return <>
      <span className="auction-node-tag">#{String(id).padStart(2, '0')}</span>
      <div className="auction-card-main"><strong>{node.name}</strong><small>{node.district || map.name}</small></div>
      <div className="auction-level">{node.kind === 'land' ? <><PropertyLevelIcon level={property.level} maxLevel={getMaxLandLevel(state.config.mapId)} size={26} /><span>{propertyLevelName(property.level, getMaxLandLevel(state.config.mapId))}</span></> : <span>固定设施 · 无楼层</span>}</div>
    </>;
  };

  return <div className="auction-house">
    <div className="auction-status-bar"><div className="auction-wallet"><small>当前可用现金</small><strong>{money(player.cash)}</strong></div><div className="auction-trade-note"><strong>一口价成交 · 即时交割</strong><small>{canTrade ? '挂牌、下架与购买会立即生效。' : '当前可浏览，结算完成后可交易。'}</small></div></div>
    <div className="auction-tabs" role="tablist" aria-label="拍卖行页面">
      <button type="button" role="tab" aria-selected={tab === 'market'} aria-controls={tabPanelId} className={tab === 'market' ? 'active' : ''} onClick={() => setTab('market')}>在售地产 <span>{listings.length}</span></button>
      <button type="button" role="tab" aria-selected={tab === 'mine'} aria-controls={tabPanelId} className={tab === 'mine' ? 'active' : ''} onClick={() => setTab('mine')}>我的挂牌 <span>{myListings.length}</span></button>
    </div>
    <div className="auction-scroll-region" id={tabPanelId} ref={scrollRegion} role="tabpanel" aria-label={tab === 'market' ? '在售地产' : '我的挂牌'}>
      {receipt && <div className="auction-receipt" role="status" aria-live="polite" aria-atomic="true"><strong>{receipt.title}</strong><p>{receipt.body}</p></div>}
      {tab === 'market' ? listings.length ? <div className="auction-list">{listings.map(listing => {
        const seller = state.players.find(candidate => candidate.id === listing.sellerId);
        const own = listing.sellerId === player.id;
        const shortfall = Math.max(0, listing.price - player.cash);
        const reason = own ? '这是你自己的挂牌' : shortfall ? `现金不足，还差 ${money(shortfall)}` : !canTrade ? '当前暂不能成交' : '';
        return <article className="auction-card" key={listing.id} style={{ '--seller-color': seller?.color || '#82998a' } as CSSProperties}>
          <div className="auction-card-top">{propertyDescription(listing.nodeId)}</div>
          <div className="auction-card-meta"><span className="auction-seller"><i aria-hidden="true" />卖家 {seller?.name || '未知玩家'}</span><span className="auction-rent">当前租金 {money(getRent(state, listing.nodeId))}</span></div>
          <div className="auction-card-bottom"><div className="auction-price"><small>挂牌一口价</small><strong>{money(listing.price)}</strong></div><small className="auction-balance">{own ? '可在「我的挂牌」中下架' : shortfall ? `还差 ${money(shortfall)}` : `购买后现金 ${money(player.cash - listing.price)}`}</small><button type="button" className="auction-buy-button" disabled={!!reason} title={reason || undefined} onClick={() => onAction({ type: 'buyListing', listingId: listing.id })}>{own ? '我的挂牌' : `${money(listing.price)} 购买`}</button></div>
          {reason && <small className="auction-reason">{reason}</small>}
        </article>;
      })}</div> : <p className="auction-empty">目前没有在售地产。其他玩家挂牌后，地产会显示在这里。</p> : <>
        <div className="auction-listing-form"><h3>挂牌我的地产</h3>{available.length ? <div className="auction-form-fields"><label><span>选择地产</span><select value={selectedNodeId ?? ''} onChange={event => setNodeId(Number(event.target.value))}>{available.map(([id]) => <option value={id} key={id}>#{String(id).padStart(2, '0')} · {map.nodes[Number(id)]?.name}</option>)}</select></label><label><span>一口价 PM$</span><input type="number" min={1} max={1_000_000_000} step={1} inputMode="numeric" value={priceText} placeholder="输入整数售价" onChange={event => setPriceText(event.target.value)} /></label><button type="button" className="auction-list-button" disabled={!canTrade || selectedNodeId === null || !validPrice} title={!canTrade ? '当前暂不能挂牌' : !validPrice ? '请输入 1 至 1,000,000,000 的整数价格' : undefined} onClick={() => { if (selectedNodeId !== null && validPrice) { pendingMutation.current = { kind: 'list', nodeId: selectedNodeId, price: Number(priceText) }; onAction({ type: 'listProperty', nodeId: selectedNodeId, price: Number(priceText) }); } }}>挂牌出售</button></div> : <p className="auction-empty">{!owned.length ? '你还没有地产。先在地图上购买地块或公共设施。' : owned.every(([, property]) => property.mortgaged) ? '名下地产均已抵押。先在资产面板赎回，才能挂牌。' : '可交易的地产都已挂牌。下架后可重新设定一口价。'}</p>}<p className="auction-form-note">未抵押地产和公共设施均可挂牌；修改价格请先下架，再重新挂牌。</p></div>
        <div className="auction-my-listings"><h3>已挂牌 · {myListings.length}</h3>{myListings.length ? <div className="auction-list">{myListings.map(listing => <article className="auction-card" key={listing.id} style={{ '--seller-color': player.color } as CSSProperties}><div className="auction-card-top">{propertyDescription(listing.nodeId)}</div><div className="auction-card-meta"><span className="auction-seller"><i aria-hidden="true" />我的挂牌</span><span className="auction-rent">当前租金 {money(getRent(state, listing.nodeId))}</span></div><div className="auction-card-bottom"><div className="auction-price"><small>挂牌一口价</small><strong>{money(listing.price)}</strong></div><small className="auction-balance">第 {listing.listedDay} 天挂出</small><button type="button" className="auction-cancel-button" disabled={!canTrade} title={!canTrade ? '当前暂不能下架' : undefined} onClick={() => { pendingMutation.current = { kind: 'cancel', listingId: listing.id, nodeId: listing.nodeId, nodeName: map.nodes[listing.nodeId]?.name || '地产' }; onAction({ type: 'cancelListing', listingId: listing.id }); }}>下架</button></div></article>)}</div> : <p className="auction-empty">尚未挂牌。选一处未抵押地产，设定价格即可上架。</p>}</div>
      </>}
    </div>
    <div className="auction-actions"><button type="button" className="secondary-button" onClick={onClose}>关闭拍卖行</button></div>
  </div>;
}
