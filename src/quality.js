// QUALITY: graphics preset management + auto fps governor.
import { sim } from './sim.js';

export function createQuality(ctx){
  const { renderer, scene, Q, WEATHER, mirror, getSSAO, applyDaylight, toast } = ctx;
  const QKEY='chargebay_quality_v1';
  let autoLowT=0, autoDropped=false;

  function qApply(mode){
    Q.mode = mode; localStorage.setItem(QKEY, mode);
    const ssao=getSSAO();
    if(mode==='high'){ Q.glare=1.0; Q.envMax=2.6; renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.shadowMap.enabled=true; if(ssao) ssao.enabled=true; WEATHER.rain.count=Math.min(WEATHER.rainCount, 2600); mirror.visible=true; }
    else if(mode==='med'){ Q.glare=0.75; Q.envMax=1.6; renderer.setPixelRatio(Math.min(devicePixelRatio,1)); renderer.shadowMap.enabled=true; if(ssao) ssao.enabled=false; WEATHER.rain.count=Math.min(WEATHER.rainCount, 1400); mirror.visible=true; }
    else if(mode==='low'){ Q.glare=0.6; Q.envMax=1.2; renderer.setPixelRatio(Math.max(0.65, Math.min(devicePixelRatio,0.7))); renderer.shadowMap.enabled=false; if(ssao) ssao.enabled=false; WEATHER.rain.count=Math.min(WEATHER.rainCount, 600); mirror.visible=false; }
    else { // auto: scale by display width; fps governor in main loop
      renderer.setPixelRatio(Math.min(devicePixelRatio, Math.max(0.65, 1200/window.innerWidth)));
      if(ssao) ssao.enabled = window.innerWidth<=1600;
      WEATHER.rain.count=Math.min(WEATHER.rainCount, 1400); mirror.visible=true;
    }
    scene.traverse(o=>{ if(o.isMesh&&o.material){ const ms=Array.isArray(o.material)?o.material:[o.material]; for(const m of ms){ if(m.isMeshStandardMaterial){ m.envMapIntensity=Math.min(m.envMapIntensity||1, Q.envMax); m.needsUpdate=true; } } } });
    applyDaylight(sim.gameClock);
    toast('\u2699 Quality: '+mode.toUpperCase());
  }

  // fps governor: drop auto quality once if sustained low fps
  function governor(fps){
    if(Q.mode==='auto' && !autoDropped && fps<28){ autoLowT++; if(autoLowT>=3){ autoDropped=true; qApply('low'); toast('\u2699 Auto: LOW (press G to cycle quality)'); } }
    else if(fps>=45){ autoLowT=0; }
  }

  return { Q, QKEY, qApply, governor };
}
