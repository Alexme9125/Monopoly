import type { EventDef, ItemDef, PlayerConfig, Stock, WeatherDef } from './types';

export const JOURNEY_REWARD_STEPS = 72;
export const JOURNEY_REWARD_CASH = 10_000;

const item = (id: string, name: string, icon: string, category: ItemDef['category'], price: number, description: string, shop = true, susceptible = false, target?: ItemDef['target']): ItemDef => ({
  id, name, icon, category, price, description, shop, susceptible, target,
  stackable: category === 'card', paper: category === 'card',
});

const itemList: ItemDef[] = [
  item('dice8', '八面电子骰', '🎲', 'dice', 380, '替代普通骰投掷 1d8；电子道具受潮时暂时不能使用。', true, true),
  item('dice12', '十二面电子骰', '🎲', 'dice', 720, '替代普通骰投掷 1d12；电子道具受潮时暂时不能使用。', true, true),
  item('dice20', '二十面电子骰', '🎲', 'dice', 1280, '替代普通骰投掷 1d20；电子道具受潮时暂时不能使用。', true, true),
  item('dice100', '百面星核骰', '💠', 'dice', 4000, '稀有事件道具，可投掷 1d100；商店不售卖。', false, true),
  item('controller', '控骰器', '🎛️', 'dice', 1600, '行动前指定本次普通六面骰的原始点数（1～6），天气仍会修正点数。确认后消耗一件；本回合不能再使用其他骰具，也不能与已启用的多面骰叠加。电子装置怕水，受潮时暂时无法使用。', true, true, 'dice'),
  item('snack', '能量小食', '🍪', 'supply', 180, '使用后恢复 20 点体力。'),
  item('feast', '星港盛宴', '🍱', 'supply', 380, '使用后恢复 40 点体力。'),
  item('tea', '月露茶', '🍵', 'supply', 220, '使用后恢复 20 点心情。'),
  item('restkit', '野营休憩包', '⛺', 'supply', 580, '使用后同时恢复 25 点体力与 25 点心情。'),
  item('coffee', '晨星咖啡', '☕', 'supply', 260, '使用后恢复 12 点体力与 8 点心情。'),
  item('bomb', '传送爆弹', '💣', 'attack', 1800, '指定一名对手，将其送入医院休养 3 次行动；施用者有 10% 概率因扰乱秩序入狱。电子引信受潮时暂时失效。', true, true, 'player'),
  item('demolish', '拆迁许可', '🛠️', 'attack', 2400, '指定对手一处非地标建筑，拆除 1 层；不能使等级低于 0。', true, false, 'property'),
  item('acquire', '强制收购契约', '📜', 'card', 3500, '指定对手一处非地标资产，按该资产价格的 1.5 倍向原主人付款后取得所有权；资金不足不能使用。', true, false, 'property'),
  item('arrest', '免捕卡', '🪪', 'card', 880, '一次性抵消即将发生的逮捕或入狱。'),
  item('rent', '免租卡', '🎫', 'card', 980, '收到租金账单时，可自行选择消耗一张来免除本次租金，也可付款并保留；受潮时无法抵免。'),
  item('shield', '星盾卡', '🛡️', 'card', 1200, '一次性抵挡针对自己的道具攻击。'),
  item('weather', '天气控制器', '🌦️', 'special', 2200, '指定下一次天气为选定类型；电子装置受潮时暂时不能使用。', true, true, 'weather'),
  item('bag', '折叠背包', '🎒', 'special', 1800, '永久增加 4 格道具容量；初始容量为 10 格。'),
  item('luck', '幸运星签', '🍀', 'card', 1400, '获得持续 3 日的幸运状态。'),
  item('unluck', '霉运星签', '🌩️', 'card', 1500, '指定一名对手，使其受到持续 3 日的霉运状态。', true, false, 'player'),
  item('tax', '税务审计函', '🧾', 'card', 1900, '指定一名对手，令其缴纳 1800 星币税款。', true, false, 'player'),
  item('teleport', '星轨换乘券', '🚉', 'card', 860, '立即转移至选定车站。'),
  item('dry', '全效干燥剂', '🧴', 'supply', 760, '立即晾干背包中所有受潮道具，恢复其使用能力。'),
  item('umbrella', '三日星伞', '☂️', 'special', 1100, '获得持续 3 日的天气防护状态。'),
  item('repair', '建筑修复包', '🔧', 'special', 1600, '修复指定房产；原建筑低于 4 层时，还可免费升级 1 层。', true, false, 'property'),
  item('lottery', '星海奖券', '🎟️', 'card', 1200, '事件奖券，使用后参与一次星港抽奖；商店不售卖。', false),
];

