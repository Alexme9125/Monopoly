import type { GameConfig } from '../game/types';

export interface WeatherCopy {
  intro: string;
  effects: string[];
  protection?: string;
}

const hiddenEncounters = '能见度降低，地图上临时刷新的不期而遇位置会被隐藏，抵达后仍会触发。';
const windDrying = '每日开始时，每件受潮道具的风干概率由 25% 提高到 50%。';
const shelter = '处于三日星伞的防护下时，可免除天气造成的体力与心情损失、道具受潮及纸质物品吹失；骰点修正、天气位移和能见度限制仍然生效。';
const windLoss = (chance: number) => `每次掷骰有 ${chance}% 概率被吹走一件随机纸质道具（含卡券）；没有纸质道具时，改为损失 30～150 棱镜币，最多扣至余额为零。`;

// Copy follows the weather draft, with the user's approved balance changes.
// Explicit triggers match settlement: most penalties apply to rolling, not resting.
const copy: Record<string, WeatherCopy> = {
  clear: {
    intro: '光照充足，气温宜人。',
    effects: ['晴朗天气没有额外影响，可以安心规划今天的行程。'],
  },
  soft: {
    intro: '棱镜星特有的柔和日光，令人感到舒适。',
    effects: ['每次掷骰或主动休息时，随机恢复 1～8 点心情；因禁锢跳过行动时不触发。'],
  },
  fireflies: {
    intro: '棱镜星特有的阴天：平流层中的矿物质颗粒反射光线，呈现繁星般的萤光。',
    effects: ['每次掷骰或主动休息时，随机恢复 1～12 点心情；因禁锢跳过行动时不触发。'],
  },
  chill: {
    intro: '寒风掠过尚未开发的街区。',
    effects: ['停在没有建筑的地块上时，损失 4 点体力。'],
    protection: shelter,
  },
  snow: {
    intro: '薄雪覆盖路面，脚下开始打滑。',
    effects: ['正常行进结束后，再向前滑行 1 格，然后结算落点。停在没有建筑的地块上时，损失 1 点体力。'],
    protection: shelter,
  },
  blizzard: {
    intro: '风雪加剧，路面结冰，户外逗留会使代理人受寒。',
    effects: ['正常行进结束后，再向前滑行 2 格，然后结算落点。停在没有建筑的地块上时，损失 6 点体力。'],
    protection: shelter,
  },
  freezing: {
    intro: '雨水在路面结成冰层，行走更加难以控制。',
    effects: ['正常行进结束后，再向前滑行 4 格，然后结算落点。'],
  },
  drizzle: {
    intro: '细雨对行程的影响很小，但随身物品可能受潮。',
    effects: [],
    protection: shelter,
  },
  rain: {
    intro: '连绵的雨幕降低了街区的能见度。',
    effects: [],
    protection: shelter,
  },
  thunder: {
    intro: '天空不下雨，却不断响起雷声。',
    effects: ['每次掷骰时有 10% 概率遭遇雷击，损失 12 点体力；主动休息或因禁锢跳过行动时不会遭雷击。'],
    protection: shelter,
  },
  storm: {
    intro: '雷电伴随强降雨，视线和随身物品都受到影响。',
    effects: [],
    protection: shelter,
  },
  warm: {
    intro: '日间气温升高，有建筑的地方更适合停留。',
    effects: ['停在没有建筑的地块上时，心情与体力各损失 1 点。'],
    protection: shelter,
  },
  hot: {
    intro: '炎热的天气使代理人的步伐变慢。',
    effects: ['骰子的最终点数减少 1 点，最低为 0 点。停在没有建筑的地块上时，损失 2 点心情和 1 点体力。'],
    protection: shelter,
  },
  heat: {
    intro: '酷暑笼罩街区，户外活动更加吃力。',
    effects: ['骰子的最终点数减少 2 点，最低为 0 点。停在没有建筑的地块上时，心情与体力各损失 2 点。'],
    protection: shelter,
  },
  scorch: {
    intro: '极强的日照使每一步行进都变得艰难。',
    effects: [],
    protection: shelter,
  },
  breeze: {
    intro: '温和的风有助于晾干受潮的物品。',
    effects: [windDrying],
  },
  drought: {
    intro: '空气干燥，受潮物品很快就会晾干。',
    effects: ['每日开始时，所有受潮道具都会晾干，风干概率由 25% 提高到 100%。'],
  },
  gale: {
    intro: '强风会将代理人吹回，并卷走没有收好的纸质物品。',
    effects: ['正常行进结束后，被风吹回 1 格，然后结算落点。', windLoss(10), windDrying],
    protection: shelter,
  },
  sand: {
    intro: '风卷起沙尘，前方的街区逐渐模糊。',
    effects: ['正常行进结束后，被风吹回 2 格，然后结算落点。', hiddenEncounters, windLoss(15), windDrying],
    protection: shelter,
  },
  sandstorm: {
    intro: '猛烈的沙尘暴阻碍视线和行进，户外活动会消耗更多精力。',
    effects: ['正常行进结束后，被风吹回 4 格，然后结算落点；每次掷骰时，体力与心情额外各损失 2 点。', hiddenEncounters, windLoss(25), windDrying],
    protection: shelter,
  },
  mist: {
    intro: '街区被轻雾笼罩。',
    effects: [hiddenEncounters],
  },
  fog: {
    intro: '浓雾遮住了街道，也可能掩护代理人避开收费。',
    effects: [hiddenEncounters, '需要支付租金时，有 50% 概率避开本次收费。'],
  },
  haze: {
    intro: '灰霾使视野不清，也让代理人感到压抑。',
    effects: [hiddenEncounters, '每次掷骰时，损失 6 点心情；主动休息或因禁锢跳过行动时不触发。'],
    protection: shelter,
  },
  acid: {
    intro: '第 22 天起才可能出现的低概率灾难天气。雨水具有腐蚀性，建筑施工必须暂停。',
    effects: ['停在没有建筑的地块上时，损失 4 点体力。当天不能建造、升级或修复房屋，但仍可购买地块。'],
    protection: shelter,
  },
  glitch: {
    intro: '第 22 天起才可能出现的低概率灾难天气。棱镜星的天气发生错位，正常行进后会出现前滑与后退。',
    effects: [
      '正常行进结束后，先向前滑行 2 格并结算落点；处理完该处的选择后，再向后退 4 格并结算第二个落点。',
      '每次掷骰只随机附加一种负面效果：冻伤（体力损失 6 点）、雷击（体力损失 12 点）或沙尘（体力与心情各损失 2 点），不会同时叠加三种。',
    ],
    protection: shelter,
  },
  paradox: {
    intro: '第 22 天起才可能出现的低概率灾难天气。星球陷入无光、无声、无味的奇异黑暗。',
    effects: ['当天全部免收租金，也不会触发不期而遇。不能使用道具或设施，不能购买地块、建造或升级房屋。', '经过起点的奖励和硬币路面的拾取收益仍然有效。'],
  },
};

