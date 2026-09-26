import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
await new Promise(r=>srv.listen(8171,r));

// time-warp via patched performance.now (timers + game clock accelerate together)
const WARP = Number(process.argv[3]||2.5);
const MARKUPS = (process.argv[2]||'1.5,1.9,2.4,3.0').split(',').map(Number);
const MINUTES = Number(process.argv[4]||240);   // game-minutes budget per markup handled via wall loop below

async function runMarkup(pg, markupVal, wallMs){
  await pg.evaluate(`window.__GAME.setMarkup(${markupVal})`);
  const t0=Date.now();
  while(Date.now()-t0 < wallMs){
    await pg.evaluate(`(()=>{
      const G=window.__GAME;
      for(let i=0;i<4;i++){ const s=G.bayState(i); if(s.state==='parked') G.dock(i); }
      // let days roll naturally at 24:00 (endDay resets stats); never spam endDayNow
    })()`);
    await new Promise(r=>setTimeout(r,900));
  }
  return await pg.evaluate(`({
    money:window.__GAME.money(), econ:window.__GAME.econ(), rep:window.__GAME.repGet(),
    hs:window.__GAME.hourStats(), mk:window.__GAME.markup(), info:window.__GAME.info()
  })`);
}

const results=[];
for(const markupVal of MARKUPS){
  const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:640,height:400}});
  const pg=await b.newPage();
  const errs=[]; pg.on('pageerror',e=>errs.push(e.message.slice(0,120)));
  await pg.evaluateOnNewDocument((w)=>{ localStorage.setItem('chargebay_coached_v1','1'); localStorage.removeItem('chargebay_save_v1'); const t0=performance.now(); const orig=performance.now.bind(performance); performance.now=()=>t0+(orig()-t0)*w; }, WARP);
  await pg.goto('http://127.0.0.1:8171/',{waitUntil:'load',timeout:120000});
  await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
  await pg.evaluate("document.getElementById('start').style.display='none'; window.__GAME.setCash(500);");
  const r=await runMarkup(pg, markupVal, 150000);   // 2.5 real minutes ≈ 6+ game hours at warp
  r.errors=errs.slice(0,3);
  const sum=o=>Object.values(o||{}).reduce((a,b)=>a+b,0);
  r.totals={served:sum(r.hs.served), arrivals:sum(r.hs.arrivals), kicks:sum(r.hs.kicks)};
  results.push(r);
  console.log('markup', markupVal, '->', JSON.stringify({sell:r.mk.sell, demand:r.mk.demand, served:r.totals.served, arrivals:r.totals.arrivals, kicks:r.totals.kicks, dayRev:r.money.dayRev, dayCost:r.money.dayCost, cash:r.money.cash, rep:r.rep}));
  await b.close();
}
fs.writeFileSync('/tmp/econ_sweep.json', JSON.stringify(results,null,1));
console.log('DONE');
srv.close();
