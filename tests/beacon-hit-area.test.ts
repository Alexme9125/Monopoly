import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/game/maps';
import { beaconHitShape } from '../src/visual/beaconHitArea';
import { getLotLayout } from '../src/visual/sceneLayout';

describe('beacon direction touch target', () => {
  it('cuts the Grand City #10 parcel out of a 44px mobile hit circle while retaining the beacon itself', () => {
    const map = MAPS.grandCity;
    const node = map.nodes[10];
    const lot = getLotLayout(map)[node.id];
    // This is the world-space radius observed at 320px before the parcel click was intercepted.
    const radius = 90.81;
    const shape = beaconHitShape(map, getLotLayout(map), { x: node.x, y: node.y }, radius);
    const excludes = (x: number, y: number) => shape.cutouts.some(rect => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
    expect(Math.hypot(lot.x - node.x, lot.y - (node.y - 19))).toBeLessThan(radius);
    expect(excludes(lot.x, lot.y)).toBe(true);
    expect(excludes(node.x, node.y - 19)).toBe(false);
    const outsideCorner = { x: lot.bounds.right + 3, y: lot.bounds.bottom + 3 };
    expect(excludes(outsideCorner.x, outsideCorner.y)).toBe(true);
    expect(Math.hypot(outsideCorner.x - node.x, outsideCorner.y - (node.y - 19))).toBeGreaterThan(radius);
    expect(shape.path).toContain('M0');
    expect(shape.path).toContain(`M${lot.bounds.left - 3 - node.x} ${lot.bounds.top - 3 - node.y}`);
  });

  it('keeps neighboring parcel holes disjoint so even-odd fill cannot restore a clickable strip', () => {
    const map = MAPS.lake;
    const shape = beaconHitShape(map, getLotLayout(map), { x: 1240, y: 350 }, 100);
    for (let i = 0; i < shape.cutouts.length; i++) for (let j = i + 1; j < shape.cutouts.length; j++) {
      const a = shape.cutouts[i], b = shape.cutouts[j];
      const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      expect(overlapWidth <= 0 || overlapHeight <= 0).toBe(true);
    }
  });
});
