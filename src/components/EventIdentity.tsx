import { MapPin, Sparkles } from 'lucide-react';
import { findEligibleEvent } from '../game/eventPool';
import { MAPS } from '../game/maps';
import type { EventRarity, MapId } from '../game/types';

const RARITY_LABELS: Record<EventRarity, string> = {
  common: '普通',
  uncommon: '进阶',
  rare: '稀有',
};

export default function EventIdentity({ mapId, eventId }: { mapId: MapId; eventId: string }) {
  const event = findEligibleEvent(mapId, eventId);
  if (!event?.dlc || !event.mapId || !event.rarity) return null;

  return <div className="event-identity" aria-label={`${MAPS[event.mapId].name}地区 DLC，${RARITY_LABELS[event.rarity]}事件`}>
    <span className="event-identity-origin"><MapPin size={12} aria-hidden="true" />{MAPS[event.mapId].name} · 地区 DLC</span>
    <span className={`event-identity-rarity event-identity-rarity-${event.rarity}`}><Sparkles size={12} aria-hidden="true" />{RARITY_LABELS[event.rarity]}</span>
  </div>;
}
