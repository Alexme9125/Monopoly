import type { GameFeedback, GameNotice } from '../game/types';

/** Only the choice-result feedback already represented by an event notice is redundant. */
export function isCoveredEventFeedback(feedback: GameFeedback | null | undefined, notices: readonly GameNotice[] | undefined): boolean {
  const first = feedback?.effects[0];
  if (!feedback || first?.kind !== 'event') return false;
  return notices?.some(notice => notice.kind === 'event' && notice.id > feedback.id
    && notice.playerId === feedback.playerId && notice.nodeId === feedback.nodeId
    && first.label.startsWith(`${notice.title} · `)) ?? false;
}
