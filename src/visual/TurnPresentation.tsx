import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Coins, Heart, Home, Sparkles, Utensils, ShieldAlert } from 'lucide-react';
import type { GameEffect, GameState, MapData, Movement } from '../game/types';
import { getMovementTimeline, type MovementStage } from '../game/presentation';
import type { Point } from './sceneLayout';

export type TurnMomentState = {
  movement: Movement;
  point: Point;
  stage: MovementStage['kind'];
  label?: string;
  segmentKind?: MovementStage['segmentKind'];
  stepIndex?: number;
  stepCount?: number;
  stepState?: 'travel' | 'settled';
  arrivedNodeId?: number;
  tick: number;
};

function initialMoment(movement: Movement, map: MapData): TurnMomentState {
  const first = getMovementTimeline(movement).stages[0];
  return {
    movement,
    point: map.nodes[movement.path[0]] ?? map.nodes[0],
    stage: first?.kind ?? 'effect',
    label: first?.label,
    segmentKind: first?.segmentKind,
    stepIndex: first?.stepIndex,
    stepCount: first?.stepCount,
    stepState: first?.kind === 'move' ? 'travel' : undefined,
    tick: 0,
  };
}

/** The same timeline drives the animation and the server's action lock. */
export function useTurnPresentation(movement: Movement | null | undefined, map: MapData, playing: boolean, onDone?: () => void) {
  const [moment, setMoment] = useState<TurnMomentState | null>(null);
  const seen = useRef<number | null>(null);
  const finished = useRef<number | null>(null);
  const callback = useRef(onDone); callback.current = onDone;

  useEffect(() => {
    if (!movement || !playing || movement.id === seen.current || movement.id === finished.current) return;
    seen.current = movement.id;
    const { stages, duration } = getMovementTimeline(movement);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame = 0;
    let start: number | null = null;
    let completed = false;

    const tick = (now: number) => {
      if (start === null) start = now;
      const elapsed = now - start;
      if (elapsed >= duration) {
        completed = true;
        finished.current = movement.id;
        setMoment(null);
        callback.current?.();
        return;
      }
      const stage = stages.find(candidate => elapsed >= candidate.start && elapsed < candidate.end);
      if (!stage) { frame = requestAnimationFrame(tick); return; }

      // Use the timeline's absolute position to recover after a slow frame
      // without cutting across corners or carrying an old segment forward.
      let point: Point = map.nodes[movement.path[0]] ?? map.nodes[0];
      for (const previous of stages) {
        if (previous.kind === 'move' && previous.end <= elapsed && previous.path?.length) {
          point = map.nodes[previous.path.at(-1)!] ?? point;
        }
      }
      let stepState: TurnMomentState['stepState'];
      let arrivedNodeId: number | undefined;
      if (stage.kind === 'move' && stage.path?.length) {
        const from = map.nodes[stage.path[0]] ?? point;
        const to = map.nodes[stage.path.at(-1)!] ?? from;
        const travelDuration = stage.travelDuration ?? stage.end - stage.start;
        const travelElapsed = elapsed - stage.start;
        if (travelElapsed >= travelDuration) {
          point = to; // Explicitly settle on the node before the next edge.
          stepState = 'settled';
          arrivedNodeId = stage.path.at(-1);
        } else {
          const progress = Math.max(0, Math.min(1, travelElapsed / travelDuration));
          const eased = progress * progress * (3 - 2 * progress);
          point = reduced ? from : { x: from.x + (to.x - from.x) * eased, y: from.y + (to.y - from.y) * eased };
          stepState = 'travel';
        }
      }

      setMoment({
        movement, point, stage: stage.kind, label: stage.label,
        segmentKind: stage.segmentKind,
        stepIndex: stage.stepIndex,
        stepCount: stage.stepCount,
        stepState,
        arrivedNodeId,
        tick: Math.floor(elapsed / 80),
      });
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); if (!completed) seen.current = null; };
  }, [movement?.id, map, playing]);

  // A new authoritative state already contains the final player position. Give
  // the first render its origin synchronously, before the first animation frame.
  if (!playing || !movement || movement.id === finished.current) return null;
  return moment?.movement.id === movement.id ? moment : initialMoment(movement, map);
}

