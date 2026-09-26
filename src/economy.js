// ECONOMY: clock/market drift, solar & battery buffer, arrival scheduler, day cycle,
// goals & streaks, reputation, purchases, save/load.
import * as THREE from 'three';
import { SFX } from './audio.js';
import { sim, sellPrice, demandFactor, repMult } from './sim.js';
import { TIERS, SEGMENTS, TECH, GOAL_POOL } from './config.js';

export function createEconomy(ctx){
  const { scene, fog, applyDaylight, WORLD, spawnCar, carProtos, toast, flashTech, addBuffer, bumpGoal } = ctx;
  const clockEl=document.getElementById('clock'), priceEl=document.getElementById('price');

  // ---- reputation ----
  function repAdd(v){ sim.rep=THREE.MathUtils.clamp(sim.rep+v,0,100); paintRep(v); }
  let repFlashT=0;
  function paintRep(delta){
    const el=document.getElementById('rep'); if(!el) return;
    el.innerHTML = '★ '+Math.round(sim.rep) + (delta? ' <span class="'+(delta>0?'good':'bad')+'">'+(delta>0?'▲+'+delta.toFixed(1):'▼'+delta.toFixed(1))+'</span>' : '');
    if(delta) repFlashT=performance.now();
  }

  // ---- daily goals + streak retention ----
  function rollGoals(){
    const picks=[]; let h=sim.day*2654435761>>>0;
    while(picks.length<3){ h=(h*1103515245+12345)>>>0; const idx=h%GOAL_POOL.length; if(!picks.includes(idx)) picks.push(idx); }
    sim.goals = picks.map(i=>({ ...GOAL_POOL[i].make(sim.day), done:false, claimed:false, id:GOAL_POOL[i].id }));
    sim.dayStats={served:0, profit:0, kicks:0, vipDone:0, fast:0, kwh:0};
  }
  function paintGoals(){
    const el=document.getElementById('goallist'); if(!el) return;
    el.innerHTML = sim.goals.map(g=>{
      let cur=g.key==='noKick' ? (sim.dayStats.kicks===0?1:0) : Math.min(sim.dayStats[g.key]||0, g.target);
      return '<div class="g'+(g.done?' done':'')+'"><span>'+g.label+'</span><b>'+cur+'/'+g.target+'</b></div>';
    }).join('');
    const st=document.getElementById('streak');
    if(st) st.textContent = sim.streak>0 ? '🔥 '+sim.streak+'-day profit streak' : '🔥 Keep a profit streak going';
  }
  function bumpGoalFn(key, amt){
    sim.dayStats[key]=(sim.dayStats[key]||0)+(amt||1);
    for(const g of sim.goals){ if(!g.done && g.key===key && sim.dayStats[g.key]>=g.target){ g.done=true; SFX.chime(880,1320); toast('📋 Goal complete: '+g.label+' · <b>+$'+g.reward+'</b> rep +2'); sim.cash+=g.reward; repAdd(2); } }
    paintGoals();
  }
  const bump = bumpGoal || bumpGoalFn;   // external bumpGoal if provided (wired back in main)

  function paySession(b){
    if((b.chargeKwh||0)>0.05){
      sim.served++; sim.servedTotal++;
      sim.hourStats[(Math.floor(sim.gameClock/60))%24] = (sim.hourStats[(Math.floor(sim.gameClock/60))%24]||0)+1;
      let fee=0; if(b.car && b.car.userData.vip){ fee=b.sessionRev*0.5; b.sessionRev+=fee; }
      const segF=((b.car&&b.car.userData.seg&&b.car.userData.seg.fee)|| (b.segFee||1));
      if(segF!==1 && !b.car?.userData?.vip){ b.sessionRev*=segF; }
      const prof=b.sessionRev-b.sessionCost; sim.cash+=prof; sim.dayRev+=b.sessionRev; sim.dayCost+=b.sessionCost;
      const segN=(b.car&&b.car.userData.seg&&b.car.userData.seg.name)||'Car';
      repAdd( (b.car&&b.car.userData.vip)?2.5:1 );
      toast((b.car&&b.car.userData.vip?'👑 VIP tip +$'+fee.toFixed(2)+' · ':'')+'🎉 '+segN+' complete +$'+b.sessionRev.toFixed(2)+' · profit <b>$'+prof.toFixed(2)+'</b>');
      bumpGoalFn('served',1); bumpGoalFn('profit',prof); bumpGoalFn('kwh',(b.chargeKwh||0));
      if(b.car&&b.car.userData.vip) bumpGoalFn('vipDone',1);
      if((performance.now()-(b.chargeStartT||performance.now()))<90000 && (b.chargeKwh||0)>25) bumpGoalFn('fast',1);
    }
    b.sessionRev=0; b.sessionCost=0;
  }

  // ---- save/load ----
  function saveGame(){
    try{
      const d={ v:1, cash: sim.cash, day: sim.day, dayRev: sim.dayRev, dayCost: sim.dayCost, servedTotal: sim.servedTotal, bufferOwned: sim.bufferOwned, bufferKwh: sim.bufferKwh, rep: sim.rep, techOwned: sim.techOwned, goals: sim.goals, dayStats: sim.dayStats, streak: sim.streak,
        bays: sim.bays.map(b=>({ tier:b.tier, locked:!!b.locked, sell:b.sell })), raining: sim.raining, gameClock: sim.gameClock, spotPrice: sim.spotPrice, ts:Date.now(),
        vipPending: sim.vipPending, coldLeft: Math.max(0,sim.coldUntil-performance.now()), brownLeft: Math.max(0,sim.brownUntil-performance.now()), brownCap: sim.brownCap, solarKwh: sim.solarKwh };
      localStorage.setItem(sim.SAVE_KEY, JSON.stringify(d));
    }catch(e){}
  }
  function loadGame(){
    try{
      const raw=localStorage.getItem(sim.SAVE_KEY); if(!raw) return false;
      const d=JSON.parse(raw); if(!d||d.v!==1) return false;
      sim.cash=d.cash??sim.cash; sim.day=d.day??sim.day; sim.dayRev=d.dayRev||0; sim.dayCost=d.dayCost||0; sim.servedTotal=d.servedTotal||0;
      sim.bufferOwned=!!d.bufferOwned; sim.bufferKwh=d.bufferKwh||0; sim.raining=d.raining??sim.raining; sim.gameClock=d.gameClock??sim.gameClock; sim.spotPrice=d.spotPrice??sim.spotPrice; sim.rep=d.rep??sim.rep; sim.techOwned=d.techOwned||{};
      if(Array.isArray(d.bays)) d.bays.forEach((sb,i)=>{ if(sim.bays[i]){ sim.bays[i].tier=sb.tier||0; sim.bays[i].locked=!!sb.locked; sim.bays[i].sell=sb.sell||0.25; sim.bays[i].kw=TIERS[sim.bays[i].tier].kw; } });
      sim.vipPending=!!d.vipPending; sim.brownCap=d.brownCap||500; sim.solarKwh=d.solarKwh||0; sim.streak=d.streak||0; if(Array.isArray(d.goals)&&d.goals.length) sim.goals=d.goals; if(d.dayStats) sim.dayStats=d.dayStats;
      sim.coldUntil=performance.now()+(d.coldLeft||0); sim.brownUntil=performance.now()+(d.brownLeft||0);
      if(sim.bufferOwned) addBuffer();
      return true;
    }catch(e){ return false; }
  }

  // ---- day card ----
  let daySummaryT=0;
  function showDaySummary(d,rev,cost,profit){ daySummaryT=performance.now(); toast('🌙 Day '+d+' done · rev $'+rev.toFixed(2)+' · cost $'+cost.toFixed(2)+' · profit <b>$'+profit.toFixed(2)+'</b>'); }
  function hideDayCard(){ const c=document.getElementById('daycard'); if(c) c.style.display='none'; if(window.__GAME) window.__GAME._cardOpen=false; }
  function showDayCard(d,rev,cost,profit,made,bonus){
    daySummaryT=performance.now();
    const card=document.getElementById('daycard'); if(!card){ showDaySummary(d,rev,cost,profit); return; }
    document.getElementById('dcTitle').textContent='🌙 DAY '+d+' COMPLETE';
    const ok=profit>=0;
    document.getElementById('dcStats').innerHTML=
      '<div class="row"><span>Revenue</span><b class="good">$'+rev.toFixed(2)+'</b></div>'+
      '<div class="row"><span>Energy cost</span><b class="bad">−$'+cost.toFixed(2)+'</b></div>'+
      '<div class="row"><span>Profit</span><b class="'+(ok?'good':'bad')+'">'+(ok?'$':'−$')+Math.abs(profit).toFixed(2)+'</b></div>'+
      '<div class="row"><span>Customers served</span><b>'+sim.dayStats.served+'</b></div>'+
      '<div class="row"><span>kWh delivered</span><b>'+Math.round(sim.dayStats.kwh)+'</b></div>'+
      (sim.dayStats.kicks?'<div class="row"><span>Angry walkouts</span><b class="bad">'+sim.dayStats.kicks+'</b></div>':'')+
      (bonus?'<div class="row"><span>All-goals bonus</span><b class="good">+$'+bonus+'</b></div>':'');
    document.getElementById('dcGoals').innerHTML='<h3 style="margin:8px 0 4px;font-size:12px;letter-spacing:.12em;color:#7fd4ff">GOALS '+made+'/'+sim.goals.length+'</h3>'+
      sim.goals.map(g=>'<div class="g '+(g.done?'done':'fail')+'">'+g.label+'</div>').join('');
    document.getElementById('dcStreak').textContent = sim.streak>0 ? '🔥 '+sim.streak+'-day profit streak · next bonus at '+(sim.streak+1)+'d' : '😬 Streak reset — stay profitable tomorrow';
    card.style.display='flex';
    if(window.__GAME) window.__GAME._cardOpen=true;
    try{ if(document.pointerLockElement) document.exitPointerLock(); }catch(e){}
    SFX.chime(660,990);
  }
  function endDay(){
    const profit=sim.dayRev-sim.dayCost;
    const made=sim.goals.filter(g=>g.done).length;
    const allDone = sim.goals.length && made===sim.goals.length;
    if(profit>0 && sim.dayStats.served>0){ sim.streak++; } else { sim.streak=0; }
    let bonus=0; if(allDone){ bonus=100; sim.cash+=bonus; repAdd(4); }
    showDayCard(sim.day, sim.dayRev, sim.dayCost, profit, made, bonus);
    sim.day++;
    repAdd(3); // overnight goodwill recovery
    sim.dayRev=0; sim.dayCost=0; sim.hourStats={}; sim.hourArr={}; sim.kickedHourly={};
    rollGoals(); paintGoals();
    saveGame();
  }

  // ---- market frame ----
  function tick(dt, now){
    sim.gameClock += dt*1.4; // game time accelerated
    applyDaylight(sim.gameClock);
    fog.density = THREE.MathUtils.lerp(0.010, 0.0055, THREE.MathUtils.smoothstep(Math.sin(((sim.gameClock/1440)*Math.PI*2)-Math.PI/2)*0.62, 0.04, 0.45)) + sim.raining*0.0012;
    const hh=Math.floor(sim.gameClock/60)%24, mm=Math.floor(sim.gameClock%60);
    clockEl.textContent = String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');
    sim.spotPrice = 0.10+0.06*Math.sin(sim.gameClock/47)+0.02*Math.sin(sim.gameClock/7.3);
    // solar rooftop production: clear sky + daylight -> free kWh into buffer
    { const elev=Math.sin(((sim.gameClock/1440)*Math.PI*2)-Math.PI/2); const sunFactor=Math.max(0,elev)*(1-Math.min(1,sim.raining*1.4)); const gen=sim.SOLAR_CAP_KW*sunFactor*dt/3600*60; if(gen>0){ if(sim.bufferOwned){ sim.bufferKwh=Math.min(sim.BUFFER_CAP, sim.bufferKwh+gen); } else { sim.solarKwh+=gen; } sim.solarLast=sunFactor; } }
    // cheap-price surplus charges the buffer (cost booked to dayCost)
    if(sim.bufferOwned){
      if(sim.spotPrice<0.085 && sim.bufferKwh<sim.BUFFER_CAP){
        const add=Math.min(sim.BUFFER_CAP-sim.bufferKwh, 60*dt); // 60 kWh per real minute
        sim.bufferKwh+=add; sim.dayCost+=add*sim.spotPrice;
        ctx.bufferLens(0xf0c060);
      } else if(sim.bufferDraining===0){
        ctx.bufferLens(0x35e07c);
      }
      sim.bufferDraining=0;
    }
    // arrival scheduler: each unlocked empty bay pulls a car at a rate scaled by price & demand
    if(sim.ready && carProtos().length){
      for(const b of sim.bays){
        if(b.locked) continue;
        if(b.state==='empty' && b.nextArrT && now>=b.nextArrT){
          spawnCar(b, false, sim.vipPending && !sim.vipSpawned); if(sim.vipPending) sim.vipSpawned=true;
          const adsBoost = sim.techOwned.ads?0.75:1;      // ad network: arrivals 25% sooner
          b.nextArrT = now + (12000 - Math.min(8000, sim.spotPrice*40000)) * (0.6+Math.random()*0.8) / repMult() / demandFactor() * adsBoost;
        }
      }
    }
    // day rollover at 00:00
    if(sim.gameClock>=24*60){ sim.gameClock-=24*60; endDay(); }
    priceEl.textContent = (sim.spotPrice*100).toFixed(1)+'¢/kWh';
    WORLD.sign.drawSign(sim.spotPrice*100);
  }

  return { repAdd, paintRep, rollGoals, paintGoals, bumpGoal: bumpGoalFn, paySession, saveGame, loadGame, endDay, showDayCard, hideDayCard, showDaySummary, tick, get repFlashT(){ return repFlashT; } };
}
