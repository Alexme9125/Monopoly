import { EVENTS } from './data';
import { REGIONAL_EVENTS } from './regionalEvents';
import { ROAMING_EVENTS } from './roamingEvents';
import type { EventDef, MapId } from './types';

const REGIONAL_RARITY_SHARE = { common: 0.7, uncommon: 0.25, rare: 0.05 } as const;
export type EventSource = 'tile' | 'encounter';

/** The legacy universal catalogue stays unchanged and is eligible on every map. */
export function getEventPool(mapId: MapId, source: EventSource = 'tile'): EventDef[] {
  if (source !== 'tile' && source !== 'encounter') return [];
  const regional = REGIONAL_EVENTS.filter(event => event.mapId === mapId);
  if (source === 'tile') return [...EVENTS, ...regional];
  return [...EVENTS, ...regional, ...ROAMING_EVENTS.filter(event => event.mapId === mapId)];
}

export function findEligibleEvent(mapId: MapId, eventId: string, source?: EventSource): EventDef | undefined {
  return getEventPool(mapId, source ?? 'encounter').find(event => event.id === eventId);
}

/** Baseline shares sum to one; luck modifiers apply to tone before the draw is normalized. */
export function getEventWeights(mapId: MapId, luck?: 'luck' | 'unluck', source: EventSource = 'tile'): { event: EventDef; weight: number }[] {
  const pool = getEventPool(mapId, source);
  const regional = pool.filter(event => event.mapId === mapId);
  const countByRarity = { common: 0, uncommon: 0, rare: 0 };
  for (const event of regional) if (event.rarity) countByRarity[event.rarity]++;
  return pool.map(event => {
    const baseline = event.dlc && event.rarity
      ? 0.4 * REGIONAL_RARITY_SHARE[event.rarity] / countByRarity[event.rarity]
      : 0.6 / EVENTS.length;
    const toneModifier = luck === 'luck' ? event.tone === 'good' ? 3 : event.tone === 'bad' ? 0.5 : 1
      : luck === 'unluck' ? event.tone === 'bad' ? 3 : event.tone === 'good' ? 0.5 : 1 : 1;
    return { event, weight: baseline * toneModifier };
  });
}
