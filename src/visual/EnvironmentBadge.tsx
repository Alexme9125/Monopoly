import { Cloud, CloudDrizzle, CloudFog, CloudHail, CloudLightning, CloudRain, CloudSnow, CloudSun, Droplets, Flame, Snowflake, Sparkles, Sun, SunDim, ThermometerSun, Tornado, Waves, Wind, Zap, type LucideIcon } from 'lucide-react';
import { WEATHERS } from '../game/data';
import type { GameConfig } from '../game/types';
import { getWeatherCopy } from './weatherCopy';

export function WeatherEffects({ weatherId, mode }: { weatherId: string; mode: GameConfig['weatherMode'] }) {
  const weather = WEATHERS[weatherId] ?? WEATHERS.clear;
  const { effects } = getWeatherCopy(weatherId, mode);
  return <div className={`weather-effects weather-tone-${weather.family}`} data-weather-mode={mode} aria-label={`当前天气效果：${weather.name}`}>
    <div className="weather-effects-heading"><span className="weather-effects-name">{weather.name}</span><span className="weather-mode-label">{mode === 'standard' ? '标准天气' : '挑战天气'}</span></div>
    <div className="weather-effect-terms" aria-label="天气规则">{effects.map((term, index) => <span key={`${index}:${term}`}>{term}</span>)}</div>
  </div>;
}

const ICONS: Record<string, LucideIcon> = {
  clear: Sun, soft: CloudSun, fireflies: Sparkles, chill: Snowflake,
  snow: CloudSnow, blizzard: Snowflake, freezing: CloudHail,
  drizzle: CloudDrizzle, rain: CloudRain, thunder: CloudLightning, storm: CloudLightning,
  warm: SunDim, hot: ThermometerSun, heat: Flame, scorch: Sun,
  breeze: Wind, drought: SunDim, gale: Wind, sand: Waves, sandstorm: Tornado,
  mist: CloudFog, fog: Cloud, haze: CloudFog, acid: Droplets, glitch: Zap, paradox: Tornado,
};

export function WeatherIcon({ weatherId, size = 26 }: { weatherId: string; size?: number }) {
  const Icon = ICONS[weatherId] ?? Sun;
  return <Icon size={size} strokeWidth={1.8} aria-hidden="true" />;
}

export function WeatherButton({ weatherId, onClick }: { weatherId: string; onClick: () => void }) {
  const weather = WEATHERS[weatherId] ?? WEATHERS.clear;
  return <button className={`weather-button weather-tone-${weather.family}`} onClick={onClick} aria-label={`天气：${weather.name}，查看效果`} title={`${weather.name} · 点击查看天气效果`}>
    <WeatherIcon weatherId={weatherId} /><span className="weather-indicator" />
  </button>;
}

export function CalendarBadge({ day }: { day: number }) {
  const seasonIndex = Math.floor((day - 1) / 21) % 4;
  const season = ['春', '夏', '秋', '冬'][seasonIndex];
  const seasonKey = ['spring', 'summer', 'autumn', 'winter'][seasonIndex];
  const year = Math.floor((day - 1) / 84) + 1;
  const date = (day - 1) % 21 + 1;
  return <div className={`calendar-badge calendar-${seasonKey}`} data-season={seasonKey} aria-label={`第${year}年${season}季第${date}天，总第${day}天`} title={`第 ${year} 年 · ${season}季第 ${date} 天 · 总第 ${day} 天`}>
    <span className="calendar-season">{season} · {year}年</span><strong>{String(date).padStart(2, '0')}</strong>
  </div>;
}
