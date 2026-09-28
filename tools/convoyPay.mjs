// convoy payout: dock 3 rigs with near-full batteries, wait for auto-complete, verify bonus
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.json':'application/json','.png':'image/png','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end('nf');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
srv.listen(8214, async ()=>{
 const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:800,height:500},protocolTimeout:180000});
 const pg=await b.newPage(); pg.setDefaultTimeout(150000);
 const errs=[]; pg.on('pageerror',e=>errs.push(String(e.message).slice(0,150)));
 const logs=[]; pg.on('console',m=>logs.push(String(m.text()).slice(0,140)));
 await pg.goto('http://localhost:8214/?notrack',{waitUntil:'load',timeout:60000});
 await pg.waitForFunction('window.__GAME && __GAME.ready()',{timeout:120000});
 await new Promise(r=>setTimeout(r,1500));
 await pg.evaluate("window.__GAME.bays().map((b,i)=>__GAME.clearBay(i))");
 await pg.evaluate("__GAME.event('convoy')");
 // wait for 3 rigs to roll in
 for(let i=0;i<14;i++){ await new Promise(r=>setTimeout(r,2500));
   const n=await pg.evaluate("__GAME.simRef.bays.filter(bb=>bb.car&&bb.car.userData.seg.id==='truck').length");
   console.log('t'+(i*2.5)+' rigs:', n); if(n>=3) break; }
 // near-full batteries so sessions finish in ~40s real
 await pg.evaluate("__GAME.simRef.bays.forEach(bb=>{ if(bb.car&&bb.car.userData.seg.id==='truck') bb.car.userData.battery=0.97; })");
 console.log('dock:', await pg.evaluate("[0,1,2].map(i=>__GAME.dock(i))"));
 console.log('cash0:', await pg.evaluate("__GAME.simRef.cash"), 'convId:', await pg.evaluate("__GAME.simRef.convoy&&__GAME.simRef.convoy.id"), 'stamps:', await pg.evaluate("__GAME.simRef.bays.map(b=>b.car&&b.car.userData.convoyId||0)"));
 // poll until all three complete
 for(let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,5000));
   const s=await pg.evaluate("({states:__GAME.simRef.bays.map(bb=>bb.state), conv:__GAME.wx().convoy, cash:__GAME.simRef.cash})");
   console.log('p'+(i*5), JSON.stringify(s));
   if(s.convoy===null) break; }
 const toasts=logs.filter(l=>/CONVOY|convoy|Rig|rig/.test(l));
 console.log('convoy toasts:', toasts.join(' | '));
 console.log('ERRORS:', errs.length? errs.join('\n'):'none');
 await b.close(); srv.close(); console.log('DONE');
});
