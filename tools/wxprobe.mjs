// verify fog/heat events: activation, fogK ramp, wx labels, decay
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.json':'application/json','.png':'image/png','.css':'text/css'};
const srv=http.createServer((rq,res)=>{let f=decodeURIComponent(rq.url.split('?')[0]);if(f==='/')f='/index.html';const p2=path.join('/home/lex/chargebay',f);fs.readFile(p2,(e,d)=>{if(e){res.writeHead(404);res.end('nf');return}res.writeHead(200,{'Content-Type':MIME[path.extname(p2)]||'application/octet-stream'});res.end(d)})});
srv.listen(8099,async()=>{
 const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:640,height:400},protocolTimeout:120000});
 const pg=await b.newPage(); pg.setDefaultTimeout(90000);
 let errs=0; pg.on('pageerror',e=>{errs++;console.log('PAGEERR',String(e.message).slice(0,200))});
 await pg.goto('http://localhost:8099/?notrack',{waitUntil:'load',timeout:60000});
 await pg.evaluate("new Promise(r=>{const c=setInterval(()=>{if(window.__GAME&&window.__GAME.bayState)  {clearInterval(c);r(1)}},500)})");
 await pg.evaluate("document.getElementById('start').style.display='none'");
 const fogRes=await pg.evaluate("__GAME.event('fog')");
 await new Promise(r=>setTimeout(r,9000));
 const fogState=await pg.evaluate("({fog:__GAME.wx()})");
 const heatRes=await pg.evaluate("__GAME.event('heat')");
 const goals=await pg.evaluate("(window.__GAME.goalKeys?__GAME.goalKeys():Object.keys(window).length)");
 // force-roll goals and confirm pool contains new ids without freezing
 const poolOk=await pg.evaluate(`(()=>{ try{ const g=__GAME.rollGoals? __GAME.rollGoals() : 'nohook'; return g; }catch(e){ return 'ERR '+e.message; } })()`);
 console.log('fog event:', fogRes);
 console.log('after fog 9s:', JSON.stringify(fogState));
 console.log('heat event:', heatRes);
 console.log('goals:', JSON.stringify(goals));
 console.log('rollGoals:', JSON.stringify(poolOk));
 console.log('ERRORS:', errs?errs:'none');
 await b.close();srv.close();console.log('DONE');});
