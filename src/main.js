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

// time of day — fixed golden-dusk for now, driven by clock var
const DAY = { t: 0.78 }; // 0..1, dusk ~0.75-0.82

// PMREM env for PBR reflections
let envReady=false;
const HDRI = localStorage.getItem('cb_hdri') || 'assets/hdri/venice_sunset.hdr';
new RGBELoader().load(HDRI, (hdr)=>{
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  hdr.wrapS = THREE.RepeatWrapping; hdr.wrapT = THREE.ClampToEdgeWrapping;
  hdr.offset.y = parseFloat(localStorage.getItem('cb_hdri_v')||'-0.12');   // drop sun toward horizon
  hdr.offset.x = parseFloat(localStorage.getItem('cb_hdri_u')||'0.0');
  const env = pmrem.fromEquirectangular(hdr).texture;
  scene.environment = env;
  scene.background = env;
  scene.backgroundIntensity = 1.0;
  if('environmentIntensity' in scene) scene.environmentIntensity = 1.15;
  hdr.dispose(); pmrem.dispose();
  sky.visible = false;
  hdriBG = true;
  // force IBL response on all standard materials (incl clearcoat on hero car)
  scene.traverse(o=>{
    if(o.isMesh && o.material){
      const ms = Array.isArray(o.material)?o.material:[o.material];
      for(const m of ms){ if(m.isMeshStandardMaterial){ m.envMapIntensity = Math.min(m.envMapIntensity||1, 1.5); if('clearcoat' in m){ m.clearcoat=0.85; m.clearcoatRoughness=0.12; } m.needsUpdate=true; } }
    }
  });
  envReady = true;
}, undefined, (err)=>{ console.warn('hdri failed, shader sky fallback', err); refreshSkyEnv(); envReady = true; });
function refreshSkyEnv(){
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(sky.clone());
  const gm = new THREE.Mesh(new THREE.PlaneGeometry(200,200), new THREE.MeshBasicMaterial({color:0x241a12}));
  gm.rotation.x=-Math.PI/2; gm.position.y=-1; envScene.add(gm);
  scene.environment = pmrem.fromScene(envScene, 0.04).texture;
  pmrem.dispose();
}

// ---------------- quality settings (early for applyDaylight) ----------------
const QKEY='chargebay_quality_v1';
const Q = { mode: 'auto', glare: 1.0, envMax: 2.2 };  // auto|high|med|low  (loaded properly later)

// ---------------- fog & sky ----------------
let hdriBG = false;
const fog = new THREE.FogExp2(0x3a3048, 0.006);
scene.fog = fog;

function makeSky() {
  const geo = new THREE.SphereGeometry(300, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { topCol:{value:new THREE.Color()}, midCol:{value:new THREE.Color()}, botCol:{value:new THREE.Color()}, sunDir:{value:new THREE.Vector3()}, sunCol:{value:new THREE.Color()} },
    vertexShader: `varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `
      varying vec3 vP;
      uniform vec3 topCol,midCol,botCol,sunCol; uniform vec3 sunDir;
      void main(){
        vec3 d = normalize(vP);
        float h = d.y;
        vec3 c = mix(botCol, midCol, smoothstep(-0.05,0.30,h));
        c = mix(c, topCol, smoothstep(0.22,0.75,h));
        // tiny blue-grey lift toward very top to kill maroon seam
        c = mix(c, topCol*1.12+vec3(0.03,0.03,0.06), smoothstep(0.72,1.0,h));
        // sun afterglow
        float s = max(dot(d, normalize(sunDir)),0.);
        c += sunCol * (pow(s,14.)*0.85 + pow(s,4.)*0.28);
        // soft procedural wispy clouds
        float n1 = sin(d.x*4.0+d.y*2.0)*sin(d.z*3.3-d.y*1.5)*0.5+0.5;
        float n2 = sin(d.x*9.0-d.z*7.0)*0.5+0.5;
        float wis = smoothstep(0.55,0.95, (n1*0.7+n2*0.3)*smoothstep(0.02,0.4,h));
        c = mix(c, mix(c*1.25, vec3(0.52,0.44,0.56), 0.5), wis*0.35);
        // ordered dither to kill banding
        float dt = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453);
        c += (dt-0.5)/255.0*3.0;
        gl_FragColor = vec4(c,1.);
      }`
  });
  return new THREE.Mesh(geo, mat);
}
const sky = makeSky(); scene.add(sky);
// warm horizon scattering dome overlay (additive) to push HDRI dusk warmth
const horizonGlow = new THREE.Mesh(new THREE.SphereGeometry(290,32,16), new THREE.ShaderMaterial({
  side: THREE.BackSide, transparent:true, depthWrite:false, blending: THREE.AdditiveBlending,
  uniforms:{}, vertexShader:`varying vec3 vP; void main(){ vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader:`varying vec3 vP; void main(){ float h=normalize(vP).y;
    float band = exp(-abs(h)*4.2);                    // broader horizon band
    float low  = exp(-max(h,0.0)*2.2);               // broad lower glow
    vec3 warm = vec3(0.85,0.44,0.20)*band*0.55 + vec3(0.72,0.36,0.22)*low*0.20;
    float dt = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898,78.233)))*43758.5453);
    gl_FragColor = vec4(warm + (dt-0.5)/255.0*2.0, 1.0); }`
})); horizonGlow.renderOrder = -1; scene.add(horizonGlow);
// ---- day/night cycle: drives sun, sky, fog, exposure, HDRI blend, fixtures ----
let nightK = 1;              // 0=full day, 1=deep night
let bloomPass = null;        // set once composer exists
const nightFixtures = [];
const sunPath = new THREE.Vector3();
const cTop=new THREE.Color(), cMid=new THREE.Color(), cBot=new THREE.Color(), cSun=new THREE.Color(), cFog=new THREE.Color();
function hDay(a,b,k,out){ out.copy(a).lerp(b,k); return out; }
const DAY_TOP=new THREE.Color(0x2f6fd0), DAY_MID=new THREE.Color(0x9cc4ea), DAY_BOT=new THREE.Color(0xefe6d2), DAY_SUN=new THREE.Color(0xfff8e2);
const DUSK_TOP=new THREE.Color(0x2c2650), DUSK_MID=new THREE.Color(0x6a4a72), DUSK_BOT=new THREE.Color(0xe0783c), DUSK_SUN=new THREE.Color(0xff8a3a);
const NIGHT_TOP=new THREE.Color(0x05070f), NIGHT_MID=new THREE.Color(0x0b1020), NIGHT_BOT=new THREE.Color(0x1a1430), NIGHT_SUN=new THREE.Color(0x9db4ff);
function applyDaylight(min){
  if(min==null) min = 18*60+42;
  const t = ((min/1440)*Math.PI*2) - Math.PI/2; // noon=apex, midnight=floor
  const elev = Math.sin(t)*0.62;
  const az = Math.cos(t);
  sunPath.set(az, Math.max(elev, 0.02), -0.55).normalize();
  // bands: nightAmt 1 at deep night, dayAmt 1 in daylight, dusk between
  const dayAmt  = THREE.MathUtils.smoothstep(elev, 0.04, 0.45);
  const nightAmt = 1 - THREE.MathUtils.smoothstep(elev, -0.30, 0.10);
  nightK = nightAmt;
  // sky: NIGHT -> DUSK -> DAY two-band blend
  hDay(DUSK_TOP, DAY_TOP, dayAmt, cTop);     hDay(cTop, NIGHT_TOP, nightAmt, cTop);
  hDay(DUSK_MID, DAY_MID, dayAmt, cMid);     hDay(cMid, NIGHT_MID, nightAmt, cMid);
  hDay(DUSK_BOT, DAY_BOT, dayAmt, cBot);     hDay(cBot, NIGHT_BOT, nightAmt, cBot);
  hDay(DUSK_SUN, DAY_SUN, THREE.MathUtils.smoothstep(elev,0.05,0.35), cSun);
  if(nightAmt>0) hDay(cSun, NIGHT_SUN, nightAmt, cSun);
  const u = sky.material.uniforms;
  u.topCol.value.copy(cTop); u.midCol.value.copy(cMid); u.botCol.value.copy(cBot);
  u.sunCol.value.copy(cSun); u.sunDir.value.copy(sunPath);
  // fog follows sky bottom hue
  cFog.copy(cBot).lerp(cMid, 0.5); fog.color.copy(cFog);
  // sun lights along the path
  sun.color.copy(cSun); sun.intensity = 0.5 + dayAmt*5.0 + (1-nightAmt)*(1-dayAmt)*4.0;
  sun.position.set(sunPath.x*40, Math.max(sunPath.y*40, 3), sunPath.z*40);
  rake.color.copy(cSun); rake.intensity = 0.3 + dayAmt*2.6 + (1-nightAmt)*(1-dayAmt)*3.4;
  rake.position.set(sunPath.z*-24, 4.0, sunPath.x*-24);
  hemi.intensity = 0.08 + dayAmt*0.8 + (1-nightAmt)*(1-dayAmt)*0.24;
  hemi.color.copy(cMid);
  renderer.toneMappingExposure = 0.82 + dayAmt*0.6 + nightAmt*0.12;
  // HDRI blend: day brightens env, night deepens it
  scene.backgroundIntensity = (0.28 + (1-nightAmt)*0.95) * Q.glare;
  if('environmentIntensity' in scene) scene.environmentIntensity = (0.18 + (1-nightAmt)*1.4) * Q.glare;
  // day: bright procedural dome covers the dusk HDRI; dusk/night: HDRI sky shows
  sky.visible = !hdriBG || dayAmt > 0.45;
  horizonGlow.material.opacity = Math.max(0.06, (1-nightAmt)*(1-dayAmt)*0.85 + nightAmt*0.10);
  if(bloomPass) bloomPass.strength = 0.10 + nightAmt*0.5;
  // fixtures: lights glow as darkness rises
  const fx = 0.12 + nightAmt*0.88;
  for(const m of nightFixtures){ m.emissiveIntensity = m.userData.baseEI*fx; }
}
function collectNightLights(){
  nightFixtures.length=0;
  scene.traverse(o=>{
    if(o.isMesh && o.material){
      const ms=Array.isArray(o.material)?o.material:[o.material];
      for(const m of ms){ if(m.isMeshStandardMaterial && m.emissive && m.emissiveIntensity>0 && m.userData.baseEI===undefined){ m.userData.baseEI=m.emissiveIntensity; nightFixtures.push(m); } }
    }
  });
}
setTimeout(()=>{ if(!envReady) refreshSkyEnv(); }, 50);

