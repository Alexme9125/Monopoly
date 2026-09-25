import { useState } from 'react';
import { getCurrentPlayer, quoteStockTrade } from '../game/engine';
import type { GameAction, GameState } from '../game/types';

const money = (value: number) => `PM$ ${Math.round(value).toLocaleString('zh-CN')}`;

function Sparkline({ values }: { values: number[] }) {
  const last = values.slice(-15);
  if (!last.length) return null;
  const min = Math.min(...last), max = Math.max(...last);
  const span = max - min || 1;
  const points = last.map((value, index) => `${(index / Math.max(last.length - 1, 1)) * 120},${38 - ((value - min) / span) * 32}`).join(' ');
  return <svg className="sparkline" viewBox="0 0 120 42" aria-label="近期股价走势"><polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export default function TradingDesk({ state, onAction, onClose }: { state: GameState; onAction: (action: GameAction) => void; onClose: () => void }) {
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const player = getCurrentPlayer(state);
  const safeQuote = (price: number, quantity: number) => { try { return quoteStockTrade(price, quantity); } catch { return null; } };

  return <div className="trading-desk">
    <div className="exchange-wallet"><small>当前可用现金</small><strong>{money(player.cash)}</strong></div>
    <p>手续费为成交额的 0.3%，向上取整至 1 PM$。</p>
    <div className="stock-list">{state.stocks.map(stock => {
      const raw = quantities[stock.id] ?? '1';
      const quantity = Number(raw);
      const valid = raw.trim() !== '' && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 1_000_000;
      const buy = valid ? safeQuote(stock.price, quantity) : null;
      const sell = valid ? safeQuote(stock.price, -quantity) : null;
      const held = player.holdings[stock.id] || 0;
      const buyShortfall = buy ? Math.max(0, buy.total - player.cash) : 0;
      const sellShortfall = valid ? Math.max(0, quantity - held) : 0;
      const canBuy = !!buy && buyShortfall === 0;
      const canSell = !!sell && sellShortfall === 0;
      return <div className="panel-row stock-row" key={stock.id}>
        <div className="stock-identity"><small>{stock.code} · {stock.sector}</small><strong>{stock.name}</strong></div>
        <Sparkline values={stock.history} />
        <div className="stock-price"><strong>{money(stock.price)}</strong><small className={stock.change >= 0 ? 'positive' : 'negative'}>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(1)}% · 持有 {held}</small></div>
        <div className="stock-quote" aria-live="polite">
          <small>所选 {valid ? `${quantity} 股` : '— 股'} · 成交额 {buy ? money(buy.gross) : '—'}</small>
          <small>手续费 {buy ? money(buy.fee) : '—'}</small>
          <div className="stock-quote-side quote-buy"><strong>买入合计 {buy ? money(buy.total) : '—'}</strong><small>{!buy ? '数量无效 · 请输入 1 至 1,000,000 的整数股数' : buyShortfall ? `资金不足 · 还差 ${money(buyShortfall)}` : `买入后现金 ${money(player.cash - buy.total)}`}</small></div>
          <div className="stock-quote-side quote-sell"><strong>卖出净得 {sell ? money(sell.total) : '—'}</strong><small>{!sell ? '数量无效 · 请输入 1 至 1,000,000 的整数股数' : sellShortfall ? `持仓不足 · 还差 ${sellShortfall} 股` : `卖出后现金 ${money(player.cash + sell.total)}`}</small></div>
        </div>
        <div className="stock-actions"><input type="number" min="1" max="1000000" step="1" aria-label={`${stock.name}交易数量`} value={raw} onChange={event => setQuantities(values => ({ ...values, [stock.id]: event.target.value }))} /><button disabled={!canBuy} title={!buy ? '请输入合法数量' : buyShortfall ? `资金不足，还差 ${money(buyShortfall)}` : undefined} onClick={() => onAction({ type: 'stockTrade', stockId: stock.id, quantity })}>买入</button><button disabled={!canSell} title={!sell ? '请输入合法数量' : sellShortfall ? `持仓不足，还差 ${sellShortfall} 股` : undefined} onClick={() => onAction({ type: 'stockTrade', stockId: stock.id, quantity: -quantity })}>卖出</button></div>
      </div>;
    })}</div>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>离开交易所</button></div>
  </div>;
}
