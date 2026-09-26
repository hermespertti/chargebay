// WORLD PROP BUILDERS: canopy + LEDs + solar, price sign, city backdrop,
// curbs/planters/trees, guard rail + road — extracted from main.js
import * as THREE from 'three';
import { facadeTex } from './textures.js';

export function createWorld(){
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

  const canopy = buildCanopy();
  const sign = buildSign();
  const backdropG = backdrop();
  const curbs = curbsTrees();
  return { canopy: canopy.g, canopyLamps: canopy.lamps, sign, backdrop: backdropG, curbs, guard };
}
