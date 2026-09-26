import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { SFX } from './audio.js';
import { asphaltTextures, asphaltNormal, puddleMaskStatic, blobTex, streakTexture, facadeTex, barPctTex, shadowTex, carReflTexRed } from './textures.js';
import { CABLE_SEGS, CABLE_LEN, CABLE_RANGE, makeCable, cableStep } from './cable.js';
import { PACK_KWH, TIERS, SEGMENTS, TECH, GOAL_POOL } from './config.js';
import { createAtmosphere } from './atmosphere.js';
import { createWorld } from './world.js';
import { sim, MARKUP_MIN, MARKUP_MAX, BUFFER_COST, BUFFER_CAP, BUFFER_RATE_KWH_MIN, SOLAR_CAP_KW, SAVE_KEY, sellPrice, demandFactor, repMult } from './sim.js';
import { buildWheelRig, spinWheels, steerTilt, brakeGlow, buildWetRig, wetUpdate } from './vehicles.js';
import { createWeather } from './weather.js';
import { createEconomy } from './economy.js';
import { createBays } from './bays.js';

// ---------------- core ----------------
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.05, 400);
camera.position.set(2.2, 1.65, 7.5);

// quality settings (shared with atmosphere via Q)
const QKEY='chargebay_quality_v1';
const Q = { mode: 'auto', glare: 1.0, envMax: 2.2 };

// ---- atmosphere: HDRI env, sky, fog, sun/rake/hemi, day-night cycle ----
// ---- world props: canopy, price sign, backdrop, curbs/trees, guard+road ----
const WORLD = createWorld();
scene.add(WORLD.canopy, WORLD.sign.g, WORLD.backdrop, WORLD.curbs, WORLD.guard);
const ATMO = createAtmosphere(renderer, scene, Q);
const { sky, horizonGlow, fog, sun, rake, hemi, nightFixtures, applyDaylight, collectNightLights } = ATMO;

// time of day — fixed golden-dusk for now, driven by clock var
const DAY = { t: 0.78 }; // 0..1, dusk ~0.75-0.82

const {colorTex:asphaltColor, roughnessMap:asphaltRough} = asphaltTextures();
const asphaltNormalTex = asphaltNormal();
const asphalt = new THREE.Mesh(
  new THREE.PlaneGeometry(220,220),
  (()=>{ const tl=new THREE.TextureLoader(); const MAXA=renderer.capabilities.getMaxAnisotropy();
  const amap=tl.load('assets/ground/col.jpg'); amap.colorSpace=THREE.SRGBColorSpace; amap.wrapS=amap.wrapT=THREE.RepeatWrapping; amap.repeat.set(22,22); amap.anisotropy=Math.max(8,MAXA);
  const rmap=tl.load('assets/ground/rgh.jpg'); rmap.wrapS=rmap.wrapT=THREE.RepeatWrapping; rmap.repeat.set(22,22); rmap.anisotropy=Math.max(8,MAXA);
  const nmap=tl.load('assets/ground/nrm.jpg'); nmap.wrapS=nmap.wrapT=THREE.RepeatWrapping; nmap.repeat.set(22,22); nmap.anisotropy=Math.max(8,MAXA);
  const wm=(()=>{ const c=document.createElement('canvas'); c.width=c.height=1024; const g=c.getContext('2d');
    g.fillStyle='#ffffff'; g.fillRect(0,0,1024,1024); g.filter='blur(26px)';
    g.save(); g.translate(512,600); g.scale(1.5,1.25);
    const rg=g.createRadialGradient(0,0,0,0,0,95); rg.addColorStop(0,'rgba(0,0,0,0.68)'); rg.addColorStop(0.6,'rgba(0,0,0,0.45)'); rg.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=rg; g.beginPath(); g.arc(0,0,95,0,Math.PI*2); g.fill(); g.restore();
    const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; return t; })();
  return new THREE.MeshStandardMaterial({ map:amap, roughnessMap:rmap, roughness:0.32, normalMap:nmap, normalScale:new THREE.Vector2(0.9,-0.9), metalness:0.25, color:0x6a5c50, envMapIntensity:2.2, alphaMap:wm, transparent:true });
})()
);
asphalt.rotation.x = -Math.PI/2; asphalt.receiveShadow = true; asphalt.renderOrder=1; scene.add(asphalt);
// dark apron beyond mirror zone so distant ground doesn't read as bright void
const apron = new THREE.Mesh(new THREE.RingGeometry(14, 480, 64), new THREE.MeshStandardMaterial({ map:(function(){ const tl=new THREE.TextureLoader(); const t=tl.load('assets/ground/col.jpg'); t.colorSpace=THREE.SRGBColorSpace; t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(30,30); return t; })(), color:0x3a3228, roughness:0.55, metalness:0.2, envMapIntensity:1.6 }));
apron.rotation.x=-Math.PI/2; apron.position.set(0,0.002,1.5); apron.receiveShadow=true; scene.add(apron);

// painted parking bay lines
function bayLines(){
  const grp = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({color:0xe8e4d4, roughness:0.6, metalness:0.0, emissive:0x3a3628});
  const matY = new THREE.MeshStandardMaterial({color:0xd4bd58, roughness:0.7, metalness:0.0, emissive:0x1c1808});
  for(let i=0;i<4;i++){
    const x = -6.6 + i*4.4;
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 6.2), mat);
    l.rotation.x=-Math.PI/2; l.position.set(x-2.2, 0.012, -3.1); l.receiveShadow=true; grp.add(l);
    const rr = l.clone(); rr.position.x = x+2.2; grp.add(rr);
  }
  // front stop line
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(19,0.16), matY);
  fl.rotation.x=-Math.PI/2; fl.position.set(0,0.012,-6.4); grp.add(fl);
  return grp;
}
scene.add(bayLines());

const oilTex=blobTex('rgba(10,9,8,0.55)');
const patchTex=blobTex('rgba(70,66,60,0.5)');
(function(){
  const spots=[[-5.2,2.4,oilTex,1.8],[3.1,3.6,oilTex,1.4],[0.4,0.6,oilTex,1.1],[-1.8,4.4,patchTex,2.2],[6.2,1.2,patchTex,1.6],[-7.4,3.0,patchTex,1.9]];
  for(const [x,z,tex,s] of spots){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(s*1.6,s*1.3), new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:0.9,depthWrite:false}));
    m.rotation.x=-Math.PI/2; m.position.set(x,0.011,z+1.2); m.rotation.z=Math.random()*6; m.renderOrder=2; scene.add(m);
  }
})();

const BAYS = [-6.6,-2.2,2.2,6.6];
const streaks = new THREE.Group();
{
  const cyanTex = streakTexture('rgba(140,220,255,C1)');
  const warmTex = streakTexture('rgba(255,215,160,C1)');
  const redTex  = streakTexture('rgba(255,80,60,C1)');
  // under canopy front LED -> long streak toward camera
  const s1 = new THREE.Mesh(new THREE.PlaneGeometry(18,7), new THREE.MeshBasicMaterial({map:cyanTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0.12}));
  s1.rotation.x=-Math.PI/2; s1.position.set(0,0.014,-2.8); s1.renderOrder=3; streaks.add(s1);
  // under each charger screen
  BAYS.forEach(x=>{
    const s=new THREE.Mesh(new THREE.PlaneGeometry(0.7,3.4), new THREE.MeshBasicMaterial({map:cyanTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0.14}));
    s.rotation.x=-Math.PI/2; s.position.set(x,0.015,-4.4); streaks.add(s);
  });
  // sunset wash streak near road edge
  const sw=new THREE.Mesh(new THREE.PlaneGeometry(30,5), new THREE.MeshBasicMaterial({map:warmTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0.10}));
  sw.rotation.x=-Math.PI/2; sw.rotation.z=Math.PI/2; sw.position.set(0,0.013,9.0); streaks.add(sw);
}
scene.add(streaks);

// rain ripple overlay on wet mirror zone: animated radial-ring normal illusion via scrolling alpha
const rippleTex=(()=>{ const c=document.createElement('canvas'); c.width=c.height=512; const g=c.getContext('2d');
  g.clearRect(0,0,512,512);
  for(let i=0;i<260;i++){ const x=Math.random()*512,y=Math.random()*512,r=3+Math.random()*22;
    const grd=g.createRadialGradient(x,y,r*0.4,x,y,r);
    grd.addColorStop(0,'rgba(255,255,255,0)'); grd.addColorStop(0.75,'rgba(255,255,255,0.16)'); grd.addColorStop(1,'rgba(255,255,255,0)');
    g.fillStyle=grd; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill(); }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(3.5,3); return t; })();
const ripples=new THREE.Mesh(new THREE.PlaneGeometry(46,34), new THREE.MeshBasicMaterial({map:rippleTex,transparent:true,opacity:0.22,blending:THREE.AdditiveBlending,depthWrite:false}));
ripples.rotation.x=-Math.PI/2; ripples.position.set(0,0.006,1.5); ripples.renderOrder=2; scene.add(ripples);

