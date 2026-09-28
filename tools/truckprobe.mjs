// truck segment probe: force real truck spawn, measure port/cable, report
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.json':'application/json','.png':'image/png','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end('nf');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
srv.listen(8199, async ()=>{
 const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:640,height:400},protocolTimeout:120000});
 const pg=await b.newPage(); pg.setDefaultTimeout(100000);
 const errs=[]; pg.on('pageerror',e=>errs.push(String(e.message).slice(0,150)));
 await pg.goto('http://localhost:8199/?notrack',{waitUntil:'load',timeout:60000});
 await pg.waitForFunction('window.__GAME && __GAME.ready()',{timeout:90000});
 await new Promise(r=>setTimeout(r,1500));
 console.log('protos:', await pg.evaluate("Object.keys(__GAME.segPools? __GAME.segPools() : {})") );
 for(let i=0;i<4;i++){
   const res=await pg.evaluate(`(async()=>{ const b=__GAME.bays()[${i}]; if(b.state!=='empty') return 'busy'; const r=__GAME.forceSeg(${i},'truck',0); await new Promise(r=>setTimeout(r,600)); return {r:r, port:__GAME.portPos(${i}), seg:(function(){const c=__GAME.bays()[${i}].car; return c&&c.userData&&c.userData.seg? c.userData.seg.id:null;})(), scale:(function(){const c=__GAME.bays()[${i}].car; return c? [+c.scale.x.toFixed(2),+c.scale.y.toFixed(2),+c.scale.z.toFixed(2)] : null;})()}; })()`);
   console.log('bay'+i, JSON.stringify(res));
 }
 await pg.screenshot({path:'/home/lex/chargebay/progress/artifacts/truck_spawn.png'});
 console.log('ERRORS:', errs.length? errs.join('\n'):'none');
 await b.close(); srv.close(); console.log('DONE');
});
