import { MAPS } from '../game/maps';
import type { Player, Prompt, GameState } from '../game/types';

const money = (value: number) => `PM$ ${Math.round(value).toLocaleString('zh-CN')}`;

export default function RentDecision({ state, player, prompt, disabled = false, onChoose }: {
  state: GameState;
  player: Player;
  prompt: Prompt;
  disabled?: boolean;
  onChoose: (choiceId: string) => void;
}) {
  const nodeId = Number(prompt.data?.nodeId);
  const amount = Number(prompt.data?.amount);
  const node = Number.isSafeInteger(nodeId) ? MAPS[state.config.mapId].nodes[nodeId] : undefined;
  const owner = state.players.find(entry => entry.id === prompt.data?.ownerId);
  const rent = Number.isSafeInteger(amount) && amount >= 0 ? amount : 0;
  const dryCards = player.inventory.filter(slot => slot.itemId === 'rent' && !slot.wet).reduce((total, slot) => total + slot.quantity, 0);
  const afterPay = player.cash - rent;
  const cardChoice = prompt.choices.find(choice => choice.id === 'use_card');
  const payChoice = prompt.choices.find(choice => choice.id === 'pay');
  const choose = (choiceId: 'use_card' | 'pay') => {
    const choice = choiceId === 'use_card' ? cardChoice : payChoice;
    if (!disabled && choice && !choice.disabled) onChoose(choiceId);
  };

  return <div className="rent-decision">
    <div className="rent-property"><small>本次停留</small><strong>{node?.name ?? '已购地产'}</strong><span>房主 {owner?.name ?? '其他玩家'} · 应付租金 {money(rent)}</span></div>
    <div className="rent-budget" aria-label="本次付租预算"><div><small>当前现金</small><strong>{money(player.cash)}</strong></div><div><small>可用免租卡</small><strong>{dryCards} 张</strong></div></div>
    <div className="rent-option-list">
      <button className="rent-option" type="button" disabled={disabled || !cardChoice || cardChoice.disabled} onClick={() => choose('use_card')}>
        <strong className="rent-option-title">使用免租卡</strong><span className="rent-option-effect">本次支付 0 · 剩余现金 {money(player.cash)}</span><small className="rent-option-note">消耗 1 张干燥的免租卡；之后还剩 {Math.max(0, dryCards - 1)} 张。{cardChoice?.disabled || !cardChoice ? '当前没有可用免租卡。' : ''}</small>
      </button>
      <button className="rent-option" type="button" disabled={disabled || !payChoice || payChoice.disabled} onClick={() => choose('pay')}>
        <strong className="rent-option-title">支付租金</strong><span className="rent-option-effect">支付 {money(rent)} · 预计现金 {money(afterPay)}</span><small className="rent-option-note">保留免租卡。{afterPay < 0 ? `现金缺口 ${money(-afterPay)}，选择后可通过抵押或卖股偿还。` : '现金足够，可直接支付。'}</small>
      </button>
    </div>
  </div>;
}