const DenoiseReflectorShader = {
  name:'ReflectorDenoise',
  uniforms:{ color:{value:null}, tDiffuse:{value:null}, textureMatrix:{value:null}, uWet:{value:0.0}, uTime:{value:0.0} },
  vertexShader: [
    'uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWPos;',
    '#include <common>',
    'void main(){ vUv=textureMatrix*vec4(position,1.0); vWPos=(modelMatrix*vec4(position,1.0)).xyz;',
    'gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }'].join('\n'),
  fragmentShader: [
    'uniform vec3 color; uniform sampler2D tDiffuse; uniform float uWet; uniform float uTime;',
    'varying vec4 vUv; varying vec3 vWPos;',
    '#include <common>',
    'float h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
    'float blendO(float b,float l){return b<0.5?(2.0*b*l):(1.0-2.0*(1.0-b)*(1.0-l));}',
    'vec3 blendO3(vec3 b,vec3 l){return vec3(blendO(b.r,l.r),blendO(b.g,l.g),blendO(b.b,l.b));}',
    'void main(){',
    '  vec2 uv=vUv.xy/vUv.w;',
    '  float pn=h21(floor(uv*vec2(640.0,480.0)));',
    '  uv+=(pn-0.5)*(0.0006+0.0022*uWet);',                 // micro-jitter kills banding
    '  uv.x+=0.0012*sin(uv.y*24.0+uTime*0.9)*uWet;',        // wet shimmer waves
    '  uv.y+=0.0010*cos(uv.x*19.0-uTime*0.7)*uWet;',
    '  vec4 base=texture2D(tDiffuse, clamp(uv,0.0,1.0));',
    '  vec3 refl=blendO3(base.rgb,color);',
    '  float rad=length((vWPos.xz-vec2(0.0,1.5))/vec2(22.0,16.0));',
    '  float vig=1.0-smoothstep(0.30,0.95,rad);',           // reflections strongest at lot center
    '  float rough=mix(0.85,0.42,uWet)*(0.88+0.12*pn);',    // dry = rough/muted, wet = sharp
    '  float amt=vig*rough;',
    '  vec3 asphalt=vec3(0.093,0.082,0.071);',
    '  refl+=(pn-0.5)/220.0;',                               // dither
    '  gl_FragColor=vec4(mix(asphalt,refl,clamp(amt,0.0,1.0)),1.0); }'].join('\n')
};
const mirror = new Reflector(new THREE.PlaneGeometry(46,34), {
  clipBias: 0.004, textureWidth: (navigator.hardwareConcurrency>6?2048:1024), textureHeight: (navigator.hardwareConcurrency>6?2048:1024), color: 0x4a4239, shader: DenoiseReflectorShader
});
mirror.rotation.x=-Math.PI/2; mirror.position.set(0,-0.002,1.5); mirror.renderOrder=0;
mirror.visible=true; scene.add(mirror);
// mask so reflector only shows through puddles: puddle-alpha canvas plane above
function puddleMask(){
  const c=document.createElement('canvas'); c.width=c.height=512;
  const g=c.getContext('2d');
  g.fillStyle='#ffffff'; g.fillRect(0,0,512,512); // default asphalt opaque
  g.globalCompositeOperation='destination-out';
  const lay=[[140,150,120],[300,190,95],[210,320,140],[380,380,110],[90,400,80],[430,120,70],[250,60,60],[150,260,70]];
  let ri=0;
  for(const [px,py,rad] of lay){
    const grd=g.createRadialGradient(px,py,0,px,py,rad);
    grd.addColorStop(0,'rgba(0,0,0,0.85)'); grd.addColorStop(0.7,'rgba(0,0,0,0.6)'); grd.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=grd; g.beginPath(); g.arc(px,py,rad,0,Math.PI*2); g.fill();
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(7,7);
    return t;
  }
// puddle plane: glossy dark patches only where puddles are
function rippleNormal(){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d'); g.fillStyle='#8080ff'; g.fillRect(0,0,256,256);
  for(let i=0;i<900;i++){
    const x=Math.random()*256,y=Math.random()*256,r=4+Math.random()*26;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,'rgba(150,150,255,0.5)'); grd.addColorStop(1,'rgba(128,128,255,0)');
    g.fillStyle=grd; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(40,40); return t;
}
function softWetMask(){
  // single large radial feather: fully transparent (mirror visible) at lot center, opaque asphalt far out
  const c=document.createElement('canvas'); c.width=c.height=1024;
  const g=c.getContext('2d');
  g.fillStyle='rgba(255,255,255,1)'; g.fillRect(0,0,1024,1024);
  g.filter='blur(40px)';
  const rg=g.createRadialGradient(512,512,0,512,512,520);
  rg.addColorStop(0,'rgba(0,0,0,0.95)'); rg.addColorStop(0.55,'rgba(0,0,0,0.75)'); rg.addColorStop(1,'rgba(0,0,0,0)');
  g.globalCompositeOperation='destination-out'; g.fillStyle=rg; g.fillRect(0,0,1024,1024);
  for(let i=0;i<160;i++){
    const x=Math.random()*1024,y=Math.random()*1024,r=40+Math.random()*180;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    const v=Math.floor(20+Math.random()*120);
    grd.addColorStop(0,`rgba(${v},${v},${v},0.55)`); grd.addColorStop(1,'rgba(235,235,235,0)');
    g.fillStyle=grd; g.beginPath(); g.ellipse(x,y,r,r*0.7,Math.random()*3,0,Math.PI*2); g.fill();
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping; t.repeat.set(1,1); return t;
}

// ---------------- assets: chargers & cars ----------------
const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('vendor/libs/draco/gltf/');
loader.setDRACOLoader(draco);
function loadGLB(path){ return new Promise((res,rej)=>{ const to=setTimeout(()=>rej(new Error('timeout '+path)), 120000); loader.load(path,(g)=>{clearTimeout(to);res(g);},(e)=>{},(e)=>{clearTimeout(to);rej(new Error('loadfail '+path+' '+(e&&(e.message||e.type||''))));}); }); }

let chargerProto=null, carProtos=[], origProtos=[], segProto={};
sim.bays.push(...BAYS.map(x=>({ x, charger:null, car:null, state:'empty', plug:null, plugHome:null, chargeKwh:0, sessionRev:0, sessionCost:0, price:0.124, tier:0, kw:150, sell:0.25 })));

const PAINTS = [0x0a2e6b, 0xe8dcc8, 0x8f0f14, 0x1c2026, 0x0f4d3a, 0x6b6e73];
function orientCar(obj){
  // rotate so longest horizontal axis = Z, center at origin, wheels on y=0
  obj.rotation.set(0,0,0);
  let box = new THREE.Box3().setFromObject(obj);
  const size = new THREE.Vector3(); box.getSize(size);
  if (Math.abs(size.x) > Math.abs(size.z)) obj.rotation.y = Math.PI/2;
  box = new THREE.Box3().setFromObject(obj);
  const center = new THREE.Vector3(); box.getCenter(center);
  // scale to ~4.6m length
  const box2 = new THREE.Vector3(); box.getSize(box2);
  const s = 4.6 / Math.max(box2.x, box2.z);
  obj.scale.setScalar(s);
  box = new THREE.Box3().setFromObject(obj);
  box.getCenter(center);
  obj.position.set(-center.x, -box.min.y, -center.z);
  const wrap = new THREE.Group(); wrap.add(obj);
  return wrap;
}
function tintPaint(root, color){
  root.traverse(o=>{
    if(!o.isMesh || !o.material) return;
    const mats = Array.isArray(o.material)?o.material:[o.material];
    for(const m of mats){
      if(!m.userData.tinted && m.metalness===1 && m.roughness<0.35 && !m.map && m.color && m.color.getHex()>0x010101){
        m = m; // clone once
      }
    }
  });
}
// ---------------- quality settings ----------------
function qApply(mode){
  Q.mode = mode; localStorage.setItem(QKEY, mode);
  if(mode==='high'){ Q.glare=1.0; Q.envMax=2.6; renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.shadowMap.enabled=true; if(ssao) ssao.enabled=true; WEATHER.rain.count=Math.min(WEATHER.rainCount, 2600); mirror.visible=true; }
  else if(mode==='med'){ Q.glare=0.75; Q.envMax=1.6; renderer.setPixelRatio(Math.min(devicePixelRatio,1)); renderer.shadowMap.enabled=true; if(ssao) ssao.enabled=false; WEATHER.rain.count=Math.min(WEATHER.rainCount, 1400); mirror.visible=true; }
  else if(mode==='low'){ Q.glare=0.6; Q.envMax=1.2; renderer.setPixelRatio(Math.max(0.65, Math.min(devicePixelRatio,0.7))); renderer.shadowMap.enabled=false; if(ssao) ssao.enabled=false; WEATHER.rain.count=Math.min(WEATHER.rainCount, 600); mirror.visible=false; }
  else { // auto: scale by display width; fps governor in animate
    renderer.setPixelRatio(Math.min(devicePixelRatio, Math.max(0.65, 1200/window.innerWidth)));
    if(ssao) ssao.enabled = window.innerWidth<=1600;
    WEATHER.rain.count=Math.min(WEATHER.rainCount, 1400); mirror.visible=true;
  }
  scene.traverse(o=>{ if(o.isMesh&&o.material){ const ms=Array.isArray(o.material)?o.material:[o.material]; for(const m of ms){ if(m.isMeshStandardMaterial){ m.envMapIntensity=Math.min(m.envMapIntensity||1, Q.envMax); m.needsUpdate=true; } } } });
  applyDaylight(sim.gameClock);
  toast('\u2699 Quality: '+mode.toUpperCase());
}
let autoLowT=0, autoDropped=false;

function boostEnv(root, inten=2.6){
  root.traverse(o=>{
    if(o.isMesh && o.material){
      const ms=Array.isArray(o.material)?o.material:[o.material];
      for(const m of ms){ if(m.isMeshStandardMaterial){ m.envMapIntensity=Math.min(m.envMapIntensity||1, Q.envMax); if('clearcoat' in m){ m.clearcoat=Math.min(m.clearcoat+0.2,0.9); m.clearcoatRoughness=Math.max(m.clearcoatRoughness,0.1);} if(m.emissiveIntensity>4){ m.emissiveIntensity=2.2; } m.needsUpdate=true; } }
    }
  });
}
// real foliage & street props (Poly Haven)
const PROPS = {};
const windSway=[];   // {o, ph, amp} — gentle canopy breeze, stronger when raining

async function loadProps(){
  const defs = [
    ['shrub','assets/shrub_b.glb'],
    ['shrub2','assets/shrub_a.glb'],
    ['planter','assets/planter.glb'],
    ['tree','assets/tree.glb'],
    ['lamp','assets/lamp.glb'],
  ];
  for(const [k,u] of defs){
    try{ console.log('PROP', k); const g=await loadGLB(u); PROPS[k]=g.scene; boostEnv(PROPS[k],1.4); console.log('PROP OK', k); }catch(e){ console.warn('prop fail',k,e&&e.message); }
  }
  // light authored scenery: bench/bin/bollard/low-tree in one small GLB
  try{ const g=await loadGLB('assets/scenery.glb');
    for(const o of g.scene.children){ PROPS[o.name.toLowerCase()]=o; }
    boostEnv(g.scene,1.2);
    g.scene.traverse(m=>{ if(m.isMesh){ const ms=Array.isArray(m.material)?m.material:[m.material]; for(const mm of ms){ if(mm.name==='BollardStripe'){ mm.emissiveIntensity=1.6; } } } });
    console.log('PROP OK scenery');
  }catch(e){ console.warn('prop fail scenery',e&&e.message); }
  // place them
  function fitH(obj,h){ const b=new THREE.Box3().setFromObject(obj); const s=new THREE.Vector3(); b.getSize(s); const k=h/Math.max(s.y,0.01); obj.scale.setScalar(k); return obj; }
  function place(obj,x,z,ry,h){ const o=obj.clone(true); if(h) fitH(o,h); o.rotation.y=ry||0; const b=new THREE.Box3().setFromObject(o); o.position.set(x, -b.min.y, z); o.traverse(m=>{if(m.isMesh){m.castShadow=true;}}); scene.add(o); return o; }
  if(PROPS.planter){ for(const x of [-4.4,0,4.4]) place(PROPS.planter, x, -3.0, Math.PI/2, 0.45); }
  if(PROPS.shrub){ for(const x of [-4.4,0,4.4]) for(const dz of [-1.4,-0.2,1.0]) place(PROPS.shrub, x+(Math.random()-0.5)*0.25, -3.0+dz, Math.random()*6, 0.5); }
  if(PROPS.shrub2){ for(const x of [-4.4,0,4.4]) place(PROPS.shrub2, x, -1.6, Math.random()*6, 0.42); }
  // backdrop green band
  if(PROPS.shrub2){ for(let i=0;i<10;i++) place(PROPS.shrub2, -18+i*4+Math.random()*2, 12.5, Math.random()*6, 0.7); }
  if(PROPS.tree){ for(const [x,z,h] of [[-11.5,4.5,3.6],[11.5,4.5,3.2],[-14,0.5,3.0],[14,-2,2.7]]) place(PROPS.tree, x, z, Math.random()*6, h); }
  if(PROPS.lamp){ for(const x of [-7.5,7.5]) place(PROPS.lamp, x, -9.5, Math.PI, 5.6); for(const x of [-12,12]) place(PROPS.lamp, x, 5.5, 0, 5.6); }
  if(PROPS.bench){ place(PROPS.bench, -8.6, -7.0, Math.PI/2, 1.15); place(PROPS.bench, 8.6, -7.0, -Math.PI/2, 1.15); }
  if(PROPS.trashbin){ place(PROPS.trashbin, -7.4, -7.0, 0, 1.1); place(PROPS.trashbin, 7.4, -7.0, 0, 1.1); }
  if(PROPS.bollard){ for(const x of [-6.6,-2.2,2.2,6.6]) place(PROPS.bollard, x, 7.4, 0, 1.1); for(const x of [-4.4,0,4.4]) place(PROPS.bollard, x, -0.2, 0, 1.0); }
  if(PROPS.treelow){ for(const [x,z,h] of [[-16,9.5,3.2],[-8,10.5,3.6],[0,11,3.9],[8,10.5,3.4],[16,9.5,3.0]]){ const o=place(PROPS.treelow, x, z, Math.random()*6, h); windSway.push({o, ph:Math.random()*6, amp:0.02}); } }
  if(PROPS.shrublow){ for(const [x,z] of [[-9.5,-4.0],[9.5,-4.0],[-13,2.0],[13,2.0]]){ const o=place(PROPS.shrublow, x, z, Math.random()*6, 0.55); windSway.push({o, ph:Math.random()*6, amp:0.035}); } }
}

async function loadAssets(){
  console.log('STAGE chargers');
  const c = await loadGLB('assets/charger.glb'); chargerProto=c.scene; boostEnv(c.scene, 1.8);
  c.scene.traverse(o=>{ if(o.isMesh&&o.material){ const ms=Array.isArray(o.material)?o.material:[o.material]; for(const m of ms){ if(m.name==='ChargerScreen'){ m.emissive.setRGB(0.03,0.30,0.85); m.emissiveIntensity=3.0; } if(m.name==='ChargerLED'){ m.emissiveIntensity=1.8; } } } });
  // hero cars: Khronos CarConcept + three.js Ferrari
  console.log('STAGE hero');
  const hero1 = await loadGLB('assets/car_concept.glb');
  const h1 = orientCar(hero1.scene); boostEnv(h1, 3.2);
  h1.traverse(o=>{ if(o.isMesh&&o.material){ const n=(o.material.name||'').toLowerCase();
    if(n.includes('glass')){ o.material=o.material.clone(); o.material.transparent=true; o.material.opacity=0.35; o.material.roughness=0.05; o.material.side=THREE.DoubleSide; }
    if(n.includes('signallight')||n.includes('light')){ o.material=o.material.clone(); o.material.emissive=new THREE.Color(0xff2010); o.material.emissiveIntensity=2.5; }
  }});
  carProtos.push(h1);
  // paint variants of h1
  for(const col of [PAINTS[0], PAINTS[1], PAINTS[2], PAINTS[3]]){
    const v = h1.clone(true);
    v.traverse(o=>{ if(o.isMesh&&o.material&&o.material.name&&o.material.name.startsWith('Paint')){ o.material=o.material.clone(); o.material.color.setHex(col); } });
    carProtos.push(v);
  }
  // ORIGINAL fleet (authored in Blender by this project): sedan/suv/van/retro + paint variants
  const FLEET_DEF = [
    { file:'assets/car_ev1.glb', seg:'sedan', port:[-0.60,0.62,-0.88] },
    { file:'assets/car_suv.glb', seg:'suv',   port:[-0.70,0.92,-0.95] },
    { file:'assets/car_van.glb', seg:'van',   port:[-1.20,0.96,-0.99] },
    { file:'assets/car_retro.glb', seg:'retro', port:[-0.50,0.80,-0.83] },
    { file:'assets/car_vip.glb', seg:'super', port:[-0.55,0.58,-0.90] },
  ];
  segProto = {};
  for(const fd of FLEET_DEF){
    try{
      const og = await loadGLB(fd.file);
      const o1 = orientCar(og.scene); boostEnv(o1, 3.0);
      o1.userData.protoPort = fd.port;
    o1.traverse(o=>{ if(o.isMesh&&o.material){ const ms=Array.isArray(o.material)?o.material:[o.material];
      for(const m of ms){ const n=(m.name||'').toLowerCase();
        if(n.includes('glass')){ m.transparent=true; m.opacity=0.5; m.roughness=0.05; m.metalness=0.9; m.envMapIntensity=4.0; m.side=THREE.FrontSide; }
        if(n.includes('headlight')){ m.emissive=new THREE.Color(0xfff0cc); m.emissiveIntensity=2.2; }
        if(n.includes('taillight')){ m.emissive=new THREE.Color(0xff1508); m.emissiveIntensity=2.0; }
        if(n.includes('rim')){ m.envMapIntensity=1.4; }
        if(n.includes('caliper')){ m.emissive=new THREE.Color(0xff3300); m.emissiveIntensity=0.35; }
        if(n.includes('tire')||n.includes('brakedisc')){ m.envMapIntensity=0.6; }
      } } });
    segProto[fd.seg]=[o1];
    for(const col of [PAINTS[2], PAINTS[0], 0x11131a, 0xe8dcc8]){
      const v = o1.clone(true);
      v.traverse(o=>{ if(o.isMesh&&o.material&&o.material.name&&o.material.name.toLowerCase().includes('paint')){ o.material=o.material.clone(); o.material.color.setHex(col); } });
      segProto[fd.seg].push(v);
    }
    segProto[fd.seg].forEach(p=>origProtos.push(p));
    console.log('STAGE fleet', fd.seg, segProto[fd.seg].length);
  }catch(e){ console.warn('fleet skipped', fd.seg, e&&e.message); }
  }
  // place chargers
  sim.bays.forEach((b,i)=>{
    const ch = chargerProto.clone(true);
    ch.position.set(b.x, 0, -6.0); ch.rotation.y = 0; ch.scale.setScalar(1.0);
    ch.traverse(o=>{ if(o.isMesh){o.castShadow=true; o.receiveShadow=true;} });
    scene.add(ch); b.charger=ch;
    scene.add(contactShadow(1.4,1.0, b.x, -6.0, 0.9));
    // plug parked at holster
    const pg = carProtos.length? null:null;
  });
  console.log('STAGE plugs');
  await loadPlugs();
  console.log('STAGE props');
  await loadProps();
  console.log('STAGE propsdone');
  // Ferrari hero (Draco) — interior, calipers, carbon
  try{
    const fer = await loadGLB('assets/ferrari.glb');
    const f = orientCar(fer.scene); boostEnv(f, 3.4);
    f.traverse(o=>{ if(o.isMesh&&o.material){ const ms=Array.isArray(o.material)?o.material:[o.material];
      for(const m of ms){ const n=(m.name||'').toLowerCase();
        if(n.includes('glass')||n.includes('projector')){ m.transparent=true; m.opacity=Math.min(m.opacity||1,0.4); m.roughness=0.04; }
        if(n.includes('taillight')||n.includes('led')||n.includes('turn')){ m.emissive=new THREE.Color(n.includes('turn')?0xff9a20:0xff1a10); m.emissiveIntensity=1.6; }
        if(n.includes('carbon')){ m.roughness=Math.min(m.roughness,0.35); m.metalness=Math.max(m.metalness,0.4); }
      } } });
    f.children[0].rotation.y += Math.PI; // FBX front axis is +Z: flip to match fleet (-Z)
    carProtos.push(f);
    console.log('STAGE ferrari ok');
  }catch(e){ console.warn('ferrari skipped', e && e.message); }
  collectNightLights();
  if(!ECONOMY.loadGame()){ sim.bays[3].locked=true; }
  if(!sim.goals.length) ECONOMY.rollGoals(); ECONOMY.paintGoals();
  document.getElementById('dcBtn').addEventListener('click',()=>{ ECONOMY.hideDayCard(); if(!isTouch&&controls.isLocked===false) controls.lock(); });
  applyLocked();
  if(sim.bufferOwned) addBuffer();
  sim.bays.forEach(b=>{ if(!b.locked){ spawnCar(b, true); b.nextArrT = performance.now()+4000+Math.random()*5000; } });
  sim.ready=true;
  // NOTE: do NOT auto-hide #start — overlay stays until the player actually
  // engages (click-lock on desktop, tap on touch). Capture harness hides it itself.
  if(!window.__GAMESPAWN) window.dispatchEvent(new Event('gamespawn'));
}
function applyLocked(){
  sim.bays.forEach(b=>{
    if(b.charger){ b.charger.visible=true; b.charger.traverse(o=>{ if(o.isMesh&&o.material&&o.material.emissive){ o.material=o.material.clone?o.material.clone():o.material; o.material.emissive.setHex(b.locked?0x7a2020:0x1a2a3a); } }); }
    if(b.plug){ b.plug.visible = !b.locked; }
    if(b.locked && b.car){ scene.remove(b.car); b.car=null; b.state='empty'; }
  });
}
let bufferMesh=null, bufferLight=null;
function addBuffer(){
  if(bufferMesh) return;
  bufferMesh=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.4,1.1), new THREE.MeshStandardMaterial({color:0x20262e, metalness:0.7, roughness:0.35, envMapIntensity:1.4}));
  bufferMesh.position.set(9.6,0.7,-6.2); bufferMesh.castShadow=true; scene.add(bufferMesh);
  const lens=new THREE.Mesh(new THREE.PlaneGeometry(2.0,0.22), new THREE.MeshStandardMaterial({color:0x0a1410, emissive:0x35e07c, emissiveIntensity:1.6}));
  lens.position.set(9.6,1.05,-5.64); scene.add(lens); bufferMesh.userData.lens=lens;
  bufferLight=new THREE.PointLight(0x35e07c, 6, 6, 1.8); bufferLight.position.set(9.6,1.2,-5.2); scene.add(bufferLight);
}
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
  sim.cash-=1200; sim.dayCost+=1200; b.locked=false; applyLocked(); SFX.cash(); toast('🟺 Bay '+(BAYS.indexOf(b.x)+1)+' unlocked');
  b.nextArrT = performance.now()+2000+Math.random()*4000;
}
let plugsProto=null;
async function loadPlugs(){
  const p = await loadGLB('assets/plug.glb'); plugsProto=p.scene;
  sim.bays.forEach(b=>{
    const pl = plugsProto.clone(true);
    pl.position.set(b.x+0.70, 0.98, -6.0); pl.rotation.set(Math.PI,0,0); pl.scale.setScalar(1.15);
    pl.traverse(o=>{ if(o.isMesh){ o.castShadow=true; if(o.material && o.material.name==='CableJacket') o.visible=false; } });
    scene.add(pl); b.plug=pl; b.plugHome={pos:pl.position.clone(), rot:pl.rotation.clone()};
    b.glandPos=new THREE.Vector3(b.x+0.36, 0.55, -6.0);
    // port target ring: appears at the car port when this bay's connector is in hand
    const ring=new THREE.Mesh(new THREE.RingGeometry(0.14,0.24,28), new THREE.MeshBasicMaterial({color:0x39e6a8,transparent:true,opacity:0,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
    ring.renderOrder=9; scene.add(ring); b.portRing=ring;
    b.cable=makeCable(scene);
  });
}

// spawn a car at a bay with random paint & battery
function spawnCar(bay, instant=false, vip=false, seg=null){
  seg = seg || pickSegment();
  if(vip && segProto['super'] && segProto['super'].length) seg = SEGMENTS.find(s=>s.id==='super') || seg;
  const pool = (segProto[seg.id] && segProto[seg.id].length) ? segProto[seg.id] : origProtos;
  const proto = (pool && pool.length) ? pool[Math.floor(Math.random()*pool.length)] : carProtos[Math.floor(Math.random()*carProtos.length)];
  const car = proto.clone(true);
  if(proto.userData && proto.userData.protoPort) car.userData.portLocal = new THREE.Vector3(...proto.userData.protoPort);
  car.traverse(o=>{ if(o.isMesh){o.castShadow=true; o.receiveShadow=true;} });
  const sz = seg.id==='van'? 1.28 : seg.id==='suv'? 1.12 : seg.id==='taxi'? 1.0 : seg.id==='retro'? 0.94 : 1.0;
  car.scale.multiplyScalar(sz); bay.carScale=sz;
  const roll = vip? 0.03+Math.random()*0.12 : 0.08+Math.random()*0.5;
  car.userData = { battery: roll, need: vip? 0.95 : 0.72+Math.random()*0.25, patience: vip? 55 : seg.patience[0]+Math.random()*(seg.patience[1]-seg.patience[0]), arrived: performance.now(), vip, seg, packKwh: seg.pack };
  if(seg.paint){ car.traverse(o=>{ if(o.isMesh&&o.material&&o.material.name&&(o.material.name.toLowerCase().includes('paint')||o.material.name.toLowerCase().includes('body_color'))){ o.material=o.material.clone(); o.material.color.setHex(seg.paint); if(seg.id==='taxi'){ o.material.metalness=0.35; o.material.roughness=0.3; } } }); }
  if(seg.id==='taxi' && !vip){
    const bb=new THREE.Box3().setFromObject(car); const roofY=bb.max.y;
    const sign=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.16,0.24), new THREE.MeshStandardMaterial({color:0xffe14d, emissive:0xcaa100, emissiveIntensity:1.4, roughness:0.4}));
    sign.position.set(0,roofY+0.09,0.1); car.add(sign);
  }
  bay.segName = seg.name; bay.segFee = seg.fee;
  car.position.set(bay.x, 0, instant? -3.1 : 16 + Math.random()*6);
  car.rotation.y = Math.PI; // front faces chargers (-Z if model front is +Z we flip after vision check)
  // ground light refs: behind (tail, red) and front (head, warm) — car forward is -Z after rot.y=PI/2
  const cshadow = contactShadow(5.6*sz, 2.8*sz, 0, 0, 0.9); cshadow.position.set(car.position.x, 0.018, car.position.z); scene.add(cshadow); bay.cshadow=cshadow;
  const tail=new THREE.Mesh(new THREE.PlaneGeometry(1.7,2.6), new THREE.MeshBasicMaterial({map:carReflTexRed,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0.32}));
  tail.rotation.x=-Math.PI/2; tail.position.set(car.position.x, 0.016, car.position.z+1.4); tail.rotation.z=Math.PI; tail.renderOrder=5; scene.add(tail); bay.tailRefl=tail;
  const head=new THREE.Mesh(new THREE.PlaneGeometry(1.5,2.2), new THREE.MeshBasicMaterial({map:carReflTexWarm,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0.28}));
  head.rotation.x=-Math.PI/2; head.position.set(car.position.x, 0.016, car.position.z-1.2); head.renderOrder=5; scene.add(head); bay.headRefl=head;
  if(vip){ car.traverse(o=>{ if(o.isMesh&&o.material&&o.material.name&&(o.material.name.toLowerCase().includes('paint')||o.material.name.toLowerCase().includes('body_color'))){ o.material=o.material.clone(); o.material.color.setHex(0xd9a520); o.material.metalness=0.95; o.material.roughness=0.15; } }); }
  scene.add(car); bay.car=car; bay.state='arriving';
  // world-space charge progress bar floating above the car
  const barG=new THREE.Group();
  const barBg=new THREE.Mesh(new THREE.PlaneGeometry(1.5,0.14), new THREE.MeshBasicMaterial({color:0x071018,transparent:true,opacity:0.72,depthWrite:false}));
  const barFill=new THREE.Mesh(new THREE.PlaneGeometry(1.44,0.08), new THREE.MeshBasicMaterial({color:0x35e07c,transparent:true,opacity:0.95,depthWrite:false}));
  barFill.position.z=0.001;
  const barTxt=new THREE.Sprite(new THREE.SpriteMaterial({map:barPctTex(''),transparent:true,depthWrite:false}));
  barTxt.scale.set(0.62,0.31,1); barTxt.position.set(0,0.20,0.002);
  barBg.add(barFill); barG.add(barBg); barG.add(barTxt);
  bay.barH = 2.05*sz; barG.position.set(car.position.x, 1.86*sz, car.position.z); barG.visible=false; barG.renderOrder=8;
  scene.add(barG); bay.barG=barG; bay.barFill=barFill; bay.barTxt=barTxt; bay.barLast='';
  // drive-in animation target
  bay.driveTo = -3.1;
}

// ---------------- interaction state ----------------
const keys={};
addEventListener('keydown',e=>{ SFX.resume(); keys[e.code]=true; onKey(e); });
addEventListener('keyup',e=>keys[e.code]=false);

// ---- car segments: different packs, patience, fees ----
function pickSegment(){
  const h=Math.floor(sim.gameClock/60);
  let ws = SEGMENTS.map(s=> s.w * (s.id==='taxi' ? ((h>=6&&h<=9)||(h>=16&&h<=20)?2.2:0.7) : (s.id==='van' ? (h>=9&&h<=16?1.8:0.8) : 1)));
  const tot=ws.reduce((a,b)=>a+b,0); let r=Math.random()*tot;
  for(let i=0;i<SEGMENTS.length;i++){ r-=ws[i]; if(r<=0) return SEGMENTS[i]; }
  return SEGMENTS[0];
}
// ---- tech tree ----
// ---- weather/events ----
const clockEl=document.getElementById('clock'), priceEl=document.getElementById('price'),
      revEl=document.getElementById('rev'), servedEl=document.getElementById('served'),
      loadEl=document.getElementById('load'), wxEl=document.getElementById('wx'),
      promptEl=document.getElementById('prompt'), toastEl=document.getElementById('toast'),
      cashEl=document.getElementById('cash'), dayEl=document.getElementById('day'), bufEl=document.getElementById('buf');
let tEEl=null, tREl=null;

function toast(msg){ toastEl.innerHTML=msg; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>toastEl.classList.remove('show'),2200); }

