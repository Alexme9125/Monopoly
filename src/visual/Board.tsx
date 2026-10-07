import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent } from 'react';
import type { GameState, MapData, Player, Shape } from '../game/types';
import { Building2, Coins, Flag, HeartPulse, Landmark, ParkingCircle, RadioTower, Shield, ShoppingBag, Sparkles, TrainFront, UtilityPole, Waves, Dices, Coffee } from 'lucide-react';
import { getLotLayout, overlap, segmentDistance, type Lot } from './sceneLayout';
import { FeedbackMoment, TurnMoment, useTurnPresentation } from './TurnPresentation';
import { getTileRentPreview } from '../game/engine';
import { focusCameraPan, followCameraPan, screenDragToPan, type CameraViewport } from './cameraMath';
import { layoutStationMarkers } from './stationLayout';
import { PropertyLevelGlyph, PropertyLevelIcon, propertyLevelName } from './PropertyLevel';
import { getAvailableLandLevel, getLandPurchasePrice, getMaxLandLevel } from '../game/propertyRules';
import { SunderedBridges, SunderedTerrain } from './SunderedTerrain';
import { NewRegionTerrain } from './NewRegionTerrain';
import { CanyonHavenCrossings, CanyonHavenTerrain } from './CanyonHavenTerrain';
import { FinalRegionCrossings, FinalRegionsTerrain } from './FinalRegionsTerrain';
import { BeaconDirectionCard, BeaconDirectionRoads } from './BeaconDirectionPreview';
import { getNextStepOptions } from '../game/routing';
import { beaconHitShape } from './beaconHitArea';
import { placeBeaconName } from './beaconNameLabel';
import { isCoveredEventFeedback } from './feedbackVisibility';

interface BoardProps { map: MapData; state?: GameState; viewerId?: string; selectedNode?: number | null; onSelectNode?: (id: number) => void; onMovementComplete?: () => void; preview?: boolean; zoom?: number; playing?: boolean; feedbackBlocked?: boolean; stationSelection?: { originId: number; destinationIds: number[]; disabled?: boolean }; itemSelection?: { itemName: string; nodeIds: number[]; selectedNodeId?: number; disabled?: boolean }; }
const hiddenWeather = new Set(['rain', 'storm', 'sand', 'sandstorm', 'mist', 'fog', 'haze', 'glitch', 'paradox']);
const symbols = {start:Flag,hospital:HeartPulse,prison:Shield,sanatorium:Coffee,parking:ParkingCircle,power:UtilityPole,water:Waves,telecom:RadioTower,station:TrainFront,shop:ShoppingBag,casino:Dices,exchange:Landmark,event:Sparkles,coin:Coins,land:Building2};
const pseudo = (i:number, salt=0) => { const v=Math.sin(i*127.1+salt*311.7)*43758.5453; return v-Math.floor(v); };
const targetCorners = (x:number,y:number,r=29,c=10) => `M${x-r+c} ${y-r}H${x-r}V${y-r+c}M${x+r-c} ${y-r}H${x+r}V${y-r+c}M${x-r} ${y+r-c}V${y+r}H${x-r+c}M${x+r} ${y+r-c}V${y+r}H${x+r-c}`;

export function BeaconShape({shape, color, size=20}: {shape:Shape; color:string; size?:number}) {
  return <svg width={size} height={size} viewBox="-16 -16 32 32" aria-hidden="true"><ShapeGlyph shape={shape} color={color}/></svg>;
}
function ShapeGlyph({shape,color}:{shape:Shape;color:string}) {
  if(shape==='circle') return <circle r="11" fill={color} stroke="white" strokeWidth="2.5"/>;
  if(shape==='triangle') return <path d="M0 -13 12 10 -12 10Z" fill={color} stroke="white" strokeWidth="2.5" strokeLinejoin="round"/>;
  if(shape==='hexagon') return <path d="M-6 -11 6 -11 13 0 6 11 -6 11 -13 0Z" fill={color} stroke="white" strokeWidth="2.5" strokeLinejoin="round"/>;
  return <path d="M0 -14 11 0 0 14 -11 0Z" fill={color} stroke="white" strokeWidth="2.5" strokeLinejoin="round"/>;
}
function Tree({x,y,s=1,variant=0}:{x:number;y:number;s?:number;variant?:number}) {
  const dark = ['#739585','#86A68C','#668878','#93B49D'][variant%4];
  const light = ['#A7C3AA','#B7CCAC','#92B59E','#B9CDB4'][variant%4];
  return <g transform={`translate(${x} ${y}) scale(${s})`} className="scenery-tree">
    <ellipse cx="7" cy="5" rx="16" ry="6" fill="#446F56" opacity=".12"/>
    <path d="M0 3V-22" stroke="#8C9B80" strokeWidth="4" strokeLinecap="round"/>
    {variant%3===0 ? <><path d="M0-54 -17-20H-10L-20-8H20L10-20H17Z" fill={dark}/><path d="M0-54 -2-9H-20L-10-20H-17Z" fill={light}/></> : <><ellipse cy="-30" rx="17" ry="23" fill={dark}/><ellipse cx="-5" cy="-34" rx="12" ry="18" fill={light}/><ellipse cx="-9" cy="-39" rx="5" ry="8" fill="white" opacity=".13"/></>}
  </g>;
}
function lakeInside(x:number,y:number) { return ((x-876)/208)**2+((y-490)/142)**2<1.15; }

