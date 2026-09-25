import { describe, expect, it } from 'vitest';
import { visibleTurnEncounters } from '../src/components/ActivityNotifications';
import type { TurnEncounter } from '../src/game/types';

const first: TurnEncounter = {
  id: 'event-1', playerId: 'p1', day: 8, nodeId: 12, eventId: 'harbor',
  title: '港口偶遇', story: '旅行家在港口遇见一位商人。', tone: 'choice',
  choices: [{ id: 'trade', label: '交换礼物' }, { id: 'leave', label: '继续前行' }],
};

describe('turn encounter reveal during movement', () => {
  it('updates an already shown choice while hiding the second landing until movement ends', () => {
    const selected = { ...first, selectedChoiceId: 'trade', result: '交换后获得礼物。' };
    const second = { ...first, id: 'event-2', nodeId: 9, title: '后退落点' };
    expect(visibleTurnEncounters([first], [selected, second], true)).toEqual([selected]);
    expect(visibleTurnEncounters([first], [selected, second], false)).toEqual([selected, second]);
  });

  it('does not reveal a first landing while moving and clears records at turn end', () => {
    expect(visibleTurnEncounters([], [first], true)).toEqual([]);
    expect(visibleTurnEncounters([first], [], true)).toEqual([]);
  });
});
