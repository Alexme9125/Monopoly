import { useMemo } from 'react';
import type { MapData } from '../game/types';
import type { Lot } from './sceneLayout';
import { getCanyonHavenPlants, type CanyonHavenPlant } from './canyonHavenScenery';

function Plant({ plant: p, ash }: { plant: CanyonHavenPlant; ash: boolean }) {
  const charred = ash && p.y < 500 && p.variant < 3;
  const peach = !ash && (p.x < 660 || p.variant < 2);
  return <g data-canyon-haven-plant="" transform={`translate(${p.x} ${p.y}) scale(${p.scale})`}>
    <ellipse cx="5" cy="4" rx="21" ry="5" fill={ash ? '#6b6c62' : '#779585'} opacity=".13"/>
    {charred ? <g fill="none" strokeLinecap="round">
      <path d="M0 2 1-53M0-14-15-29M1-32 15-46M-7-21-6-36M7-38 7-53" stroke="#66665f" strokeWidth="5"/>
      <path d="M2 0 3-48M-13-28-16-31" stroke="#a19a85" strokeWidth="1.5"/>
      <path d="M-13 3q5-12 11-7M7 3q3-9 10-8" stroke="#9db28e" strokeWidth="4"/>
    </g> : p.variant === 4 && !peach ? <g fill="none" strokeLinecap="round">
      <path d="M-8 1-6-47M4 1 8-59M14 0 18-41" stroke="#81927a" strokeWidth="3"/>
      <path d="M-6-34-20-45M-6-26 4-34M8-42 21-51M8-49-4-56M18-25 25-31" stroke="#749878" strokeWidth="5"/>
      <path d="M-8-18h5M6-29h5M7-45h5M16-17h5" stroke="#d4dec1" strokeWidth="2"/>
    </g> : <>
      <path d="M0 2V-38M0-17-11-30M0-24 12-34" stroke={peach ? '#989080' : '#8c967e'} strokeWidth="4" strokeLinecap="round"/>
      <path d="M-20-28Q-26-45-11-49Q-5-62 9-54Q27-53 21-38Q29-21 9-19Q-9-14-20-28Z" fill={peach ? ['#dba3a7','#d5aeb0','#dfb4b7'][p.variant % 3] : '#79957a'}/>
      <path d="M-20-28Q-26-45-11-49Q-5-62 9-54Q16-48 7-38Q-6-41-11-26Z" fill={peach ? '#eed1cd' : '#b7c5a0'}/>
      {peach && <g fill="#f7e9db"><circle cx="-12" cy="-42" r="2.5"/><circle cx="6" cy="-48" r="2"/><circle cx="14" cy="-28" r="2.5"/></g>}
    </>}
  </g>;
}

function CanyonLandmarks() {
  return <>
    <g data-scenery-id="embers-grove">
      <path d="M276 342q88-43 254-2l-20 17H287Z" fill="#b9b39c" opacity=".5"/>
      {[300,350,413,472,517].map((x,i) => <g key={x} transform={`translate(${x} ${342 + i % 2 * 6})`} fill="none" strokeLinecap="round">
        <path d={`M0 0 2-${48 + i % 3 * 6}M0-15-15-30M1-31 14-45`} stroke="#656a61" strokeWidth="5"/>
        <path d="M3-5 4-42" stroke="#b2a38d" strokeWidth="1.7"/>
        <path d="M-10 2q5-13 12-5" stroke="#9dac8b" strokeWidth="5"/>
      </g>)}
      <text className="region-scenic-caption" x="402" y="370" textAnchor="middle">余 烬 新 生</text>
    </g>
    <g data-scenery-id="old-gold-mine">
      <path d="M1057 398 1073 362 1112 337 1161 330 1208 351 1236 397Z" fill="#a79e8a"/>
      <path d="M1057 398 1073 362 1112 337 1145 342 1118 374 1110 397Z" fill="#c6bea7"/>
      <path d="M1083 369 1118 350M1166 347 1207 366M1186 380 1220 389" stroke="#d9d0b9" strokeWidth="3" fill="none"/>
      <path d="M1116 398v-35h42v35Z" fill="#636c67" stroke="#918876" strokeWidth="4"/>
      <path d="M1113 363h48M1121 363v32M1154 363v32" fill="none" stroke="#cbb997" strokeWidth="4"/>
      <path d="M1125 387v16M1148 387v16M1122 400h29" fill="none" stroke="#8c8979" strokeWidth="2"/>
      <circle cx="1168" cy="380" r="3" fill="#d1b273"/>
      <text className="region-scenic-caption" x="1144" y="420" textAnchor="middle">金 脉 旧 址</text>
    </g>
    <g data-scenery-id="regrowth-pool">
      <path d="M274 607q38-28 104-20t116 15q32 14 4 34-96 24-202-2-41-12-22-27Z" fill="#c0c6a6"/>
      <path d="M297 608q35-17 78-10t102 11q25 10-6 18-86 13-164-3-19-7-10-16Z" fill="#94b8ab"/>
      <path d="M319 609q49-7 102 7m-64 7q45 4 81-3" fill="none" stroke="#dce9cc" strokeWidth="2"/>
      <path d="M288 612q-9-24-17-22m17 22q0-19 10-24M488 621q8-17 23-19" fill="none" stroke="#809377" strokeWidth="3"/>
      <text className="region-scenic-caption" x="390" y="658" textAnchor="middle">复 绿 湾</text>
    </g>
  </>;
}

