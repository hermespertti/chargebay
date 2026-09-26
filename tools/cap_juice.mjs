import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0]; if(p==='/')p='/index.html'; fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); r.end(d);});});
await new Promise(r=>srv.listen(8145,r));
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:720}});
const pg=await b.newPage(); const errs=[];
pg.on('pageerror',e=>errs.push(e.message.slice(0,160)));
await pg.goto('http://127.0.0.1:8145/',{waitUntil:'load',timeout:120000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
const S=e=>pg.evaluate(e);
await S("document.getElementById('start').style.display='none'; window.__GAME.weather(0);");
await S("window.__GAME.clearBay(0); window.__GAME.forceArr(0);");
await new Promise(r=>setTimeout(r,1200));
// frame the arriving car from rear 3/4 so brake lights face camera
await S("(()=>{const g=window.__GAME;const p=g.carPos(0);g.pose(p.x+4.2,0.9,p.z+5.5,0,0);g.lookAt(p.x,0.5,p.z,7.0);})()");
await new Promise(r=>setTimeout(r,1400));
await pg.screenshot({path:'progress/artifacts/juice_arrive.png'});
// depart phase: trigger and catch reverse lights + steer
await S("(()=>{const g=window.__GAME; return g.bays()[0].state==='arriving'?'still-arriving':'done';})()");
await S("window.__GAME.finishArr(0)");
await new Promise(r=>setTimeout(r,300));
await S("window.__GAME.kickBay(0)");   // force departing
await new Promise(r=>setTimeout(r,1200));
await S("(()=>{const g=window.__GAME;const p=g.carPos(0);g.pose(p.x+3.0,0.8,p.z+4.5,0,0);g.lookAt(p.x,0.5,p.z,5.5);})()");
await new Promise(r=>setTimeout(r,1200));
await pg.screenshot({path:'progress/artifacts/juice_depart.png'});
console.log('ERRORS:', errs.length?errs.slice(0,4).join('|'):'none');
await b.close(); srv.close(); process.exit(0);
