// WEATHER: instanced rain streaks (canopy shelter bounce), ripple/mirror wetness,
// wind sway on foliage, camera-lens droplets (DOM), random events scheduler.
import * as THREE from 'three';
import { SFX } from './audio.js';
import { sim } from './sim.js';

export function createWeather(ctx){
  const { scene, camera, mirror, ripples, windSway, wxEl, nightK, toast } = ctx;

  // instanced rain streaks
  const rainCount = 4000;
  const dropGeo = new THREE.PlaneGeometry(0.006, 0.55);
  const rainMat = new THREE.MeshBasicMaterial({ color:0xcbb8a8, transparent:true, opacity:0.4, depthWrite:false, side:THREE.DoubleSide });
  const rain = new THREE.InstancedMesh(dropGeo, rainMat, rainCount);
  const rdrops = new Float32Array(rainCount*3);
  const dummy = new THREE.Object3D();
  for(let i=0;i<rainCount;i++){
    rdrops[i*3]=(Math.random()-0.5)*60; rdrops[i*3+1]=Math.random()*24; rdrops[i*3+2]=(Math.random()-0.5)*60;
    dummy.position.set(rdrops[i*3],rdrops[i*3+1],rdrops[i*3+2]);
    dummy.rotation.set(0.14,Math.random()*0.2,0.10);
    dummy.updateMatrix(); rain.setMatrixAt(i,dummy.matrix);
  }
  rain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(rain);

  // camera lens droplets overlay (DOM canvas)
  let lensFx=null, lensG=null; const drops=[];
  function initLensFx(){
    const cv=document.createElement('canvas'); cv.width=640; cv.height=360;
    cv.id='lensfx'; document.getElementById('app').appendChild(cv);
    lensG=cv.getContext('2d'); lensFx=cv;
    for(let i=0;i<40;i++) drops.push({x:Math.random()*640, y:Math.random()*360, r:1.5+Math.random()*3.5, v:0.2+Math.random()*0.6, trail:0});
  }
  function lensDrip(dt){
    if(!lensG) return;
    lensG.clearRect(0,0,640,360);
    for(const d of drops){
      d.y += d.v*dt*(60+d.r*40);
      if(d.y>360+d.r){ d.y=-d.r*3; d.x=Math.random()*640; d.trail=0; }
      const g=lensG.createRadialGradient(d.x,d.y,0.5,d.x,d.y,d.r*2.4);
      g.addColorStop(0,'rgba(255,250,240,0.55)'); g.addColorStop(0.6,'rgba(200,220,235,0.16)'); g.addColorStop(1,'rgba(0,0,0,0)');
      lensG.fillStyle=g; lensG.beginPath(); lensG.arc(d.x,d.y,d.r*2.4,0,Math.PI*2); lensG.fill();
      if(d.v>0.45){ lensG.fillStyle='rgba(220,235,245,0.10)'; lensG.fillRect(d.x-d.r*0.6, d.y-d.r*8, d.r*1.2, d.r*8); }
    }
  }

  // random events scheduler — cold snap / brownout / VIP / weather shift
  function events(now){
    if(now>sim.nextWx){
      sim.nextWx = now + 60000+Math.random()*90000; // every 1-2.5 real min
      const r=Math.random();
      if(r<0.34){ sim.coldUntil=now+60000; SFX.chime(440,330); toast('🧊 Cold snap · charging slower for a minute'); }
      else if(r<0.62){ sim.brownUntil=now+45000; sim.brownCap= sim.bays.filter(x=>!x.locked).length>2? 500:350; SFX.chime(330,240); toast('⚠️ Brownout · grid capped at '+sim.brownCap+' kW'); }
      else if(r<0.82){ sim.vipPending=true; sim.vipSpawned=false; toast('👑 VIP stranded outside town — needs rescue charge!');
        sim.bays.forEach(b=>{ if(!b.locked && b.state==='empty') b.nextArrT = Math.min(b.nextArrT||0, now+(sim.techOwned.priority?1200:4000)); }); }
      else { sim.raining = Math.random()<0.5? 0.15+Math.random()*0.2 : 0.65+Math.random()*0.35; }
    }
  }

  function tick(dt, now){
    // wet shimmer + mirror + ripples
    if(sim.raining>0.05 && ctx.asphalt.material.normalMap){ ctx.asphalt.material.normalMap.offset.x=(ctx.asphalt.material.normalMap.offset.x+dt*0.004)%1; ctx.asphalt.material.normalMap.offset.y=(ctx.asphalt.material.normalMap.offset.y+dt*0.006)%1; }
    if(mirror.material.uniforms.uWet){ mirror.material.uniforms.uWet.value=sim.raining; mirror.material.uniforms.uTime.value=now*0.001; }
    if(ripples){ ripples.visible=sim.raining>0.05; ripples.material.map.offset.x=(ripples.material.map.offset.x+dt*0.05)%1; ripples.material.map.offset.y=(ripples.material.map.offset.y+dt*0.07)%1; ripples.material.opacity=0.06+sim.raining*0.10; }
    // wind sway on authored foliage
    if(windSway.length){ const gust=0.6+sim.raining*1.2; for(const w of windSway){ w.o.rotation.z=Math.sin(now*0.0011*(1+w.ph*0.1)+w.ph)*w.amp*gust; w.o.rotation.x=Math.cos(now*0.0009+w.ph)*w.amp*0.6*gust; } }
    // rain streaks
    const fall=(9+sim.raining*11)*dt, wind=sim.raining*2.2*dt;
    for(let i=0;i<rainCount;i++){
      rdrops[i*3+1]-=fall; rdrops[i*3]+=wind;
      const rx=rdrops[i*3], rz=rdrops[i*3+2];
      if(rx>-10.4&&rx<10.4&&rz>-7.8&&rz<1.8){
        const side=Math.random()<0.5?-1:1;
        rdrops[i*3]= side<0? -10.6-Math.random()*14 : 10.6+Math.random()*14;
        rdrops[i*3+2]= (Math.random()-0.5)*44;
        rdrops[i*3+1]= 14+Math.random()*10;
      }
      if(rdrops[i*3+1]<0){ rdrops[i*3+1]=20+Math.random()*4; rdrops[i*3]=(camera.position.x+(Math.random()-0.5)*46); rdrops[i*3+2]=(camera.position.z+(Math.random()-0.5)*46); }
      if(Math.abs(rdrops[i*3]-camera.position.x)>26||Math.abs(rdrops[i*3+2]-camera.position.z)>26){
        rdrops[i*3]=(camera.position.x+(Math.random()-0.5)*46); rdrops[i*3+2]=(camera.position.z+(Math.random()-0.5)*46); rdrops[i*3+1]=18+Math.random()*6;
      }
      dummy.position.set(rdrops[i*3],rdrops[i*3+1],rdrops[i*3+2]); dummy.rotation.set(0.14,0,0.10); dummy.updateMatrix(); rain.setMatrixAt(i,dummy.matrix);
    }
    rain.instanceMatrix.needsUpdate=true;
    rainMat.opacity = 0.28+sim.raining*0.30;
    // lens droplets + weather label
    const sheltered = camera.position.x>-10.2 && camera.position.x<10.2 && camera.position.z>-7.6 && camera.position.z<1.6;
    if(lensFx){ const eff= sim.raining*(sheltered?0.12:1.15); lensFx.style.opacity = Math.min(1, eff); sim.raining>0.05 && !sheltered && lensDrip(dt); }
    const nk=nightK();
    let wx = nk>0.82? 'Clear night' : (nk>0.25? 'Dusk' : 'Clear');
    if(sim.raining>0.4) wx = nk>0.82? 'Rainy night' : nk>0.25? 'Rainy dusk' : 'Light rain';
    if(now<sim.coldUntil) wx = sim.raining>0.4? 'Freezing rain' : 'Cold snap';
    if(sim.raining>0.4 && sheltered) wx += ' · dry under canopy';
    if(now<sim.brownUntil) wx += ' + Brownout';
    wxEl.textContent = wx;
    SFX.setRain(sim.raining);
  }

  return { tick, events, initLensFx, rain, rainMat, rainCount };
}
