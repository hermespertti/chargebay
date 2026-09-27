// SHOP: bay upgrades/unlocks, battery buffer, tech tree purchases + tech menu UI.
import * as THREE from 'three';
import { SFX } from './audio.js';
import { sim } from './sim.js';
import { TIERS, TECH } from './config.js';

export function createShop(ctx){
  const { scene, toast, ECONOMY, BAY_X } = ctx;

  let bufferMesh=null, bufferLight=null;
  let techOpen=false;
  const TECH_ICONS={heater:'🌡️',inverter:'⚙️',ads:'📡',priority:'👑'};

  function applyLocked(){
    sim.bays.forEach(b=>{
      if(b.charger){ b.charger.visible=true; b.charger.traverse(o=>{ if(o.isMesh&&o.material&&o.material.emissive){ o.material=o.material.clone?o.material.clone():o.material; o.material.emissive.setHex(b.locked?0x7a2020:0x1a2a3a); } }); }
      if(b.plug){ b.plug.visible = !b.locked; }
      if(b.locked && b.car){ scene.remove(b.car); b.car=null; b.state='empty'; }
    });
  }
  function addBuffer(){
    if(bufferMesh) return;
    bufferMesh=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.4,1.1), new THREE.MeshStandardMaterial({color:0x20262e, metalness:0.7, roughness:0.35, envMapIntensity:1.4}));
    bufferMesh.position.set(9.6,0.7,-6.2); bufferMesh.castShadow=true; scene.add(bufferMesh);
    const lens=new THREE.Mesh(new THREE.PlaneGeometry(2.0,0.22), new THREE.MeshStandardMaterial({color:0x0a1410, emissive:0x35e07c, emissiveIntensity:1.6}));
    lens.position.set(9.6,1.05,-5.64); scene.add(lens); bufferMesh.userData.lens=lens;
    bufferLight=new THREE.PointLight(0x35e07c, 6, 6, 1.8); bufferLight.position.set(9.6,1.2,-5.2); scene.add(bufferLight);
  }
  function bufferLens(hex){ if(bufferMesh&&bufferMesh.userData.lens) bufferMesh.userData.lens.material.emissive.setHex(hex); }
  function upgradeBay(b){
    if(b.locked){ toast('Unlock this bay first (N)'); return; }
    const nx=TIERS[b.tier+1]; if(!nx){ toast('Already top tier'); return; }
    if(sim.cash<nx.cost){ toast('❌ Need $'+nx.cost); return; }
    sim.cash-=nx.cost; b.tier++; b.kw=nx.kw; sim.dayCost+=nx.cost;
    SFX.cash(); toast('🔧 Upgraded to '+nx.kw+' kW');
    if(b.charger) b.charger.traverse(o=>{ if(o.isMesh&&o.material&&o.material.emissive) o.material.emissiveIntensity=2.2; });
  }
  function buyTech(id){
    const tc=TECH[id]; if(!tc){ toast('Unknown tech'); return false; }
    if(sim.techOwned[id]){ toast(tc.name+' already installed'); return false; }
    if(sim.rep < tc.rep){ toast('🔒 '+tc.name+' needs ★ '+tc.rep+' reputation ('+Math.round(sim.rep)+' so far)'); SFX.chime(220,180); return false; }
    if(sim.cash<tc.cost){ toast('❌ Need $'+tc.cost); return false; }
    sim.cash-=tc.cost; sim.dayCost+=tc.cost; sim.techOwned[id]=true; SFX.cash(); SFX.chime(660,990);
    toast('🎉 <b>'+tc.name+'</b> installed · '+tc.eff+' now active'); flashTech(); ECONOMY.saveGame(); return true;
  }
  function flashTech(){ const f=document.getElementById('techflash'); if(!f) return; f.style.display='block'; f.style.animation='none'; void f.offsetWidth; f.style.animation='tflash 1.6s ease-out forwards'; }
  function buyBuffer(){
    if(sim.bufferOwned){ toast('Buffer already installed'); return; }
    if(sim.cash<sim.BUFFER_COST){ toast('❌ Need $'+sim.BUFFER_COST); return; }
    sim.cash-=sim.BUFFER_COST; sim.dayCost+=sim.BUFFER_COST; sim.bufferOwned=true; addBuffer(); SFX.cash(); toast('🔋 Battery buffer installed');
  }
  function unlockBay(b){
    if(!b.locked){ toast('Bay already unlocked'); return; }
    if(sim.cash<1200){ toast('❌ Need $1200'); return; }
    sim.cash-=1200; sim.dayCost+=1200; b.locked=false; applyLocked(); SFX.cash(); toast('🟺 Bay '+(BAY_X.indexOf(b.x)+1)+' unlocked');
    b.nextArrT = performance.now()+2000+Math.random()*4000;
  }
  function renderTech(){
    const box=document.getElementById('techlist');
    const tr=document.getElementById('techrep'); if(tr) tr.textContent='★ '+Math.round(sim.rep)+' reputation';
    box.innerHTML=Object.keys(TECH).map((id,i)=>{
      const tc=TECH[id], own=!!sim.techOwned[id];
      const afford=sim.cash>=tc.cost, repOK=sim.rep>=tc.rep;
      const lockTag = (!own && !repOK) ? '<span class="tlock">🔒 needs ★'+tc.rep+'</span>' : '';
      const effTag = '<span class="teff">'+tc.eff+'</span>';
      return '<div class="tcard'+(own?' owned':'')+(!repOK&&!own?' locked':'')+'"><div class="ticon">'+(TECH_ICONS[id]||'🔬')+'</div><div class="tinfo"><b>'+(i+1)+'. '+tc.name+' '+effTag+lockTag+'</b><p>'+tc.desc+'</p></div>'+(own?'<button class="tbuy owned" disabled>✓ ACTIVE</button>':'<button class="tbuy" data-tech="'+id+'" '+(afford&&repOK?'':'disabled')+'>'+(repOK?'$'+tc.cost:'★'+tc.rep)+'</button>')+'</div>';
    }).join('');
    box.querySelectorAll('[data-tech]').forEach(btn=>btn.addEventListener('click',()=>{ buyTech(btn.dataset.tech); renderTech(); }));
  }
  function toggleTechMenu(force){
    techOpen = force!==undefined? force : !techOpen;
    const el=document.getElementById('tech');
    el.style.display= techOpen? 'flex':'none';
    if(techOpen){ renderTech(); ctx.onMenuOpen(); }
    else ctx.onMenuClose();
  }

  return { applyLocked, addBuffer, bufferLens, upgradeBay, buyTech, flashTech, buyBuffer, unlockBay, renderTech, toggleTechMenu, get techOpen(){ return techOpen; } };
}
