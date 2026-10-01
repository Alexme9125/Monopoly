import type { AILevel, Personality } from './types';

export const AI_LEVEL_NAMES: Record<AILevel, string> = { gentle: '温和', fierce: '凌厉' };
export const PERSONALITY_NAMES: Record<Personality, string> = { cautious: '谨慎', balanced: '平衡', aggressive: '激进' };

const STYLE_DESCRIPTIONS: Record<AILevel, Record<Personality, string>> = {
  gentle: {
    cautious: '留足现金，稳步置业',
    balanced: '兼顾状态与产业',
    aggressive: '积极买地，敢于投入',
  },
  fierce: {
    cautious: '厚积防护，择机反制',
    balanced: '灵活经营，攻守兼备',
    aggressive: '加速扩张，主动施压',
  },
};

export const getAIProfileLabel = (profile: { aiLevel?: AILevel; personality: Personality }): string =>
  `${AI_LEVEL_NAMES[profile.aiLevel ?? 'gentle']} · ${PERSONALITY_NAMES[profile.personality]}`;

export const getAIStyleDescription = (level: AILevel, personality: Personality): string => STYLE_DESCRIPTIONS[level][personality];
