import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT='/home/lex/chargebay';
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.txt':'text/plain'};
const server=http.createServer((req,res)=>{let p=req.url.split('?')[0]; if(p==='/')p='/index.html'; const f=path.join(ROOT,p); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end('nf');return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d); });});
await new Promise(r=>server.listen(8019,r));
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:412,height:915,hasTouch:true,isMobile:true,userAgent:'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'}});
const pg=await b.newPage();
const errs=[];
pg.on('console',m=>{const t=m.text(); if(/error|fail|undefined/i.test(t)&&!/favicon/.test(t))errs.push(t.slice(0,180));});
pg.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,180)));
await pg.goto('http://127.0.0.1:8019/',{waitUntil:'load',timeout:90000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:120000}).catch(()=>errs.push('READY TIMEOUT'));
console.log('READY:',await pg.evaluate('window.__GAME&&window.__GAME.ready()'));
console.log('TOUCHUI before tap:',await pg.evaluate('getComputedStyle(document.getElementById("touchui")).display'));
// tap the play button
await pg.tap('#playbtn').catch(e=>errs.push('tap fail '+e.message.slice(0,80)));
await new Promise(r=>setTimeout(r,500));
console.log('TOUCHUI after tap:',await pg.evaluate('getComputedStyle(document.getElementById("touchui")).display'));
console.log('START hidden:',await pg.evaluate('getComputedStyle(document.getElementById("start")).display'));
// simulate stick drag forward
const jb=await pg.evaluate('(()=>{const r=document.getElementById("joy").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
await pg.touchscreen.touchStart(jb.x,jb.y);
await pg.touchscreen.touchMove(jb.x,jb.y-40);
// right-side look drag
await pg.touchscreen.touchStart(300,400);
await pg.touchscreen.touchMove(340,420);
await pg.touchscreen.touchEnd();
await pg.touchscreen.touchMove(jb.x,jb.y-48);
const p0=await pg.evaluate('window.__GAME? [cameraX=0,0]:0') ; // noop
const pos1=await pg.evaluate('(()=>{const g=window.__GAME; return g.camPos? g.camPos() : (window.__camPos?window.__camPos():null);})()').catch(()=>null);
// tap E
await pg.tap('#tE').catch(e=>errs.push('tapE fail'));
await new Promise(r=>setTimeout(r,400));
console.log('POS after stick:',await pg.evaluate('window.__GAME&&window.__GAME.camPos? window.__GAME.camPos() : "n/a"'));
await pg.screenshot({path:ROOT+'/progress/artifacts/touch.png'});
console.log('ERRORS:',errs.length? errs.join(' | '):'none');
await b.close();server.close();process.exit(0);
