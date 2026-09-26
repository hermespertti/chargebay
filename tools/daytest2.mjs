import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0]; if(p==='/')p='/index.html'; fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); r.end(d);});});
await new Promise(r=>srv.listen(8141,r));
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:720}});
const pg=await b.newPage(); const errs=[];
pg.on('pageerror',e=>errs.push(e.message.slice(0,160)));
await pg.goto('http://127.0.0.1:8141/',{waitUntil:'load',timeout:120000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
const S=e=>pg.evaluate(e);
await S("document.getElementById('start').style.display='none';");
// goals hud visible?
console.log('goals hud:', await S("!!document.getElementById('goallist') && document.getElementById('goallist').children.length>=3"));
console.log('state:', JSON.stringify(await S("window.__GAME.goalsState()")).slice(0,300));
// complete all goals, then end day -> card shows
await S("window.__GAME.goalsState().goals.forEach(g=>window.__GAME.completeGoal(g.id))");
await S("window.__GAME.endDayNow()");
await new Promise(r=>setTimeout(r,600));
console.log('card open:', await S("document.getElementById('daycard').style.display==='flex'"));
await pg.screenshot({path:'progress/artifacts/daycard.png'});
// click continue
await S("document.getElementById('dcBtn').click()");
await new Promise(r=>setTimeout(r,300));
console.log('card hidden:', await S("document.getElementById('daycard').style.display==='none'"));
console.log('day after:', await S("document.getElementById('day').textContent"), 'streak:', await S("window.__GAME.goalsState().streak"));
// persistence: reload with save, streak kept
await S("window.__GAME.save()");
console.log('ERRORS:', errs.length?errs.slice(0,4).join('|'):'none');
await b.close(); srv.close(); process.exit(0);
