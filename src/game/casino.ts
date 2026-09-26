/** The slot machine uses one fixed 10,000-ticket draw, independent of inventory contents. */
export const SLOTS_STAKE = 300;
export const SLOT_POOL_TOTAL = 10_000;

export const SLOT_PRIZE_POOL = [
  { itemId: 'snack', weight: 3000 },
  { itemId: 'tea', weight: 2000 },
  { itemId: 'coffee', weight: 1500 },
  { itemId: 'feast', weight: 1000 },
  { itemId: 'dice8', weight: 1000 },
  { itemId: 'dice12', weight: 400 },
  { itemId: 'restkit', weight: 350 },
  { itemId: 'dry', weight: 250 },
  { itemId: 'arrest', weight: 200 },
  { itemId: 'rent', weight: 200 },
  { itemId: 'dice20', weight: 20 },
  { itemId: 'controller', weight: 15 },
  { itemId: 'shield', weight: 15 },
  { itemId: 'umbrella', weight: 10 },
  { itemId: 'bag', weight: 10 },
  { itemId: 'weather', weight: 10 },
  { itemId: 'bomb', weight: 5 },
  { itemId: 'demolish', weight: 5 },
  { itemId: 'acquire', weight: 2 },
  { itemId: 'luck', weight: 3 },
  { itemId: 'unluck', weight: 2 },
  { itemId: 'teleport', weight: 2 },
  { itemId: 'repair', weight: 1 },
] as const;

export function drawSlotItem(ticket: number): string {
  if (!Number.isSafeInteger(ticket) || ticket < 0 || ticket >= SLOT_POOL_TOTAL) throw new RangeError('Invalid slot ticket');
  let remaining = ticket;
  for (const prize of SLOT_PRIZE_POOL) {
    remaining -= prize.weight;
    if (remaining < 0) return prize.itemId;
  }
  throw new Error('Slot prize pool does not cover every ticket');
}
