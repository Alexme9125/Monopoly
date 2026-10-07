import type { MapData, MapId, MapNode, TileKind } from './types';
import { FACILITY_LAYOUT_SWAPS } from './facilityLayout';

type Point = readonly [number, number];
type MapTheme = { id: MapId; name: string; subtitle: string; description: string; accent: string; districts: readonly string[]; seed: number };

const X = Array.from({ length: 17 }, (_, i) => 220 + i * 68);
const Y = Array.from({ length: 11 }, (_, i) => 150 + i * 67);

function horizontal(x0: number, x1: number, y: number): Point[] {
  const direction = x0 <= x1 ? 1 : -1;
  const from = Math.round((x0 - 220) / 68);
  const to = Math.round((x1 - 220) / 68);
  const result: Point[] = [];
  for (let i = from; direction > 0 ? i <= to : i >= to; i += direction) result.push([X[i], y]);
  return result;
}

function vertical(x: number, y0: number, y1: number): Point[] {
  const direction = y0 <= y1 ? 1 : -1;
  const from = Math.round((y0 - 150) / 67);
  const to = Math.round((y1 - 150) / 67);
  const result: Point[] = [];
  for (let i = from; direction > 0 ? i <= to : i >= to; i += direction) result.push([x, Y[i]]);
  return result;
}

function rectangle(left: number, right: number, top: number, bottom: number): Point[] {
  return [
    ...horizontal(left, right, top),
    ...vertical(right, top, bottom).slice(1),
    ...horizontal(right, left, bottom).slice(1),
    ...vertical(left, bottom, top).slice(1),
  ];
}

function rounded(value: number): number { return Math.round(value * 100) / 100; }

function makeGraph(paths: { points: Point[]; loop?: boolean }[]): MapNode[] {
  const nodes: MapNode[] = [];
  const index = new Map<string, number>();
  const add = (point: Point): number => {
    const key = `${rounded(point[0])},${rounded(point[1])}`;
    const old = index.get(key);
    if (old !== undefined) return old;
    const id = nodes.length;
    index.set(key, id);
    nodes.push({ id, x: rounded(point[0]), y: rounded(point[1]), name: '', kind: 'empty', neighbors: [] });
    return id;
  };
  for (const path of paths) {
    const ids = path.points.map(add);
    const limit = path.loop ? ids.length : ids.length - 1;
    for (let i = 0; i < limit; i++) {
      const a = ids[i];
      const b = ids[(i + 1) % ids.length];
      if (a === b) continue;
      if (!nodes[a].neighbors.includes(b)) nodes[a].neighbors.push(b);
      if (!nodes[b].neighbors.includes(a)) nodes[b].neighbors.push(a);
    }
  }
  return nodes;
}

function sampledLoop(corners: readonly Point[], segments: readonly number[]): Point[] {
  const points: Point[] = [];
  for (let edge = 0; edge < corners.length; edge++) {
    const [x0, y0] = corners[edge];
    const [x1, y1] = corners[(edge + 1) % corners.length];
    for (let step = 0; step < segments[edge]; step++) {
      const ratio = step / segments[edge];
      points.push([rounded(x0 + (x1 - x0) * ratio), rounded(y0 + (y1 - y0) * ratio)]);
    }
  }
  return points;
}

const outer = rectangle(X[0], X[16], Y[0], Y[10]);
const lakePaths = [
  { points: outer, loop: true },
  { points: rectangle(X[6], X[14], Y[2], Y[8]), loop: true },
  { points: vertical(X[6], Y[0], Y[2]) },
  { points: vertical(X[14], Y[0], Y[2]) },
  { points: vertical(X[6], Y[8], Y[10]) },
  { points: vertical(X[14], Y[8], Y[10]) },
  { points: horizontal(X[14], X[16], Y[2]) },
  { points: horizontal(X[14], X[16], Y[8]) },
];

const coastPaths = [
  { points: sampledLoop([[750, 490], [160, 490], [160, 150], [750, 150]], [11, 7, 11, 7]), loop: true },
  { points: sampledLoop([[750, 490], [1340, 490], [1340, 830], [750, 830]], [11, 7, 11, 7]), loop: true },
];