// ---- weather system: rain streaks, ripples, lens drops, events ----
const WEATHER = createWeather({ scene, camera, mirror, ripples, windSway,
  asphalt, wxEl, nightK: ()=>ATMO.nightK, toast });

// ---- economy system: market, solar/buffer, arrivals, day cycle, goals, save ----
const ECONOMY = createEconomy({ scene, fog, applyDaylight, WORLD, spawnCar,
  carProtos: ()=>carProtos, toast, addBuffer, flashTech,
  bufferLens: (hex)=>{ if(bufferMesh&&bufferMesh.userData.lens) bufferMesh.userData.lens.material.emissive.setHex(hex); } });

// ---- bay system: state machine, charging, cables, plug follow ----
const BAYSYS = createBays({ scene, camera, toast, loadEl, BAY_X: BAYS,
  paySession: (b)=>ECONOMY.paySession(b), repAdd: (v)=>ECONOMY.repAdd(v), paintGoals: ()=>ECONOMY.paintGoals() });


function lensDrip(dt){
  if(!lensG) return;
  lensG.clearRect(0,0,640,360);
  for(const d of drops){
    d.y += d.v*dt*(60+d.r*40);
    if(d.y>360+d.r){ d.y=-d.r*3; d.x=Math.random()*640; d.trail=0; }
    // droplet blob
    const g=lensG.createRadialGradient(d.x,d.y,0.5,d.x,d.y,d.r*2.4);
    g.addColorStop(0,'rgba(255,250,240,0.55)'); g.addColorStop(0.6,'rgba(200,220,235,0.16)'); g.addColorStop(1,'rgba(0,0,0,0)');
    lensG.fillStyle=g; lensG.beginPath(); lensG.arc(d.x,d.y,d.r*2.4,0,Math.PI*2); lensG.fill();
    // trail when running
    if(d.v>0.45){ lensG.fillStyle='rgba(220,235,245,0.10)'; lensG.fillRect(d.x-d.r*0.6, d.y-d.r*8, d.r*1.2, d.r*8); }
  }
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
  if(e.code==='KeyU'){ const t=currentTarget(); if(t) upgradeBay(t.bay); }
  if(e.code==='KeyB'){ buyBuffer(); }
  if(e.code==='KeyN'){ const t=currentTarget(); if(t&&t.bay.locked) unlockBay(t.bay); }
  if(e.code==='KeyP'){ ECONOMY.saveGame(); toast('💾 Saved'); }
  if(e.code==='KeyT'){ toggleTechMenu(); }
  if(techOpen){
    const idx=['Digit1','Digit2','Digit3','Digit4'].indexOf(e.code);
    if(idx>=0){ const id=Object.keys(TECH)[idx]; buyTech(id); renderTech(); }
    if(e.code==='Escape'){ toggleTechMenu(false); }
  }
}

