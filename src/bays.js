// BAYS: per-bay state machine (arriving/parked/charging/throttled/departing),
// charging physics + power sourcing, patience kicks, plug follow + Verlet cables,
// progress bars, port rings, HUD load readout.
import * as THREE from 'three';
import { SFX } from './audio.js';
import { sim, sellPrice } from './sim.js';
import { PACK_KWH } from './config.js';
import { CABLE_RANGE, cableStep } from './cable.js';
import { spinWheels, steerTilt, brakeGlow } from './vehicles.js';
import { barPctTex } from './textures.js';

function lerpAng(a,b,k){ return a + lerpDelta(a,b)*k; }
function lerpDelta(a,b){ let d=(b-a)%(Math.PI*2); if(d>Math.PI)d-=Math.PI*2; if(d<-Math.PI)d+=Math.PI*2; return d; }

export function createBays(ctx){
  const { scene, camera, toast, loadEl, paySession, repAdd, paintGoals, BAY_X } = ctx;

  function bayPort(b){
    const pl = (b.car.userData && b.car.userData.portLocal) || new THREE.Vector3(-1.5,0.62,-0.95);
    const port=new THREE.Vector3(pl.x*b.car.scale.x, pl.y*b.car.scale.y, pl.z*b.car.scale.z);
    port.applyQuaternion(b.car.quaternion); port.add(b.car.position);
    return port;
  }
  function setJacket(b, on){ if(!b.plug) return; b.plug.traverse(o=>{ if(o.isMesh&&o.material&&o.material.name==='CableJacket') o.visible=on; }); }
  function autoEnergize(b){
    // plug-and-pay: docking the connector starts the session immediately
    if(b.plugged && b.state==='ready'){ b.state='charging'; b.price=sim.spotPrice; b.sell=sellPrice(); b.kwhStart=0; b.chargeKwh=0; b.sessionCost=0; SFX.click(420); toast('⚡ Charging at '+b.kw+' kW'); }
  }

  function tick(dt, now){
    // bay logic
    let totalKw=0;
    for(const b of sim.bays){
      if(b.state==='arriving' && b.car){
        b.car.position.z = THREE.MathUtils.lerp(b.car.position.z, b.driveTo, dt*1.6);
        // settle straight into the bay as it approaches
        const near=THREE.MathUtils.clamp(1-(b.car.position.z-b.driveTo)/9,0,1);
        spinWheels(b.car, dt); steerTilt(b.car, Math.sin(performance.now()*0.0012)*0.12);
        brakeGlow(b.car, near*near);
        b.car.rotation.y = Math.PI + (b.x-b.car.position.x)*0.035*(1-near);
        if(b.tailRefl) b.tailRefl.position.z = b.car.position.z+1.4;
        if(b.headRefl) b.headRefl.position.z = b.car.position.z-1.2;
        if(b.cshadow) b.cshadow.position.z = b.car.position.z;
        if(Math.abs(b.car.position.z-b.driveTo)<0.05){ b.state='parked'; b.car.userData.arrived=performance.now(); sim.arrivedTotal++; sim.hourArr[(Math.floor(sim.gameClock/60))%24]=(sim.hourArr[(Math.floor(sim.gameClock/60))%24]||0)+1; SFX.engine(); SFX.chime(660,880); toast('🚗 New arrival — bay '+(BAY_X.indexOf(b.x)+1)); }
      }
      // auto-resume throttled bays once the brownout clears
      if(b.throttled && b.plugged && (!(now<sim.brownUntil) || totalKw + b.kw <= sim.brownCap)){ b.throttled=false; autoEnergize(b); }
      if(b.barG && b.car){
        const show = b.state==='charging';
        b.barG.visible=show;
        if(show){
          b.barG.position.set(b.car.position.x, b.barH||2.05, b.car.position.z);
          b.barG.lookAt(camera.position);
          const pct=Math.min(1,b.car.userData.battery);
          b.barFill.scale.x=Math.max(0.001,pct);
          b.barFill.position.x=-0.72*(1-pct);
          b.barFill.material.color.setHex(b.state==='charging'?(pct>0.85?0x7dff9e:0x35e07c):0xf0c060);
          const lbl=Math.round(pct*100)+'%';
          if(b.barLast!==lbl){ b.barLast=lbl; const old=b.barTxt.material.map; b.barTxt.material.map=barPctTex(lbl); b.barTxt.material.needsUpdate=true; if(old)old.dispose(); }
        }
      }
      if(b.state==='charging' && b.car){
        // brownout throttle: if adding this bay exceeds cap, pause the newest charger
        if(totalKw + b.kw > sim.brownCap && now<sim.brownUntil){ b.state='ready'; b.throttled=true; SFX.click(160); toast('⚠️ Bay throttled — brownout cap '+sim.brownCap+' kW'); continue; }
        const coldMul = (now<sim.coldUntil && !sim.techOwned.heater)?0.65:1;
        const add = dt*(b.kw/350)*0.02*coldMul; // cold slows chemistry (heater tech negates)
        const kwh = add*(b.car.userData.packKwh||PACK_KWH);
        b.car.userData.battery=Math.min(1,b.car.userData.battery+add);
        b.chargeKwh=(b.chargeKwh||0)+kwh;
        totalKw+=b.kw;
        // power sourcing: buffer first (free once charged), rest from grid at spot price
        let fromSol=Math.min(kwh, sim.solarKwh); sim.solarKwh-=fromSol;
        let fromBuf=Math.min(kwh-fromSol, sim.bufferOwned? sim.bufferKwh:0);
        sim.bufferKwh-=fromBuf; if(fromBuf>0) sim.bufferDraining+=fromBuf;
        let fromGrid=kwh-fromBuf;
        if(sim.techOwned.inverter) fromGrid*=0.88;   // smart inverters: 12% less grid draw
        const cost = fromGrid*sim.spotPrice;
        b.sessionCost=(b.sessionCost||0)+cost;
        const rev = kwh*b.sell; sim.revenue+=rev; b.sessionRev+=rev;
        if(b.car.userData.battery>=1){ b.state='departing'; b.plugged=false; b.plug.position.copy(b.plugHome.pos); b.plug.rotation.copy(b.plugHome.rot); setJacket(b,false); SFX.cash(); ctx.paySession(b); }
        // plug LED: pulse ring — scale plug emissive via material hack
        if(b.plug){ b.plug.traverse(o=>{ if(o.isMesh&&o.material&&o.material.emissive) o.material.emissiveIntensity = 6+Math.sin(now/120)*4; }); }
      }
      if(b.state==='departing' && b.car){
        const dep=b.car.userData.dep || (b.car.userData.dep={stage:0, dir:(b.x<=0?1:-1), v:0, t:0, yaw0:b.car.rotation.y});
        const targetYaw = dep.dir>0 ? Math.PI/2 : -Math.PI/2; // heading +X or -X along road
        if(dep.stage===0){
          // back out of the bay while turning (arc): reverse thrust + progressive steering
          dep.t+=dt;
          dep.v=Math.min(3.0, dep.v+dt*2.0);
          const k=THREE.MathUtils.smoothstep(dep.t,0.6,3.4);      // back straight first, then swing the rear around
          b.car.rotation.y = lerpAng(dep.yaw0, targetYaw, k);
          const rev=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0), b.car.rotation.y); // rear = local -Z? (front faces -Z at spawn => rear dir is +Z world via this)
          b.car.position.addScaledVector(rev, dep.v*dt);
          spinWheels(b.car, dt); steerTilt(b.car, -targetYaw/2*Math.min(1,dep.t/2)); brakeGlow(b.car, 1);
          if(b.cshadow){ b.cshadow.position.set(b.car.position.x,0.018,b.car.position.z); b.cshadow.rotation.y=b.car.rotation.y; }
          if((b.car.position.z>7.2 && Math.abs(lerpDelta(b.car.rotation.y,targetYaw))<0.15) || dep.t>5.5){ dep.stage=1; dep.v=0; }
        } else if(dep.stage===1){
          // shunt forward to straighten on the road
          dep.t+=dt;
          b.car.rotation.y = lerpAng(b.car.rotation.y, targetYaw, Math.min(1,dt*4));
          const rev2=new THREE.Vector3(0,0,-1).applyAxisAngle(new THREE.Vector3(0,1,0), b.car.rotation.y);
          b.car.position.addScaledVector(rev2, 0.8*dt);
          spinWheels(b.car, dt); steerTilt(b.car, -targetYaw/3); brakeGlow(b.car, 0.4);
          if(b.cshadow){ b.cshadow.position.set(b.car.position.x,0.018,b.car.position.z); b.cshadow.rotation.y=b.car.rotation.y; }
          if(Math.abs(lerpDelta(b.car.rotation.y,targetYaw))<0.05){ dep.stage=2; }
        } else {
          // cruise off along the road
          dep.v=Math.min(9, dep.v+dt*5);
          b.car.position.x += dep.dir*dep.v*dt;
          spinWheels(b.car, dt); steerTilt(b.car, 0); brakeGlow(b.car, 0);
          if(b.cshadow){ b.cshadow.position.set(b.car.position.x,0.018,b.car.position.z); }
        }
        if(b.tailRefl) b.tailRefl.visible=false;
        if(b.headRefl){ b.headRefl.visible=false; }
        if(b.barG) b.barG.visible=false;
        if(Math.abs(b.car.position.x)>30 || b.car.position.z>24){ scene.remove(b.car); b.car=null; if(b.tailRefl){scene.remove(b.tailRefl);b.tailRefl=null;} if(b.headRefl){scene.remove(b.headRefl);b.headRefl=null;} if(b.cshadow){scene.remove(b.cshadow);b.cshadow=null;} b.state='empty';
          if(b.plug){ b.plug.position.copy(b.plugHome.pos); b.plug.rotation.copy(b.plugHome.rot); }
          b.plugged=false; sim.grabbedBay = (sim.grabbedBay===b)?null:sim.grabbedBay; sim.docked=false;
          b.nextArrT = performance.now()+5000+Math.random()*10000;
        }
      }
      // patience: idle parked/held car leaves
      if((b.state==='parked'||b.state==='ready') && b.car && !b.car.userData.docked){
        const waited=(now-b.car.userData.arrived)/1000;
        if(waited>b.car.userData.patience){ b.state='departing'; sim.kickedHourly[(Math.floor(sim.gameClock/60))%24]=(sim.kickedHourly[(Math.floor(sim.gameClock/60))%24]||0)+1; SFX.chime(300,220); SFX.departHorn(); repAdd(-(b.car.userData.vip?5:2.5)); sim.dayStats.kicks++; paintGoals(); toast('😠 '+(b.car.userData.seg?b.car.userData.seg.name:'Car')+' left without charging · rep −'+(b.car.userData.vip?5:2.5)); }
      }
    }
    if(totalKw>0) SFX.setCharge(true, totalKw/350); else SFX.setCharge(false);
    loadEl.textContent = totalKw+' kW';

    // held plug follows camera with spring, RANGE-LIMITED by cable length
    if(sim.grabbedBay && !sim.docked){
      const tp=new THREE.Vector3(); camera.getWorldDirection(tp);
      let target=camera.position.clone().addScaledVector(tp,0.55).add(new THREE.Vector3(0.12,-0.18,0));
      const home=sim.grabbedBay.glandPos||sim.grabbedBay.plugHome.pos;
      const reach=target.clone().sub(home);
      if(reach.length()>CABLE_RANGE){ reach.setLength(CABLE_RANGE); target=home.clone().add(reach); sim.grabbedBay.plugTaut=true; }
      else sim.grabbedBay.plugTaut=false;
      sim.grabbedBay.plug.position.lerp(target, 1-Math.pow(0.0001,dt));
      const look=target.clone().add(tp);
      sim.grabbedBay.plug.lookAt(look);
    }
    // per-bay cables: end A = gland on cabinet, end B = plug (hand/port/ring)
    for(const b of sim.bays){
      if(!b.cable) continue;
      const a=b.glandPos;
      let cB;
      if(b.plugged && b.car && b.state!=='departing'){ cB=bayPort(b).add(new THREE.Vector3(0,0.05,0)); }
      else cB=b.plug.position;
      // plug reeling back to holster when far and free
      if(!b.plugged && sim.grabbedBay!==b && b.plug.position.distanceTo(a)>0.3){
        b.plug.position.lerp(a, 1-Math.pow(0.002,dt));
      }
      cableStep(b.cable, a, cB, dt);
      // port ring indicator while this bay's connector is held
      if(b.portRing){
        const wantVis = (!b.plugged && b.car && (sim.grabbedBay===b || !sim.grabbedBay)) ;
        const isTarget = sim.grabbedBay===b;
        b.portRing.material.opacity += ((isTarget? (0.85+0.15*Math.sin(now/150)) : (wantVis? 0.3:0)) - b.portRing.material.opacity)*Math.min(1,dt*8);
        if(b.car){ const p=bayPort(b); b.portRing.position.copy(p); b.portRing.lookAt(camera.position);
          b.portRing.scale.setScalar(isTarget? 1.15+0.1*Math.sin(now/150):1); }
      }
      // charge flow pulse on cable while charging
      if(b.cable.mesh && b.state==='charging'){ b.cable.mesh.material.emissive=b.cable.mesh.material.emissive||new THREE.Color(); b.cable.mesh.material.emissive.setHex(0x0b3520); b.cable.mesh.material.emissiveIntensity=0.9+0.5*Math.sin(now/110); }
      else if(b.cable.mesh && b.cable.mesh.material.emissive){ b.cable.mesh.material.emissiveIntensity=0; }
    }
    return totalKw;
  }

  return { tick, bayPort, setJacket, autoEnergize, lerpAng, lerpDelta };
}
