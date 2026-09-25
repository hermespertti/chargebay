import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0]; if(p==='/')p='/index.html'; fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); r.end(d);});});
await new Promise(r=>srv.listen(8117,r));
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:720}});
const pg=await b.newPage(); const errs=[];
pg.on('pageerror',e=>errs.push(e.message.slice(0,140)));
await pg.goto('http://127.0.0.1:8117/',{waitUntil:'load',timeout:120000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
const S=e=>pg.evaluate(e);
await S("document.getElementById('start').style.display='none'; window.__GAME.weather(0);");
// wait for arrival
for(let i=0;i<90;i++){ const st=await S('window.__GAME.bayState(0).state'); if(st==='parked') break; await new Promise(r=>setTimeout(r,1000)); }
console.log('bay0:', await S('window.__GAME.bayState(0)'));
// grab + dock via test hooks
console.log('grab:', await S('window.__GAME.grab(0)'));
console.log('dock:', await S('window.__GAME.dock(0)'));
await new Promise(r=>setTimeout(r,1500));
console.log('state:', await S('window.__GAME.bayState(0)'));
// aim at the port side to inspect plug orientation
await S('window.__GAME.aimPort(0)');
await new Promise(r=>setTimeout(r,2400));
await pg.screenshot({path:'progress/artifacts/docked_final.png'});
console.log('ERRORS:', errs.length?errs.slice(0,3).join('|'):'none');
await b.close(); srv.close(); process.exit(0);