// controller
const controls = new PointerLockControls(camera, renderer.domElement);
const startEl = document.getElementById('start');
const touchEl = document.getElementById('touchui');
const isTouch = matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints>0);
let touchMode=false;

function enterTouch(){
  touchMode=true;
  tEEl=tEEl||document.getElementById('tE'); tREl=tREl||document.getElementById('tR');
  startEl.style.display='none';
  touchEl.style.display='block';
}
document.getElementById('playbtn').addEventListener('click',()=>{ SFX.resume(); if(isTouch) enterTouch(); else controls.lock(); COACH.maybeShow(); });
startEl.addEventListener('click',(e)=>{ if(!isTouch && e.target.id!=='playbtn') controls.lock(); });
controls.addEventListener('lock', ()=>{ startEl.style.display='none'; });
controls.addEventListener('unlock', ()=>{ if(sim.ready && !isTouch && !touchMode && !techOpen) startEl.style.display='flex'; });
// desktop: clicking the game view re-locks the mouse (fixes "mouse never locked")
renderer.domElement.addEventListener('click',()=>{ SFX.resume(); if(sim.ready && !isTouch && controls.isLocked===false) controls.lock(); });

// ---- touch controls: left stick = move, right-drag = look, buttons = E / ⚡ ----
let tF=0, tS=0, stickId=null, lookId=null, lastLX=0, lastLY=0;
const stickEl=document.getElementById('joy'), knobEl=document.getElementById('knob');
if(isTouch){
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
    // drags on the right 60% of screen (not on a button/stick) = look
    if(stickId!==null) return;
    const tgt=ev.target;
    if(tgt && (tgt.closest('#joy')||tgt.closest('.tbtn')||tgt.closest('#start'))) return;
    const r=window.innerWidth;
    if(t.clientX > r*0.35){
      lookId = t.pointerId!==undefined? t.pointerId : t.identifier;
      lastLX=t.clientX; lastLY=t.clientY;
    }
  });
  document.getElementById('tE').addEventListener(startEvt==='pointerdown'?'pointerdown':'touchstart',(ev)=>{ ev.preventDefault(); SFX.resume(); if(sim.ready) tryInteract(); });
  document.getElementById('tR').addEventListener(startEvt==='pointerdown'?'pointerdown':'touchstart',(ev)=>{ ev.preventDefault(); SFX.resume(); if(sim.ready) toggleCharge(); });
  const tmBtn=document.getElementById('tM');
  tmBtn.addEventListener(startEvt==='pointerdown'?'pointerdown':'touchstart',(ev)=>{ ev.preventDefault(); SFX.resume(); const m=SFX.toggleMute(); tmBtn.textContent=m?'🔇':'🔊'; });
}

