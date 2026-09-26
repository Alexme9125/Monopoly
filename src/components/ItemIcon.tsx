import { Dices, Package, Settings2, Ticket, Utensils, Zap } from 'lucide-react';
import { ITEMS } from '../game/data';

/** Small, legible equipment marks shared by the bag and shop. */
export default function ItemIcon({ itemId, size = 28 }: { itemId: string; size?: number }) {
  if (itemId === 'teleportStone') return <svg className="equipment-icon equipment-stone" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <ellipse cx="16" cy="25" rx="12" ry="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 3" />
    <path d="m16 3 9 9-4 10H11L7 12Z" fill="currentColor" fillOpacity=".12" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="m16 3-4 9 4 10 4-10-4-9ZM7 12h18" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M27 3v5m-2.5-2.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
  if (itemId === 'twinDish') return <svg className="equipment-icon equipment-twin" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <path d="M3 14v5c0 5 26 5 26 0v-5" fill="currentColor" fillOpacity=".09" stroke="currentColor" strokeWidth="1.6" />
    <ellipse cx="16" cy="13" rx="13" ry="8" stroke="currentColor" strokeWidth="1.6" />
    <path d="m10 9 3 4-3 4-3-4 3-4Zm12 0 3 4-3 4-3-4 3-4Z" fill="currentColor" fillOpacity=".2" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <path d="M15 13h2M6 25c5 3 15 3 20 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
  const category = ITEMS[itemId]?.category ?? 'special';
  const Icon = itemId === 'controller' ? Settings2 : { dice: Dices, attack: Zap, supply: Utensils, card: Ticket, special: Package }[category];
  return <Icon size={size} aria-hidden="true" />;
}
