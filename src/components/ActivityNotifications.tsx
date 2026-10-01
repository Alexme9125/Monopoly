import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import type { GameNotice, GameState, TurnEncounter } from '../game/types';
import TurnEncounters from './TurnEncounters';

interface Props {
  state: GameState;
  busy: boolean;
  blocked?: boolean;
  onOpenLogs: () => void;
  onEncounterVisibilityChange?: (visible: boolean) => void;
  onActivityHeightChange?: (height: number) => void;
}

const EMPTY_NOTICES: GameNotice[] = [];
const EMPTY_ENCOUNTERS: TurnEncounter[] = [];
const latestId = (notices: GameNotice[]) => Math.max(0, ...notices.map(notice => notice.id));

export function advanceNoticeStream(visible: GameNotice[], pending: GameNotice[], seenId: number, incoming: GameNotice[], busy: boolean) {
  const fresh = incoming.filter(notice => notice.id > seenId);
  const staged = [...pending, ...fresh];
  return {
    seenId: Math.max(seenId, latestId(fresh)),
    visible: busy ? visible : [...visible, ...staged].slice(-30),
    pending: busy ? staged : [],
    released: busy ? [] : staged,
  };
}

export function noticeToastPolicy(busy: boolean, blocked: boolean, hasActive: boolean) {
  return { canStart: !busy && !blocked && !hasActive, hidden: blocked, ticking: hasActive && !blocked };
}

export function visibleTurnEncounters(known: TurnEncounter[], incoming: TurnEncounter[], busy: boolean): TurnEncounter[] {
  if (!busy) return [...incoming];
  const knownIds = new Set(known.map(encounter => encounter.id));
  return incoming.filter(encounter => knownIds.has(encounter.id));
}

