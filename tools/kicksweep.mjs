// Passive kick-verification sweep: NEVER dock — every driver should time out and walk off angry.
// warp 10 => sedan patience 95-150 game-s = 9.5-15 real-s per kick cycle.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
await new Promise(r=>srv.listen(8172,r));

const WARP = Number(process.argv[2]||10);
const WALL_MS = Number(process.argv[3]||90000);

const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:640,height:400}});
const pg=await b.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,160)));
await pg.evaluateOnNewDocument((w)=>{ localStorage.setItem('chargebay_coached_v1','1'); localStorage.removeItem('chargebay_save_v1'); const t0=performance.now(); const orig=performance.now.bind(performance); performance.now=()=>t0+(orig()-t0)*w; }, WARP);
await pg.goto('http://127.0.0.1:8172/',{waitUntil:'load',timeout:120000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
await pg.evaluate("document.getElementById('start').style.display='none';");

// per-bay arrival ledger + kick log collected page-side
await pg.evaluate(`window.__KL={arrivals:0,kicks:0,kickPats:[],kickBatts:[],departOK:0,lastS:{}};
  const G=window.__GAME;
  window.__hookId=setInterval(()=>{
    for(let i=0;i<4;i++){
      const s=G.bayState(i);
      if(s.state==='parked'&&window.__KL.lastS[i]!=='parked'){ window.__KL.arrivals++; }
      if(s.state==='departing'&&window.__KL.lastS[i]==='parked'){ window.__KL.kicks++;
        if(window.__KL.kickPats.length<12){ window.__KL.kickPats.push(s.pat); window.__KL.kickBatts.push(s.batt); } }
      if(s.state==='empty'&&window.__KL.lastS[i]==='departing') window.__KL.departOK++;
      window.__KL.lastS[i]=s.state;
    }
  },200);`);

const t0=Date.now();
let snap=[];
while(Date.now()-t0 < WALL_MS){
  await new Promise(r=>setTimeout(r,10000));
  const k=await pg.evaluate('JSON.parse(JSON.stringify(window.__KL))');
  const rep=await pg.evaluate('window.__GAME.repGet()');
  snap.push({t:Math.round((Date.now()-t0)/1000), arrivals:k.arrivals, kicks:k.kicks, departOK:k.departOK, rep});
  console.log('t+'+Math.round((Date.now()-t0)/1000)+'s kicks:'+k.kicks+'/'+k.arrivals+' departOK:'+k.departOK+' rep:'+rep.toFixed(1));
}
const fin=await pg.evaluate(`({kl:JSON.parse(JSON.stringify(window.__KL)), rep:window.__GAME.repGet(),
  kickedHourly:window.__GAME.wx?window.__GAME.wx():null, money:window.__GAME.money()})`);
console.log('FINAL', JSON.stringify({arrivals:fin.kl.arrivals, kicks:fin.kl.kicks, departOK:fin.kl.departOK, rep:+fin.rep.toFixed(1),
  kickPats:fin.kl.kickPats.map(v=>Math.round(v)), kickBatts:fin.kl.kickBatts.map(v=>+v.toFixed(2)),
  money:fin.money}));
fs.writeFileSync('/tmp/kick_sweep.json', JSON.stringify({snap, fin, errs:[...new Set(errs)]},null,1));
console.log('ERRORS:', errs.length?[...new Set(errs)].slice(0,4).join(' | '):'none');
await b.close(); srv.close();
console.log('DONE');