// lights
const hemi = new THREE.HemisphereLight(0x6a5060, 0x241408, 0.28); scene.add(hemi);
const rake = new THREE.DirectionalLight(0xff7a35, 4.6); rake.position.set(-22, 4.0, 16); rake.castShadow=true; rake.shadow.mapSize.set(2048,2048); rake.shadow.camera.left=-30; rake.shadow.camera.right=30; rake.shadow.camera.top=30; rake.shadow.camera.bottom=-30; rake.shadow.bias=-0.0005; scene.add(rake);
const sun = new THREE.DirectionalLight(0xff9a4d, 3.2);
sun.position.set(-30, 9, -14);
sun.castShadow = true;
sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-30; sun.shadow.camera.right=30; sun.shadow.camera.top=30; sun.shadow.camera.bottom=-30;
sun.shadow.camera.near=1; sun.shadow.camera.far=120; sun.shadow.bias=-0.0004;
scene.add(sun);
applyDaylight();
// ---------------- ground: wet asphalt ----------------
function asphaltTextures(){
  const c = document.createElement('canvas'); c.width=c.height=1024;
  const g = c.getContext('2d');
  g.fillStyle='#14161a'; g.fillRect(0,0,1024,1024);
  // aggregate speckle
  for(let i=0;i<42000;i++){
    const v = 10+Math.random()*28;
    g.fillStyle=`rgba(${v},${v+2},${v+5},${0.25+Math.random()*0.4})`;
    g.fillRect(Math.random()*1024, Math.random()*1024, 1+Math.random()*2.2, 1+Math.random()*2.2);
  }
  // cracks/stains
  for(let i=0;i<40;i++){
    g.strokeStyle=`rgba(8,8,10,${0.25+Math.random()*0.3})`; g.lineWidth=1+Math.random()*2.5;
    g.beginPath(); let x=Math.random()*1024,y=Math.random()*1024; g.moveTo(x,y);
    for(let k=0;k<8;k++){ x+=(Math.random()-0.5)*120; y+=(Math.random()-0.5)*120; g.lineTo(x,y);} g.stroke();
  }
  const colorTex = new THREE.CanvasTexture(c);
  colorTex.wrapS=colorTex.wrapT=THREE.RepeatWrapping; colorTex.repeat.set(6,6);
  // roughness map with puddle blobs
  const r = document.createElement('canvas'); r.width=r.height=1024;
  const rg = r.getContext('2d');
  rg.fillStyle='#3c3c3c'; rg.fillRect(0,0,1024,1024); // wet-biased rough base
  for(let i=0;i<9;i++){ // puddles -> near mirror
    const px=Math.random()*1024, py=Math.random()*1024;
    const rad=60+Math.random()*160;
    const grd=rg.createRadialGradient(px,py,0,px,py,rad);
    grd.addColorStop(0,'rgba(6,6,6,1)'); grd.addColorStop(0.75,'rgba(14,14,14,1)'); grd.addColorStop(1,'rgba(122,122,122,0)');
    rg.fillStyle=grd; rg.beginPath();
    // blobby shape
    for(let a=0;a<Math.PI*2;a+=0.35){ const rr=rad*(0.7+Math.sin(a*3+i)*0.18+Math.random()*0.06); const x=px+Math.cos(a)*rr, y=py+Math.sin(a)*rr*0.65; a===0?rg.moveTo(x,y):rg.lineTo(x,y);}
    rg.closePath(); rg.fill();
  }
  for(let i=0;i<9000;i++){ const v=100+Math.random()*90; rg.fillStyle=`rgba(${v},${v},${v},0.35)`; rg.fillRect(Math.random()*1024,Math.random()*1024,2,2);}
  const roughTex = new THREE.CanvasTexture(r);
  roughTex.wrapS=roughTex.wrapT=THREE.RepeatWrapping; roughTex.repeat.set(10,10);
  return {colorTex, roughTex};
}
const {colorTex:asphaltColor, roughnessMap:asphaltRough} = asphaltTextures();
function asphaltNormal(){
  const c=document.createElement('canvas'); c.width=c.height=512;
  const g=c.getContext('2d');
  g.fillStyle='#8080ff'; g.fillRect(0,0,512,512);
  for(let i=0;i<26000;i++){
    const x=Math.random()*512,y=Math.random()*512,s=1+Math.random()*2;
    const r=128+(Math.random()-0.5)*70, gr=128+(Math.random()-0.5)*70;
    g.fillStyle=`rgb(${r|0},${gr|0},240)`; g.fillRect(x,y,s,s);
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(2,2); return t;
}
const asphaltNormalTex = asphaltNormal();
function puddleMaskStatic(){
  // white base, soft black holes at puddles -> asphalt transparent there
  const c=document.createElement('canvas'); c.width=c.height=1024;
  const g=c.getContext('2d');
  g.fillStyle='#ffffff'; g.fillRect(0,0,1024,1024);
  g.globalCompositeOperation='destination-out';
  const lay=[[280,300,150],[620,380,120],[420,640,170],[760,760,130],[180,800,100],[860,240,90],[500,120,80],[300,520,90],[700,560,80],[140,540,70]];
  for(const [px,py,rad] of lay){
    const grd=g.createRadialGradient(px,py,0,px,py,rad);
    grd.addColorStop(0,'rgba(0,0,0,1)'); grd.addColorStop(0.7,'rgba(0,0,0,0.9)'); grd.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=grd; g.beginPath(); g.ellipse(px,py,rad,rad*0.66,0.3,0,Math.PI*2); g.fill();
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.repeat.set(7,7); return t;
}
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

// oil stains / patch repairs to break asphalt uniformity
function blobTex(dark){
  const c=document.createElement('canvas'); c.width=c.height=256; const g=c.getContext('2d');
  for(let i=0;i<14;i++){
    const x=128+(Math.random()-0.5)*120,y=128+(Math.random()-0.5)*120,r=18+Math.random()*70;
    const grd=g.createRadialGradient(x,y,0,x,y,r);
    grd.addColorStop(0,dark); grd.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=grd; g.beginPath(); g.ellipse(x,y,r,r*0.7,Math.random()*3,0,Math.PI*2); g.fill();
  }
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}
const oilTex=blobTex('rgba(10,9,8,0.55)');
const patchTex=blobTex('rgba(70,66,60,0.5)');
(function(){
  const spots=[[-5.2,2.4,oilTex,1.8],[3.1,3.6,oilTex,1.4],[0.4,0.6,oilTex,1.1],[-1.8,4.4,patchTex,2.2],[6.2,1.2,patchTex,1.6],[-7.4,3.0,patchTex,1.9]];
  for(const [x,z,tex,s] of spots){
    const m=new THREE.Mesh(new THREE.PlaneGeometry(s*1.6,s*1.3), new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:0.9,depthWrite:false}));
    m.rotation.x=-Math.PI/2; m.position.set(x,0.011,z+1.2); m.rotation.z=Math.random()*6; m.renderOrder=2; scene.add(m);
  }
})();

// wet-ground light streaks: additive gradient quads under each light
function streakTexture(color){
  const c=document.createElement('canvas'); c.width=64;c.height=256;
  const g=c.getContext('2d');
  const grd=g.createLinearGradient(0,0,0,256);
  grd.addColorStop(0,'rgba(0,0,0,0)');
  grd.addColorStop(0.15,color.replace('C1','0.75'));
  grd.addColorStop(0.5,color.replace('C1','0.28'));
  grd.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=grd; g.fillRect(0,0,64,256);
  const gx=g.createLinearGradient(0,0,64,0);
  gx.addColorStop(0,'rgba(0,0,0,1)'); gx.addColorStop(0.5,'rgba(0,0,0,0)'); gx.addColorStop(1,'rgba(0,0,0,1)');
  g.globalCompositeOperation='destination-out'; g.fillStyle=gx; g.fillRect(0,0,64,256);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
}
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

// ---------------- canopy with LEDs + solar ----------------
function buildCanopy(){
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({color:0x363a42, metalness:0.9, roughness:0.32, envMapIntensity:2.0});
  const dark  = new THREE.MeshStandardMaterial({color:0x22262e, metalness:0.55, roughness:0.45, envMapIntensity:1.8});
  const solar = new THREE.MeshStandardMaterial({color:0x0a1226, metalness:0.85, roughness:0.15, envMapIntensity:2.2});
  const led = new THREE.MeshStandardMaterial({color:0x14100c, emissive:0xd8a878, emissiveIntensity:0.8});
  const fill = new THREE.PointLight(0xffb888, 24, 30, 1.8); fill.position.set(0,3.6,-1.0); g.add(fill);
  const fill2 = new THREE.PointLight(0xffa068, 14, 24, 1.6); fill2.position.set(0,1.6,3.5); g.add(fill2);
  const ledW = new THREE.MeshStandardMaterial({color:0x140e08, emissive:0xd89050, emissiveIntensity:0.9});
  // roof slab (light-painted ceiling below so it doesn't read as a black void)
  const ceil = new THREE.MeshStandardMaterial({color:0x9a9186, metalness:0.25, roughness:0.7, envMapIntensity:1.2});
  const roof = new THREE.Mesh(new THREE.BoxGeometry(20.4,0.28,9.2), dark);
  roof.position.set(0,4.6,-3.0); roof.castShadow=true; g.add(roof);
  const ceilPanel = new THREE.Mesh(new THREE.PlaneGeometry(20.0,8.8), ceil);
  ceilPanel.rotation.x=Math.PI/2; ceilPanel.position.set(0,4.455,-3.0); g.add(ceilPanel);
  // ceiling cross beams for structure detail
  for(let i=0;i<5;i++){
    const beam = new THREE.Mesh(new THREE.BoxGeometry(20.0,0.16,0.16), steel);
    beam.position.set(0,4.34,-6.9+i*1.95); g.add(beam);
  }
  // fascia LED strips (front + back edges)
  for(const z of [0.62, -6.7]){
    const s = new THREE.Mesh(new THREE.BoxGeometry(20.0,0.06,0.10), led);
    s.position.set(0,4.42,z); g.add(s);
    const w = new THREE.Mesh(new THREE.BoxGeometry(20.0,0.05,0.06), ledW);
    w.position.set(0,4.30,z); g.add(w);
  }
  // pillars
  for(const x of [-9.6, 9.6]) for(const z of [0.4,-6.4]){
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11,0.13,4.45,20), steel);
    p.position.set(x,2.22,z); p.castShadow=true; g.add(p);
    const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.26,0.12,20), steel);
    bp.position.set(x,0.06,z); g.add(bp);
  }
  // solar panels on roof, tilted
  for(let i=0;i<6;i++){
    const sp = new THREE.Mesh(new THREE.BoxGeometry(3.1,0.05,8.2), solar);
    sp.position.set(-8.3+i*3.3, 4.85, -3.0); sp.rotation.x=THREE.MathUtils.degToRad(6);
    sp.castShadow=true; g.add(sp);
    // frame
    const fr = new THREE.Mesh(new THREE.BoxGeometry(3.2,0.07,0.08), steel);
    fr.position.set(-8.3+i*3.3, 4.85, -7.0); fr.rotation.x=THREE.MathUtils.degToRad(6); g.add(fr);
  }
  // downlights under roof lighting each bay
  const lamps=[];
  for(let i=0;i<4;i++){
    const x=-6.6+i*4.4;
    const hous = new THREE.Mesh(new THREE.BoxGeometry(1.6,0.07,0.3), dark); hous.position.set(x,4.44,-3.0); g.add(hous);
    const lens = new THREE.Mesh(new THREE.PlaneGeometry(1.5,0.22), new THREE.MeshStandardMaterial({color:0x101418, emissive:0xffc890, emissiveIntensity:1.5})); lens.rotation.x=Math.PI/2; lens.position.set(x,4.4,-3.0); g.add(lens);
    const emit = new THREE.Mesh(new THREE.PlaneGeometry(1.5,0.22), new THREE.MeshBasicMaterial({color:0xc9b69c}));
    emit.rotation.x=Math.PI/2; emit.position.set(x,4.40,-3.0); g.add(emit);
    const sp = new THREE.SpotLight(0xffe3bd, 30, 12, Math.PI/3.4, 0.75, 1.7);
    sp.position.set(x,4.4,-3.0); sp.target.position.set(x,0,-3.0);
    sp.castShadow=false; g.add(sp); g.add(sp.target); lamps.push(sp);
    const cone=new THREE.Mesh(new THREE.ConeGeometry(1.15,3.9,32,1,true), new THREE.MeshBasicMaterial({color:0xffe0b8,transparent:true,opacity:0.0,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,visible:false}));
    cone.position.set(x,2.2,-3.0); g.add(cone);
  }
  return {g, lamps};
}
const canopy = buildCanopy(); scene.add(canopy.g);

// big glowing price sign
function buildSign(){
  const g=new THREE.Group();
  const steel=new THREE.MeshStandardMaterial({color:0x24272c,metalness:0.9,roughness:0.4});
  const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.11,5.4,16),steel); pole.position.set(0,2.7,0); pole.castShadow=true; g.add(pole);
  // screen canvas texture
  const c=document.createElement('canvas'); c.width=512;c.height=256;
  const g2=c.getContext('2d');
  function drawSign(price){
    g2.fillStyle='#02060c'; g2.fillRect(0,0,512,256);
    g2.strokeStyle='#123a52'; g2.lineWidth=6; g2.strokeRect(3,3,506,250);
    g2.fillStyle='#59e6ff'; g2.font='700 40px Segoe UI, Arial'; g2.fillText('⚡ CHARGE BAY',26,58);
    g2.fillStyle='#ffd166'; g2.font='700 64px Segoe UI, Arial'; g2.fillText(price.toFixed(1)+'¢',26,150);
    g2.fillStyle='#8aa8bd'; g2.font='400 26px Segoe UI, Arial'; g2.fillText('350 kW  SUPERCHARGE',26,196);
    g2.fillStyle='#69f0a0'; g2.fillText('OPEN  24 / 7',26,232);
    tex.needsUpdate=true;
  }
  const tex=new THREE.CanvasTexture(c); tex.colorSpace=THREE.SRGBColorSpace;
  const board=new THREE.Mesh(new THREE.BoxGeometry(3.4,1.8,0.14), steel);
  board.position.set(0,5.4,0); board.castShadow=true; g.add(board);
  const face=new THREE.Mesh(new THREE.PlaneGeometry(3.2,1.64), new THREE.MeshBasicMaterial({map:tex}));
  face.position.set(0,5.4,0.075); g.add(face);
  // rim glow
  const rim=new THREE.Mesh(new THREE.BoxGeometry(3.5,1.9,0.05), new THREE.MeshStandardMaterial({color:0x001122,emissive:0x2288ff,emissiveIntensity:3}));
  rim.position.set(0,5.4,-0.03); g.add(rim);
  drawSign(12.4);
  g.position.set(14.5,0,2.2); g.rotation.y=-0.35;
  return {g, drawSign};
}
const sign = buildSign(); scene.add(sign.g);

// distant scenery: silhouette buildings + trees for depth
function facadeTex(){
  const c=document.createElement('canvas'); c.width=256;c.height=256;
  const g=c.getContext('2d');
  g.fillStyle='#0b0e14'; g.fillRect(0,0,256,256);
  for(let y=8;y<248;y+=16) for(let x=8;x<248;x+=16){
    if(Math.random()<0.5){
      const warm=Math.random();
      g.fillStyle= warm>0.5? 'rgba(255,190,110,'+(0.5+Math.random()*0.5)+')' : 'rgba(160,200,255,'+(0.3+Math.random()*0.4)+')';
    } else g.fillStyle='rgba(30,34,44,0.9)';
    g.fillRect(x,y,10,8);
  }
  const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.colorSpace=THREE.SRGBColorSpace; return t;
}
function backdrop(){
  const g=new THREE.Group();
  const ft = facadeTex();
  for(let i=0;i<26;i++){
    const a=Math.random()*Math.PI*2, r=70+Math.random()*110;
    const h=6+Math.random()*38, w=6+Math.random()*14;
    const tex = ft.clone(); tex.needsUpdate=true; tex.repeat.set(Math.max(1,Math.round(w/4)), Math.max(1,Math.round(h/6)));
    const warm=[0x8a7f70,0x77685c,0x948a7c,0x6b5f54][i%4];
    const bmat=new THREE.MeshStandardMaterial({map:tex, color:warm, roughness:0.85, metalness:0.05, emissiveMap: tex, emissive:0xffb878, emissiveIntensity:0.55});
    const b=new THREE.Mesh(new THREE.BoxGeometry(w,h,8+Math.random()*10), bmat);
    b.position.set(Math.cos(a)*r, h/2, Math.sin(a)*r); b.rotation.y=Math.random()*Math.PI; g.add(b);
  }
  return g;
}
scene.add(backdrop());

