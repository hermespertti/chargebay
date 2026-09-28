import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.json':'application/json','.png':'image/png','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end('nf');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
srv.listen(8219, async ()=>{
 const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:1200,height:630},protocolTimeout:240000});
 const pg=await b.newPage(); pg.setDefaultTimeout(200000);
 const errs=[]; pg.on('pageerror',e=>errs.push(String(e.message).slice(0,150)));
 await pg.goto('http://localhost:8219/?notrack',{waitUntil:'load',timeout:60000});
 await pg.waitForFunction('window.__GAME && __GAME.ready()',{timeout:150000});
 await new Promise(r=>setTimeout(r,1500));
 await pg.evaluate("document.getElementById('playbtn').click()");
 await pg.evaluate("__GAME.simRef.bays.forEach((b,i)=>__GAME.clearBay(i)); __GAME.event('convoy'); __GAME.simRef.bays.forEach(b=>{ if(!b.locked) b.nextArrT=performance.now()+600; });");
 for(let i=0;i<16;i++){ await new Promise(r=>setTimeout(r,2500));
   const n=await pg.evaluate("__GAME.simRef.bays.filter(b=>b.car&&b.car.userData.seg.id==='truck').length");
   console.log('rigs:',n); if(n>=3) break; }
 console.log('cam:', JSON.stringify(await pg.evaluate("__GAME.camPos()")));
 console.log('cars:', JSON.stringify(await pg.evaluate("__GAME.simRef.bays.map(b=>b.car?{seg:b.car.userData.seg.id,pos:[+b.car.position.x.toFixed(1),+b.car.position.y.toFixed(1),+b.car.position.z.toFixed(1)],vis:b.car.visible}:null)")));
 await b.close(); srv.close(); console.log('DONE');
});
