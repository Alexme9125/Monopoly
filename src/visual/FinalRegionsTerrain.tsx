import { useMemo } from 'react';
import type { MapData } from '../game/types';
import type { Lot } from './sceneLayout';
import { getFinalRegionPlants, type FinalPlant } from './finalRegionScenery';

function ValleyTree({ plant: p, wild }: { plant: FinalPlant; wild: boolean }) {
  return <g transform={`translate(${p.x} ${p.y}) scale(${p.scale})`} data-final-plant="">
    <ellipse cx="5" cy="4" rx="23" ry="6" fill="#58776a" opacity=".12"/>
    <path d="M0 2V-34" stroke="#8e9c8c" strokeWidth="4" strokeLinecap="round"/>
    {wild ? <>
      <path d="M0-62-16-32h7l-14 18h9l-10 12h46l-9-12h8L8-32h8Z" fill={p.variant % 2 ? '#678b7d' : '#739687'}/>
      <path d="M0-62-16-32h7l-14 18h9l-10 12H-2Z" fill="#acc4b1"/>
      {p.variant === 0 && <path d="M0-62-9-39-3-42-7-29 1-31Z" fill="#dce6d9" opacity=".6"/>}
    </> : <>
      <ellipse cx="1" cy="-32" rx="19" ry="24" fill="#94b29c"/>
      <ellipse cx="-6" cy="-37" rx="13" ry="18" fill="#c0d0b8"/>
      <path d="M0-16V-39M0-24 10-32" fill="none" stroke="#859d89" strokeWidth="2"/>
    </>}
  </g>;
}

function ValleyLandmarks() {
  return <>
    <g data-scenery-id="stairstep-falls" transform="translate(0 40) scale(1 .8)">
      <path d="M267 264q49-50 117-19l23 19-35 44-92-13Z" fill="#bdcdc0"/>
      <path d="M278 263q39-31 86-9l24 14-29 26-74-11Z" fill="#97c0c0"/>
      <path d="M295 261q27-11 50-4" fill="none" stroke="#e1eeDF" strokeWidth="3"/>
      <path d="M368 260 414 268 436 287 469 291 485 317 399 315 382 285Z" fill="#9bacab"/>
      <path d="M364 270 405 277 424 296 456 299 469 321 444 323 431 309 411 311 388 289 365 286Z" fill="#80afb2"/>
      <path d="M379 280l17 17m10-4 14 14m23-2 10 12" stroke="#e6f1e8" strokeWidth="4" strokeLinecap="round"/>
      <path d="M490 317 509 264 536 249 563 265 582 317Z" fill="#a6b5ae"/>
      <path d="M490 317 509 264 536 249 542 272 521 317Z" fill="#c5d2c7"/>
      <path d="M524 317q3-30 22-27 18 5 20 27Z" fill="#5c7e7b"/>
      <path d="M535 307q9-13 15-2" fill="none" stroke="#9bc9c1" strokeWidth="3"/>
      <text x="369" y="326" textAnchor="middle" className="final-scenic-caption">叠 瀑 阶 湖</text>
    </g>
    <g data-scenery-id="glow-cave" transform="translate(12 12)">
      <path d="M488 527 497 481 535 460 574 488 582 529Z" fill="#93aaa2"/>
      <path d="M488 527 497 481 535 460 540 479 516 527Z" fill="#bbcfbf"/>
      <path d="M516 529q0-34 22-35 24 5 26 35Z" fill="#4f7373"/>
      <path d="M525 524q3-19 15-18m-6-22 18 9" fill="none" stroke="#93c3b7" strokeWidth="3"/>
      <circle cx="550" cy="514" r="2" fill="#c9e8d0"/>
      <text x="535" y="546" textAnchor="middle" className="final-scenic-caption">荧 岩</text>
    </g>
    <g data-scenery-id="signal-ledge">
      <path d="M1021 383 1050 351 1118 343 1177 374 1174 392 1036 400Z" fill="#a7b5a7"/>
      <path d="M1021 383 1050 351 1118 343 1159 363 1120 377Z" fill="#c8d2bd"/>
      <path d="M1074 367l29-33 34 35Z" fill="#dce4d7"/>
      <path d="M1088 367l15-24 15 25Z" fill="#aabfb0"/>
      <ellipse cx="1150" cy="380" rx="12" ry="5" fill="#82978a"/>
      <path d="M1145 381l11-8m-13 1 14 7" stroke="#8f8172" strokeWidth="3"/>
      <path d="M1150 376q-6-10 1-17" fill="none" stroke="#e5ece2" strokeWidth="4" opacity=".8"/>
      <text x="1100" y="408" textAnchor="middle" className="final-scenic-caption">独 望 烽 烟</text>
    </g>
    <g data-scenery-id="echo-overhang">
      <path d="M299 695 311 621 365 591 421 610 458 695Z" fill="#9eafa4"/>
      <path d="M299 695 311 621 365 591 386 614 341 695Z" fill="#c2d0bf"/>
      <path d="M325 655q58-26 102 12l-11 26h-96Z" fill="#728e83"/>
      <path d="M311 642q62-48 113-4" fill="none" stroke="#d7dfcd" strokeWidth="9"/>
      <path d="M337 690h45m-24-8h44" stroke="#a7bba5" strokeWidth="3"/>
      <text x="373" y="721" textAnchor="middle" className="final-scenic-caption">回 声 岩 棚</text>
    </g>
    <g data-scenery-id="reed-shallows" transform="translate(0 -16)">
      <ellipse cx="1114" cy="686" rx="60" ry="29" fill="#bdcdb7"/>
      <ellipse cx="1112" cy="687" rx="46" ry="17" fill="#9ec1b7"/>
      {[1070,1086,1149,1167].map((x,i) => <g key={x} fill="none" stroke="#89a58c" strokeLinecap="round"><path d={`M${x} 695v-${24+i%2*13}m0 8-6-9m6 18 7-10`} strokeWidth="2"/><path d={`M${x} ${666-i%2*13}v8`} stroke="#a29b7d" strokeWidth="4"/></g>)}
      <text x="1118" y="736" textAnchor="middle" className="final-scenic-caption">汀 草 浅 滩</text>
    </g>
  </>;
}

