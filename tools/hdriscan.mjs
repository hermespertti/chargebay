import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT='/home/lex/chargebay';
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.jpg':'image/jpeg','.png':'image/png','.hdr':'image/vnd.radiance','.json':'application/json'};
http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u==='/')u='/index.html';const f=path.join(ROOT,u);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});}).listen(8019,'127.0.0.1');
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:720}});
const pg=await b.newPage();
for(const hdri of ['assets/hdri/venice_sunset.hdr','assets/hdri/spruit_sunrise.hdr','assets/hdri/kloppenheim_06.hdr']){
  const tag=hdri.split('/').pop().replace('.hdr','');
  await pg.goto('http://127.0.0.1:8019/',{waitUntil:'load',timeout:60000});
  await pg.evaluate((h)=>{localStorage.setItem('cb_hdri',h);localStorage.setItem('cb_hdri_u','0');localStorage.setItem('cb_hdri_v','0');},hdri);
  await pg.reload({waitUntil:'load'});
  await pg.waitForFunction('window.__GAME && window.__GAME.ready()',{timeout:90000}).catch(()=>{});
  await pg.evaluate('(()=>{const s=document.getElementById("start");if(s)s.style.display="none";window.__GAME.pose(0,1.7,9,0,-0.05);window.__GAME.weather(0.7);})()');
  await new Promise(r=>setTimeout(r,5000));
  await pg.screenshot({path:'progress/artifacts/hdri_'+tag+'.png'});
  console.log('shot '+tag);
}
await b.close(); process.exit(0);
