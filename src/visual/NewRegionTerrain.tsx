import { useMemo } from 'react';
import type { MapData } from '../game/types';
import type { Lot } from './sceneLayout';
import { getRegionPlants, type RegionPlant } from './newRegionScenery';

function ForestPlant({ plant: p }: { plant: RegionPlant }) {
  const shades = ['#51786b', '#66896d', '#406b60', '#78967b', '#588273'];
  return <g data-region-plant="forest" transform={`translate(${p.x} ${p.y}) scale(${p.scale})`}>
    <ellipse cx="5" cy="4" rx="19" ry="5" fill="#2c584a" opacity=".13"/>
    {p.variant === 4 ? <g fill="none" strokeLinecap="round">
      <path d="M0 0Q-7-21-19-25M1 0Q5-29 18-34M1 0V-38" stroke="#527c5c" strokeWidth="3"/>
      <path d="M-4-10-15-10M-8-18-19-17M5-12 17-14M10-23 21-26M0-21-9-27M1-30 9-37" stroke="#8cae7d" strokeWidth="4"/>
    </g> : <>
      <path d="M0 2V-35M0-17l-9-12M0-23l9-10" stroke="#87917a" strokeWidth="4" strokeLinecap="round"/>
      <path d="M-18-31Q-24-47-9-49Q-3-64 11-53Q27-53 20-36Q26-23 9-19Q-11-16-18-31Z" fill={shades[p.variant]}/>
      <path d="M-18-31Q-24-47-9-49Q-3-60 7-55Q11-44-1-34Q-10-26-18-31Z" fill="#abc5a0" opacity=".75"/>
      <path d="M-8-46q6-7 13-4" stroke="#d4dfb9" strokeWidth="2" fill="none" opacity=".48"/>
    </>}
  </g>;
}

function SandPlant({ plant: p }: { plant: RegionPlant }) {
  return <g data-region-plant="starSands" transform={`translate(${p.x} ${p.y}) scale(${p.scale})`}>
    <ellipse cx="5" cy="4" rx="18" ry="4" fill="#947455" opacity=".12"/>
    {p.variant < 2 ? <>
      <path d="M-19 1-11-14 6-19 19-7 22 2Z" fill={p.variant ? '#b7a28b' : '#c9b499'} stroke="#a5917a" strokeWidth="1"/>
      <path d="M-11-14 6-19 1-6-19 1Z" fill="#e0c9a7"/>
      <path d="M1-6 9 1" stroke="#af9578" strokeWidth="1.5"/>
    </> : <g fill="none" strokeLinecap="round">
      <path d="M0 1Q-4-17-17-22M0 1Q8-15 20-18M0 1Q-3-13 3-28M0 1Q12-4 22-2M0 1Q-13-9-21-7" stroke="#858d70" strokeWidth="3"/>
      <path d="M0 0Q-3-12 3-27M0 0Q8-10 20-17" stroke="#b6b68a" strokeWidth="2"/>
    </g>}
  </g>;
}

