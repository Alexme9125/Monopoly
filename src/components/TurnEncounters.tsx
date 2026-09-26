import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import EventIdentity from './EventIdentity';
import type { MapId, Player, TurnEncounter } from '../game/types';

export default function TurnEncounters({ encounters, players, mapId }: { encounters: TurnEncounter[]; players: Player[]; mapId: MapId }) {
  const listRef = useRef<HTMLDivElement>(null);
  const newestId = encounters.at(-1)?.id;
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [newestId]);

  return <div className="encounter-list" ref={listRef}>
    {[...encounters].reverse().map((encounter, index) => {
      const actor = players.find(player => player.id === encounter.playerId)?.name || '当前玩家';
      const selected = encounter.choices.find(choice => choice.id === encounter.selectedChoiceId);
      return <article className={`encounter-card encounter-tone-${encounter.tone}`} data-encounter-id={encounter.id} key={encounter.id}>
        <div className="encounter-header"><small>第 {encounter.day} 天 · {actor}{encounters.length > 1 ? ` · 本回合第 ${encounters.length - index} 次偶遇` : ''}</small><strong>{encounter.title}</strong><EventIdentity mapId={mapId} eventId={encounter.eventId} /></div>
        <div className="encounter-outcome" role="status" aria-live="polite" aria-atomic="true">
          <div className={`encounter-status ${selected ? 'is-resolved' : 'is-pending'}`}>{selected ? `已选择 · ${selected.label}` : '正在选择'}</div>
          {encounter.result && <p className="encounter-result">{encounter.result}</p>}
        </div>
        <p className="encounter-story">{encounter.story}</p>
        <div className="encounter-choices" aria-label={`${encounter.title}的选项`}>{encounter.choices.map(choice => <div className={`encounter-choice ${choice.id === encounter.selectedChoiceId ? 'is-selected' : ''}`} key={choice.id}>
          <span className="encounter-choice-mark" aria-hidden="true">{choice.id === encounter.selectedChoiceId && <Check size={16} />}</span>
          <div><strong>{choice.label}</strong>{choice.description && <small>{choice.description}</small>}</div>
        </div>)}</div>
      </article>;
    })}
  </div>;
}