function CityLandmarks() {
  return <>
    <g data-scenery-id="civic-square">
      <rect x="605" y="355" width="290" height="290" rx="44" fill="#d6dedb" stroke="#edf0e7" strokeWidth="5"/>
      <path d="M750 358v284M608 500h284" stroke="#ebeee7" strokeWidth="22"/>
      <path d="M646 368h58v42h-58ZM796 368h58v42h-58ZM646 590h58v42h-58ZM796 590h58v42h-58Z" fill="#b5c7ae"/>
      <path d="M646 388h58m-58 225h58M796 388h58m-58 225h58" stroke="#91b19d" strokeWidth="3"/>
      <rect x="650" y="422" width="200" height="156" rx="45" fill="#c0d2d3" stroke="#edf0e7" strokeWidth="8"/>
      <ellipse cx="750" cy="500" rx="71" ry="49" fill="#9fbfc6"/>
      <ellipse cx="750" cy="501" rx="58" ry="38" fill="none" stroke="#dae8e6" strokeWidth="2"/>
      <path d="M737 514V480l13-16 14 16v34Z" fill="#e7e9df" stroke="#b5c6c5" strokeWidth="2"/>
      <path d="M750 468v44" stroke="#9fafb4" strokeWidth="2"/>
      <path d="M743 481q-26-36-37 0m51 0q26-36 37 0" fill="none" stroke="#e6f2eb" strokeWidth="3" strokeLinecap="round"/>
      {[623,873].map(x => <g key={x} stroke="#9daaa7" strokeWidth="3"><path d={`M${x} 437v37m0 52v37`}/><path d={`M${x-5} 441v29m10-29v29m-10 60v29m10-29v29`} stroke="#b8c4b8" strokeWidth="2"/></g>)}
      <text x="750" y="612" textAnchor="middle" className="final-city-caption">中 央 水 庭</text>
    </g>
    {[0,1].map(side => <g key={side} transform={`translate(${side ? 1120 : 0} 0)`} data-scenery-id={side?'east-skyline':'west-skyline'} opacity=".66">
      <path d="M144 693V371h36V287h20v68h35v338Z" fill="#c8d2d3"/>
      <path d="M144 693V371h16v322M182 691V292h17v399M218 693V359h17v334" fill="#b6c5ca"/>
      <path d="M141 693h96" stroke="#a5b9b3" strokeWidth="5"/>
      {Array.from({length:15},(_,i) => <path key={i} d={`M165 ${397+i*19}h10M203 ${397+i*19}h10M224 ${386+i*19}h8`} stroke="#e9eeea" strokeWidth="3"/>)}
      <path d="M180 289h21m-13 0v-46h7v46" fill="none" stroke="#acbfc3" strokeWidth="2"/>
      <text x="189" y="722" textAnchor="middle" className="final-city-caption">{side?'天 际 线':'城 市 远 景'}</text>
    </g>)}
  </>;
}

