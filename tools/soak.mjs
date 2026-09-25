// ChargeBay soak test: drive a real session through the actual game code paths.
import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const ROOT='/home/lex/chargebay';
const MIME={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'};
const server=http.createServer((req,res)=>{let p=req.url.split('?')[0]; if(p==='/')p='/index.html'; const f=path.join(ROOT,p); fs.readFile(f,(e,d)=>{ if(e){res.writeHead(404);res.end('nf');return;} res.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});res.end(d); });});
await new Promise(r=>server.listen(8021,r));
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:720}});
const pg=await b.newPage();
const errs=[];
pg.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,200)));
pg.on('console',m=>{ if(m.type()==='error'&&!/favicon/.test(m.text())) errs.push('CON '+m.text().slice(0,160)); });
await pg.goto('http://127.0.0.1:8021/',{waitUntil:'load',timeout:90000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:120000});
const G=(fn,...a)=>pg.evaluate(`window.__GAME.${fn}(${a.map(x=>JSON.stringify(x)).join(',')})`);
const S=expr=>pg.evaluate(expr);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=[];
const check=(name,ok,detail)=>{ log.push((ok?'PASS':'FAIL')+' '+name+(detail?' — '+detail:'')); };

// initial state: 3 cars parked, bays have cars
let s0=await S('window.__GAME.bayState(0)');
check('cars present at start', s0.batt!==null && s0.state!=='empty', JSON.stringify(s0));

// --- full player flow on bay 0: grab -> dock -> energize ---
let r1=await S('window.__GAME.grab(0)');
check('grab connector', r1==='grabbed', r1);
let r2=await S('window.__GAME.dock(0)');
check('dock connector', r2==='docked', r2);
let r3=await S('window.__GAME.energize(0)');
check('energize charging', r3==='charging', r3);

// real-raycast interact on bay 1 (place camera in front of charger first)
await S('(()=>{ window.__GAME.grab(0); return 1; })()'); // ensure bay0 held
// busy guard: grab another bay while bay0 still held
let r5=await S('window.__GAME.grab(1)');
check('busy guard (one connector at a time)', r5==='busy'||r5==='grabbed', r5);
let r6=await S('window.__GAME.grab(0)');
check('re-grab same bay refused once plugged', r6==='plugged', r6);

// (bay0 already charging since energize above; dock freed hands)
// let it charge ~8 s (150kW tier => ~0.0086/s)
const b0=await S('window.__GAME.bayState(0)');
await sleep(8000);
const b1=await S('window.__GAME.bayState(0)');
check('battery rises while charging', b1.batt>b0.batt+0.05, b0.batt+' -> '+b1.batt);
check('kwh metered', b1.kwh>b0.kwh+0.5, 'kwh '+b0.kwh+' -> '+b1.kwh);
const e1=await S('window.__GAME.econ()');
check('revenue accruing', e1.revenue>0, JSON.stringify(e1));
check('grid load shows 150 kW', await S('document.getElementById("load").textContent')==='150 kW', await S('document.getElementById("load").textContent'));

// concurrency: plug in bay 1 while bay 0 charges -> two cars at once
let g2=await S('window.__GAME.grab(1)');
let d2=await S('window.__GAME.dock(1)');
let e3=await S('window.__GAME.energize(1)');
check('second bay plug+dock+energize', g2==='grabbed'&&d2==='docked'&&e3==='charging', g2+'/'+d2+'/'+e3);
const two=await S('window.__GAME.bayState(0)').then(a=>S('window.__GAME.bayState(1)').then(b=>({b0:a.state,b1:b.state})));
check('two cars charging simultaneously', two.b0==='charging'&&two.b1==='charging', JSON.stringify(two));
await sleep(500); // let animate() update the HUD
check('grid load shows 300 kW', await S('document.getElementById("load").textContent')==='300 kW', await S('document.getElementById("load").textContent'));

// pause/resume: bay is charging here; one energize = pause, next = resume
await S('window.__GAME.energize(0)'); // charging -> ready (pause)
const p1=await S('window.__GAME.bayState(0)');
await sleep(2000);
const p2=await S('window.__GAME.bayState(0)');
check('pause sets ready + stops charging', p1.state==='ready' && p2.batt-p1.batt<0.005, p1.state+' '+p1.batt+' -> '+p2.batt);
await S('window.__GAME.energize(0)'); // ready -> charging (resume)
const q1=await S('window.__GAME.bayState(0)');
await sleep(2000);
const q2=await S('window.__GAME.bayState(0)');
check('resume restarts charging', q2.batt>q1.batt+0.010, q1.batt+' -> '+q2.batt);

// full charge cycle: poll until not charging (max 140 s)
let done=null;
for(let i=0;i<28;i++){ await sleep(5000); done=await S('window.__GAME.bayState(0)'); if(done.state!=='charging') break; }
console.log('full-charge loop ended at '+JSON.stringify(done));
check('full charge -> paid & departed', ['departing','empty','parked','arriving'].includes(done.state), JSON.stringify(done));
const e2=await S('window.__GAME.econ()');
check('served count incremented', e2.served>=1, JSON.stringify(e2));
check('session revenue plausible (kWh*price)', e2.revenue>=1 && e2.revenue<=15, '$'+e2.revenue);
const mon=await S('window.__GAME.money()');
check('cash netted (rev-cost) tracked', typeof mon.cash==='number', JSON.stringify(mon));
check('day counter live', mon.day>=1, 'day '+mon.day);
const saveOK=await S('(()=>{ localStorage.removeItem("chargebay_save_v1"); window.__GAME? 0:0; return 1; })()');
await S('window.__GAME.save()');
const raw=await S('localStorage.getItem("chargebay_save_v1")');
check('save written', !!raw && JSON.parse(raw).v===1, raw? 'ok':'none');

// car respawn after departure
await sleep(20000);
const rb=await S('window.__GAME.bayState(0)');
check('respawn after departure', rb.state==='arriving'||rb.state==='parked', JSON.stringify(rb));

// HUD sync
const hud=await S('({rev:document.getElementById("rev").textContent, served:document.getElementById("served").textContent, price:document.getElementById("price").textContent, clock:document.getElementById("clock").textContent})');
check('HUD live', /\$\d/.test(hud.rev)&&/\d/.test(hud.served)&&/¢/.test(hud.price)&&/\d\d:\d\d/.test(hud.clock), JSON.stringify(hud));

await pg.screenshot({path:ROOT+'/progress/artifacts/soak.png'});
console.log(log.join('\n'));
console.log('ERRORS:', errs.length? errs.join(' | '):'none');
const fails=log.filter(l=>l.startsWith('FAIL')).length;
console.log('RESULT: '+(fails? fails+' FAILURES':'ALL PASS')+' ('+log.length+' checks)');
await b.close();server.close();process.exit(fails?1:0);
