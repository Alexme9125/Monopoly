// Reproducible AI acceptance: every available map, three matched styles, four seeds, both seat orders.
// Run: node --import tsx scripts/benchmark-ai.ts [--long]
import { mkdirSync, writeFileSync } from 'node:fs';
import { act, createGame, runAI, getNetWorth } from '../src/game/engine.ts';
import { AI_PRESETS } from '../src/game/data.ts';
import { MAPS } from '../src/game/maps.ts';
import type { AILevel, Personality } from '../src/game/types.ts';
const maps = Object.values(MAPS).map(map => map.id);
const personas:Personality[]=['cautious','balanced','aggressive'];
const seeds=[1978,31027,60185,981523];
const rows:any[]=[];
const seasons = process.argv.includes('--long') ? 16 : 4;
mkdirSync('artifacts/ai-review', { recursive: true });
for(const mapId of maps){for(const personality of personas){for(const seed of seeds){for(const fierceFirst of [false,true]){
 const levels:AILevel[]=fierceFirst?['fierce','gentle']:['gentle','fierce'];
 let s=createGame({mapId,mode:'pvp',seasons,weatherMode:'challenge',seed,players:levels.map((aiLevel,i)=>({...AI_PRESETS[i],ai:true,name:aiLevel,aiLevel,personality}))});
 let ticks=0,sameTurn=0,lastTurn='',maxActions=0;const attacks=[0,0],buys=[0,0],rests=[0,0];
 while(s.phase!=='gameover'){
  const key=`${s.day}:${s.currentPlayerIndex}`;sameTurn=key===lastTurn?sameTurn+1:1;lastTurn=key;maxActions=Math.max(sameTurn,maxActions);
  if(ticks++>20000||sameTurn>60)throw new Error(`Loop ${mapId}/${personality}/${seed}/${fierceFirst} day${s.day} phase${s.phase} ${s.pending?.kind}`);
  const before=s,index=s.currentPlayerIndex,p=s.players[index];
  s=s.seasonReport?act(s,{type:'dismissSeason'}):runAI(s);
  if(s===before)throw new Error(`Stall ${mapId}/${personality}/${seed}/${fierceFirst} day${s.day} ${s.phase}/${s.pending?.kind} ${JSON.stringify(s.aiTurn)}`);
  for(const q of s.players){if(!Number.isFinite(q.cash)||!Number.isFinite(getNetWorth(s,q.id))||q.stamina<0||q.stamina>100||q.mood<0||q.mood>100)throw new Error('Invalid state');}
  const now=s.players[index];
  if(before.phase==='ready'){
   attacks[index]+=Math.max(0,(s.aiTurn?.playerId===p.id?s.aiTurn.attacks:0)-(before.aiTurn?.playerId===p.id?before.aiTurn.attacks:0));
   if(s.phase==='end'&&!s.movement&&now.stamina>p.stamina)rests[index]++;
  }
  if(before.pending?.kind==='shop'&&now.cash<p.cash)buys[index]++;
 }
 const fierceIndex=levels.indexOf('fierce'),gentleIndex=1-fierceIndex;
 rows.push({mapId,personality,seed,fierceFirst,day:s.day,winner:levels[s.players.findIndex(p=>p.id===s.winnerId)],fierceNet:getNetWorth(s,s.players[fierceIndex].id),gentleNet:getNetWorth(s,s.players[gentleIndex].id),fierceAttacks:attacks[fierceIndex],gentleAttacks:attacks[gentleIndex],fierceBuys:buys[fierceIndex],gentleBuys:buys[gentleIndex],fierceRests:rests[fierceIndex],gentleRests:rests[gentleIndex],ticks,maxActions});
 }}console.log(JSON.stringify({mapId,personality,games:rows.filter(r=>r.mapId===mapId&&r.personality===personality).length,fierceWins:rows.filter(r=>r.mapId===mapId&&r.personality===personality&&r.winner==='fierce').length}));}}
const totals={seasons,weatherMode:'challenge',games:rows.length,fierceWins:rows.filter(r=>r.winner==='fierce').length,gentleWins:rows.filter(r=>r.winner==='gentle').length,fierceAttacks:rows.reduce((n,r)=>n+r.fierceAttacks,0),gentleAttacks:rows.reduce((n,r)=>n+r.gentleAttacks,0),fierceBuys:rows.reduce((n,r)=>n+r.fierceBuys,0),gentleBuys:rows.reduce((n,r)=>n+r.gentleBuys,0),maxActions:Math.max(...rows.map(r=>r.maxActions)),stalled:0};
writeFileSync(`artifacts/ai-review/benchmark-${seasons === 16 ? '4years' : '1year'}.json`,JSON.stringify({totals,rows},null,2));console.log(JSON.stringify(totals,null,2));
