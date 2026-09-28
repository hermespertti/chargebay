// og cover v2: HUD hidden, convoy rigs at chargers, dusk
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.json':'application/json','.png':'image/png','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end('nf');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
srv.listen(8218, async ()=>{
 const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:1200,height:630},protocolTimeout:240000});
 const pg=await b.newPage(); pg.setDefaultTimeout(200000);
 const errs=[]; pg.on('pageerror',e=>errs.push(String(e.message).slice(0,150)));
 await pg.goto('http://localhost:8218/?notrack',{waitUntil:'load',timeout:60000});
 await pg.waitForFunction('window.__GAME && __GAME.ready()',{timeout:150000});
 await new Promise(r=>setTimeout(r,1500));
 await pg.evaluate("document.getElementById('playbtn').click()");
 // clear bays, convoy in
 await pg.evaluate("__GAME.simRef.bays.forEach((b,i)=>__GAME.clearBay(i)); __GAME.event('convoy'); __GAME.simRef.bays.forEach(b=>{ if(!b.locked) b.nextArrT=performance.now()+600; });");
 // wait for rigs to arrive AND park at bays (z ~ -3), driving-in anim included
 for(let i=0;i<40;i++){ await new Promise(r=>setTimeout(r,2500));
   const s=await pg.evaluate("__GAME.simRef.bays.filter(b=>b.car&&b.car.userData.seg.id==='truck').map(b=>({z:+b.car.position.z.toFixed(1),st:b.state}))");
   console.log('trucks:', JSON.stringify(s));
   if(s.length>=3 && s.every(t=>t.z<0 && t.st!=='arriving')) break; }
 // near-full charge + dock so cables visibly connected to port
 console.log('dock:', await pg.evaluate("__GAME.simRef.bays.map((b,i)=>{ if(b.car&&b.car.userData.seg.id==='truck'){ b.car.userData.battery=0.96; return __GAME.dock(i); } return '-'; })"));
 await new Promise(r=>setTimeout(r,4000));
 // hide DOM UI only; in-world charge bars stay (they read as part of the game)
 await pg.evaluate("['hud','goals','coach','prompt','toast','touchui','crosshair','techflash'].forEach(id=>{const el=document.getElementById(id); if(el) el.style.display='none';});");
 console.log('wx:', JSON.stringify(await pg.evaluate("__GAME.wx()")));
 await new Promise(r=>setTimeout(r,2500));
 await pg.screenshot({path:'/home/lex/chargebay/og-cover-new.png'});
 console.log('ERRORS:', errs.length? errs.join('\n'):'none');
 await b.close(); srv.close(); console.log('DONE');
});
