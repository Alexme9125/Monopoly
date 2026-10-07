import type { Rect } from './sceneLayout';

export type BeaconNamePlacement = { side: 'above' | 'below' | 'right' | 'left'; x: number; y: number; bounds: Rect };

/** Keep the active player's name off parcel faces while retaining its original size. */
export function placeBeaconName(origin: { x: number; y: number }, halfWidth: number, parcels: readonly Rect[], frame: Rect): BeaconNamePlacement {
  const choices = [
    { side: 'above', x: 0, y: -47 },
    { side: 'below', x: 0, y: 35 },
    { side: 'right', x: halfWidth + 24, y: -19 },
    { side: 'left', x: -halfWidth - 24, y: -19 },
  ] as const;
  const placements = choices.map(choice => ({ ...choice, bounds: {
    left: origin.x + choice.x - halfWidth,
    right: origin.x + choice.x + halfWidth,
    top: origin.y + choice.y - 12,
    bottom: origin.y + choice.y + 8,
  } }));
  const intersect = (a: Rect, b: Rect) => Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
    * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const safe = placements.find(({ bounds }) => bounds.left >= frame.left && bounds.right <= frame.right
    && bounds.top >= frame.top && bounds.bottom <= frame.bottom
    && parcels.every(parcel => intersect(bounds, {
      left: parcel.left - 2, right: parcel.right + 2, top: parcel.top - 2, bottom: parcel.bottom + 2,
    }) === 0));
  if (safe) return safe;
  // Dense junctions may leave no fully clear side; minimize covered parcel area.
  return placements.reduce((best, candidate) => {
    const score = (placement: BeaconNamePlacement) => parcels.reduce((sum, parcel) => sum + intersect(placement.bounds, parcel), 0)
      + Math.max(0, frame.left - placement.bounds.left) * 20 + Math.max(0, placement.bounds.right - frame.right) * 20
      + Math.max(0, frame.top - placement.bounds.top) * 20 + Math.max(0, placement.bounds.bottom - frame.bottom) * 20;
    return score(candidate) < score(best) ? candidate : best;
  });
}