// curbs + planters + trees to break the asphalt expanse
function curbsTrees(){
  const g=new THREE.Group();
  const conc=new THREE.MeshStandardMaterial({color:0x4b4e54, roughness:0.92, metalness:0.05});
  const soil=new THREE.MeshStandardMaterial({color:0x241c14, roughness:1.0});
  const foliage=new THREE.MeshStandardMaterial({color:0x1d3a1e, roughness:0.9});
  const trunk=new THREE.MeshStandardMaterial({color:0x2e2118, roughness:0.9});
  // long curb along road edge
  const curb=new THREE.Mesh(new THREE.BoxGeometry(46,0.18,0.5), conc); curb.position.set(0,0.09,8.2); curb.receiveShadow=true; g.add(curb);
  // planter islands between bays — real props placed in loadProps; low soil mound here
  for(const x of [-4.4,0,4.4]){
    const pl=new THREE.Mesh(new THREE.BoxGeometry(1.15,0.24,5.4), conc); pl.position.set(x,0.12,-2.4); pl.receiveShadow=true; g.add(pl);
    const sl=new THREE.Mesh(new THREE.BoxGeometry(0.95,0.05,5.2), soil); sl.position.set(x,0.25,-2.4); g.add(sl);
  }
  // tree line distant
  for(let i=0;i<18;i++){
    const x=-34+i*4+Math.random()*2;
    const tr=new THREE.Mesh(new THREE.CylinderGeometry(0.12,0.18,2.2,8), trunk); tr.position.set(x,1.1,10.5+Math.random()*2); g.add(tr);
    const lv=new THREE.Mesh(new THREE.ConeGeometry(1.1,3.2,8), foliage); lv.position.set(x,3.4,10.5); g.add(lv);
  }
  return g;
}
scene.add(curbsTrees());

// low guard rail along road edge + road
const guard = new THREE.Group();
{
  const steel=new THREE.MeshStandardMaterial({color:0x9aa0a6, metalness:1.0, roughness:0.45});
  // rails with a lot entrance gap (cars reverse out through it)
  for(const [x0,x1] of [[-30,-9],[9,30]]){
    const rail=new THREE.Mesh(new THREE.BoxGeometry(x1-x0,0.14,0.05), steel); rail.position.set((x0+x1)/2,0.72,9.5); rail.castShadow=true; guard.add(rail);
    const n=Math.max(1,Math.floor((x1-x0)/3.2));
    for(let i=0;i<=n;i++){
      const x=x0+i*((x1-x0)/n);
      const post=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.72,0.09), steel); post.position.set(x,0.36,9.5); guard.add(post);
    }
  }
  // bollards flanking the entrance gap
  const boll=new THREE.MeshStandardMaterial({color:0xc8b432, metalness:0.6, roughness:0.5, emissive:0x201800, emissiveIntensity:0.4});
  for(const x of [-9.4,9.4]){ const bo=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,0.8,10), boll); bo.position.set(x,0.4,9.5); guard.add(bo); }
  // road beyond guard
  const road=new THREE.Mesh(new THREE.PlaneGeometry(80,9), new THREE.MeshStandardMaterial({color:0x101216, roughness:0.6, metalness:0.2, envMapIntensity:1.2}));
  road.rotation.x=-Math.PI/2; road.position.set(0,0.008,14.5); road.receiveShadow=true; guard.add(road);
  const dash=new THREE.MeshStandardMaterial({color:0xd8c84a, roughness:0.5, emissive:0x201d08, emissiveIntensity:0.5});
  for(let i=0;i<14;i++){ const d=new THREE.Mesh(new THREE.PlaneGeometry(2.4,0.14), dash); d.rotation.x=-Math.PI/2; d.position.set(-30+i*4.6,0.014,14.5); guard.add(d); }
}
scene.add(guard);

// ---------------- assets: chargers & cars ----------------
const loader = new GLTFLoader();
const draco = new DRACOLoader();
draco.setDecoderPath('vendor/libs/draco/gltf/');
loader.setDRACOLoader(draco);
function loadGLB(path){ return new Promise((res,rej)=>{ const to=setTimeout(()=>rej(new Error('timeout '+path)), 120000); loader.load(path,(g)=>{clearTimeout(to);res(g);},(e)=>{},(e)=>{clearTimeout(to);rej(new Error('loadfail '+path+' '+(e&&(e.message||e.type||''))));}); }); }

let chargerProto=null, carProtos=[], origProtos=[], segProto={};
const bays = BAYS.map(x=>({ x, charger:null, car:null, state:'empty', plug:null, plugHome:null, chargeKwh:0, sessionRev:0, sessionCost:0, price:0.124, tier:0, kw:150, sell:0.25 }));

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
  if(mode==='high'){ Q.glare=1.0; Q.envMax=2.6; renderer.setPixelRatio(Math.min(devicePixelRatio,1.5)); renderer.shadowMap.enabled=true; if(ssao) ssao.enabled=true; rain.count=Math.min(rainCount, 2600); mirror.visible=true; }
  else if(mode==='med'){ Q.glare=0.75; Q.envMax=1.6; renderer.setPixelRatio(Math.min(devicePixelRatio,1)); renderer.shadowMap.enabled=true; if(ssao) ssao.enabled=false; rain.count=Math.min(rainCount, 1400); mirror.visible=true; }
  else if(mode==='low'){ Q.glare=0.6; Q.envMax=1.2; renderer.setPixelRatio(Math.max(0.65, Math.min(devicePixelRatio,0.7))); renderer.shadowMap.enabled=false; if(ssao) ssao.enabled=false; rain.count=Math.min(rainCount, 600); mirror.visible=false; }
  else { // auto: scale by display width; fps governor in animate
    renderer.setPixelRatio(Math.min(devicePixelRatio, Math.max(0.65, 1200/window.innerWidth)));
    if(ssao) ssao.enabled = window.innerWidth<=1600;
    rain.count=Math.min(rainCount, 1400); mirror.visible=true;
  }
  scene.traverse(o=>{ if(o.isMesh&&o.material){ const ms=Array.isArray(o.material)?o.material:[o.material]; for(const m of ms){ if(m.isMeshStandardMaterial){ m.envMapIntensity=Math.min(m.envMapIntensity||1, Q.envMax); m.needsUpdate=true; } } } });
  applyDaylight(gameClock);
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
  bays.forEach((b,i)=>{
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
  if(!loadGame()){ bays[3].locked=true; }
  if(!goals.length) rollGoals(); paintGoals();
  document.getElementById('dcBtn').addEventListener('click',()=>{ hideDayCard(); if(!isTouch&&controls.isLocked===false) controls.lock(); });
  applyLocked();
  if(bufferOwned) addBuffer();
  bays.forEach(b=>{ if(!b.locked){ spawnCar(b, true); b.nextArrT = performance.now()+4000+Math.random()*5000; } });
  ready=true;
  // NOTE: do NOT auto-hide #start — overlay stays until the player actually
  // engages (click-lock on desktop, tap on touch). Capture harness hides it itself.
  if(!window.__GAMESPAWN) window.dispatchEvent(new Event('gamespawn'));
}
function applyLocked(){
  bays.forEach(b=>{
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
  if(cash<nx.cost){ toast('❌ Need $'+nx.cost); return; }
  cash-=nx.cost; b.tier++; b.kw=nx.kw; dayCost+=nx.cost;
  SFX.cash(); toast('🔧 Upgraded to '+nx.kw+' kW');
  if(b.charger) b.charger.traverse(o=>{ if(o.isMesh&&o.material&&o.material.emissive) o.material.emissiveIntensity=2.2; });
}
function buyTech(id){
  const tc=TECH[id]; if(!tc){ toast('Unknown tech'); return false; }
  if(techOwned[id]){ toast(tc.name+' already installed'); return false; }
  if(rep < tc.rep){ toast('🔒 '+tc.name+' needs ★ '+tc.rep+' reputation ('+Math.round(rep)+' so far)'); SFX.chime(220,180); return false; }
  if(cash<tc.cost){ toast('❌ Need $'+tc.cost); return false; }
  cash-=tc.cost; dayCost+=tc.cost; techOwned[id]=true; SFX.cash(); SFX.chime(660,990);
  toast('🎉 <b>'+tc.name+'</b> installed · '+tc.eff+' now active'); flashTech(); saveGame(); return true;
}
function flashTech(){ const f=document.getElementById('techflash'); if(!f) return; f.style.display='block'; f.style.animation='none'; void f.offsetWidth; f.style.animation='tflash 1.6s ease-out forwards'; }
function buyBuffer(){
  if(bufferOwned){ toast('Buffer already installed'); return; }
  if(cash<BUFFER_COST){ toast('❌ Need $'+BUFFER_COST); return; }
  cash-=BUFFER_COST; dayCost+=BUFFER_COST; bufferOwned=true; addBuffer(); SFX.cash(); toast('🔋 Battery buffer installed');
}
function unlockBay(b){
  if(!b.locked){ toast('Bay already unlocked'); return; }
  if(cash<1200){ toast('❌ Need $1200'); return; }
  cash-=1200; dayCost+=1200; b.locked=false; applyLocked(); SFX.cash(); toast('🟺 Bay '+(BAYS.indexOf(b.x)+1)+' unlocked');
  b.nextArrT = performance.now()+2000+Math.random()*4000;
}
let plugsProto=null;
async function loadPlugs(){
  const p = await loadGLB('assets/plug.glb'); plugsProto=p.scene;
  bays.forEach(b=>{
    const pl = plugsProto.clone(true);
    pl.position.set(b.x+0.70, 0.98, -6.0); pl.rotation.set(Math.PI,0,0); pl.scale.setScalar(1.15);
    pl.traverse(o=>{ if(o.isMesh){ o.castShadow=true; if(o.material && o.material.name==='CableJacket') o.visible=false; } });
    scene.add(pl); b.plug=pl; b.plugHome={pos:pl.position.clone(), rot:pl.rotation.clone()};
    b.glandPos=new THREE.Vector3(b.x+0.36, 0.55, -6.0);
    // port target ring: appears at the car port when this bay's connector is in hand
    const ring=new THREE.Mesh(new THREE.RingGeometry(0.14,0.24,28), new THREE.MeshBasicMaterial({color:0x39e6a8,transparent:true,opacity:0,depthWrite:false,depthTest:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}));
    ring.renderOrder=9; scene.add(ring); b.portRing=ring;
    b.cable=makeCable();
  });
}
function bayPort(b){
  const pl = (b.car.userData && b.car.userData.portLocal) || new THREE.Vector3(-1.5,0.62,-0.95);
  const port=new THREE.Vector3(pl.x*b.car.scale.x, pl.y*b.car.scale.y, pl.z*b.car.scale.z);
  port.applyQuaternion(b.car.quaternion); port.add(b.car.position);
  return port;
}

// spawn a car at a bay with random paint & battery
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
function wetUpdate(car, dt, raining, tNow){
  const ud=car.userData; if(!ud.wetRig) buildWetRig(car);
  const wr=ud.wetRig;
  // beading: oscillate clearcoat roughness so water sheets glint at dusk
  for(const pm of wr.paints){
    const m=pm.o.material;
    if(raining){ m.clearcoat=1.0; m.clearcoatRoughness=0.06+0.05*Math.sin(tNow*0.0016+wr.paints.indexOf(pm)); }
    else { m.clearcoat=pm.base.cc; m.clearcoatRoughness=pm.base.ccr; }
    m.needsUpdate=false;
  }
  // wipers sweep only when raining
  for(const w of wr.pivots){
    if(raining){
      const prev=w.t; w.t+=dt*2.4;
      w.p.quaternion.setFromAxisAngle(w.axis, Math.sin(w.t)*0.55);  // fan sweep around glass normal
      w.p.visible = true;
      // squeak at sweep reversals (sin crosses extremum)
      if(Math.sin(prev)>0.995 || Math.sin(prev)<-0.995) wr.squeakT=(wr.squeakT||0)+1;
    } else {
      w.p.visible=true; w.p.rotation.y=0;
    }
  }
  if(raining && wr.squeakT && performance.now()-(wr.lastSqueak||0)>1400){ wr.lastSqueak=performance.now(); SFX.wiperSqueak(); }
  wr.lastState=raining;
}
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
  car.userData = { battery: roll, need: vip? 0.95 : 0.72+Math.random()*0.25, patience: vip? 75 : seg.patience[0]+Math.random()*(seg.patience[1]-seg.patience[0]), arrived: performance.now(), vip, seg, packKwh: seg.pack };
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

let ready=false;
let grabbedBay=null, docked=false;
function lerpAng(a,b,k){ let d=(b-a)%(Math.PI*2); if(d>Math.PI)d-=Math.PI*2; if(d<-Math.PI)d+=Math.PI*2; return a+d*k; }
function lerpDelta(a,b){ let d=(b-a)%(Math.PI*2); if(d>Math.PI)d-=Math.PI*2; if(d<-Math.PI)d+=Math.PI*2; return d; }
// ---- cable physics (Verlet chain per bay, connector -> port/hand) ----
const CABLE_SEGS=26, CABLE_LEN=4.2, CABLE_RANGE=4.0;
function makeCable(){
  const pts=[], old=[];
  for(let i=0;i<=CABLE_SEGS;i++){ pts.push(new THREE.Vector3(0,1,-6)); old.push(new THREE.Vector3(0,1,-6)); }
  const geo=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p=>p.clone())), CABLE_SEGS*2, 0.055, 8, false);
  const mat=new THREE.MeshStandardMaterial({color:0x191e26, roughness:0.55, metalness:0.15});
  const mesh=new THREE.Mesh(geo,mat); mesh.castShadow=true; mesh.frustumCulled=false; scene.add(mesh);
  return {pts, old, mesh, geo};
}
function cableStep(cab, a, b, dt){
  // verlet: gravity + constraint solve, endpoints pinned to a(bay end) and b(plug end)
  const g=-9.8*dt*dt;
  for(let i=1;i<CABLE_SEGS;i++){
    const p=cab.pts[i], o=cab.old[i];
    const vx=(p.x-o.x)*0.985, vy=(p.y-o.y)*0.985, vz=(p.z-o.z)*0.985;
    o.copy(p); p.x+=vx; p.y+=vy+g; p.z+=vz;
    // collide with car body as rough box while docked
    if(p.y<0.06) p.y=0.06;
  }
  const rest=CABLE_LEN/CABLE_SEGS;
  for(let k=0;k<8;k++){
    cab.pts[0].copy(a); cab.pts[CABLE_SEGS].copy(b);
    for(let i=0;i<CABLE_SEGS;i++){
      const p0=cab.pts[i], p1=cab.pts[i+1];
      let dx=p1.x-p0.x, dy=p1.y-p0.y, dz=p1.z-p0.z;
      const d=Math.sqrt(dx*dx+dy*dy+dz*dz)||1e-6;
      const diff=(d-rest)/d*0.5;
      if(i!==0){ p0.x+=dx*diff; p0.y+=dy*diff; p0.z+=dz*diff; }
      if(i+1!==CABLE_SEGS){ p1.x-=dx*diff; p1.y-=dy*diff; p1.z-=dz*diff; }
    }
  }
  cab.pts[0].copy(a); cab.pts[CABLE_SEGS].copy(b);
  // rebuild tube geometry
  const curve=new THREE.CatmullRomCurve3(cab.pts);
  const ng=new THREE.TubeGeometry(curve, CABLE_SEGS*2, 0.055, 8, false);
  cab.mesh.geometry.dispose(); cab.mesh.geometry=ng;
}
const PACK_KWH = 75; // kWh per full charge
const TIERS = [ {kw:150,cost:0}, {kw:350,cost:800}, {kw:600,cost:2000} ];
// ---- car segments: different packs, patience, fees ----
const SEGMENTS = [
  { id:'sedan', name:'Sedan',      pack:75,  patience:[150,240], fee:1.00, w:5, paint:null },
  { id:'taxi',  name:'Taxi',       pack:60,  patience:[55,90],   fee:1.12, w:4, paint:0xf2b705 },
  { id:'suv',   name:'SUV',        pack:95,  patience:[180,260], fee:0.95, w:3, paint:null },
  { id:'van',   name:'Delivery van',pack:110,patience:[240,320], fee:0.88, w:2, paint:0xdfe4ea },
  { id:'retro', name:'Retro classic',pack:40,patience:[120,180], fee:1.35, w:1, paint:0x8a2be2 },
  { id:'super', name:'Supercar',     pack:105,patience:[80,120],  fee:1.60, w:1, paint:null },
];
function pickSegment(){
  const h=Math.floor(gameClock/60);
  let ws = SEGMENTS.map(s=> s.w * (s.id==='taxi' ? ((h>=6&&h<=9)||(h>=16&&h<=20)?2.2:0.7) : (s.id==='van' ? (h>=9&&h<=16?1.8:0.8) : 1)));
  const tot=ws.reduce((a,b)=>a+b,0); let r=Math.random()*tot;
  for(let i=0;i<SEGMENTS.length;i++){ r-=ws[i]; if(r<=0) return SEGMENTS[i]; }
  return SEGMENTS[0];
}
// ---- reputation ----
let rep = 60;                       // 0..100, arrival traffic scales with it
const repMult = ()=> 0.45 + (rep/100)*1.15;   // 0.45x..1.6x arrival rate
function repAdd(v){ rep=THREE.MathUtils.clamp(rep+v,0,100); paintRep(v); }
let repFlashT=0;
function paintRep(delta){
  const el=document.getElementById('rep'); if(!el) return;
  el.innerHTML = '★ '+Math.round(rep) + (delta? ' <span class="'+(delta>0?'good':'bad')+'">'+(delta>0?'▲+'+delta.toFixed(1):'▼'+delta.toFixed(1))+'</span>' : '');
  if(delta) repFlashT=performance.now();
}
// ---- tech tree ----
const TECH = {
  heater:  { name:'Battery heater pads', cost:500,  rep:50,  desc:'Cold snaps no longer slow charging chemistry.', eff:'−65% cold penalty' },
  inverter:{ name:'Smart inverters',     cost:900,  rep:60,  desc:'+12% charge efficiency — cheaper sessions, more profit.', eff:'+12% efficiency' },
  ads:     { name:'Advertising network', cost:700,  rep:70,  desc:'+25% arrivals from billboards & maps apps.', eff:'+25% traffic' },
  priority:{ name:'VIP priority lane',   cost:1100, rep:80,  desc:'VIP cars always get the next free bay instantly.', eff:'VIP instant bay' },
};
let techOwned = {};
const BUFFER_COST=600, BUFFER_CAP=200, BUFFER_RATE_KWH_MIN=0.5; // buffer charge rate at cheap prices
const SAVE_KEY='chargebay_save_v1';
// ---- weather/events ----
let wxTimer=0, coldUntil=0, brownUntil=0, brownCap=500, vipPending=false, vipSpawned=false, nextWx=0;
let solarKwh=0; const SOLAR_CAP_KW=24; // rooftop array
let solarLast=0;
let revenue=0, served=0;            // session
let cash=500, day=1, dayRev=0, dayCost=0, servedTotal=0;   // meta
let hourStats={}; let hourArr={}; let arrivedTotal=0;
let kickedHourly={};
let bufferOwned=false, bufferKwh=0, bufferDraining=0;
let sellMarkup=1.9;                     // player-controlled margin: [ ] keys adjust
const MARKUP_MIN=1.15, MARKUP_MAX=3.4;
const sellPrice=()=> spotPrice*sellMarkup+0.02;
// demand elasticity: fair price (<=1.5x spot) full demand, gouging dries it up, discounts boost it
const demandFactor=()=> THREE.MathUtils.clamp(1.75 - 0.55*sellMarkup, 0.25, 1.35);
const clockEl=document.getElementById('clock'), priceEl=document.getElementById('price'),
      revEl=document.getElementById('rev'), servedEl=document.getElementById('served'),
      loadEl=document.getElementById('load'), wxEl=document.getElementById('wx'),
      promptEl=document.getElementById('prompt'), toastEl=document.getElementById('toast'),
      cashEl=document.getElementById('cash'), dayEl=document.getElementById('day'), bufEl=document.getElementById('buf');