let vy=0, bob=0;
function updatePlayer(dt){
  const speed=(keys['ShiftLeft']?4.6:2.4)*(touchMode?1.2:1);
  const f=(keys['KeyW']?1:0)-(keys['KeyS']?1:0)+(touchMode?tF:0);
  const s=(keys['KeyD']?1:0)-(keys['KeyA']?1:0)+(touchMode?tS:0);
  const dir=new THREE.Vector3();
  camera.getWorldDirection(dir); dir.y=0; dir.normalize();
  const right=new THREE.Vector3().crossVectors(dir,new THREE.Vector3(0,1,0));
  const move=new THREE.Vector3().addScaledVector(dir,f*speed).addScaledVector(right,s*speed);
  // simple bounds
  camera.position.addScaledVector(move, dt);
  camera.position.x=THREE.MathUtils.clamp(camera.position.x,-16,16);
  camera.position.z=THREE.MathUtils.clamp(camera.position.z,-9,13);
  // head bob
  if(f||s){ bob+=dt*(keys['ShiftLeft']?11:8); }
  camera.position.y = 1.62 + Math.sin(bob)*0.025;
}

// raycast interactable chargers
const ray = new THREE.Raycaster();
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

let daySummaryT=0;

function tryInteract(){
  const t = currentTarget();
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
        sim.docked=true; b.plugged=true; b.car.userData.docked=true; b.state='ready'; b.chargeStartT=performance.now(); b.chargeKwh=0;
        // GLB ground truth: nozzle tip = local +Y (tip at y .17..21), face-up = local +Z.
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
  let b= forceBay!=null ? sim.bays[forceBay] : (sim.grabbedBay && sim.docked ? sim.grabbedBay : (currentTarget()? currentTarget().bay : null));
  if(!b){ toast('Aim at a charger'); return; }
  if(!b.plugged){ toast('Dock the connector first (E)'); return; }
  if(b.state==='charging'){ b.state='ready'; SFX.click(180); toast('⏸ Charging paused'); return; }
  BAYSYS.autoEnergize(b);
}

