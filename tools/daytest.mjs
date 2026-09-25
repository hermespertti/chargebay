// Day/night cycle visual + functional test
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0]; if(p==='/')p='/index.html'; fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); r.end(d);});});
await new Promise(r=>srv.listen(8035,r));
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:720}});
const pg=await b.newPage(); const errs=[];
pg.on('pageerror',e=>errs.push(e.message.slice(0,160)));
const logs=[];
pg.on('console',m=>{ const t=m.text(); if(t.includes('ferrari')||t.includes('STAGE')) logs.push(t.slice(0,80)); });
await pg.goto('http://127.0.0.1:8035/',{waitUntil:'load',timeout:120000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
const S=e=>pg.evaluate(e);
await S("document.getElementById('start').style.display='none'");
console.log('STAGE LOGS:', JSON.stringify(logs));
await S("window.__GAME.forceArr(0,true)"); await new Promise(r=>setTimeout(r,6000));
console.log('bay car state:', await S('JSON.stringify(window.__GAME.bays()[0])'));
// night capture: clock 23:30
await S("window.__GAME.setClock(23.5); window.__GAME.pose(2.5,1.7,10.5,-0.1,-0.04)");
await new Promise(r=>setTimeout(r,1200));
await pg.screenshot({path:'progress/artifacts/night.png'});
console.log('night info:', await S('JSON.stringify(window.__GAME.info?window.__GAME.info():null)'));
// noon capture
await S("window.__GAME.weather(0); window.__GAME.event('none'); window.__GAME.setClock(12.5)");
await new Promise(r=>setTimeout(r,1200));
await pg.screenshot({path:'progress/artifacts/noon.png'});
// dusk capture (classic look)
await S("window.__GAME.setClock(18.7)");
await new Promise(r=>setTimeout(r,1200));
await pg.screenshot({path:'progress/artifacts/dusk2x.png'});
console.log('ERRORS:', errs.length? errs.join(' | ') : 'none');
await b.close(); srv.close(); process.exit(0);