let tEEl=null, tREl=null;

function toast(msg){ toastEl.innerHTML=msg; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>toastEl.classList.remove('show'),2200); }

// ---------------- camera lens rain FX (DOM) ----------------
let lensFx=null, lensCv=null, lensG=null, drops=[];
function initLensFx(){
  lensCv=document.createElement('canvas'); lensCv.width=640; lensCv.height=360;
  lensCv.id='lensfx'; document.getElementById('app').appendChild(lensCv);
  lensG=lensCv.getContext('2d'); lensFx=lensCv;
  for(let i=0;i<40;i++) drops.push({x:Math.random()*640, y:Math.random()*360, r:1.5+Math.random()*3.5, v:0.2+Math.random()*0.6, trail:0});
}
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
// ---------------- AUDIO: procedural Web Audio (no assets) ----------------
const SFX = (function(){
  let ctx=null, master=null, rainGain=null, rainSrc=null, humGain=null, humOsc=[], humFilter=null, muted=false, rainFilter=null;
  function ensure(){
    if(ctx) return ctx;
    ctx = new (window.AudioContext||window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = muted?0:0.9; master.connect(ctx.destination);
    // ---- rain bed: looping filtered white noise ----
    const len = ctx.sampleRate*2, buf = ctx.createBuffer(1,len,ctx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=Math.random()*2-1;
    rainSrc = ctx.createBufferSource(); rainSrc.buffer=buf; rainSrc.loop=true;
    const hp=ctx.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=900;
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=6500; rainFilter=lp;
    rainGain = ctx.createGain(); rainGain.gain.value=0;
    rainSrc.connect(hp); hp.connect(lp); lp.connect(rainGain); rainGain.connect(master);
    rainSrc.start(); city(); rainLFO();
    // ---- charge hum: two detuned low oscillators through lowpass ----
    humFilter = ctx.createBiquadFilter(); humFilter.type='lowpass'; humFilter.frequency.value=160;
    humGain = ctx.createGain(); humGain.gain.value=0;
    humFilter.connect(humGain); humGain.connect(master);
    [56,70].forEach(f=>{ const o=ctx.createOscillator(); o.type='sawtooth'; o.frequency.value=f; o.connect(humFilter); o.start(); humOsc.push(o); });
    return ctx;
  }
  function resume(){ const c=ensure(); if(c.state==='suspended') c.resume(); api.ctx=c; }
  function setRain(v){ if(!ctx) return; rainGain.gain.setTargetAtTime(v*0.16, ctx.currentTime, 0.6); }
  function setCharge(active, n){ if(!ctx) return; const g=active? Math.min(0.10, 0.04*n):0; humGain.gain.setTargetAtTime(g, ctx.currentTime, 0.4); humFilter.frequency.setTargetAtTime(active?220:120, ctx.currentTime, 0.5); }
  function click(freq){ if(!ctx||muted) return; const t=ctx.currentTime;
    const o=ctx.createOscillator(); o.type='square'; o.frequency.setValueAtTime(freq||240,t); o.frequency.exponentialRampToValueAtTime((freq||240)*0.4, t+0.05);
    const g=ctx.createGain(); g.gain.setValueAtTime(0.22,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.07);
    o.connect(g); g.connect(master); o.start(t); o.stop(t+0.08); }
  function latch(){ if(!ctx||muted) return; click(320); setTimeout(()=>click(520),45); }
  function chime(a,b){ if(!ctx||muted) return; const t=ctx.currentTime;
    [a,b].forEach((f,i)=>{ const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
      const g=ctx.createGain(); g.gain.setValueAtTime(0,t+i*0.09); g.gain.linearRampToValueAtTime(0.18,t+i*0.09+0.02); g.gain.exponentialRampToValueAtTime(0.001,t+i*0.09+0.5);
      o.connect(g); g.connect(master); o.start(t+i*0.09); o.stop(t+i*0.09+0.55); }); }
  function cash(){ if(!ctx||muted) return; const t=ctx.currentTime;
    [1046,1318,1568].forEach((f,i)=>{ const o=ctx.createOscillator(); o.type='triangle'; o.frequency.value=f;
      const g=ctx.createGain(); g.gain.setValueAtTime(0,t+i*0.07); g.gain.linearRampToValueAtTime(0.16,t+i*0.07+0.015); g.gain.exponentialRampToValueAtTime(0.001,t+i*0.07+0.42);
      o.connect(g); g.connect(master); o.start(t+i*0.07); o.stop(t+i*0.07+0.5); }); }
  function toggleMute(){ muted=!muted; if(master) master.gain.setTargetAtTime(muted?0:0.9, ctx.currentTime, 0.05); return muted; }
  // ---- engine growl: short low sweep as a car settles into a bay ----
  function engine(){ if(!ctx||muted) return; const t=ctx.currentTime;
    const o=ctx.createOscillator(); o.type='sawtooth'; o.frequency.setValueAtTime(48,t); o.frequency.exponentialRampToValueAtTime(30,t+1.4);
    const f=ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=190;
    const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.12,t+0.25); g.gain.exponentialRampToValueAtTime(0.001,t+1.6);
    o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t+1.7); }
  // ---- distant city hum + wind bed: very low filtered noise, always on ----
  let cityGain=null;
  function city(){ if(!ctx||muted) return; if(cityGain) return;
    const len=ctx.sampleRate*4, buf=ctx.createBuffer(1,len,ctx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=(Math.random()*2-1)*0.5;
    const s=ctx.createBufferSource(); s.buffer=buf; s.loop=true;
    const lp=ctx.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=210;
    cityGain=ctx.createGain(); cityGain.gain.value=0.035;
    s.connect(lp); lp.connect(cityGain); cityGain.connect(master); s.start(); }
  // ---- rain variance: slow LFO on rain lowpass so it swells/dies ----
  function rainLFO(){ if(!ctx) return;
    const o=ctx.createOscillator(); o.type='sine'; o.frequency.value=0.06;
    const g=ctx.createGain(); g.gain.value=1400;
    o.connect(g); g.connect(rainFilter.frequency); o.start(); }
  function setRain2(v){ if(!ctx) return; rainGain.gain.setTargetAtTime(v*0.16, ctx.currentTime, 0.6); if(rainFilter) rainFilter.frequency.setTargetAtTime(2600+v*3800, ctx.currentTime, 1.8); }
  function departHorn(){ if(!ctx||muted) return; const t=ctx.currentTime;
    const o=ctx.createOscillator(); o.type='triangle'; o.frequency.setValueAtTime(392,t); o.frequency.setValueAtTime(330,t+0.16);
    const g=ctx.createGain(); g.gain.setValueAtTime(0.12,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.5);
    o.connect(g); g.connect(master); o.start(t); o.stop(t+0.55); }
  // ---- tire hum: filtered noise that swells with car speed ----
  let tireGain=null, tireSrc=null;
  function tire(){ if(!ctx||muted) return; if(tireGain) return;
    const len=ctx.sampleRate*2, buf=ctx.createBuffer(1,len,ctx.sampleRate), d=buf.getChannelData(0);
    for(let i=0;i<len;i++) d[i]=(Math.random()*2-1);
    tireSrc=ctx.createBufferSource(); tireSrc.buffer=buf; tireSrc.loop=true;
    const bp=ctx.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=420; bp.Q.value=1.4;
    tireGain=ctx.createGain(); tireGain.gain.value=0.0001;
    tireSrc.connect(bp); bp.connect(tireGain); tireGain.connect(master); tireSrc.start(); }
  function setTire(v){ if(!ctx||!tireGain) return; tireGain.gain.setTargetAtTime(Math.min(0.09,v*0.09), ctx.currentTime, 0.25); }
  // ---- wiper squeak: short high-band pass chirp ----
  function wiperSqueak(){ if(!ctx||muted) return; const t=ctx.currentTime;
    const o=ctx.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(1150,t); o.frequency.exponentialRampToValueAtTime(700,t+0.22);
    const f=ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=1100; f.Q.value=6;
    const g=ctx.createGain(); g.gain.setValueAtTime(0.0001,t); g.gain.linearRampToValueAtTime(0.018,t+0.05); g.gain.exponentialRampToValueAtTime(0.0005,t+0.25);
    o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t+0.3); }
  const api={ resume, setRain:setRain2, setCharge, click, latch, chime, cash, engine, city, rainLFO, departHorn, tire, setTire, wiperSqueak, toggleMute, get muted(){return muted;} };
  window.__SFXREF = api;
  return api;
})();

