const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const APP_PASSWORD = process.env.APP_PASSWORD || 'change-me-now';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const IS_PROD = process.env.NODE_ENV === 'production';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookies(req){
  const out = {};
  (req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}
function safeEqual(a, b){
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function makeSession(){
  const exp = Date.now() + SESSION_MS;
  const nonce = crypto.randomBytes(12).toString('hex');
  const payload = `${exp}.${nonce}`;
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}
function verifySession(token){
  if (!token) return false;
  const p = token.split('.');
  if (p.length !== 3) return false;
  const [exp, nonce, sig] = p;
  const payload = `${exp}.${nonce}`;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
  return safeEqual(sig, expected) && Number(exp) > Date.now();
}
function authed(req){ return verifySession(parseCookies(req).runner_session); }
function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}){
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
function readJson(req){
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => {
      b += c;
      if (b.length > 1e6) {
        reject(new Error('too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(b || '{}')); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

const LOGIN_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Private Runner Studio</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;background:radial-gradient(circle at 50% 15%,#174f37 0,#0c0e12 43%);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#f7f8fb}.card{width:min(100%,410px);padding:30px;border:1px solid #30353f;border-radius:24px;background:#17191f;box-shadow:0 30px 90px #0008}.mark{width:54px;height:54px;border-radius:17px;display:grid;place-items:center;background:#61f0a6;color:#08130d;font-weight:900;font-size:28px}.card h1{font-size:34px;line-height:1.05;margin:24px 0 8px}.muted{color:#9da4b0;font-size:18px;margin:0 0 28px}label{display:grid;gap:10px;font-size:16px}input{width:100%;padding:16px;border-radius:14px;border:1px solid #343943;background:#0e1014;color:white;font-size:18px}button{width:100%;margin-top:16px;padding:16px;border:0;border-radius:14px;background:#61f0a6;color:#07110c;font-size:19px;font-weight:900}.msg{min-height:22px;color:#ff8f8f;margin-top:12px}
</style>
</head>
<body>
<main class="card">
  <div class="mark">R</div>
  <h1>Private Runner Studio</h1>
  <p class="muted">Owner access only</p>
  <form id="f">
    <label>Password
      <input id="p" type="password" autocomplete="current-password" placeholder="Enter your password">
    </label>
    <button>Unlock Studio</button>
    <div class="msg" id="m"></div>
  </form>
</main>
<script>
f.onsubmit=async(e)=>{e.preventDefault();m.textContent='';const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p.value})});if(r.ok)location.href='/app';else m.textContent='Wrong password';};
</script>
</body>
</html>`;

const APP_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Private Runner Studio V6 Front Base + 5 Highways</title>
<style>
:root{--bg:#0b0d10;--panel:#15181e;--panel2:#1b1f27;--text:#f6f8fb;--muted:#9ca5b2;--line:#2b303a;--accent:#61f0a6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.top{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 14px;background:#0b0d10ee;border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}
.top strong{font-size:18px}.badge{font-size:11px;color:#07110c;background:var(--accent);border-radius:99px;padding:4px 7px;margin-left:6px}
.top-actions{display:flex;gap:7px}.top button,.transport button{border:1px solid var(--line);background:#222731;color:white;border-radius:11px;padding:9px 12px;font:inherit}
.top .primary,.transport .primary{background:var(--accent);color:#07110c;border-color:transparent;font-weight:800}
.studio{max-width:1260px;margin:auto;padding:14px;display:grid;grid-template-columns:minmax(320px,660px) minmax(320px,1fr);gap:16px}
.preview{min-width:0}.shell{background:#050607;border:1px solid var(--line);border-radius:18px;padding:7px;display:flex;justify-content:center;box-shadow:0 18px 60px #0007}
.stageWrap{width:min(100%,460px);aspect-ratio:9/16;border-radius:13px;overflow:hidden;background:#08ce78}canvas{width:100%;height:100%;display:block}
.transport{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}.transport input[type=number]{width:70px;padding:9px;background:#fff;color:#111;border-radius:8px;border:0}
.note{font-size:12px;color:var(--muted);line-height:1.52;margin-top:8px}
.controls{display:flex;flex-direction:column;gap:10px}
details{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--panel)}summary{padding:13px 14px;background:var(--panel2);font-weight:800;cursor:pointer}
.grid{padding:13px;display:grid;gap:11px}.grid.two{grid-template-columns:1fr 1fr}.grid label,.side label{display:grid;gap:6px;color:#d7dbe2;font-size:13px}
input[type=file]{width:100%;font-size:12px}input[type=range]{width:100%}
select{padding:8px;background:#0f1217;color:white;border:1px solid var(--line);border-radius:8px}
.toggle{display:flex!important;align-items:center;gap:8px!important}
.rows{padding:11px;display:grid;gap:10px}.row{border:1px solid var(--line);border-radius:13px;padding:10px;background:#101318}.rowhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.rowbadge{font-size:11px;color:#07110c;background:#d4fbe4;border-radius:999px;padding:3px 7px}
.sides{display:grid;grid-template-columns:1fr 1fr;gap:8px}.side{background:#191d24;border-radius:10px;padding:9px;display:grid;gap:8px}.side b{font-size:12px}
.small{font-size:11px;color:var(--muted)}
@media(max-width:820px){.studio{grid-template-columns:1fr;padding:8px}.top{padding:9px}.top strong{font-size:14px}.top button{padding:8px 9px;font-size:12px}.grid.two,.sides{grid-template-columns:1fr}.controls{padding-bottom:40px}}
</style>
</head>
<body>
<header class="top">
  <div><strong>Private Runner Studio</strong><span class="badge">V6 FRONT BASE</span></div>
  <div class="top-actions"><button id="saveBtn">Save</button><button id="loadBtn">Load</button><button id="logoutBtn">Logout</button></div>
</header>
<main class="studio">
  <section class="preview">
    <div class="shell"><div class="stageWrap"><canvas id="stage" width="720" height="1280"></canvas></div></div>
    <div class="transport"><button class="primary" id="playBtn">Pause</button><button id="resetBtn">Reset</button><label>Record sec <input id="recordSec" type="number" min="2" max="60" value="15"></label><button id="exportBtn">Export Video</button></div>
    <div class="note">V6 Front Base preserved: same black-background style, same front-facing highway feel, same standing glowing pads, and exactly <b>5 choice rows only</b>. Added only <b>4 extra highway looks</b> so you can switch styles without changing the basic feel. If you want more space between rows, increase <b>Pad delay</b>. Use the <b>Eye-level horizon</b> slider to push the road lower for a stronger front-view look.</div>
  </section>
  <section class="controls">
    <details open><summary>Moving Highway / Camera</summary><div class="grid two">
      <label>Highway variant
        <select id="highwayVariant">
          <option value="base">V6 Front Base</option>
          <option value="edge">Red-White Edge</option>
          <option value="arcade">Wide Arcade</option>
          <option value="speed">Speed Lane</option>
          <option value="silver">Clean Silver</option>
        </select>
      </label>
      <label>Background
        <select id="backgroundMode">
          <option value="black" selected>Reference Black</option>
          <option value="green">Green Screen</option>
          <option value="teal">Dark Teal</option>
        </select>
      </label>
      <label>Speed <input id="speed" type="range" min="0.06" max="0.75" step="0.01" value="0.24"></label>
      <label>Road width <input id="roadWidth" type="range" min="0.88" max="1.18" step="0.01" value="1.00"></label>
      <label>Eye-level horizon <input id="horizon" type="range" min="520" max="900" step="5" value="660"></label>
      <label>Perspective <input id="perspectivePower" type="range" min="0.68" max="1.34" step="0.02" value="0.96"></label>
      <label>Pad delay <input id="rowGap" type="range" min="0.17" max="0.36" step="0.01" value="0.29"></label>
      <label>Pad glow base <input id="padLift" type="range" min="10" max="90" value="16"></label>
      <label>Glow thickness <input id="padThickness" type="range" min="8" max="58" value="16"></label>
      <label class="toggle"><input id="speedLines" type="checkbox" checked> Motion streaks</label>
      <label class="toggle"><input id="roadShine" type="checkbox" checked> Road highlights</label>
    </div></details>

    <details open><summary>5 Fixed Choice Rows / Standing Pads</summary><div class="rows" id="rows"></div></details>
  </section>
</main>

<template id="rowTemplate">
  <div class="row">
    <div class="rowhead"><strong class="rowtitle">Row</strong><span class="rowbadge">fixed</span></div>
    <div class="sides">
      <div class="side">
        <b>LEFT</b>
        <label>Pad
          <select class="leftColor"><option value="green">Green</option><option value="red">Red</option></select>
        </label>
        <label>PNG <input class="leftInput" type="file" accept="image/png,image/webp,image/jpeg"></label>
        <label class="toggle"><input class="leftRemove" type="checkbox" checked> Auto remove bg</label>
        <label>Size <input class="leftSize" type="range" min="45" max="220" value="95"></label>
      </div>
      <div class="side">
        <b>RIGHT</b>
        <label>Pad
          <select class="rightColor"><option value="red">Red</option><option value="green">Green</option></select>
        </label>
        <label>PNG <input class="rightInput" type="file" accept="image/png,image/webp,image/jpeg"></label>
        <label class="toggle"><input class="rightRemove" type="checkbox" checked> Auto remove bg</label>
        <label>Size <input class="rightSize" type="range" min="45" max="220" value="95"></label>
      </div>
    </div>
  </div>
</template>

<script>
(()=>{
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
const $ = id => document.getElementById(id);
let running = true, last = performance.now(), roadTime = 0, recorder = null;

const HIGHWAYS = {
  base:{name:'V6 Front Base', topHalf:265, bottomHalfFactor:0.505, laneMode:'double', edgeMode:'redwhite', road:'#9ea8b6', tileA:'rgba(255,255,255,.032)', tileB:'rgba(42,46,58,.070)'},
  edge:{name:'Red-White Edge', topHalf:265, bottomHalfFactor:0.505, laneMode:'double', edgeMode:'redwhite', road:'#9ca6b3', tileA:'rgba(255,255,255,.026)', tileB:'rgba(50,56,68,.072)'},
  arcade:{name:'Wide Arcade', topHalf:278, bottomHalfFactor:0.525, laneMode:'double', edgeMode:'glow', road:'#97a1af', tileA:'rgba(255,255,255,.030)', tileB:'rgba(58,54,60,.068)'},
  speed:{name:'Speed Lane', topHalf:272, bottomHalfFactor:0.515, laneMode:'triple', edgeMode:'white', road:'#8e98a4', tileA:'rgba(255,255,255,.030)', tileB:'rgba(44,36,38,.070)'},
  silver:{name:'Clean Silver', topHalf:258, bottomHalfFactor:0.50, laneMode:'single', edgeMode:'white', road:'#b4bcc6', tileA:'rgba(255,255,255,.028)', tileB:'rgba(80,80,80,.045)'}
};

const state = {
  highwayVariant:'base',
  backgroundMode:'black',
  speed:0.24,
  roadWidth:1.00,
  horizon:660,
  perspectivePower:0.96,
  padLift:16,
  padThickness:16,
  rowGap:0.29,
  speedLines:true,
  roadShine:true,
  rows:[]
};

function readFile(file){ return new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsDataURL(file); }); }
function dataToImage(src){ return new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = src; }); }
function processImageDataUrl(dataUrl, removeBg){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      if (!removeBg){ resolve(dataUrl); return; }
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      const cx = c.getContext('2d', {willReadFrequently:true});
      cx.drawImage(img, 0, 0);
      const id = cx.getImageData(0, 0, c.width, c.height);
      const d = id.data;
      const sample = (x, y) => { const i = (y*c.width + x) * 4; return [d[i], d[i+1], d[i+2]]; };
      const pts = [[0,0],[c.width-1,0],[0,c.height-1],[c.width-1,c.height-1],[Math.floor(c.width/2),0],[0,Math.floor(c.height/2)],[c.width-1,Math.floor(c.height/2)],[Math.floor(c.width/2),c.height-1]];
      let sr=0, sg=0, sb=0;
      pts.forEach(([x,y]) => { const [r,g,b] = sample(x,y); sr += r; sg += g; sb += b; });
      const br = sr/pts.length, bg = sg/pts.length, bb = sb/pts.length;
      for(let i=0;i<d.length;i+=4){
        const dr = d[i]-br, dg = d[i+1]-bg, db = d[i+2]-bb;
        const dist = Math.sqrt(dr*dr + dg*dg + db*db);
        const bright = (d[i] + d[i+1] + d[i+2]) / 3;
        if(dist < 28 || bright > 248) d[i+3] = 0;
        else if(dist < 44) d[i+3] = Math.min(d[i+3], 110);
      }
      cx.putImageData(id, 0, 0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
async function dataToProcessedImage(src, removeBg){ return dataToImage(await processImageDataUrl(src, removeBg)); }
function bindRange(id, key){ $(id).addEventListener('input', e => state[key] = Number(e.target.value)); }
['speed','roadWidth','horizon','perspectivePower','padLift','padThickness','rowGap'].forEach(id => bindRange(id, id));
$('speedLines').onchange = e => state.speedLines = e.target.checked;
$('roadShine').onchange = e => state.roadShine = e.target.checked;
$('highwayVariant').onchange = e => state.highwayVariant = e.target.value;
$('backgroundMode').onchange = e => state.backgroundMode = e.target.value;

function defaultRows(){
  return [
    {leftColor:'green', rightColor:'red', leftSize:95, rightSize:95, leftSrc:null, rightSrc:null, leftImg:null, rightImg:null, leftRemove:true, rightRemove:true},
    {leftColor:'red', rightColor:'green', leftSize:95, rightSize:95, leftSrc:null, rightSrc:null, leftImg:null, rightImg:null, leftRemove:true, rightRemove:true},
    {leftColor:'green', rightColor:'red', leftSize:95, rightSize:95, leftSrc:null, rightSrc:null, leftImg:null, rightImg:null, leftRemove:true, rightRemove:true},
    {leftColor:'red', rightColor:'green', leftSize:95, rightSize:95, leftSrc:null, rightSrc:null, leftImg:null, rightImg:null, leftRemove:true, rightRemove:true},
    {leftColor:'green', rightColor:'red', leftSize:95, rightSize:95, leftSrc:null, rightSrc:null, leftImg:null, rightImg:null, leftRemove:true, rightRemove:true}
  ];
}
state.rows = defaultRows();

function renderRows(){
  $('rows').innerHTML = '';
  state.rows.forEach((row, i) => {
    const el = $('rowTemplate').content.firstElementChild.cloneNode(true);
    el.querySelector('.rowtitle').textContent = 'Row ' + (i + 1);
    el.querySelector('.leftColor').value = row.leftColor;
    el.querySelector('.rightColor').value = row.rightColor;
    el.querySelector('.leftSize').value = row.leftSize;
    el.querySelector('.rightSize').value = row.rightSize;
    el.querySelector('.leftRemove').checked = row.leftRemove;
    el.querySelector('.rightRemove').checked = row.rightRemove;
    el.querySelector('.leftColor').onchange = e => row.leftColor = e.target.value;
    el.querySelector('.rightColor').onchange = e => row.rightColor = e.target.value;
    el.querySelector('.leftSize').oninput = e => row.leftSize = Number(e.target.value);
    el.querySelector('.rightSize').oninput = e => row.rightSize = Number(e.target.value);
    el.querySelector('.leftRemove').onchange = async e => { row.leftRemove = e.target.checked; if(row.leftSrc) row.leftImg = await dataToProcessedImage(row.leftSrc, row.leftRemove); };
    el.querySelector('.rightRemove').onchange = async e => { row.rightRemove = e.target.checked; if(row.rightSrc) row.rightImg = await dataToProcessedImage(row.rightSrc, row.rightRemove); };
    el.querySelector('.leftInput').onchange = async e => { const f = e.target.files[0]; if(!f) return; row.leftSrc = await readFile(f); row.leftImg = await dataToProcessedImage(row.leftSrc, row.leftRemove); };
    el.querySelector('.rightInput').onchange = async e => { const f = e.target.files[0]; if(!f) return; row.rightSrc = await readFile(f); row.rightImg = await dataToProcessedImage(row.rightSrc, row.rightRemove); };
    $('rows').appendChild(el);
  });
}
renderRows();

function currentHighway(){ return HIGHWAYS[state.highwayVariant] || HIGHWAYS.base; }
function lerp(a,b,t){ return a + (b-a) * t; }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function easeZ(z){ z = clamp(z,0,1); return Math.pow(z, state.perspectivePower); }
function roadBoundsAtZ(z){
  const e = easeZ(z);
  const v = currentHighway();
  const topHalf = v.topHalf;
  const bottomHalf = W * v.bottomHalfFactor * state.roadWidth;
  const y = state.horizon + (H - state.horizon) * e;
  const half = topHalf + (bottomHalf - topHalf) * e;
  return {e, y, l:W/2-half, r:W/2+half, half};
}
function drawPoly(pts, fill){ ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for(let i=1;i<pts.length;i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); }

function drawBackground(){
  if(state.backgroundMode === 'black'){
    const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#101216'); g.addColorStop(.5,'#06080b'); g.addColorStop(1,'#020305'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    const rg = ctx.createRadialGradient(W/2,260,20,W/2,680,760); rg.addColorStop(0,'rgba(51,255,164,.08)'); rg.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=rg; ctx.fillRect(0,0,W,H);
  } else if(state.backgroundMode === 'teal'){
    const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#163f3a'); g.addColorStop(.54,'#0d2f2a'); g.addColorStop(1,'#081817'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    const rg = ctx.createRadialGradient(W/2,260,20,W/2,500,740); rg.addColorStop(0,'rgba(255,255,255,.07)'); rg.addColorStop(1,'rgba(0,0,0,.12)'); ctx.fillStyle=rg; ctx.fillRect(0,0,W,H);
  } else {
    const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#16eb8d'); g.addColorStop(.52,'#0cdf80'); g.addColorStop(1,'#08b666'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);
    const rg = ctx.createRadialGradient(W/2,280,20,W/2,480,700); rg.addColorStop(0,'rgba(255,255,255,.09)'); rg.addColorStop(1,'rgba(0,0,0,.14)'); ctx.fillStyle=rg; ctx.fillRect(0,0,W,H);
    const side = ctx.createLinearGradient(0,0,W,0); side.addColorStop(0,'rgba(1,44,24,.35)'); side.addColorStop(.12,'rgba(255,255,255,.03)'); side.addColorStop(.5,'rgba(255,255,255,0)'); side.addColorStop(.88,'rgba(255,255,255,.03)'); side.addColorStop(1,'rgba(1,44,24,.35)'); ctx.fillStyle=side; ctx.fillRect(0,0,W,H);
  }

  if(state.speedLines){
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,.35)';
    ctx.lineCap='round';
    for(let i=0;i<14;i++){
      const sideDir = i%2===0 ? -1 : 1;
      const z = (i*0.082 + roadTime*state.speed*0.78) % 1;
      const e = easeZ(z);
      const y = state.horizon - 120 + (H - state.horizon + 120) * e;
      const x = sideDir < 0 ? lerp(58, 150, e) : lerp(W-58, W-150, e);
      const len = 16 + 130*e;
      ctx.globalAlpha = 0.08 + 0.42*e;
      ctx.lineWidth = 2 + 3.2*e;
      ctx.beginPath();
      ctx.moveTo(x, y-len*0.65);
      ctx.lineTo(x+sideDir*6*e, y+len*0.35);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawRoad(){
  const v = currentHighway();
  const top = roadBoundsAtZ(0), bottom = roadBoundsAtZ(1);
  drawPoly([[top.l,top.y],[top.r,top.y],[bottom.r,H],[bottom.l,H]], v.road || '#949195');

  for(let i=0;i<12;i++){
    const z0 = (i/12 + roadTime*state.speed) % 1;
    const z1 = z0 + 0.11;
    if(z1 > 1) continue;
    const a = roadBoundsAtZ(z0), b = roadBoundsAtZ(z1);
    drawPoly([[a.l,a.y],[a.r,a.y],[b.r,b.y],[b.l,b.y]], i%2 ? v.tileA : v.tileB);
  }

  if(v.edgeMode === 'redwhite'){
    ctx.save();
    for(let i=0;i<12;i++){
      const z0 = (i/12 + roadTime*state.speed*1.04) % 1;
      const z1 = z0 + 0.08;
      if(z1 > 1) continue;
      const a = roadBoundsAtZ(z0), b = roadBoundsAtZ(z1);
      drawPoly([[a.l,a.y],[lerp(a.l,a.r,.03),a.y],[lerp(b.l,b.r,.03),b.y],[b.l,b.y]], i%2 ? '#ffffff' : '#ff5353');
      drawPoly([[lerp(a.r,a.l,.03),a.y],[a.r,a.y],[b.r,b.y],[lerp(b.r,b.l,.03),b.y]], i%2 ? '#ffffff' : '#ff5353');
    }
    ctx.restore();
  } else if(v.edgeMode === 'glow'){
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,.68)';
    ctx.shadowColor='rgba(255,255,255,.25)';
    ctx.shadowBlur=12;
    ctx.lineWidth=3;
    ctx.beginPath();
    ctx.moveTo(top.l,top.y); ctx.lineTo(bottom.l,H);
    ctx.moveTo(top.r,top.y); ctx.lineTo(bottom.r,H);
    ctx.stroke();
    ctx.restore();
  } else if(state.roadShine){
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,.58)';
    ctx.lineWidth=2.4;
    ctx.beginPath();
    ctx.moveTo(top.l,top.y); ctx.lineTo(bottom.l,H);
    ctx.moveTo(top.r,top.y); ctx.lineTo(bottom.r,H);
    ctx.stroke();
    ctx.restore();
  }

  const laneCount = v.laneMode === 'triple' ? 3 : (v.laneMode === 'single' ? 1 : 2);
  ctx.save();
  ctx.strokeStyle='rgba(255,255,255,.54)';
  ctx.lineCap='round';
  for(let i=0;i<7;i++){
    const z = (i*0.145 + roadTime*state.speed*1.16) % 1;
    if(z < 0.30) continue;
    const a = roadBoundsAtZ(z), b = roadBoundsAtZ(Math.min(1, z+0.10));
    for(let lane=0; lane<laneCount; lane++){
      const t = laneCount === 1 ? 0.5 : (laneCount === 2 ? (lane===0 ? .34 : .66) : [0.26,.5,.74][lane]);
      const x1 = lerp(a.l, a.r, t), x2 = lerp(b.l, b.r, t);
      ctx.globalAlpha = Math.min(0.84, (z-0.2)*0.95);
      ctx.lineWidth = 2 + 3.5*z;
      ctx.beginPath(); ctx.moveTo(x1, a.y); ctx.lineTo(x2, b.y); ctx.stroke();
    }
  }
  ctx.restore();
}

function drawRaisedPad(z, side, color){
  const p = roadBoundsAtZ(z);
  const e = p.e;
  const laneCenter = side === 'left' ? W/2 - p.half*0.43 : W/2 + p.half*0.43;
  const width = (138 + 82*e) * (0.72 + 0.32*e);
  const height = (68 + 66*e) * (0.72 + 0.22*e);
  const baseY = p.y - 4 - state.padLift*(0.22 + 0.28*e);
  const topY = baseY - height;
  const rgb = color === 'red' ? '255,60,60' : '68,255,150';
  const dark = color === 'red' ? '118,20,20' : '16,92,58';

  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.16)';
  ctx.beginPath();
  ctx.ellipse(laneCenter, baseY+7, width*0.42, Math.max(5, 8+9*e), 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle='rgba('+dark+',.56)';
  ctx.beginPath();
  ctx.roundRect(laneCenter-width/2, baseY-state.padThickness*0.34, width, state.padThickness*(0.54+0.42*e), 7);
  ctx.fill();
  ctx.restore();

  const g = ctx.createLinearGradient(0, baseY, 0, topY);
  g.addColorStop(0, 'rgba('+rgb+',.96)');
  g.addColorStop(.42, 'rgba('+rgb+',.80)');
  g.addColorStop(.78, 'rgba('+rgb+',.34)');
  g.addColorStop(1, 'rgba('+rgb+',0)');

  ctx.save();
  ctx.shadowColor='rgb('+rgb+')';
  ctx.shadowBlur=14+20*e;
  ctx.fillStyle=g;
  ctx.beginPath();
  ctx.roundRect(laneCenter-width/2, topY, width, height, 10);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle='rgba('+rgb+',.92)';
  ctx.lineWidth=2+1.2*e;
  ctx.beginPath();
  ctx.moveTo(laneCenter-width*.46, baseY-1);
  ctx.lineTo(laneCenter+width*.46, baseY-1);
  ctx.stroke();
  ctx.restore();

  return {center:[laneCenter, baseY-height*0.42], baseY, width, height};
}

function drawImageFit(im, x, y, boxW, boxH, anchor='bottom'){
  if(!im) return;
  const iw = im.naturalWidth || im.width, ih = im.naturalHeight || im.height;
  const scale = Math.min(boxW/iw, boxH/ih);
  const dw = iw*scale, dh = ih*scale;
  const dx = x - dw/2;
  const dy = anchor === 'center' ? y-dh/2 : y-dh;
  ctx.drawImage(im, dx, dy, dw, dh);
}

function drawRows(){
  state.rows.forEach((row, i) => {
    const z = (i*state.rowGap + roadTime*state.speed*0.80) % 1;
    if(z < 0.07 || z > 0.89) return;
    const left = drawRaisedPad(z, 'left', row.leftColor);
    const right = drawRaisedPad(z, 'right', row.rightColor);
    const leftSize = Math.min(row.leftSize*(0.72+0.40*z), left.width*0.88);
    const rightSize = Math.min(row.rightSize*(0.72+0.40*z), right.width*0.88);
    if(row.leftImg) drawImageFit(row.leftImg, left.center[0], left.baseY-8, leftSize, leftSize, 'bottom');
    if(row.rightImg) drawImageFit(row.rightImg, right.center[0], right.baseY-8, rightSize, rightSize, 'bottom');
  });
}

function frame(now){
  const dt = Math.min(0.05, (now-last)/1000);
  last = now;
  if(running) roadTime += dt;
  drawBackground();
  drawRoad();
  drawRows();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

$('playBtn').onclick = () => { running = !running; $('playBtn').textContent = running ? 'Pause' : 'Play'; };
$('resetBtn').onclick = () => roadTime = 0;
$('saveBtn').onclick = () => {
  const save = {...state, rows: state.rows.map(r => ({...r, leftImg:null, rightImg:null}))};
  localStorage.setItem('runnerStudioV6FrontBase5Highways', JSON.stringify(save));
  alert('Saved on this device');
};
$('loadBtn').onclick = async () => {
  const raw = localStorage.getItem('runnerStudioV6FrontBase5Highways');
  if(!raw) return alert('No save found on this device');
  const s = JSON.parse(raw);
  Object.assign(state, s);
  ['speed','roadWidth','horizon','perspectivePower','padLift','padThickness','rowGap'].forEach(id => $(id).value = state[id]);
  $('speedLines').checked = state.speedLines;
  $('roadShine').checked = state.roadShine;
  $('highwayVariant').value = state.highwayVariant || 'base';
  $('backgroundMode').value = state.backgroundMode || 'black';
  state.rows = (s.rows && s.rows.length === 5) ? s.rows : defaultRows();
  renderRows();
  for(const row of state.rows){
    if(row.leftSrc) row.leftImg = await dataToProcessedImage(row.leftSrc, row.leftRemove !== false);
    if(row.rightSrc) row.rightImg = await dataToProcessedImage(row.rightSrc, row.rightRemove !== false);
  }
  alert('Loaded');
};
$('logoutBtn').onclick = async () => { await fetch('/api/logout', {method:'POST'}); location.href='/'; };
$('exportBtn').onclick = () => {
  if(recorder) return;
  const sec = Math.max(2, Math.min(60, +$('recordSec').value || 15));
  const stream = canvas.captureStream(30);
  let mime='video/webm;codecs=vp9';
  if(!MediaRecorder.isTypeSupported(mime)) mime='video/webm';
  const chunks=[];
  recorder = new MediaRecorder(stream, {mimeType:mime, videoBitsPerSecond:9000000});
  recorder.ondataavailable = e => { if(e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(chunks, {type:mime});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'runner-video.webm';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    recorder = null;
    $('exportBtn').textContent = 'Export Video';
  };
  recorder.start();
  $('exportBtn').textContent = 'Recording...';
  setTimeout(() => { if(recorder && recorder.state !== 'inactive') recorder.stop(); }, sec*1000);
};
})();
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(u.pathname);

  if(pathname === '/api/auth/status' && req.method === 'GET'){
    return send(res, 200, JSON.stringify({authenticated: authed(req)}), 'application/json; charset=utf-8');
  }
  if(pathname === '/api/login' && req.method === 'POST'){
    try{
      const body = await readJson(req);
      if(!safeEqual(body.password || '', APP_PASSWORD)){
        return send(res, 401, JSON.stringify({ok:false,error:'Wrong password'}), 'application/json; charset=utf-8');
      }
      const cookie = [
        `runner_session=${encodeURIComponent(makeSession())}`,
        'Path=/',
        'HttpOnly',
        'SameSite=Strict',
        `Max-Age=${Math.floor(SESSION_MS/1000)}`,
        IS_PROD ? 'Secure' : ''
      ].filter(Boolean).join('; ');
      return send(res, 200, JSON.stringify({ok:true}), 'application/json; charset=utf-8', {'Set-Cookie': cookie});
    } catch {
      return send(res, 400, JSON.stringify({ok:false}), 'application/json; charset=utf-8');
    }
  }
  if(pathname === '/api/logout' && req.method === 'POST'){
    return send(res, 200, JSON.stringify({ok:true}), 'application/json; charset=utf-8', {'Set-Cookie': `runner_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${IS_PROD?'; Secure':''}`});
  }
  if((pathname === '/' || pathname === '/app') && req.method === 'GET'){
    if(pathname === '/app' && !authed(req)){
      res.writeHead(302, {Location:'/'});
      return res.end();
    }
    return send(res, 200, authed(req) ? APP_HTML : LOGIN_HTML, 'text/html; charset=utf-8');
  }
  return send(res, 404, 'Not found');
});

server.listen(PORT, () => console.log(`Private Runner Studio V6 Front Base + 5 Highways running on http://localhost:${PORT}`));
