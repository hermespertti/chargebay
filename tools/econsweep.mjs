import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
await new Promise(r=>srv.listen(8171,r));

// time-warp: patch performance.now to run timers faster (render stays smooth; dt clamps handle physics)
const WARP = Number(process.argv[3]||2.5);
const MARKUPS = (process.argv[2]||'1.5,1.9,2.4,3.0').split(',').map(Number);

async function runMarkup(pg, mk, ms){
  await pg.evaluate(`window.__GAME.setMarkup(${mk})`);
  const t0=Date.now(); const snap=[];
  while(Date.now()-t0 < ms){
    const st=await pg.evaluate(`(()=>{
      const G=window.__GAME; const bs=G.bays();
      for(let i=0;i<bs.length;i++){ const s=G.bayState(i); if(s.state==='parked') G.dock(i); }
      if(G.cardOpen()) { /* day card open: dismiss via click equivalent */ const c=document.getElementById('daycard'); if(c) c.style.display='none'; }
      return {money:G.money(), econ:G.econ(), info:G.info(), rep:G.repGet(), hs:G.hourStats(), mk:G.markup()};
    })()`);
    snap.push(st);
    await new Promise(r=>setTimeout(r,1200));
  }
  const hs=await pg.evaluate("window.__GAME.hourStats()");
  const money=await pg.evaluate("window.__GAME.money()");
  const mk=await pg.evaluate("window.__GAME.markup()");
  return {markup:mk, hourStats:hs, money};
}

const results=[];
for(const mk of MARKUPS){
  const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:640,height:400}});
  const pg=await b.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message.slice(0,120)));
  await pg.evaluateOnNewDocument((w)=>{ localStorage.setItem('chargebay_coached_v1','1'); localStorage.removeItem('chargebay_save_v1'); const t0=performance.now(); const orig=performance.now.bind(performance); performance.now=()=>t0+(orig()-t0)*w; }, WARP);
  await pg.goto('http://127.0.0.1:8171/',{waitUntil:'load',timeout:120000});
  await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
  await pg.evaluate("document.getElementById('start').style.display='none'; window.__GAME.setCash(500);");
  const r=await runMarkup(pg, mk, 240000);   // 4 real minutes per markup (~ full evening peak at 4x warp)
  r.errors=errs.slice(0,3);
  results.push(r);
  console.log('markup', mk, '->', JSON.stringify({served:Object.values(r.hourStats.served).reduce((a,b)=>a+b,0), arrivals:Object.values(r.hourStats.arrivals).reduce((a,b)=>a+b,0), kicks:Object.values(r.hourStats.kicks).reduce((a,b)=>a+b,0), dayRev:r.money.dayRev, dayCost:r.money.dayCost, cash:r.money.cash}));
  await b.close();
}
fs.writeFileSync('/tmp/econ_sweep.json', JSON.stringify(results,null,1));
console.log('DONE');
srv.close();