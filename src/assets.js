// ASSETS: GLTF loading pipeline + car proto helpers + per-car spawn rig.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { barPctTex, carReflTexRed, shadowTex } from './textures.js';
import { SEGMENTS } from './config.js';

const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('vendor/libs/draco/gltf/');
loader.setDRACOLoader(draco);
export function loadGLB(path){ return new Promise((res,rej)=>{ const to=setTimeout(()=>rej(new Error('timeout '+path)), 120000); loader.load(path,(g)=>{clearTimeout(to);res(g);},(e)=>{},(e)=>{clearTimeout(to);rej(new Error('loadfail '+path+' '+(e&&(e.message||e.type||''))));}); }); }

export const PAINTS = [0x0a2e6b, 0xe8dcc8, 0x8f0f14, 0x1c2026, 0x0f4d3a, 0x6b6e73];

export function orientCar(obj){
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

export function boostEnv(root, inten=2.6, qMax=2.6){
  root.traverse(o=>{
    if(o.isMesh && o.material){
      const ms=Array.isArray(o.material)?o.material:[o.material];
      for(const m of ms){ if(m.isMeshStandardMaterial){ m.envMapIntensity=Math.min(m.envMapIntensity||1, qMax); if('clearcoat' in m){ m.clearcoat=Math.min(m.clearcoat+0.2,0.9); m.clearcoatRoughness=Math.max(m.clearcoatRoughness,0.1);} if(m.emissiveIntensity>4){ m.emissiveIntensity=2.2; } m.needsUpdate=true; } }
    }
  });
}

const SHADOW_TEX = shadowTex();
export function contactShadow(w,d,x,z,op){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d), new THREE.MeshBasicMaterial({map:SHADOW_TEX,transparent:true,opacity:(op??0.85)*0.26,depthWrite:false,blending:THREE.MultiplyBlending}));
  m.rotation.order='YXZ'; m.rotation.x=-Math.PI/2; m.position.set(x,0.018,z); m.renderOrder=6; return m;
}

export const carReflTexWarm = (function(){
  const c=document.createElement('canvas'); c.width=128;c.height=256; const g=c.getContext('2d');
  const grd=g.createLinearGradient(0,0,0,256);
  grd.addColorStop(0,'rgba(255,240,210,0.8)'); grd.addColorStop(0.4,'rgba(255,235,200,0.2)'); grd.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=grd; g.fillRect(0,0,128,256);
  const gx=g.createLinearGradient(0,0,128,0);
  gx.addColorStop(0,'rgba(0,0,0,1)'); gx.addColorStop(0.5,'rgba(0,0,0,0)'); gx.addColorStop(1,'rgba(0,0,0,1)');
  g.globalCompositeOperation='destination-out'; g.fillStyle=gx; g.fillRect(0,0,128,256);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
})();

// spawn a car at a bay with random paint & battery
export function spawnCar(ctx, bay, instant=false, vip=false, seg=null){
  const { scene, pickSegment, carProtos, origProtos, segProto } = ctx;
  seg = seg || pickSegment();
  if(vip && segProto()['super'] && segProto()['super'].length) seg = SEGMENTS.find(s=>s.id==='super') || seg;
  const pool = (segProto()[seg.id] && segProto()[seg.id].length) ? segProto()[seg.id] : origProtos();
  const proto = (pool && pool.length) ? pool[Math.floor(Math.random()*pool.length)] : carProtos()[Math.floor(Math.random()*carProtos().length)];
  const car = proto.clone(true);
  if(proto.userData && proto.userData.protoPort) car.userData.portLocal = new THREE.Vector3(...proto.userData.protoPort);
  car.traverse(o=>{ if(o.isMesh){o.castShadow=true; o.receiveShadow=true;} });
  const sz = seg.id==='truck'? 1.5 : seg.id==='van'? 1.28 : seg.id==='suv'? 1.12 : seg.id==='taxi'? 1.0 : seg.id==='retro'? 0.94 : 1.0;
  car.scale.multiplyScalar(sz); bay.carScale=sz;
  const roll = vip? 0.03+Math.random()*0.12 : 0.08+Math.random()*0.5;
  car.userData = { battery: roll, need: vip? 0.95 : 0.72+Math.random()*0.25, patience: vip? 55 : seg.patience[0]+Math.random()*(seg.patience[1]-seg.patience[0]), arrived: performance.now(), vip, seg, packKwh: seg.pack, polite: Math.random()<0.12 };
  if(car.userData.polite) car.userData.patience*=1.25;
  if(seg.paint){ car.traverse(o=>{ if(o.isMesh&&o.material&&o.material.name&&(o.material.name.toLowerCase().includes('paint')||o.material.name.toLowerCase().includes('body_color'))){ o.material=o.material.clone(); o.material.color.setHex(seg.paint); if(seg.id==='taxi'){ o.material.metalness=0.35; o.material.roughness=0.3; } } }); }
  if(seg.id==='taxi' && !vip){
    const bb=new THREE.Box3().setFromObject(car); const roofY=bb.max.y;
    const sign=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.16,0.24), new THREE.MeshStandardMaterial({color:0xffe14d, emissive:0xcaa100, emissiveIntensity:1.4, roughness:0.4}));
    sign.position.set(0,roofY+0.09,0.1); car.add(sign);
  }
  bay.segName = seg.name; bay.segFee = seg.fee;
  car.position.set(bay.x, 0, instant? -3.1 : 16 + Math.random()*6);
  car.rotation.y = Math.PI;
  // ground light refs: behind (tail, red) and front (head, warm)
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

// real foliage & street props (Poly Haven)
const PROPS = {};
const windSway=[];   // {o, ph, amp} — gentle canopy breeze, stronger when raining

export async function loadProps(ctx){
  const { scene, windSway } = ctx;
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

