import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { MapData, Player } from '../game/types';

interface DirectionProps { map: MapData; player: Player; options: number[]; }

/** Only the first road segment is shown; junction choices remain undecided. */
export function BeaconDirectionRoads({ map, player, options, scale }: DirectionProps & { scale: number }) {
  const origin = map.nodes[player.position];
  if (!origin || !options.length) return null;
  const pixel = 1 / Math.max(.05, scale);
  return <g className={`beacon-direction-roads ${options.length > 1 ? 'is-random' : ''}`}
    data-direction-player={player.id} style={{ '--direction-color': player.color } as CSSProperties} aria-hidden="true">
    {options.map(nodeId => {
      const node = map.nodes[nodeId];
      if (!node) return null;
      const dx = node.x - origin.x, dy = node.y - origin.y, distance = Math.hypot(dx, dy);
      if (!distance) return null;
      const ux = dx / distance, uy = dy / distance;
      const start = Math.min(10 * pixel, distance * .23), end = distance * .85;
      const tip = Math.min(7 * pixel, distance * .27), wing = tip * .6;
      const x = origin.x + ux * end, y = origin.y + uy * end;
      const d = `M${origin.x + ux * start} ${origin.y + uy * start}L${x} ${y}`;
      const arrow = `M${x - ux * tip - uy * wing} ${y - uy * tip + ux * wing}L${x} ${y}L${x - ux * tip + uy * wing} ${y - uy * tip - ux * wing}`;
      return <g key={nodeId} data-direction-node={nodeId}>
        <path className="direction-road-halo" d={d} vectorEffect="non-scaling-stroke"/>
        <path className="direction-road-line" d={d} vectorEffect="non-scaling-stroke"/>
        <path className="direction-arrow-halo" d={arrow} vectorEffect="non-scaling-stroke"/>
        <path className="direction-arrow" d={arrow} vectorEffect="non-scaling-stroke"/>
      </g>;
    })}
  </g>;
}

function DirectionDial({ map, player, options }: DirectionProps) {
  const origin = map.nodes[player.position];
  return <svg className="direction-dial" viewBox="-24 -24 48 48" aria-hidden="true">
    <circle r="22" className="direction-dial-face"/>
    <path d="M0-20v2M20 0h-2M0 20v-2M-20 0h2" className="direction-dial-ticks"/>
    {options.map(nodeId => {
      const node = map.nodes[nodeId];
      if (!origin || !node) return null;
      const angle = Math.atan2(node.y - origin.y, node.x - origin.x) * 180 / Math.PI;
      return <g key={nodeId} transform={`rotate(${angle})`}>
        <path d="M2 0H15" className={`direction-dial-route ${options.length > 1 ? 'is-random' : ''}`}/>
        <path d="m10-4 5 4-5 4" className="direction-dial-route"/>
      </g>;
    })}
    {options.length ? <circle r="3" className="direction-dial-origin"/> : <path d="M-4-5V5M4-5V5" className="direction-dial-route"/>}
  </svg>;
}

interface CardProps extends DirectionProps {
  portalTarget?: HTMLElement | null;
  companions: Player[];
  anchor: { x: number; y: number };
  bounds: { width: number; height: number };
  onSelectPlayer: (id: string) => void;
  onClose: () => void;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
}

export function BeaconDirectionCard({ map, player, options, companions, anchor, bounds, onSelectPlayer, onClose, onPointerEnter, onPointerLeave, portalTarget }: CardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [placement, setPlacement] = useState({ left: 12, top: 12 });
  useLayoutEffect(() => {
    const element = ref.current, board = element?.parentElement?.getBoundingClientRect();
    if (!element || !board) return;
    const width = element.offsetWidth, height = element.offsetHeight;
    // The mobile board can extend beyond the screen; keep the entire card visible.
    const leftEdge = Math.max(10, 10 - board.left);
    const rightEdge = Math.min(bounds.width - 10, window.innerWidth - board.left - 10);
    // A short phone board cannot contain the card and the beacon at once. Allow the
    // card into the activity area above the map, while staying below the weather ribbon.
    const game = element.closest('.game-main')?.getBoundingClientRect();
    const topEdge = Math.max(8 - board.top, (game?.top ?? board.top) - board.top + 8);
    const bottomEdge = window.innerHeight - board.top - 8;
    const above = anchor.y - height - 38;
    setPlacement({
      left: Math.max(leftEdge, Math.min(rightEdge - width, anchor.x - width / 2)),
      top: Math.max(topEdge, Math.min(bottomEdge - height, above >= topEdge ? above : anchor.y + 26)),
    });
  }, [anchor.x, anchor.y, bounds.width, bounds.height, player.id, options.length, companions.length]);
  const held = !!player.confinement && player.confinement.remaining > 0;
  const next = options.length === 1 ? map.nodes[options[0]] : undefined;
  const caption = held ? `暂留 ${player.confinement!.remaining} 天` : options.length > 1 ? `${player.previousPosition == null ? '出发待定' : '路口随机'} · ${options.length} 个方向` : next ? '下次前进方向' : '暂时无法前进';
  const detail = held ? '恢复行动后可查看前进方向' : options.length > 1 ? '虚线为可能路线，出发时决定' : next ? `下一格 · ${String(next.id).padStart(2, '0')} ${next.name}` : '此处没有可通行的道路';
  const card = <div ref={ref} className="beacon-direction-card" role="region" aria-label={`${player.name}的前进方向`}
    data-direction-card={player.id} style={{ ...placement, '--direction-color': player.color } as CSSProperties}
    onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} onClick={e => e.stopPropagation()}
    onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }}>
    <div className="direction-card-heading"><span><i/>{player.name}<small>代理人信标</small></span>
      <button type="button" className="direction-close" onClick={onClose} aria-label="关闭前进方向"><X size={15}/></button>
    </div>
    <div className="direction-card-body" aria-live="polite" aria-atomic="true">
      <DirectionDial map={map} player={player} options={options}/>
      <div><strong>{caption}</strong><p>{detail}</p></div>
    </div>
    {companions.length > 1 && <div className="direction-companions" role="group" aria-label="同一格的代理人">
      {companions.map(companion => <button key={companion.id} type="button" aria-pressed={companion.id === player.id}
        onClick={() => onSelectPlayer(companion.id)} style={{ '--companion-color': companion.color } as CSSProperties}>
        <i/>{companion.name}
      </button>)}
    </div>}
  </div>;
  return portalTarget ? createPortal(card, portalTarget) : card;
}