export const ITEMS: Record<string, ItemDef> = Object.fromEntries(itemList.map(def => [def.id, def]));

// Natural draw seasons are zero based: spring 0, summer 1, autumn 2, winter 3.
const weather = (id: string, name: string, family: WeatherDef['family'], icon: string, description: string, weight: number, seasons: number[], balancedNote?: string): WeatherDef => ({ id, name, family, icon, description, weight, seasons, balancedNote });

const weatherList: WeatherDef[] = [
  weather('clear', '晴朗', 'clear', '☀️', '天空澄明，没有额外天气效果。', 9, [0, 1, 2, 3]),
  weather('soft', '柔光', 'clear', '🌤️', '每次行动随机恢复 1–8 点心情。', 5, [0, 1, 2, 3]),
  weather('fireflies', '星萤', 'clear', '✨', '每次行动随机恢复 1–12 点心情。', 3, [0, 1, 2, 3]),
  weather('chill', '风寒', 'frost', '🥶', '停在空地时体力 -4。', 3, [0, 2, 3]),
  weather('snow', '轻雪', 'frost', '🌨️', '停在空地时体力 -1；行进滑移 +1 格。', 3, [0, 3]),
  weather('blizzard', '暴风雪', 'frost', '❄️', '停在空地时体力 -6；行进滑移 +2 格。', 1, [3]),
  weather('freezing', '冻雨', 'frost', '🧊', '冰层使行进滑移 +4 格。', 2, [2]),
  weather('drizzle', '轻雨', 'rain', '🌦️', '每次天气结算随机使一件道具受潮，暂时不能使用。', 5, [0, 1, 2], '标准模式只从怕水道具中抽取；挑战模式从所有道具中抽取。'),
  weather('rain', '雨幕', 'rain', '🌧️', '临时不期而遇的位置隐藏；每次天气结算随机使一件道具受潮，暂时不能使用。', 4, [0, 1, 2], '标准模式只从怕水道具中抽取；挑战模式从所有道具中抽取。'),
  weather('thunder', '阵雷', 'rain', '🌩️', '每次行动有 10% 概率遭雷击，体力 -12。', 3, [1, 2]),
  weather('storm', '雷暴', 'rain', '⛈️', '临时不期而遇的位置隐藏；道具全部受潮，且每次行动有 25% 概率遭雷击、体力 -12。', 1, [1, 2], '标准模式使全部怕水道具受潮；挑战模式使所有道具受潮。这是唯一一次让全部适用道具受潮的天气。'),
  weather('warm', '高温', 'heat', '🌞', '停在空地时体力与心情各 -1。', 4, [1, 2]),
  weather('hot', '炎热', 'heat', '♨️', '停在空地时心情 -2、体力 -1；骰点 -1。', 3, [1, 2]),
  weather('heat', '酷暑', 'heat', '🔥', '停在空地时体力与心情各 -2；骰点 -2。', 2, [1]),
  weather('scorch', '骄阳', 'heat', '🌋', '骰点 -4；每经过一格，体力与心情各 -3。', 1, [1], '标准模式单次行动每项最多扣 18；挑战模式不设上限。两档均为低概率极端天气。'),
  weather('breeze', '微风', 'wind', '🍃', '每件受潮道具有 50% 概率被吹干。', 5, [0, 1, 2, 3]),
  weather('drought', '干旱', 'wind', '🏜️', '所有受潮道具必定被晒干。', 3, [1, 2]),
  weather('gale', '狂风', 'wind', '💨', '行进滑移 -1 格；纸质道具有 10% 概率丢失。', 4, [0, 1, 2, 3]),
  weather('sand', '扬沙', 'wind', '🌬️', '行进滑移 -2 格；临时不期而遇的位置隐藏；纸质道具有 15% 概率丢失。', 3, [0, 1, 2, 3]),
  weather('sandstorm', '沙尘暴', 'wind', '🌪️', '行进滑移 -4 格；临时不期而遇的位置隐藏；纸质道具有 25% 概率丢失；每次行动体力与心情各 -2。', 1, [0, 1, 2, 3]),
  weather('mist', '轻雾', 'fog', '🌫️', '临时不期而遇的位置隐藏。', 4, [0, 1, 2, 3]),
  weather('fog', '浓雾', 'fog', '☁️', '临时不期而遇的位置隐藏；经过房产时有 50% 概率免租。', 3, [0, 1, 2, 3]),
  weather('haze', '霾', 'fog', '😷', '临时不期而遇的位置隐藏；心情 -6。', 2, [0, 1, 2, 3]),
  weather('acid', '蚀雨', 'disaster', '🧪', '第 22 天起可能出现。停在空地时体力 -4，当日不能建造。', 1, [0, 1, 2]),
  weather('glitch', '故障', 'disaster', '⚡', '第 22 天起可能出现。先滑移 +2 格并结算落点，再滑移 -4 格并结算落点；另从暴风雪、雷暴、沙尘暴中只抽取一种额外负面效果。', 1, [0, 1, 2, 3], '标准与挑战模式均按前后两次落点结算，但只附加一种额外负面效果。'),
  weather('paradox', '悖论', 'disaster', '🌀', '第 22 天起可能出现。全日免租，事件、道具与设施效果全部停用。', 1, [0, 1, 2, 3]),
];