export function NewRegionTerrain({ map, lots, id }: { map: MapData; lots: Record<number, Lot>; id: string }) {
  const forest = map.id === 'forest';
  const plants = useMemo(() => getRegionPlants(map, lots), [map, lots]);
  const shore = 'M158 79Q107 81 104 149L109 853Q111 917 185 925L1314 925Q1392 916 1397 846L1392 155Q1387 80 1320 79Z';
  return <g className={`region-terrain region-${map.id}`} aria-hidden="true" pointerEvents="none">
    <defs>
      <linearGradient id={`${id}-region-ground`} x1="0" y1="0" x2=".75" y2="1">
        <stop stopColor={forest ? '#d3e1c9' : '#ead5ac'}/><stop offset="1" stopColor={forest ? '#b6cdb3' : '#d4b889'}/>
      </linearGradient>
      <linearGradient id={`${id}-region-water`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#a4cec0"/><stop offset="1" stopColor="#6ca99d"/></linearGradient>
      <pattern id={`${id}-region-grain`} width="49" height="43" patternUnits="userSpaceOnUse">
        <circle cx="8" cy="7" r="1" fill={forest ? '#42674f' : '#9e7f55'} opacity=".10"/>
        <path d="M30 28h3" stroke={forest ? '#42674f' : '#9e7f55'} strokeWidth="1" opacity=".12"/>
      </pattern>
    </defs>
    <path d={shore} transform="translate(0 13)" fill={forest ? '#91af97' : '#b89e78'} opacity=".65"/>
    <path d={shore} fill={`url(#${id}-region-ground)`}/>
    <path d={shore} fill={`url(#${id}-region-grain)`}/>
    {forest ? <>
      <path d="M305 290Q560 210 720 285T1190 285L1210 733Q998 820 813 762T308 743Z" fill="#8aac86" opacity=".17"/>
      <path d="M331 333Q625 222 1050 332M300 723Q510 811 708 741M1055 748q65-55 133-32" fill="none" stroke="#e8eed4" strokeWidth="9" opacity=".26"/>
      <g data-scenery-id="fern-spring">
        <path d="M402 419Q371 460 427 502T444 570" stroke="#dce6c2" strokeWidth="29" fill="none" strokeLinecap="round"/>
        <path d="M402 419Q371 460 427 502T444 570" stroke="#83b3a5" strokeWidth="18" fill="none" strokeLinecap="round"/>
        <path d="M392 432q-13 31 21 55" stroke="#cee5cb" strokeWidth="3" fill="none"/>
        <ellipse cx="440" cy="598" rx="101" ry="57" fill="#dce5c3"/>
        <ellipse cx="440" cy="599" rx="88" ry="44" fill={`url(#${id}-region-water)`}/>
        <path d="M379 586q52-29 113-2M393 618q50 15 87-2" fill="none" stroke="#d6e9d3" strokeWidth="3" opacity=".8"/>
        <path d="M474 543l30-5 13 11-16 10-30-5Z" fill="#a2b29b"/>
        <text data-scenery-label="fern-spring" x="440" y="675" textAnchor="middle" fill="#527b68" fontSize="13" letterSpacing="5">蕨 溪 泉</text>
      </g>
      <g data-scenery-id="first-tree">
        <ellipse cx="823" cy="595" rx="163" ry="52" fill="#416951" opacity=".14"/>
        <ellipse cx="823" cy="602" rx="130" ry="37" fill="#d4dfb4" opacity=".65"/>
        <path d="M800 438Q782 547 776 589L734 627 798 609 820 583 854 614 902 625 866 585Q843 525 852 441Z" fill="#8b9273"/>
        <path d="M818 457Q809 539 812 584L781 616M835 475q-3 65 11 113l29 24" fill="none" stroke="#b5b58c" strokeWidth="7" strokeLinecap="round"/>
        <path d="M807 500 730 438M840 485l66-71M826 460l-10-85" fill="none" stroke="#909a78" strokeWidth="17" strokeLinecap="round"/>
        <path d="M637 433Q619 377 686 353Q693 298 769 318Q821 282 874 318Q954 296 970 356Q1031 386 1007 440Q1021 492 935 510Q857 546 796 509Q717 545 687 498Q629 494 637 433Z" fill="#4e7962"/>
        <path d="M637 433Q619 377 686 353Q693 298 769 318Q821 282 874 318Q925 308 951 344Q902 337 874 374Q827 358 792 400Q726 379 707 435Q669 449 637 433Z" fill="#9aba88"/>
        <path d="M699 361q31-28 63-14M800 330q27-17 48 0M925 376q40 7 49 38M708 467q33 23 64 2" stroke="#c4d5a1" strokeWidth="5" fill="none" strokeLinecap="round" opacity=".6"/>
        <path d="M761 437q46-22 74 10t90-9" stroke="#6d956e" strokeWidth="24" fill="none" strokeLinecap="round"/>
        <circle cx="676" cy="424" r="7" fill="#ccdbab" opacity=".55"/><circle cx="939" cy="457" r="6" fill="#b9cfa0" opacity=".6"/>
        <text data-scenery-label="first-tree" x="817" y="683" textAnchor="middle" fill="#426952" fontSize="19" letterSpacing="7">始 初 之 树</text>
      </g>
      <g data-scenery-id="moss-rings" transform="translate(1127 655)">
        <ellipse cy="18" rx="55" ry="16" fill="#78996e" opacity=".14"/>
        <ellipse rx="43" ry="22" fill="#a9b596" stroke="#d1d6ae" strokeWidth="4"/>
        <ellipse rx="28" ry="13" fill="none" stroke="#d6dbb7" strokeWidth="3"/>
        <ellipse rx="13" ry="6" fill="none" stroke="#d6dbb7" strokeWidth="2"/>
        <path d="M-39 12q-8-23-17-17M38 10q6-28 21-25" fill="none" stroke="#72926a" strokeWidth="5" strokeLinecap="round"/>
      </g>
    </> : <>
      <path d="M116 835Q350 867 587 836T1100 851Q1250 872 1381 841V899Q1154 935 904 901T374 908Q196 913 116 887Z" fill="#b6c5bb" opacity=".7"/>
      <path d="M133 874Q392 898 611 864T1106 884Q1270 900 1374 873" stroke="#f0e3c3" strokeWidth="5" fill="none"/>
      <path d="M150 126Q395 87 641 145T1351 129M217 894Q520 859 729 908M629 274q132-42 242-15M655 710q97-27 224 14" stroke="#f1e1bb" strokeWidth="7" fill="none" opacity=".53"/>
      <g data-scenery-id="dry-basin">
        <path d="M319 415Q388 363 462 421L478 548Q447 599 363 585L307 532Z" fill="#cfbc97"/>
        <path d="M330 428Q392 386 450 435L465 536Q438 579 370 570L321 528Z" fill="#eee3c7"/>
        <path d="M350 434l26 25-11 43 30 35 55-11M376 459l41-17 31 21M365 502l-34 11M395 537l-8 26M417 442l3-28" fill="none" stroke="#c5b48f" strokeWidth="2"/>
        <path d="M331 400q68-40 130 4M310 564q69 49 150 5" fill="none" stroke="#b8a27d" strokeWidth="3" opacity=".5"/>
        <text data-scenery-label="dry-basin" x="390" y="635" textAnchor="middle" fill="#8d7552" fontSize="14" letterSpacing="5">风 蚀 盆 地</text>
      </g>
      <g data-scenery-id="star-dunes">
        <path d="M1019 525Q1050 406 1102 385Q1154 447 1205 469L1220 533Z" fill="#c4a375"/>
        <path d="M1019 525Q1050 406 1102 385Q1073 462 1102 536Z" fill="#f0d9a8"/>
        <path d="M1033 570Q1123 455 1185 458Q1175 505 1223 577Z" fill="#d3b17c"/>
        <path d="M1033 570Q1123 455 1185 458Q1135 506 1140 576Z" fill="#e8c998"/>
        <path d="M1044 530q41-91 63-124M1068 557q61-72 102-83" fill="none" stroke="#f5e3bb" strokeWidth="3" opacity=".75"/>
        {[[1073,555],[1105,568],[1183,580],[1038,537],[1194,550]].map(([x,y],i)=><path key={i} d={`M${x-3} ${y}l3-4 4 4-4 3Z`} fill="#f6eace" stroke="#b29673" strokeWidth=".8"/>)}
        <text data-scenery-label="star-dunes" x="1115" y="635" textAnchor="middle" fill="#8d7552" fontSize="14" letterSpacing="5">星 砾 沙 丘</text>
      </g>
      <g data-scenery-id="salt-mirror">
        <path d="M665 489Q733 460 824 485L828 520Q753 540 665 518Z" fill="#f1e6c8" stroke="#d4c1a0" strokeWidth="2"/>
        <path d="M678 506q62-19 138-3" stroke="#aabfb3" strokeWidth="5" opacity=".6" fill="none"/>
        <text data-scenery-label="salt-mirror" x="750" y="526" textAnchor="middle" fill="#938364" fontSize="10" letterSpacing="4">盐 光 洼</text>
      </g>
    </>}
    {plants.map((plant,i) => forest ? <ForestPlant key={i} plant={plant}/> : <SandPlant key={i} plant={plant}/>)}
  </g>;
}
