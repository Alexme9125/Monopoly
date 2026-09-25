import type { MapData, MapId, MapNode, TileKind } from './types';

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

const themes: Record<MapId, MapTheme> = {
  lake: { id: 'lake', name: '棱镜湖畔', subtitle: '湖光环路', description: '环湖道路与外城道路由多条短桥相接，投资者在水岸与城郊之间穿行。', accent: '#58b7c4', districts: ['芦湾', '星汀', '镜湖', '银栈'], seed: 241 },
  coast: { id: 'coast', name: '原色海岸', subtitle: '斜向双湾八字路', description: '西北与东南两座矩形海湾只在潮汐广场交会，形成清晰的斜向八字道路。', accent: '#f1a45d', districts: ['晨潮', '海镜', '暮帆', '珊瑚'], seed: 593 },
  valley: { id: 'valley', name: '怡人山谷', subtitle: '三环阶梯山道', description: '外缘阶梯山道环抱两片错层谷地，林间支路和折线栈桥把三环相接。', accent: '#a994d5', districts: ['云岚', '松脊', '晶谷', '月麓'], seed: 887 },
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
  return { id: theme.id, name: theme.name, subtitle: theme.subtitle, description: theme.description, width: 1500, height: 1000, nodes, accent: theme.accent };
}

export const MAPS: Record<MapId, MapData> = {
  lake: populate(themes.lake, lakePaths),
  coast: populate(themes.coast, coastPaths),
  valley: populate(themes.valley, valleyPaths),
};

// The four arms of the southeast lake junction need room for five roadside
// lots. Moving only their intermediate nodes preserves IDs and adjacency.
Object.assign(MAPS.lake.nodes[65], { y: 605 });
Object.assign(MAPS.lake.nodes[67], { x: 1090 });
Object.assign(MAPS.lake.nodes[83], { y: 767 });
Object.assign(MAPS.lake.nodes[85], { x: 1254 });
