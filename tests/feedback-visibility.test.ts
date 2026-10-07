import { describe, expect, it } from 'vitest';
import { isCoveredEventFeedback } from '../src/visual/feedbackVisibility';
import type { GameFeedback, GameNotice } from '../src/game/types';

const eventNotice: GameNotice = { id: 12, day: 2, kind: 'event', title: '湖畔来信', body: '选项已结算', tone: 'info', playerId: 'p1', nodeId: 4 };
const eventFeedback: GameFeedback = { id: 11, playerId: 'p1', nodeId: 4,
  effects: [{ kind: 'event', label: '湖畔来信 · 读信', tone: 'good' }, { kind: 'cash', label: '现金 +100 PM', tone: 'good' }] };

describe('event result feedback ownership', () => {
  it('suppresses only the event choice result already represented by its notice', () => {
    expect(isCoveredEventFeedback(eventFeedback, [eventNotice])).toBe(true);
    expect(isCoveredEventFeedback(eventFeedback, [{ ...eventNotice, title: '另一段故事' }])).toBe(false);
    expect(isCoveredEventFeedback(eventFeedback, [{ ...eventNotice, playerId: 'p2' }])).toBe(false);
  });

  it('keeps independent coin and rent feedback from the same player and node', () => {
    const coin: GameFeedback = { id: 13, playerId: 'p1', nodeId: 4,
      effects: [{ kind: 'cash', label: '拾得 +160 PM', tone: 'good' }] };
    const rent: GameFeedback = { id: 14, playerId: 'p1', nodeId: 4,
      effects: [{ kind: 'cash', label: '支付租金 −500 PM', tone: 'bad' }] };
    expect(isCoveredEventFeedback(coin, [eventNotice])).toBe(false);
    expect(isCoveredEventFeedback(rent, [eventNotice])).toBe(false);
    expect(isCoveredEventFeedback({ ...eventFeedback, id: 15 }, [eventNotice])).toBe(false);
  });
});