export function FinalRegionsTerrain({ map, lots, id }: { map: MapData; lots: Record<number, Lot>; id: string }) {
  const wild = map.id === 'hushedValley';
  const plants = useMemo(() => getFinalRegionPlants(map,lots),[map,lots]);
  const outline = wild ? 'M157 44Q108 50 109 119L112 866Q111 949 182 949H1320Q1398 947 1399 866L1397 137Q1394 44 1328 43Z' : 'M154 35H1345Q1405 35 1405 101V882Q1405 955 1336 955H165Q99 952 99 883V106Q99 36 154 35Z';
  const river = 'M551 523C592 520 637 559 691 516S850 419 951 445 1196 476 1394 610';
  return <g className={`final-region-terrain final-region-${map.id}`} aria-hidden="true" pointerEvents="none">
    <defs>
      <linearGradient id={`${id}-final-ground`} x1="0" y1="0" x2=".7" y2="1"><stop stopColor={wild?'#e0e8de':'#e8ebe5'}/><stop offset="1" stopColor={wild?'#c0d0c4':'#ccd8d6'}/></linearGradient>
      <pattern id={`${id}-final-grain`} width="41" height="37" patternUnits="userSpaceOnUse"><path d="M4 7h2m23 21h3" stroke={wild?'#6f9185':'#6f8993'} opacity=".11"/></pattern>
      <mask id={`${id}-final-clearance`}><rect width="1500" height="1000" fill="white"/>{Object.values(lots).map((l,i) => <rect key={i} x={l.bounds.left-3} y={l.bounds.top-3} width={l.size+6} height={l.size+6} rx="5" fill="black"/>)}</mask>
    </defs>
    <path d={outline} fill={wild?'#a6bcae':'#aebfc0'} transform="translate(0 10)"/>
    <path d={outline} fill={`url(#${id}-final-ground)`}/>
    <path d={outline} fill={`url(#${id}-final-grain)`}/>
    {wild ? <g mask={`url(#${id}-final-clearance)`}>
      <path d="M218 209q190-63 396 14l-18 105q-238-46-376 21ZM956 311q135-27 331 44l-13 69q-203-62-310-13Z" fill="#a9bcae" opacity=".44"/>
      <path d="M546 444 589 474 651 491 704 456 760 409 829 383 909 372 993 391 1058 404 1132 438 1222 455 1319 505 1397 541V669L1331 625 1232 584 1132 553 1051 518 967 503 906 493 848 516 791 547 731 596 665 607 600 581 547 579Z" fill="#adbfB5"/>
      <path d="M546 462 591 489 654 505 706 474 763 429 832 401 909 393 990 411 1055 422 1126 453 1213 475 1315 524 1397 561V651L1326 607 1227 568 1138 535 1051 502 968 486 906 475 844 500 787 531 726 578 665 589 603 562 546 559Z" fill="#c7d7ca"/>
      <path d={river} fill="none" stroke="#f0eee0" strokeWidth="77"/>
      <path d={river} fill="none" stroke="#91babb" strokeWidth="58"/>
      <path d={river} fill="none" stroke="#6f9fa5" strokeWidth="28" opacity=".6"/>
      <path d={river} fill="none" stroke="#d6e9df" strokeWidth="2"/>
      <path d="M724 557l29-21m53-88 32-17m109 30 29 8m138 24 44 18m138 52 31 12" stroke="#dbece2" strokeWidth="3" fill="none"/>
      <path d="M738 451l9-17 27-8M979 396l31 4 16 10M1305 509l22 7m-154 42 21 5" stroke="#90a99f" strokeWidth="3" fill="none"/>
      <path d="M806 172q112-63 210 18l-10 20-106-24-65 25Z" fill="#b4c5b8"/>
      <path d="M841 175q65-31 116 1l-43-8-30 15Z" fill="#edf0e7"/>
    </g> : <g mask={`url(#${id}-final-clearance)`}>
      <rect x="315" y="65" width="870" height="870" rx="39" fill="#d5ddda"/>
      <rect x="374" y="124" width="752" height="752" rx="30" fill="#e2e6df"/>
      <rect x="494" y="244" width="512" height="512" rx="25" fill="#c9d5d1"/>
      <rect x="549" y="299" width="402" height="402" rx="32" fill="#e2e8de"/>
      {[[420,175],[1080,175],[420,825],[1080,825]].map(([x,y]) => <g key={`${x}-${y}`}><rect x={x-26} y={y-23} width="52" height="46" rx="17" fill="#b9cdb8"/><path d={`M${x-15} ${y}h30M${x} ${y-13}v26`} stroke="#dfe8d6" strokeWidth="3"/></g>)}
    </g>}
    {wild ? <ValleyLandmarks/> : <CityLandmarks/>}
    {plants.map((plant,i) => <ValleyTree key={i} plant={plant} wild={wild}/>)}
  </g>;
}

export function FinalRegionCrossings({ map }: { map: MapData }) {
  if(map.id!=='hushedValley') return null;
  return <g aria-hidden="true" pointerEvents="none">
    {[[660,520,0],[1200,500,90],[1320,590,0]].map(([x,y,angle]) => <g key={x} transform={`translate(${x} ${y}) rotate(${angle})`} data-river-crossing="">
      <rect x="-17" y="-63" width="34" height="126" rx="2" fill="#c7c4a7" stroke="#9ea78f"/>
      {Array.from({length:11},(_,i)=><path key={i} d={`M-15 ${-59+i*11}h30`} stroke="#e0dfc7" strokeWidth="2"/>)}
      <path d="M-22-63V63M22-63V63" stroke="#829b8e" strokeWidth="3"/>
      {[-63,0,63].map(y=><path key={y} d={`M-25 ${y}h7m36 0h7`} stroke="#778f82" strokeWidth="4"/>)}
    </g>)}
  </g>;
}
