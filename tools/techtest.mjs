import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png','.jpg':'image/jpeg','.wasm':'application/wasm'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0]; if(p==='/')p='/index.html'; fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); r.end(d);});});
await new Promise(r=>srv.listen(8142,r));
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:720}});
const pg=await b.newPage(); const errs=[];
pg.on('pageerror',e=>errs.push(e.message.slice(0,160)));
await pg.goto('http://127.0.0.1:8142/',{waitUntil:'load',timeout:120000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
const S=e=>pg.evaluate(e);
await S("document.getElementById('start').style.display='none';");
await S("window.__GAME.techbuy&&window.__GAME.techState()");
await S("if(document.getElementById('tech').style.display!=='flex') window.__GAME.techopen()");
await new Promise(r=>setTimeout(r,400));
console.log('locked cards:', await S("document.querySelectorAll('.tcard.locked').length"));
console.log('eff tags:', await S("document.querySelectorAll('.teff').length"));
console.log('techrep:', await S("document.getElementById('techrep').textContent"));
await pg.screenshot({path:'progress/artifacts/tech_menu.png'});
// give cash+rep, buy heater -> expect owned + flash
await S("(()=>{const g=window.__GAME; return g.techbuy('heater');})()");
await new Promise(r=>setTimeout(r,300));
console.log('heater owned:', await S("window.__GAME.techState().heater===true"));
await pg.screenshot({path:'progress/artifacts/tech_bought.png'});
console.log('ERRORS:', errs.length?errs.slice(0,4).join('|'):'none');
await b.close(); srv.close(); process.exit(0);
