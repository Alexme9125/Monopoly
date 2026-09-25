export interface StationAnchor { id: number; x: number; y: number }
export interface StationMarker extends StationAnchor { anchorX: number; anchorY: number; width: number; height: number }

// Screen-space callouts keep nearby platforms independently tappable at every zoom.
export function layoutStationMarkers(anchors: StationAnchor[], width: number, height: number): StationMarker[] {
  const markers: StationMarker[] = [];
  const w = 106, h = 44, margin = 7;
  const offsets = [[0, -43], [0, 43], [-70, -30], [70, -30], [-70, 30], [70, 30], [0, -98], [0, 98], [-115, -86], [115, -86], [-115, 86], [115, 86]];
  for (const anchor of anchors) {
    const candidates = offsets.map(([dx, dy]) => ({
      x: Math.max(w / 2 + margin, Math.min(width - w / 2 - margin, anchor.x + dx)),
      y: Math.max(h / 2 + margin, Math.min(height - h / 2 - margin, anchor.y + dy)),
    }));
    let best = candidates[0], bestScore = Infinity;
    for (const candidate of candidates) {
      const collisions = markers.reduce((sum, marker) => sum + (Math.abs(marker.x - candidate.x) < w + margin && Math.abs(marker.y - candidate.y) < h + margin ? 1 : 0), 0);
      const score = collisions * 10000 + Math.hypot(candidate.x - anchor.x, candidate.y - anchor.y);
      if (score < bestScore) { best = candidate; bestScore = score; }
    }
    markers.push({ id: anchor.id, ...best, anchorX: anchor.x, anchorY: anchor.y, width: w, height: h });
  }
  return markers;
}