function Terrain({map,id,lots}:{map:MapData;id:string;lots:Record<number,Lot>}) {
 const island=map.id==='valley'?'M42-85Q-35-85-35-5V990Q-35 1080 60 1080H1440Q1545 1080 1545 990V5Q1545-85 1440-85Z':'M161 137Q195 79 304 91L1218 91Q1347 107 1366 187L1385 739Q1404 859 1290 896L279 919Q139 894 130 801L113 258Q108 165 161 137Z';
 const trees=useMemo(()=>{
  if (map.id === 'sundered' || map.id === 'forest' || map.id === 'starSands' || map.id === 'ashCanyon' || map.id === 'peachHaven' || map.id === 'hushedValley' || map.id === 'grandCity') return [];
  const edges=map.nodes.flatMap(n=>n.neighbors.filter(i=>i>n.id).map(i=>[n,map.nodes[i]] as const));
  return Array.from({length:310},(_,i)=>({x:125+pseudo(i,3)*1250,y:95+pseudo(i,7)*810,s:.5+pseudo(i,11)*.35,v:i%4})).filter(t=>{
   if(map.id==='lake'&&lakeInside(t.x,t.y))return false;
   if(map.id==='valley'&&(((t.x-480)/82)**2+((t.y-465)/95)**2<1||((t.x-1020)/80)**2+((t.y-565)/95)**2<1||Math.abs(t.x-750)<32))return false;
   if(map.id==='coast'&&(t.y>870||((t.x-450)/152)**2+((t.y-320)/100)**2<1.15||((t.x-1050)/152)**2+((t.y-660)/90)**2<1.15))return false;
   const box={left:t.x-20,top:t.y-55,right:t.x+20,bottom:t.y+8};
   return Object.values(lots).every(l=>!overlap(box,l.bounds,13))&&edges.every(([a,b])=>[t.y,t.y-25,t.y-50].every(y=>segmentDistance(t.x,y,a,b)>45));
  }).sort((a,b)=>a.y-b.y);
 },[map,lots]);
 if (map.id === 'forest' || map.id === 'starSands') return <NewRegionTerrain map={map} lots={lots} id={id}/>;
 if (map.id === 'ashCanyon' || map.id === 'peachHaven') return <CanyonHavenTerrain map={map} lots={lots} id={id}/>;
 if (map.id === 'hushedValley' || map.id === 'grandCity') return <FinalRegionsTerrain map={map} lots={lots} id={id}/>;
 return <>
  <defs>
   <linearGradient id={`${id}-water`} x1="0" y1="0" x2=".7" y2="1"><stop stopColor="#B9DDE0"/><stop offset="1" stopColor="#82B8C5"/></linearGradient>
   <linearGradient id={`${id}-land`} x1="0" y1="0" x2=".7" y2="1"><stop stopColor={map.id==='coast'?'#E6DEC5':map.id==='sundered'?'#c5d3c4':'#DCE6D0'}/><stop offset="1" stopColor={map.id==='valley'?'#C4D5B9':map.id==='sundered'?'#a9bbaa':'#D0DEC5'}/></linearGradient>
   <filter id={`${id}-shadow`} x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="14"/></filter>
   <pattern id={`${id}-grain`} patternUnits="userSpaceOnUse" width="42" height="42"><circle cx="4" cy="6" r=".8" fill="#4F755B" opacity=".09"/><circle cx="27" cy="25" r=".65" fill="#4F755B" opacity=".09"/></pattern>
  </defs>
  <ellipse cx="760" cy="893" rx="597" ry="37" fill="#688A7E" opacity=".1" filter={`url(#${id}-shadow)`}/>
  <path d={island} fill="#B8CDBB" transform="translate(0 16)"/>
  <path d={island} fill={`url(#${id}-land)`}/>
  <path d={island} fill={`url(#${id}-grain)`}/>
  {map.id==='lake'&&<>
    <path d="M719 380C780 333 921 322 1010 354Q1124 394 1073 510C1050 558 993 619 909 637Q801 664 723 592C677 551 657 429 719 380Z" fill="#C3D4BB" stroke="#ECEDD5" strokeWidth="15"/>
    <path d="M727 389C789 345 924 338 1007 367Q1108 403 1061 507C1035 555 984 606 906 622Q803 648 735 582C693 542 674 436 727 389Z" fill={`url(#${id}-water)`}/>
    <path d="M746 400Q872 342 992 377M724 564Q793 639 917 615" stroke="#D2ECE8" strokeWidth="3" fill="none" opacity=".8"/>
    {Array.from({length:12},(_,i)=><path key={i} d={`M${758+pseudo(i,7)*215} ${412+i*14}q13-4 26 0`} fill="none" stroke="#D7EEEA" opacity=".6" strokeWidth="2"/>)}
    <g transform="translate(935 468) rotate(-14)"><ellipse cy="8" rx="27" ry="5" fill="#6CA4B5" opacity=".2"/><path d="M-23 0H25L15 7H-14Z" fill="#FAF8E6"/><path d="M1-40V-3H-18Z" fill="#F7F3D9"/><path d="M5-35V-3H23Z" fill="#DEB39A"/></g>
    <g transform="translate(1029 553) rotate(25)"><rect x="0" y="0" width="47" height="18" rx="2" fill="#BBAB84"/>{[0,1,2,3,4,5].map(i=><path key={i} d={`M${4+i*7} 1V17`} stroke="#E4D6B2" strokeWidth="2"/>)}</g>
    <text x="867" y="538" textAnchor="middle" className="map-water-label">棱 镜 湖</text>
  </>}
  {map.id==='coast'&&<>
    <path d="M120 863Q430 918 740 874T1380 861L1389 944H125Z" fill="#ECE2C4"/>
    <path d="M125 892Q460 940 730 905T1386 888V952H125Z" fill={`url(#${id}-water)`}/>
    <path d="M149 903Q461 950 735 917T1358 901" fill="none" stroke="#F1F6E8" strokeWidth="4"/>
    {[{x:450,y:320,ry:87},{x:1050,y:660,ry:80}].map((bay,i)=><g key={i}>
      <ellipse cx={bay.x} cy={bay.y} rx="150" ry={bay.ry+7} fill="#F0E7CC"/>
      <ellipse cx={bay.x} cy={bay.y} rx="137" ry={bay.ry-5} fill={`url(#${id}-water)`}/>
      <path d={`M${bay.x-93} ${bay.y-34}q93-40 179 1M${bay.x-80} ${bay.y+37}q70 28 153-3`} fill="none" stroke="#DDEFE6" strokeWidth="3" opacity=".8"/>
      <text x={bay.x} y={bay.y+8} textAnchor="middle" className="map-water-label">{i?'暮 帆 湾':'晨 潮 湾'}</text>
    </g>)}
    <g transform="translate(504 347)"><path d="M-18 0H20L13 7H-12Z" fill="#F8F2DF"/><path d="M0-32V-1H-15Z" fill="#DAB098"/><path d="M4-27V-1H17Z" fill="#F4F3DF"/></g>
  </>}
  {map.id==='valley'&&<>
    <path d="M750 210Q711 352 750 468T750 655Q810 735 750 810" fill="none" stroke="#DDE7CA" strokeWidth="45"/>
    <path d="M750 210Q711 352 750 468T750 655Q810 735 750 810" fill="none" stroke="#9ECAC8" strokeWidth="27"/>
    <path d="M750 210Q711 352 750 468T750 655Q810 735 750 810" fill="none" stroke="#D6EBDA" strokeWidth="2"/>
    {[{x:480,y:520,w:39,h:108},{x:1020,y:620,w:38,h:108}].map((m,i)=><g key={i}><ellipse cx={m.x+7} cy={m.y+8} rx={m.w} ry="25" fill="#94AD96" opacity=".23"/><path d={`M${m.x-m.w} ${m.y}Q${m.x-30} ${m.y-m.h+28} ${m.x} ${m.y-m.h}L${m.x+m.w} ${m.y}Z`} fill="#A3B7A0"/><path d={`M${m.x-m.w} ${m.y}Q${m.x-30} ${m.y-m.h+28} ${m.x} ${m.y-m.h}L${m.x+10} ${m.y}Z`} fill="#C2CCAE"/><path d={`M${m.x-25} ${m.y-m.h+34}L${m.x} ${m.y-m.h} ${m.x+28} ${m.y-m.h+39} ${m.x+4} ${m.y-m.h+30} ${m.x-9} ${m.y-m.h+41}Z`} fill="#E7E9D3"/></g>)}
    <text x="753" y="399" textAnchor="middle" className="map-district-label" transform="rotate(-86 753 399)">萤 火 溪</text>
  </>}
  {map.id==='sundered'&&<SunderedTerrain map={map} lots={lots} id={id}/>}
  {map.id!=='sundered'&&Array.from({length:26},(_,i)=>({x:160+pseudo(i,25)*1170,y:120+pseudo(i,19)*740})).filter(t=>map.nodes.every(n=>Math.hypot(n.x-t.x,n.y-t.y)>75)&&Object.values(lots).every(l=>!overlap({left:t.x-12,right:t.x+12,top:t.y-15,bottom:t.y+3},l.bounds,10))&&!(map.id==='lake'&&lakeInside(t.x,t.y))).map((t,i)=><g key={i} transform={`translate(${t.x} ${t.y})`} opacity=".5"><path d="M0 0q-6-12-8-4M1 0q0-14 5-7M3 0q9-9 10-3" stroke="#8CA484" strokeWidth="2" fill="none" strokeLinecap="round"/></g>)}
  {trees.map((t,i)=><Tree key={i} {...t} variant={t.v}/>)}
 </>;
}

