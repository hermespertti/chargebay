import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0]; if(p==='/')p='/index.html'; fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); r.end(d);});});
await new Promise(r=>srv.listen(8139,r));
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:720}});
const pg=await b.newPage(); const errs=[];
pg.on('pageerror',e=>errs.push(e.message.slice(0,140)));
await pg.goto('http://127.0.0.1:8139/',{waitUntil:'load',timeout:120000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
const S=e=>pg.evaluate(e);
await S("document.getElementById('start').style.display='none'; window.__GAME.weather(0);");
await S("if(window.__GAME.setQuality) window.__GAME.setQuality('high');");
console.log('force:', await S('window.__GAME.forceOrig(0,0)'));
await new Promise(r=>setTimeout(r,1500));
// close-up wheel
await S("(()=>{const g=window.__GAME;const p=g.carPos(0);g.pose(p.x-2.6,0.5,p.z+2.0,0,0);g.lookAt(p.x+1.45,0.4,p.z+0.85,3.3);})()");
await new Promise(r=>setTimeout(r,2200));
await pg.screenshot({path:'progress/artifacts/orig_wheel.png'});
// close-up glass/port side
await S("(()=>{const g=window.__GAME;const p=g.carPos(0);g.pose(p.x-3.2,0.8,p.z-0.4,0,0);g.lookAt(p.x-0.6,0.7,p.z-0.88,3.3);})()");
await new Promise(r=>setTimeout(r,2200));
await pg.screenshot({path:'progress/artifacts/orig_glass.png'});
console.log('ERRORS:', errs.length?errs.slice(0,3).join('|'):'none');
await b.close(); srv.close(); process.exit(0);