export const WEATHERS: Record<string, WeatherDef> = Object.fromEntries(weatherList.map(def => [def.id, def]));

type EventChoice = EventDef['choices'][number];
function event(id: string, title: string, story: string, tone: EventDef['tone'], choices: EventChoice[]): EventDef {
  return { id, title, story, tone, choices: choices.map(choice => ({ ...choice, id: `${id}_${choice.id}` })) };
}

export const EVENTS: EventDef[] = [
  event('meteor', '流星补给', '巡航飞船捕获了一枚富含燃料晶体的流星，船员把分红送给第一位报信的人。', 'good', [{ id: 'claim', label: '领取分红', description: '获得 900 星币。', cash: 900 }]),
  event('garden', '萤光温室', '社区温室请你帮忙修复光合灯，居民以新鲜果蔬和休憩券致谢。', 'choice', [{ id: 'help', label: '帮忙修灯', description: '花费 200 星币，体力与心情各 +15。', cash: -200, stamina: 15, mood: 15 }, { id: 'pass', label: '继续赶路', description: '不发生变化。' }]),
  event('archive', '星图档案馆', '馆员发现你归还了遗失的古星图，愿意从密藏中选一份答谢。', 'choice', [{ id: 'shield', label: '领取星盾卡', description: '获得一张星盾卡。', item: 'shield' }, { id: 'cash', label: '领取酬金', description: '获得 650 星币。', cash: 650 }]),
  event('reactor', '反应堆检修', '临时停电让街区供能紊乱，维修队征集愿意垫付材料的旅客。', 'choice', [{ id: 'repair', label: '资助检修', description: '支付 450 星币，获得建筑修复包。', cash: -450, item: 'repair' }, { id: 'wait', label: '等待供电', description: '体力 -8。', stamina: -8 }]),
  event('auction', '漂流物拍卖', '海关打捞到一枚罕见百面星核骰，却无人敢确定它的来历。', 'choice', [{ id: 'buy', label: '竞拍百面骰', description: '支付 3200 星币，获得百面星核骰。', cash: -3200, item: 'dice100' }, { id: 'skip', label: '保留现金', description: '不发生变化。' }]),
  event('smuggler', '走私舱线索', '缉私队在你的货仓找到一份旧航线，你可以交出线索换取免捕凭证。', 'choice', [{ id: 'report', label: '交出线索', description: '支付整理费 300 星币，获得免捕卡。', cash: -300, item: 'arrest' }, { id: 'leave', label: '离开港口', description: '不发生变化。' }]),
  event('telescope', '天文台之夜', '少年观星团邀你讲述旅途，久违的星空让人心情舒展。', 'good', [{ id: 'share', label: '分享故事', description: '心情 +25。', mood: 25 }]),
  event('debris', '轨道碎片', '一块退役卫星碎片擦过你的补给艇，紧急转向耗费了体力。', 'bad', [{ id: 'evade', label: '紧急规避', description: '体力 -14。', stamina: -14 }]),
  event('customs', '海关补税', '税务系统追溯到一笔漏报的跨星球交易，海关要求当场补缴。', 'bad', [{ id: 'pay', label: '补缴税款', description: '支付 1100 星币。', cash: -1100 }]),
  event('inspection', '建筑安全检查', '地质传感器记录到你的一处建筑地基松动，管理局要求拆除受损楼层。', 'bad', [{ id: 'comply', label: '接受检修', description: '随机一处自己的建筑损坏 1 层。', damageBuilding: true }]),
  event('patrol', '星港巡逻', '巡逻队误把你的运输凭证认成失效件，需要进一步核查身份。', 'choice', [{ id: 'fine', label: '缴纳核验费', description: '支付 700 星币后离开。', cash: -700 }, { id: 'detain', label: '等待复核', description: '进入拘留所。', confinement: 'prison' }]),
  event('rescue', '救援信号', '山谷探险者发出求救信号，你可绕路帮忙，亦可委托专业队伍。', 'choice', [{ id: 'go', label: '亲自救援', description: '体力 -15，得到 1200 星币感谢金。', stamina: -15, cash: 1200 }, { id: 'delegate', label: '委托救援队', description: '支付 350 星币。', cash: -350 }]),
  event('lottery', '潮汐抽奖', '码头周年庆抽奖箱亮起你的号码，主持人递来一张星海奖券。', 'good', [{ id: 'ticket', label: '收下奖券', description: '获得星海奖券。', item: 'lottery' }]),
  event('fortune', '占星师的祝愿', '占星师看见你的星轨与双月相合，赠给你一枚幸运星签。', 'good', [{ id: 'accept', label: '接受祝福', description: '获得幸运星签。', item: 'luck' }]),
  event('jinx', '失衡的星盘', '一台古老星盘突然倒转，短期内你的计划屡受干扰。', 'bad', [{ id: 'endure', label: '稳定星盘', description: '获得持续 3 日的霉运状态。', status: 'unluck:3' }]),
  event('rumor', '黑市流言', '商人声称掌握稀有收购契约的渠道，但要求预付保密费。', 'choice', [{ id: 'buy', label: '购买契约', description: '支付 2400 星币，获得强制收购契约。', cash: -2400, item: 'acquire' }, { id: 'ignore', label: '不理传闻', description: '不发生变化。' }]),
  event('healer', '月泉疗愈', '疗养师从月泉带回矿物水，愿意为旅人提供一次补给。', 'choice', [{ id: 'rest', label: '接受疗愈', description: '体力 +25、心情 +20。', stamina: 25, mood: 20 }, { id: 'kit', label: '带走补给', description: '获得野营休憩包。', item: 'restkit' }]),
  event('festival', '双月节庆', '广场开设夜市，商户邀请你参加点灯游行。', 'choice', [{ id: 'join', label: '参加游行', description: '心情 +30，支付 200 星币。', mood: 30, cash: -200 }, { id: 'work', label: '帮摊主看店', description: '获得 500 星币，体力 -5。', cash: 500, stamina: -5 }]),
  event('radio', '失联广播', '山地中继台向你求助，修好天线后整条谷地恢复了通信。', 'good', [{ id: 'fix', label: '完成维修', description: '获得 750 星币与 10 点心情。', cash: 750, mood: 10 }]),
  event('pirate', '星际海盗', '伪装成商船的海盗要求缴纳航道费，护航队还需片刻才能抵达。', 'choice', [{ id: 'pay', label: '支付航道费', description: '支付 900 星币。', cash: -900 }, { id: 'resist', label: '等待护航队', description: '体力 -18、心情 -8。', stamina: -18, mood: -8 }]),
  event('clinic', '急诊志愿者', '医院忙于救治一批陨石坠落伤员，你协助搬运医疗箱。', 'choice', [{ id: 'help', label: '协助救治', description: '体力 -10，获得 700 星币。', stamina: -10, cash: 700 }, { id: 'rest', label: '接受检查', description: '进入医院休养。', confinement: 'hospital' }]),
  event('blueprint', '古代蓝图', '考古队在旧矿洞找出建筑蓝图，邀请你资助复原。', 'choice', [{ id: 'sponsor', label: '资助复原', description: '支付 550 星币，获得建筑修复包。', cash: -550, item: 'repair' }, { id: 'sell', label: '转卖线索', description: '获得 400 星币。', cash: 400 }]),
  event('market', '公司分红', '你帮助星球交易所修正了一次报价延迟，交易所发来公开致谢和报酬。', 'good', [{ id: 'claim', label: '领取报酬', description: '获得 800 星币。', cash: 800 }]),
  event('dust', '沙暴余波', '沙暴把货运站的滤芯堵塞，你的补给需额外清洁。', 'bad', [{ id: 'clean', label: '清洁设备', description: '支付 450 星币，体力 -6。', cash: -450, stamina: -6 }]),
  event('scholar', '星象讲堂', '年轻学者想借你的旅行记录校对星图，并以珍贵装备相赠。', 'choice', [{ id: 'record', label: '交出记录', description: '获得十二面电子骰。', item: 'dice12' }, { id: 'lecture', label: '公开讲座', description: '获得 600 星币，心情 +10。', cash: 600, mood: 10 }]),
  event('portfee', '泊位调整', '港务局重新划分货船泊位，已入港的旅客需补齐调度费。', 'bad', [{ id: 'pay', label: '支付调度费', description: '支付 600 星币。', cash: -600 }]),
  event('relic', '遗迹守护', '巡查员在遗迹旁发现你遗失的背包，物品完好无损地归还。', 'good', [{ id: 'thanks', label: '感谢巡查员', description: '获得全效干燥剂，心情 +8。', item: 'dry', mood: 8 }]),
  event('nebula', '星云医护艇', '航路上的医护艇提供免费检查，长途旅行的疲劳因此缓解。', 'good', [{ id: 'care', label: '接受检查', description: '体力 +30。', stamina: 30 }]),
  event('aurora_film', '极光取景', '纪录片代理人在极光带搭建镜头，请你提供旅途影像；制片组愿用稿费或观影席位致谢。', 'good', [
    { id: 'fee', label: '领取影像稿费', description: '现金 +650。', cash: 650 },
    { id: 'screening', label: '参加首映会', description: '心情 +18。', mood: 18 },
  ]),
  event('orchard', '晶果园试吃', '果园正赶着采收成熟晶果，园主邀请你帮忙，或先尝一份新鲜果实。', 'choice', [
    { id: 'harvest', label: '帮忙采果', description: '体力 -8，获得星港盛宴。', stamina: -8, item: 'feast' },
    { id: 'taste', label: '免费试吃', description: '体力 +12。', stamina: 12 },
  ]),
  event('courier', '误投快件', '快递员把一件保价包裹误送到你手里；失主急着取回，也可请快递员上门处理。', 'choice', [
    { id: 'return', label: '亲自归还', description: '体力 -6，失主赠送免租卡。', stamina: -6, item: 'rent' },
    { id: 'call', label: '呼叫快递员', description: '事情妥善解决，心情 +6。', mood: 6 },
  ]),
  event('signal_fee', '信标频段维护', '通讯站紧急调整信标频段；你可以缴纳加急维护费，或自己搬动沉重天线。', 'bad', [
    { id: 'pay', label: '支付维护费', description: '现金 -350。', cash: -350 },
    { id: 'work', label: '自行校准', description: '体力 -6、心情 -5。', stamina: -6, mood: -5 },
  ]),
  event('sinkhole', '路肩塌陷', '山道旁的路肩突然下陷，车辆底盘需要保养；徒步绕行则会耗费体力。', 'bad', [
    { id: 'service', label: '支付保养费', description: '现金 -500。', cash: -500 },
    { id: 'detour', label: '徒步绕行', description: '体力 -12。', stamina: -12 },
  ]),
  event('drone', '故障送货机', '一架送货机因受潮停在路边，维修站提供两种回收报酬。', 'choice', [
    { id: 'dry', label: '出资更换滤芯', description: '现金 -300，获得全效干燥剂。', cash: -300, item: 'dry' },
    { id: 'carry', label: '搬回维修站', description: '体力 -10，获得八面电子骰。', stamina: -10, item: 'dice8' },
  ]),
  event('leasebook', '旧街租约', '档案馆找到一册旧街租约，委托你核对租户记录；也接受直接移交原件。', 'choice', [
    { id: 'sort', label: '整理资料', description: '心情 -10，获得免租卡。', mood: -10, item: 'rent' },
    { id: 'transfer', label: '移交档案', description: '现金 +250。', cash: 250 },
  ]),
  event('noise', '深夜施工', '道路施工队必须连夜加固桥面，噪声传到住处；临时旅舍仍有空房。', 'bad', [
    { id: 'hotel', label: '住临时旅舍', description: '现金 -400，心情 +8。', cash: -400, mood: 8 },
    { id: 'endure', label: '留在住处忍耐', description: '心情 -14。', mood: -14 },
  ]),
  event('pollination', '晶花授粉', '科研团队寻找志愿者为晶花授粉；完成巡园后赠送幸运星签，也可只提交观察资料。', 'choice', [
    { id: 'help', label: '巡园授粉', description: '体力 -12，获得幸运星签。', stamina: -12, item: 'luck' },
    { id: 'notes', label: '提交资料', description: '现金 +200。', cash: 200 },
  ]),
  event('survey', '地质回访', '地质队回访山谷旧址，测量许可可换取拆迁许可；你的实地记录也有报酬。', 'choice', [
    { id: 'permit', label: '购买测量许可', description: '现金 -650，获得拆迁许可。', cash: -650, item: 'demolish' },
    { id: 'record', label: '提供测量记录', description: '现金 +300。', cash: 300 },
  ]),
  event('seminar', '风险研习', '安全协会开设防护课程，正式学员可领取星盾卡；旁听席免费开放。', 'choice', [
    { id: 'enroll', label: '报名正式课程', description: '现金 -550，获得星盾卡。', cash: -550, item: 'shield' },
    { id: 'listen', label: '免费旁听', description: '心情 +10。', mood: 10 },
  ]),
  event('baggage', '超重行李', '星轨站发现你的行李超重，站员推荐折叠背包；自己搬运也能登车。', 'choice', [
    { id: 'bag', label: '购买折叠背包', description: '现金 -950，获得折叠背包。', cash: -950, item: 'bag' },
    { id: 'carry', label: '自己搬运', description: '体力 -8。', stamina: -8 },
  ]),
  event('tide_lock', '潮闸检修', '潮闸突发检修，通行艇只能绕远航道；不付改道费就要在停车区等待三次行动。', 'bad', [
    { id: 'detour', label: '支付改道费', description: '现金 -300。', cash: -300 },
    { id: 'wait', label: '停车区等候', description: '进入停车区，暂停 3 次行动。', confinement: 'parking' },
  ]),
  event('comet_watch', '彗星观测', '你帮天文台守候整夜，终于拍到穿过星云的彗星；兴奋之余也有些疲惫。', 'good', [
    { id: 'watch', label: '分享观测记录', description: '心情 +22，体力 -4。', mood: 22, stamina: -4 },
  ]),
  event('counterfeit', '假币核查', '交易所发现一张流通假币需要追溯，你可支付加急核验费，或留在拘留所等待三次行动的复核。', 'bad', [
    { id: 'pay', label: '支付加急核验费', description: '现金 -600。', cash: -600 },
    { id: 'detain', label: '等待复核', description: '进入拘留所，暂停 3 次行动；免捕卡可抵消。', confinement: 'prison' },
  ]),
  event('solar_grant', '太阳帆资助', '太阳帆基金完成募资，向行旅者发放补助，也提供折价的天气控制器。', 'good', [
    { id: 'grant', label: '领取资助', description: '现金 +1100。', cash: 1100 },
    { id: 'device', label: '购买折价设备', description: '现金 -1800，获得天气控制器。', cash: -1800, item: 'weather' },
  ]),
  event('beacon_lab', '信标校准实验', '导航实验室正在校准代理人信标的步进模块。研究员请你协助测试，愿用一枚完成调校的控骰器作为谢礼。', 'choice', [
    { id: 'assist', label: '协助校准', description: '消耗 8 点体力，获得控骰器。', stamina: -8, item: 'controller' },
    { id: 'observe', label: '旁观实验', description: '心情 +6。', mood: 6 },
  ]),
  event('route_workshop', '旧港精密工坊', '旧港的修理师用回收元件装好一枚控骰器，只差一笔封装材料费。你也可以帮他整理零件，换取修理报酬。', 'choice', [
    { id: 'buy', label: '支付材料费', description: '支付 900 棱镜币，获得控骰器。', cash: -900, item: 'controller' },
    { id: 'sort', label: '整理零件', description: '消耗 4 点体力，获得 250 棱镜币。', stamina: -4, cash: 250 },
    { id: 'leave', label: '暂不交易', description: '保留现有物资，继续赶路。' },
  ]),
];

