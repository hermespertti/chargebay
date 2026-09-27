// playrun: full economic playthrough bot — serves cars, shops tech/upgrades/bays across days
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.json':'application/json','.png':'image/png','.hdr':'image/vnd.radiance-hdr'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
await new Promise(r=>srv.listen(8172,r));

const WARP = Number(process.argv[3]||2.5);
const DAYS = Number(process.argv[2]||4);

const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:640,height:400},protocolTimeout:240000});
const pg=await b.newPage(); const errs=[];
pg.on('pageerror',e=>errs.push(String(e.message).slice(0,160)));
await pg.evaluateOnNewDocument((w)=>{ localStorage.setItem('chargebay_coached_v1','1'); localStorage.removeItem('chargebay_save_v1'); const t0=performance.now(); const orig=performance.now.bind(performance); performance.now=()=>t0+(orig()-t0)*w; }, WARP);
await pg.goto('http://localhost:8172/',{waitUntil:'load',timeout:120000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
await pg.evaluate("document.getElementById('start').style.display='none'; window.__GAME.setCash(500);");
console.log('PLAYING', DAYS, 'days at warp', WARP);

const log=[];
const t0=Date.now();
while(true){
  const st=await pg.evaluate(`(()=>{
    const G=window.__GAME;
    // dock everything parked
    for(let i=0;i<4;i++){ const s=G.bayState(i); if(s.state==='parked') G.dock(i); }
    // shop: priority order — buffer, heater, inverter, ads, upgrade cheapest-traffic bay, unlock bay
    const m=G.money();
    if(!m.bufferOwned && m.cash>=600) { G.keyB? G.keyB() : null; }
    return G.money();
  })()`);
  // purchases through real shop calls
  const buys=await pg.evaluate(`(()=>{
    const G=window.__GAME; const out=[]; const m=G.money();
    // tech via techbuy (needs rep gate handled inside)
    for(const id of ['heater','inverter','ads']){ if(m.cash>=500){ const r=G.techbuy(id); if(r===true||r==='true'){out.push(id); m.cash-= ({heater:500,inverter:900,ads:700})[id];} } }
    if(!m.bufferOwned && m.cash>=600){ G.bufferbuy? G.bufferbuy() : null; }
    // upgrade bay 0 then bay 1 when rich
    const ts=[{cost:800},{cost:2000}];
    for(const i of [0,1,2]){ for(const up of ts){ if(m.cash>= (800+ i*0)){ const r=G.upBay(i); if(r&&r.tier>0){ out.push('up'+i+'-t'+r.tier);} } } }
    // unlock bay 3
    if(m.cash>=1200){ const r=G.unlockBay(3); if(r==='ok') out.push('unlock3'); }
    return out;
  })()`);
  if(buys && buys.length) log.push('BUY @'+Math.round((Date.now()-t0)/1000)+'s: '+buys.join(','));

  const money=await pg.evaluate('window.__GAME.money()');
  if(money.day>DAYS) break;
  if(Date.now()-t0>1500000){ console.log('wall cap hit'); break; }

  // close day card if open (natural roll handled by game)
  await pg.evaluate(`(()=>{ if(window.__GAME._cardOpen) { document.getElementById('dcBtn') && document.getElementById('dcBtn').click(); } })()`);
  if(buys&&buys.length) await pg.evaluate('(()=>{})()');
  await new Promise(r=>setTimeout(r,1200));
}
const final=await pg.evaluate(`({money:window.__GAME.money(), econ:window.__GAME.econ(), rep:window.__GAME.repGet(), hs:window.__GAME.hourStats(), tech:window.__GAME.techState(), mk:window.__GAME.markup?window.__GAME.markup():null})`);
console.log('FINAL:', JSON.stringify(final));
console.log('LOG:', JSON.stringify(log.slice(-20)));
console.log('ERRORS:', errs.length? errs.slice(0,5).join(' | ') : 'none');
await b.close(); srv.close(); console.log('DONE');
