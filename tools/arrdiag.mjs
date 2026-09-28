// arrival scheduler diagnostic: poll raw bay fields + clock + toast feed
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.json':'application/json','.png':'image/png','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end('nf');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
srv.listen(8213, async ()=>{
 const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:800,height:500},protocolTimeout:180000});
 const pg=await b.newPage(); pg.setDefaultTimeout(150000);
 const errs=[]; pg.on('pageerror',e=>errs.push(String(e.message).slice(0,150)));
 const logs=[]; pg.on('console',m=>logs.push(String(m.text()).slice(0,120)));
 await pg.goto('http://localhost:8213/?notrack',{waitUntil:'load',timeout:60000});
 await pg.waitForFunction('window.__GAME && __GAME.ready()',{timeout:120000});
 await new Promise(r=>setTimeout(r,12000));
 console.log('after 12s no clear: segs=', await pg.evaluate("window.__GAME.bays().map(b=>b.car&&b.car.userData&&b.car.userData.seg?b.car.userData.seg.id:'-')"));
 console.log('states=', await pg.evaluate("window.__GAME.bays().map(b=>b.state)"));
 console.log('arrivedTotal=', await pg.evaluate("sim? sim.arrivedTotal : (window.__GAME.info? JSON.stringify(__GAME.info()):'?')"));
 console.log('clock=', await pg.evaluate("window.__GAME.info().clock"));
 console.log('wx=', JSON.stringify(await pg.evaluate("__GAME.wx()")));
 // warp to speed arrivals then poll for trucks
 await pg.evaluate("window.__GAME.warp && __GAME.warp(5); __GAME.event('convoy');");
 for(let i=0;i<8;i++){
   await new Promise(r=>setTimeout(r,3000));
   console.log('t'+i, JSON.stringify(await pg.evaluate("({segs:window.__GAME.bays().map(bb=>bb.car&&bb.car.userData&&bb.car.userData.seg?bb.car.userData.seg.id:'-'), conv:__GAME.wx().convoy})")));
 }
 console.log('toasts tail:', logs.slice(-8).join(' | '));
 console.log('ERRORS:', errs.length? errs.join('\n'):'none');
 await b.close(); srv.close(); console.log('DONE');
});