let gameClock = 18*60+42; // minutes, dusk
let spotPrice = 0.124;

function onKey(e){
  if(!ready) return;
  if(e.code==='KeyE') tryInteract();
  if(e.code==='KeyR') toggleCharge();
  if(e.code==='BracketLeft'||e.code==='BracketRight'){
    const d=e.code==='BracketRight'? 0.05 : -0.05;
    const nv=THREE.MathUtils.clamp(sellMarkup+d, MARKUP_MIN, MARKUP_MAX);
    if(nv!==sellMarkup){ sellMarkup=nv; SFX.click(nv>1.9?520:380);
      toast('💲 Price set <b>'+Math.round(sellPrice()*100)+'¢/kWh</b> · margin '+Math.round((sellMarkup-1)*100)+'% · demand '+Math.round(demandFactor()*100)+'%'); }
  }
  if(e.code==='KeyM'){ const m=SFX.toggleMute(); toast(m?'🔇 Muted':'🔊 Sound on'); }
  if(e.code==='KeyU'){ const t=currentTarget(); if(t) upgradeBay(t.bay); }
  if(e.code==='KeyB'){ buyBuffer(); }
  if(e.code==='KeyN'){ const t=currentTarget(); if(t&&t.bay.locked) unlockBay(t.bay); }
  if(e.code==='KeyP'){ saveGame(); toast('💾 Saved'); }
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
controls.addEventListener('unlock', ()=>{ if(ready && !isTouch && !touchMode && !techOpen) startEl.style.display='flex'; });
// desktop: clicking the game view re-locks the mouse (fixes "mouse never locked")
renderer.domElement.addEventListener('click',()=>{ SFX.resume(); if(ready && !isTouch && controls.isLocked===false) controls.lock(); });

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
  document.getElementById('tE').addEventListener(startEvt==='pointerdown'?'pointerdown':'touchstart',(ev)=>{ ev.preventDefault(); SFX.resume(); if(ready) tryInteract(); });
  document.getElementById('tR').addEventListener(startEvt==='pointerdown'?'pointerdown':'touchstart',(ev)=>{ ev.preventDefault(); SFX.resume(); if(ready) toggleCharge(); });
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
  if(!ready) return null;
  ray.setFromCamera(new THREE.Vector2(0,0), camera);
  ray.far = 3.2;
  for(const b of bays){
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

// ---- daily goals + streak retention ----
const GOAL_POOL=[
  { id:'serve', make:d=>({label:'Serve '+(6+d*2)+' customers', target:6+d*2, key:'served', reward:40+d*10}), },
  { id:'profit', make:d=>({label:'Earn $'+(50+d*20)+' profit', target:50+d*20, key:'profit', reward:50+d*12}), },
  { id:'nokick', make:d=>({label:'Zero angry customers', target:1, key:'noKick', reward:60}), },
  { id:'vip', make:d=>({label:'Handle a VIP', target:1, key:'vipDone', reward:45}), },
  { id:'fast', make:d=>({label:'3 fast charges (<90s)', target:3, key:'fast', reward:55}), },
  { id:'kwh', make:d=>({label:'Deliver '+(150+d*40)+' kWh', target:150+d*40, key:'kwh', reward:45+d*8}), },
];
let goals=[], dayStats={served:0, profit:0, kicks:0, vipDone:0, fast:0, kwh:0}, streak=0;
function rollGoals(){
  goals = GOAL_POOL.map((g,i)=>({ ...g.make(day), done:false, claimed:false, id:g.id }));
  // deterministic pick of 3 by day
  const picks=[]; let h=day*2654435761>>>0;
  while(picks.length<3){ h=(h*1103515245+12345)>>>0; const idx=h%GOAL_POOL.length; if(!picks.includes(idx)) picks.push(idx); }
  goals = picks.map(i=>({ ...GOAL_POOL[i].make(day), done:false, claimed:false, id:GOAL_POOL[i].id }));
  dayStats={served:0, profit:0, kicks:0, vipDone:0, fast:0, kwh:0};
}
function bumpGoal(key, amt){
  dayStats[key]=(dayStats[key]||0)+(amt||1);
  for(const g of goals){ if(!g.done && g.key===key && dayStats[g.key]>=g.target){ g.done=true; SFX.chime(880,1320); toast('📋 Goal complete: '+g.label+' · <b>+$'+g.reward+'</b> rep +2'); cash+=g.reward; repAdd(2); } }
  paintGoals();
}
function paintGoals(){
  const el=document.getElementById('goallist'); if(!el) return;
  el.innerHTML = goals.map(g=>{
    let cur=g.key==='noKick' ? (dayStats.kicks===0?1:0) : Math.min(dayStats[g.key]||0, g.target);
    return '<div class="g'+(g.done?' done':'')+'"><span>'+g.label+'</span><b>'+cur+'/'+g.target+'</b></div>';
  }).join('');
  const st=document.getElementById('streak');
  if(st) st.textContent = streak>0 ? '🔥 '+streak+'-day profit streak' : '🔥 Keep a profit streak going';
}
function paySession(b){
  if((b.chargeKwh||0)>0.05){
    served++; servedTotal++;
  hourStats[(Math.floor(gameClock/60))%24] = (hourStats[(Math.floor(gameClock/60))%24]||0)+1;
    let fee=0; if(b.car && b.car.userData.vip){ fee=b.sessionRev*0.5; b.sessionRev+=fee; }
    const segF=((b.car&&b.car.userData.seg&&b.car.userData.seg.fee)|| (b.segFee||1));
    if(segF!==1 && !b.car?.userData?.vip){ b.sessionRev*=segF; }
    const prof=b.sessionRev-b.sessionCost; cash+=prof; dayRev+=b.sessionRev; dayCost+=b.sessionCost;
    const segN=(b.car&&b.car.userData.seg&&b.car.userData.seg.name)||'Car';
    repAdd( (b.car&&b.car.userData.vip)?2.5:1 );
    toast((b.car&&b.car.userData.vip?'👑 VIP tip +$'+fee.toFixed(2)+' · ':'')+'🎉 '+segN+' complete +$'+b.sessionRev.toFixed(2)+' · profit <b>$'+prof.toFixed(2)+'</b>');
    bumpGoal('served',1); bumpGoal('profit',prof); bumpGoal('kwh',(b.chargeKwh||0));
    if(b.car&&b.car.userData.vip) bumpGoal('vipDone',1);
    if((performance.now()-(b.chargeStartT||performance.now()))<90000 && (b.chargeKwh||0)>25) bumpGoal('fast',1);
  }
  b.sessionRev=0; b.sessionCost=0;
}
function saveGame(){
  try{
    const d={ v:1, cash, day, dayRev, dayCost, servedTotal, bufferOwned, bufferKwh, rep, techOwned, goals, dayStats, streak,
      bays: bays.map(b=>({ tier:b.tier, locked:!!b.locked, sell:b.sell })), raining, gameClock, spotPrice, ts:Date.now(),
      vipPending, coldLeft: Math.max(0,coldUntil-performance.now()), brownLeft: Math.max(0,brownUntil-performance.now()), brownCap, solarKwh };
    localStorage.setItem(SAVE_KEY, JSON.stringify(d));
  }catch(e){}
}
function loadGame(){
  try{
    const raw=localStorage.getItem(SAVE_KEY); if(!raw) return false;
    const d=JSON.parse(raw); if(!d||d.v!==1) return false;
    cash=d.cash??cash; day=d.day??day; dayRev=d.dayRev||0; dayCost=d.dayCost||0; servedTotal=d.servedTotal||0;
    bufferOwned=!!d.bufferOwned; bufferKwh=d.bufferKwh||0; raining=d.raining??raining; gameClock=d.gameClock??gameClock; spotPrice=d.spotPrice??spotPrice; rep=d.rep??rep; techOwned=d.techOwned||{};
    if(Array.isArray(d.bays)) d.bays.forEach((sb,i)=>{ if(bays[i]){ bays[i].tier=sb.tier||0; bays[i].locked=!!sb.locked; bays[i].sell=sb.sell||0.25; bays[i].kw=TIERS[bays[i].tier].kw; } });
    vipPending=!!d.vipPending; brownCap=d.brownCap||500; solarKwh=d.solarKwh||0; streak=d.streak||0; if(Array.isArray(d.goals)&&d.goals.length) goals=d.goals; if(d.dayStats) dayStats=d.dayStats;
    coldUntil=performance.now()+(d.coldLeft||0); brownUntil=performance.now()+(d.brownLeft||0);
    if(bufferOwned) addBuffer();
    return true;
  }catch(e){ return false; }
}
function endDay(){
  const profit=dayRev-dayCost;
  const made=goals.filter(g=>g.done).length;
  const allDone = goals.length && made===goals.length;
  if(profit>0 && dayStats.served>0){ streak++; } else { streak=0; }
  let bonus=0; if(allDone){ bonus=100; cash+=bonus; repAdd(4); }
  showDayCard(day, dayRev, dayCost, profit, made, bonus);
  day++;
  repAdd(3); // overnight goodwill recovery
  dayRev=0; dayCost=0; hourStats={}; hourArr={}; kickedHourly={};
  rollGoals(); paintGoals();
  saveGame();
}
function showDayCard(d,rev,cost,profit,made,bonus){
  daySummaryT=performance.now();
  const card=document.getElementById('daycard'); if(!card){ showDaySummary(d,rev,cost,profit); return; }
  document.getElementById('dcTitle').textContent='🌙 DAY '+d+' COMPLETE';
  const ok=profit>=0;
  document.getElementById('dcStats').innerHTML=
    '<div class="row"><span>Revenue</span><b class="good">$'+rev.toFixed(2)+'</b></div>'+
    '<div class="row"><span>Energy cost</span><b class="bad">−$'+cost.toFixed(2)+'</b></div>'+
    '<div class="row"><span>Profit</span><b class="'+(ok?'good':'bad')+'">'+(ok?'$':'−$')+Math.abs(profit).toFixed(2)+'</b></div>'+
    '<div class="row"><span>Customers served</span><b>'+dayStats.served+'</b></div>'+
    '<div class="row"><span>kWh delivered</span><b>'+Math.round(dayStats.kwh)+'</b></div>'+
    (dayStats.kicks?'<div class="row"><span>Angry walkouts</span><b class="bad">'+dayStats.kicks+'</b></div>':'')+
    (bonus?'<div class="row"><span>All-goals bonus</span><b class="good">+$'+bonus+'</b></div>':'');
  document.getElementById('dcGoals').innerHTML='<h3 style="margin:8px 0 4px;font-size:12px;letter-spacing:.12em;color:#7fd4ff">GOALS '+made+'/'+goals.length+'</h3>'+
    goals.map(g=>'<div class="g '+(g.done?'done':'fail')+'">'+g.label+'</div>').join('');
  document.getElementById('dcStreak').textContent = streak>0 ? '🔥 '+streak+'-day profit streak · next bonus at '+(streak+1)+'d' : '😬 Streak reset — stay profitable tomorrow';
  card.style.display='flex';
  if(window.__GAME) window.__GAME._cardOpen=true;
  try{ if(document.pointerLockElement) document.exitPointerLock(); }catch(e){}
  SFX.chime(660,990);
}
function hideDayCard(){ const c=document.getElementById('daycard'); if(c) c.style.display='none'; if(window.__GAME) window.__GAME._cardOpen=false; }
let daySummaryT=0;
function showDaySummary(d,rev,cost,profit){ daySummaryT=performance.now(); toast('🌙 Day '+d+' done · rev $'+rev.toFixed(2)+' · cost $'+cost.toFixed(2)+' · profit <b>$'+profit.toFixed(2)+'</b>'); }

function tryInteract(){
  const t = currentTarget();
  if(!t) return;
  const b=t.bay;
  // holding THIS bay's connector, docked in hand -> unplug
  if(grabbedBay===b && docked){
    docked=false; b.plugged=false; b.state='parked';
    b.car.userData.arrived=performance.now();
    b.car.userData.docked=false; SFX.click(200);
    if((b.chargeKwh||0)>0.05){ paySession(b); toast('🔌 Unplugged — paid'); }
    else toast('🔌 Connector unplugged');
    b.plug.position.copy(b.plugHome.pos); b.plug.rotation.copy(b.plugHome.rot); setJacket(b, false);
    grabbedBay=null; return;
  }
  // holding this bay's connector in hand -> try to dock
  if(grabbedBay===b && !docked){
    if(b.car){
      const port=bayPort(b);
      if(port.distanceTo(camera.position)<2.2){
        docked=true; b.plugged=true; b.car.userData.docked=true; b.state='ready'; b.chargeStartT=performance.now(); b.chargeKwh=0;
        // GLB ground truth: nozzle tip = local +Y (tip at y .17..21), face-up = local +Z.
        // insert along the car's lateral body normal (through the side port), not toward car center
        const inward=new THREE.Vector3(1,0,0).applyQuaternion(b.car.quaternion); // port is local -X side => into body = car local +X
        const up=new THREE.Vector3(0,1,0);
        const xA=new THREE.Vector3().crossVectors(up,inward); if(xA.lengthSq()<1e-6) xA.set(1,0,0); xA.normalize();
        const zA=new THREE.Vector3().crossVectors(inward,xA).normalize();
        b.plug.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA,inward,zA));
        b.plug.position.copy(port).addScaledVector(inward,0.06);
        autoEnergize(b);
        grabbedBay=null; docked=false;
        SFX.latch(); toast('✅ Locked — charging'); return;
      } else { toast('❌ Move closer to the port'); return; }
    }
  }
  // hands free, looking at a plugged car -> unplug it (finishes session)
  if(!grabbedBay && t.type==='car' && b.plugged){
    if(b.state==='charging'){ b.state='parked'; }
    b.plugged=false; b.car.userData.docked=false;
    b.car.userData.arrived=performance.now(); SFX.click(200);
    if((b.chargeKwh||0)>0.05){ paySession(b); toast('🔌 Unplugged — paid'); }
    else toast('🔌 Connector unplugged');
    b.plug.position.copy(b.plugHome.pos); b.plug.rotation.copy(b.plugHome.rot);
    return;
  }
  // grab a connector (bay must have a car and not be plugged already)
  if(t.type==='charger' && !grabbedBay && !b.plugged && b.car){
    grabbedBay=b; docked=false; SFX.click(260); toast('🔌 Grabbed connector — aim at car port, press E');
    return;
  }
  if(t.type==='charger' && b.plugged && !grabbedBay){ toast('⚡ Bay already charging'); }
}

