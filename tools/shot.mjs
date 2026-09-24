// headless capture: screenshot + console/pageerror + live state
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(import.meta.dirname, '..');
const PORT = Number(process.env.PORT || 8003);
const OUT = process.argv[2] || path.join(ROOT, 'progress/artifacts/last.png');
const POSE = process.env.POSE ? JSON.parse(process.env.POSE) : null; // {x,y,z,ry} | [{x,y,z,ry},...]
const WAIT = Number(process.env.WAIT || 4500);

const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.glb':'model/gltf-binary', '.hdr':'image/vnd.radiance', '.png':'image/png', '.json':'application/json' };
const server = http.createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  fs.readFile(f, (e,d)=>{
    if (e){ res.writeHead(404); res.end('404 '+p); return; }
    res.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(d);
  });
});
await new Promise(r=>server.listen(PORT, r));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox','--disable-gpu','--use-gl=angle','--use-angle=vulkan','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errors = [];
page.on('console', m => { if (m.type()==='error') errors.push('[console] '+m.text()); });
page.on('pageerror', e => errors.push('[pageerror] '+String(e && e.message || e)));

await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'load', timeout: 60000 });
try {
  await page.waitForFunction('window.__GAME && window.__GAME.ready() && window.__GAME.envReady()', { timeout: 60000 });
} catch(e) { errors.push('[timeout] game never became ready'); }
await new Promise(r=>setTimeout(r, WAIT));

const poses = POSE ? (Array.isArray(POSE)?POSE:[POSE]) : [{x:2.2,y:1.65,z:7.5,ry:0}];
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const base = OUT.replace(/\.png$/,'');
const states = [];
for (let i=0;i<poses.length;i++){
  const p = poses[i];
  await page.evaluate(`window.__GAME.pose(${p.x},${p.y},${p.z},${p.ry||0}); window.__GAME.weather(${p.rain ?? 0.7});`);
  await new Promise(r=>setTimeout(r, 900));
  const out = poses.length>1 ? `${base}_${i+1}.png` : OUT;
  await page.screenshot({ path: out });
  states.push({ pose:p, file:out });
}
const info = await page.evaluate(`(() => {
  const G = window.__GAME;
  return { fps: G.diag.fps, calls: G.diag.calls(), tris: G.diag.tris(), bays: G.bays() };
})()`);
fs.writeFileSync(OUT.replace(/\.png$/,'.json'), JSON.stringify({ ok: errors.length===0, errors, renderer: info, states, takenAt: new Date().toISOString() }, null, 2));
console.log(JSON.stringify({ ok: errors.length===0, errors, renderer: info }, null, 2));
await browser.close();
server.close();
process.exit(errors.length ? 1 : 0);
