import puppeteer from 'puppeteer-core';
import http from 'http'; import fs from 'fs'; import path from 'path';
const MIME={'.html':'text/html','.js':'text/javascript','.glb':'model/gltf-binary','.bin':'application/octet-stream','.hdr':'image/vnd.radiance-hdr','.png':'image/png'};
const srv=http.createServer((q,r)=>{let p=q.url.split('?')[0];if(p==='/')p='/index.html';fs.readFile('/home/lex/chargebay'+p,(e,d)=>{if(e){r.writeHead(404);r.end('404');return;}r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(d);});});
await new Promise(r=>srv.listen(8178,r));
const b=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],defaultViewport:{width:640,height:400}});
const pg=await b.newPage();
const errs=[]; pg.on('pageerror',e=>errs.push('PAGEERR '+e.message.slice(0,150)));
await pg.evaluateOnNewDocument(()=>{ localStorage.setItem('chargebay_coached_v1','1'); localStorage.removeItem('chargebay_save_v1'); });
await pg.goto('http://127.0.0.1:8178/',{waitUntil:'load',timeout:90000});
await pg.waitForFunction('window.__GAME&&window.__GAME.ready()',{timeout:120000});
const r=await pg.evaluate(`(()=>{const G=window.__GAME; G.setCash(5000);
  const m0=G.money();
  // key-based: B = buyBuffer
  dispatchEvent(new KeyboardEvent('keydown',{code:'KeyB'}));
  const afterB=G.money();
  // U = upgrade targeted bay (no target w/o pointer; call SHOP path via unlock first on bay 3)
  const before=G.bays().map(b=>b.state);
  return JSON.stringify({bufferBought: afterB.bufferOwned && !m0.bufferOwned, cashDrop: +(m0.cash-afterB.cash).toFixed(0)});})()`);
console.log('shop probe2:', r);
console.log('ERRORS:', errs.length?errs.join(' | '):'none');
await b.close(); srv.close();
