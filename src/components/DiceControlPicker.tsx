import { DiceGlyph } from '../visual/TurnPresentation';
import { useState } from 'react';
import type { GameConfig } from '../game/types';
import { getWeatherDiceModifier } from '../game/weatherRules';

export default function DiceControlPicker({ weatherId, weatherMode, disabled = false, onConfirm, onCancel }: {
  weatherId: string;
  weatherMode: GameConfig['weatherMode'];
  disabled?: boolean;
  onConfirm: (value: number) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const modifier = getWeatherDiceModifier(weatherId, weatherMode);
  const steps = selected === null ? null : Math.max(0, selected + modifier);

  return <div className="dice-control-picker">
    <div className="dice-control-heading"><h3>为本次行动指定点数</h3><p>选定 1～6 点，确认后消耗一件控骰器；取消不会消耗。若改为休息，本次指定点数作废。</p></div>
    <div className="dice-control-grid" role="group" aria-label="选择指定点数">{[1, 2, 3, 4, 5, 6].map(value => <button key={value} type="button" className={`dice-control-face ${selected === value ? 'is-selected' : ''}`} aria-label={`指定 ${value} 点`} aria-pressed={selected === value} disabled={disabled} onClick={() => setSelected(value)}><DiceGlyph value={value} /><span>{value} 点</span></button>)}</div>
    <div className="dice-control-preview" role="status" aria-live="polite">{selected === null ? <p>请选择点数，查看本次预计行进格数。</p> : <><strong>原始点数 {selected} 点</strong><span>{modifier ? `天气修正 ${modifier} 点 · ` : '无骰点修正 · '}预计正常行进 {steps} 格</span><small>天气造成的额外滑移或吹回另行结算。</small></>}</div>
    <div className="dice-control-actions"><button className="secondary-button" type="button" onClick={onCancel}>取消</button><button className="action-button" type="button" disabled={disabled || selected === null} onClick={() => { if (selected !== null) onConfirm(selected); }}>确认使用</button></div>
  </div>;
}