function PeachLandmarks() {
  return <>
    <g data-scenery-id="mulberry-fields">
      {[
        ['802,250 894,242 893,302 805,308', '#b9ca94'],
        ['905,244 1009,249 1004,311 906,305', '#a4bd8d'],
        ['1030,255 1103,256 1100,315 1025,311', '#c7ce9b'],
        ['1114,258 1193,274 1188,321 1110,316', '#a8c49b'],
        ['804,320 892,314 890,376 810,369', '#a1bc92'],
        ['904,316 1002,322 997,380 902,376', '#c4cc97'],
        ['1023,322 1099,326 1096,378 1018,383', '#abc391'],
        ['1110,328 1186,333 1182,375 1107,378', '#b8cdab'],
      ].map(([points, fill]) => <polygon key={points} points={points} fill={fill} stroke="#e0e3be" strokeWidth="4"/>)}
      <path d="M819 267l57-5m-56 19 56-5m-55 19 55-5M922 263l68 4m-68 13 67 4m-67 13 66 4M1043 272h45m-46 17h45m-46 15h45M1126 279l51 10m-53 8 51 10M821 336l54-4m-53 20 53-4M920 338l64 4m-64 14 62 4M1036 340l49 3m-51 14 49 3M1124 343l47 4m-48 13 46 3" fill="none" stroke="#789d76" strokeWidth="3" opacity=".65"/>
      <path d="M898 247 897 384M1017 252 1010 388" fill="none" stroke="#a6c4b0" strokeWidth="3"/>
      {[835,856,941,965,1052,1075,1137,1161].map((x,i) => <path key={x} d={`M${x} ${i < 4 ? 285 : 291}l-3-7m3 7 4-6M${x+2} 360l-3-7m3 7 4-6`} fill="none" stroke="#e1e4bb" strokeWidth="2"/>)}
      <path d="M805 393q171-15 389 1" fill="none" stroke="#91b5a5" strokeWidth="5" strokeLinecap="round"/>
      <text className="region-scenic-caption" x="996" y="414" textAnchor="middle">桑 畴 阡 陌</text>
    </g>
    <g data-scenery-id="peach-pond">
      <path d="M819 646q31-47 122-34 73-8 139 24 58 33 4 76-93 45-210 13-81-35-55-79Z" fill="#d4ddbb"/>
      <path d="M834 651q35-39 105-26 81-4 137 26 37 29-7 53-77 35-184 10-71-23-51-63Z" fill="#9fc7bc"/>
      <path d="M857 653q79-34 160-7M899 708q73 22 147-5" stroke="#d8e9d2" strokeWidth="3" fill="none"/>
      <g fill="#89b09b"><ellipse cx="867" cy="683" rx="13" ry="6"/><ellipse cx="888" cy="692" rx="9" ry="5"/><ellipse cx="1045" cy="666" rx="12" ry="6"/></g>
      <path d="M863 681q4-11 8 0M1041 664q4-11 8 0" stroke="#efcec2" strokeWidth="4" fill="none" strokeLinecap="round"/>
      <path d="M858 739q55 15 120 7" stroke="#bfcca8" strokeWidth="4" fill="none"/>
      <text className="region-scenic-caption" x="964" y="774" textAnchor="middle">南 陌 清 池</text>
    </g>
    <g data-scenery-id="haven-houses">
      <path d="M1146 635h69v45h-69Z" fill="#e4dfc6"/>
      <path d="M1140 639 1168 604h21l35 35Z" fill="#789486"/>
      <path d="M1148 632h63M1154 625h51" stroke="#a3b6a0" strokeWidth="2"/>
      <path d="M1169 656h14v24h-14ZM1192 650h13v12h-13Z" fill="#899a84"/>
      <path d="M1168 699h70v42h-70Z" fill="#ddd8c0"/>
      <path d="M1160 702 1185 676h25l35 26Z" fill="#6b887d"/>
      <path d="M1187 718h13v23h-13ZM1210 713h16v12h-16Z" fill="#8e9c86"/>
      <path d="M1146 753h91M1151 747v12m18-12v12m18-12v12m18-12v12m18-12v12" stroke="#b1ad8e" strokeWidth="2"/>
      <text className="region-scenic-caption" x="1197" y="777" textAnchor="middle">问 津 村</text>
    </g>
    <g data-scenery-id="peach-creek">
      <path d="M300 444q-20 29-6 58t2 63" fill="none" stroke="#cdd9b8" strokeWidth="55" strokeLinecap="round"/>
      <path d="M300 444q-20 29-6 58t2 63" fill="none" stroke="#98c1b2" strokeWidth="34" strokeLinecap="round"/>
      <path d="M294 437q-19 21-8 49M305 527q7 27-7 40" fill="none" stroke="#dcebd0" strokeWidth="3"/>
      <path d="M274 493q20 24 48 5l-5 16q-22 11-39-9Z" fill="#a6a28a" stroke="#d9d3b2" strokeWidth="2"/>
      <path d="M280 490l30 17" stroke="#7e8a78" strokeWidth="2"/>
      <g fill="#e6babe"><ellipse cx="274" cy="455" rx="3" ry="1.5"/><ellipse cx="302" cy="551" rx="3" ry="1.5"/><ellipse cx="321" cy="523" rx="3" ry="1.5"/></g>
    </g>
    <g data-scenery-id="hidden-rock-mouth">
      <path d="M472 576 481 469 516 417 553 439 577 557 561 585Z" fill="#a4b7a0"/>
      <path d="M481 469 516 417 531 443 516 550 472 576Z" fill="#c3cfaf"/>
      <path d="M543 447 556 502 549 554M491 476 508 448M489 532 501 498" fill="none" stroke="#dce2c3" strokeWidth="3"/>
      <path d="M485 578q25-30 71-2" fill="none" stroke="#7f9c81" strokeWidth="12" strokeLinecap="round"/>
    </g>
  </>;
}

