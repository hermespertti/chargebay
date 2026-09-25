import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/GLTFLoader.js';
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
  // force IBL response on all standard materials (incl clearcoat on hero car)
  scene.traverse(o=>{
    if(o.isMesh && o.material){
      const ms = Array.isArray(o.material)?o.material:[o.material];
      for(const m of ms){ if(m.isMeshStandardMaterial){ m.envMapIntensity = Math.max(m.envMapIntensity||1, 2.4); if('clearcoat' in m){ m.clearcoat=1.0; m.clearcoatRoughness=0.06; } m.needsUpdate=true; } }
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

// ---------------- fog & sky ----------------
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
function applyDaylight(){
  // dusk palette
  const t = DAY.t;
  const top = new THREE.Color().setHSL(0.64, 0.52, 0.26 + 0.06*(1-t));
  const mid = new THREE.Color().setHSL(0.70, 0.48, 0.34);
  const bot = new THREE.Color().setHSL(0.07, 0.88, 0.42);
  const sun = new THREE.Color().setHSL(0.06, 0.95, 0.72);
  const u = sky.material.uniforms;
  u.topCol.value.copy(top); u.midCol.value.copy(mid); u.botCol.value.copy(bot);
  u.sunCol.value.copy(sun);
  u.sunDir.value.set(-0.85, 0.06, -0.5).normalize();
  fog.color.setHSL(0.075, 0.38, 0.30);
  renderer.toneMappingExposure = 0.85;
}
applyDaylight();
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

const mirror = new Reflector(new THREE.PlaneGeometry(46,34), {
  clipBias: 0.004, textureWidth: 1024, textureHeight: 1024, color: 0x4a4239
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
  const fill = new THREE.PointLight(0xffb888, 34, 30, 1.7); fill.position.set(0,3.6,-1.0); g.add(fill);
  const fill2 = new THREE.PointLight(0xffa068, 22, 24, 1.5); fill2.position.set(0,1.6,3.5); g.add(fill2);
  const ledW = new THREE.MeshStandardMaterial({color:0x140e08, emissive:0xd89050, emissiveIntensity:0.9});
  // roof slab
  const roof = new THREE.Mesh(new THREE.BoxGeometry(20.4,0.28,9.2), dark);
  roof.position.set(0,4.6,-3.0); roof.castShadow=true; g.add(roof);
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
    const sp = new THREE.SpotLight(0xffe3bd, 45, 12, Math.PI/3.4, 0.7, 1.6);
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
  for(const z of [9.5]){
    const rail=new THREE.Mesh(new THREE.BoxGeometry(60,0.14,0.05), steel); rail.position.set(0,0.72,z); rail.castShadow=true; guard.add(rail);
    for(let i=0;i<20;i++){
      const post=new THREE.Mesh(new THREE.BoxGeometry(0.09,0.72,0.09), steel); post.position.set(-30+i*3.2,0.36,z); guard.add(post);
    }
  }
  // road beyond guard
  const road=new THREE.Mesh(new THREE.PlaneGeometry(80,9), new THREE.MeshStandardMaterial({color:0x101216, roughness:0.6, metalness:0.2, envMapIntensity:1.2}));
  road.rotation.x=-Math.PI/2; road.position.set(0,0.008,14.5); road.receiveShadow=true; guard.add(road);
  const dash=new THREE.MeshStandardMaterial({color:0xd8c84a, roughness:0.5, emissive:0x201d08, emissiveIntensity:0.5});
  for(let i=0;i<14;i++){ const d=new THREE.Mesh(new THREE.PlaneGeometry(2.4,0.14), dash); d.rotation.x=-Math.PI/2; d.position.set(-30+i*4.6,0.014,14.5); guard.add(d); }
}
scene.add(guard);

// ---------------- assets: chargers & cars ----------------
const loader = new GLTFLoader();
function loadGLB(path){ return new Promise((res,rej)=>{ const to=setTimeout(()=>rej(new Error('timeout '+path)), 120000); loader.load(path,(g)=>{clearTimeout(to);res(g);},(e)=>{},(e)=>{clearTimeout(to);rej(new Error('loadfail '+path+' '+(e&&(e.message||e.type||''))));}); }); }

let chargerProto=null, carProtos=[];
const bays = BAYS.map(x=>({ x, charger:null, car:null, state:'empty', plug:null, plugHome:null, chargeKwh:0, sessionRev:0, price:0.124 }));

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
function boostEnv(root, inten=2.6){
  root.traverse(o=>{
    if(o.isMesh && o.material){
      const ms=Array.isArray(o.material)?o.material:[o.material];
      for(const m of ms){ if(m.isMeshStandardMaterial){ m.envMapIntensity=Math.max(m.envMapIntensity||1,inten); if('clearcoat' in m){ m.clearcoat=Math.max(m.clearcoat,0.9); m.clearcoatRoughness=Math.min(m.clearcoatRoughness,0.08);} if(m.emissiveIntensity>4){ m.emissiveIntensity=2.2; } m.needsUpdate=true; } }
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
  // place chargers
  bays.forEach((b,i)=>{
    const ch = chargerProto.clone(true);
    ch.position.set(b.x, 0, -6.0); ch.rotation.y = 0; ch.scale.setScalar(1.25);
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
  spawnCar(bays[0], true); spawnCar(bays[2], true); spawnCar(bays[1], true);
  ready=true;
  document.getElementById('start').style.display='none';
  if(!window.__GAMESPAWN) window.dispatchEvent(new Event('gamespawn'));
}
let plugsProto=null;
async function loadPlugs(){
  const p = await loadGLB('assets/plug.glb'); plugsProto=p.scene;
  bays.forEach(b=>{
    const pl = plugsProto.clone(true);
    pl.position.set(b.x+0.34, 1.05, -6.0); pl.rotation.set(0,Math.PI,0); pl.scale.setScalar(1.15);
    pl.traverse(o=>{ if(o.isMesh)o.castShadow=true; });
    scene.add(pl); b.plug=pl; b.plugHome={pos:pl.position.clone(), rot:pl.rotation.clone()};
  });
}

// spawn a car at a bay with random paint & battery
function spawnCar(bay, instant=false){
  const proto = carProtos[Math.floor(Math.random()*carProtos.length)];
  const car = proto.clone(true);
  car.traverse(o=>{ if(o.isMesh){o.castShadow=true; o.receiveShadow=true;} });
  const roll = 0.08+Math.random()*0.5;
  car.userData = { battery: roll, need: 0.72+Math.random()*0.25, patience: 90+Math.random()*120, arrived: performance.now() };
  car.position.set(bay.x, 0, instant? -3.1 : 16 + Math.random()*6);
  car.rotation.y = Math.PI; // front faces chargers (-Z if model front is +Z we flip after vision check)
  // ground light refs: behind (tail, red) and front (head, warm) — car forward is -Z after rot.y=PI/2
  const cshadow = contactShadow(5.6, 2.8, 0, 0, 0.9); cshadow.position.set(car.position.x, 0.018, car.position.z); scene.add(cshadow); bay.cshadow=cshadow;
  const tail=new THREE.Mesh(new THREE.PlaneGeometry(1.7,2.6), new THREE.MeshBasicMaterial({map:carReflTexRed,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0.18}));
  tail.rotation.x=-Math.PI/2; tail.position.set(car.position.x, 0.016, car.position.z+1.4); tail.rotation.z=Math.PI; tail.renderOrder=5; scene.add(tail); bay.tailRefl=tail;
  const head=new THREE.Mesh(new THREE.PlaneGeometry(1.5,2.2), new THREE.MeshBasicMaterial({map:carReflTexWarm,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false,opacity:0.15}));
  head.rotation.x=-Math.PI/2; head.position.set(car.position.x, 0.016, car.position.z-1.2); head.renderOrder=5; scene.add(head); bay.headRefl=head;
  scene.add(car); bay.car=car; bay.state='arriving';
  // drive-in animation target
  bay.driveTo = -3.1;
}

// ---------------- interaction state ----------------
const keys={};
addEventListener('keydown',e=>{ keys[e.code]=true; onKey(e); });
addEventListener('keyup',e=>keys[e.code]=false);

let ready=false;
let grabbedBay=null, docked=false;
let revenue=0, served=0;
const clockEl=document.getElementById('clock'), priceEl=document.getElementById('price'),
      revEl=document.getElementById('rev'), servedEl=document.getElementById('served'),
      loadEl=document.getElementById('load'), wxEl=document.getElementById('wx'),
      promptEl=document.getElementById('prompt'), toastEl=document.getElementById('toast');

function toast(msg){ toastEl.innerHTML=msg; toastEl.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>toastEl.classList.remove('show'),2200); }

let gameClock = 18*60+42; // minutes, dusk
let spotPrice = 0.124;

function onKey(e){
  if(!ready) return;
  if(e.code==='KeyE') tryInteract();
  if(e.code==='KeyR') toggleCharge();
}

// controller
const controls = new PointerLockControls(camera, renderer.domElement);
document.getElementById('playbtn').addEventListener('click',()=>controls.lock());
controls.addEventListener('lock', ()=>{ document.getElementById('start').style.display='none'; });
controls.addEventListener('unlock', ()=>{ if(ready) document.getElementById('start').style.display='flex'; });

let vy=0, bob=0;
function updatePlayer(dt){
  const speed=(keys['ShiftLeft']?4.6:2.4);
  const f=(keys['KeyW']?1:0)-(keys['KeyS']?1:0);
  const s=(keys['KeyD']?1:0)-(keys['KeyA']?1:0);
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

function tryInteract(){
  const t = currentTarget();
  if(!t) return;
  const b=t.bay;
  if(grabbedBay===b && docked){ // unplug
    docked=false; b.state='charging'===b.state?'held':'held';
    b.car.userData.docked=false; toast('🔌 Connector unplugged');
    grabbedBay.plug.position.copy(grabbedBay.plugHome.pos);
    grabbedBay.plug.rotation.copy(grabbedBay.plugHome.rot);
    grabbedBay=null; return;
  }
  if(grabbedBay===b && !docked){
    // attempt dock: close to port?
    if(b.car){
      const port=new THREE.Vector3(-1.5*(b.car.scale.x),0.62,-0.95);
      port.applyQuaternion(b.car.quaternion); port.add(b.car.position);
      if(port.distanceTo(camera.position)<2.2){
        docked=true; b.car.userData.docked=true; b.state='ready';
        toast('✅ Locked — press R to energize'); return;
      } else { toast('❌ Move closer to the port'); return; }
    }
  }
  if(t.type==='charger' && !grabbedBay){
    // if bay car present and port side reachable, grabbing plug allowed
    grabbedBay=b; docked=false; toast('🔌 Grabbed connector — aim at car port, press E');
    return;
  }
}

function toggleCharge(){
  if(!grabbedBay || !docked) { toast('Dock the connector first (E)'); return; }
  const b=grabbedBay;
  if(b.state==='charging'){ b.state='ready'; toast('⏸ Charging paused'); return; }
  b.state='charging'; b.price=spotPrice; b.kwhStart=0;
  toast('⚡ Charging at 350 kW');
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
  const m=new THREE.Mesh(new THREE.PlaneGeometry(w,d), new THREE.MeshBasicMaterial({map:SHADOW_TEX,transparent:true,opacity:(op??0.85)*0.45,depthWrite:false,blending:THREE.MultiplyBlending}));
  m.rotation.x=-Math.PI/2; m.position.set(x,0.018,z); m.renderOrder=6; return m;
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
  fpsAcc+=1/dt; fpsN++; if(fpsN>=30){ fpsVal=fpsAcc/fpsN; fpsAcc=0; fpsN=0; diag.fps=Math.round(fpsVal); }

  updatePlayer(dt);

  // clock + price drift
  gameClock += dt*1.4; // game time accelerated
  const hh=Math.floor(gameClock/60)%24, mm=Math.floor(gameClock%60);
  clockEl.textContent = String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0');
  spotPrice = 0.10+0.06*Math.sin(gameClock/47)+0.02*Math.sin(gameClock/7.3);
  priceEl.textContent = (spotPrice*100).toFixed(1)+'¢/kWh';
  sign.drawSign(spotPrice*100);
  fog.density = 0.007 + raining*0.0015;

  // wet shimmer: drift asphalt normal UVs while raining
  if(raining>0.05 && asphalt.material.normalMap){ asphalt.material.normalMap.offset.x=(asphalt.material.normalMap.offset.x+dt*0.004)%1; asphalt.material.normalMap.offset.y=(asphalt.material.normalMap.offset.y+dt*0.006)%1; }
  // rain ripples on mirror zone
  if(ripples){ ripples.visible=raining>0.05; ripples.material.map.offset.x=(ripples.material.map.offset.x+dt*0.05)%1; ripples.material.map.offset.y=(ripples.material.map.offset.y+dt*0.07)%1; ripples.material.opacity=0.10+raining*0.22; }
  // rain update — streak drop + reinstance
  const fall=(9+raining*11)*dt, wind=raining*2.2*dt;
  for(let i=0;i<rainCount;i++){
    rdrops[i*3+1]-=fall; rdrops[i*3]+=wind;
    if(rdrops[i*3+1]<0){ rdrops[i*3+1]=20+Math.random()*4; rdrops[i*3]=(camera.position.x+(Math.random()-0.5)*46); rdrops[i*3+2]=(camera.position.z+(Math.random()-0.5)*46); }
    if(Math.abs(rdrops[i*3]-camera.position.x)>26||Math.abs(rdrops[i*3+2]-camera.position.z)>26){
      rdrops[i*3]=(camera.position.x+(Math.random()-0.5)*46); rdrops[i*3+2]=(camera.position.z+(Math.random()-0.5)*46); rdrops[i*3+1]=18+Math.random()*6;
    }
    dummy.position.set(rdrops[i*3],rdrops[i*3+1],rdrops[i*3+2]); dummy.rotation.set(0.14,0,0.10); dummy.updateMatrix(); rain.setMatrixAt(i,dummy.matrix);
  }
  rain.instanceMatrix.needsUpdate=true;
  rainMat.opacity = 0.28+raining*0.30;
  wxEl.textContent = raining>0.4?'Light rain':'Clear dusk';

  // bay logic
  let totalKw=0;
  for(const b of bays){
    if(b.state==='arriving' && b.car){
      b.car.position.z = THREE.MathUtils.lerp(b.car.position.z, b.driveTo, dt*1.6);
      if(b.tailRefl) b.tailRefl.position.z = b.car.position.z+1.4;
      if(b.headRefl) b.headRefl.position.z = b.car.position.z-1.2;
      if(b.cshadow) b.cshadow.position.z = b.car.position.z;
      if(Math.abs(b.car.position.z-b.driveTo)<0.05){ b.state='parked'; toast('🚗 New arrival — bay '+(BAYS.indexOf(b.x)+1)); }
    }
    if(b.state==='charging' && b.car){
      const add = 350*dt/3600*10; // game-time accelerate
      b.car.userData.battery=Math.min(1,b.car.userData.battery+add);
      b.chargeKwh+=350*dt/3600*10;
      totalKw+=350;
      const rev = add*1000*b.price; revenue+=rev; b.sessionRev+=rev;
      if(b.car.userData.battery>=1){ b.state='departing'; revenue+=0; toast('🎉 Charge complete +$'+b.sessionRev.toFixed(2)); served++; b.sessionRev=0; }
      // plug LED: pulse ring — scale plug emissive via material hack
      if(b.plug){ b.plug.traverse(o=>{ if(o.isMesh&&o.material&&o.material.emissive) o.material.emissiveIntensity = 6+Math.sin(now/120)*4; }); }
    }
    if(b.state==='departing' && b.car){
      b.car.position.z = THREE.MathUtils.lerp(b.car.position.z, 20, dt*1.2);
      b.car.position.x += (b.x<0?-1:1)*dt*0.4;
      if(b.tailRefl) b.tailRefl.position.z = b.car.position.z+1.4;
      if(b.headRefl) b.headRefl.position.z = b.car.position.z-1.2;
      if(b.cshadow) b.cshadow.position.z = b.car.position.z;
      if(b.car.position.z>18){ scene.remove(b.car); b.car=null; if(b.tailRefl){scene.remove(b.tailRefl);b.tailRefl=null;} if(b.headRefl){scene.remove(b.headRefl);b.headRefl=null;} if(b.cshadow){scene.remove(b.cshadow);b.cshadow=null;} b.state='empty';
        if(b.plug){ b.plug.position.copy(b.plugHome.pos); b.plug.rotation.copy(b.plugHome.rot); }
        grabbedBay = (grabbedBay===b)?null:grabbedBay; docked=false;
        setTimeout(()=>spawnCar(b), 2500+Math.random()*6000);
      }
    }
    // patience: idle parked car leaves
    if(b.state==='parked' && b.car){
      const waited=(now-b.car.userData.arrived)/1000;
      if(waited>b.car.userData.patience){ b.state='departing'; toast('😠 Left without charging'); }
    }
  }
  loadEl.textContent = totalKw+' kW';
  revEl.textContent = '$'+revenue.toFixed(2);
  servedEl.textContent = served;

  // held plug follows camera with spring
  if(grabbedBay && !docked){
    const tp=new THREE.Vector3(); camera.getWorldDirection(tp);
    const target=camera.position.clone().addScaledVector(tp,0.55).add(new THREE.Vector3(0.12,-0.18,0));
    grabbedBay.plug.position.lerp(target, 1-Math.pow(0.0001,dt));
    const look=target.clone().add(tp);
    grabbedBay.plug.lookAt(look);
  }

  // prompt text
  const t=currentTarget();
  if(grabbedBay && !docked) promptEl.innerHTML='Press <b>E</b> at port to lock', promptEl.classList.add('show');
  else if(t&&t.type==='charger'&&!grabbedBay) promptEl.innerHTML='Press <b>E</b> — grab connector', promptEl.classList.add('show');
  else if(docked&&grabbedBay&&grabbedBay.state!=='charging') promptEl.innerHTML='Press <b>R</b> — energize', promptEl.classList.add('show');
  else if(docked) promptEl.innerHTML='<b>R</b> stop · <b>E</b> unplug', promptEl.classList.add('show');
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

// diagnostics for capture harness
const diag={ fps:0, calls:()=>renderer.info.render.calls, tris:()=>renderer.info.render.triangles };
window.__GAME = {
  diag, bays:()=>bays.map(b=>({state:b.state, batt:b.car?b.car.userData.battery:null})),
  carMats(){ const out=[]; const car=carProtos[0]; if(!car) return out; const seen=new Set(); car.traverse(o=>{ if(o.isMesh&&o.material){ const ms=Array.isArray(o.material)?o.material:[o.material]; for(const m of ms){ if(seen.has(m.uuid))continue; seen.add(m.uuid); out.push({name:m.name,metal:m.metalness,rough:m.roughness,env:m.envMapIntensity,cc:m.clearcoat!==undefined?m.clearcoat:null,color:m.color?m.color.getHexString():null}); } } }); return out; },
  ready:()=>ready, envReady:()=>envReady,
  carBoxes(){ const out=[]; for(const b of bays){ if(b.car){ const bb=new THREE.Box3().setFromObject(b.car); out.push({bay:b.x, state:b.state, min:bb.min.toArray().map(v=>+v.toFixed(2)), max:bb.max.toArray().map(v=>+v.toFixed(2))}); } } return out; },
  pose(x,y,z,ry,rx){ camera.position.set(x,y,z); camera.rotation.set(rx||0,ry,0); },
  groundInfo(){ const mats=[]; scene.traverse(o=>{ if(o.isMesh && o.geometry && o.geometry.type==='PlaneGeometry' && o.geometry.parameters && o.geometry.parameters.width===220){ const m=o.material; mats.push({name:m.name||'std', hasMap:!!m.map, mapSrc:m.image?m.image.src||m.image.currentSrc||('w'+m.image.width):null, repeat:m.map?[m.map.repeat.x,m.map.repeat.y]:null, rough:m.roughness, metal:m.metalness, vis:o.visible}); } }); return mats; },
  weather(v){ raining=v; },
  serve(){ served+=1; },
  setClock(h){ gameClock=h*60; },
};

loadAssets().catch(e=>{ console.error('asset load failed', e && e.type, e && e.message); ready=true; if(!envReady) envReady=true; });
animate();
