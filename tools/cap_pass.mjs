// Post-refactor visual regression: 4 canonical shots (day wide, dock+charge, rain dusk, night).
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end();return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
await new Promise(r=>srv.listen(8181,r));
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:1280,height:800}});
const pg=await b.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push(e.message.slice(0,140)));
pg.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE '+m.text().slice(0,140)); });
await pg.evaluateOnNewDocument(()=>{ localStorage.setItem('chargebay_coached_v1','1'); localStorage.removeItem('chargebay_save_v1'); });
await pg.goto('http://127.0.0.1:8181/',{waitUntil:'load',timeout:120000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:180000});
await pg.evaluate("document.getElementById('start').style.display='none'; document.getElementById('hud').style.visibility='hidden'; document.getElementById('goals').style.visibility='hidden';");
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const out='/home/lex/chargebay/progress/artifacts';

// 1) day wide — full bay, cars, canopy, scenery
await pg.evaluate("window.__GAME.setClock(14); window.__GAME.weather(0);");
await wait(4000);
await pg.evaluate("window.__GAME.lookAt(0,1.0,-4, 15)");
await wait(1500);
await pg.screenshot({path:out+'/pass1_day_wide.png'});

// 2) dock + charge close — cable, plug, progress bar
await pg.evaluate("window.__GAME.finishArr(0); window.__GAME.grab(0); window.__GAME.dock(0);");
await wait(2500);
await pg.evaluate("window.__GAME.cableView(0)");
await wait(1200);
await pg.screenshot({path:out+'/pass2_dock_charge.png'});

// 3) rain dusk — wet mirror, reflections, lens, rain streaks
await pg.evaluate("window.__GAME.setClock(19.2); window.__GAME.weather(1);");
await wait(5000);
await pg.evaluate("window.__GAME.lookAt(-4,0.9,-3.5, 9)");
await wait(1500);
await pg.screenshot({path:out+'/pass3_rain_dusk.png'});

// 4) night — fixtures, emissive, bloom
await pg.evaluate("window.__GAME.setClock(22.5); window.__GAME.weather(0);");
await wait(5000);
await pg.evaluate("window.__GAME.lookAt(0,1.0,-4, 14)");
await wait(1500);
await pg.screenshot({path:out+'/pass4_night.png'});

const info=await pg.evaluate("JSON.stringify(window.__GAME.info())");
console.log('info:', info);
console.log('ERRORS:', errs.length?[...new Set(errs)].slice(0,6).join(' | '):'none');
await b.close(); srv.close();
console.log('DONE');