const SHADOW_TEX = shadowTex();
function contactShadow(w,d,x,z,op){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d), new THREE.MeshBasicMaterial({map:SHADOW_TEX,transparent:true,opacity:(op??0.85)*0.26,depthWrite:false,blending:THREE.MultiplyBlending}));
  m.rotation.order='YXZ'; m.rotation.x=-Math.PI/2; m.position.set(x,0.018,z); m.renderOrder=6; return m;
}

const carReflTexWarm = (function(){
  const c=document.createElement('canvas'); c.width=128;c.height=256; const g=c.getContext('2d');
  const grd=g.createLinearGradient(0,0,0,256);
  grd.addColorStop(0,'rgba(255,240,210,0.8)'); grd.addColorStop(0.4,'rgba(255,235,200,0.2)'); grd.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=grd; g.fillRect(0,0,128,256);
  const gx=g.createLinearGradient(0,0,128,0);
  gx.addColorStop(0,'rgba(0,0,0,1)'); gx.addColorStop(0.5,'rgba(0,0,0,0)'); gx.addColorStop(1,'rgba(0,0,0,1)');
  g.globalCompositeOperation='destination-out'; g.fillStyle=gx; g.fillRect(0,0,128,256);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
})();

// ---------------- loop ----------------
let last=performance.now(), fpsAcc=0, fpsN=0, fpsVal=60;
function animate(){
  requestAnimationFrame(animate);
  const now=performance.now(); const dt=Math.min(0.05,(now-last)/1000); last=now;
  fpsAcc+=1/dt; fpsN++; if(fpsN>=30){ fpsVal=fpsAcc/fpsN; fpsAcc=0; fpsN=0; diag.fps=Math.round(fpsVal);
    if(Q.mode==='auto' && !autoDropped && diag.fps<28){ autoLowT++; if(autoLowT>=3){ autoDropped=true; qApply('low'); toast('\u2699 Auto: LOW (press G to cycle quality)'); } } else if(diag.fps>=45){ autoLowT=0; } }

  updatePlayer(dt);

  ECONOMY.tick(dt, now);
  COACH.tick();
  WEATHER.events(now);
  const cold = now<sim.coldUntil;
  // (fog density driven by day/night line above)

  WEATHER.tick(dt, now);
  let maxSpd=0;
  for(const b of sim.bays){ if(b.car){ wetUpdate(b.car, dt, performance.now()); maxSpd=Math.max(maxSpd, b.car.userData.speed||0); b.car.userData.speed=0; } }
  SFX.setTire(Math.min(1, maxSpd/9));

  const totalKw = BAYSYS.tick(dt, now);
    if(cashEl){ cashEl.textContent='$'+sim.cash.toFixed(2); cashEl.className = sim.cash>=0?'good':'bad'; }
  if(dayEl) dayEl.textContent=sim.day;
  const repEl=document.getElementById('rep');
  if(repEl && performance.now()-ECONOMY.repFlashT>2600){ repEl.textContent='★ '+Math.round(sim.rep); repEl.className = sim.rep>=70?'good':(sim.rep>=40?'':'bad'); }
  if(bufEl) bufEl.textContent = (sim.bufferOwned? Math.round(sim.bufferKwh)+' / '+sim.BUFFER_CAP+' kWh':'—') + (sim.solarLast>0.02? ' · ☀ '+Math.round(sim.solarLast*sim.SOLAR_CAP_KW)+' kW':'');
  revEl.textContent = '$'+sim.revenue.toFixed(2);
  { const sp=document.getElementById('sellp'); if(sp){ sp.textContent=Math.round(sellPrice()*100)+'¢/kWh'; sp.className = sim.sellMarkup>2.4?'bad':(sim.sellMarkup<1.5?'warn':'good'); } }
  servedEl.textContent = sim.served;

  // prompt text
  const t=currentTarget();
  if(sim.grabbedBay && !sim.docked) promptEl.innerHTML = sim.grabbedBay.plugTaut? '<b class="warn">Cable taut</b> — back toward the car port · <b>E</b> to lock' : 'Press <b>E</b> at port to lock', promptEl.classList.add('show');
  else if(t&&t.type==='car'&&t.bay.plugged&&t.bay.state==='charging') promptEl.innerHTML='<b>R</b> pause · <b>E</b> unplug', promptEl.classList.add('show');
  else if(t&&t.type==='car'&&t.bay.plugged&&t.bay.state==='ready') promptEl.innerHTML='<b>R</b> resume · <b>E</b> unplug', promptEl.classList.add('show');
  else if(t&&t.type==='charger'&&!sim.grabbedBay&&!t.bay.plugged) promptEl.innerHTML='Press <b>E</b> — grab connector', promptEl.classList.add('show');
  else if(sim.docked&&sim.grabbedBay&&sim.grabbedBay.state!=='charging') promptEl.innerHTML='Press <b>R</b> — energize', promptEl.classList.add('show');
  if(touchMode && tEEl && tREl){
    if(sim.grabbedBay && !sim.docked){ tEEl.textContent='🔌'; tREl.textContent='—'; }
    else if(sim.docked && sim.grabbedBay && sim.grabbedBay.state!=='charging'){ tEEl.textContent='—'; tREl.textContent='⚡'; }
    else if(t && t.type==='car' && t.bay.plugged && t.bay.state==='charging'){ tEEl.textContent='🔌'; tREl.textContent='⏸'; }
    else if(t && t.type==='car' && t.bay.plugged && t.bay.state==='ready'){ tEEl.textContent='🔌'; tREl.textContent='▶'; }
    else if(t && t.type==='charger' && !sim.grabbedBay && !t.bay.plugged){ tEEl.textContent='🔌'; tREl.textContent='—'; }
    else { tEEl.textContent='E'; tREl.textContent='⚡'; }
  }
  else promptEl.classList.remove('show');

  finalPass.uniforms.time.value = now/1000;
  composer.render();
}

