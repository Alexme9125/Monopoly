import { useEffect, useId, useState } from 'react';
import { Layers, X } from 'lucide-react';
import { PropertyLevelIcon } from '../visual/PropertyLevel';

export default function FloorKey({ hidden = false, maxLevel = 4, onOpenChange }: { hidden?: boolean; maxLevel?: 4 | 5; onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const cardId = useId();
  useEffect(() => { onOpenChange?.(open && !hidden); }, [open, hidden, onOpenChange]);
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
      <div className="floor-key-grid">{Array.from({ length: maxLevel + 1 }, (_, level) => <div className="floor-key-item" key={level}><span className="icon"><PropertyLevelIcon level={level} maxLevel={maxLevel} size={28} /></span><span>{level === 0 ? '未建房' : level === maxLevel ? '地标' : `${level}层`}</span></div>)}</div>
      <p className="floor-key-note">大数字是楼层，星形 {maxLevel} 是受保护地标。{maxLevel === 5 && '4层仍是普通建筑，可继续升级。'}顶部 #nn 是地块编号，P1–P4 是玩家席位，色条表示产权；未售预制楼以中性色显示已有楼层，认购前不收租。</p>
    </div>}
  </div>;
}
