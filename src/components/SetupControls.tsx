import { useId, type CSSProperties } from 'react';
import { Check, CloudLightning, Infinity as InfinityIcon, Leaf, Sun, Swords } from 'lucide-react';
import type { AILevel, GameConfig, Shape } from '../game/types';

const shapes: { value: Shape; name: string }[] = [
  { value: 'diamond', name: '菱形' }, { value: 'circle', name: '圆形' },
  { value: 'hexagon', name: '六边形' }, { value: 'triangle', name: '三角形' },
];
const journeys = [
  { value: 4, label: '1 年', detail: '4 季 · 84 天' },
  { value: 8, label: '2 年', detail: '8 季 · 168 天' },
  { value: 16, label: '4 年', detail: '16 季 · 336 天' },
  { value: 0, label: '破产决胜', detail: '直到只剩一位未破产玩家' },
];

function ShapeExample({ shape }: { shape: Shape }) {
  return <svg viewBox="-18 -18 36 36" className="shape-example" aria-hidden="true">
    <g fill="currentColor" stroke="#fffffa" strokeWidth="1.5" strokeLinejoin="round">
      {shape === 'circle' ? <circle r="12"/> : shape === 'diamond' ? <path d="M0-15 13 0 0 15-13 0Z"/>
        : shape === 'triangle' ? <path d="M0-14 14 12-14 12Z"/> : <path d="M-7-12H7L14 0 7 12H-7L-14 0Z"/>}
    </g>
  </svg>;
}

export function ShapePicker({ value, onChange, disabled = false }: { value: Shape; onChange: (shape: Shape) => void; disabled?: boolean }) {
  const id = useId();
  return <div className="setup-control shape-picker"><span id={id} className="setup-control-label">信标形状</span>
    <div className="shape-options" role="group" aria-labelledby={id}>{shapes.map(shape => <button type="button" key={shape.value}
      aria-label={shape.name} aria-pressed={shape.value === value} disabled={disabled} onClick={() => onChange(shape.value)}>
      <span className="shape-example-wrap"><ShapeExample shape={shape.value}/>{shape.value === value && <Check size={11} className="shape-selected-check"/>}</span>
      <span>{shape.name}</span>
    </button>)}</div>
  </div>;
}

export function JourneyLengthControl({ value, onChange, disabled = false }: { value: number; onChange: (seasons: number) => void; disabled?: boolean }) {
  const id = useId(), index = Math.max(0, journeys.findIndex(journey => journey.value === value));
  const current = journeys[index], endless = value === 0;
  return <div className={`setup-control journey-control ${endless ? 'is-endless' : ''}`} data-disabled={disabled}
    style={{ '--journey-progress': `${index / (journeys.length - 1) * 100}%` } as CSSProperties}>
    <div className="journey-heading"><label htmlFor={id} className="setup-control-label">旅程长度</label>
      <span className="journey-current">{endless && <InfinityIcon size={22}/>}<strong>{current.label}</strong></span>
    </div>
    <div className="journey-rail">
      <div className="journey-track" aria-hidden="true"><span className="journey-fill"/>{journeys.map((journey, i) => <i key={journey.value} style={{ left: `${i / 3 * 100}%` }}/>)}</div>
      {endless && <div className="journey-orbit" aria-hidden="true"><i/><i/><i/></div>}
      <input id={id} type="range" min={0} max={3} step={1} value={index} disabled={disabled}
        aria-valuetext={`${current.label}，${current.detail}`} aria-describedby={`${id}-detail`}
        onChange={event => onChange(journeys[Number(event.target.value)].value)}/>
    </div>
    <div className="journey-stops" role="group" aria-label="旅程刻度">{journeys.map(journey => <button type="button" key={journey.value}
      disabled={disabled} aria-pressed={journey.value === value} onClick={() => onChange(journey.value)}>{journey.label}</button>)}</div>
    <p className="journey-detail" id={`${id}-detail`}>{endless ? <><span className="endless-spark" aria-hidden="true"/>不设年限 · {current.detail}</> : <>{current.detail}<span>到期比较总资产</span></>}</p>
  </div>;
}

export function WeatherRuleControl({ value, onChange, disabled = false }: { value: GameConfig['weatherMode']; onChange: (mode: GameConfig['weatherMode']) => void; disabled?: boolean }) {
  const id = useId();
  return <div className="setup-control weather-rule-control" data-disabled={disabled}>
    <span id={id} className="setup-control-label">天气规则</span>
    <div className="weather-rule-capsule" role="group" aria-labelledby={id}>
      <button type="button" disabled={disabled} aria-pressed={value === 'standard'} onClick={() => onChange('standard')}><Sun size={16}/><span>标准</span></button>
      <button type="button" disabled={disabled} aria-pressed={value === 'challenge'} onClick={() => onChange('challenge')}><CloudLightning size={16}/><span>挑战</span></button>
    </div>
    <p className="weather-rule-note">{value === 'challenge' ? '完全体天气体验' : '温和天气体验'}</p>
  </div>;
}

export function AILevelControl({ value, onChange, disabled = false, label = '对手强度' }: {
  value: AILevel; onChange: (level: AILevel) => void; disabled?: boolean; label?: string;
}) {
  const id = useId();
  return <div className="ai-level-control" data-level={value} data-disabled={disabled}>
    <div className="ai-level-heading"><span id={id} className="setup-control-label">{label}</span>
      <div className="ai-level-capsule" role="group" aria-labelledby={id} aria-describedby={`${id}-note`}>
        <button type="button" disabled={disabled} aria-pressed={value === 'gentle'} onClick={() => onChange('gentle')}><Leaf size={15} aria-hidden="true"/><span>温和</span></button>
        <button type="button" disabled={disabled} aria-pressed={value === 'fierce'} onClick={() => onChange('fierce')}><Swords size={15} aria-hidden="true"/><span>凌厉</span></button>
      </div>
    </div>
    <p id={`${id}-note`} className="ai-level-note" aria-live="polite">{value === 'fierce' ? '主动采购、精细经营、择机进攻' : '基础经营、不主动攻击，事件也会权衡收益'}</p>
  </div>;
}
