// CANVAS TEXTURE GENERATORS — extracted from main.js
import * as THREE from 'three';

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

// ---------------- contact shadows ----------------
function shadowTex(){
  const c=document.createElement('canvas'); c.width=c.height=256;
  const g=c.getContext('2d');
  const grd=g.createRadialGradient(128,128,10,128,128,120);
  grd.addColorStop(0,'rgba(0,0,0,0.55)'); grd.addColorStop(0.55,'rgba(0,0,0,0.30)'); grd.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle=grd; g.fillRect(0,0,256,256);
  const t=new THREE.CanvasTexture(c); return t;
}

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

export { asphaltTextures, asphaltNormal, puddleMaskStatic, blobTex, streakTexture, facadeTex, barPctTex, shadowTex, carReflTexRed };