function setJacket(b, on){ if(!b.plug) return; b.plug.traverse(o=>{ if(o.isMesh&&o.material&&o.material.name==='CableJacket') o.visible=on; }); }
function autoEnergize(b){
  // plug-and-pay: docking the connector starts the session immediately
  if(b.plugged && b.state==='ready'){ b.state='charging'; b.price=spotPrice; b.sell=sellPrice(); b.kwhStart=0; b.chargeKwh=0; b.sessionCost=0; SFX.click(420); toast('⚡ Charging at '+b.kw+' kW'); }
}
function toggleCharge(forceBay){
  // R is now just pause/resume — plugging in already starts charging.
  let b= forceBay!=null ? bays[forceBay] : (grabbedBay && docked ? grabbedBay : (currentTarget()? currentTarget().bay : null));
  if(!b){ toast('Aim at a charger'); return; }
  if(!b.plugged){ toast('Dock the connector first (E)'); return; }
  if(b.state==='charging'){ b.state='ready'; SFX.click(180); toast('⏸ Charging paused'); return; }
  autoEnergize(b);
}

// ---------------- contact shadows ----------------
function shadowTex(){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');
  const grd=g.createRadialGradient(128,128,10,128,128,120);
  grd.addColorStop(0,'rgba(0,0,0,0.55)'); grd.addColorStop(0.55,'rgba(0,0,0,0.30)'); grd.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=grd; g.fillRect(0,0,256,256);
  const t=new THREE.CanvasTexture(c); return t;
}
const SHADOW_TEX = shadowTex();
function contactShadow(w,d,x,z,op){
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d), new THREE.MeshBasicMaterial({map:SHADOW_TEX,transparent:true,opacity:(op??0.85)*0.26,depthWrite:false,blending:THREE.MultiplyBlending}));
  m.rotation.order='YXZ'; m.rotation.x=-Math.PI/2; m.position.set(x,0.018,z); m.renderOrder=6; return m;
}