export function CanyonHavenTerrain({ map, lots, id }: { map: MapData; lots: Record<number, Lot>; id: string }) {
  const ash = map.id === 'ashCanyon';
  const plants = useMemo(() => getCanyonHavenPlants(map, lots), [map, lots]);
  const outline = 'M164 71Q103 68 100 143L105 853Q108 916 179 925H1321Q1398 917 1401 850L1397 150Q1392 75 1325 71Z';
  const gorge = 'M797 80Q742 231 791 345T812 514Q858 657 793 789L766 922';
  return <g className={`region-terrain canyon-haven-terrain region-${map.id}`} aria-hidden="true" pointerEvents="none">
    <defs>
      <linearGradient id={`${id}-haven-ground`} x1="0" y1="0" x2=".8" y2="1"><stop stopColor={ash ? '#e4ddd0' : '#e2e8d1'}/><stop offset="1" stopColor={ash ? '#c7c6b0' : '#c2d3b9'}/></linearGradient>
      <pattern id={`${id}-haven-grain`} width="43" height="39" patternUnits="userSpaceOnUse"><circle cx="9" cy="8" r="1" fill={ash ? '#6e6e62' : '#6b9375'} opacity=".1"/><path d="M27 27h3" stroke={ash ? '#7d7566' : '#69836c'} strokeWidth="1" opacity=".14"/></pattern>
      <mask id={`${id}-terrain-clearance`}><rect width="1500" height="1000" fill="white"/>{Object.values(lots).map((l,i) => <rect key={i} x={l.bounds.left - 3} y={l.bounds.top - 3} width={l.size + 6} height={l.size + 6} rx="6" fill="black"/>)}</mask>
    </defs>
    <path d={outline} fill={ash ? '#a6aa97' : '#afc3a5'} transform="translate(0 13)"/>
    <path d={outline} fill={`url(#${id}-haven-ground)`}/>
    <path d={outline} fill={`url(#${id}-haven-grain)`}/>
    {ash ? <g mask={`url(#${id}-terrain-clearance)`}>
      <path d="M157 246q166-121 440-27l11 190q-215 4-450-38ZM942 197q192-101 414 58l10 190q-114-88-282-7Z" fill="#b8b39e" opacity=".34"/>
      <path d="M161 570q289-30 452 58l19 252-480-24Z" fill="#b6c8a4" opacity=".52"/>
      <path d="M731 79 718 153 697 217 713 277 723 313 738 358 725 416 751 464 759 528 746 583 768 636 745 716 731 759 709 820 695 922 831 927 854 842 870 792 884 722 901 666 891 604 876 551 890 497 864 427 850 371 831 317 821 269 840 199 863 118 855 79Z" fill="#b3a990"/>
      <path d="M748 80 738 153 718 221 732 267 741 311 758 359 746 414 770 464 779 528 767 581 790 639 770 719 748 780 731 833 717 923 814 925 834 837 851 789 865 718 879 665 867 605 855 551 867 499 843 431 829 374 812 320 800 268 820 197 843 117 837 80Z" fill="#cec4ab"/>
      <path d="M770 80 760 158 738 224 755 275 765 318 780 366 770 416 791 464 799 527 786 580 809 640 793 721 770 788 751 839 741 924 798 925 816 835 833 784 844 717 857 663 846 606 835 550 847 501 822 433 808 377 792 321 780 269 800 193 823 114 817 80Z" fill="#8c9688"/>
      <path d={gorge} fill="none" stroke="#667f78" strokeWidth="44"/>
      <path d={gorge} fill="none" stroke="#85aaa4" strokeWidth="27"/>
      <path d={gorge} fill="none" stroke="#c6d8c1" strokeWidth="3" opacity=".64"/>
      <path d="M725 239q-12 38 6 66m128 80q22 47 7 89M763 650q6 33-9 70m100 93-25 52" stroke="#ded5bc" strokeWidth="6" fill="none" opacity=".7"/>
      <path d="M709 214 735 226M721 285l25-9M735 356l31 8M741 455l31 8M772 629l24 8M741 758l26 11M718 830l23 10M836 206l-25 9M840 388l-21 7M878 483l-27 11M871 726l-23-9M849 837l-24-10" fill="none" stroke="#837e6d" strokeWidth="2" opacity=".5"/>
      <path d="M1038 213q83-58 197 15l-12 14-125-5Z" fill="#eeeede" opacity=".83"/>
      <path d="M859 201q-17 22-13 42l28-22Z" fill="#e7ecdf" opacity=".75"/>
    </g> : <>
      <path d="M146 284q173-88 304-42l24 450q-178 76-321-17Z" fill="#c9d5b9" opacity=".5"/>
      <path d="M723 199q282-65 554 30v184q-318 48-564-2ZM735 577q282-65 531 22l-9 229q-289 35-532-11Z" fill="#b5cba7" opacity=".28"/>
      <path d="M754 220q246-44 479 8M736 810q216 40 483-7" fill="none" stroke="#e7e8c9" strokeWidth="6" opacity=".65"/>
    </>}
    {ash ? <CanyonLandmarks/> : <PeachLandmarks/>}
    {plants.map((plant,i) => <Plant key={i} plant={plant} ash={ash}/>)}
  </g>;
}

