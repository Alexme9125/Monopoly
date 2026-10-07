import type { MapData } from '../game/types';
import { hasLot, lotBounds, type Lot, type Rect } from './sceneLayout';

export type BeaconHitShape = { path: string; cutouts: Rect[] };

function subtractRect(source: Rect, blocker: Rect): Rect[] {
  const left = Math.max(source.left, blocker.left), right = Math.min(source.right, blocker.right);
  const top = Math.max(source.top, blocker.top), bottom = Math.min(source.bottom, blocker.bottom);
  if (left >= right || top >= bottom) return [source];
  return [
    { left: source.left, right: source.right, top: source.top, bottom: top },
    { left: source.left, right: source.right, top: bottom, bottom: source.bottom },
    { left: source.left, right: left, top, bottom },
    { left: right, right: source.right, top, bottom },
  ].filter(rect => rect.left < rect.right && rect.top < rect.bottom);
}

/** Build a touch-sized beacon target with holes over nearby parcel faces. */
export function beaconHitShape(map: MapData, lots: Record<number, Lot>, origin: { x: number; y: number }, radius: number): BeaconHitShape {
  const centerY = origin.y - 19;
  const margin = 3;
  const nearby = map.nodes.filter(hasLot).map(node => {
    const bounds = lots[node.id]?.bounds ?? lotBounds(node.x, node.y);
    return { left: bounds.left - margin, right: bounds.right + margin, top: bounds.top - margin, bottom: bounds.bottom + margin };
  }).filter(rect => {
    const dx = Math.max(rect.left - origin.x, 0, origin.x - rect.right);
    const dy = Math.max(rect.top - centerY, 0, centerY - rect.bottom);
    return dx * dx + dy * dy <= radius * radius;
  });
  // Even-odd holes must not overlap, or an overlap becomes clickable again.
  const cutouts: Rect[] = [];
  for (const rect of nearby) {
    let uncovered = [rect];
    for (const existing of cutouts) uncovered = uncovered.flatMap(piece => subtractRect(piece, existing));
    cutouts.push(...uncovered);
  }
  const circle = `M0 ${-19 - radius} A${radius} ${radius} 0 1 1 0 ${-19 + radius} A${radius} ${radius} 0 1 1 0 ${-19 - radius}Z`;
  const holes = cutouts.map(rect => {
    const left = rect.left - origin.x, right = rect.right - origin.x;
    const top = rect.top - origin.y, bottom = rect.bottom - origin.y;
    return `M${left} ${top}H${right}V${bottom}H${left}Z`;
  });
  return { path: [circle, ...holes].join(' '), cutouts };
}
