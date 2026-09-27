// stage probe: live-flush every console line + main-thread liveness checks
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.json':'application/json','.png':'image/png','.css':'text/css'};
const srv=http.createServer((rq,res)=>{let f=decodeURIComponent(rq.url.split('?')[0]);if(f==='/')f='/index.html';const p2=path.join('/home/lex/chargebay',f);fs.readFile(p2,(e,d)=>{if(e){res.writeHead(404);res.end('nf');return}res.writeHead(200,{'Content-Type':MIME[path.extname(p2)]||'application/octet-stream'});res.end(d)})});
srv.listen(8099,async()=>{
 const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:480,height:300},protocolTimeout:120000});
 const pg=await b.newPage(); pg.setDefaultTimeout(90000);
 pg.on('console',m=>process.stdout.write(`[${(Date.now()%100000)/1000}] CON ${m.type()} ${m.text().slice(0,160)}\n`));
 pg.on('pageerror',e=>process.stdout.write(`PAGEERR ${String(e.message).slice(0,250)}\n`));
 await pg.goto('http://localhost:8099/?notrack',{waitUntil:'domcontentloaded',timeout:30000});
 process.stdout.write('DOMCONTENTLOADED\n');
 let prev=-1;
 for(let i=0;i<24;i++){
   await new Promise(r=>setTimeout(r,10000));
   const p=await pg.evaluate('performance.now()').catch(()=>'TO');
   process.stdout.write(`t=${i*10}s perf:${p}\n`);
   if(typeof p==='number' && prev>=0 && p-prev<1500) process.stdout.write('!! MAIN THREAD FROZEN\n');
   prev=p;
   if(typeof p==='number' && i>6){
     const hook=await pg.evaluate('window.__GAME? Object.keys(__GAME).length : -1').catch(()=>'TO');
     process.stdout.write(`hookkeys:${hook}\n`);
   }
 }
 await b.close();srv.close();process.stdout.write('PROBE_DONE\n');});