export default function Board({map,state,viewerId,selectedNode,onSelectNode,onMovementComplete,preview=false,zoom=1,playing=true,feedbackBlocked=false,stationSelection,itemSelection}:BoardProps) {
 const id=useId().replace(/:/g,'');
 const boardRef=useRef<HTMLDivElement>(null);
 const svgRef=useRef<SVGSVGElement>(null);
 const [svgSize,setSvgSize]=useState({width:0,height:0});
 const [hovered,setHovered]=useState<{id:number;x:number;y:number}|null>(null);
 const [directionSelection,setDirectionSelection]=useState<{playerId:string;pinned:boolean}|null>(null);
 const directionCloseTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const directionCardHovered=useRef(false);
 const directionSuppressedUntil=useRef(0);
 const [pan,setPan]=useState({x:0,y:0});
 const panRef=useRef(pan);
 panRef.current=pan;
 const applyPan=(next:{x:number;y:number})=>{panRef.current=next;setPan(next);};
 const [cameraMode,setCameraMode]=useState<'idle'|'focus'|'follow'|'drag'>('idle');
 const cameraPhase=useRef<'idle'|'focus'|'follow'|'drag'>('idle');
 const focusFrame=useRef<number|null>(null);
 const [mobileCamera,setMobileCamera]=useState(()=>typeof window!=='undefined'&&typeof window.matchMedia==='function'&&window.matchMedia('(max-width: 850px), (pointer: coarse)').matches);
 const drag=useRef<{x:number;y:number;px:number;py:number}|null>(null);
 const dragged=useRef(false);
 const clearDragTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const moving=state?.movement;
 useEffect(()=>()=>{if(clearDragTimer.current!==null)clearTimeout(clearDragTimer.current);},[]);
 useEffect(()=>()=>{if(directionCloseTimer.current!==null)clearTimeout(directionCloseTimer.current);},[]);
 useLayoutEffect(()=>{applyPan({x:0,y:0});setHovered(null);},[map.id,zoom]);
 useEffect(()=>{if(stationSelection){applyPan({x:0,y:0});setHovered(null);}},[stationSelection?.originId]);
 useEffect(()=>{
  if(typeof window.matchMedia!=='function')return;
  const media=window.matchMedia('(max-width: 850px), (pointer: coarse)');
  const update=()=>setMobileCamera(media.matches);
  update();media.addEventListener('change',update);
  return()=>media.removeEventListener('change',update);
 },[]);
 useEffect(()=>{
  const svg=svgRef.current;
  if(!svg)return;
  const update=()=>setSvgSize({width:svg.clientWidth,height:svg.clientHeight});
  update();
  const observer=new ResizeObserver(update);
  observer.observe(svg);
  return()=>observer.disconnect();
 },[]);
 const moment=useTurnPresentation(moving,map,playing,onMovementComplete);
 const momentRef=useRef(moment);
 momentRef.current=moment;
 useEffect(()=>{if(moment)setHovered(null);},[moment?.movement.id]);
 const lots=useMemo(()=>getLotLayout(map),[map]);
 const parcelBounds=useMemo(()=>Object.values(lots).map(lot=>lot.bounds),[lots]);
 const presented=useRef<{id:number|null;stages:string[]}>({id:null,stages:[]});
 if(moment){
   if(presented.current.id!==moment.movement.id)presented.current={id:moment.movement.id,stages:[]};
   if(presented.current.stages.at(-1)!==moment.stage)presented.current.stages.push(moment.stage);
 }
 const edges=useMemo(()=>map.nodes.flatMap(n=>n.neighbors.filter(i=>i>n.id).map(i=>[n,map.nodes[i]] as const)),[map]);
 const roadPath=edges.map(([a,b])=>`M${a.x} ${a.y}L${b.x} ${b.y}`).join(' ');
 const weather=state?.weatherId??'soft';
 const players:Player[]=state?.players??[];
 const viewBox=map.id==='valley'?{x:-90,y:-125,width:1680,height:1240}:{x:40,y:15,width:1420,height:950};
 const baseScale=svgSize.width&&svgSize.height?Math.min(svgSize.width/viewBox.width,svgSize.height/viewBox.height):1;
 const labelScale=1/(baseScale*zoom);
 const letterboxX=(svgSize.width-viewBox.width*baseScale)/2;
 const letterboxY=(svgSize.height-viewBox.height*baseScale)/2;
 const cameraViewport:CameraViewport={width:svgSize.width,height:svgSize.height,viewBox,zoom};
 const viewportRef=useRef(cameraViewport);
 viewportRef.current=cameraViewport;
 const cameraEnabled=mobileCamera&&zoom>1&&!preview&&!stationSelection&&!itemSelection&&playing&&!!moment&&svgSize.width>0&&svgSize.height>0;
 const directionEnabled=!preview&&!!state&&state.phase!=='gameover'&&!stationSelection&&!itemSelection&&!moment&&!(playing&&moving);
 const directionResetKey=`${map.id}|${zoom}|${state?.day}|${state?.currentPlayerIndex}|${players.map(player=>`${player.id}:${player.position}:${player.previousPosition}:${player.routeNextPosition}:${player.confinement?.remaining??0}:${player.bankrupt}`).join(';')}`;
 const directionPlayer=directionEnabled?players.find(player=>player.id===directionSelection?.playerId&&!player.bankrupt):undefined;
 const directionCompanions=directionPlayer?players.filter(player=>!player.bankrupt&&player.position===directionPlayer.position):[];
 const directionOptions=directionPlayer&&!directionPlayer.confinement?.remaining?getNextStepOptions(map,directionPlayer):[];
 const directionSlot=directionPlayer?directionCompanions.findIndex(player=>player.id===directionPlayer.id):0;
 const directionOffset=directionCompanions.length>1?(directionSlot-(directionCompanions.length-1)/2)*12:0;
 const directionNode=directionPlayer?map.nodes[directionPlayer.position]:undefined;
 const directionAnchor=directionNode?{
  x:letterboxX+(((directionNode.x+directionOffset-750)*zoom+750+pan.x)-viewBox.x)*baseScale,
  y:letterboxY+(((directionNode.y-500)*zoom+500+pan.y)-viewBox.y)*baseScale,
 }:undefined;
 const clearDirectionClose=()=>{if(directionCloseTimer.current!==null){clearTimeout(directionCloseTimer.current);directionCloseTimer.current=null;}};
 const closeDirection=()=>{clearDirectionClose();directionCardHovered.current=false;setDirectionSelection(null);};
 const scheduleDirectionClose=()=>{if(directionCardHovered.current)return;clearDirectionClose();directionCloseTimer.current=setTimeout(()=>{setDirectionSelection(current=>current&&!current.pinned?null:current);directionCloseTimer.current=null;},170);};
 const previewDirection=(playerId:string)=>{
  if(!directionEnabled||drag.current||dragged.current||Date.now()<directionSuppressedUntil.current)return;
  clearDirectionClose();setHovered(null);
  setDirectionSelection(current=>current?.pinned?current:{playerId,pinned:false});
 };
 const toggleDirection=(playerId:string)=>{
  if(!directionEnabled||dragged.current||Date.now()<directionSuppressedUntil.current)return;
  clearDirectionClose();setHovered(null);
  setDirectionSelection(current=>current?.playerId===playerId&&current.pinned?null:{playerId,pinned:true});
 };
 useEffect(()=>{closeDirection();},[directionResetKey,directionEnabled]);
 useEffect(()=>{
  if(!directionSelection)return;
  const onEscape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();closeDirection();}};
  const insideDirection=(target:EventTarget|null)=>{
   if(!(target instanceof Element))return false;
   const beacon=target.closest('.player-beacon');
   if(beacon&&boardRef.current?.contains(beacon))return true;
   const card=target.closest('.beacon-direction-card');
   return !!card&&(boardRef.current?.contains(card)||card.parentElement===boardRef.current?.parentElement);
  };
  const onOutsidePointer=(event:globalThis.PointerEvent)=>{
   if(insideDirection(event.target))return;
   closeDirection();
  };
  const onFocusIn=(event:FocusEvent)=>{
   if(insideDirection(event.target)){clearDirectionClose();return;}
   setDirectionSelection(current=>current&&!current.pinned?null:current);
  };
  document.addEventListener('keydown',onEscape);
  document.addEventListener('pointerdown',onOutsidePointer);
  document.addEventListener('focusin',onFocusIn);
  return()=>{document.removeEventListener('keydown',onEscape);document.removeEventListener('pointerdown',onOutsidePointer);document.removeEventListener('focusin',onFocusIn);};
 },[directionSelection?.playerId]);
 useLayoutEffect(()=>{
  if(focusFrame.current!==null){cancelAnimationFrame(focusFrame.current);focusFrame.current=null;}
  if(!cameraEnabled||!moment){cameraPhase.current='idle';setCameraMode('idle');return;}
  const target=focusCameraPan(moment.point,cameraViewport);
  const reduced=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(reduced||moment.movement.dice===false){applyPan(target);cameraPhase.current='follow';setCameraMode('follow');return;}
  const from={...panRef.current};
  const start=performance.now();
  cameraPhase.current='focus';setCameraMode('focus');
  const frame=(now:number)=>{
   if(cameraPhase.current!=='focus')return;
   const progress=Math.max(0,Math.min(1,(now-start)/400));
   const ease=progress*progress*(3-2*progress);
   applyPan({x:from.x+(target.x-from.x)*ease,y:from.y+(target.y-from.y)*ease});
   if(progress<1)focusFrame.current=requestAnimationFrame(frame);
   else{focusFrame.current=null;cameraPhase.current='follow';setCameraMode('follow');}
  };
  focusFrame.current=requestAnimationFrame(frame);
  return()=>{if(focusFrame.current!==null){cancelAnimationFrame(focusFrame.current);focusFrame.current=null;}};
 },[cameraEnabled,moment?.movement.id,map.id,zoom,svgSize.width,svgSize.height]);
 useLayoutEffect(()=>{
  if(!cameraEnabled||cameraMode!=='follow')return;
  const reduced=typeof window.matchMedia==='function'&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let frame=0,last=performance.now();
  const follow=(now:number)=>{
   if(cameraPhase.current!=='follow'||!momentRef.current)return;
   const current=panRef.current;
   const desired=followCameraPan(momentRef.current.point,current,viewportRef.current);
   const elapsed=Math.max(0,Math.min(64,now-last));last=now;
   const ease=reduced||momentRef.current.segmentKind==='transfer'?1:1-Math.exp(-elapsed/85);
   const next={x:current.x+(desired.x-current.x)*ease,y:current.y+(desired.y-current.y)*ease};
   if(Math.abs(next.x-current.x)>0.1||Math.abs(next.y-current.y)>0.1)applyPan(next);
   frame=requestAnimationFrame(follow);
  };
  frame=requestAnimationFrame(follow);
  return()=>cancelAnimationFrame(frame);
 },[cameraEnabled,cameraMode,moment?.movement.id,zoom,svgSize.width,svgSize.height]);
 const controlElement=stationSelection?boardRef.current?.parentElement?.querySelector<HTMLElement>('.map-controls'):null;
 const controlBounds=controlElement?.getBoundingClientRect();
 const svgBounds=svgRef.current?.getBoundingClientRect();
 const reservedControls=controlBounds&&svgBounds?[{left:controlBounds.left-svgBounds.left,top:controlBounds.top-svgBounds.top,
  right:controlBounds.right-svgBounds.left,bottom:controlBounds.bottom-svgBounds.top}]:[];
 const stationMarkers=stationSelection&&svgSize.width?layoutStationMarkers(
  [stationSelection.originId,...stationSelection.destinationIds].filter((nodeId,index,ids)=>ids.indexOf(nodeId)===index).map(nodeId=>{
   const node=map.nodes[nodeId];
   return {id:nodeId,x:letterboxX+(((node.x-750)*zoom+750+pan.x)-viewBox.x)*baseScale,y:letterboxY+(((node.y-500)*zoom+500+pan.y)-viewBox.y)*baseScale};
  }),svgSize.width,svgSize.height,reservedControls):[];
 const stepLabel=moment?.stage==='weather'
  ? moment.label||'天气变化'
  : moment?.stage==='move'
   ? moment.segmentKind==='weather'
    ? `${(moment.label||'天气位移').split(' · ')[0]} ${moment.stepIndex??1}/${moment.stepCount??1} 格`
    : moment.segmentKind==='transfer'
     ? moment.label||'正在抵达'
     : `行进 ${moment.stepIndex??1}/${moment.stepCount??1} 格`
   : null;
 const stepSegment=moment?.stage==='weather'?'weather':moment?.segmentKind;
 const stepState=moment?.stage==='weather'?'cue':moment?.stepState??(moment?'idle':undefined);
 const weatherClass=['snow','blizzard'].includes(weather)?'snow':['drizzle','rain','thunder','storm','acid','glitch','freezing'].includes(weather)?'rain':['mist','fog','haze'].includes(weather)?'fog':['sand','sandstorm','gale'].includes(weather)?'sand':weather==='breeze'?'breeze':weather==='paradox'?'paradox':['warm','hot','heat','scorch','drought'].includes(weather)?'heat':weather==='fireflies'?'fireflies':'clear';
 const hoverNode=hovered?map.nodes[hovered.id]:undefined;
 const hoverProperty=hoverNode?state?.properties[hoverNode.id]:undefined;
 const hoverOwner=players.find(p=>p.id===hoverProperty?.ownerId);
 const hoverQuote=state&&hoverNode?getTileRentPreview(state,hoverNode.id,viewerId):undefined;
 const hoverAvailableLevel=state&&hoverNode?.kind==='land'&&!hoverProperty?getAvailableLandLevel(state,hoverNode.id):0;
 const hoverPurchasePrice=state&&hoverNode&&!hoverProperty?getLandPurchasePrice(state,hoverNode.id):0;
 const feedbackNotice=isCoveredEventFeedback(state?.feedback,state?.notices);
 useEffect(()=>{if(itemSelection)setHovered(null);},[itemSelection]);
 const showHover=(nodeId:number,element:SVGGElement)=>{
  if(preview||!state||moment||directionPlayer||stationSelection||itemSelection&&!itemSelection.nodeIds.includes(nodeId)||dragged.current)return;
  const rect=element.getBoundingClientRect(),board=boardRef.current?.getBoundingClientRect();
  if(board)setHovered({id:nodeId,x:Math.max(12,Math.min(board.width-256,rect.x-board.x+rect.width/2-122)),y:Math.max(12,Math.min(board.height-230,rect.y-board.y+rect.height+10))});
 };
 const handleDown=(e:PointerEvent<SVGSVGElement>)=>{if(preview||e.button!==0)return;if(clearDragTimer.current!==null){clearTimeout(clearDragTimer.current);clearDragTimer.current=null;}drag.current={x:e.clientX,y:e.clientY,px:panRef.current.x,py:panRef.current.y};dragged.current=false;};
 const handleMove=(e:PointerEvent<SVGSVGElement>)=>{
  if(!drag.current)return;
  if(!svgSize.width||!svgSize.height)return;
  const dx=e.clientX-drag.current.x,dy=e.clientY-drag.current.y;
  if(Math.abs(dx)+Math.abs(dy)<=5&&!dragged.current)return;
  if(!dragged.current){
   dragged.current=true;setHovered(null);closeDirection();directionSuppressedUntil.current=Date.now()+220;
   if(cameraEnabled){if(focusFrame.current!==null){cancelAnimationFrame(focusFrame.current);focusFrame.current=null;}cameraPhase.current='drag';setCameraMode('drag');}
  }
  const delta=screenDragToPan(dx,dy,cameraViewport);
  applyPan({x:drag.current.px+delta.x,y:drag.current.py+delta.y});
 };
 const handleRelease=()=>{if(!drag.current)return;const moved=dragged.current;drag.current=null;if(moved&&cameraEnabled){cameraPhase.current='follow';setCameraMode('follow');}if(moved){directionSuppressedUntil.current=Date.now()+220;clearDragTimer.current=setTimeout(()=>{dragged.current=false;clearDragTimer.current=null;},0);}};
 const handleCancel=()=>{if(dragged.current){closeDirection();directionSuppressedUntil.current=Date.now()+220;}drag.current=null;dragged.current=false;if(clearDragTimer.current!==null){clearTimeout(clearDragTimer.current);clearDragTimer.current=null;}if(cameraEnabled&&cameraPhase.current==='drag'){cameraPhase.current='follow';setCameraMode('follow');}};
 return <div ref={boardRef} className={`prism-board ${preview?'is-preview':''} ${stationSelection?'is-station-selecting':''} ${itemSelection?'is-item-selecting':''} weather-${weatherClass} sky-${weather}`} data-playing={playing} data-movement={moving?.id} data-phase={moment?.stage} data-step-index={moment?.stepIndex} data-step-count={moment?.stepCount} data-segment={stepSegment} data-step-state={stepState} data-camera-mode={cameraEnabled?cameraMode:'idle'} data-camera-target={cameraEnabled?moment?.movement.playerId:undefined} data-camera-target-x={cameraEnabled?moment?.point.x.toFixed(1):undefined} data-camera-target-y={cameraEnabled?moment?.point.y.toFixed(1):undefined} data-camera-pan-x={pan.x.toFixed(1)} data-camera-pan-y={pan.y.toFixed(1)} data-direction-player={directionPlayer?.id} data-direction-pinned={!!directionSelection?.pinned} data-direction-options={directionPlayer?directionOptions.join(','):undefined} data-presented-stages={presented.current.stages.join(",")} data-presented-movement={presented.current.id}>
  <svg ref={svgRef} className="world-svg" viewBox={map.id==='valley'?'-90 -125 1680 1240':'40 15 1420 950'} role={preview?'img':'group'} aria-label={`${map.name}地图，${map.nodes.length}个地点${preview?'':stationSelection?'，在地图上点选目的车站，拖动平移':itemSelection?`，在地图上为${itemSelection.itemName}选择目标，拖动平移`:'，悬停或点击地块查看价格和租金；悬停、点选或聚焦信标查看下次前进方向，拖动平移'}`} onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleRelease} onPointerLeave={handleRelease} onPointerCancel={handleCancel}>
   <g transform={`translate(${750+pan.x} ${500+pan.y}) scale(${zoom}) translate(-750 -500)`}>
    <Terrain map={map} id={id} lots={lots}/>
    <g fill="none" strokeLinecap="round" strokeLinejoin="round"><path d={roadPath} stroke="#AEC1AD" strokeWidth="43" opacity=".5" transform="translate(0 3)"/><path d={roadPath} stroke="#FBF8E8" strokeWidth="40"/><path d={roadPath} stroke="#B4BBA2" strokeWidth="1.5" strokeDasharray="5 8"/></g>
    {map.id==='sundered'&&<SunderedBridges/>}
    <CanyonHavenCrossings map={map}/>
    <FinalRegionCrossings map={map}/>
    <g>
    {map.nodes.map(node=>{
      const property=state?.properties[node.id],owner=players.find(p=>p.id===property?.ownerId),pos=lots[node.id]??node,kind=node.kind;
      const facility=!['land','empty','coin','event','start'].includes(kind);
      const target=!!itemSelection?.nodeIds.includes(node.id);
      const selected=itemSelection?node.id===itemSelection.selectedNodeId:node.id===selectedNode;
      const clickable=!!onSelectNode&&!stationSelection&&(!itemSelection||target&&!itemSelection.disabled);
      const color=owner?.color??'#657871';
      const land=kind==='land';
      const availableLevel=land&&!owner?(state?getAvailableLandLevel(state,node.id):node.prefabLevel??0):0;
      const prefab=land&&!owner&&availableLevel>0;
      const maxLevel=getMaxLandLevel(map.id);
      const Glyph=symbols[kind as keyof typeof symbols];
      const purchasable=land||['power','water','telecom'].includes(kind);
      const seat=owner?players.findIndex(p=>p.id===owner.id)+1:0;
      const tileScale=lots[node.id]?(lots[node.id].bounds.right-lots[node.id].bounds.left)/46:1;
      const status=owner?`P${seat}${land?` · ${propertyLevelName(property!.level,maxLevel)}`:''}${property?.mortgaged?' · 抵押':''}`:purchasable?`待售${prefab?` · ${availableLevel}层`:''}`:'公共';
      const shortName:Record<string,string>={hospital:'医院',prison:'监狱',sanatorium:'疗养',parking:'停车',power:'电厂',water:'水厂',telecom:'电信',station:'车站',shop:'商店',casino:'赌场',exchange:'交易所'};
      return <g key={node.id} data-node-id={node.id} data-item-target={itemSelection?target:undefined} className={`map-node ${selected?'is-selected':''} ${target?'item-target-node':''}`} role={clickable?'button':undefined} tabIndex={clickable?0:undefined} aria-label={itemSelection&&target?`${selected?'已选目标':'可选目标'}：#${node.id} ${node.name}，使用${itemSelection.itemName}`:`#${node.id} ${node.name}，${owner?`${owner.name}持有，${status}`:status}`} pointerEvents={itemSelection&&!target?'none':undefined} onPointerEnter={e=>{if(e.pointerType!=='touch')showHover(node.id,e.currentTarget);}} onPointerLeave={()=>setHovered(null)} onFocus={e=>showHover(node.id,e.currentTarget)} onBlur={()=>setHovered(null)} onClick={()=>{if(!dragged.current&&clickable){closeDirection();setHovered(null);onSelectNode?.(node.id);}}} onKeyDown={e=>{if(clickable&&(e.key==='Enter'||e.key===' ')){e.preventDefault();closeDirection();setHovered(null);onSelectNode?.(node.id);}if(e.key==='Escape')setHovered(null);}}>
       {itemSelection&&target&&<title>{`#${node.id} ${node.name} · ${itemSelection.itemName}${selected?' · 已选目标':' · 可选目标'}`}</title>}
       <circle cx={node.x} cy={node.y} r="21" fill="transparent"/>
       {selected&&!itemSelection&&<circle cx={node.x} cy={node.y} r="25" fill={color} fillOpacity=".15" stroke={color} strokeWidth="2" className="selection-ring"/>}
       {node.neighbors.length>2?<circle cx={node.x} cy={node.y} r="11" stroke="#E4E1CB" strokeWidth="3" fill="#F7F3DF"/>:<circle cx={node.x} cy={node.y} r="3" fill="#BCC9B4"/>}
       {(land||facility)&&<g className={`parcel-tile ${owner?'parcel-owned':purchasable?'parcel-available':'parcel-public'} ${land&&(owner||prefab)?'parcel-developed':''} ${prefab?'parcel-prefab':''} ${property?.mortgaged?'parcel-mortgaged':''}`} data-ownership={owner?`P${seat}`:purchasable?'available':'public'} data-available-level={prefab?availableLevel:undefined} transform={`translate(${pos.x} ${pos.y}) scale(${tileScale})`}>
         <rect className="parcel-base" x="-23" y="-23" width="46" height="46" rx="4" fill={prefab?'#E8EDF0':land&&owner?'#FBFDF5':owner?`${owner.color}1c`:purchasable?'#FBFCF4':'#DCE4E0'} stroke={prefab?'#71808a':color} strokeWidth={owner?2.4:1.4} strokeDasharray={(!owner&&purchasable)||property?.mortgaged?'4 2':undefined}/>
         {owner&&<path d={land?'M-19-22H19Q22-22 22-19V-11H-22V-19Q-22-22-19-22':'M-19-22H19Q22-22 22-19V-16H-22V-19Q-22-22-19-22'} fill={owner.color}/>}
         {land&&owner?<>
           <text className="parcel-address" style={{fill:owner.color.toLowerCase()==='#b98b14'?'#312a15':'#ffffff'}} x="-18" y="-13.7">#{String(node.id).padStart(2,'0')}</text>
           <text className="parcel-seat" style={{fill:owner.color.toLowerCase()==='#b98b14'?'#312a15':'#ffffff'}} x="18" y="-13.7" textAnchor="end">P{seat}</text>
           <PropertyLevelGlyph level={property!.level} maxLevel={maxLevel}/>
         </>:prefab?<>
           <path d="M-19-22H19Q22-22 22-19V-11H-22V-19Q-22-22-19-22" fill="#71808a"/>
           <text className="parcel-address" fill="#ffffff" x="-18" y="-13.7">#{String(node.id).padStart(2,'0')}</text>
           <text className="parcel-seat" fill="#ffffff" x="18" y="-13.7" textAnchor="end">待售</text>
           <PropertyLevelGlyph level={availableLevel} maxLevel={maxLevel}/>
         </>:land?<text className="parcel-number" textAnchor="middle" y="3" fill="#304940" fontSize="18" fontWeight="700">{String(node.id).padStart(2,'0')}</text>:<>
           {Glyph&&<Glyph x="-8" y="-18" width="16" height="16" stroke="#465D55" strokeWidth="1.8"/>}
           <text textAnchor="middle" y="8" fill="#354E45" fontSize="10" fontWeight="650">{shortName[kind]}</text>
         </>}
         {land?!owner&&!prefab&&<text textAnchor="middle" y="17" fill="#78857E" fontSize="8.5" fontWeight="700">待售</text>:<>
           <rect x="-22" y="11" width="44" height="11" rx="1" fill={owner?owner.color:purchasable?'#EDF1E7':'#61766C'}/>
           <text textAnchor="middle" y="20" fill={owner||!purchasable?'#FFFFFF':'#63746B'} fontSize="9" fontWeight="700">{status}</text>
         </>}
         {property?.mortgaged&&(land?<g className="parcel-mortgage-lock" transform="translate(12 13)"><rect x="-1" y="2" width="10" height="7" rx="1.5"/><path d="M1 2V0a3 3 0 0 1 6 0v2"/></g>:<path d="M-19-14 19 14" stroke="#687972" strokeWidth="1.2" opacity=".7"/>)}
       </g>}
       {(kind==='start'||kind==='coin'||kind==='event')&&Glyph&&<g transform={`translate(${node.x} ${node.y})`} className={`road-badge road-${kind}`}>
         <rect x="-15" y="-15" width="30" height="30" rx={kind==='coin'?15:8} fill={kind==='coin'?'#F7DE8F':'#F4F6ED'} stroke="#64766A" strokeWidth="1.4"/>
         <Glyph x="-9" y="-9" width="18" height="18" stroke="#52685D" strokeWidth="1.8"/>
       </g>}
       {(land||facility)&&<circle cx={node.x} cy={node.y} r="4" fill={owner?.color??'#9BAD9E'} stroke="#FCFCF2" strokeWidth="1.5"/>}
       {itemSelection&&target&&<g className="item-target-outline" pointerEvents="none" fill="none" stroke={selected?'#2b8b6a':'#579e7e'} strokeWidth={selected?3:1.8} opacity={selected?1:.55}>
         {lots[node.id]?<path d={targetCorners(pos.x,pos.y)} strokeLinecap="round" strokeLinejoin="round"/>:<circle cx={node.x} cy={node.y} r={selected?27:23}/>}
         {selected&&<><circle cx={node.x} cy={node.y} r="9"/><path d={`M${node.x-4} ${node.y}h8M${node.x} ${node.y-4}v8`} strokeLinecap="round"/></>}
       </g>}

      </g>;
    })}
    </g>
    {!hiddenWeather.has(weather)&&state?.encounters.map(n=>{const node=map.nodes[n];return node?<g key={`enc-${n}`} transform={`translate(${node.x} ${node.y})`} className="encounter-spark encounter-road-badge" pointerEvents="none" aria-label={`#${n} 流动偶遇`}><circle r="8.5" fill="#F7F0DB" stroke="#BB9672" strokeWidth="1.3"/><path d="M0-5 1.6-1.6 5 0 1.6 1.6 0 5-1.6 1.6-5 0-1.6-1.6Z" fill="#BB9672"/></g>:null;})}
    {directionPlayer&&<BeaconDirectionRoads map={map} player={directionPlayer} options={directionOptions} scale={baseScale*zoom}/>}
    {players.filter(p=>!p.bankrupt).map((p,i)=>{
      const node=map.nodes[p.position]??map.nodes[0],point=moment?.movement.playerId===p.id?moment.point:node;
      const neighbors=players.filter(a=>a.position===p.position&&!a.bankrupt),slot=neighbors.findIndex(a=>a.id===p.id);
      const presenting=moment?.movement.playerId===p.id;
      const offset=presenting?0:neighbors.length>1?(slot-(neighbors.length-1)/2)*12:0;
      const active=state?.players[state.currentPlayerIndex]?.id===p.id;
      const labelWidth=stepLabel?Array.from(stepLabel).reduce((sum,char)=>sum+(/[\u0000-\u007f]/.test(char)?7:13),20):0;
      const screenX=letterboxX+(((point.x-750)*zoom+750+pan.x)-viewBox.x)*baseScale;
      const screenY=letterboxY+(((point.y-500)*zoom+500+pan.y)-viewBox.y)*baseScale;
      const labelLeft=screenX+22+labelWidth>svgSize.width-8;
      const labelX=(labelLeft?-labelWidth-22:22)*labelScale;
      const labelY=(screenY<66?42:-50)*labelScale;
      const hitRadius=(mobileCamera?22:14)/Math.max(.05,baseScale*zoom);
      const hitShape=directionEnabled?beaconHitShape(map,lots,{x:point.x+offset,y:point.y},hitRadius):null;
      const hitClipId=`${id}-beacon-hit-${i}`;
      const nameHalfWidth=Math.max(18,p.name.length*5+7);
      const namePlacement=active?placeBeaconName({x:point.x+offset,y:point.y},nameHalfWidth,parcelBounds,
        {left:viewBox.x,top:viewBox.y,right:viewBox.x+viewBox.width,bottom:viewBox.y+viewBox.height}):null;
      return <g key={p.id} data-player-id={p.id} data-direction-selected={directionPlayer?.id===p.id} data-phase={presenting?moment?.stage:undefined} data-step-index={presenting?moment?.stepIndex:undefined} data-step-count={presenting?moment?.stepCount:undefined} data-segment={presenting?stepSegment:undefined} data-step-state={presenting?stepState:undefined} data-transfer-phase={presenting?moment?.transferPhase:undefined} transform={`translate(${point.x+offset} ${point.y})`} className={`player-beacon ${active?'is-active':''}`} style={{'--beacon':p.color} as CSSProperties} pointerEvents={directionEnabled?undefined:'none'} role={directionEnabled?'button':undefined} tabIndex={directionEnabled?0:undefined} aria-label={directionEnabled?`${p.name}，查看下次前进方向`:undefined} aria-pressed={directionEnabled?directionPlayer?.id===p.id&&!!directionSelection?.pinned:undefined}
       onPointerEnter={e=>{if(e.pointerType!=='touch')previewDirection(p.id);}} onPointerLeave={scheduleDirectionClose}
       onFocus={()=>previewDirection(p.id)} onBlur={scheduleDirectionClose}
       onClick={e=>{if(!directionEnabled)return;e.preventDefault();e.stopPropagation();toggleDirection(p.id);}}
       onKeyDown={e=>{if(!directionEnabled)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();toggleDirection(p.id);}else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeDirection();}}}>
        {hitShape&&<>
          <defs><clipPath id={hitClipId} clipPathUnits="userSpaceOnUse"><circle cy="-19" r={hitRadius}/></clipPath></defs>
          <circle className="beacon-hit-area" cy="-19" r={hitRadius} fill="transparent" pointerEvents="none" aria-hidden="true"/>
          <path className="beacon-hit-target" d={hitShape.path} clipPath={`url(#${hitClipId})`} fill="transparent" fillRule="evenodd" pointerEvents="all" data-hit-exclusions={hitShape.cutouts.length}/>
        </>}
        {presenting&&moment?.stage==='move'&&moment.segmentKind==='transfer'&&<circle className="transfer-portal" r="24" fill="none" stroke={p.color} strokeWidth="2" opacity=".7"/>}
        {presenting&&(moment?.stepState==='settled'||moment?.stage==='effect')&&<circle className="arrival-ring" r="26" data-node-id={moment.arrivedNodeId??p.position}/>}
        <ellipse cy="5" rx="16" ry="7" fill={p.color} opacity=".2"/>
        {active&&<ellipse cy="5" rx="22" ry="10" fill="none" stroke={p.color} opacity=".55" strokeWidth="1.5" className="beacon-ring"/>}
        <path d="M0 0V-15" stroke={p.color} strokeWidth="2" opacity=".4"/>
        <g transform="translate(0 -19)" className="beacon-float"><ShapeGlyph shape={p.shape} color={p.color}/><path d="M-4-4 0-9 4-4" fill="none" stroke="white" opacity=".65" strokeWidth="2"/></g>
        {namePlacement&&<g className="beacon-name-label" data-label-side={namePlacement.side} transform={`translate(${namePlacement.x} ${namePlacement.y})`}><rect x={-nameHalfWidth} y="-12" width={nameHalfWidth*2} height="20" rx="10" fill="#FAFCF5" fillOpacity=".94"/><text textAnchor="middle" y="2" fontSize="10" fill="#466255" fontWeight="600">{p.name}</text></g>}
        {p.confinement&&<text x="18" y="-22" fontSize="12">⌛</text>}
        {presenting&&stepLabel&&<g className="beacon-step-label" data-segment={stepSegment} transform={`translate(${labelX} ${labelY}) scale(${labelScale})`} aria-label={stepLabel}>
          <rect x="0" y="-19" width={labelWidth} height="29" rx="8"/>
          <text x="10" y="0">{stepLabel}</text>
        </g>}
      </g>;
    })}
    {moment?.stage==='effect'&&<g transform={`translate(${moment.point.x} ${moment.point.y})`} className="landing-burst" key={moment.movement.id} aria-hidden="true">
      <circle r="24" fill="none" stroke={moment.movement.effects?.some(e=>e.tone==='bad')?'#BC7059':'#B89B45'} strokeWidth="3"/>
      {[0,1,2,3,4,5].map(i=><path key={i} transform={`rotate(${i*60})`} d="M0-29V-36" stroke="#C8A85D" strokeWidth="3" strokeLinecap="round"/>)}
    </g>}
    {preview&&<g transform={`translate(${map.nodes[0].x} ${map.nodes[0].y-18})`} className="beacon-float"><ShapeGlyph shape="diamond" color="#609CAC"/></g>}
    <g className="map-compass" transform="translate(1319 84)"><path d="M0-24 5-3 0-8-5-3Z" fill="#76988B"/><path d="M0 15V-8M-12 3H12" stroke="#9DB2A3" fill="none"/><text textAnchor="middle" y="-31" fill="#759183" fontSize="9">N</text></g>
   </g>
   {stationSelection&&<g className="station-markers" aria-label="地图车站">
    {(()=>{
     const origin=stationMarkers.find(marker=>marker.id===stationSelection.originId),destination=stationMarkers.find(marker=>marker.id===selectedNode);
     if(!origin||!destination||origin.id===destination.id)return null;
     return <path className="station-transfer-preview" d={`M${viewBox.x+(origin.anchorX-letterboxX)/baseScale} ${viewBox.y+(origin.anchorY-letterboxY)/baseScale}L${viewBox.x+(destination.anchorX-letterboxX)/baseScale} ${viewBox.y+(destination.anchorY-letterboxY)/baseScale}`} vectorEffect="non-scaling-stroke"/>;
    })()}
    {stationMarkers.map(marker=>{
     const node=map.nodes[marker.id],origin=marker.id===stationSelection.originId,selected=marker.id===selectedNode;
     const toView=(x:number,y:number)=>({x:viewBox.x+(x-letterboxX)/baseScale,y:viewBox.y+(y-letterboxY)/baseScale});
     const pos=toView(marker.x,marker.y),anchor=toView(marker.anchorX,marker.anchorY);
     const label=`${(map.id==='sundered'?node.name.replace(/站\d+号$/, ''):node.name).split('·')[0]} · ${String(node.id).padStart(2,'0')}`;
     const select=()=>{if(!origin&&!stationSelection.disabled&&!dragged.current)onSelectNode?.(node.id);};
     return <g key={node.id} className={`station-marker ${origin?'is-origin':''} ${selected?'is-destination':''}`} data-station-id={node.id} role={!origin?'button':undefined} tabIndex={!origin?0:undefined} aria-label={origin?`当前车站 #${node.id} ${node.name}`:`选择目的站 #${node.id} ${node.name}`} aria-pressed={!origin?selected:undefined} aria-disabled={!origin?!!stationSelection.disabled:undefined} onClick={select} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select();}}}>
      <path className="station-leader" d={`M${anchor.x} ${anchor.y}L${pos.x} ${pos.y}`} vectorEffect="non-scaling-stroke"/>
      <circle className="station-anchor" cx={anchor.x} cy={anchor.y} r={4/baseScale}/>
      <g transform={`translate(${pos.x} ${pos.y}) scale(${1/baseScale})`}>
       <rect className="station-marker-face" x={-marker.width/2} y={-marker.height/2} width={marker.width} height={marker.height} rx="9"/>
       <TrainFront x="-43" y="-10" width="18" height="18" strokeWidth="1.8"/>
       <text className="station-marker-name" x="-18" y="-3" style={map.id==='sundered'?{fontSize:11}:undefined}>{label}</text>
       <text className="station-marker-caption" x="-18" y="12">{origin?'当前车站':selected?'已选终点':'点选前往'}</text>
      </g>
     </g>;
    })}
   </g>}
  </svg>
  {directionPlayer&&directionAnchor&&svgSize.width>0&&svgSize.height>0&&<BeaconDirectionCard map={map} player={directionPlayer} companions={directionCompanions} options={directionOptions} anchor={directionAnchor} bounds={svgSize} portalTarget={boardRef.current?.parentElement}
    onSelectPlayer={playerId=>{clearDirectionClose();setDirectionSelection({playerId,pinned:true});}} onClose={closeDirection}
    onPointerEnter={()=>{directionCardHovered.current=true;clearDirectionClose();}} onPointerLeave={()=>{directionCardHovered.current=false;scheduleDirectionClose();}}/>}
  {hovered&&hoverNode&&!preview&&!moment&&!directionPlayer&&!stationSelection&&(!itemSelection||itemSelection.nodeIds.includes(hovered.id))&&<div className="parcel-tooltip" role="tooltip" style={{left:hovered.x,top:hovered.y}}>
    <small>地点 {String(hoverNode.id).padStart(2,'0')} · {hoverOwner?hoverOwner.name:(hoverQuote?.price??0)>0?'待售地块':'公共设施'}</small>
    <strong>{hoverNode.name}</strong>
    {hoverQuote&&hoverQuote.price>0?<dl><div><dt>基础地价</dt><dd>PM$ {(hoverNode.price??0).toLocaleString()}</dd></div>{hoverAvailableLevel>0&&<div><dt>现有楼层</dt><dd>{hoverAvailableLevel} 层 · 待售</dd></div>}{!hoverProperty&&<div><dt>整栋认购价</dt><dd>PM$ {hoverPurchasePrice.toLocaleString()}</dd></div>}<div><dt>{hoverQuote.prospective?'购后预计租金':'当前经过租金'}</dt><dd>PM$ {hoverQuote.rent.toLocaleString()}</dd></div></dl>:<p>{hoverNode.kind==='empty'?'空地 · 不可购买':hoverNode.kind==='coin'?'硬币路面 · 停留拾取零钱':hoverNode.kind==='event'?'事件路面 · 停留触发不期而遇':hoverNode.kind==='start'?'出发站 · 经过领取补给':'公共服务设施 · 不可购买'}</p>}
    {hoverAvailableLevel>0&&<p>银行持有 · 未认购前不收租</p>}
    {hoverQuote&&hoverQuote.price>0&&hoverQuote.reason&&<p>{hoverQuote.reason}</p>}
    {hoverProperty&&hoverNode.kind==='land'?<div className="property-level-detail"><PropertyLevelIcon level={hoverProperty.level} maxLevel={getMaxLandLevel(map.id)} size={38}/><div><strong>{propertyLevelName(hoverProperty.level,getMaxLandLevel(map.id))}</strong><small>{hoverProperty.mortgaged?'已抵押 · 暂停收租':hoverProperty.level>=getMaxLandLevel(map.id)?'不可拆除或恶意收购':'可继续建造升级'}</small></div></div>:hoverProperty&&<p>{hoverProperty.mortgaged?'已抵押 · 暂停收租':'经济设施 · 不可升级'}</p>}
    <span className="tooltip-hint">{itemSelection?'点击选择此目标':'点击查看完整详情'}</span>
  </div>}
  {!preview&&state&&<><TurnMoment moment={moment} state={state}/><FeedbackMoment feedback={state.feedback} blocked={feedbackBlocked} suppressed={feedbackNotice}/></>}
  {!preview&&<div className={`weather-atmosphere atmosphere-${weatherClass}`} aria-hidden="true">
   {['rain','snow','sand','fireflies','breeze'].includes(weatherClass)&&Array.from({length:weatherClass==='rain'?88:weatherClass==='snow'?65:32},(_,i)=><i key={i} style={{left:`${pseudo(i,8)*100}%`,top:`${pseudo(i,9)*100}%`,animationDelay:`${-pseudo(i,6)*7}s`,animationDuration:`${weatherClass==='rain'?.9+pseudo(i,4)*.5:3+pseudo(i,4)*5}s`}}/>)}
   <div className="weather-horizon"/>
  </div>}
 </div>;
}
