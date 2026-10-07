import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/game/engine';
import type { GameConfig } from '../src/game/types';
import { WeatherRuleControl } from '../src/components/SetupControls';
import DiceControlPicker from '../src/components/DiceControlPicker';
import { WeatherTargetPicker } from '../src/components/ItemTargetPicker';
import { WeatherEffects } from '../src/visual/EnvironmentBadge';
import { getWeatherCopy, WEATHER_MODE_DETAILS } from '../src/visual/weatherCopy';
import { getWeatherDiceModifier } from '../src/game/weatherRules';

function game(mode: GameConfig['weatherMode']) {
  const state = createGame({ mapId: 'lake', mode: 'pve', seasons: 4, weatherMode: mode, seed: 19, players: [
    { name: '旅行家', color: '#D55B48', shape: 'circle', ai: false, personality: 'balanced' },
    { name: '旅伴', color: '#277DA8', shape: 'diamond', ai: true, personality: 'balanced' },
  ] });
  state.day = 1;
  state.players[0].inventory.push({ uid: 'weather-test', itemId: 'weather', quantity: 1, wet: false });
  return state;
}

describe('hardship weather presentation', () => {
  it('offers three shared modes and labels hardship in the live banner', () => {
    const controls = renderToStaticMarkup(<WeatherRuleControl value="hardship" onChange={() => {}} />);
    expect(controls).toContain('data-mode="hardship"');
    expect(controls).toContain('直面大自然的怒火');
    expect(controls.match(/aria-pressed="true"/g)).toHaveLength(1);
    for (const mode of ['standard', 'challenge', 'hardship']) expect(controls).toContain(`data-mode="${mode}"`);
    const banner = renderToStaticMarkup(<WeatherEffects weatherId="freezing" mode="hardship" />);
    expect(banner).toContain('苦难天气');
    expect(banner).toContain('向前滑行 6 格');
    expect(banner).toContain('心情损失 6 点');
  });

  it('uses the shared mode modifier for controlled-dice previews', () => {
    const hardship = renderToStaticMarkup(<DiceControlPicker weatherId="mist" weatherMode="hardship" onConfirm={() => {}} onCancel={() => {}} />);
    const challenge = renderToStaticMarkup(<DiceControlPicker weatherId="mist" weatherMode="challenge" onConfirm={() => {}} onCancel={() => {}} />);
    expect(hardship).toContain('为本次行动指定点数');
    expect(challenge).toContain('为本次行动指定点数');
    expect(getWeatherDiceModifier('mist', 'hardship')).toBe(-1);
    expect(getWeatherDiceModifier('mist', 'challenge')).toBe(0);
    expect(getWeatherDiceModifier('hot', 'hardship')).toBe(-2);
    expect(getWeatherDiceModifier('heat', 'hardship')).toBe(-3);
    expect(getWeatherCopy('mist', 'hardship').effects.join(' ')).toContain('减少 1 点');
    expect(getWeatherCopy('hot', 'hardship').effects.join(' ')).toContain('减少 2 点');
    expect(getWeatherCopy('heat', 'hardship').effects.join(' ')).toContain('减少 3 点');
  });

  it('opens disaster targets on day one only in hardship', () => {
    const severe = game('hardship');
    const mild = game('challenge');
    const props = { itemUid: 'weather-test', itemName: '天气控制器', disabled: false, onBack: () => {}, onConfirm: () => {} };
    const severeHtml = renderToStaticMarkup(<WeatherTargetPicker key="severe" state={severe} player={severe.players[0]} {...props} />);
    const mildHtml = renderToStaticMarkup(<WeatherTargetPicker key="mild" state={mild} player={mild.players[0]} {...props} />);
    expect(severeHtml).toContain('苦难天气从第 1 天起');
    expect(severeHtml).not.toContain('第 22 天开放');
    expect(mildHtml).toContain('标准与挑战天气从第 22 天起');
    expect(mildHtml).toContain('第 22 天开放');
  });

  it('keeps complete disaster copy and the mode-specific opening day', () => {
    for (const id of ['acid', 'glitch', 'paradox']) {
      const hardship = getWeatherCopy(id, 'hardship');
      expect(hardship.intro).toContain('第 1 天');
      expect(hardship.intro).not.toContain('第 22 天');
      expect(hardship.effects.length).toBeGreaterThan(0);
      expect(getWeatherCopy(id, 'challenge').intro).toContain('第 22 天');
    }
    expect(getWeatherCopy('glitch', 'hardship').effects.join(' ')).toContain('向后退 6 格');
    expect(getWeatherCopy('storm', 'hardship').effects.join(' ')).toContain('40%');
    expect(getWeatherCopy('fog', 'hardship').effects.join(' ')).toContain('65%');
    expect(WEATHER_MODE_DETAILS.hardship).toContain('第 1 天');
    expect(WEATHER_MODE_DETAILS.standard).toContain('标准天气更温和');
    expect(WEATHER_MODE_DETAILS.standard).not.toContain('改版');
    for (const id of ['drizzle', 'rain']) expect(getWeatherCopy(id, 'hardship').effects.join(' ')).toContain('受潮期间无法使用');
    expect(getWeatherCopy('paradox', 'hardship').protection).toContain('设施限制仍然生效');
  });
});
