import type { Movement, MovementSegment } from './types';

export interface MovementStage {
  kind: 'roll' | 'result' | 'adjust' | 'adjusted' | 'move' | 'weather' | 'effect';
  start: number;
  end: number;
  path?: number[];
  label?: string;
  segmentKind?: MovementSegment['kind'];
  stepIndex?: number;
  stepCount?: number;
  travelDuration?: number;
}

export interface MovementTimeline { stages: MovementStage[]; duration: number; }

/** Shared browser/server timing contract for one authoritative movement. */
export function getMovementTimeline(movement: Movement): MovementTimeline {
  const stages: MovementStage[] = [];
  let cursor = 0;
  const add = (kind: MovementStage['kind'], length: number, details: Partial<Omit<MovementStage, 'kind' | 'start' | 'end'>> = {}) => {
    stages.push({ kind, start: cursor, end: cursor + length, ...details });
    cursor += length;
  };
  if (movement.dice !== false) {
    const adjusted = Math.max(0, movement.roll + movement.modifier);
    add('roll', 650);
    add('result', 900, { label: `${movement.roll}` });
    if (movement.modifier !== 0) {
      add('adjust', 700, { label: `${movement.roll} ${movement.modifier > 0 ? '+' : '−'} ${Math.abs(movement.modifier)} = ${adjusted}` });
      add('adjusted', 650, { label: `${adjusted}` });
    }
  }
  const segments: MovementSegment[] = movement.segments?.length
    ? movement.segments
    : [{ kind: movement.dice === false ? 'transfer' : 'normal', path: movement.path }];
  for (const segment of segments) {
    if (segment.kind === 'transfer') {
      add('move', 420, { path: [...segment.path], label: segment.label, segmentKind: 'transfer', travelDuration: 420 });
      continue;
    }
    const stepCount = Math.max(0, segment.path.length - 1);
    if (segment.kind === 'weather') add('weather', 900, { label: segment.label, segmentKind: 'weather', stepCount,
      ...(segment.path.length ? { path: [segment.path[0]] } : {}) });
    const perStep = segment.kind === 'weather' ? 460 : stepCount > 20 ? 240 : 400;
    const travelDuration = segment.kind === 'weather' ? 300 : stepCount > 20 ? 160 : 260;
    for (let index = 0; index < stepCount; index++) {
      add('move', perStep, { path: segment.path.slice(index, index + 2), label: segment.label,
        segmentKind: segment.kind, stepIndex: index + 1, stepCount, travelDuration });
    }
  }
  add('effect', 900, { label: movement.effects?.map(effect => effect.label).join(' · ') });
  return { stages, duration: cursor };
}
