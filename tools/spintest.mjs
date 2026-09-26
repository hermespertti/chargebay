import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0]; if(p==='/')p='/index.html'; fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;} r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'}); r.end(d);});});
await new Promise(r=>srv.listen(8144,r));
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:720}});
const pg=await b.newPage(); const errs=[];
pg.on('pageerror',e=>errs.push(e.message.slice(0,160)));
await pg.goto('http://127.0.0.1:8144/',{waitUntil:'load',timeout:120000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
const S=e=>pg.evaluate(e);
await S("document.getElementById('start').style.display='none';");
console.log('clear:', await S("window.__GAME.clearBay(0)"));
console.log('forceArr:', await S("window.__GAME.forceArr(0)"));
await new Promise(r=>setTimeout(r,500));
console.log('state0:', await S("window.__GAME.bays()[0].state"));
const s1=await S("window.__GAME.spokeInfo(0)");
await new Promise(r=>setTimeout(r,700));
const s2=await S("window.__GAME.spokeInfo(0)");
if(s1.e||s2.e){ console.log('ERR', JSON.stringify(s1), JSON.stringify(s2)); }
else{
  const rel=(s)=>{ const c=s.pos; return s.wheels[0].w.map((v,i)=>+(v-c[i]).toFixed(3)); };
  const r1=rel(s1), r2=rel(s2);
  const dmax=Math.max(...r1.map((v,i)=>Math.abs(v-r2[i])));
  console.log('rel spoke t1:', JSON.stringify(r1), 't2:', JSON.stringify(r2));
  console.log('spinning (rel spoke moved):', dmax>0.02, 'delta', dmax.toFixed(3));
}
console.log('ERRORS:', errs.length?errs.slice(0,4).join('|'):'none');
await b.close(); srv.close(); process.exit(0);