const pipPositions: Record<number, number[][]> = {1:[[32,32]],2:[[19,19],[45,45]],3:[[19,19],[32,32],[45,45]],4:[[19,19],[45,19],[19,45],[45,45]],5:[[19,19],[45,19],[32,32],[19,45],[45,45]],6:[[19,17],[45,17],[19,32],[45,32],[19,47],[45,47]]};
export function DiceGlyph({value}:{value:number}) {
  return <svg viewBox="0 0 64 64" aria-hidden="true"><rect x="2" y="2" width="60" height="60" rx="16" fill="#fffdf4" stroke="currentColor" strokeWidth="2"/>{pipPositions[value] ? pipPositions[value].map(([x,y],i)=><circle key={i} cx={x} cy={y} r="4" fill="currentColor"/>) : <text x="32" y="42" textAnchor="middle" fill="currentColor" fontSize="29" fontWeight="700">{value}</text>}</svg>;
}
const effectIcons={cash:Coins,stamina:Utensils,mood:Heart,event:Sparkles,building:Home,confinement:ShieldAlert};
export function EffectChips({effects}:{effects:GameEffect[]}) {
  return <div className="effect-chips">{effects.map((effect,i)=>{const Icon=effectIcons[effect.kind]??Sparkles; return <span key={i} className={`effect-chip effect-${effect.tone}`}><Icon size={16}/>{effect.label}</span>;})}</div>;
}

export function TurnMoment({moment,state}:{moment:TurnMomentState|null;state:GameState}) {
  if(!moment)return null;
  const player=state.players.find(p=>p.id===moment.movement.playerId);
  const {roll,modifier}=moment.movement;
  const controlled=!!moment.movement.controlled;
  const steps=Math.max(0,roll+modifier);
  const rolling=moment.stage==='roll';
  const adjusting=moment.stage==='adjust';
  const adjusted=moment.stage==='adjusted';
  if(rolling||moment.stage==='result'||adjusting||adjusted) {
    const formula=`${roll} ${modifier>=0?'+':'−'} ${Math.abs(modifier)} → ${steps} 格`;
    return <div className={`turn-moment dice-moment ${rolling?'is-rolling':adjusting?'is-adjusting':adjusted?'is-adjusted':'is-result'} ${controlled?'is-controlled':''}`} data-stage={moment.stage} data-controlled={controlled} role="status" style={{'--actor-color':player?.color??'#558f9e'} as CSSProperties}>
      <div className="dice-actor"><i/>{player?.name} <span>{player?.ai?'代理人':'玩家'}</span>{controlled&&<span className="dice-control-mark">控骰 · 指定点数</span>}</div>
      <div className="animated-dice">{adjusting||adjusted
        ? <div className="dice-adjust-cube"><span className="dice-adjust-face face-original"><DiceGlyph value={roll}/></span><span className="dice-adjust-face face-adjusted"><DiceGlyph value={steps}/></span></div>
        : <DiceGlyph value={rolling?moment.tick%6+1:roll}/>}</div>
      <strong>{rolling?'正在掷骰':adjusting?'点数修正':adjusted?`最终 ${steps} 格`:`${controlled?'指定原始':'原始'} ${roll} 点`}</strong>
      <small>{rolling?'':modifier ? formula : `行进 ${steps} 格`}</small>
    </div>;
  }
  if(moment.stage==='effect' && moment.movement.effects?.length) return <div className="turn-moment landing-moment" data-stage="effect" role="status"><EffectChips effects={moment.movement.effects}/></div>;
  return null;
}

export function FeedbackMoment({feedback}:{feedback:GameState['feedback']}) {
  const [visible,setVisible]=useState(false);
  useEffect(()=>{if(!feedback)return;setVisible(true);const timer=setTimeout(()=>setVisible(false),1900);return()=>clearTimeout(timer);},[feedback?.id]);
  if(!feedback||!visible)return null;
  return <div key={feedback.id} className="turn-moment feedback-moment" role="status"><EffectChips effects={feedback.effects}/></div>;
}
