import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
await new Promise(r=>srv.listen(8172,r));

const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:640,height:400}});
const pg=await b.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message.slice(0,140)));
await pg.evaluateOnNewDocument((w)=>{ localStorage.setItem('chargebay_coached_v1','1'); localStorage.removeItem('chargebay_save_v1'); const t0=performance.now(); const orig=performance.now.bind(performance); performance.now=()=>t0+(orig()-t0)*w; }, 2.5);
await pg.goto('http://127.0.0.1:8172/',{waitUntil:'load',timeout:120000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
await pg.evaluate("document.getElementById('start').style.display='none';");
const trail=[];
for(let i=0;i<20;i++){
  const st=await pg.evaluate(`(()=>{ const G=window.__GAME; return {info:G.info(), states:[0,1,2,3].map(i=>G.bayState(i).state)}; })()`);
  trail.push(st);
  await new Promise(r=>setTimeout(r,1500));
}
const last=trail[trail.length-1];
console.log('INFO last:', JSON.stringify(last.info));
console.log('states sample:', JSON.stringify(trail.slice(-4).map(t=>t.states)));
// no-warp control
console.log('ERRORS:', errs.length?[...new Set(errs)].slice(0,5).join(' | '):'none');
await b.close(); srv.close();