/** Bridges and portals decorate real edges; the board renders movement markers above them. */
export function CanyonHavenCrossings({ map }: { map: MapData }) {
  if (map.id === 'ashCanyon') return <g className="canyon-crossings" aria-hidden="true" pointerEvents="none">
    {[[720,900,140],[720,900,560],[660,840,860]].map(([left,right,y],i) => <g key={y} data-canyon-bridge={i}>
      <path d={`M${left} ${y-15}H${right}V${y+15}H${left}Z`} fill={i === 2 ? '#b8b6a0' : '#cfbea0'} stroke="#a79e87" strokeWidth="1"/>
      {Array.from({length:15},(_,n)=><path key={n} d={`M${left+6+n*12} ${y-14}v28`} stroke={i === 2 ? '#dcd7bf' : '#a89d84'} strokeWidth="1" opacity=".6"/>)}
      {i < 2 && <><path d={`M${left} ${y-28}Q${(left+right)/2} ${y-13} ${right} ${y-28}M${left} ${y+22}Q${(left+right)/2} ${y+35} ${right} ${y+22}`} fill="none" stroke="#7d877d" strokeWidth="2"/>
        {[left,right].map(x => <path key={x} d={`M${x} ${y-31}v20M${x} ${y+11}v17`} stroke="#788175" strokeWidth="4"/>)}</>}
    </g>)}
  </g>;
  if (map.id === 'peachHaven') return <g aria-hidden="true" pointerEvents="none">
    {[320,680].map(y => <g key={y} data-haven-portal="">
      <path d={`M498 ${y-21} 510 ${y-42} 550 ${y-45} 573 ${y-21}Z`} fill="#a2b199"/>
      <path d={`M511 ${y-22}Q536 ${y-41}560 ${y-22}`} fill="none" stroke="#d7ddbc" strokeWidth="4"/>
      <path d={`M501 ${y+21}h67`} fill="none" stroke="#bbc7a7" strokeWidth="4"/>
    </g>)}
  </g>;
  return null;
}
