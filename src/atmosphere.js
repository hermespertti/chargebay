// ATMOSPHERE: HDRI env, procedural sky, horizon glow, fog, sun/rake/hemi lights,
// day-night cycle — extracted from main.js
import * as THREE from 'three';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';

export function createAtmosphere(renderer, scene, Q){
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
    if(bloomPass) bloomPass.strength = 0.08 + nightAmt*0.38;
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
  return { sky, horizonGlow, fog, sun, rake, hemi, nightFixtures,
    applyDaylight, collectNightLights, refreshSkyEnv,
    setBloom(bp){ bloomPass = bp; },
    get envReady(){ return envReady; }, get nightK(){ return nightK; }, get hdriBG(){ return hdriBG; } };
}
