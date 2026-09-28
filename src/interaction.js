// INTERACTION: key commands + the grab/dock/unplug/energize state flows.
import * as THREE from 'three';
import { SFX } from './audio.js';
import { sim, sellPrice, demandFactor } from './sim.js';
import { TECH } from './config.js';

export function createInteraction(ctx){
  const { camera, toast, PLAYER, BAYSYS, ECONOMY, SHOP } = ctx;

  function tryInteract(){
    const t = PLAYER.currentTarget();
    if(!t) return;
    const b=t.bay;
    // holding THIS bay's connector, docked in hand -> unplug
    if(sim.grabbedBay===b && sim.docked){
      sim.docked=false; b.plugged=false; b.state='parked';
      b.car.userData.arrived=performance.now();
      b.car.userData.docked=false; SFX.click(200);
      if((b.chargeKwh||0)>0.05){ ECONOMY.paySession(b); toast('🔌 Unplugged — paid'); }
      else toast('🔌 Connector unplugged');
      b.plug.position.copy(b.plugHome.pos); b.plug.rotation.copy(b.plugHome.rot); BAYSYS.setJacket(b, false);
      sim.grabbedBay=null; return;
    }
    // holding this bay's connector in hand -> try to dock
    if(sim.grabbedBay===b && !sim.docked){
      if(b.car){
        const port=BAYSYS.bayPort(b);
        if(port.distanceTo(camera.position)<2.2){
          // icy fumble: heavy snow makes the connector slip, once per 15s max per bay
          if(sim.snowK>0.5 && (b.fumbleAt===undefined || performance.now()-b.fumbleAt>15000)){
            if(Math.random()<0.35){ b.fumbleAt=performance.now(); SFX.click(160); toast('❄️ Icy hands — the connector slipped! Try again'); return; }
          }
          sim.docked=true; b.plugged=true; b.car.userData.docked=true; b.state='ready'; b.chargeStartT=performance.now(); b.chargeKwh=0;
          // GLB ground truth: nozzle tip = local +Y, face-up = local +Z.
          // insert along the car's lateral body normal (through the side port), not toward car center
          const inward=new THREE.Vector3(1,0,0).applyQuaternion(b.car.quaternion); // port is local -X side => into body = car local +X
          const up=new THREE.Vector3(0,1,0);
          const xA=new THREE.Vector3().crossVectors(up,inward); if(xA.lengthSq()<1e-6) xA.set(1,0,0); xA.normalize();
          const zA=new THREE.Vector3().crossVectors(inward,xA).normalize();
          b.plug.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA,inward,zA));
          b.plug.position.copy(port).addScaledVector(inward,0.06);
          BAYSYS.autoEnergize(b);
          sim.grabbedBay=null; sim.docked=false;
          SFX.latch(); toast('✅ Locked — charging'); return;
        } else { toast('❌ Move closer to the port'); return; }
      }
    }
    // hands free, looking at a plugged car -> unplug it (finishes session)
    if(!sim.grabbedBay && t.type==='car' && b.plugged){
      if(b.state==='charging'){ b.state='parked'; }
      b.plugged=false; b.car.userData.docked=false;
      b.car.userData.arrived=performance.now(); SFX.click(200);
      if((b.chargeKwh||0)>0.05){ ECONOMY.paySession(b); toast('🔌 Unplugged — paid'); }
      else toast('🔌 Connector unplugged');
      b.plug.position.copy(b.plugHome.pos); b.plug.rotation.copy(b.plugHome.rot);
      return;
    }
    // grab a connector (bay must have a car and not be plugged already)
    if(t.type==='charger' && !sim.grabbedBay && !b.plugged && b.car){
      sim.grabbedBay=b; sim.docked=false; SFX.click(260); toast('🔌 Grabbed connector — aim at car port, press E');
      return;
    }
    if(t.type==='charger' && b.plugged && !sim.grabbedBay){ toast('⚡ Bay already charging'); }
  }

  function toggleCharge(forceBay){
    // R is now just pause/resume — plugging in already starts charging.
    let b= forceBay!=null ? sim.bays[forceBay] : (sim.grabbedBay && sim.docked ? sim.grabbedBay : (PLAYER.currentTarget()? PLAYER.currentTarget().bay : null));
    if(!b){ toast('Aim at a charger'); return; }
    if(!b.plugged){ toast('Dock the connector first (E)'); return; }
    if(b.state==='charging'){ b.state='ready'; SFX.click(180); toast('⏸ Charging paused'); return; }
    BAYSYS.autoEnergize(b);
  }

  function onKey(e){
    if(!sim.ready) return;
    if(e.code==='KeyE') tryInteract();
    if(e.code==='KeyR') toggleCharge();
    if(e.code==='BracketLeft'||e.code==='BracketRight'){
      const d=e.code==='BracketRight'? 0.05 : -0.05;
      const nv=THREE.MathUtils.clamp(sim.sellMarkup+d, sim.MARKUP_MIN, sim.MARKUP_MAX);
      if(nv!==sim.sellMarkup){ sim.sellMarkup=nv; SFX.click(nv>1.9?520:380);
        toast('💲 Price set <b>'+Math.round(sellPrice()*100)+'¢/kWh</b> · margin '+Math.round((sim.sellMarkup-1)*100)+'% · demand '+Math.round(demandFactor()*100)+'%'); }
    }
    if(e.code==='KeyM'){ const m=SFX.toggleMute(); toast(m?'🔇 Muted':'🔊 Sound on'); }
    if(e.code==='KeyU'){ const t=PLAYER.currentTarget(); if(t) SHOP.upgradeBay(t.bay); }
    if(e.code==='KeyB'){ SHOP.buyBuffer(); }
    if(e.code==='KeyN'){ const t=PLAYER.currentTarget(); if(t&&t.bay.locked) SHOP.unlockBay(t.bay); }
    if(e.code==='KeyP'){ ECONOMY.saveGame(); toast('💾 Saved'); }
    if(e.code==='KeyT'){ SHOP.toggleTechMenu(); }
    if(SHOP.techOpen){
      const idx=['Digit1','Digit2','Digit3','Digit4'].indexOf(e.code);
      if(idx>=0){ const id=Object.keys(TECH)[idx]; SHOP.buyTech(id); SHOP.renderTech(); }
      if(e.code==='Escape'){ SHOP.toggleTechMenu(false); }
    }
  }

  return { onKey, tryInteract, toggleCharge };
}