const valleyOuter: Point[] = [
  [150, 90], [600, 90], [600, 30], [900, 30], [900, 90], [1350, 90],
  [1350, 290], [1420, 290], [1420, 710], [1350, 710], [1350, 910],
  [900, 910], [900, 970], [600, 970], [600, 910], [150, 910],
  [150, 710], [80, 710], [80, 290], [150, 290],
];
const valleyOuterSegments = [5, 1, 3, 1, 5, 2, 1, 5, 1, 2, 5, 1, 3, 1, 5, 2, 1, 5, 1, 2];
const valleyPaths: { points: Point[]; loop?: boolean }[] = [
  { points: sampledLoop(valleyOuter, valleyOuterSegments), loop: true },
  { points: sampledLoop([[360, 270], [600, 270], [600, 630], [360, 630]], [4, 6, 4, 6]), loop: true },
  { points: sampledLoop([[900, 366], [1140, 366], [1140, 730], [900, 730]], [4, 6, 4, 7]), loop: true },
  { points: [[420, 90], [420, 150], [420, 210], [420, 270]] },
  { points: [[1080, 730], [1080, 790], [1080, 850], [1080, 910]] },
  { points: [[600, 510], [675, 510], [750, 510], [750, 574], [825, 574], [900, 574]] },
];

const sunderedPaths: { points: Point[]; loop?: boolean }[] = [
  { points: sampledLoop([[180, 560], [600, 560], [600, 680], [780, 680], [780, 860], [180, 860]], [7, 2, 3, 3, 10, 5]), loop: true },
  { points: sampledLoop([[180, 140], [780, 140], [780, 320], [600, 320], [600, 440], [180, 440]], [10, 3, 3, 2, 7, 5]), loop: true },
  { points: sampledLoop([[1020, 140], [1320, 140], [1320, 380], [1200, 380], [1200, 620], [1320, 620], [1320, 860], [1020, 860]], [5, 4, 2, 4, 2, 4, 5, 12]), loop: true },
  { points: [[420, 440], [420, 500], [420, 560]] },
  { points: [[780, 260], [840, 260], [900, 260], [960, 260], [1020, 260]] },
  { points: [[780, 740], [840, 740], [900, 740], [960, 740], [1020, 740]] },
];

const forestPaths = [
  { points: sampledLoop([[180, 140], [1320, 140], [1320, 860], [180, 860]], [20, 12, 20, 12]), loop: true },
];

const starSandsPaths: { points: Point[]; loop?: boolean }[] = [
  { points: sampledLoop([[180, 200], [600, 200], [600, 800], [180, 800]], [7, 10, 7, 10]), loop: true },
  { points: sampledLoop([[900, 200], [1320, 200], [1320, 800], [900, 800]], [7, 10, 7, 10]), loop: true },
  { points: [[600, 380], [660, 380], [720, 380], [780, 380], [840, 380], [900, 380]] },
  { points: [[600, 620], [660, 620], [720, 620], [780, 620], [840, 620], [900, 620]] },
];

function orthogonalPath(corners: readonly Point[], loop = false): Point[] {
  const points: Point[] = [];
  const count = loop ? corners.length : corners.length - 1;
  for (let index = 0; index < count; index++) {
    const from = corners[index], to = corners[(index + 1) % corners.length];
    const dx = to[0] - from[0], dy = to[1] - from[1];
    if ((dx === 0) === (dy === 0) || (Math.abs(dx) + Math.abs(dy)) % 60 !== 0) throw new Error('Invalid orthogonal map segment');
    const steps = (Math.abs(dx) + Math.abs(dy)) / 60;
    for (let step = 0; step < steps; step++) points.push([from[0] + dx * step / steps, from[1] + dy * step / steps]);
  }
  if (!loop) points.push(corners[corners.length - 1]);
  return points;
}

const ashCanyonPaths: { points: Point[]; loop?: boolean }[] = [
  { points: orthogonalPath([[180, 200], [600, 200], [600, 140], [1020, 140], [1020, 260], [1320, 260],
    [1320, 800], [900, 800], [900, 860], [480, 860], [480, 740], [180, 740]], true), loop: true },
  { points: orthogonalPath([[180, 500], [420, 500], [420, 440], [660, 440], [660, 560],
    [1080, 560], [1080, 500], [1320, 500]]) },
];

