import { useMemo } from 'react';
import type { MapData } from '../game/types';
import { overlap, type Lot } from './sceneLayout';

const random = (index: number, salt: number) => {
  const value = Math.sin(index * 103.73 + salt * 281.31) * 43758.5453;
  return value - Math.floor(value);
};

type Pine = { x: number; y: number; size: number; shade: number };
const protectedScenery = [
  { left: 269, top: 209, right: 512, bottom: 361 }, // lake and fishing shelter
  { left: 219, top: 589, right: 328, bottom: 796 }, // waterfall and rocks
  { left: 302, top: 642, right: 480, bottom: 802 }, // cabin, birches and its label
  { left: 808, top: 279, right: 998, bottom: 721 }, // gorge and broken bridge remains
  { left: 1043, top: 189, right: 1218, bottom: 352 }, // observatory and its label
];

export function SunderedTerrain({ map, lots, id }: { map: MapData; lots: Record<number, Lot>; id: string }) {
  const pines = useMemo(() => {
    const roads = map.nodes.flatMap(node => node.neighbors.filter(next => next > node.id).map(next => {
      const end = map.nodes[next];
      return { left: Math.min(node.x, end.x) - 20, right: Math.max(node.x, end.x) + 20,
        top: Math.min(node.y, end.y) - 20, bottom: Math.max(node.y, end.y) + 20 };
    }));
    return Array.from({ length: 380 }, (_, i): Pine => ({
      x: 148 + random(i, 1) * 1200,
      y: 165 + random(i, 2) * 665,
      size: .65 + random(i, 3) * .65,
      shade: i % 4,
    })).filter(pine => {
      const density = pine.x < 710 && pine.y > 510 ? .8 : pine.x < 750 ? .29 : pine.x > 990 && pine.y < 440 ? .035 : .12;
      if (random(Math.round(pine.x), 8) > density) return false;
      if (((pine.x - 390) / 136) ** 2 + ((pine.y - 285) / 95) ** 2 < 1) return false;
      if (pine.x > 835 && pine.x < 980 && pine.y > 280 && pine.y < 705) return false;
      if (pine.x > 325 && pine.x < 448 && pine.y > 625 && pine.y < 776) return false;
      if (pine.x > 1120 && pine.x < 1225 && pine.y > 180 && pine.y < 320) return false;
      if (pine.x > 238 && pine.x < 322 && pine.y > 590 && pine.y < 780) return false;
      const crown = { left: pine.x - 21 * pine.size, right: pine.x + 21 * pine.size,
        top: pine.y - 53 * pine.size, bottom: pine.y + 10 * pine.size };
      return Object.values(lots).every(lot => overlap(crown, lot.bounds, 8) === 0)
        && protectedScenery.every(scenery => overlap(crown, scenery, 4) === 0)
        && roads.every(road => overlap(crown, road, 3) === 0);
    }).sort((a, b) => a.y - b.y);
  }, [map, lots]);

  return <g className="sundered-terrain" aria-hidden="true">
    <defs>
      <linearGradient id={`${id}-ridge`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a8b6a9"/><stop offset=".62" stopColor="#8f9d9b"/><stop offset="1" stopColor="#a8b4ab"/></linearGradient>
      <linearGradient id={`${id}-waterfall`} x1="0" y1="0" x2="1" y2="0"><stop stopColor="#8abdb8"/><stop offset=".52" stopColor="#cce5dc"/><stop offset="1" stopColor="#80b5b6"/></linearGradient>
    </defs>

    {/* The southwest forest gives way to bare alpine rock toward the northeast. */}
    <path d="M149 558Q326 507 582 520L754 620Q740 809 617 869L167 879Z" fill="#c8d8ba" opacity=".7"/>
    <path d="M140 172Q318 105 635 130L735 229Q619 370 538 425L151 421Z" fill="#cbd4c4" opacity=".68"/>
    <path d="M965 103Q1142 74 1337 119L1376 380Q1346 631 1238 702L1077 604Q1072 472 980 363Z" fill={`url(#${id}-ridge)`} opacity=".87"/>
    <path d="M1087 118Q1230 92 1346 129L1363 341Q1298 288 1243 316L1170 248Q1130 260 1087 219Z" fill="#e5e9df" opacity=".83"/>
    <path d="M1213 340Q1311 310 1367 361L1365 474Q1295 420 1251 449Z" fill="#dce3de" opacity=".56"/>
    <path d="M1190 186Q1266 150 1345 172M1228 204Q1295 187 1350 211M1253 465Q1308 443 1350 472" fill="none" stroke="#f1f2e9" strokeWidth="5" strokeLinecap="round" opacity=".55"/>
    <path d="M1280 203Q1312 257 1337 301L1276 278 1246 267Z" fill="#f2f2e9" opacity=".85"/>
    <path d="M1291 220 1272 278M1306 248 1279 278M1324 276 1294 285" stroke="#a5b3b4" strokeWidth="2" opacity=".65"/>

    {/* The highland lake and a small fishing shelter. */}
    <ellipse data-scenery-id="walking-lake" cx="390" cy="285" rx="115" ry="70" fill="#e2e7cf"/>
    <ellipse cx="390" cy="285" rx="105" ry="58" fill="#94bec0"/>
    <path d="M319 255Q391 231 452 253M307 303Q385 328 467 302" fill="none" stroke="#d7e9de" strokeWidth="3" opacity=".9"/>
    <path d="M344 272q17-5 34 0M402 309q18-5 34-1" fill="none" stroke="#e2f0e8" strokeWidth="2" strokeLinecap="round" opacity=".7"/>
    <g data-scenery-id="fishing-shelter" transform="translate(482 299)">
      <ellipse cx="1" cy="18" rx="30" ry="9" fill="#759b94" opacity=".2"/>
      <path d="M-21-3H19V15H-21Z" fill="#a7a79a" stroke="#788982" strokeWidth="2"/>
      <path d="M-27-4-16-19H14L26-4Z" fill="#737f7e" stroke="#e1dfcb" strokeWidth="2"/>
      <path d="M-3 2H9V15H-3Z" fill="#677b78"/>
      <path d="M-25 16H22" stroke="#817e70" strokeWidth="3" strokeLinecap="round"/>
    </g>

    {/* The waterfall stays in the lower green valley, away from the road edge. */}
    <path data-scenery-id="forest-waterfall" d="M277 613Q294 641 280 670Q265 690 282 723Q296 746 276 784" fill="none" stroke="#9fb9ae" strokeWidth="31" strokeLinecap="round" opacity=".48"/>
    <path d="M277 613Q294 641 280 670Q265 690 282 723Q296 746 276 784" fill="none" stroke={`url(#${id}-waterfall)`} strokeWidth="17" strokeLinecap="round"/>
    <path d="M284 661Q270 685 281 709M276 730Q288 753 278 772" fill="none" stroke="#e5f0e5" strokeWidth="4" strokeLinecap="round" opacity=".85"/>
    <path d="M237 664 257 653 260 690 237 705ZM302 696 321 682 319 726 300 737Z" fill="#929f91"/>
    <path d="M236 665 257 653M302 697 321 683" stroke="#ccd7c1" strokeWidth="3"/>

    {/* A collapsed gorge: scenic bridge remnants are deliberately detached from the roads. */}
    <path data-scenery-id="echo-rift" d="M852 322Q877 302 892 330L889 654Q875 682 850 671Z" fill="#a4b5a8"/>
    <path d="M919 323Q946 299 965 329L957 656Q941 687 917 672Z" fill="#8f9f9b"/>
    <path d="M875 335Q895 375 881 431T882 553Q877 614 866 650M937 337Q923 389 943 439T937 548Q934 610 948 653" fill="none" stroke="#d1d9c9" strokeWidth="4" opacity=".65"/>
    <path d="M891 355Q910 392 900 446T906 555Q899 616 890 650" fill="none" stroke="#687e83" strokeWidth="18" opacity=".42"/>
    <path d="M898 340Q907 404 899 466T904 573Q898 622 896 656" fill="none" stroke="#b5c7be" strokeWidth="4" opacity=".8"/>
    <g fill="#7a8988" stroke="#d2d9c9" strokeWidth="2">
      <path d="M851 465h17v8h-17zM927 483h16v8h-16zM852 596h14v7h-14zM932 579h15v8h-15z"/>
    </g>
    <path d="M824 291h23m-20 7h19m129-14h17m-15 8h17M820 705h24m-20 8h18m133-8h20" stroke="#8f9890" strokeWidth="4" strokeLinecap="round" opacity=".7"/>

    {/* The abandoned cabin is the warm landmark in the forest. */}
    <g data-scenery-id="last-light-cabin" transform="translate(389 721)">
      <ellipse cy="29" rx="55" ry="14" fill="#708f73" opacity=".2"/>
      <path d="M-35-8 0-54 38-8V27H-35Z" fill="#aaa99a" stroke="#707b77" strokeWidth="3"/>
      <path d="M-43-8 0-62 46-8H34L0-47-31-8Z" fill="#6c726d" stroke="#cbcbb9" strokeWidth="2"/>
      <path d="M-9 0H12V27H-9Z" fill="#6c6c63" stroke="#c3b9a1" strokeWidth="2"/>
      <path d="M-30-1h14v16h-14zM19-1h13v16H19Z" fill="#f2d6a0" stroke="#8b897a" strokeWidth="2"/>
      <path d="M-27 2v11m7-11v11M22 2v11m6-11v11" stroke="#ad9b7e" strokeWidth="1.5"/>
      <path d="M-49 26H52" stroke="#867d68" strokeWidth="4" strokeLinecap="round"/>
    </g>
    {[{ x: 332, y: 732 }, { x: 454, y: 748 }].map((birch, i) => <g key={i} transform={`translate(${birch.x} ${birch.y})`}>
      <path d="M0 0V-64M0-44l-12-19M0-34l15-17" fill="none" stroke="#e2e4d8" strokeWidth="5" strokeLinecap="round"/>
      <path d="M-3-15h5m-6-19h5m0-18h5" stroke="#66716e" strokeWidth="2"/>
      <circle cx="-6" cy="-67" r="14" fill="#a2b7a0" opacity=".82"/><circle cx="9" cy="-56" r="13" fill="#9eb29c" opacity=".78"/>
    </g>)}

    {/* A domed observatory looks over the eastern ridge but remains separate from purchasable lots. */}
    <g data-scenery-id="skywatch-station" transform="translate(1170 274)">
      <ellipse cy="35" rx="58" ry="14" fill="#738a87" opacity=".27"/>
      <rect x="-41" y="-2" width="82" height="33" rx="3" fill="#bec8bf" stroke="#697c7d" strokeWidth="3"/>
      <path d="M-35-2A35 29 0 0 1 35-2Z" fill="#dce5df" stroke="#768b90" strokeWidth="3"/>
      <path d="M-2-30V-59M-10-57H6M-2-60V-71" fill="none" stroke="#657d83" strokeWidth="3" strokeLinecap="round"/>
      <circle cx="-2" cy="-72" r="4" fill="#d6a882"/>
      <path d="M-25 8h18v13h-18zM7 8h18v13H7Z" fill="#8daeb3" stroke="#637e81" strokeWidth="2"/>
      <path d="M-44 29H44" stroke="#7e8e86" strokeWidth="4" strokeLinecap="round"/>
    </g>

    {pines.map((pine, i) => <g key={i} data-scenery-pine="" transform={`translate(${pine.x} ${pine.y}) scale(${pine.size})`}>
      <ellipse cx="5" cy="4" rx="13" ry="5" fill="#54765f" opacity=".12"/>
      <path d="M0 0v-30" stroke="#777e6a" strokeWidth="3"/>
      <path d="M0-51-16-21h7L-19-8h38L9-21h7Z" fill={['#617e6f', '#748e79', '#57786e', '#829a81'][pine.shade]}/>
      <path d="M0-51-3-9h-16l10-12h-7Z" fill={['#8ea98a', '#a6b89a', '#88a79a', '#afc19d'][pine.shade]}/>
    </g>)}
    <text data-scenery-label="walking-lake" x="367" y="291" textAnchor="middle" className="map-water-label">漫 行 湖</text>
    <text data-scenery-label="last-light-cabin" x="390" y="790" textAnchor="middle" className="map-district-label">末 灯 旧 屋</text>
    <text data-scenery-label="skywatch-station" x="1110" y="344" textAnchor="middle" className="map-district-label">望 穹 气 象 站</text>
  </g>;
}

export function SunderedBridges() {
  return <g className="sundered-bridges" aria-hidden="true">
    {[260, 740].map(y => <g key={y} data-scenery-id={y === 260 ? 'north-rift-bridge' : 'south-rift-bridge'}>
      <path d={`M790 ${y - 18}H1010M790 ${y + 18}H1010`} stroke="#798b89" strokeWidth="4" strokeLinecap="round" opacity=".78"/>
      {[810, 850, 890, 930, 970, 1000].map(x => <path key={x} d={`M${x} ${y - 17}v34`} stroke="#889994" strokeWidth="2" opacity=".42"/>)}
    </g>)}
  </g>;
}
