// convoy+snow probe: force events, verify rig spawns, snow ramp, payouts
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.json':'application/json','.png':'image/png','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end('nf');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
srv.listen(8211, async ()=>{
 const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:800,height:500},protocolTimeout:180000});
 const pg=await b.newPage(); pg.setDefaultTimeout(150000);
 const errs=[]; pg.on('pageerror',e=>errs.push(String(e.message).slice(0,150)));
 await pg.goto('http://localhost:8211/?notrack',{waitUntil:'load',timeout:60000});
 await pg.waitForFunction('window.__GAME && __GAME.ready()',{timeout:120000});
 await new Promise(r=>setTimeout(r,1500));
 // snow
 console.log('snow:', await pg.evaluate("__GAME.event('snow')"));
 await new Promise(r=>setTimeout(r,9000));
 console.log('wx after snow:', JSON.stringify(await pg.evaluate("__GAME.wx()")));
 await pg.screenshot({path:'/home/lex/chargebay/progress/artifacts/snow_lot.png'});
 // convoy
 console.log('convoy:', await pg.evaluate("__GAME.event('convoy')"));
 // force empty bays to spawn now: nudge nextArrT
 await pg.evaluate("window.__GAME.bays().forEach(b=>{ if(!b.locked && b.state==='empty') b.nextArrT=performance.now()+500; })");
 await new Promise(r=>setTimeout(r,10000));
 console.log('convoy state:', JSON.stringify(await pg.evaluate("__GAME.wx().convoy")));
 console.log('bay segs:', await pg.evaluate("window.__GAME.bays().map(b=>b.car&&b.car.userData.seg? b.car.userData.seg.id:'-')"));
 await pg.screenshot({path:'/home/lex/chargebay/progress/artifacts/convoy_lot.png'});
 // serve one truck via dock flow, then check payout path runs without error
 console.log('dock b0:', await pg.evaluate("typeof __GAME.dock==='function'? (__GAME.bays()[0].car? __GAME.dock(0):'nocar') : 'nodockhook'"));
 console.log('ERRORS:', errs.length? errs.join('\n'):'none');
 await b.close(); srv.close(); console.log('DONE');
});