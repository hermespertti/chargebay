// convoy rig spawn verification: free bays, force convoy, confirm truck segment spawns
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.json':'application/json','.png':'image/png','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end('nf');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
srv.listen(8212, async ()=>{
 const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:800,height:500},protocolTimeout:180000});
 const pg=await b.newPage(); pg.setDefaultTimeout(150000);
 const errs=[]; pg.on('pageerror',e=>errs.push(String(e.message).slice(0,150)));
 await pg.goto('http://localhost:8212/?notrack',{waitUntil:'load',timeout:60000});
 await pg.waitForFunction('window.__GAME && __GAME.ready()',{timeout:120000});
 await new Promise(r=>setTimeout(r,1500));
 // clear all bays (remove boot cars) so convoy has slots — via live sim
 console.log('cleared:', await pg.evaluate("window.__GAME.bays().map((b,i)=>__GAME.clearBay(i))"));
 console.log('cleared, segs:', await pg.evaluate("window.__GAME.bays().map(b=>b.car?b.car.userData.seg.id:'-')"));
 console.log('convoy:', await pg.evaluate("__GAME.event('convoy')"));
 // give snow a moment to ramp too
 await pg.evaluate("__GAME.event('snow')");
 for(let i=0;i<12;i++){
   await new Promise(r=>setTimeout(r,2500));
   const s=await pg.evaluate("({segs:__GAME.simRef.bays.map(b=>b.car&&b.car.userData.seg?b.car.userData.seg.id:'-'), convoy:__GAME.wx().convoy, snowK:__GAME.wx().snowK})");
   console.log('t'+(i*2.5)+'s', JSON.stringify(s));
   if(s.convoy===null && s.segs.includes('truck')) break;
 }
 await pg.screenshot({path:'/home/lex/chargebay/progress/artifacts/convoy_rigs.png'});
 console.log('ERRORS:', errs.length? errs.join('\n'):'none');
 await b.close(); srv.close(); console.log('DONE');
});
