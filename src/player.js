// PLAYER: first-person input — pointer-lock, WASD + sprint, head bob, bounds,
// touch stick/look/buttons, and the interaction raycast target.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { SFX } from './audio.js';
import { sim } from './sim.js';

export function createPlayer(ctx){
  const { camera, renderer, toast, onInteract, onCharge, startEl } = ctx;

  const keys={};
  const ray = new THREE.Raycaster();
  let vy=0, bob=0;
  let tF=0, tS=0, stickId=null, lookId=null, lastLX=0, lastLY=0;
  const isTouch = matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints>0);
  let touchMode=false;

  const controls = new PointerLockControls(camera, renderer.domElement);

  addEventListener('keydown',e=>{ SFX.resume(); keys[e.code]=true; });
  addEventListener('keyup',e=>keys[e.code]=false);

  function enterTouch(){
    touchMode=true;
    startEl.style.display='none';
    document.getElementById('touchui').style.display='block';
  }

  // ---- touch controls: left stick = move, right-drag = look, buttons = E / ⚡ ----
  if(isTouch){
    const stickEl=document.getElementById('joy'), knobEl=document.getElementById('knob');
    const R=48;
    const startEvt = window.PointerEvent? 'pointerdown':'touchstart';
    stickEl.addEventListener(startEvt,(ev)=>{
      const t = ev.pointerId!==undefined? ev : ev.changedTouches[0];
      stickId = t.pointerId!==undefined? t.pointerId : t.identifier;
      const r=stickEl.getBoundingClientRect();
      moveStick(t.clientX-(r.left+r.width/2), t.clientY-(r.top+r.height/2));
      ev.preventDefault();
    });
    function moveStick(dx,dy){
      const d=Math.min(1, Math.hypot(dx,dy)/R);
      const a=Math.atan2(dy,dx);
      tF=-Math.sin(a)*d; tS=Math.cos(a)*d;
      knobEl.style.transform=`translate(${Math.cos(a)*d*R}px,${Math.sin(a)*d*R}px)`;
    }
    document.addEventListener(startEvt==='pointerdown'?'pointermove':'touchmove',(ev)=>{
      const list = ev.changedTouches? [ ...ev.changedTouches ] : [ev];
      for(const t of list){
        const id = t.pointerId!==undefined? t.pointerId : t.identifier;
        if(id===stickId){
          const r=stickEl.getBoundingClientRect();
          moveStick(t.clientX-(r.left+r.width/2), t.clientY-(r.top+r.height/2));
        } else if(id===lookId){
          const dx=t.clientX-lastLX, dy=t.clientY-lastLY;
          lastLX=t.clientX; lastLY=t.clientY;
          const e=new THREE.Euler().setFromQuaternion(camera.quaternion,'YXZ');
          e.y-=dx*0.005; e.x-=dy*0.005; e.x=Math.max(-1.4,Math.min(1.4,e.x));
          camera.quaternion.setFromEuler(e);
        }
      }
      if(ev.cancelable) ev.preventDefault();
    },{passive:false});
    document.addEventListener(startEvt==='pointerdown'?'pointerup':'touchend',(ev)=>{
      const list = ev.changedTouches? [ ...ev.changedTouches ] : [ev];
      for(const t of list){
        const id = t.pointerId!==undefined? t.pointerId : t.identifier;
        if(id===stickId){ stickId=null; tF=0; tS=0; knobEl.style.transform=''; }
        if(id===lookId) lookId=null;
      }
    });
    document.addEventListener(startEvt==='pointerdown'?'pointerdown':'touchstart',(ev)=>{
      const t = ev.pointerId!==undefined? ev : ev.changedTouches[0];
      if(stickId!==null) return;
      const tgt=ev.target;
      if(tgt && (tgt.closest('#joy')||tgt.closest('.tbtn')||tgt.closest('#start'))) return;
      const r=window.innerWidth;
      if(t.clientX > r*0.35){
        lookId = t.pointerId!==undefined? t.pointerId : t.identifier;
        lastLX=t.clientX; lastLY=t.clientY;
      }
    });
    document.getElementById('tE').addEventListener(startEvt==='pointerdown'?'pointerdown':'touchstart',(ev)=>{ ev.preventDefault(); SFX.resume(); if(sim.ready) onInteract(); });
    document.getElementById('tR').addEventListener(startEvt==='pointerdown'?'pointerdown':'touchstart',(ev)=>{ ev.preventDefault(); SFX.resume(); if(sim.ready) onCharge(); });
    const tmBtn=document.getElementById('tM');
    tmBtn.addEventListener(startEvt==='pointerdown'?'pointerdown':'touchstart',(ev)=>{ ev.preventDefault(); SFX.resume(); const m=SFX.toggleMute(); tmBtn.textContent=m?'🔇':'🔊'; });
  }

  function updatePlayer(dt){
    const speed=(keys['ShiftLeft']?4.6:2.4)*(touchMode?1.2:1);
    const f=(keys['KeyW']?1:0)-(keys['KeyS']?1:0)+(touchMode?tF:0);
    const s=(keys['KeyD']?1:0)-(keys['KeyA']?1:0)+(touchMode?tS:0);
    const dir=new THREE.Vector3();
    camera.getWorldDirection(dir); dir.y=0; dir.normalize();
    const right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0));
    const move=new THREE.Vector3().addScaledVector(dir,f*speed).addScaledVector(right,s*speed);
    camera.position.addScaledVector(move, dt);
    camera.position.x=THREE.MathUtils.clamp(camera.position.x,-16,16);
    camera.position.z=THREE.MathUtils.clamp(camera.position.z,-9,13);
    if(f||s){ bob+=dt*(keys['ShiftLeft']?11:8); }
    camera.position.y = 1.62 + Math.sin(bob)*0.025;
  }

  // raycast interactable chargers/cars from screen center
  function currentTarget(){
    if(!sim.ready) return null;
    ray.setFromCamera(new THREE.Vector2(0,0), camera);
    ray.far = 3.2;
    for(const b of sim.bays){
      if(!b.charger) continue;
      const hits = ray.intersectObject(b.charger, true);
      if(hits.length) return {bay:b, type:'charger'};
      if(b.car){
        const hc = ray.intersectObject(b.car, true);
        if(hc.length && hc[0].distance<2.6) return {bay:b, type:'car'};
      }
    }
    return null;
  }

  return { controls, keys, updatePlayer, currentTarget, enterTouch, isTouch,
    tEEl: isTouch? document.getElementById('tE') : null,
    tREl: isTouch? document.getElementById('tR') : null,
    get touchMode(){ return touchMode; } };
}