const peachHavenPaths: { points: Point[]; loop?: boolean }[] = [
  { points: orthogonalPath([[180, 320], [420, 320], [420, 680], [180, 680]], true), loop: true },
  { points: orthogonalPath([[660, 140], [1320, 140], [1320, 860], [660, 860]], true), loop: true },
  { points: orthogonalPath([[420, 320], [660, 320]]) },
  { points: orthogonalPath([[420, 680], [660, 680]]) },
  { points: orthogonalPath([[660, 500], [1320, 500]]) },
];

// Two concentric square streets meet at their four side midpoints. Each link
// adds two internal nodes: 56 outer + 32 inner + 8 axial = 96 road nodes.
const grandCityPaths: { points: Point[]; loop?: boolean }[] = [
  { points: sampledLoop([[330, 80], [1170, 80], [1170, 920], [330, 920]], [14, 14, 14, 14]), loop: true },
  { points: sampledLoop([[510, 260], [990, 260], [990, 740], [510, 740]], [8, 8, 8, 8]), loop: true },
  { points: [[750, 80], [750, 140], [750, 200], [750, 260]] },
  { points: [[1170, 500], [1110, 500], [1050, 500], [990, 500]] },
  { points: [[750, 920], [750, 860], [750, 800], [750, 740]] },
  { points: [[330, 500], [390, 500], [450, 500], [510, 500]] },
];

const hushedValleyPaths: { points: Point[]; loop?: boolean }[] = [
  { points: orthogonalPath([[180, 140], [660, 140], [660, 80], [1140, 80],
    [1140, 260], [1320, 260], [1320, 800], [960, 800], [960, 920],
    [540, 920], [540, 800], [180, 800]], true), loop: true },
  { points: orthogonalPath([[180, 440], [420, 440], [420, 380], [660, 380],
    [660, 620], [960, 620], [960, 500], [1320, 500]]) },
];

const themes: Record<MapId, MapTheme> = {
  lake: { id: 'lake', name: '棱镜湖畔', subtitle: '湖光环路', description: '环湖道路与外城道路由多条短桥相接，投资者在水岸与城郊之间穿行。', accent: '#58b7c4', districts: ['芦湾', '星汀', '镜湖', '银栈'], seed: 241 },
  coast: { id: 'coast', name: '原色海岸', subtitle: '斜向双湾八字路', description: '西北与东南两座矩形海湾只在潮汐广场交会，形成清晰的斜向八字道路。', accent: '#f1a45d', districts: ['晨潮', '海镜', '暮帆', '珊瑚'], seed: 593 },
  valley: { id: 'valley', name: '怡人山谷', subtitle: '三环阶梯山道', description: '外缘阶梯山道环抱两片错层谷地，林间支路和折线栈桥把三环相接。', accent: '#a994d5', districts: ['云岚', '松脊', '晶谷', '月麓'], seed: 887 },
  sundered: { id: 'sundered', name: '破碎山道', subtitle: '林谷·断桥·高脊', description: '松林、湖泊与裂谷桥连接风雪高脊；旧屋、废弃矿道与气象站留下远行者的痕迹。', accent: '#8796aa', districts: ['漫行高原', '望穹高脊', '末灯林地', '回声裂谷'], seed: 1217 },
  forest: { id: 'forest', name: '始初森林', subtitle: '古木环道', description: '古木围成安静的环林道路，四方林地由星轨站均匀串联。', accent: '#69a77d', districts: ['初芽', '冠庭', '蕨溪', '眠根'], seed: 1429 },
  starSands: { id: 'starSands', name: '星砂荒滩', subtitle: '双环沙洲', description: '两片星砂环道由南北两条连接道相连，干燥的风沿沙洲穿行。', accent: '#d5a45e', districts: ['灼湾', '星砾', '风蚀', '盐汀'], seed: 1867 },
  ashCanyon: { id: 'ashCanyon', name: '灰烬峡谷', subtitle: '折阶岩台 · 峡谷横桥', description: '焦木与新绿铺展在峡谷两岸，吊桥、石堤和旧矿道连接错层岩台。', accent: '#866044', districts: ['余烬台', '金脉崖', '复绿湾', '回音涧'], seed: 2107 },
  peachHaven: { id: 'peachHaven', name: '远境桃源', subtitle: '缘溪入境 · 阡陌田园', description: '沿桃溪穿过狭口，桑竹、良田、水池与村舍在开阔的田园环路间相望。', accent: '#486f61', districts: ['桃溪', '桑畴', '问津', '南陌'], seed: 2203 },
  hushedValley: { id: 'hushedValley', name: '寂静河谷', subtitle: '叠瀑河槽 · 五层地标', description: '峭壁与森林围住静流河槽，瀑布、岩棚和洞穴间的临时据点沿环路与谷底横道相接。', accent: '#527b78', districts: ['雾杉', '叠瀑', '静流', '回声'], seed: 2309 },
  grandCity: { id: 'grandCity', name: '伟岸之城', subtitle: '双环都会 · 四轴相连', description: '外城与内城两道同心方环由四条正交大道连接，四片城区沿轴路相互往来。', accent: '#55697b', districts: ['云阶', '曜庭', '环翠', '天际'], seed: 2411 },
};

