export interface StationAnchor { id: number; x: number; y: number }
export interface StationMarker extends StationAnchor { anchorX: number; anchorY: number; width: number; height: number }
export interface MarkerReservedRect { left: number; top: number; right: number; bottom: number }

// Screen-space callouts keep nearby platforms independently tappable at every zoom.
export function layoutStationMarkers(anchors: StationAnchor[], width: number, height: number, reservedRects: MarkerReservedRect[] = []): StationMarker[] {
  const markers: StationMarker[] = [];
  const w = 106, h = 44, margin = 7;
  const offsets = [[0, -43], [0, 43], [-70, -30], [70, -30], [-70, 30], [70, 30], [0, -98], [0, 98], [-115, -86], [115, -86], [-115, 86], [115, 86], [0, -155], [0, 155]];
  const hitsReserved = (candidate: { x: number; y: number }) => reservedRects.some(rect =>
    candidate.x + w / 2 + margin > rect.left && candidate.x - w / 2 - margin < rect.right
    && candidate.y + h / 2 + margin > rect.top && candidate.y - h / 2 - margin < rect.bottom);
  const hitsMarker = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.abs(a.x - b.x) < w + margin && Math.abs(a.y - b.y) < h + margin;
  const allCandidates: { x: number; y: number }[][] = [];
  for (const anchor of anchors) {
    const candidates = offsets.map(([dx, dy]) => ({
      x: Math.max(w / 2 + margin, Math.min(width - w / 2 - margin, anchor.x + dx)),
      y: Math.max(h / 2 + margin, Math.min(height - h / 2 - margin, anchor.y + dy)),
    }));
    allCandidates.push(candidates);
    let best = candidates[0], bestScore = Infinity;
    for (const candidate of candidates) {
      const collisions = markers.reduce((sum, marker) => sum + (hitsMarker(marker, candidate) ? 1 : 0), 0)
        + (hitsReserved(candidate) ? 1 : 0);
      const score = collisions * 10000 + Math.hypot(candidate.x - anchor.x, candidate.y - anchor.y);
      if (score < bestScore) { best = candidate; bestScore = score; }
    }
    markers.push({ id: anchor.id, ...best, anchorX: anchor.x, anchorY: anchor.y, width: w, height: h });
  }
  if (markers.some((marker, index) => hitsReserved(marker) || markers.slice(index + 1).some(other => hitsMarker(marker, other)))) {
    const placed: { x: number; y: number }[] = [];
    let bestLayout: { x: number; y: number }[] | null = null;
    let bestDistance = Infinity;
    const fit = (index: number, distance: number): void => {
      if (distance >= bestDistance) return;
      if (index === anchors.length) { bestLayout = [...placed]; bestDistance = distance; return; }
      const choices = allCandidates[index].slice().sort((a, b) =>
        Math.hypot(a.x - anchors[index].x, a.y - anchors[index].y) - Math.hypot(b.x - anchors[index].x, b.y - anchors[index].y));
      for (const candidate of choices) {
        if (hitsReserved(candidate) || placed.some(other => hitsMarker(candidate, other))) continue;
        placed.push(candidate);
        fit(index + 1, distance + Math.hypot(candidate.x - anchors[index].x, candidate.y - anchors[index].y));
        placed.pop();
      }
    };
    fit(0, 0);
    if (bestLayout) return anchors.map((anchor, index) => ({ id: anchor.id, ...bestLayout![index], anchorX: anchor.x, anchorY: anchor.y, width: w, height: h }));
  }
  return markers;
}
