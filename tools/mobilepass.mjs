// mobile pass v2: real touch IDs, enter touch mode, overlap/overflow checks
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.json':'application/json','.png':'image/png','.css':'text/css'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end('nf');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
const SIZES=[['iphone_se',375,667],['iphone15',393,852],['pixel8',412,915],['ipad_mini',744,1133],['landscape_phone',844,390]];
srv.listen(8216, async ()=>{
 const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],protocolTimeout:300000});
 const errs=[];
 for(const [name,w,h] of SIZES){
   const pg=await b.newPage();
   pg.on('pageerror',e=>errs.push(name+': '+String(e.message).slice(0,120)));
   await pg.setViewport({width:w,height:h,deviceScaleFactor:2,isMobile:true,hasTouch:true});
   await pg.goto('http://localhost:8216/?notrack',{waitUntil:'load',timeout:60000});
   await pg.waitForFunction('window.__GAME && __GAME.ready()',{timeout:150000});
   await new Promise(r=>setTimeout(r,2500));
   const rep=await pg.evaluate(`(()=>{
     const pb=document.getElementById('playbtn'); if(pb && getComputedStyle(pb).display!=='none'){ pb.click(); }
     const g=id=>{const el=document.getElementById(id); if(!el) return id+':missing'; const b=el.getBoundingClientRect(); const cs=getComputedStyle(el); return {id, x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width), h:Math.round(b.height), disp:cs.display};};
     const ids=['hud','panel','prompt','goals','toast','joy','knob','tE','tR','tM','touchui','crosshair'];
     const o={}; ids.forEach(i=>o[i]=g(i));
     // overlap: buttons vs goals/hud panel
     const btns=['tE','tR','tM'].map(i=>document.getElementById(i)).filter(Boolean);
     const goals=document.getElementById('goals'); const panel=document.getElementById('panel');
     const ov=(a,b)=>{ if(!a||!b) return false; const r1=a.getBoundingClientRect(), r2=b.getBoundingClientRect(); return !(r1.right<r2.left||r1.left>r2.right||r1.bottom<r2.top||r1.top>r2.bottom); };
     return { overflowX: document.documentElement.scrollWidth>innerWidth, overflowY: document.documentElement.scrollHeight>innerHeight,
       tE_over_goals: btns.some(x=>ov(x,goals)), tE_over_panel: btns.some(x=>ov(x,panel)),
       joySize:o.joy&&o.joy.w+'x'+o.joy.h, btnW:o.tE&&o.tE.w, ui:o };
   })()`);
   console.log(name, JSON.stringify({ovX:rep.overflowX, ovY:rep.overflowY, joy:rep.joySize, btn:rep.btnW, tEgoals:rep.tE_over_goals, tEpanel:rep.tE_over_panel}));
   await pg.screenshot({path:'/home/lex/chargebay/progress/artifacts/mobile_'+name+'.png'});
   await pg.close();
 }
 console.log('ERRORS:', errs.length? errs.join('\n'):'none');
 await b.close(); srv.close(); console.log('DONE');
});