export const AI_PRESETS: PlayerConfig[] = [
  { name: '林岚', color: '#4caac2', shape: 'circle', ai: true, personality: 'cautious' },
  { name: '苏澄', color: '#72b98b', shape: 'hexagon', ai: true, personality: 'cautious' },
  { name: '顾星河', color: '#e6a052', shape: 'diamond', ai: true, personality: 'balanced' },
  { name: '许遥', color: '#8b83cb', shape: 'triangle', ai: true, personality: 'balanced' },
  { name: '程焰', color: '#dd6d67', shape: 'hexagon', ai: true, personality: 'aggressive' },
  { name: '叶逐风', color: '#ca78a8', shape: 'diamond', ai: true, personality: 'aggressive' },
];

export const INITIAL_STOCKS: Stock[] = [
  { id: 'aurora', name: '极光能源', code: 'AUR', price: 78, history: [78], change: 0, sector: '清洁能源' },
  { id: 'tide', name: '双潮航运', code: 'TID', price: 112, history: [112], change: 0, sector: '星际物流' },
  { id: 'crystal', name: '晶谷通信', code: 'CRY', price: 56, history: [56], change: 0, sector: '量子通信' },
  { id: 'lumen', name: '流明生科', code: 'LUM', price: 136, history: [136], change: 0, sector: '医疗科技' },
];