// postprocessing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
let ssao=null;
try{
  ssao = new SSAOPass(scene, camera, innerWidth, innerHeight);
  ssao.kernelRadius = 0.35; ssao.minDistance = 0.001; ssao.maxDistance = 0.06;
  ssao.output = SSAOPass.OUTPUT.Default;
  composer.addPass(ssao);
}catch(e){ console.warn('ssao unavailable', e); }
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth,innerHeight), 0.12, 0.45, 0.95);
ATMO.setBloom(bloom);
composer.addPass(bloom);
const FinalFX = {
  uniforms:{ tDiffuse:{value:null}, time:{value:0}, aberr:{value:0.0006}, grain:{value:0.006}, vign:{value:0.24} },
  vertexShader:`varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader:`
    uniform sampler2D tDiffuse; uniform float time, aberr, grain, vign;
    varying vec2 vUv;
    float rand(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv=vUv; vec2 cc=uv-0.5; float r2=dot(cc,cc);
      // chromatic aberration radial
      vec3 col;
      col.r = texture2D(tDiffuse, uv + cc*aberr*1.0).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - cc*aberr*1.0).b;
      // vignette
      col *= 1.0 - vign*smoothstep(0.35,0.95, r2*2.2);
      // saturation lift for golden hour
      float lum = dot(col, vec3(0.2126,0.7152,0.0722));
      col = mix(vec3(lum), col, 1.10);
      // warm white-balance grade; keep cool in deep shadows
      vec3 warmGain = vec3(1.30,1.04,0.72);
      float shadow = 1.0 - smoothstep(0.0,0.35,lum);
      col = mix(col*warmGain, mix(col*warmGain, col*vec3(0.92,0.96,1.10), shadow*0.35), shadow);
      // film grain
      float g = rand(uv*vec2(1920.,1080.)+time)*2.0-1.0;
      col += g*grain*(1.0-length(cc));
      gl_FragColor=vec4(col,1.0);
    }`
};
const finalPass = new ShaderPass(FinalFX);
composer.addPass(new OutputPass());
composer.insertPass(finalPass, composer.passes.length-1);

// resize
addEventListener('resize',()=>{ camera.aspect=innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); composer.setSize(innerWidth,innerHeight); if(ssao) ssao.setSize(innerWidth,innerHeight); });
addEventListener('resize',()=>{ if(Q.mode==='auto') qApply('auto'); });
qApply(localStorage.getItem(QKEY)||'auto');
addEventListener('keydown', e=>{ if(e.code==='KeyG'){ const order=['auto','high','med','low']; qApply(order[(order.indexOf(Q.mode)+1)%4]); } });

// diagnostics for capture harness
const diag={ fps:0, calls:()=>renderer.info.render.calls, tris:()=>renderer.info.render.triangles };
window.__GAME = {
  diag, bays:()=>sim.bays.map(b=>({state:b.state, batt:b.car?b.car.userData.battery:null, vip:b.car?!!b.car.userData.vip:false})),
  carMats(){ const out=[]; const car=carProtos[0]; if(!car) return out; const seen=new Set(); car.traverse(o=>{ if(o.isMesh&&o.material){ const ms=Array.isArray(o.material)?o.material:[o.material]; for(const m of ms){ if(seen.has(m.uuid))continue; seen.add(m.uuid); out.push({name:m.name,metal:m.metalness,rough:m.roughness,env:m.envMapIntensity,cc:m.clearcoat!==undefined?m.clearcoat:null,color:m.color?m.color.getHexString():null}); } } }); return out; },
  ready:()=>sim.ready, envReady:()=>ATMO.envReady,
  carBoxes(){ const out=[]; for(const b of sim.bays){ if(b.car){ const bb=new THREE.Box3().setFromObject(b.car); out.push({bay:b.x, state:b.state, min:bb.min.toArray().map(v=>+v.toFixed(2)), max:bb.max.toArray().map(v=>+v.toFixed(2))}); } } return out; },
  pose(x,y,z,ry,rx){ camera.position.set(x,y,z); camera.rotation.set(rx||0,ry,0); },
  lookAt(x,y,z,dist,up){ const c=camera.position; const d=new THREE.Vector3(x-c.x,y-c.y,z-c.z); d.normalize(); const p=c.clone().addScaledVector(d,-(dist||6)); camera.position.copy(p); const yaw=Math.atan2(-(x-p.x),-(z-p.z)); camera.rotation.set(0,yaw,0); },
  groundInfo(){ const mats=[]; scene.traverse(o=>{ if(o.isMesh && o.geometry && o.geometry.type==='PlaneGeometry' && o.geometry.parameters && o.geometry.parameters.width===220){ const m=o.material; mats.push({name:m.name||'std', hasMap:!!m.map, mapSrc:m.image?m.image.src||m.image.currentSrc||('w'+m.image.width):null, repeat:m.map?[m.map.repeat.x,m.map.repeat.y]:null, rough:m.roughness, metal:m.metalness, vis:o.visible}); } }); return mats; },
  serve(){ sim.served+=1; },
  setClock(h){ sim.gameClock=h*60; },
  weather(v){ sim.raining=Math.max(0,Math.min(1,v)); },
  wx(){ return {raining:+sim.raining.toFixed(2), cold: performance.now()<sim.coldUntil, brown: performance.now()<sim.brownUntil, cap: sim.brownCap, vipPending: sim.vipPending}; },
  event(name){ const t=performance.now();
    if(name==='cold'){ sim.coldUntil=t+60000; return 'cold'; }
    if(name==='brown'){ sim.brownUntil=t+45000; sim.brownCap=500; return 'brown'; }
    if(name==='vip'){ sim.vipPending=true; sim.vipSpawned=false; return 'vip'; }
    if(name==='rain'){ sim.raining=0.8; return 'rain'; } return 'none'; },
  forceArr(i,vip){ const b=sim.bays[i]; if(b.state!=='empty') return 'busy'; spawnCar(b,false,!!vip); return 'ok'; },
  info(){ return {nightK:+ATMO.nightK.toFixed(3), clock:Math.floor(sim.gameClock), protos:carProtos.length, fixtures:nightFixtures.length}; },
  camPos(){ return {x:+camera.position.x.toFixed(2), y:+camera.position.y.toFixed(2), z:+camera.position.z.toFixed(2)}; },
  setBatt(i,v){ if(sim.bays[i].car){ sim.bays[i].car.userData.battery=v; return 'ok'; } return 'nocar'; },
  q(){ return {mode:Q.mode, fps:diag.fps, pxr:renderer.getPixelRatio?+renderer.getPixelRatio().toFixed(2):null}; },
  techState(){ return Object.assign({}, sim.techOwned); },
  techbuy(id){ return buyTech(id); },
  setCash(v){ sim.cash=v; return sim.cash; },
  repGet(){ return sim.rep; },
  techmenu(force){ toggleTechMenu(force); return techOpen; },
  aimPort(i){ const b=sim.bays[i]; if(!b.car) return 'nocar'; const p=BAYSYS.bayPort(b); camera.position.set(p.x+1.35, p.y+0.15, p.z+0.45); camera.lookAt(p); return 'ok'; },
  portPos(i){ const b=sim.bays[i]; if(!b.car) return null; const p=BAYSYS.bayPort(b); return {x:+p.x.toFixed(2),y:+p.y.toFixed(2),z:+p.z.toFixed(2)}; },
  forceSeg(i,id,ci){ const p=(segProto[id]&&segProto[id][ci||0])||(origProtos[0]); if(!p) return 'nopool';
    const car=p.clone(true); if(sim.bays[i].car){ scene.remove(sim.bays[i].car); }
    car.traverse(o=>{ if(o.isMesh){o.castShadow=true;o.receiveShadow=true;} });
    if(p.userData.protoPort) car.userData.portLocal=new THREE.Vector3(...p.userData.protoPort);
    car.userData={...car.userData, battery:0.2, need:0.9, patience:9999, arrived:performance.now(), vip:false, seg:(SEGMENTS.find(s=>s.id===id)||SEGMENTS[0]), packKwh:80, portLocal:(p.userData.protoPort?new THREE.Vector3(...p.userData.protoPort):car.userData.portLocal)};
    sim.bays[i].car=car; sim.bays[i].state='parked'; sim.bays[i].plugged=false; scene.add(car);
    const p0=sim.bays[i].car.position; car.position.set(sim.bays[i].x,0,-3.1);
    if(sim.bays[i].cshadow){sim.bays[i].cshadow.position.set(sim.bays[i].x,0.018,-3.1);sim.bays[i].cshadow.visible=true;}
    return 'ok '+id; },
  forceOrig(i,ci){ scene.traverse(o=>{ if(o.type==='Group'&&o!==sim.bays[i]?.car&&o.userData&&o.userData.fleet) o.visible=false; });
    sim.bays.forEach((bb,j)=>{ if(j!==i&&bb.car){ bb.car.visible=false; } if(bb.cshadow&&j!==i) bb.cshadow.visible=false; });
    const b=sim.bays[i]; if(b.car){ scene.remove(b.car); b.car=null; }
    const proto=origProtos.length? origProtos[(ci||0)%origProtos.length] : null; if(!proto) return 'noproto';
    const car=proto.clone(true); car.traverse(o=>{ if(o.isMesh){o.castShadow=true;o.receiveShadow=true;} });
    car.userData={ battery:0.18, need:0.9, patience:9999, arrived:performance.now(), vip:false, seg:SEGMENTS[0], packKwh:75, portLocal:new THREE.Vector3(-0.60,0.62,-0.88) };
    car.position.set(b.x,0,-3.1); car.rotation.y=Math.PI; scene.add(car); b.car=car; b.state='parked'; b.plugged=false;
    if(b.cshadow){ b.cshadow.position.set(b.x, 0.018, -3.1); b.cshadow.visible=true; } else { b.cshadow=contactShadow(5.6,2.8,b.x,-3.1,0.9); }
    return 'ok'; },
  carPos(i){ const b=sim.bays[i]; if(!b.car) return null; return {x:+b.car.position.x.toFixed(2),y:+b.car.position.y.toFixed(2),z:+b.car.position.z.toFixed(2),yaw:+b.car.rotation.y.toFixed(2)}; },
  plugBox(i){ const b=sim.bays[i]; if(!b.plug) return null; const bb=new THREE.Box3().setFromObject(b.plug); return {min:[+bb.min.x.toFixed(2),+bb.min.y.toFixed(2),+bb.min.z.toFixed(2)],max:[+bb.max.x.toFixed(2),+bb.max.y.toFixed(2),+bb.max.z.toFixed(2)]}; },
  plugRot(i,z,x){ const b=sim.bays[i]; if(!b.plug) return 'noplug'; if(z!==undefined) b.plug.quaternion.setFromEuler(new THREE.Euler(x||0, 0, z, 'ZXY')); else b.plug.quaternion.set(0,0,0,1); b.plug.position.copy(BAYSYS.bayPort(b)); return 'ok'; },
  plugTip(i){ const b=sim.bays[i]; if(!b.plug) return null; const v=new THREE.Vector3(0,1,0).applyQuaternion(b.plug.quaternion); return {x:+v.x.toFixed(2),y:+v.y.toFixed(2),z:+v.z.toFixed(2)}; },
  dockVisual(i){ const b=sim.bays[i]; if(!b.plug||!b.car) return 'nodata'; const port=BAYSYS.bayPort(b); const inward=new THREE.Vector3(1,0,0).applyQuaternion(b.car.quaternion); const up=new THREE.Vector3(0,1,0); const xA=new THREE.Vector3().crossVectors(up,inward); if(xA.lengthSq()<1e-6) xA.set(1,0,0); xA.normalize(); const zA=new THREE.Vector3().crossVectors(inward,xA).normalize(); b.plug.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA,inward,zA)); b.plug.position.copy(port).addScaledVector(inward,0.06); return this.plugTip(i); },
  cableView(i){ const b=sim.bays[i]; if(!b.car||!b.glandPos) return 'nodata'; const p=BAYSYS.bayPort(b); const mid=p.clone().add(b.glandPos).multiplyScalar(0.5); const dir=p.clone().sub(b.glandPos); const side=new THREE.Vector3(-dir.z,0,dir.x).normalize(); camera.position.copy(mid).add(side.multiplyScalar(1.6)).add(new THREE.Vector3(0,0.55,0)); camera.lookAt(mid); return 'ok'; },
  aimCharger(i){ const b=sim.bays[i]; camera.position.set(b.x+1.9, 1.15, -4.3); const look=new THREE.Vector3(b.x,0.95,-6.0); camera.lookAt(look); return 'ok'; },
  hidecars(v){ sim.bays.forEach(b=>{ if(b.car) b.car.visible=!v; }); return 'ok'; },
  onlycharger(i){ scene.traverse(o=>{ if(o.isMesh) o.visible=false; }); sim.bays.forEach((b,j)=>{ if(b.charger){ b.charger.visible=(j===i); b.charger.traverse(o=>{ if(o.isMesh) o.visible=(j===i); }); } if(b.plug) b.plug.visible=(j===i); }); return 'ok'; },
  qset(m){ qApply(m); return Q.mode; },
  solar(){ return {last:+sim.solarLast.toFixed(2), stored:+sim.solarKwh.toFixed(2), capKW:sim.SOLAR_CAP_KW}; },
  // ---- soak-test hooks: drive the REAL interaction path ----
  bayState(i){ const b=sim.bays[i]; return {state:b.state, batt:b.car?+b.car.userData.battery.toFixed(3):null, kwh:+(b.chargeKwh||0).toFixed(3), pat:b.car?+((performance.now()-b.car.userData.arrived)/1000).toFixed(1):null}; },
  grab(i){ if(sim.bays[i].plugged) return 'plugged'; if(sim.grabbedBay&&sim.grabbedBay!==sim.bays[i]) return 'busy'; sim.grabbedBay=sim.bays[i]; sim.docked=false; return 'grabbed'; },
  dock(i){ if(!sim.bays[i].car) return 'nocar'; sim.docked=false; sim.grabbedBay=null; sim.bays[i].plugged=true; sim.bays[i].car.userData.docked=true; sim.bays[i].state='ready'; BAYSYS.autoEnergize(sim.bays[i]); return sim.bays[i].state; },
  energize(i){ if(i!=null && sim.bays[i].plugged) BAYSYS.autoEnergize(sim.bays[i]); return i!=null? sim.bays[i].state : 'none'; },
  pause(i){ if(i!=null) toggleCharge(i); return i!=null? sim.bays[i].state : 'none'; },
  econ(){ return {revenue:+sim.revenue.toFixed(2), served: sim.served, price:+sim.spotPrice.toFixed(4)}; },
  loadKw(){ let t=0; for(const b of sim.bays) if(b.state==='charging') t+=b.kw; return t; },
  money(){ return {cash:+sim.cash.toFixed(2), day: sim.day, dayRev:+sim.dayRev.toFixed(2), dayCost:+sim.dayCost.toFixed(2), bufferKwh:+sim.bufferKwh.toFixed(2), bufferOwned: sim.bufferOwned}; },
  hourStats(){ return {served:sim.hourStats, arrivals:sim.hourArr, kicks:sim.kickedHourly, arrivedTotal: sim.arrivedTotal}; },
  setMarkup(v){ sim.sellMarkup=THREE.MathUtils.clamp(v, sim.MARKUP_MIN, sim.MARKUP_MAX); return {markup:sim.sellMarkup, sell:+sellPrice().toFixed(4), demand:+demandFactor().toFixed(3)}; },
  markup(){ return {markup:sim.sellMarkup, sell:+sellPrice().toFixed(4), demand:+demandFactor().toFixed(3)}; },
  save(){ ECONOMY.saveGame(); return localStorage.getItem('chargebay_save_v1')? 'saved':'fail'; },
  endDayNow(){ ECONOMY.endDay(); return 'ok'; },
  cardOpen(){ return !!(window.__GAME&&window.__GAME._cardOpen); },
  goalsState(){ return {goals: sim.goals, dayStats: sim.dayStats, streak: sim.streak}; },
  completeGoal(id){ const g=sim.goals.find(x=>x.id===id); if(g&&!g.done){ sim.dayStats[g.key]=g.target; ECONOMY.bumpGoal(g.key,0);} return 'ok'; },
  techopen(){ toggleTechMenu(true); return 'ok'; },
  tailGlow(i){ const car=sim.bays[i]&&sim.bays[i].car; if(!car) return null; let mx=0; car.traverse(o=>{ if(o.isMesh&&o.material&&/tail/i.test(o.material.name||'')) mx=Math.max(mx,o.material.emissiveIntensity); }); return +mx.toFixed(2); },
  finishArr(i){ const b=sim.bays[i]; if(b.state==='arriving'&&b.car){ b.car.position.z=b.driveTo; b.car.rotation.y=Math.PI+(b.x-b.car.position.x)*0.035; b.state='parked'; b.car.userData.arrived=performance.now(); } return b.state; },
  kickBay(i){ const b=sim.bays[i]; if(b.car&&b.state!=='departing'){ b.state='departing'; b.plugged=false; } return b.state; },
  wiperCount(i){ const car=sim.bays[i]&&sim.bays[i].car; if(!car) return -1; let n=0; car.traverse(o=>{ if(o.name==='WiperArm') n++; }); return n; },
  wiperTips(i){ const car=sim.bays[i]&&sim.bays[i].car; if(!car) return null; car.updateMatrixWorld(true); const out=[]; car.traverse(o=>{ if(/^WiperArm/.test(o.name||'')){ const m=o.matrixWorld; out.push([+m.elements[12].toFixed(2),+m.elements[13].toFixed(2),+m.elements[14].toFixed(2)]); } }); return out; },
  sweepCount(i){ const car=sim.bays[i]&&sim.bays[i].car; if(!car) return -1; let n=0; car.traverse(o=>{ if(o.name==='WipSweep') n++; }); return n; },
  probeCar(i){ const car=sim.bays[i]&&sim.bays[i].car; if(!car) return null; const out={yaw:+car.rotation.y.toFixed(2), pos:car.position.toArray().map(v=>+v.toFixed(2))}; car.updateMatrixWorld(true);
    const named={}; car.traverse(o=>{ if(o.isMesh && /glass|head|tail|windshield/i.test(o.name||'')){ const bb=new THREE.Box3().setFromObject(o); if(!named[o.name]) named[o.name]={min:bb.min.toArray().map(v=>+v.toFixed(2)),max:bb.max.toArray().map(v=>+v.toFixed(2))}; } }); out.parts=named; return out; },
  clearBay(i){ const b=sim.bays[i]; if(b.car){ scene.remove(b.car); b.car=null; } b.state='empty'; b.plugged=false; return 'ok'; },
  spokeInfo(i){ const car=sim.bays[i]&&sim.bays[i].car; if(!car) return {e:'nocar'}; const out=[]; car.updateMatrixWorld(true); car.traverse(o=>{ if(o.isMesh && /^Spoke[0-9]+|Spoke_[0-9]+/.test(o.name) && out.length<8){ const wp=new THREE.Vector3(); o.getWorldPosition(wp); out.push({n:o.name, l:[+o.position.x.toFixed(2),+o.position.y.toFixed(2),+o.position.z.toFixed(2)], w:[+wp.x.toFixed(2),+wp.y.toFixed(2),+wp.z.toFixed(2)]}); } }); return {yaw:car.rotation.y, pos:car.position.toArray().map(v=>+v.toFixed(2)), wheels:out}; },
  audio(){ return { active: !!(window.__SFXREF && window.__SFXREF.ctx), muted: SFX.muted }; },
};

// ---------------- first-run coach ----------------
const COACH = (function(){
  const KEY='chargebay_coached_v1';
  let el, steps=[], active=false, startPos=null, seenGrab=false, seenDock=false;
  function init(){
    el=document.getElementById('coach');
    steps=[...document.querySelectorAll('.step')].map(s=>({el:s, done:false}));
    document.getElementById('coachx').addEventListener('click', hide);
    if(isTouch) document.body.classList.add('touch');
  }
  function maybeShow(){
    if(localStorage.getItem(KEY)) return;
    el.style.display='flex'; active=true; startPos=null; document.body.classList.add('coaching');
    steps.forEach(s=>s.el.classList.remove('done'));
  }
  function mark(i){ if(!steps[i].done){ steps[i].done=true; steps[i].el.classList.add('done'); SFX.click(640); } }
  function tick(){
    if(!active) return;
    const p=camera.position;
    if(!startPos) startPos=p.clone();
    if(p.distanceTo(startPos)>1.2) mark(0);
    // grab/dock inferred from persistent bay state (plug stays plugged after release)
    const anyPlugged = sim.bays.some(b=>b.plugged);
    if(sim.grabbedBay || anyPlugged) mark(1);
    if(anyPlugged) mark(2);
    if(sim.bays.some(b=>b.state==='charging')) mark(3);
    if(sim.served>0){ mark(4); setTimeout(hide, 2500); }
  }
  function hide(){ el.style.display='none'; active=false; document.body.classList.remove('coaching'); localStorage.setItem(KEY,'1'); }
  return { init, maybeShow, tick, hide };
})();
COACH.init();
// ---------------- tech menu ----------------
let techOpen=false;
const TECH_ICONS={heater:'🌡️',inverter:'⚙️',ads:'📡',priority:'👑'};
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
  if(techOpen){ renderTech(); if(!isTouch) controls.unlock(); }
  else if(!isTouch && !touchMode) controls.lock();
}
WEATHER.initLensFx();
loadAssets().catch(e=>{ console.error('asset load failed', e && e.type, e && e.message); sim.ready=true; if(!envReady) envReady=true; });
setInterval(()=>{ if(sim.ready) ECONOMY.saveGame(); }, 30000);
addEventListener('beforeunload', ()=>{ if(sim.ready) ECONOMY.saveGame(); });
addEventListener('keydown', e=>{ if(e.code==='Tab') e.preventDefault(); });
animate();