export default function ActivityNotifications({ state, busy, blocked = false, onOpenLogs, onEncounterVisibilityChange, onActivityHeightChange }: Props) {
  const notices = state.notices ?? EMPTY_NOTICES;
  const encounters = state.turnEncounters ?? EMPTY_ENCOUNTERS;
  const signature = `${state.config.mapId}:${state.config.seed}:${state.config.players.map(player => player.name).join('|')}`;
  const carouselRef = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState<GameNotice[]>(() => [...notices]);
  const [selectedId, setSelectedId] = useState<number | null>(() => notices.at(-1)?.id ?? null);
  const [paused, setPaused] = useState(false);
  const [toast, setToast] = useState<GameNotice | null>(null);
  const [queueVersion, setQueueVersion] = useState(0);
  const pendingReveal = useRef<GameNotice[]>([]);
  const toastQueue = useRef<GameNotice[]>([]);
  const seen = useRef(latestId(notices));
  const game = useRef(signature);
  const previousSequence = useRef(state.sequence);
  const newestId = latestId(notices);
  const [visibleEncounters, setVisibleEncounters] = useState<TurnEncounter[]>(() => busy ? [] : [...encounters]);
  const encounterGame = useRef(signature);
  const encounterSequence = useRef(state.sequence);
  const encounterReset = encounterGame.current !== signature || state.sequence < encounterSequence.current;
  const displayedEncounters = encounterReset && busy ? [] : visibleTurnEncounters(visibleEncounters, encounters, busy);

  useEffect(() => {
    const reset = encounterGame.current !== signature || state.sequence < encounterSequence.current;
    encounterGame.current = signature;
    encounterSequence.current = state.sequence;
    if (reset || !encounters.length) {
      setVisibleEncounters(reset && !busy ? [...encounters] : []);
    } else setVisibleEncounters(previous => visibleTurnEncounters(previous, encounters, busy));
  }, [signature, state.sequence, encounters, busy]);

  useEffect(() => { onEncounterVisibilityChange?.(displayedEncounters.length > 0); }, [displayedEncounters.length, onEncounterVisibilityChange]);
  useEffect(() => {
    const element = carouselRef.current;
    if (!element || !onActivityHeightChange) return;
    const report = () => onActivityHeightChange(Math.ceil(element.getBoundingClientRect().height));
    report();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [onActivityHeightChange]);

  useEffect(() => {
    if (game.current !== signature || state.sequence < previousSequence.current || newestId < seen.current) {
      game.current = signature;
      previousSequence.current = state.sequence;
      seen.current = newestId;
      pendingReveal.current = [];
      toastQueue.current = [];
      setVisible([...notices]);
      setSelectedId(notices.at(-1)?.id ?? null);
      setPaused(false);
      setToast(null);
      setQueueVersion(value => value + 1);
      return;
    }
    previousSequence.current = state.sequence;
    const step = advanceNoticeStream(visible, pendingReveal.current, seen.current, notices, busy);
    seen.current = step.seenId;
    pendingReveal.current = step.pending;
    if (step.released.length) {
      setVisible(step.visible);
      toastQueue.current.push(...step.released);
      setQueueVersion(value => value + 1);
      if (!paused) setSelectedId(step.released[step.released.length - 1].id);
    }
  }, [state.sequence, newestId, notices, signature, busy, paused, visible]);

  const toastPolicy = noticeToastPolicy(busy, blocked, !!toast);
  useEffect(() => {
    if (!toastPolicy.canStart || !toastQueue.current.length) return;
    setToast(toastQueue.current.shift() ?? null);
  }, [toastPolicy.canStart, queueVersion]);

  useEffect(() => {
    if (!toastPolicy.ticking) return;
    const timer = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(timer);
  }, [toast, toastPolicy.ticking]);

  const history = [...visible].reverse();
  const activeIndex = Math.max(0, history.findIndex(notice => notice.id === selectedId));
  const active = history[activeIndex];
  const move = (direction: number) => {
    if (!history.length) return;
    setSelectedId(history[(activeIndex + direction + history.length) % history.length].id);
  };

  useEffect(() => {
    if (paused || displayedEncounters.length || history.length < 2) return;
    const timer = setTimeout(() => move(1), 6000);
    return () => clearTimeout(timer);
  }, [paused, selectedId, history.length, history[0]?.id, displayedEncounters.length]);

  return <>
    <aside ref={carouselRef} className={`activity-carousel ${displayedEncounters.length ? 'has-turn-encounters' : ''}`} aria-label={displayedEncounters.length ? '本回合不期而遇' : '旅途播报'}>
      <div className="activity-heading"><strong>{displayedEncounters.length ? '本回合 · 不期而遇' : '旅途播报'}</strong><button type="button" onClick={onOpenLogs}>旅途手记</button></div>
      {displayedEncounters.length ? <TurnEncounters encounters={displayedEncounters} players={state.players} mapId={state.config.mapId} /> : <>{active ? <article className={`activity-card notice-tone-${active.tone}`}>
        <small>第 {active.day} 天 · {active.kind === 'rent' ? '租金' : active.kind === 'milestone' ? '行进奖励' : active.kind === 'trade' ? '房产交易' : active.kind === 'lottery' ? '奖券开奖' : '事件'}</small>
        <strong>{active.title}</strong>
        <p>{active.body}</p>
      </article> : <div className="activity-card empty-state"><p>旅途事件、租金往来、房产交易与行进奖励会出现在这里。</p></div>}
      <div className="carousel-controls">
        <button type="button" onClick={() => move(1)} disabled={history.length < 2} aria-label="上一条播报" title="上一条播报"><ChevronLeft size={16} /></button>
        <span aria-label={`第 ${history.length ? activeIndex + 1 : 0} 条，共 ${history.length} 条`}>{history.length ? activeIndex + 1 : 0} / {history.length}</span>
        <button type="button" onClick={() => move(-1)} disabled={history.length < 2} aria-label="下一条播报" title="下一条播报"><ChevronRight size={16} /></button>
        <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? '继续轮播' : '暂停轮播'} title={paused ? '继续轮播' : '暂停轮播'}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
      </div></>}
    </aside>
    {toast && <div className={`activity-toast notice-tone-${toast.tone}`} role="status" aria-live="polite" aria-atomic="true" aria-hidden={toastPolicy.hidden} style={toastPolicy.hidden ? { visibility: 'hidden' } : undefined}>
      <strong>{toast.title}</strong><span>{toast.body}</span>
    </div>}
  </>;
}