export function getWeatherCopy(weatherId: string, mode: GameConfig['weatherMode']): WeatherCopy {
  const base = copy[weatherId] ?? copy.clear;
  const standard = mode === 'standard';
  if (weatherId === 'drizzle' || weatherId === 'rain') {
    return { ...base, effects: [
      ...(weatherId === 'rain' ? [hiddenEncounters] : []),
      standard
        ? '每次掷骰时，从背包中怕水的道具里随机抽取一件，使其受潮；受潮期间无法使用，其他道具不受影响。'
        : '每次掷骰时，从背包中所有类型的道具里随机抽取一件，使其受潮；受潮期间无法使用。',
    ] };
  }
  if (weatherId === 'storm') {
    return { ...base, effects: [
      hiddenEncounters,
      standard ? '每次掷骰时，背包内所有怕水的道具都会受潮，暂时无法使用；不怕水的道具不受影响。'
        : '每次掷骰时，背包内所有类型的道具都会受潮，暂时无法使用。',
      '每次掷骰时另有 25% 概率遭遇雷击，损失 12 点体力；主动休息或因禁锢跳过行动时不触发受潮和雷击。',
    ] };
  }
  if (weatherId === 'scorch') {
    return { ...base, effects: [
      '骰子的最终点数减少 4 点，最低为 0 点；按修正后的点数正常行进时，每走 1 格，体力与心情额外各损失 3 点。',
      standard ? '标准天气下，单次掷骰由骄阳造成的体力与心情损失分别最多为 18 点。'
        : '挑战天气下，骄阳造成的额外损失不设上限，最终走多少格就按多少格扣除。',
    ] };
  }
  return { ...base, effects: [...base.effects] };
}
