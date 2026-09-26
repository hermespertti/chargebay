// PROCEDURAL WEB AUDIO — extracted from main.js
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
export { SFX };
