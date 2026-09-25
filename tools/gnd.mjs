// probe ground material state at runtime
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
const ROOT='/home/lex/chargebay';
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.jpg':'image/jpeg','.png':'image/png','.hdr':'image/vnd.radiance','.json':'application/json'};
const srv=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]); if(u==='/') u='/index.html'; const f=path.join(ROOT,u);fs.readFile(f,(e,d)=>{if(e){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d);});});
srv.listen(8013,'127.0.0.1',async()=>{
  const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:800,height:450}});
  const pg=await b.newPage();
  pg.on('console',m=>{ const t=m.text(); if(/hdri|prop|loadfail|timeout|asset/i.test(t)) console.log('CONSOLE:',t.slice(0,160)); });
  pg.on('requestfailed',r=>console.log('REQFAIL:',r.url().slice(-60),r.failure()&&r.failure().errorText));
  pg.on('response',r=>{ if(r.status()>=400) console.log('HTTP'+r.status(),r.url().slice(-60)); });
  await pg.goto('http://127.0.0.1:8013/',{waitUntil:'load',timeout:60000});
  await new Promise(r=>setTimeout(r,9000));
  const imgTest=await pg.evaluate(`new Promise(res=>{const i=new Image();i.onload=()=>res('LOADED '+i.width+'x'+i.height);i.onerror=(e)=>res('ERR');i.src='assets/ground/col.jpg?x=1';})`);
  console.log('IMGTEST:',imgTest);
  const out=await pg.evaluate('window.__GAME&&window.__GAME.groundInfo?JSON.stringify(window.__GAME.groundInfo()):"no groundInfo"');
  console.log('GROUND:',out);
  await b.close();srv.close();
});
