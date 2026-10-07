import { MapPin, Sparkles } from 'lucide-react';
import { findEligibleEvent } from '../game/eventPool';
import { MAPS } from '../game/maps';
import type { EventRarity, MapId } from '../game/types';

const RARITY_LABELS: Record<EventRarity, string> = {
  common: '普通',
  uncommon: '进阶',
  rare: '稀有',
};

export default function EventIdentity({ mapId, eventId, source = 'tile' }: { mapId: MapId; eventId: string; source?: 'tile' | 'encounter' }) {
  const event = findEligibleEvent(mapId, eventId);
  if (!event) return null;
  const roamingExclusive = event.encounterOnly === true;
  const regional = !!(event.dlc && event.mapId && event.rarity);
  if (!regional && source !== 'encounter' && !roamingExclusive) return null;
  const label = [source === 'encounter' || roamingExclusive ? '流动偶遇' : '', regional ? `${MAPS[event.mapId!].name}地区${RARITY_LABELS[event.rarity!]}事件` : ''].filter(Boolean).join('，');

  return <div className="event-identity" aria-label={label}>
    {(source === 'encounter' || roamingExclusive) && <span className="event-identity-roaming"><Sparkles size={12} aria-hidden="true" />流动偶遇{roamingExclusive ? '专属' : ''}</span>}
    {regional && <><span className="event-identity-origin"><MapPin size={12} aria-hidden="true" />{MAPS[event.mapId!].name} · 地区 DLC</span>
    <span className={`event-identity-rarity event-identity-rarity-${event.rarity}`}><Sparkles size={12} aria-hidden="true" />{RARITY_LABELS[event.rarity!]}</span></>}
  </div>;
}
