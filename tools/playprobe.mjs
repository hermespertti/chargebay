// playprobe: play a real session like a human (real keys/mouse), log prompts/timings/screens
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.json':'application/json','.png':'image/png','.css':'text/css','.hdr':'image/vnd.radiance-hdr'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
await new Promise(r=>srv.listen(8123,r));

const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:720},protocolTimeout:240000});
const pg=await b.newPage(); pg.setDefaultTimeout(180000);
let errs=0; pg.on('pageerror',e=>{errs++;console.log('PAGEERR',String(e.message).slice(0,160));});
const T0=Date.now();
const stamp=()=>((Date.now()-T0)/1000).toFixed(1)+'s';
const shot=async n=>{ await pg.screenshot({path:'/home/lex/chargebay/progress/artifacts/play_'+n+'.png'}); console.log('SHOT', n); };

await pg.goto('http://localhost:8123/?notrack',{waitUntil:'load',timeout:120000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
console.log('READY at', stamp());
await shot('00_start');
// what does the start overlay tell us?
const startText=await pg.evaluate("document.getElementById('start').innerText");
console.log('START OVERLAY:\n'+startText.slice(0,700));

// click to engage pointer lock like a player
await pg.mouse.click(640,360);
await new Promise(r=>setTimeout(r,1500));
const locked1=await pg.evaluate("__GAME ? true : false");
console.log('locked-ish:', locked1, stamp());
await shot('01_spawn_view');
console.log('PROMPT:', await pg.evaluate("document.getElementById('prompt')?document.getElementById('prompt').textContent:'(none)'"));
console.log('HUD:', await pg.evaluate("['cash','load','rep','clock','wx'].map(i=>{const e=document.getElementById(i);return i+'='+(e?e.textContent '?':'?')}).join(' ').slice(0,300)").catch(()=>'?'));
const hud=await pg.evaluate("(()=>{const o={};for(const id of ['cash','rep','clock','wx','load','sellp','streak']){const e=document.getElementById(id);if(e)o[id]=e.textContent;}return o;})()");
console.log('HUD:', JSON.stringify(hud));
console.log('POS:', JSON.stringify(await pg.evaluate("__GAME.camPos()")));
console.log('BAYS:', JSON.stringify(await pg.evaluate("__GAME.bays()")));

// where am I vs the bays? print target hints
console.log('TARGET:', await pg.evaluate("(()=>{const t=window.PLAYER_TARGET; return t?JSON.stringify(t):'n/a';})()"));
console.log('ERRORS:', errs||'none');
await b.close(); srv.close(); console.log('DONE', stamp());
