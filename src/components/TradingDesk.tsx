import { useState } from 'react';
import { getCurrentPlayer, getStockPosition, quoteStockSale, quoteStockTrade } from '../game/engine';
import type { GameAction, GameState } from '../game/types';

const money = (value: number) => `PM$ ${Math.round(value).toLocaleString('zh-CN')}`;
const unitMoney = (value: number) => `PM$ ${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const profitMoney = (value: number) => `PM$ ${Math.abs(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const profitTone = (profit: number | null) => profit === null ? 'is-unknown' : Math.round(profit * 100) < 0 ? 'is-loss' : 'is-gain';

function profitText(profit: number | null, rate: number | null) {
  if (profit === null) return '暂无法计算';
  const displayedProfit = Math.round(profit * 100) / 100;
  const direction = displayedProfit > 0 ? '盈利' : displayedProfit < 0 ? '亏损' : '持平';
  const sign = displayedProfit > 0 ? '+' : displayedProfit < 0 ? '−' : '';
  const percentage = rate === null ? '盈亏率 —' : displayedProfit === 0 ? '0.00%' : `${sign}${(Math.abs(rate) * 100).toFixed(2)}%`;
  return `${direction} ${sign}${profitMoney(displayedProfit)}（${percentage}）`;
}

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
  const positions = state.stocks.map(stock => ({ stock, position: getStockPosition(player, stock) })).filter(({ position }) => position.quantity > 0);

  return <div className="trading-desk">
    <div className="exchange-wallet"><small>当前可用现金</small><strong>{money(player.cash)}</strong></div>
    <p className="stock-cost-note">成本含买入手续费；预计盈亏已扣除卖出手续费。</p>
    <section className="stock-holdings" aria-labelledby="stock-holdings-title">
      <h3 id="stock-holdings-title">我的持仓</h3>
      {positions.length === 0 ? <p className="stock-holdings-empty">暂无持仓</p> : <div className="stock-position-list">{positions.map(({ stock, position }) => <div className="stock-position" key={stock.id}>
        <div className="stock-position-heading"><strong>{stock.name}</strong><span>{stock.code} · 持有 {position.quantity.toLocaleString('zh-CN')} 股</span></div>
        <div className="stock-position-metrics">
          <div><span>成本均价</span><strong>{position.averageCost === null ? '成本未记录' : unitMoney(position.averageCost)}</strong></div>
          <div><span>当前单价</span><strong>{money(stock.price)}</strong></div>
          <div><span>市值</span><strong>{money(position.marketValue)}</strong></div>
          <div><span>全部卖出净得</span><strong>{money(position.liquidation.total)}</strong></div>
        </div>
        <div className={`stock-position-profit ${profitTone(position.profit)}`}><span>全部卖出预计盈亏</span><strong>{profitText(position.profit, position.profitRate)}</strong></div>
      </div>)}</div>}
    </section>
    <div className="stock-list">{state.stocks.map(stock => {
      const raw = quantities[stock.id] ?? '1';
      const quantity = Number(raw);
      const valid = raw.trim() !== '' && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 1_000_000;
      const buy = valid ? safeQuote(stock.price, quantity) : null;
      const sell = valid ? quoteStockSale(player, stock, quantity) : null;
      const held = player.holdings[stock.id] || 0;
      const buyShortfall = buy ? Math.max(0, buy.total - player.cash) : 0;
      const sellShortfall = valid ? Math.max(0, quantity - held) : 0;
      const canBuy = !!buy && buyShortfall === 0;
      const canSell = !!sell;
      const quantityId = `stock-quantity-${stock.id}`;
      const fillQuantity = Math.min(held, 1_000_000);
      return <div className="panel-row stock-row" key={stock.id}>
        <div className="stock-identity"><small>{stock.code} · {stock.sector}</small><strong>{stock.name}</strong></div>
        <Sparkline values={stock.history} />
        <div className="stock-price"><strong>{money(stock.price)}</strong><small className={stock.change >= 0 ? 'positive' : 'negative'}>{stock.change >= 0 ? '+' : ''}{stock.change.toFixed(1)}% · 持有 {held}</small></div>
        <div className="stock-input-row">
          <label htmlFor={quantityId}>交易数量<input id={quantityId} type="number" min="1" max="1000000" step="1" aria-label={`${stock.name}交易数量`} value={raw} onChange={event => setQuantities(values => ({ ...values, [stock.id]: event.target.value }))} /></label>
          <button type="button" disabled={held < 1} onClick={() => setQuantities(values => ({ ...values, [stock.id]: String(fillQuantity) }))}>{held > 1_000_000 ? '填入单次上限' : '填入全部持仓'}</button>
        </div>
        <div className="stock-quote" aria-live="polite">
          <span>所选 {valid ? `${quantity} 股` : '— 股'} · 成交额 {buy ? money(buy.gross) : '—'}</span>
          <span>手续费 {buy ? money(buy.fee) : '—'}</span>
          <div className="stock-quote-side quote-buy"><strong>买入合计 {buy ? money(buy.total) : '—'}</strong><small>{!buy ? '数量无效 · 请输入 1 至 1,000,000 的整数股数' : buyShortfall ? `资金不足 · 还差 ${money(buyShortfall)}` : `买入后现金 ${money(player.cash - buy.total)}`}</small></div>
          <div className="stock-quote-side quote-sell"><strong>卖出净得 {sell ? money(sell.total) : '—'}</strong><small>{!valid ? '数量无效 · 请输入 1 至 1,000,000 的整数股数' : sellShortfall ? `持仓不足 · 还差 ${sellShortfall} 股` : sell ? `卖出后现金 ${money(player.cash + sell.total)}` : '无法卖出'}</small>{sell && <small className={`stock-sale-profit ${profitTone(sell.profit)}`}>本次卖出预计盈亏：{profitText(sell.profit, sell.profitRate)}</small>}</div>
        </div>
        <div className="stock-actions"><button disabled={!canBuy} title={!buy ? '请输入合法数量' : buyShortfall ? `资金不足，还差 ${money(buyShortfall)}` : undefined} onClick={() => onAction({ type: 'stockTrade', stockId: stock.id, quantity })}>买入</button><button disabled={!canSell} title={!valid ? '请输入合法数量' : sellShortfall ? `持仓不足，还差 ${sellShortfall} 股` : undefined} onClick={() => onAction({ type: 'stockTrade', stockId: stock.id, quantity: -quantity })}>卖出</button></div>
      </div>;
    })}</div>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>离开交易所</button></div>
  </div>;
}