// ---------------- rain: instanced streaks ----------------
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
let raining=0.7;
// per-car ground light reflection quads (tail + head)
function barPctTex(t){ const c=document.createElement('canvas'); c.width=256;c.height=128; const g=c.getContext('2d'); g.clearRect(0,0,256,128); g.font='bold 88px Segoe UI, sans-serif'; g.textAlign='center'; g.textBaseline='middle'; g.fillStyle='rgba(225,245,255,0.98)'; g.strokeStyle='rgba(0,0,0,0.75)'; g.lineWidth=7; g.strokeText(t,128,66); g.fillText(t,128,66); const tx=new THREE.CanvasTexture(c); tx.colorSpace=THREE.SRGBColorSpace; return tx; }
const carReflTexRed = (function(){
  const c=document.createElement('canvas'); c.width=128;c.height=256; const g=c.getContext('2d');
  const grd=g.createLinearGradient(0,0,0,256);
  grd.addColorStop(0,'rgba(255,50,40,0.85)'); grd.addColorStop(0.4,'rgba(255,40,30,0.25)'); grd.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=grd; g.fillRect(0,0,128,256);
  const gx=g.createLinearGradient(0,0,128,0);
  gx.addColorStop(0,'rgba(0,0,0,1)'); gx.addColorStop(0.5,'rgba(0,0,0,0)'); gx.addColorStop(1,'rgba(0,0,0,1)');
  g.globalCompositeOperation='destination-out'; g.fillStyle=gx; g.fillRect(0,0,128,256);
  const t=new THREE.CanvasTexture(c); t.colorSpace=THREE.SRGBColorSpace; return t;
})();
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

  // clock + price drift
  gameClock += dt*1.4; // game time accelerated
  applyDaylight(gameClock);
  COACH.tick();
  fog.density = THREE.MathUtils.lerp(0.010, 0.0055, THREE.MathUtils.smoothstep(Math.sin(((gameClock/1440)*Math.PI*2)-Math.PI/2)*0.62, 0.04, 0.45)) + raining*0.0012;
  const hh=Math.floor(gameClock/60)%24, mm=Math.floor(gameClock%60);
  clockEl.textContent = String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');
  spotPrice = 0.10+0.06*Math.sin(gameClock/47)+0.02*Math.sin(gameClock/7.3);
  // solar rooftop production: clear sky + daylight -> free kWh into buffer
  { const elev=Math.sin(((gameClock/1440)*Math.PI*2)-Math.PI/2); const sunFactor=Math.max(0,elev)*(1-Math.min(1,raining*1.4)); const gen=SOLAR_CAP_KW*sunFactor*dt/3600*60; if(gen>0){ if(bufferOwned){ bufferKwh=Math.min(BUFFER_CAP, bufferKwh+gen); } else { solarKwh+=gen; } solarLast=sunFactor; } }
  // ---- economy tick ----
  // grid buys are a cost; cheap-price surplus charges the buffer
  if(bufferOwned){
    if(spotPrice<0.085 && bufferKwh<BUFFER_CAP){
      // cheap grid power: buffer charges up (cost added to dayCost)
      const add=Math.min(BUFFER_CAP-bufferKwh, 60*dt); // 60 kWh per real minute
      bufferKwh+=add; dayCost+=add*spotPrice;
      if(bufferMesh&&bufferMesh.userData.lens) bufferMesh.userData.lens.material.emissive.setHex(0xf0c060);
    } else if(bufferDraining===0){
      if(bufferMesh&&bufferMesh.userData.lens) bufferMesh.userData.lens.material.emissive.setHex(0x35e07c);
    }
    bufferDraining=0;
  }
  // arrival scheduler: each unlocked empty bay pulls a car at a rate scaled by price (cheap power -> more traffic)
  if(ready && carProtos.length){
  for(const b of bays){
    if(b.locked) continue;
    if(b.state==='empty' && b.nextArrT && now>=b.nextArrT){
      spawnCar(b, false, vipPending && !vipSpawned); if(vipPending) vipSpawned=true;
      const adsBoost = techOwned.ads?0.75:1;      // ad network: arrivals 25% sooner
      b.nextArrT = now + (12000 - Math.min(8000, spotPrice*40000)) * (0.6+Math.random()*0.8) / repMult() / demandFactor() * adsBoost;

    }
  }
  }
  // ---- random events scheduler ----
  if(now>nextWx){
    nextWx = now + 60000+Math.random()*90000; // every 1-2.5 real min
    const r=Math.random();
    if(r<0.34){ // cold snap: charge speed -35% for 60s
      coldUntil=now+60000; SFX.chime(440,330); toast('🧊 Cold snap · charging slower for a minute');
    } else if(r<0.62){ // brownout: grid capped
      brownUntil=now+45000; brownCap= bays.filter(x=>!x.locked).length>2? 500:350; SFX.chime(330,240); toast('⚠️ Brownout · grid capped at '+brownCap+' kW');
    } else if(r<0.82){ // VIP stranded car: urgent, big tip
      vipPending=true; vipSpawned=false; toast('👑 VIP stranded outside town — needs rescue charge!');
      bays.forEach(b=>{ if(!b.locked && b.state==='empty') b.nextArrT = Math.min(b.nextArrT||0, now+(techOwned.priority?1200:4000)); });
    } else { // weather shift
      raining = Math.random()<0.5? 0.15+Math.random()*0.2 : 0.65+Math.random()*0.35;
    }
  }
  const cold = now<coldUntil;
  // day rollover at 00:00
  if(gameClock>=24*60){ gameClock-=24*60; endDay(); }
  priceEl.textContent = (spotPrice*100).toFixed(1)+'¢/kWh';
  sign.drawSign(spotPrice*100);
  // (fog density driven by day/night line above)

  // wet shimmer: drift asphalt normal UVs while raining
  if(raining>0.05 && asphalt.material.normalMap){ asphalt.material.normalMap.offset.x=(asphalt.material.normalMap.offset.x+dt*0.004)%1; asphalt.material.normalMap.offset.y=(asphalt.material.normalMap.offset.y+dt*0.006)%1; }
  // rain ripples on mirror zone
  if(mirror.material.uniforms.uWet){ mirror.material.uniforms.uWet.value=raining; mirror.material.uniforms.uTime.value=now*0.001; }
  if(ripples){ ripples.visible=raining>0.05; ripples.material.map.offset.x=(ripples.material.map.offset.x+dt*0.05)%1; ripples.material.map.offset.y=(ripples.material.map.offset.y+dt*0.07)%1; ripples.material.opacity=0.06+raining*0.10; }
  // rain update — streak drop + reinstance
  const fall=(9+raining*11)*dt, wind=raining*2.2*dt;
  for(let i=0;i<rainCount;i++){
    rdrops[i*3+1]-=fall; rdrops[i*3]+=wind;
    // canopy shelter: drops over the roofed footprint get bounced off the roof to a random spot beyond its edge
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
  rainMat.opacity = 0.28+raining*0.30;
  // camera lens droplets overlay
  const sheltered = camera.position.x>-10.2 && camera.position.x<10.2 && camera.position.z>-7.6 && camera.position.z<1.6;
  if(lensFx){ const eff= raining*(sheltered?0.12:1.15); lensFx.style.opacity = Math.min(1, eff); raining>0.05 && !sheltered && lensDrip(dt); }
  let wx = nightK>0.82? 'Clear night' : (nightK>0.25? 'Dusk' : 'Clear');
  if(raining>0.4) wx = nightK>0.82? 'Rainy night' : nightK>0.25? 'Rainy dusk' : 'Light rain';
  if(now<coldUntil) wx = raining>0.4? 'Freezing rain' : 'Cold snap';
  if(raining>0.4 && sheltered) wx += ' · dry under canopy';
  if(now<brownUntil) wx += ' + Brownout';
  wxEl.textContent = wx;
  SFX.setRain(raining);
  let maxSpd=0;
  for(const b of bays){ if(b.car){ wetUpdate(b.car, dt, raining, performance.now()); maxSpd=Math.max(maxSpd, b.car.userData.speed||0); b.car.userData.speed=0; } }
  SFX.setTire(Math.min(1, maxSpd/9));

  // bay logic
  let totalKw=0;
  for(const b of bays){
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
      if(Math.abs(b.car.position.z-b.driveTo)<0.05){ b.state='parked'; b.car.userData.arrived=performance.now(); arrivedTotal++; hourArr[(Math.floor(gameClock/60))%24]=(hourArr[(Math.floor(gameClock/60))%24]||0)+1; SFX.engine(); SFX.chime(660,880); toast('🚗 New arrival — bay '+(BAYS.indexOf(b.x)+1)); }
    }
    // auto-resume throttled bays once the brownout clears
    if(b.throttled && b.plugged && (!(now<brownUntil) || totalKw + b.kw <= brownCap)){ b.throttled=false; autoEnergize(b); }
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
      if(totalKw + b.kw > brownCap && now<brownUntil){ b.state='ready'; b.throttled=true; SFX.click(160); toast('⚠️ Bay throttled — brownout cap '+brownCap+' kW'); continue; }
      const coldMul = (now<coldUntil && !techOwned.heater)?0.65:1;
      const add = dt*(b.kw/350)*0.02*coldMul; // cold slows chemistry (heater tech negates)
      const kwh = add*(b.car.userData.packKwh||PACK_KWH);
      b.car.userData.battery=Math.min(1,b.car.userData.battery+add);
      b.chargeKwh=(b.chargeKwh||0)+kwh;
      totalKw+=b.kw;
      // power sourcing: buffer first (free once charged), rest from grid at spot price
      let fromSol=Math.min(kwh, solarKwh); solarKwh-=fromSol;
      let fromBuf=Math.min(kwh-fromSol, bufferOwned? bufferKwh:0);
      bufferKwh-=fromBuf; if(fromBuf>0) bufferDraining+=fromBuf;
      let fromGrid=kwh-fromBuf;
      if(techOwned.inverter) fromGrid*=0.88;   // smart inverters: 12% less grid draw
      const cost = fromGrid*spotPrice;
      b.sessionCost=(b.sessionCost||0)+cost;
      const rev = kwh*b.sell; revenue+=rev; b.sessionRev+=rev;
      if(b.car.userData.battery>=1){ b.state='departing'; b.plugged=false; b.plug.position.copy(b.plugHome.pos); b.plug.rotation.copy(b.plugHome.rot); setJacket(b,false); SFX.cash(); paySession(b); }
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
        b.plugged=false; grabbedBay = (grabbedBay===b)?null:grabbedBay; docked=false;
        b.nextArrT = performance.now()+5000+Math.random()*10000;
      }
    }
    // patience: idle parked/held car leaves
    if((b.state==='parked'||b.state==='ready') && b.car && !b.car.userData.docked){
      const waited=(now-b.car.userData.arrived)/1000;
      if(waited>b.car.userData.patience){ b.state='departing'; kickedHourly[(Math.floor(gameClock/60))%24]=(kickedHourly[(Math.floor(gameClock/60))%24]||0)+1; SFX.chime(300,220); SFX.departHorn(); repAdd(-(b.car.userData.vip?5:2.5)); dayStats.kicks++; paintGoals(); toast('😠 '+(b.car.userData.seg?b.car.userData.seg.name:'Car')+' left without charging · rep −'+(b.car.userData.vip?5:2.5)); }
    }
  }
  if(totalKw>0) SFX.setCharge(true, totalKw/350); else SFX.setCharge(false);
  loadEl.textContent = totalKw+' kW';
  if(cashEl){ cashEl.textContent='$'+cash.toFixed(2); cashEl.className = cash>=0?'good':'bad'; }
  if(dayEl) dayEl.textContent=day;
  const repEl=document.getElementById('rep');
  if(repEl && performance.now()-repFlashT>2600){ repEl.textContent='★ '+Math.round(rep); repEl.className = rep>=70?'good':(rep>=40?'':'bad'); }
  if(bufEl) bufEl.textContent = (bufferOwned? Math.round(bufferKwh)+' / '+BUFFER_CAP+' kWh':'—') + (solarLast>0.02? ' · ☀ '+Math.round(solarLast*SOLAR_CAP_KW)+' kW':'');
  revEl.textContent = '$'+revenue.toFixed(2);
  { const sp=document.getElementById('sellp'); if(sp){ sp.textContent=Math.round(sellPrice()*100)+'¢/kWh'; sp.className = sellMarkup>2.4?'bad':(sellMarkup<1.5?'warn':'good'); } }
  servedEl.textContent = served;

  // held plug follows camera with spring, RANGE-LIMITED by cable length
  if(grabbedBay && !docked){
    const tp=new THREE.Vector3(); camera.getWorldDirection(tp);
    let target=camera.position.clone().addScaledVector(tp,0.55).add(new THREE.Vector3(0.12,-0.18,0));
    const home=grabbedBay.glandPos||grabbedBay.plugHome.pos;
    const reach=target.clone().sub(home);
    if(reach.length()>CABLE_RANGE){ reach.setLength(CABLE_RANGE); target=home.clone().add(reach); grabbedBay.plugTaut=true; }
    else grabbedBay.plugTaut=false;
    grabbedBay.plug.position.lerp(target, 1-Math.pow(0.0001,dt));
    const look=target.clone().add(tp);
    grabbedBay.plug.lookAt(look);
  }
  // per-bay cables: end A = gland on cabinet, end B = plug (hand/port/ring)
  for(const b of bays){
    if(!b.cable) continue;
    const a=b.glandPos;
    let cB;
    if(b.plugged && b.car && b.state!=='departing'){ cB=bayPort(b).add(new THREE.Vector3(0,0.05,0)); }
    else cB=b.plug.position;
    // plug reeling back to holster when far and free
    if(!b.plugged && grabbedBay!==b && b.plug.position.distanceTo(a)>0.3){
      b.plug.position.lerp(a, 1-Math.pow(0.002,dt));
    }
    cableStep(b.cable, a, cB, dt);
    // port ring indicator while this bay's connector is held
    if(b.portRing){
      const wantVis = (!b.plugged && b.car && (grabbedBay===b || !grabbedBay)) ;
      const isTarget = grabbedBay===b;
      b.portRing.material.opacity += ((isTarget? (0.85+0.15*Math.sin(now/150)) : (wantVis? 0.3:0)) - b.portRing.material.opacity)*Math.min(1,dt*8);
      if(b.car){ const p=bayPort(b); b.portRing.position.copy(p); b.portRing.lookAt(camera.position);
        b.portRing.scale.setScalar(isTarget? 1.15+0.1*Math.sin(now/150):1); }
    }
    // charge flow pulse on cable while charging
    if(b.cable.mesh && b.state==='charging'){ b.cable.mesh.material.emissive=b.cable.mesh.material.emissive||new THREE.Color(); b.cable.mesh.material.emissive.setHex(0x0b3520); b.cable.mesh.material.emissiveIntensity=0.9+0.5*Math.sin(now/110); }
    else if(b.cable.mesh && b.cable.mesh.material.emissive){ b.cable.mesh.material.emissiveIntensity=0; }
  }

  // prompt text
  const t=currentTarget();
  if(grabbedBay && !docked) promptEl.innerHTML = grabbedBay.plugTaut? '<b class="warn">Cable taut</b> — back toward the car port · <b>E</b> to lock' : 'Press <b>E</b> at port to lock', promptEl.classList.add('show');
  else if(t&&t.type==='car'&&t.bay.plugged&&t.bay.state==='charging') promptEl.innerHTML='<b>R</b> pause · <b>E</b> unplug', promptEl.classList.add('show');
  else if(t&&t.type==='car'&&t.bay.plugged&&t.bay.state==='ready') promptEl.innerHTML='<b>R</b> resume · <b>E</b> unplug', promptEl.classList.add('show');
  else if(t&&t.type==='charger'&&!grabbedBay&&!t.bay.plugged) promptEl.innerHTML='Press <b>E</b> — grab connector', promptEl.classList.add('show');
  else if(docked&&grabbedBay&&grabbedBay.state!=='charging') promptEl.innerHTML='Press <b>R</b> — energize', promptEl.classList.add('show');
  if(touchMode && tEEl && tREl){
    if(grabbedBay && !docked){ tEEl.textContent='🔌'; tREl.textContent='—'; }
    else if(docked && grabbedBay && grabbedBay.state!=='charging'){ tEEl.textContent='—'; tREl.textContent='⚡'; }
    else if(t && t.type==='car' && t.bay.plugged && t.bay.state==='charging'){ tEEl.textContent='🔌'; tREl.textContent='⏸'; }
    else if(t && t.type==='car' && t.bay.plugged && t.bay.state==='ready'){ tEEl.textContent='🔌'; tREl.textContent='▶'; }
    else if(t && t.type==='charger' && !grabbedBay && !t.bay.plugged){ tEEl.textContent='🔌'; tREl.textContent='—'; }
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
bloomPass = bloom;
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
  diag, bays:()=>bays.map(b=>({state:b.state, batt:b.car?b.car.userData.battery:null})),
  carMats(){ const out=[]; const car=carProtos[0]; if(!car) return out; const seen=new Set(); car.traverse(o=>{ if(o.isMesh&&o.material){ const ms=Array.isArray(o.material)?o.material:[o.material]; for(const m of ms){ if(seen.has(m.uuid))continue; seen.add(m.uuid); out.push({name:m.name,metal:m.metalness,rough:m.roughness,env:m.envMapIntensity,cc:m.clearcoat!==undefined?m.clearcoat:null,color:m.color?m.color.getHexString():null}); } } }); return out; },
  ready:()=>ready, envReady:()=>envReady,
  carBoxes(){ const out=[]; for(const b of bays){ if(b.car){ const bb=new THREE.Box3().setFromObject(b.car); out.push({bay:b.x, state:b.state, min:bb.min.toArray().map(v=>+v.toFixed(2)), max:bb.max.toArray().map(v=>+v.toFixed(2))}); } } return out; },
  pose(x,y,z,ry,rx){ camera.position.set(x,y,z); camera.rotation.set(rx||0,ry,0); },
  lookAt(x,y,z,dist,up){ const c=camera.position; const d=new THREE.Vector3(x-c.x,y-c.y,z-c.z); d.normalize(); const p=c.clone().addScaledVector(d,-(dist||6)); camera.position.copy(p); const yaw=Math.atan2(-(x-p.x),-(z-p.z)); camera.rotation.set(0,yaw,0); },
  groundInfo(){ const mats=[]; scene.traverse(o=>{ if(o.isMesh && o.geometry && o.geometry.type==='PlaneGeometry' && o.geometry.parameters && o.geometry.parameters.width===220){ const m=o.material; mats.push({name:m.name||'std', hasMap:!!m.map, mapSrc:m.image?m.image.src||m.image.currentSrc||('w'+m.image.width):null, repeat:m.map?[m.map.repeat.x,m.map.repeat.y]:null, rough:m.roughness, metal:m.metalness, vis:o.visible}); } }); return mats; },
  serve(){ served+=1; },
  setClock(h){ gameClock=h*60; },
  weather(v){ raining=Math.max(0,Math.min(1,v)); },
  event(name){ const t=performance.now();
    if(name==='cold'){ coldUntil=t+60000; return 'cold'; }
    if(name==='brown'){ brownUntil=t+45000; brownCap=500; return 'brown'; }
    if(name==='vip'){ vipPending=true; vipSpawned=false; return 'vip'; }
    if(name==='rain'){ raining=0.8; return 'rain'; } return 'none'; },
  forceArr(i,vip){ const b=bays[i]; if(b.state!=='empty') return 'busy'; spawnCar(b,false,!!vip); return 'ok'; },
  info(){ return {nightK:+nightK.toFixed(3), clock:Math.floor(gameClock), protos:carProtos.length, fixtures:nightFixtures.length}; },
  camPos(){ return {x:+camera.position.x.toFixed(2), y:+camera.position.y.toFixed(2), z:+camera.position.z.toFixed(2)}; },
  setBatt(i,v){ if(bays[i].car){ bays[i].car.userData.battery=v; return 'ok'; } return 'nocar'; },
  q(){ return {mode:Q.mode, fps:diag.fps, pxr:renderer.getPixelRatio?+renderer.getPixelRatio().toFixed(2):null}; },
  techState(){ return Object.assign({}, techOwned); },
  techbuy(id){ return buyTech(id); },
  setCash(v){ cash=v; return cash; },
  repGet(){ return rep; },
  techmenu(force){ toggleTechMenu(force); return techOpen; },
  aimPort(i){ const b=bays[i]; if(!b.car) return 'nocar'; const p=bayPort(b); camera.position.set(p.x+1.35, p.y+0.15, p.z+0.45); camera.lookAt(p); return 'ok'; },
  portPos(i){ const b=bays[i]; if(!b.car) return null; const p=bayPort(b); return {x:+p.x.toFixed(2),y:+p.y.toFixed(2),z:+p.z.toFixed(2)}; },
  forceSeg(i,id,ci){ const p=(segProto[id]&&segProto[id][ci||0])||(origProtos[0]); if(!p) return 'nopool';
    const car=p.clone(true); if(bays[i].car){ scene.remove(bays[i].car); }
    car.traverse(o=>{ if(o.isMesh){o.castShadow=true;o.receiveShadow=true;} });
    if(p.userData.protoPort) car.userData.portLocal=new THREE.Vector3(...p.userData.protoPort);
    car.userData={...car.userData, battery:0.2, need:0.9, patience:9999, arrived:performance.now(), vip:false, seg:(SEGMENTS.find(s=>s.id===id)||SEGMENTS[0]), packKwh:80, portLocal:(p.userData.protoPort?new THREE.Vector3(...p.userData.protoPort):car.userData.portLocal)};
    bays[i].car=car; bays[i].state='parked'; bays[i].plugged=false; scene.add(car);
    const p0=bays[i].car.position; car.position.set(bays[i].x,0,-3.1);
    if(bays[i].cshadow){bays[i].cshadow.position.set(bays[i].x,0.018,-3.1);bays[i].cshadow.visible=true;}
    return 'ok '+id; },
  forceOrig(i,ci){ scene.traverse(o=>{ if(o.type==='Group'&&o!==bays[i]?.car&&o.userData&&o.userData.fleet) o.visible=false; });
    bays.forEach((bb,j)=>{ if(j!==i&&bb.car){ bb.car.visible=false; } if(bb.cshadow&&j!==i) bb.cshadow.visible=false; });
    const b=bays[i]; if(b.car){ scene.remove(b.car); b.car=null; }
    const proto=origProtos.length? origProtos[(ci||0)%origProtos.length] : null; if(!proto) return 'noproto';
    const car=proto.clone(true); car.traverse(o=>{ if(o.isMesh){o.castShadow=true;o.receiveShadow=true;} });
    car.userData={ battery:0.18, need:0.9, patience:9999, arrived:performance.now(), vip:false, seg:SEGMENTS[0], packKwh:75, portLocal:new THREE.Vector3(-0.60,0.62,-0.88) };
    car.position.set(b.x,0,-3.1); car.rotation.y=Math.PI; scene.add(car); b.car=car; b.state='parked'; b.plugged=false;
    if(b.cshadow){ b.cshadow.position.set(b.x, 0.018, -3.1); b.cshadow.visible=true; } else { b.cshadow=contactShadow(5.6,2.8,b.x,-3.1,0.9); }
    return 'ok'; },
  carPos(i){ const b=bays[i]; if(!b.car) return null; return {x:+b.car.position.x.toFixed(2),y:+b.car.position.y.toFixed(2),z:+b.car.position.z.toFixed(2),yaw:+b.car.rotation.y.toFixed(2)}; },
  plugBox(i){ const b=bays[i]; if(!b.plug) return null; const bb=new THREE.Box3().setFromObject(b.plug); return {min:[+bb.min.x.toFixed(2),+bb.min.y.toFixed(2),+bb.min.z.toFixed(2)],max:[+bb.max.x.toFixed(2),+bb.max.y.toFixed(2),+bb.max.z.toFixed(2)]}; },
  plugRot(i,z,x){ const b=bays[i]; if(!b.plug) return 'noplug'; if(z!==undefined) b.plug.quaternion.setFromEuler(new THREE.Euler(x||0, 0, z, 'ZXY')); else b.plug.quaternion.set(0,0,0,1); b.plug.position.copy(bayPort(b)); return 'ok'; },
  plugTip(i){ const b=bays[i]; if(!b.plug) return null; const v=new THREE.Vector3(0,1,0).applyQuaternion(b.plug.quaternion); return {x:+v.x.toFixed(2),y:+v.y.toFixed(2),z:+v.z.toFixed(2)}; },
  dockVisual(i){ const b=bays[i]; if(!b.plug||!b.car) return 'nodata'; const port=bayPort(b); const inward=new THREE.Vector3(1,0,0).applyQuaternion(b.car.quaternion); const up=new THREE.Vector3(0,1,0); const xA=new THREE.Vector3().crossVectors(up,inward); if(xA.lengthSq()<1e-6) xA.set(1,0,0); xA.normalize(); const zA=new THREE.Vector3().crossVectors(inward,xA).normalize(); b.plug.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xA,inward,zA)); b.plug.position.copy(port).addScaledVector(inward,0.06); return this.plugTip(i); },
  cableView(i){ const b=bays[i]; if(!b.car||!b.glandPos) return 'nodata'; const p=bayPort(b); const mid=p.clone().add(b.glandPos).multiplyScalar(0.5); const dir=p.clone().sub(b.glandPos); const side=new THREE.Vector3(-dir.z,0,dir.x).normalize(); camera.position.copy(mid).add(side.multiplyScalar(1.6)).add(new THREE.Vector3(0,0.55,0)); camera.lookAt(mid); return 'ok'; },
  aimCharger(i){ const b=bays[i]; camera.position.set(b.x+1.9, 1.15, -4.3); const look=new THREE.Vector3(b.x,0.95,-6.0); camera.lookAt(look); return 'ok'; },
  hidecars(v){ bays.forEach(b=>{ if(b.car) b.car.visible=!v; }); return 'ok'; },
  onlycharger(i){ scene.traverse(o=>{ if(o.isMesh) o.visible=false; }); bays.forEach((b,j)=>{ if(b.charger){ b.charger.visible=(j===i); b.charger.traverse(o=>{ if(o.isMesh) o.visible=(j===i); }); } if(b.plug) b.plug.visible=(j===i); }); return 'ok'; },
  qset(m){ qApply(m); return Q.mode; },
  solar(){ return {last:+solarLast.toFixed(2), stored:+solarKwh.toFixed(2), capKW:SOLAR_CAP_KW}; },
  // ---- soak-test hooks: drive the REAL interaction path ----
  bayState(i){ const b=bays[i]; return {state:b.state, batt:b.car?+b.car.userData.battery.toFixed(3):null, kwh:+(b.chargeKwh||0).toFixed(3), pat:b.car?+((performance.now()-b.car.userData.arrived)/1000).toFixed(1):null}; },
  grab(i){ if(bays[i].plugged) return 'plugged'; if(grabbedBay&&grabbedBay!==bays[i]) return 'busy'; grabbedBay=bays[i]; docked=false; return 'grabbed'; },
  dock(i){ if(!bays[i].car) return 'nocar'; docked=false; grabbedBay=null; bays[i].plugged=true; bays[i].car.userData.docked=true; bays[i].state='ready'; autoEnergize(bays[i]); return bays[i].state; },
  energize(i){ if(i!=null && bays[i].plugged) autoEnergize(bays[i]); return i!=null? bays[i].state : 'none'; },
  pause(i){ if(i!=null) toggleCharge(i); return i!=null? bays[i].state : 'none'; },
  econ(){ return {revenue:+revenue.toFixed(2), served, price:+spotPrice.toFixed(4)}; },
  loadKw(){ let t=0; for(const b of bays) if(b.state==='charging') t+=b.kw; return t; },
  money(){ return {cash:+cash.toFixed(2), day, dayRev:+dayRev.toFixed(2), dayCost:+dayCost.toFixed(2), bufferKwh:+bufferKwh.toFixed(2), bufferOwned}; },
  hourStats(){ return {served:hourStats, arrivals:hourArr, kicks:kickedHourly, arrivedTotal}; },
  setMarkup(v){ sellMarkup=THREE.MathUtils.clamp(v, MARKUP_MIN, MARKUP_MAX); return {markup:sellMarkup, sell:+sellPrice().toFixed(4), demand:+demandFactor().toFixed(3)}; },
  markup(){ return {markup:sellMarkup, sell:+sellPrice().toFixed(4), demand:+demandFactor().toFixed(3)}; },
  save(){ saveGame(); return localStorage.getItem('chargebay_save_v1')? 'saved':'fail'; },
  endDayNow(){ endDay(); return 'ok'; },
  cardOpen(){ return !!(window.__GAME&&window.__GAME._cardOpen); },
  goalsState(){ return {goals, dayStats, streak}; },
  completeGoal(id){ const g=goals.find(x=>x.id===id); if(g&&!g.done){ dayStats[g.key]=g.target; bumpGoal(g.key,0);} return 'ok'; },
  techopen(){ toggleTechMenu(true); return 'ok'; },
  tailGlow(i){ const car=bays[i]&&bays[i].car; if(!car) return null; let mx=0; car.traverse(o=>{ if(o.isMesh&&o.material&&/tail/i.test(o.material.name||'')) mx=Math.max(mx,o.material.emissiveIntensity); }); return +mx.toFixed(2); },
  finishArr(i){ const b=bays[i]; if(b.state==='arriving'&&b.car){ b.car.position.z=b.driveTo; b.car.rotation.y=Math.PI+(b.x-b.car.position.x)*0.035; b.state='parked'; b.car.userData.arrived=performance.now(); } return b.state; },
  kickBay(i){ const b=bays[i]; if(b.car&&b.state!=='departing'){ b.state='departing'; b.plugged=false; } return b.state; },
  wiperCount(i){ const car=bays[i]&&bays[i].car; if(!car) return -1; let n=0; car.traverse(o=>{ if(o.name==='WiperArm') n++; }); return n; },
  wiperTips(i){ const car=bays[i]&&bays[i].car; if(!car) return null; car.updateMatrixWorld(true); const out=[]; car.traverse(o=>{ if(/^WiperArm/.test(o.name||'')){ const m=o.matrixWorld; out.push([+m.elements[12].toFixed(2),+m.elements[13].toFixed(2),+m.elements[14].toFixed(2)]); } }); return out; },
  sweepCount(i){ const car=bays[i]&&bays[i].car; if(!car) return -1; let n=0; car.traverse(o=>{ if(o.name==='WipSweep') n++; }); return n; },
  probeCar(i){ const car=bays[i]&&bays[i].car; if(!car) return null; const out={yaw:+car.rotation.y.toFixed(2), pos:car.position.toArray().map(v=>+v.toFixed(2))}; car.updateMatrixWorld(true);
    const named={}; car.traverse(o=>{ if(o.isMesh && /glass|head|tail|windshield/i.test(o.name||'')){ const bb=new THREE.Box3().setFromObject(o); if(!named[o.name]) named[o.name]={min:bb.min.toArray().map(v=>+v.toFixed(2)),max:bb.max.toArray().map(v=>+v.toFixed(2))}; } }); out.parts=named; return out; },
  clearBay(i){ const b=bays[i]; if(b.car){ scene.remove(b.car); b.car=null; } b.state='empty'; b.plugged=false; return 'ok'; },
  spokeInfo(i){ const car=bays[i]&&bays[i].car; if(!car) return {e:'nocar'}; const out=[]; car.updateMatrixWorld(true); car.traverse(o=>{ if(o.isMesh && /^Spoke[0-9]+|Spoke_[0-9]+/.test(o.name) && out.length<8){ const wp=new THREE.Vector3(); o.getWorldPosition(wp); out.push({n:o.name, l:[+o.position.x.toFixed(2),+o.position.y.toFixed(2),+o.position.z.toFixed(2)], w:[+wp.x.toFixed(2),+wp.y.toFixed(2),+wp.z.toFixed(2)]}); } }); return {yaw:car.rotation.y, pos:car.position.toArray().map(v=>+v.toFixed(2)), wheels:out}; },
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
    const anyPlugged = bays.some(b=>b.plugged);
    if(grabbedBay || anyPlugged) mark(1);
    if(anyPlugged) mark(2);
    if(bays.some(b=>b.state==='charging')) mark(3);
    if(served>0){ mark(4); setTimeout(hide, 2500); }
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
  const tr=document.getElementById('techrep'); if(tr) tr.textContent='★ '+Math.round(rep)+' reputation';
  box.innerHTML=Object.keys(TECH).map((id,i)=>{
    const tc=TECH[id], own=!!techOwned[id];
    const afford=cash>=tc.cost, repOK=rep>=tc.rep;
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
initLensFx();
loadAssets().catch(e=>{ console.error('asset load failed', e && e.type, e && e.message); ready=true; if(!envReady) envReady=true; });
setInterval(()=>{ if(ready) saveGame(); }, 30000);
addEventListener('beforeunload', ()=>{ if(ready) saveGame(); });
addEventListener('keydown', e=>{ if(e.code==='Tab') e.preventDefault(); });
animate();
