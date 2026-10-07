export function propertyLevelName(level: number, maxLevel: 4 | 5 = 4): string {
  return level >= maxLevel ? `地标 · ${maxLevel}层` : level === 0 ? '0层 · 未建房' : `${level}层建筑`;
}

// The floor count occupies the parcel face; the small address lives in its header.
export function PropertyLevelGlyph({ level, maxLevel = 4 }: { level: number; maxLevel?: 4 | 5 }) {
  return <g className={`property-level-glyph level-${level}`} data-floor-level={level} aria-hidden="true">
    {level >= maxLevel ? <>
      <path className="level-landmark-star" d="M0-12 4.5-3 14.5-1.5 7.3 5.5 9 15.5 0 10.7-9 15.5-7.3 5.5-14.5-1.5-4.5-3Z"/>
      <text className="level-landmark-number" x="0" y="7.3" textAnchor="middle">{maxLevel}</text>
    </> : <>
      {level > 0 && <g className="level-storeys">{Array.from({length:level},(_,index)=><rect key={index} x="-17" y={9-index*6.5} width="7" height="5.5" rx=".9"/>)}</g>}
      <text className="level-count" x={level ? 5 : 0} y="14" textAnchor="middle">{level}</text>
      {level === 0 && <path className="level-empty-foundation" d="M-16 14V18H16V14"/>}
    </>}
  </g>;
}

export function PropertyLevelIcon({ level, size = 28, maxLevel = 4 }: { level: number; size?: number; maxLevel?: 4 | 5 }) {
  return <svg className="property-level-icon" width={size} height={size} viewBox="-23 -20 46 43" aria-hidden="true"><rect className="level-icon-background" x="-22" y="-19" width="44" height="41" rx="6"/><PropertyLevelGlyph level={level} maxLevel={maxLevel}/></svg>;
}
