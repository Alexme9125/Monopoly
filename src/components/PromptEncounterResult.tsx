import type { TurnEncounter } from '../game/types';

/** The resolved encounter remains reviewable while the next decision uses the same modal. */
export default function PromptEncounterResult({ encounter }: { encounter: TurnEncounter }) {
  const selected = encounter.choices.find(choice => choice.id === encounter.selectedChoiceId);
  if (!selected || !encounter.result) return null;
  return <details className="recent-encounter" aria-label="刚才的不期而遇" data-encounter-id={encounter.id}>
    <summary><span>刚才的不期而遇 · {encounter.title}</span><small>已选择 · {selected.label}</small></summary>
    <p className="recent-encounter-result">{encounter.result}</p>
  </details>;
}