const essentialFacilities: TileKind[] = [
  'hospital', 'prison', 'sanatorium', 'parking',
  'station', 'station', 'station', 'shop', 'shop', 'shop', 'exchange', 'exchange',
  'power', 'power', 'water', 'water', 'telecom', 'telecom', 'casino', 'casino',
];
const extraFacilities: TileKind[] = ['station', 'shop', 'exchange', 'power', 'water', 'telecom', 'casino'];
const facilityNames: Record<string, string> = {
  hospital: '医护站', prison: '拘留所', sanatorium: '疗养院', parking: '停车场',
  station: '星轨站', shop: '百货舱', exchange: '证券所', power: '能源塔', water: '净水厂',
  telecom: '通讯台', casino: '星筹馆',
};
const scenicNames = ['晴波', '萤岸', '银沙', '月桥', '翠岚', '远帆', '星石', '晨曦', '琉光', '云径'];
// Exchange station sites with existing public facilities; road and land nodes stay fixed.
const stationFacilitySwaps: Partial<Record<MapId, readonly (readonly [number, number, TileKind])[]>> = {
  lake: [[4, 47, 'sanatorium'], [33, 26, 'exchange'], [57, 77, 'casino']],
  coast: [[43, 14, 'shop'], [68, 33, 'sanatorium'], [44, 45, 'casino'], [54, 59, 'casino']],
  valley: [[20, 12, 'exchange'], [22, 88, 'casino']],
  sundered: [[14, 6, 'shop'], [47, 31, 'exchange'], [70, 60, 'exchange']],
};

function spreadStations(nodes: MapNode[], theme: MapTheme) {
  for (const [stationId, destinationId, previousKind] of stationFacilitySwaps[theme.id] ?? []) {
    const station = nodes[stationId], destination = nodes[destinationId];
    if (station.kind !== 'station' || destination.kind !== previousKind) {
      throw new Error(`Invalid ${theme.id} station layout at ${stationId}/${destinationId}`);
    }
    station.kind = previousKind;
    destination.kind = 'station';
    for (const node of [station, destination]) {
      const districtIndex = (node.x >= 750 ? 1 : 0) + (node.y >= 485 ? 2 : 0);
      node.name = `${theme.districts[districtIndex]}·${facilityNames[node.kind]}${node.id}号`;
      if (['hospital', 'prison', 'sanatorium', 'parking'].includes(node.kind)) delete node.price;
      else node.price = Math.min(4000, 800 + districtIndex * 480 + (node.id % 7) * 260 + (node.kind === 'station' ? 450 : 0));
    }
  }
}

