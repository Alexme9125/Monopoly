const money = (value: number) => `PM$ ${Math.round(value).toLocaleString('zh-CN')}`;

export default function StationTravelPanel({ originName, destinationName, cash, fare = 100, disabled = false, onConfirm, onCancel }: {
  originName: string;
  destinationName?: string;
  cash: number;
  fare?: number;
  disabled?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const affordable = cash >= fare;
  return <section className={`station-travel-panel ${destinationName ? 'is-selected' : ''}`} role="region" aria-label="车站乘车">
    <div className="station-travel-route"><small className="station-travel-origin">当前车站 · {originName}</small><strong className="station-travel-destination">{destinationName || '在地图上点选目的车站'}</strong></div>
    <div className="station-travel-pricing"><span><small>票价</small><strong>{money(fare)}</strong></span><span><small>当前现金</small><strong>{money(cash)}</strong></span><span><small>乘车后现金</small><strong>{destinationName && affordable ? money(cash - fare) : '—'}</strong></span></div>
    {!affordable && <p className="station-travel-hint" role="status">余额不足，仍可查看车站或取消乘车。</p>}
    {disabled && <p className="station-travel-hint" role="status">连接中断，重连后可确认或取消乘车。</p>}
    <div className="station-travel-actions"><button type="button" className="action-button" disabled={!destinationName || !affordable || disabled} onClick={onConfirm}>乘车前往</button><button type="button" className="secondary-button" disabled={disabled} onClick={onCancel}>取消乘车 <small>Esc</small></button></div>
  </section>;
}
