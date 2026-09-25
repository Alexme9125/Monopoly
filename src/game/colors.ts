/** The four distinguishable player colors used by local games and room seats. */
export const PLAYER_COLORS = [
  { id: 'coral', name: '珊瑚红', color: '#D55B48' },
  { id: 'lake', name: '湖蓝', color: '#277DA8' },
  { id: 'iris', name: '鸢尾紫', color: '#8062C5' },
  { id: 'amber', name: '琥珀金', color: '#B98B14' },
] as const;

const canonical = (color: string): string | undefined => PLAYER_COLORS.find(entry => entry.color.toLowerCase() === color.toLowerCase())?.color;

export function assignPlayerColor(requested: string, occupied: readonly string[] = []): string {
  const used = new Set(occupied.map(value => value.toLowerCase()));
  const preferred = canonical(requested);
  if (preferred && !used.has(preferred.toLowerCase())) return preferred;
  return PLAYER_COLORS.find(entry => !used.has(entry.color.toLowerCase()))?.color ?? PLAYER_COLORS[0].color;
}

/** Keep the first claimant for each requested palette color, then fill open seats. */
export function normalizePlayerColors<T extends { color: string }>(players: readonly T[]): T[] {
  const claims = players.map(player => canonical(player.color));
  const used = new Set<string>();
  const result = players.map((player, index) => {
    const choice = claims[index];
    if (choice && !used.has(choice.toLowerCase())) {
      used.add(choice.toLowerCase());
      return { ...player, color: choice };
    }
    return { ...player, color: '' };
  });
  return result.map(player => {
    if (player.color) return player;
    const color = assignPlayerColor('', [...used]);
    used.add(color.toLowerCase());
    return { ...player, color };
  });
}