function spreadFacilities(nodes: MapNode[], theme: MapTheme) {
  for (const [facilityId, roadsideId] of FACILITY_LAYOUT_SWAPS[theme.id] ?? []) {
    const facility = nodes[facilityId], roadside = nodes[roadsideId];
    if (!facility || !roadside || !['empty', 'coin', 'event'].includes(roadside.kind)
      || !['hospital', 'prison', 'sanatorium', 'parking', 'shop', 'exchange', 'casino', 'power', 'water', 'telecom'].includes(facility.kind)) {
      throw new Error(`Invalid ${theme.id} facility layout at ${facilityId}/${roadsideId}`);
    }
    const previousKind = facility.kind;
    const previousPrice = facility.price;
    facility.kind = roadside.kind;
    facility.name = `${facility.district}·${scenicNames[facility.id % scenicNames.length]}${facility.kind === 'empty' ? '空地' : facility.kind === 'coin' ? '星币驿' : '奇遇角'}${facility.id}号`;
    delete facility.price;
    roadside.kind = previousKind;
    roadside.name = `${roadside.district}·${facilityNames[previousKind]}${roadside.id}号`;
    if (previousPrice === undefined) delete roadside.price;
    else roadside.price = previousPrice;
  }
}

function shuffled(ids: number[], seed: number): number[] {
  const result = [...ids];
  let state = seed >>> 0;
  for (let i = result.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function populate(theme: MapTheme, paths: { points: Point[]; loop?: boolean }[]): MapData {
  const nodes = makeGraph(paths);
  const count = nodes.length;
  const landCount = Math.round(count * 0.45);
  const facilityCount = Math.round(count * 0.30);
  const shuffledIds = shuffled(Array.from({ length: count - 1 }, (_, i) => i + 1), theme.seed);
  const facilityIds = new Set(shuffledIds.slice(0, facilityCount));
  const landIds = new Set(shuffledIds.slice(facilityCount, facilityCount + landCount));
  const facilityKinds = [...essentialFacilities];
  while (facilityKinds.length < facilityCount) facilityKinds.push(extraFacilities[(facilityKinds.length - essentialFacilities.length) % extraFacilities.length]);
  const variedKinds = shuffled(facilityKinds.map((_, i) => i), theme.seed + 77).map(i => facilityKinds[i]);
  let facilityIndex = 0;
  let otherIndex = 0;
  for (const node of nodes) {
    const districtIndex = (node.x >= 750 ? 1 : 0) + (node.y >= 485 ? 2 : 0);
    const district = theme.districts[districtIndex];
    node.district = district;
    if (node.id === 0) {
      node.kind = 'start';
      node.name = `${district}·星港起点`;
    } else if (facilityIds.has(node.id)) {
      const kind = variedKinds[facilityIndex++];
      node.kind = kind;
      node.name = `${district}·${facilityNames[kind]}${node.id}号`;
      if (!['hospital', 'prison', 'sanatorium', 'parking'].includes(kind)) {
        node.price = Math.min(4000, 800 + districtIndex * 480 + (node.id % 7) * 260 + (kind === 'station' ? 450 : 0));
      }
    } else if (landIds.has(node.id)) {
      node.kind = 'land';
      node.name = `${district}·${scenicNames[node.id % scenicNames.length]}${node.id}号地`;
      node.price = Math.min(4000, 800 + districtIndex * 530 + (node.id % 8) * 210);
    } else {
      node.kind = (['empty', 'coin', 'event'] as TileKind[])[otherIndex++ % 3];
      const suffix = node.kind === 'empty' ? '空地' : node.kind === 'coin' ? '星币驿' : '奇遇角';
      node.name = `${district}·${scenicNames[node.id % scenicNames.length]}${suffix}${node.id}号`;
    }
    node.neighbors.sort((a, b) => a - b);
  }
  spreadStations(nodes, theme);
  spreadFacilities(nodes, theme);
  return { id: theme.id, name: theme.name, subtitle: theme.subtitle, description: theme.description, width: 1500, height: 1000, nodes, accent: theme.accent };
}

const forestFacilities: Record<number, TileKind> = {
  2: 'shop', 5: 'power', 8: 'station', 11: 'exchange', 14: 'water', 17: 'hospital', 20: 'casino',
  24: 'station', 27: 'shop', 30: 'telecom', 33: 'parking', 36: 'power', 40: 'station',
  43: 'exchange', 46: 'water', 49: 'sanatorium', 52: 'shop', 56: 'station',
  58: 'telecom', 60: 'casino', 62: 'prison',
};

const starSandsFacilities: Record<number, TileKind> = {
  1: 'shop', 4: 'station', 7: 'exchange', 12: 'power', 15: 'hospital', 17: 'water',
  21: 'station', 24: 'shop', 27: 'casino', 30: 'telecom', 33: 'sanatorium',
  35: 'shop', 38: 'station', 41: 'power', 44: 'exchange', 47: 'parking', 50: 'water',
  53: 'prison', 55: 'station', 58: 'shop', 62: 'casino', 66: 'telecom',
};

const ashCanyonFacilities: Record<number, TileKind> = {
  3: 'prison', 7: 'power', 9: 'station', 14: 'hospital', 16: 'shop', 18: 'sanatorium', 22: 'casino',
  25: 'station', 27: 'water', 32: 'telecom', 36: 'power', 39: 'station', 45: 'shop',
  48: 'exchange', 52: 'water', 55: 'station', 58: 'casino', 60: 'parking',
  64: 'shop', 67: 'telecom', 72: 'station', 76: 'exchange', 80: 'shop',
};

const peachHavenFacilities: Record<number, TileKind> = {
  2: 'shop', 5: 'casino', 8: 'shop', 11: 'power', 13: 'station', 19: 'exchange',
  20: 'water', 22: 'hospital', 24: 'shop', 28: 'station', 31: 'telecom',
  34: 'exchange', 41: 'station', 46: 'water', 48: 'shop', 51: 'station',
  55: 'prison', 59: 'parking', 61: 'station', 72: 'telecom', 74: 'sanatorium',
  77: 'casino', 81: 'power',
};

const grandCityFacilities: Record<number, TileKind> = {
  4: 'telecom', 9: 'shop', 12: 'station', 15: 'casino',
  22: 'power', 24: 'water', 30: 'station', 32: 'telecom',
  43: 'casino', 45: 'station', 47: 'shop', 50: 'water',
  52: 'power', 55: 'station', 57: 'station', 63: 'sanatorium',
  65: 'prison', 73: 'station', 80: 'parking', 83: 'hospital',
  86: 'shop', 89: 'exchange', 90: 'exchange', 93: 'shop', 94: 'exchange',
};

const hushedValleyFacilities: Record<number, TileKind> = {
  1: 'station', 3: 'prison', 11: 'telecom', 13: 'shop', 15: 'station',
  18: 'water', 23: 'parking', 26: 'sanatorium', 30: 'shop', 33: 'station',
  44: 'telecom', 47: 'shop', 49: 'station', 51: 'water', 57: 'hospital',
  65: 'shop', 69: 'power', 71: 'casino', 73: 'exchange', 78: 'station',
  82: 'power', 85: 'casino', 87: 'exchange',
};

// Bridge decks and both junctions remain clear for the river and route signs.
const hushedReservedLand = new Set([27, 28, 29, 61, 75, 76, 77, 88, 89, 90]);
const hushedFacilityNames: Partial<Record<TileKind, string>> = {
  station: '星轨驿站', shop: '无人补给站', exchange: '自动交易终端', casino: '星运补给机',
  hospital: '应急医护舱', sanatorium: '静养营地', prison: '隔离管制舱', parking: '临时停泊点',
};

const ashCanyonReservedLand = new Set([10, 11, 12, 26, 40, 41, 42, 57, 73, 74, 75]);
const peachHavenReservedLand = new Set([4, 10, 37, 57, 60, 63, 66, 67, 68, 69, 70, 71]);

function populateNew(theme: MapTheme, paths: { points: Point[]; loop?: boolean }[],
  facilities: Record<number, TileKind>, landCount: number, loopCount: number, reservedLand?: ReadonlySet<number>): MapData {
  const nodes = makeGraph(paths);
  const facilityIds = new Set(Object.keys(facilities).map(Number));
  if (facilityIds.has(0) || [...facilityIds].some(id => id >= nodes.length)) throw new Error(`Invalid ${theme.id} facility layout`);
  const candidateCount = reservedLand ? nodes.length : loopCount;
  const candidates = Array.from({ length: candidateCount - 1 }, (_, index) => index + 1)
    .filter(id => !facilityIds.has(id) && !reservedLand?.has(id));
  const landIds = new Set(shuffled(candidates, theme.seed).slice(0, landCount));
  if (landIds.size !== landCount) throw new Error(`Invalid ${theme.id} land layout`);
  let otherIndex = 0;
  for (const node of nodes) {
    const districtIndex = (node.x >= 750 ? 1 : 0) + (node.y >= 500 ? 2 : 0);
    const district = theme.districts[districtIndex];
    node.district = district;
    if (node.id === 0) {
      node.kind = 'start'; node.name = `${district}·星港起点`;
    } else if (facilityIds.has(node.id)) {
      const kind = facilities[node.id];
      node.kind = kind;
      node.name = `${district}·${facilityNames[kind]}${node.id}号`;
      if (!['hospital', 'prison', 'sanatorium', 'parking'].includes(kind)) {
        node.price = Math.min(4000, 800 + districtIndex * 480 + (node.id % 7) * 260 + (kind === 'station' ? 450 : 0));
      }
    } else if (landIds.has(node.id)) {
      node.kind = 'land';
      node.name = `${district}·${scenicNames[node.id % scenicNames.length]}${node.id}号地`;
      node.price = theme.id === 'forest'
        ? 8000 + districtIndex * 2000 + (node.id % 5) * 500
        : Math.min(4000, 800 + districtIndex * 530 + (node.id % 8) * 210);
    } else {
      node.kind = (['empty', 'coin', 'event'] as TileKind[])[otherIndex++ % 3];
      const suffix = node.kind === 'empty' ? '空地' : node.kind === 'coin' ? '星币驿' : '奇遇角';
      node.name = `${district}·${scenicNames[node.id % scenicNames.length]}${suffix}${node.id}号`;
    }
    node.neighbors.sort((a, b) => a - b);
  }
  return { id: theme.id, name: theme.name, subtitle: theme.subtitle, description: theme.description,
    width: 1500, height: 1000, nodes, accent: theme.accent };
}

function populateGrandCity(): MapData {
  const theme = themes.grandCity;
  const nodes = makeGraph(grandCityPaths);
  if (nodes.length !== 96 || Object.keys(grandCityFacilities).length !== 25) throw new Error('Invalid grand city road or facility count');
  const facilityIds = new Set(Object.keys(grandCityFacilities).map(Number));
  // Reserve roadside scenery in every district while spreading all four tower
  // heights through the city. The level quotas sum to exactly 15/15/10/10.
  const landPerDistrict = [10, 13, 13, 14] as const;
  const levelsPerDistrict = [
    [3, 3, 2, 2], [4, 4, 2, 3], [4, 4, 3, 2], [4, 4, 3, 3],
  ] as const;
  const districtOf = (node: MapNode) => (node.x >= 750 ? 1 : 0) + (node.y >= 500 ? 2 : 0);
  const prefabLevels = new Map<number, number>();
  for (let district = 0; district < 4; district++) {
    const candidates = nodes.filter(node => node.id !== 0 && node.neighbors.length === 2
      && !facilityIds.has(node.id) && districtOf(node) === district)
      .map(node => node.id);
    const chosen = shuffled(candidates, theme.seed + district * 101).slice(0, landPerDistrict[district]);
    if (chosen.length !== landPerDistrict[district]) throw new Error(`Invalid grand city land district ${district}`);
    const levels = levelsPerDistrict[district].flatMap((count, index) => Array<number>(count).fill(index + 1));
    shuffled(chosen, theme.seed + district * 113 + 29).forEach((id, index) => prefabLevels.set(id, levels[index]));
  }
  if (prefabLevels.size !== 50) throw new Error('Invalid grand city prefab count');
  let otherIndex = 0;
  for (const node of nodes) {
    const districtIndex = districtOf(node);
    const district = theme.districts[districtIndex];
    node.district = district;
    if (node.id === 0) {
      node.kind = 'start'; node.name = `${district}·星港起点`;
    } else if (facilityIds.has(node.id)) {
      const kind = grandCityFacilities[node.id];
      node.kind = kind;
      node.name = `${district}·${facilityNames[kind]}${node.id}号`;
      if (!['hospital', 'prison', 'sanatorium', 'parking'].includes(kind)) {
        node.price = Math.min(4000, 800 + districtIndex * 480 + (node.id % 7) * 260 + (kind === 'station' ? 450 : 0));
      }
    } else if (prefabLevels.has(node.id)) {
      node.kind = 'land';
      node.prefabLevel = prefabLevels.get(node.id);
      node.name = `${district}·${scenicNames[node.id % scenicNames.length]}${node.id}号地`;
      node.price = Math.min(4000, 800 + districtIndex * 530 + (node.id % 8) * 210);
    } else {
      node.kind = (['empty', 'coin', 'event'] as TileKind[])[otherIndex++ % 3];
      const suffix = node.kind === 'empty' ? '空地' : node.kind === 'coin' ? '星币驿' : '奇遇角';
      node.name = `${district}·${scenicNames[node.id % scenicNames.length]}${suffix}${node.id}号`;
    }
    node.neighbors.sort((a, b) => a - b);
  }
  // Convert the selected road spaces only after the other kinds are assigned;
  // otherwise the remaining coin and event positions would shift.
  const vacantLandByDistrict: Record<string, number[]> = {
    云阶: [3, 59], 曜庭: [20, 67], 环翠: [41, 77], 天际: [33, 72],
  };
  for (const [district, ids] of Object.entries(vacantLandByDistrict)) for (const id of ids) {
    const node = nodes[id];
    if (node.district !== district || !['empty', 'coin', 'event'].includes(node.kind)) {
      throw new Error(`Invalid grand city vacant land ${id}`);
    }
    const districtIndex = theme.districts.indexOf(district);
    node.kind = 'land';
    node.name = `${district}·${scenicNames[id % scenicNames.length]}${id}号地`;
    node.price = Math.min(4000, 800 + districtIndex * 530 + (id % 8) * 210);
  }
  return { id: theme.id, name: theme.name, subtitle: theme.subtitle, description: theme.description,
    width: 1500, height: 1000, nodes, accent: theme.accent };
}

function populateHushedValley(): MapData {
  const map = populateNew(themes.hushedValley, hushedValleyPaths, hushedValleyFacilities, 40, 91, hushedReservedLand);
  if (map.nodes.length !== 91 || Object.keys(hushedValleyFacilities).length !== 23) throw new Error('Invalid hushed valley layout');
  for (const node of map.nodes) {
    if (hushedReservedLand.has(node.id) && (node.kind === 'land' || hushedValleyFacilities[node.id])) {
      throw new Error(`Hushed valley bridge or junction ${node.id} must be clear`);
    }
    const facilityName = hushedFacilityNames[node.kind];
    if (facilityName) node.name = `${node.district}·${facilityName}${node.id}号`;
  }
  return map;
}

export const MAPS: Record<MapId, MapData> = {
  lake: populate(themes.lake, lakePaths),
  coast: populate(themes.coast, coastPaths),
  valley: populate(themes.valley, valleyPaths),
  sundered: populate(themes.sundered, sunderedPaths),
  forest: populateNew(themes.forest, forestPaths, forestFacilities, 29, 64),
  starSands: populateNew(themes.starSands, starSandsPaths, starSandsFacilities, 34, 68),
  ashCanyon: populateNew(themes.ashCanyon, ashCanyonPaths, ashCanyonFacilities, 37, 62, ashCanyonReservedLand),
  peachHaven: populateNew(themes.peachHaven, peachHavenPaths, peachHavenFacilities, 36, 66, peachHavenReservedLand),
  hushedValley: populateHushedValley(),
  grandCity: populateGrandCity(),
};

for (const [id, name] of [
  [6, '末灯林地站6号'], [16, '末灯林地站16号'], [31, '漫行高原站31号'],
  [60, '望穹高脊站60号'], [78, '回声裂谷站78号'],
] as const) {
  if (MAPS.sundered.nodes[id].kind !== 'station') throw new Error(`Invalid sundered station name at ${id}`);
  MAPS.sundered.nodes[id].name = name;
}

// The four arms of the southeast lake junction need room for five roadside
// lots. Moving only their intermediate nodes preserves IDs and adjacency.
Object.assign(MAPS.lake.nodes[65], { y: 605 });
Object.assign(MAPS.lake.nodes[67], { x: 1090 });
Object.assign(MAPS.lake.nodes[83], { y: 767 });
Object.assign(MAPS.lake.nodes[85], { x: 1254 });
