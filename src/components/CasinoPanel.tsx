import { useEffect, useRef, useState } from 'react';
import type { CasinoResult } from '../game/types';

const money = (value: number) => `PM$ ${Math.round(value).toLocaleString('zh-CN')}`;
const signedMoney = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${money(Math.abs(value))}`;

export default function CasinoPanel({ cash, result }: { cash: number; result?: CasinoResult | null }) {
  const resultRef = useRef<HTMLDivElement>(null);
  const previousId = useRef(result?.id ?? null);
  const [announce, setAnnounce] = useState(false);

  useEffect(() => {
    const changed = result != null && result.id !== previousId.current;
    previousId.current = result?.id ?? null;
    setAnnounce(changed);
    if (!changed) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    resultRef.current?.scrollIntoView?.({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [result?.id]);

  return <div className="casino-panel">
    <div className="casino-wallet"><small>当前现金</small><strong>{money(cash)}</strong></div>
    {result ? <div ref={resultRef} className={`casino-result casino-outcome-${result.outcome}`} data-result-id={result.id} role={announce ? 'status' : undefined} aria-live={announce ? 'polite' : undefined} aria-atomic={announce ? 'true' : undefined}>
      <div className="casino-result-heading"><small>最近一轮 · {result.game === 'slots' ? '老虎机' : '轮盘'}</small><strong className="casino-result-title">{result.title}</strong></div>
      <p className="casino-result-detail">{result.detail}</p>
      <div className="casino-result-ledger">
        <div><small>下注</small><strong>{money(result.stake)}</strong></div>
        <div><small>现金返还</small><strong>{money(result.payout)}</strong></div>
        <div><small>现金净变化</small><strong>{signedMoney(result.net)}</strong></div>
      </div>
    </div> : <div className="casino-result is-empty"><p>选择一种玩法，结果会保留在这里。</p></div>}
  </div>;
}
