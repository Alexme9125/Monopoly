import { useEffect, useId, useState } from 'react';
import { Layers, X } from 'lucide-react';
import { PropertyLevelIcon } from '../visual/PropertyLevel';

const LEVEL_LABELS = ['未建房', '1层', '2层', '3层', '地标'];

export default function FloorKey({ hidden = false }: { hidden?: boolean }) {
  const [open, setOpen] = useState(false);
  const cardId = useId();
  useEffect(() => { if (hidden) setOpen(false); }, [hidden]);
  useEffect(() => {
    if (!open || hidden) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      setOpen(false);
    };
    document.addEventListener('keydown', onEscape);
    return () => document.removeEventListener('keydown', onEscape);
  }, [open, hidden]);

  if (hidden) return null;
  return <div className="floor-key">
    <button type="button" className="floor-key-toggle" aria-label="楼层图例" title="楼层图例" aria-expanded={open} aria-controls={cardId} onClick={() => setOpen(value => !value)}><Layers size={18} /></button>
    {open && <div className="floor-key-card" id={cardId} role="region" aria-label="楼层说明">
      <div className="floor-key-head"><strong>楼层图例</strong><button type="button" aria-label="关闭楼层图例" onClick={() => setOpen(false)}><X size={16} /></button></div>
      <div className="floor-key-grid">{LEVEL_LABELS.map((label, level) => <div className="floor-key-item" key={level}><span className="icon"><PropertyLevelIcon level={level} size={28} /></span><span>{label}</span></div>)}</div>
      <p className="floor-key-note">大数字是楼层，星形 4 是地标。顶部 #nn 是地块编号，P1–P4 是玩家席位，色条表示产权。</p>
    </div>}
  </div>;
}
