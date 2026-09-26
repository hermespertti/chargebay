// VEHICLE RIGS: wheel spin/steer/brake glow, wet-weather beading + GLB wiper sweeps.
import * as THREE from 'three';
import { SFX } from './audio.js';
import { sim } from './sim.js';

function buildWheelRig(car){
  if(car.userData.wheelPivots) return;
  const groups={};
  car.traverse(o=>{ if(!o.isMesh) return; const m=/^(?:Disc|Spoke|Lip|Hub|Tire|WW)[_]?(\d+)/.exec(o.name); if(m){ const k=m[1]; (groups[k]=groups[k]||[]).push(o); } });
  const pivots=[];
  for(const k in groups){
    const ms=groups[k];
    const c=new THREE.Vector3(); ms.forEach(o=>c.add(o.position)); c.multiplyScalar(1/ms.length);
    const par=ms[0].parent; const g=new THREE.Group(); g.position.copy(c); g.userData.r=0.40; par.add(g);
    for(const o of ms) g.attach(o);
    pivots.push(g);
  }
  const steer=[]; car.traverse(o=>{ if(o.isMesh && /^Wheel[0-9]/.test(o.name)) steer.push({o, base:o.rotation.y}); });
  const tails=[]; car.traverse(o=>{ if(o.isMesh && o.material && /tail/i.test(o.material.name||'')) tails.push({o, base:o.material.emissiveIntensity||1}); });
  car.userData.wheelPivots=pivots; car.userData.steerMeshes=steer; car.userData.tailMeshes=tails; car.userData.prevZ=car.position.z;
}
function spinWheels(car, dt){
  const ud=car.userData; if(!ud.wheelPivots) buildWheelRig(car);
  const dz = car.position.z - (ud.prevZ!==undefined?ud.prevZ:car.position.z); ud.prevZ=car.position.z;
  if(Math.abs(dz)<1e-4) return;
  for(const g of ud.wheelPivots) g.rotation.x += dz/g.userData.r;   // forward = -Z; top of wheel must travel -Z
  ud.speed = Math.abs(dz/Math.max(dt,1e-3));
  SFX.tire(); SFX.setTire(Math.min(1, ud.speed/9));
}
function steerTilt(car, amt){
  const ud=car.userData; if(!ud.steerMeshes) return;
  for(const s of ud.steerMeshes) s.o.rotation.y = s.base + amt;
}
function brakeGlow(car, k){ // k 0..1 red brake / reverse intensity
  const ud=car.userData; if(!ud.tailMeshes) return;
  for(const t of ud.tailMeshes){ t.o.material.emissiveIntensity = t.base + 2.4*k; }
}
// ---- wet-weather car rig: beading clearcoat + wipers ----
function buildWetRig(car){
  if(car.userData.wetRig) return;
  const paints=[]; car.traverse(o=>{ if(o.isMesh&&o.material&&/paint/i.test(o.material.name||'')){
    if(o.material.clearcoat===undefined){
      const om=o.material, nm=new THREE.MeshPhysicalMaterial({ color:om.color.clone(), map:om.map||null, roughnessMap:om.roughnessMap||null, normalMap:om.normalMap||null, roughness:om.roughness, metalness:om.metalness, envMapIntensity:om.envMapIntensity, emissive:om.emissive.clone(), emissiveIntensity:om.emissiveIntensity });
      nm.name=om.name; nm.clearcoat=0.35; nm.clearcoatRoughness=0.25; o.material=nm;
    }
    paints.push({o:o, base:{cc:o.material.clearcoat, ccr:o.material.clearcoatRoughness}});
  } });
  // GLB-authored wiper pairs (WiperArm + WiperBlade[.001]) — wrap each pair into a sweep pivot at the arm base
  const pivots=[];
  const axes=new Set(); car.traverse(o=>{ if(/^WiperArm/.test(o.name||'')) axes.add(o.name); });
  for(const an of axes){
    const arm=car.getObjectByName(an); if(!arm) continue;
    const blade=car.getObjectByName(an.replace('WiperArm','WiperBlade'));
    const parent=arm.parent||car;
    const pivot=new THREE.Group(); pivot.name='WipSweep';
    pivot.position.copy(arm.position); parent.add(pivot);
    pivot.attach(arm); if(blade) pivot.attach(blade);
    // sweep axis = windshield outward normal in car-local glTF space (glass tangent (-0.72,+0.69,0) → normal (0.69,0.72,0))
    pivots.push({p:pivot, axis:new THREE.Vector3(0.69,0.72,0).normalize(), side:arm.position.z>=0?1:-1, t:Math.random()*6, prev:0});
  }
  car.userData.wetRig={paints, pivots, lastState:null};
}
function wetUpdate(car, dt, tNow){
  const ud=car.userData; if(!ud.wetRig) buildWetRig(car);
  const wr=ud.wetRig;
  // beading: oscillate clearcoat roughness so water sheets glint at dusk
  for(const pm of wr.paints){
    const m=pm.o.material;
    if(sim.raining){ m.clearcoat=1.0; m.clearcoatRoughness=0.06+0.05*Math.sin(tNow*0.0016+wr.paints.indexOf(pm)); }
    else { m.clearcoat=pm.base.cc; m.clearcoatRoughness=pm.base.ccr; }
    m.needsUpdate=false;
  }
  // wipers sweep only when raining
  for(const w of wr.pivots){
    if(sim.raining){
      const prev=w.t; w.t+=dt*2.4;
      w.p.quaternion.setFromAxisAngle(w.axis, Math.sin(w.t)*0.55);  // fan sweep around glass normal
      w.p.visible = true;
      // squeak at sweep reversals (sin crosses extremum)
      if(Math.sin(prev)>0.995 || Math.sin(prev)<-0.995) wr.squeakT=(wr.squeakT||0)+1;
    } else {
      w.p.visible=true; w.p.rotation.y=0;
    }
  }
  if(sim.raining && wr.squeakT && performance.now()-(wr.lastSqueak||0)>1400){ wr.lastSqueak=performance.now(); SFX.wiperSqueak(); }
  wr.lastState=sim.raining;
}
export { buildWheelRig, spinWheels, steerTilt, brakeGlow, buildWetRig, wetUpdate };
