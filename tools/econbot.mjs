import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
await new Promise(r=>srv.listen(8170,r));
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--disable-gpu-sandbox'],defaultViewport:{width:640,height:400}});
const pg=await b.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message.slice(0,140)));
await pg.evaluateOnNewDocument(()=>{ localStorage.setItem('chargebay_coached_v1','1'); localStorage.removeItem('chargebay_save_v1'); });
await pg.goto('http://127.0.0.1:8170/',{waitUntil:'load',timeout:120000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
await pg.evaluate("document.getElementById('start').style.display='none';");
await pg.evaluate("window.__GAME.setCash(500);");

// bot loop: dock arriving cars immediately, log economics
const log=[];
const t0=Date.now();
const DURATION_MS = Number(process.argv[2]||15*60*1000);
let docked0=0;
while(Date.now()-t0 < DURATION_MS){
  const st=await pg.evaluate(`(()=>{
    const G=window.__GAME;
    let docked=0;
    for(let i=0;i<4;i++){
      const s=G.bayState(i);
      if(s.state==='parked'||s.state==='ready'){ if(!s.plugged){} }
    }
    const bs=G.bays();
    for(let i=0;i<bs.length;i++){
      const s=G.bayState(i);
      if(s.state==='parked'){ G.dock(i); docked++; }
    }
    if(G.cardOpen()) G.endDayNow&&0;
    return {docked, money:G.money(), econ:G.econ(), info:G.info(), rep:G.repGet(), goals:G.goalsState().dayStats, card:G.cardOpen()};
  })()`);
  log.push({t:+((Date.now()-t0)/1000).toFixed(0), clock:st.info.clock, ...st});
  await new Promise(r=>setTimeout(r,1500));
}
const final=await pg.evaluate("({hours:window.__GAME.hourStats(), money:window.__GAME.money(), rep:window.__GAME.repGet(), goals:window.__GAME.goalsState()})");
console.log(JSON.stringify({minutes:+((Date.now()-t0)/60000).toFixed(1), final, sample:log.filter((_,i)=>i%4===0).slice(0,40)}, null, 1));
console.log('ERRORS:', errs.length? errs.slice(0,5).join(' | '):'none');
await b.close(); srv.close(); process.exit(0);