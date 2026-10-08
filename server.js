const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const APP_PASSWORD = process.env.APP_PASSWORD || 'change-me-now';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookies(req){
  var out={};
  (req.headers.cookie||'').split(';').forEach(function(p){
    var i=p.indexOf('=');
    if(i>0) out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim());
  });
  return out;
}
function safeEqual(a,b){
  var aa=Buffer.from(String(a)), bb=Buffer.from(String(b));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
function verifySession(token){
  if(!token) return false;
  var p=token.split('.');
  if(p.length!==3) return false;
  var exp=p[0], nonce=p[1], sig=p[2];
  var payload=exp + '.' + nonce;
  var expected=crypto.createHmac('sha256',SESSION_SECRET).update(payload).digest('hex');
  return safeEqual(sig,expected) && Number(exp)>Date.now();
}
function authed(req){return verifySession(parseCookies(req).runner_session);}
function send(res,status,body,type,headers){
  type = type || 'text/plain; charset=utf-8';
  headers = headers || {};
  res.writeHead(status, Object.assign({
    'Content-Type':type,
    'Cache-Control':'no-store, no-cache, must-revalidate',
    'Connection':'keep-alive'
  }, headers));
  res.end(body);
}

const LOGIN_HTML = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Private Runner Studio</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;background:radial-gradient(circle at 50% 15%,#174f37 0,#0c0e12 43%);font-family:Inter,system-ui,sans-serif;color:#f7f8fb}.card{width:min(100%,410px);padding:30px;border:1px solid #30353f;border-radius:24px;background:#17191f;box-shadow:0 30px 90px #0008}.mark{width:54px;height:54px;border-radius:17px;display:grid;place-items:center;background:#61f0a6;color:#08130d;font-weight:900;font-size:28px}.card h1{font-size:34px;line-height:1.05;margin:24px 0 8px}.muted{color:#9da4b0;font-size:18px;margin:0 0 28px}label{display:grid;gap:10px;font-size:16px}input{width:100%;padding:16px;border-radius:14px;border:1px solid #343943;background:#0e1014;color:white;font-size:18px}button{width:100%;margin-top:16px;padding:16px;border:0;border-radius:14px;background:#61f0a6;color:#07110c;font-size:19px;font-weight:900}.msg{min-height:22px;color:#ff8f8f;margin-top:12px}</style></head><body><main class="card"><div class="mark">R</div><h1>Private Runner Studio</h1><p class="muted">Owner access only</p><form id="f"><label>Password<input id="p" type="password" autocomplete="current-password" placeholder="Enter your password"></label><button>Unlock Studio</button><div class="msg" id="m"></div></form></main><script>f.onsubmit=async function(e){e.preventDefault();m.textContent="";var r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:p.value})});if(r.ok)location.href="/app";else m.textContent="Wrong password";};</script></body></html>';

const APP_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Private Runner Studio Complete Edition</title>
<style>
:root{--bg:#0b0d10;--panel:#15181e;--panel2:#1b1f27;--text:#f6f8fb;--muted:#9ca5b2;--line:#2b303a;--accent:#61f0a6;--red:#ff4d4d;--gold:#ffbe1a;--blue:#38bdf8}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif;overflow-x:hidden}
.top{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 14px;background:#0b0d10ee;border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}
.top strong{font-size:18px}.badge{font-size:11px;color:#07110c;background:var(--accent);border-radius:99px;padding:4px 7px;margin-left:6px;font-weight:900}
.top-actions{display:flex;gap:7px}.top button,.transport button,.rowbar button{border:1px solid var(--line);background:#222731;color:white;border-radius:11px;padding:9px 12px;font:inherit;cursor:pointer}
.top .primary,.transport .primary{background:var(--accent);color:#07110c;border-color:transparent;font-weight:800}

.studio{max-width:1420px;margin:auto;padding:14px;display:grid;grid-template-columns:minmax(320px,500px) minmax(360px,1fr);gap:16px}
.preview{min-width:0}.shell{background:#050607;border:1px solid var(--line);border-radius:18px;padding:7px;display:flex;justify-content:center;box-shadow:0 18px 60px #0007}
.stageWrap{width:min(100%,460px);aspect-ratio:9/16;border-radius:13px;overflow:hidden;background:#050506;position:relative}
canvas{width:100%;height:100%;display:block;transform:translateZ(0);backface-visibility:hidden}

.steer-box{margin-top:10px;padding:12px;background:#15181e;border:1px solid var(--line);border-radius:14px;display:grid;gap:8px}
.steer-header{display:flex;justify-content:space-between;align-items:center;font-size:13px;font-weight:700}
.steer-btns{display:grid;grid-template-columns:1fr 1.1fr 1fr;gap:6px}
.steer-btn{padding:11px 6px;border-radius:9px;border:1px solid #333a46;background:#1e242d;color:white;font-weight:800;font-size:12px;cursor:pointer;user-select:none;transition:0.1s transform}
.steer-btn:active{transform:scale(0.96)}
.steer-btn.left{border-color:#2aff84;color:#2aff84}
.steer-btn.center{border-color:var(--blue);color:var(--blue)}
.steer-btn.right{border-color:#ff4d4d;color:#ff4d4d}

.transport{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}
.transport input[type=number]{width:70px;padding:9px;background:#fff;color:#111;border-radius:8px;border:0}
.scrub-box{width:100%;margin-top:6px;display:flex;align-items:center;gap:10px;background:#15181e;padding:8px 12px;border:1px solid var(--line);border-radius:12px}
.scrub-box span{font-size:12px;font-weight:700;color:var(--accent);white-space:nowrap}
.note{font-size:12px;color:var(--muted);line-height:1.45;margin-top:8px}

.controls{display:flex;flex-direction:column;gap:12px;min-width:0}

.drag-card{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--panel);transition:transform 0.15s, opacity 0.15s}
.drag-card.dragging{opacity:0.35;border-color:var(--accent)}
.drag-card.drag-over{border-color:var(--accent);transform:translateY(5px)}

summary{padding:12px 14px;background:var(--panel2);font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:space-between;user-select:none}
.drag-handle{cursor:grab;color:#a2adc1;font-size:12px;font-weight:bold;padding:5px 10px;border-radius:7px;background:#242a35;border:1px solid #3c4454;margin-left:auto;user-select:none}
.drag-handle:hover{background:#323b4a;color:var(--accent);border-color:var(--accent)}
.drag-handle:active{cursor:grabbing}

.grid{padding:13px;display:grid;gap:12px}.grid.two{grid-template-columns:repeat(auto-fit, minmax(240px, 1fr))}.grid label,.side label{display:grid;gap:6px;color:#d7dbe2;font-size:13px;min-width:0}
.label-head{display:flex;justify-content:space-between;align-items:center}
.val-badge{font-size:11px;background:#242a35;color:var(--accent);padding:2px 7px;border-radius:6px;font-family:monospace;font-weight:700}
.val-badge.red{color:var(--red)}
.val-badge.gold{color:var(--gold)}

.range-wrap{display:flex;align-items:center;gap:6px;width:100%}
.range-wrap input[type=range]{
  flex:1;
  min-width:70px;
  -webkit-appearance:none;
  appearance:none;
  height:7px;
  border-radius:6px;
  background:#262c37;
  outline:none;
  transition:background 0.2s;
  cursor:pointer;
}
.range-wrap input[type=range]:hover{background:#323a49}
.range-wrap input[type=range]::-webkit-slider-thumb{
  -webkit-appearance:none;
  appearance:none;
  width:18px;
  height:18px;
  border-radius:50%;
  background:var(--accent);
  box-shadow:0 0 10px rgba(97,240,166,0.6);
  cursor:pointer;
  transition:transform 0.1s, box-shadow 0.1s;
}

.step-btn{border:1px solid var(--line);background:#1e232d;color:#f6f8fb;border-radius:8px;width:30px;height:30px;display:grid;place-items:center;cursor:pointer;font-size:11px;font-weight:bold;user-select:none;flex-shrink:0}
.step-btn:hover{background:#2a313f;color:var(--accent);border-color:var(--accent)}

.file-wrap{display:flex;align-items:center;gap:8px;width:100%;flex-wrap:wrap}
.file-wrap input[type=file]{flex:1;min-width:140px;font-size:11px;color:#cbd5e1}
.thumb-box{width:44px;height:44px;border-radius:8px;border:1px dashed #404859;background:#0d0f14;display:grid;place-items:center;overflow:hidden;flex-shrink:0;position:relative}
.thumb-box img{width:100%;height:100%;object-fit:contain;display:none}
.thumb-box span{font-size:10px;color:#6b7280;font-weight:bold}
.clear-btn{border:1px solid #ff4d4d77;background:#2b1216;color:#ff9e9e;border-radius:8px;padding:6px 10px;font-size:11px;font-weight:bold;cursor:pointer;flex-shrink:0;transition:0.1s all}
.clear-btn:hover{background:#45141c;color:#fff;border-color:var(--red)}

select{padding:9px;background:#0f1217;color:white;border:1px solid var(--line);border-radius:8px;width:100%}
.toggle{display:flex!important;align-items:center;gap:8px!important}
.rowbar{padding:11px 13px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.rows{padding:11px;display:grid;gap:10px}.row{border:1px solid var(--line);border-radius:13px;padding:10px;background:#101318}.rowhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.sides{display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:10px}.side{background:#191d24;border-radius:10px;padding:10px;display:grid;gap:8px;min-width:0}.side b{font-size:12px}
.color-picker-wrap{display:flex;align-items:center;gap:10px}
.color-picker-wrap input[type=color]{border:0;padding:0;width:38px;height:34px;border-radius:6px;background:none;cursor:pointer}
.small{font-size:11px;color:var(--muted)}
.sub-title{grid-column:1/-1;padding:6px 0;font-weight:bold;font-size:13px;border-bottom:1px solid var(--line);margin-top:6px}

@media(max-width:880px){
  .studio{grid-template-columns:1fr;padding:8px}
  .top{padding:9px}
  .controls{padding-bottom:40px}
}
</style>
</head>
<body>
<header class="top">
  <div><strong>Private Runner Studio</strong><span class="badge">PRO EDITION</span></div>
  <div class="top-actions"><button id="saveBtn">Save State</button><button id="resetStorageBtn">Reset UI</button><button id="logoutBtn">Logout</button></div>
</header>
<main class="studio">
  <section class="preview">
    <div class="shell"><div class="stageWrap"><canvas id="stage" width="720" height="1280"></canvas></div></div>

    <div class="steer-box">
      <div class="steer-header">
        <span>⚡ Runner Steer (Keyboard: ◀ A | ▼ S (Center) | D ▶)</span>
        <span class="val-badge" id="v_laneSteer">-1.0 (Left)</span>
      </div>
      <div class="range-wrap">
        <button type="button" class="step-btn" data-step-for="laneSteer" data-dir="-1">◀</button>
        <input id="laneSteer" type="range" min="-1.0" max="1.0" step="0.05" value="-1.0">
        <button type="button" class="step-btn" data-step-for="laneSteer" data-dir="1">▶</button>
      </div>
      <div class="steer-btns">
        <button class="steer-btn left" id="quickLeftBtn">⬅ LEFT (A / ◀)</button>
        <button class="steer-btn center" id="quickCenterBtn">🎯 CENTER (S / Space / ▼)</button>
        <button class="steer-btn right" id="quickRightBtn">RIGHT (D / ▶) ➡️</button>
      </div>
    </div>

    <div class="transport">
      <button class="primary" id="playBtn">Pause</button>
      <button id="resetBtn">Reset Time</button>
      <label>Record sec <input id="recordSec" type="number" min="2" max="60" value="15"></label>
      <button id="exportBtn">Export 60FPS Video</button>
    </div>

    <!-- 🌟 TIMELINE SCRUBBER SLIDER -->
    <div class="scrub-box">
      <span>⏪ ⏩ Seek Time:</span>
      <input id="timeScrubber" type="range" min="0" max="25" step="0.05" value="0" style="flex:1">
      <span id="v_timeScrubber" class="val-badge">0.0s</span>
    </div>

    <div class="note"><b>सॉर्टिंग और सीक सक्रिय:</b> पैड की PNG ओवरलैप नहीं होंगी और स्लाइडर से कभी भी आगे-पीछे जाकर देख सकते हो!</div>
  </section>

  <section class="controls" id="panelsContainer">

    <!-- CARD 1: MYSTERY HUD -->
    <details class="drag-card" id="card_hud" open>
      <summary>
        <span>🎁 5 Mystery Question Boxes HUD Controller</span>
        <span class="drag-handle" draggable="true" title="Sirf ise pakad kar upar-niche khinchein">⠿ Drag</span>
      </summary>
      <div class="grid two">
        <label class="toggle"><input id="showHud" type="checkbox" checked> Show 5 Mystery Boxes</label>
        <label class="toggle"><input id="autoCollectHud" type="checkbox" checked> Auto Collect PNG from Pads</label>

        <label style="grid-column:1/-1">Box Style
          <select id="hudStyle">
            <optgroup label="--- Classic & Gold ---">
              <option value="classicGold" selected>1. Classic Mario Gold (?)</option>
              <option value="royalGold">2. Royal Amber Gold</option>
              <option value="arcadeYellow">3. 80s Arcade Bright Yellow</option>
              <option value="bronzeVintage">4. Vintage Bronze Box</option>
              <option value="pureWhiteBox">5. Clean Minimal White</option>
            </optgroup>
            <optgroup label="--- Neon & Cyberpunk ---">
              <option value="neonGreen">6. Emerald Neon Pulse</option>
              <option value="cyberCyan">7. Cyber Cyan Circuit</option>
              <option value="laserRed">8. Laser Crimson Red</option>
              <option value="plasmaPink">9. Hot Plasma Pink</option>
              <option value="electricBlue">10. Electric Blue Thunder</option>
              <option value="violetNight">11. Synthwave Violet</option>
            </optgroup>
          </select>
        </label>

        <label>
          <span class="label-head"><span>HUD Y-Position</span><span class="val-badge gold" id="v_hudY">88</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="hudY" data-dir="-1">◀</button>
            <input id="hudY" type="range" min="30" max="300" value="88">
            <button type="button" class="step-btn" data-step-for="hudY" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Box Size</span><span class="val-badge gold" id="v_hudBoxSize">86</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="hudBoxSize" data-dir="-1">◀</button>
            <input id="hudBoxSize" type="range" min="45" max="140" value="86">
            <button type="button" class="step-btn" data-step-for="hudBoxSize" data-dir="1">▶</button>
          </div>
        </label>
        <label style="grid-column:1/-1">
          <span class="label-head"><span>Box Spacing</span><span class="val-badge gold" id="v_hudSpacing">12</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="hudSpacing" data-dir="-1">◀</button>
            <input id="hudSpacing" type="range" min="6" max="40" value="12">
            <button type="button" class="step-btn" data-step-for="hudSpacing" data-dir="1">▶</button>
          </div>
        </label>

        <div class="sub-title" style="color:var(--gold)">📁 Manual PNG Override for Boxes (With Auto BG Toggle)</div>
        
        <!-- BOX 1-5 OVERRIDES -->
        <label>Box 1 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_hud_0"><span>None</span><img src=""></div>
            <input id="hudImg_0" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_hud_0">✕ Clear</button>
          </div>
          <label class="toggle"><input id="hudRemove_0" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label>Box 2 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_hud_1"><span>None</span><img src=""></div>
            <input id="hudImg_1" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_hud_1">✕ Clear</button>
          </div>
          <label class="toggle"><input id="hudRemove_1" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label>Box 3 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_hud_2"><span>None</span><img src=""></div>
            <input id="hudImg_2" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_hud_2">✕ Clear</button>
          </div>
          <label class="toggle"><input id="hudRemove_2" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label>Box 4 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_hud_3"><span>None</span><img src=""></div>
            <input id="hudImg_3" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_hud_3">✕ Clear</button>
          </div>
          <label class="toggle"><input id="hudRemove_3" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label style="grid-column:1/-1">Box 5 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_hud_4"><span>None</span><img src=""></div>
            <input id="hudImg_4" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_hud_4">✕ Clear</button>
          </div>
          <label class="toggle"><input id="hudRemove_4" type="checkbox" checked> Auto remove bg</label>
        </label>
      </div>
    </details>

    <!-- CARD 2: RUNNER EVOLUTION -->
    <details class="drag-card" id="card_runner" open>
      <summary>
        <span>🏃 Runner Evolution Settings (With Auto BG Toggles)</span>
        <span class="drag-handle" draggable="true" title="Sirf ise pakad kar upar-niche khinchein">⠿ Drag</span>
      </summary>
      <div class="grid two">
        <label>Base Start PNG (Stage 0)
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_pImg_0"><span>None</span><img src=""></div>
            <input id="pImg_0" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_pImg_0">✕ Clear</button>
          </div>
          <label class="toggle"><input id="pRemove_0" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label>
          <span class="label-head"><span>Stage 0 Base Size</span><span class="val-badge" id="v_pSize_0">145</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="pSize_0" data-dir="-1">◀</button>
            <input id="pSize_0" type="range" min="40" max="800" value="145">
            <button type="button" class="step-btn" data-step-for="pSize_0" data-dir="1">▶</button>
          </div>
        </label>

        <label>Runner Lane Mode
          <select id="playerLane">
            <option value="slider" selected>Manual Live Slider (Fastest)</option>
            <option value="auto">Auto Follow Green Lane</option>
            <option value="left">Lock Left Lane</option>
            <option value="right">Lock Right Lane</option>
          </select>
        </label>
        <label>
          <span class="label-head"><span>Depth (Z-Position)</span><span class="val-badge" id="v_playerZ">0.86</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="playerZ" data-dir="-1">◀</button>
            <input id="playerZ" type="range" min="0.50" max="0.95" step="0.01" value="0.86">
            <button type="button" class="step-btn" data-step-for="playerZ" data-dir="1">▶</button>
          </div>
        </label>

        <!-- GREEN PAD UPGRADES 1-5 -->
        <div class="sub-title" style="color:#61f0a6">&#128170; GREEN PAD UPGRADES</div>
        
        <label>Green Stage 1 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_gImg_1"><span>None</span><img src=""></div>
            <input id="gImg_1" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_gImg_1">✕ Clear</button>
          </div>
          <label class="toggle"><input id="gRemove_1" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label>
          <span class="label-head"><span>Green 1 Size</span><span class="val-badge" id="v_gSize_1">165</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="gSize_1" data-dir="-1">◀</button>
            <input id="gSize_1" type="range" min="40" max="800" value="165">
            <button type="button" class="step-btn" data-step-for="gSize_1" data-dir="1">▶</button>
          </div>
        </label>

        <label>Green Stage 2 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_gImg_2"><span>None</span><img src=""></div>
            <input id="gImg_2" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_gImg_2">✕ Clear</button>
          </div>
          <label class="toggle"><input id="gRemove_2" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label>
          <span class="label-head"><span>Green 2 Size</span><span class="val-badge" id="v_gSize_2">190</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="gSize_2" data-dir="-1">◀</button>
            <input id="gSize_2" type="range" min="40" max="800" value="190">
            <button type="button" class="step-btn" data-step-for="gSize_2" data-dir="1">▶</button>
          </div>
        </label>

        <label>Green Stage 3 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_gImg_3"><span>None</span><img src=""></div>
            <input id="gImg_3" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_gImg_3">✕ Clear</button>
          </div>
          <label class="toggle"><input id="gRemove_3" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label>
          <span class="label-head"><span>Green 3 Size</span><span class="val-badge" id="v_gSize_3">220</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="gSize_3" data-dir="-1">◀</button>
            <input id="gSize_3" type="range" min="40" max="800" value="220">
            <button type="button" class="step-btn" data-step-for="gSize_3" data-dir="1">▶</button>
          </div>
        </label>

        <label>Green Stage 4 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_gImg_4"><span>None</span><img src=""></div>
            <input id="gImg_4" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_gImg_4">✕ Clear</button>
          </div>
          <label class="toggle"><input id="gRemove_4" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label>
          <span class="label-head"><span>Green 4 Size</span><span class="val-badge" id="v_gSize_4">255</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="gSize_4" data-dir="-1">◀</button>
            <input id="gSize_4" type="range" min="40" max="800" value="255">
            <button type="button" class="step-btn" data-step-for="gSize_4" data-dir="1">▶</button>
          </div>
        </label>

        <label>Green Stage 5 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_gImg_5"><span>None</span><img src=""></div>
            <input id="gImg_5" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_gImg_5">✕ Clear</button>
          </div>
          <label class="toggle"><input id="gRemove_5" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label>
          <span class="label-head"><span>Green 5 Size</span><span class="val-badge" id="v_gSize_5">290</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="gSize_5" data-dir="-1">◀</button>
            <input id="gSize_5" type="range" min="40" max="800" value="290">
            <button type="button" class="step-btn" data-step-for="gSize_5" data-dir="1">▶</button>
          </div>
        </label>

        <!-- RED PAD DOWNGRADES 1-5 -->
        <div class="sub-title" style="color:#ff6b6b">&#128128; RED PAD DOWNGRADES</div>

        <label>Red Stage 1 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_rImg_1"><span>None</span><img src=""></div>
            <input id="rImg_1" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_rImg_1">✕ Clear</button>
          </div>
          <label class="toggle"><input id="rRemove_1" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label>
          <span class="label-head"><span>Red 1 Size</span><span class="val-badge red" id="v_rSize_1">130</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="rSize_1" data-dir="-1">◀</button>
            <input id="rSize_1" type="range" min="40" max="800" value="130">
            <button type="button" class="step-btn" data-step-for="rSize_1" data-dir="1">▶</button>
          </div>
        </label>

        <label>Red Stage 2 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_rImg_2"><span>None</span><img src=""></div>
            <input id="rImg_2" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_rImg_2">✕ Clear</button>
          </div>
          <label class="toggle"><input id="rRemove_2" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label>
          <span class="label-head"><span>Red 2 Size</span><span class="val-badge red" id="v_rSize_2">115</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="rSize_2" data-dir="-1">◀</button>
            <input id="rSize_2" type="range" min="40" max="800" value="115">
            <button type="button" class="step-btn" data-step-for="rSize_2" data-dir="1">▶</button>
          </div>
        </label>

        <label>Red Stage 3 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_rImg_3"><span>None</span><img src=""></div>
            <input id="rImg_3" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_rImg_3">✕ Clear</button>
          </div>
          <label class="toggle"><input id="rRemove_3" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label>
          <span class="label-head"><span>Red 3 Size</span><span class="val-badge red" id="v_rSize_3">100</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="rSize_3" data-dir="-1">◀</button>
            <input id="rSize_3" type="range" min="40" max="800" value="100">
            <button type="button" class="step-btn" data-step-for="rSize_3" data-dir="1">▶</button>
          </div>
        </label>

        <label>Red Stage 4 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_rImg_4"><span>None</span><img src=""></div>
            <input id="rImg_4" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_rImg_4">✕ Clear</button>
          </div>
          <label class="toggle"><input id="rRemove_4" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label>
          <span class="label-head"><span>Red 4 Size</span><span class="val-badge red" id="v_rSize_4">85</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="rSize_4" data-dir="-1">◀</button>
            <input id="rSize_4" type="range" min="40" max="800" value="85">
            <button type="button" class="step-btn" data-step-for="rSize_4" data-dir="1">▶</button>
          </div>
        </label>

        <label>Red Stage 5 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_rImg_5"><span>None</span><img src=""></div>
            <input id="rImg_5" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_rImg_5">✕ Clear</button>
          </div>
          <label class="toggle"><input id="rRemove_5" type="checkbox" checked> Auto remove bg</label>
        </label>
        <label>
          <span class="label-head"><span>Red 5 Size</span><span class="val-badge red" id="v_rSize_5">75</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="rSize_5" data-dir="-1">◀</button>
            <input id="rSize_5" type="range" min="40" max="800" value="75">
            <button type="button" class="step-btn" data-step-for="rSize_5" data-dir="1">▶</button>
          </div>
        </label>
      </div>
    </details>

    <!-- CARD 3: HIGHWAY & CAMERA -->
    <details class="drag-card" id="card_highway" open>
      <summary>
        <span>🛣️ Moving Highway & Perspective</span>
        <span class="drag-handle" draggable="true" title="Sirf ise pakad kar upar-niche khinchein">⠿ Drag</span>
      </summary>
      <div class="grid two">
        <label>
          <span class="label-head"><span>Forward speed</span><span class="val-badge" id="v_speed">0.20</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="speed" data-dir="-1">◀</button>
            <input id="speed" type="range" min="0.10" max="0.50" step="0.01" value="0.20">
            <button type="button" class="step-btn" data-step-for="speed" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Horizon Height (सड़क की लंबाई)</span><span class="val-badge" id="v_horizon">0.31</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="horizon" data-dir="-1">◀</button>
            <input id="horizon" type="range" min="0.15" max="0.75" step="0.01" value="0.31">
            <button type="button" class="step-btn" data-step-for="horizon" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Top Width (सीधी सड़क की चौड़ाई)</span><span class="val-badge" id="v_topWidth">0.14</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="topWidth" data-dir="-1">◀</button>
            <input id="topWidth" type="range" min="0.04" max="0.35" step="0.005" value="0.14">
            <button type="button" class="step-btn" data-step-for="topWidth" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Bottom Width (निचली चौड़ाई)</span><span class="val-badge" id="v_bottomWidth">0.98</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="bottomWidth" data-dir="-1">◀</button>
            <input id="bottomWidth" type="range" min="0.50" max="1.15" step="0.02" value="0.98">
            <button type="button" class="step-btn" data-step-for="bottomWidth" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Camera Height</span><span class="val-badge" id="v_camHeight">0.95</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="camHeight" data-dir="-1">◀</button>
            <input id="camHeight" type="range" min="0.5" max="3.0" step="0.05" value="0.95">
            <button type="button" class="step-btn" data-step-for="camHeight" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Pad delay</span><span class="val-badge" id="v_padDelay">2.40</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="padDelay" data-dir="-1">◀</button>
            <input id="padDelay" type="range" min="1.10" max="3.50" step="0.05" value="2.40">
            <button type="button" class="step-btn" data-step-for="padDelay" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Pad glow base</span><span class="val-badge" id="v_padThickness">14</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="padThickness" data-dir="-1">◀</button>
            <input id="padThickness" type="range" min="6" max="28" value="14">
            <button type="button" class="step-btn" data-step-for="padThickness" data-dir="1">▶</button>
          </div>
        </label>
        <label>Road style (35+ Roads) <select id="roadVariant">
          <optgroup label="--- Classic & Highway ---">
            <option value="classic" selected>1. Classic V6 (Lion Challenge)</option>
            <option value="twinStripe">2. Twin Yellow Stripes</option>
            <option value="tripleLane">3. Triple Fast Lane</option>
            <option value="asphaltSpeed">4. Speed Asphalt Pro</option>
            <option value="midnightHighway">5. Midnight Highway</option>
          </optgroup>
          <optgroup label="--- Neon & Cyberpunk ---">
            <option value="neonPulse">6. Neon Pulse Glow</option>
            <option value="edgeGlow">7. Emerald Edge Glow</option>
            <option value="arcadeGrid">8. Tron Arcade Grid</option>
            <option value="railRunner">9. Rail Runner Lightbeam</option>
            <option value="chevronRush">10. Chevron Rush Neon</option>
            <option value="cyberViolet">11. Cyber Violet Drift</option>
          </optgroup>
        </select></label>
        <label style="grid-column:1/-1">Background Theme <select id="bgMode">
          <optgroup label="--- Light & Aesthetic Themes ---">
            <option value="cleanWhite">☀️ 1. Clean Studio White</option>
            <option value="softSilver">☀️ 2. Soft Silver Mist</option>
            <option value="cloudGrey">☀️ 3. Cloud Grey</option>
            <option value="skyBlueLight">☀️ 4. Clear Sky Blue</option>
            <option value="cyanBreeze">☀️ 5. Light Cyan Breeze</option>
          </optgroup>
          <optgroup label="--- 50+ Dark Themes ---">
            <option value="black" selected>1. Pitch Black</option>
            <option value="midnight">2. Midnight Void</option>
            <option value="obsidian">3. Obsidian Matte</option>
            <option value="deepSpace">4. Deep Space Abyss</option>
          </optgroup>
        </select></label>
        <label class="toggle"><input id="speedLines" type="checkbox"> Motion streaks</label>
        <label class="toggle"><input id="roadShine" type="checkbox" checked> Road highlights</label>
      </div>
    </details>

    <!-- CARD 4: 5 ROWS + BOSS -->
    <details class="drag-card" id="card_rows" open>
      <summary>
        <span>🚦 5 Fixed Rows + Opponent Boss Timing</span>
        <span class="drag-handle" draggable="true" title="Sirf ise pakad kar upar-niche khinchein">⠿ Drag</span>
      </summary>
      <div class="rowbar">
        <span class="small">5 main rows with custom color pickers & live size values + Stationary Boss.</span>
        
        <div style="width:100%;margin-top:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-weight:bold;font-size:12px;color:var(--accent)">⚡ Master All Pads PNG Size:</span>
          <div class="range-wrap" style="flex:1;min-width:140px">
            <button type="button" class="step-btn" data-step-for="masterPadPngSize" data-dir="-1">◀</button>
            <input id="masterPadPngSize" type="range" min="45" max="450" value="95">
            <button type="button" class="step-btn" data-step-for="masterPadPngSize" data-dir="1">▶</button>
          </div>
          <span class="val-badge" id="v_masterPadPngSize">95</span>
        </div>

        <div style="width:100%;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-weight:bold;font-size:12px;color:var(--gold)">⏱️ Boss Walk Distance:</span>
          <div class="range-wrap" style="flex:1;min-width:140px">
            <button type="button" class="step-btn" data-step-for="bossDistance" data-dir="-1">◀</button>
            <input id="bossDistance" type="range" min="1.0" max="6.0" step="0.2" value="2.8">
            <button type="button" class="step-btn" data-step-for="bossDistance" data-dir="1">▶</button>
          </div>
          <span class="val-badge gold" id="v_bossDistance">2.8s</span>
          <div class="small" style="width:100%;color:var(--muted)">5वें पैड के जाने के बाद लड़ाई के बीच का गैप (सेकंड में)।</div>
        </div>
      </div>
      <div id="rows" class="rows"></div>
    </details>

  </section>
</main>

<template id="rowTemplate">
  <div class="row">
    <div class="rowhead"><strong class="rowtitle">Row</strong><span class="small">custom color pads</span></div>
    <div class="sides">
      <div class="side">
        <b>LEFT PAD</b>
        <label>Pad Color
          <div class="color-picker-wrap">
            <input class="leftColor" type="color" value="#2aff84">
            <span class="leftColorVal small">#2aff84</span>
          </div>
        </label>
        <label>PNG
          <div class="file-wrap">
            <div class="thumb-box thumb-left"><span>None</span><img src=""></div>
            <input class="leftInput" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn clear-left">✕ Clear</button>
          </div>
        </label>
        <label class="toggle"><input class="leftRemove" type="checkbox" checked> Auto remove bg</label>
        <label>
          <span class="label-head"><span>Size</span><span class="val-badge leftSizeVal">95</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn step-left-minus">◀</button>
            <input class="leftSize" type="range" min="45" max="450" value="95">
            <button type="button" class="step-btn step-left-plus">▶</button>
          </div>
        </label>
      </div>
      <div class="side">
        <b>RIGHT PAD</b>
        <label>Pad Color
          <div class="color-picker-wrap">
            <input class="rightColor" type="color" value="#ff323a">
            <span class="rightColorVal small">#ff323a</span>
          </div>
        </label>
        <label>PNG
          <div class="file-wrap">
            <div class="thumb-box thumb-right"><span>None</span><img src=""></div>
            <input class="rightInput" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn clear-right">✕ Clear</button>
          </div>
        </label>
        <label class="toggle"><input class="rightRemove" type="checkbox" checked> Auto remove bg</label>
        <label>
          <span class="label-head"><span>Size</span><span class="val-badge rightSizeVal">95</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn step-right-minus">◀</button>
            <input class="rightSize" type="range" min="45" max="450" value="95">
            <button type="button" class="step-btn step-right-plus">▶</button>
          </div>
        </label>
      </div>
    </div>
  </div>
</template>

<template id="opponentTemplate">
  <div class="row" style="border-color:#61f0a6">
    <div class="rowhead"><strong style="color:#61f0a6">&#128293; Opponent Boss</strong><span class="small">Stationary at Road End</span></div>
    <div class="side" style="grid-column:span 2">
      <b>OPPONENT CHARACTER PNG</b>
      <label>PNG (Pad 2 क्रॉस होते ही दिखेगा और कैरेक्टर इसके ऊपर टच करेगा)
        <div class="file-wrap">
          <div class="thumb-box" id="thumb_oppImg"><span>None</span><img src=""></div>
          <input class="oppInput" type="file" accept="image/png,image/webp,image/jpeg">
          <button type="button" class="clear-btn" id="clear_oppImg">✕ Clear</button>
        </div>
      </label>
      <label class="toggle"><input class="oppRemove" type="checkbox" checked> Auto remove bg</label>
      <div class="small" style="color:var(--accent);margin-top:4px">⚡ Size automatically runner se thoda sa bada (1.18x) lock rahega!</div>
    </div>
  </div>
</template>

<script>
(function(){
var canvas=document.getElementById('stage');
var ctx=canvas.getContext('2d', { alpha: false });
var W=canvas.width, H=canvas.height;
var $=function(id){ return document.getElementById(id); };

var running=true, last=performance.now(), roadTime=0, recorder=null, rowCounter=0;

var currentPath = 'base';
var currentStageLevel = 0;
var processedPads = {};

var collectedHud = [null, null, null, null, null];
var manualHudImgs = [null, null, null, null, null];
var rawHudSrcs = [null, null, null, null, null];
var hudRemoveFlags = [true, true, true, true, true];

var state={
  speed:0.20,
  horizon:0.31,
  topWidth:0.14,
  bottomWidth:0.98,
  camHeight:0.95,
  padDelay:2.40,
  padThickness:14,
  bossDistance:2.8,
  roadVariant:'classic',
  bgMode:'black',
  speedLines:false,
  roadShine:true,
  showHud:true,
  autoCollectHud:true,
  hudStyle:'classicGold',
  hudY:88,
  hudBoxSize:86,
  hudSpacing:12,
  steerOffset:-1.0,
  baseStage: {img:null, rawSrc:null, removeBg:true, size:145},
  greenStages:[
    null,
    {img:null, rawSrc:null, removeBg:true, size:165},
    {img:null, rawSrc:null, removeBg:true, size:190},
    {img:null, rawSrc:null, removeBg:true, size:220},
    {img:null, rawSrc:null, removeBg:true, size:255},
    {img:null, rawSrc:null, removeBg:true, size:290}
  ],
  redStages:[
    null,
    {img:null, rawSrc:null, removeBg:true, size:130},
    {img:null, rawSrc:null, removeBg:true, size:115},
    {img:null, rawSrc:null, removeBg:true, size:100},
    {img:null, rawSrc:null, removeBg:true, size:85},
    {img:null, rawSrc:null, removeBg:true, size:75}
  ],
  playerZ:0.86,
  playerLane:'slider',
  playerX:W/2,
  currentLane:'left',
  rows:[],
  opponent:{src:null, img:null, removeBg:true, size:220}
};

var hudThemes = {
  classicGold: { border:'#ff9900', face:'#ffbe1a', stroke:'#221100', text:'#110800', glow:'rgba(255,190,26,0.6)' },
  royalGold: { border:'#d97706', face:'#fbbf24', stroke:'#451a03', text:'#451a03', glow:'rgba(251,191,36,0.6)' },
  arcadeYellow: { border:'#eab308', face:'#fef08a', stroke:'#000000', text:'#000000', glow:'rgba(234,179,8,0.7)' },
  bronzeVintage: { border:'#78350f', face:'#b45309', stroke:'#1c0b02', text:'#fef3c7', glow:'rgba(180,83,9,0.5)' },
  pureWhiteBox: { border:'#94a3b8', face:'#f8fafc', stroke:'#0f172a', text:'#0f172a', glow:'rgba(248,250,252,0.6)' },
  neonGreen: { border:'#15803d', face:'#22c55e', stroke:'#052e16', text:'#021f0e', glow:'rgba(34,197,94,0.8)' },
  cyberCyan: { border:'#0284c7', face:'#00f5ff', stroke:'#082f49', text:'#041f30', glow:'rgba(0,245,255,0.8)' },
  laserRed: { border:'#b91c1c', face:'#ef4444', stroke:'#450a0a', text:'#240202', glow:'rgba(239,68,68,0.8)' },
  plasmaPink: { border:'#be185d', face:'#f43f5e', stroke:'#4c0519', text:'#26020c', glow:'rgba(244,63,94,0.8)' },
  electricBlue: { border:'#1d4ed8', face:'#3b82f6', stroke:'#0f172a', text:'#06142e', glow:'rgba(59,130,246,0.8)' },
  violetNight: { border:'#6d28d9', face:'#8b5cf6', stroke:'#2e1065', text:'#1a043d', glow:'rgba(139,92,246,0.8)' }
};

var bgColors = {
  cleanWhite: ['#ffffff', '#f1f3f5'],
  softSilver: ['#f8f9fa', '#e9ecef'],
  cloudGrey: ['#edf2f7', '#cbd5e1'],
  skyBlueLight: ['#e0f2fe', '#bae6fd'],
  cyanBreeze: ['#ecfeff', '#cffafe'],
  black: ['#000000', '#050505'],
  midnight: ['#000000', '#05070c'],
  obsidian: ['#0a0a0f', '#12121a'],
  deepSpace: ['#010204', '#080c14']
};

function hexToRgb(hex){
  var c = String(hex || '#2aff84').replace('#','');
  if(c.length===3) c = c.charAt(0)+c.charAt(0)+c.charAt(1)+c.charAt(1)+c.charAt(2)+c.charAt(2);
  var num = parseInt(c, 16);
  if(isNaN(num)) return {r:42, g:255, b:132};
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function updateBadge(key, val){
  var el = $('v_' + key);
  if(el){
    if(key === 'bossDistance') el.textContent = val + 's';
    else el.textContent = val;
  }
}

function updateThumbBox(boxEl, src){
  if(!boxEl) return;
  var im = boxEl.querySelector('img');
  var txt = boxEl.querySelector('span');
  if(src){
    if(im){ im.src = src; im.style.display = 'block'; }
    if(txt){ txt.style.display = 'none'; }
    boxEl.style.borderColor = '#61f0a6';
  } else {
    if(im){ im.src = ''; im.style.display = 'none'; }
    if(txt){ txt.style.display = 'block'; }
    boxEl.style.borderColor = '#404859';
  }
}

function stepSlider(inp, dir){
  if(!inp) return;
  var step = parseFloat(inp.step) || 1;
  var min = parseFloat(inp.min) !== undefined ? parseFloat(inp.min) : -Infinity;
  var max = parseFloat(inp.max) !== undefined ? parseFloat(inp.max) : Infinity;
  var cur = parseFloat(inp.value) || 0;
  var next = cur + dir * step;
  if(next < min) next = min;
  if(next > max) next = max;
  var decimals = (step.toString().split('.')[1] || '').length;
  inp.value = Number(next.toFixed(decimals));
  inp.dispatchEvent(new Event('input', {bubbles:true}));
}

document.addEventListener('click', function(e){
  var btn = e.target.closest('.step-btn');
  if(!btn) return;
  var stepFor = btn.getAttribute('data-step-for');
  var dir = parseInt(btn.getAttribute('data-dir'), 10) || 1;
  if(stepFor){
    var targetInput = $(stepFor);
    if(targetInput) stepSlider(targetInput, dir);
  }
});

function setRunnerLane(val, name){
  state.steerOffset = val;
  var inp = $('laneSteer');
  if(inp) inp.value = val;
  state.playerLane = 'slider';
  if($('playerLane')) $('playerLane').value = 'slider';
  updateBadge('laneSteer', val.toFixed(1) + ' (' + name + ')');
  autoSaveStudio();
}

window.addEventListener('keydown', function(e){
  if(e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  var k = e.key.toLowerCase();
  if(k === 'arrowleft' || k === 'a'){ setRunnerLane(-1.0, 'Left'); }
  else if(k === 'arrowright' || k === 'd'){ setRunnerLane(1.0, 'Right'); }
  else if(k === 'arrowdown' || k === 's' || k === ' '){ e.preventDefault(); setRunnerLane(0.0, 'Center'); }
});

function setupDragAndDrop(){
  var container = $('panelsContainer');
  if(!container) return;
  var draggedCard = null;
  var handles = container.querySelectorAll('.drag-handle');
  handles.forEach(function(handle){
    handle.addEventListener('dragstart', function(e){
      draggedCard = handle.closest('.drag-card');
      if(draggedCard){ draggedCard.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; }
    });
    handle.addEventListener('dragend', function(){
      if(draggedCard) draggedCard.classList.remove('dragging');
      container.querySelectorAll('.drag-card').forEach(function(c){ c.classList.remove('drag-over'); });
      draggedCard = null;
      saveCardOrder();
    });
  });

  var cards = container.querySelectorAll('.drag-card');
  cards.forEach(function(card){
    card.addEventListener('dragover', function(e){
      if(!draggedCard || draggedCard === card) return;
      e.preventDefault(); e.dataTransfer.dropEffect = 'move'; card.classList.add('drag-over');
    });
    card.addEventListener('dragleave', function(){ card.classList.remove('drag-over'); });
    card.addEventListener('drop', function(e){
      if(!draggedCard || draggedCard === card) return;
      e.preventDefault(); card.classList.remove('drag-over');
      var rect = card.getBoundingClientRect();
      var midY = rect.top + rect.height / 2;
      if(e.clientY < midY) container.insertBefore(draggedCard, card);
      else container.insertBefore(draggedCard, card.nextSibling);
      saveCardOrder();
    });
  });
}

function saveCardOrder(){
  var container = $('panelsContainer');
  if(!container) return;
  var order = Array.from(container.querySelectorAll('.drag-card')).map(function(c){ return c.id; });
  try{ localStorage.setItem('runner_studio_panel_order', JSON.stringify(order)); }catch(e){}
}
function restoreCardOrder(){
  try{
    var raw = localStorage.getItem('runner_studio_panel_order');
    if(!raw) return;
    var order = JSON.parse(raw);
    var container = $('panelsContainer');
    if(!container || !Array.isArray(order)) return;
    order.forEach(function(id){ var el = $(id); if(el) container.appendChild(el); });
  }catch(e){}
}

function autoSaveStudio(){
  try{
    var s = {
      speed: state.speed, horizon: state.horizon, topWidth: state.topWidth, bottomWidth: state.bottomWidth,
      camHeight: state.camHeight, padDelay: state.padDelay, padThickness: state.padThickness, bossDistance: state.bossDistance,
      roadVariant: state.roadVariant, bgMode: state.bgMode, speedLines: state.speedLines, roadShine: state.roadShine,
      showHud: state.showHud, autoCollectHud: state.autoCollectHud, hudStyle: state.hudStyle, hudY: state.hudY,
      hudBoxSize: state.hudBoxSize, hudSpacing: state.hudSpacing, playerZ: state.playerZ, playerLane: state.playerLane,
      steerOffset: state.steerOffset, baseSize: state.baseStage.size, baseRemove: state.baseStage.removeBg,
      gSizes: [0, state.greenStages[1].size, state.greenStages[2].size, state.greenStages[3].size, state.greenStages[4].size, state.greenStages[5].size],
      gRemoves: [true, state.greenStages[1].removeBg, state.greenStages[2].removeBg, state.greenStages[3].removeBg, state.greenStages[4].removeBg, state.greenStages[5].removeBg],
      rSizes: [0, state.redStages[1].size, state.redStages[2].size, state.redStages[3].size, state.redStages[4].size, state.redStages[5].size],
      rRemoves: [true, state.redStages[1].removeBg, state.redStages[2].removeBg, state.redStages[3].removeBg, state.redStages[4].removeBg, state.redStages[5].removeBg],
      hudRemoves: hudRemoveFlags,
      oppRemove: state.opponent.removeBg,
      rows: state.rows.map(function(r){ return { leftColor: r.leftColor, rightColor: r.rightColor, leftSize: r.leftSize, rightSize: r.rightSize, leftRemove: r.leftRemove, rightRemove: r.rightRemove }; })
    };
    localStorage.setItem('runner_studio_saved_v21', JSON.stringify(s));
  }catch(err){}
}

function getSavedSettings(){
  try{
    var raw = localStorage.getItem('runner_studio_saved_v21');
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}

function readFile(file){
  return new Promise(function(resolve,reject){
    var fr=new FileReader();
    fr.onload=function(){resolve(fr.result);};
    fr.onerror=reject;
    fr.readAsDataURL(file);
  });
}
function processImageDataUrl(dataUrl, removeBg){
  return new Promise(function(resolve,reject){
    var img=new Image();
    img.onload=function(){
      if(!removeBg){resolve(dataUrl);return;}
      var c=document.createElement('canvas');
      c.width=img.width; c.height=img.height;
      var cx=c.getContext('2d',{willReadFrequently:true});
      cx.drawImage(img,0,0);
      var id=cx.getImageData(0,0,c.width,c.height);
      var d=id.data;
      var sample=function(x,y){var i=(y*c.width+x)*4;return[d[i],d[i+1],d[i+2]];};
      var pts=[[0,0],[c.width-1,0],[0,c.height-1],[c.width-1,c.height-1],[Math.floor(c.width/2),0],[0,Math.floor(c.height/2)],[c.width-1,Math.floor(c.height/2)],[Math.floor(c.width/2),c.height-1]];
      var sr=0,sg=0,sb=0;
      pts.forEach(function(pt){var rgb=sample(pt[0],pt[1]);sr+=rgb[0];sg+=rgb[1];sb+=rgb[2];});
      var br=sr/pts.length,bg=sg/pts.length,bb=sb/pts.length;
      for(var i=0;i<d.length;i+=4){
        var dr=d[i]-br,dg=d[i+1]-bg,db=d[i+2]-bb;
        var dist=Math.sqrt(dr*dr+dg*dg+db*db);
        var bright=(d[i]+d[i+1]+d[i+2])/3;
        if(dist<28 || bright>248){d[i+3]=0;}
        else if(dist<42){d[i+3]=Math.min(d[i+3],110);}
      }
      cx.putImageData(id,0,0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror=reject;
    img.src=dataUrl;
  });
}
function dataToProcessedImage(src, removeBg){
  return processImageDataUrl(src, removeBg).then(function(cleanSrc){
    return new Promise(function(res, rej){
      var im = new Image();
      im.onload = function(){ res(im); };
      im.onerror = rej;
      im.src = cleanSrc;
    });
  });
}

function bindRange(id,key){
  var el=$(id);
  if(!el) return;
  el.addEventListener('input', function(e){
    state[key]=Number(e.target.value);
    updateBadge(key, e.target.value);
    autoSaveStudio();
  });
}
['speed','horizon','topWidth','bottomWidth','camHeight','padDelay','padThickness','bossDistance','playerZ','hudY','hudBoxSize','hudSpacing'].forEach(function(id){ bindRange(id,id); });

if($('showHud')){ $('showHud').onchange = function(e){ state.showHud = e.target.checked; autoSaveStudio(); }; }
if($('autoCollectHud')){ $('autoCollectHud').onchange = function(e){ state.autoCollectHud = e.target.checked; autoSaveStudio(); }; }
if($('hudStyle')){ $('hudStyle').onchange = function(e){ state.hudStyle = e.target.value; autoSaveStudio(); }; }

// HUD 1-5 Upload & Remove BG
for(var h=0; h<5; h++){
  (function(bIdx){
    var inp = $('hudImg_' + bIdx);
    var clr = $('clear_hud_' + bIdx);
    var box = $('thumb_hud_' + bIdx);
    var rm = $('hudRemove_' + bIdx);

    if(inp){
      inp.onchange = function(e){
        var f = e.target.files[0]; if(!f) return;
        readFile(f).then(function(src){
          rawHudSrcs[bIdx] = src;
          dataToProcessedImage(src, hudRemoveFlags[bIdx]).then(function(im){
            manualHudImgs[bIdx] = im;
            updateThumbBox(box, im.src);
          });
        });
      };
    }
    if(rm){
      rm.onchange = function(e){
        hudRemoveFlags[bIdx] = e.target.checked;
        autoSaveStudio();
        if(rawHudSrcs[bIdx]){
          dataToProcessedImage(rawHudSrcs[bIdx], hudRemoveFlags[bIdx]).then(function(im){
            manualHudImgs[bIdx] = im;
            updateThumbBox(box, im.src);
          });
        }
      };
    }
    if(clr){
      clr.onclick = function(){
        if(inp) inp.value = '';
        manualHudImgs[bIdx] = null;
        rawHudSrcs[bIdx] = null;
        collectedHud[bIdx] = null;
        updateThumbBox(box, null);
      };
    }
  })(h);
}

// Stage 0 Base Runner Upload & Remove BG
if($('pSize_0')){
  $('pSize_0').oninput = function(e){
    state.baseStage.size = Number(e.target.value);
    updateBadge('pSize_0', e.target.value);
    autoSaveStudio();
  };
}
if($('pRemove_0')){
  $('pRemove_0').onchange = function(e){
    state.baseStage.removeBg = e.target.checked;
    autoSaveStudio();
    if(state.baseStage.rawSrc){
      dataToProcessedImage(state.baseStage.rawSrc, state.baseStage.removeBg).then(function(im){
        state.baseStage.img = im;
        updateThumbBox($('thumb_pImg_0'), im.src);
      });
    }
  };
}
if($('pImg_0')){
  $('pImg_0').onchange = function(e){
    var f=e.target.files[0]; if(!f) return;
    readFile(f).then(function(src){
      state.baseStage.rawSrc = src;
      dataToProcessedImage(src, state.baseStage.removeBg).then(function(im){
        state.baseStage.img = im;
        updateThumbBox($('thumb_pImg_0'), im.src);
      });
    });
  };
}
if($('clear_pImg_0')){
  $('clear_pImg_0').onclick = function(){
    if($('pImg_0')) $('pImg_0').value = '';
    state.baseStage.img = null;
    state.baseStage.rawSrc = null;
    updateThumbBox($('thumb_pImg_0'), null);
  };
}

// Green & Red Stages 1-5 Upload & Remove BG
for(var k=1; k<=5; k++){
  (function(idx){
    // Green
    if($('gSize_' + idx)){
      $('gSize_' + idx).oninput = function(e){
        state.greenStages[idx].size = Number(e.target.value);
        updateBadge('gSize_' + idx, e.target.value);
        autoSaveStudio();
      };
    }
    if($('gRemove_' + idx)){
      $('gRemove_' + idx).onchange = function(e){
        state.greenStages[idx].removeBg = e.target.checked;
        autoSaveStudio();
        if(state.greenStages[idx].rawSrc){
          dataToProcessedImage(state.greenStages[idx].rawSrc, state.greenStages[idx].removeBg).then(function(im){
            state.greenStages[idx].img = im;
            updateThumbBox($('thumb_gImg_' + idx), im.src);
          });
        }
      };
    }
    if($('gImg_' + idx)){
      $('gImg_' + idx).onchange = function(e){
        var f=e.target.files[0]; if(!f) return;
        readFile(f).then(function(src){
          state.greenStages[idx].rawSrc = src;
          dataToProcessedImage(src, state.greenStages[idx].removeBg).then(function(im){
            state.greenStages[idx].img = im;
            updateThumbBox($('thumb_gImg_' + idx), im.src);
          });
        });
      };
    }
    if($('clear_gImg_' + idx)){
      $('clear_gImg_' + idx).onclick = function(){
        if($('gImg_' + idx)) $('gImg_' + idx).value = '';
        state.greenStages[idx].img = null;
        state.greenStages[idx].rawSrc = null;
        updateThumbBox($('thumb_gImg_' + idx), null);
      };
    }

    // Red
    if($('rSize_' + idx)){
      $('rSize_' + idx).oninput = function(e){
        state.redStages[idx].size = Number(e.target.value);
        updateBadge('rSize_' + idx, e.target.value);
        autoSaveStudio();
      };
    }
    if($('rRemove_' + idx)){
      $('rRemove_' + idx).onchange = function(e){
        state.redStages[idx].removeBg = e.target.checked;
        autoSaveStudio();
        if(state.redStages[idx].rawSrc){
          dataToProcessedImage(state.redStages[idx].rawSrc, state.redStages[idx].removeBg).then(function(im){
            state.redStages[idx].img = im;
            updateThumbBox($('thumb_rImg_' + idx), im.src);
          });
        }
      };
    }
    if($('rImg_' + idx)){
      $('rImg_' + idx).onchange = function(e){
        var f=e.target.files[0]; if(!f) return;
        readFile(f).then(function(src){
          state.redStages[idx].rawSrc = src;
          dataToProcessedImage(src, state.redStages[idx].removeBg).then(function(im){
            state.redStages[idx].img = im;
            updateThumbBox($('thumb_rImg_' + idx), im.src);
          });
        });
      };
    }
    if($('clear_rImg_' + idx)){
      $('clear_rImg_' + idx).onclick = function(){
        if($('rImg_' + idx)) $('rImg_' + idx).value = '';
        state.redStages[idx].img = null;
        state.redStages[idx].rawSrc = null;
        updateThumbBox($('thumb_rImg_' + idx), null);
      };
    }
  })(k);
}

if($('masterPadPngSize')){
  $('masterPadPngSize').oninput = function(e){
    var val = Number(e.target.value);
    updateBadge('masterPadPngSize', val);
    state.rows.forEach(function(r){ r.leftSize = val; r.rightSize = val; });
    document.querySelectorAll('.leftSize').forEach(function(inp){ inp.value = val; });
    document.querySelectorAll('.rightSize').forEach(function(inp){ inp.value = val; });
    document.querySelectorAll('.leftSizeVal').forEach(function(bdg){ bdg.textContent = val; });
    document.querySelectorAll('.rightSizeVal').forEach(function(bdg){ bdg.textContent = val; });
    autoSaveStudio();
  };
}

if($('roadVariant')) $('roadVariant').onchange=function(e){state.roadVariant=e.target.value; autoSaveStudio();};
if($('speedLines')) $('speedLines').onchange=function(e){state.speedLines=e.target.checked; autoSaveStudio();};
if($('roadShine')) $('roadShine').onchange=function(e){state.roadShine=e.target.checked; autoSaveStudio();};
if($('bgMode')) $('bgMode').onchange=function(e){state.bgMode=e.target.value; autoSaveStudio();};
if($('playerLane')) $('playerLane').onchange=function(e){state.playerLane=e.target.value; autoSaveStudio();};

// 🌟 TIMELINE SCRUBBER LISTENER
if($('timeScrubber')){
  $('timeScrubber').oninput = function(e){
    roadTime = Number(e.target.value);
    $('v_timeScrubber').textContent = roadTime.toFixed(1) + 's';
    // Re-evaluate game states based on scrubbed time
    recalculateProgressionForTime(roadTime);
  };
}

function recalculateProgressionForTime(t){
  currentPath = 'base';
  currentStageLevel = 0;
  processedPads = {};
  collectedHud = [null, null, null, null, null];
  var initialDelay = 0.85;
  var pZ = state.playerZ || 0.86;

  state.rows.slice(0,5).forEach(function(row, i){
    var elapsed = t - initialDelay - i * state.padDelay;
    var z = elapsed * state.speed * 1.28 * TRACK_MOTION_SCALE;
    if(z >= pZ - 0.02){
      processedPads[i] = true;
      var isPlayerOnRight = (state.playerX >= W/2);
      var padHex = isPlayerOnRight ? row.rightColor : row.leftColor;
      var itemImg = isPlayerOnRight ? row.rightImg : row.leftImg;
      if(state.autoCollectHud && itemImg) collectedHud[i] = itemImg;
      var isGreen = (padHex.indexOf('2a') !== -1 || padHex.indexOf('00') !== -1 || padHex.indexOf('green') !== -1);
      currentPath = isGreen ? 'green' : 'red';
      currentStageLevel = i + 1;
    }
  });
}

function makeId(){ return String(Date.now()+Math.random()); }

function addRow(saved){
  saved = saved || {};
  var row={
    id:makeId(),
    leftColor: (saved.leftColor && saved.leftColor.charAt(0)==='#') ? saved.leftColor : '#2aff84', 
    rightColor: (saved.rightColor && saved.rightColor.charAt(0)==='#') ? saved.rightColor : '#ff323a',
    leftSize: Number(saved.leftSize) || 95, 
    rightSize: Number(saved.rightSize) || 95,
    leftSrc: saved.leftSrc || null, 
    rightSrc: saved.rightSrc || null,
    leftImg: null, 
    rightImg: null,
    leftRemove: saved.leftRemove!==false, 
    rightRemove: saved.rightRemove!==false
  };
  state.rows.push(row);
  var el=$('rowTemplate').content.firstElementChild.cloneNode(true);
  el.dataset.id=row.id;
  el.querySelector('.rowtitle').textContent='Row '+(++rowCounter);
  
  var leftColorInput = el.querySelector('.leftColor');
  var rightColorInput = el.querySelector('.rightColor');
  var leftColorVal = el.querySelector('.leftColorVal');
  var rightColorVal = el.querySelector('.rightColorVal');
  var leftSizeInput = el.querySelector('.leftSize');
  var rightSizeInput = el.querySelector('.rightSize');
  var leftSizeVal = el.querySelector('.leftSizeVal');
  var rightSizeVal = el.querySelector('.rightSizeVal');

  var stepLeftMinus = el.querySelector('.step-left-minus');
  var stepLeftPlus = el.querySelector('.step-left-plus');
  var stepRightMinus = el.querySelector('.step-right-minus');
  var stepRightPlus = el.querySelector('.step-right-plus');

  var clearLeft = el.querySelector('.clear-left');
  var clearRight = el.querySelector('.clear-right');

  var thumbLeft = el.querySelector('.thumb-left');
  var thumbRight = el.querySelector('.thumb-right');

  leftColorInput.value=row.leftColor;
  rightColorInput.value=row.rightColor;
  if(leftColorVal) leftColorVal.textContent=row.leftColor;
  if(rightColorVal) rightColorVal.textContent=row.rightColor;

  leftSizeInput.value=row.leftSize;
  rightSizeInput.value=row.rightSize;
  if(leftSizeVal) leftSizeVal.textContent=row.leftSize;
  if(rightSizeVal) rightSizeVal.textContent=row.rightSize;

  stepLeftMinus.onclick = function(){ stepSlider(leftSizeInput, -1); };
  stepLeftPlus.onclick = function(){ stepSlider(leftSizeInput, 1); };
  stepRightMinus.onclick = function(){ stepSlider(rightSizeInput, -1); };
  stepRightPlus.onclick = function(){ stepSlider(rightSizeInput, 1); };

  clearLeft.onclick = function(){
    el.querySelector('.leftInput').value = '';
    row.leftSrc = null; row.leftImg = null;
    updateThumbBox(thumbLeft, null);
  };
  clearRight.onclick = function(){
    el.querySelector('.rightInput').value = '';
    row.rightSrc = null; row.rightImg = null;
    updateThumbBox(thumbRight, null);
  };

  el.querySelector('.leftRemove').checked=row.leftRemove;
  el.querySelector('.rightRemove').checked=row.rightRemove;

  leftColorInput.oninput=function(e){ row.leftColor=e.target.value; if(leftColorVal) leftColorVal.textContent=e.target.value; autoSaveStudio(); };
  rightColorInput.oninput=function(e){ row.rightColor=e.target.value; if(rightColorVal) rightColorVal.textContent=e.target.value; autoSaveStudio(); };
  leftSizeInput.oninput=function(e){ row.leftSize=Number(e.target.value); if(leftSizeVal) leftSizeVal.textContent=e.target.value; autoSaveStudio(); };
  rightSizeInput.oninput=function(e){ row.rightSize=Number(e.target.value); if(rightSizeVal) rightSizeVal.textContent=e.target.value; autoSaveStudio(); };
  
  el.querySelector('.leftRemove').onchange=function(e){
    row.leftRemove=e.target.checked; autoSaveStudio(); 
    if(row.leftSrc) dataToProcessedImage(row.leftSrc,row.leftRemove).then(function(im){ row.leftImg=im; updateThumbBox(thumbLeft, im.src); });
  };
  el.querySelector('.rightRemove').onchange=function(e){
    row.rightRemove=e.target.checked; autoSaveStudio(); 
    if(row.rightSrc) dataToProcessedImage(row.rightSrc,row.rightRemove).then(function(im){ row.rightImg=im; updateThumbBox(thumbRight, im.src); });
  };
  el.querySelector('.leftInput').onchange=function(e){
    var f=e.target.files[0];if(!f)return;
    readFile(f).then(function(src){ row.leftSrc=src; dataToProcessedImage(row.leftSrc,row.leftRemove).then(function(im){ row.leftImg=im; updateThumbBox(thumbLeft, im.src); }); });
  };
  el.querySelector('.rightInput').onchange=function(e){
    var f=e.target.files[0];if(!f)return;
    readFile(f).then(function(src){ row.rightSrc=src; dataToProcessedImage(row.rightSrc,row.rightRemove).then(function(im){ row.rightImg=im; updateThumbBox(thumbRight, im.src); }); });
  };
  
  $('rows').appendChild(el);
  if(row.leftSrc) dataToProcessedImage(row.leftSrc,row.leftRemove).then(function(im){ row.leftImg=im; updateThumbBox(thumbLeft, im.src); });
  if(row.rightSrc) dataToProcessedImage(row.rightSrc,row.rightRemove).then(function(im){ row.rightImg=im; updateThumbBox(thumbRight, im.src); });
}

function initRows(){
  $('rows').innerHTML='';
  state.rows=[];
  rowCounter=0;
  
  var savedData = getSavedSettings();
  if(savedData && typeof savedData === 'object'){
    ['speed','horizon','topWidth','bottomWidth','camHeight','padDelay','padThickness','bossDistance','playerZ','hudY','hudBoxSize','hudSpacing'].forEach(function(id){
      if(savedData[id] !== undefined && $(id)){ state[id] = Number(savedData[id]); $(id).value = savedData[id]; updateBadge(id, savedData[id]); }
    });
    if(savedData.showHud !== undefined && $('showHud')){ state.showHud = Boolean(savedData.showHud); $('showHud').checked = state.showHud; }
    if(savedData.autoCollectHud !== undefined && $('autoCollectHud')){ state.autoCollectHud = Boolean(savedData.autoCollectHud); $('autoCollectHud').checked = state.autoCollectHud; }
    if(savedData.hudStyle && $('hudStyle')){ state.hudStyle = savedData.hudStyle; $('hudStyle').value = savedData.hudStyle; }
    if(savedData.steerOffset !== undefined){
      state.steerOffset = Number(savedData.steerOffset);
      if($('laneSteer')){
        $('laneSteer').value = state.steerOffset;
        var textVal = state.steerOffset <= -0.2 ? (state.steerOffset + ' (Left)') : (state.steerOffset >= 0.2 ? (state.steerOffset + ' (Right)') : '0.0 (Center)');
        updateBadge('laneSteer', textVal);
      }
    }
    if(savedData.baseSize && $('pSize_0')){ state.baseStage.size = Number(savedData.baseSize); $('pSize_0').value = savedData.baseSize; updateBadge('pSize_0', savedData.baseSize); }
    if(savedData.baseRemove !== undefined && $('pRemove_0')){ state.baseStage.removeBg = Boolean(savedData.baseRemove); $('pRemove_0').checked = state.baseStage.removeBg; }
    
    if(Array.isArray(savedData.gSizes)){
      savedData.gSizes.forEach(function(sz, i){
        if(i > 0 && state.greenStages[i]){ state.greenStages[i].size = Number(sz); if($('gSize_' + i)){ $('gSize_' + i).value = sz; updateBadge('gSize_' + i, sz); } }
      });
    }
    if(Array.isArray(savedData.gRemoves)){
      savedData.gRemoves.forEach(function(rm, i){
        if(i > 0 && state.greenStages[i]){ state.greenStages[i].removeBg = Boolean(rm); if($('gRemove_' + i)) $('gRemove_' + i).checked = state.greenStages[i].removeBg; }
      });
    }
    if(Array.isArray(savedData.rSizes)){
      savedData.rSizes.forEach(function(sz, i){
        if(i > 0 && state.redStages[i]){ state.redStages[i].size = Number(sz); if($('rSize_' + i)){ $('rSize_' + i).value = sz; updateBadge('rSize_' + i, sz); } }
      });
    }
    if(Array.isArray(savedData.rRemoves)){
      savedData.rRemoves.forEach(function(rm, i){
        if(i > 0 && state.redStages[i]){ state.redStages[i].removeBg = Boolean(rm); if($('rRemove_' + i)) $('rRemove_' + i).checked = state.redStages[i].removeBg; }
      });
    }
    if(Array.isArray(savedData.hudRemoves)){
      savedData.hudRemoves.forEach(function(rm, i){
        hudRemoveFlags[i] = Boolean(rm);
        if($('hudRemove_' + i)) $('hudRemove_' + i).checked = hudRemoveFlags[i];
      });
    }

    if(savedData.roadVariant && $('roadVariant')){ state.roadVariant = savedData.roadVariant; $('roadVariant').value = savedData.roadVariant; }
    if(savedData.bgMode && $('bgMode')){ state.bgMode = savedData.bgMode; $('bgMode').value = savedData.bgMode; }
    if(savedData.playerLane && $('playerLane')){ state.playerLane = savedData.playerLane; $('playerLane').value = savedData.playerLane; }
    if(savedData.speedLines !== undefined && $('speedLines')){ state.speedLines = Boolean(savedData.speedLines); $('speedLines').checked = state.speedLines; }
    if(savedData.roadShine !== undefined && $('roadShine')){ state.roadShine = Boolean(savedData.roadShine); $('roadShine').checked = state.roadShine; }
    if(savedData.oppRemove !== undefined){ state.opponent.removeBg = Boolean(savedData.oppRemove); }

    var rowList = (Array.isArray(savedData.rows) && savedData.rows.length===5) ? savedData.rows : [
      {leftColor:'#2aff84', rightColor:'#ff323a'},
      {leftColor:'#ff323a', rightColor:'#2aff84'},
      {leftColor:'#2aff84', rightColor:'#ff323a'},
      {leftColor:'#ff323a', rightColor:'#2aff84'},
      {leftColor:'#2aff84', rightColor:'#ff323a'}
    ];
    rowList.forEach(addRow);
  } else {
    ['speed','horizon','topWidth','bottomWidth','camHeight','padDelay','padThickness','bossDistance','playerZ','hudY','hudBoxSize','hudSpacing'].forEach(function(id){ updateBadge(id, state[id]); });
    updateBadge('pSize_0', state.baseStage.size);
    for(var i=1;i<=5;i++){ updateBadge('gSize_' + i, state.greenStages[i].size); updateBadge('rSize_' + i, state.redStages[i].size); }
    for(var i=0;i<5;i++){ addRow({leftColor:i%2?'#ff323a':'#2aff84', rightColor:i%2?'#2aff84':'#ff323a'}); }
  }

  var oppEl=$('opponentTemplate').content.firstElementChild.cloneNode(true);
  oppEl.querySelector('.oppRemove').onchange=function(e){
    state.opponent.removeBg=e.target.checked; 
    autoSaveStudio(); 
    if(state.opponent.src){ dataToProcessedImage(state.opponent.src,state.opponent.removeBg).then(function(im){ state.opponent.img=im; updateThumbBox($('thumb_oppImg'), im.src); }); }
  };
  oppEl.querySelector('.oppInput').onchange=function(e){
    var f=e.target.files[0];if(!f)return;
    readFile(f).then(function(src){
      state.opponent.src=src;
      dataToProcessedImage(state.opponent.src,state.opponent.removeBg).then(function(im){ state.opponent.img=im; updateThumbBox($('thumb_oppImg'), im.src); });
    });
  };
  var clearOpp = oppEl.querySelector('#clear_oppImg');
  if(clearOpp){
    clearOpp.onclick = function(){
      oppEl.querySelector('.oppInput').value = '';
      state.opponent.src = null; state.opponent.img = null;
      updateThumbBox($('thumb_oppImg'), null);
    };
  }
  $('rows').appendChild(oppEl);

  restoreCardOrder();
  setupDragAndDrop();
}
initRows();

var TRACK_Z_LENGTH=220;
var BASE_TRACK_Z_LENGTH=125;
var TRACK_MOTION_SCALE=BASE_TRACK_Z_LENGTH/TRACK_Z_LENGTH;

function roadBoundsAtZ(z){
  var t=Math.max(-0.25, Math.min(1.15, z));
  var camH = Math.max(0.2, state.camHeight || 0.95);
  var dynamicHorizon = H * (state.horizon || 0.31) + (1.0 - camH) * (H * 0.12);
  var dynamicHorizonY = Math.max(H * 0.12, Math.min(H * 0.75, dynamicHorizon));

  var TOP_HALF = W * (state.topWidth || 0.14);
  var BOTTOM_HALF = W * (state.bottomWidth || 0.98);

  var zDistance = (1.0 - t) * (11.0 / camH) + 0.85;
  var scale = 1.0 / Math.max(0.01, zDistance);
  var minScale = 1.0 / ((11.0 / camH) + 0.85);
  var maxScale = 1.0 / 0.85;
  var depth = (scale - minScale) / (maxScale - minScale);

  var y = dynamicHorizonY + (H - dynamicHorizonY) * depth;
  var half = TOP_HALF + (BOTTOM_HALF - TOP_HALF) * depth;

  return {e:depth, y:y, l:W/2-half, r:W/2+half, half:half};
}

function lerp(a,b,t){return a+(b-a)*t;}
function drawPoly(pts, fill){
  ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]);
  for(var i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
  ctx.closePath(); ctx.fillStyle=fill; ctx.fill();
}
function quad(a,b){return [[a.l,a.y],[a.r,a.y],[b.r,b.y],[b.l,b.y]];}

function fillRoadBase(topColor,bottomColor){
  var top=roadBoundsAtZ(-0.15), bottom=roadBoundsAtZ(1.05);
  var g=ctx.createLinearGradient(0,top.y,0,H);
  g.addColorStop(0,topColor); g.addColorStop(1,bottomColor);
  drawPoly([[top.l,top.y],[top.r,top.y],[bottom.r,H],[bottom.l,H]],g);
  return {top:top,bottom:bottom};
}
function drawEdgeStripSeries(count,speedFactor,widthA,widthB,colorA,colorB){
  for(var i=-2;i<count;i++){
    var z0=(i/count + roadTime*state.speed*TRACK_MOTION_SCALE*speedFactor)%1.15;
    var z1=z0+.065;
    if(z1>1.1) continue;
    var a=roadBoundsAtZ(z0), b=roadBoundsAtZ(z1);
    var wa=widthA+widthB*Math.max(0,a.e), wb=widthA+widthB*Math.max(0,b.e);
    var c=Math.abs(i)%2===0?colorA:colorB;
    drawPoly([[a.l,a.y],[a.l+wa,a.y],[b.l+wb,b.y],[b.l,b.y]],c);
    drawPoly([[a.r-wa,a.y],[a.r,a.y],[b.r,b.y],[b.r-wb,b.y]],c);
  }
}
function drawCenterDashed(offsetRatio,color,widthBase,widthGrow,len,density,speedFactor,minZ){
  for(var i=-2;i<density;i++){
    var z0=(i/density + roadTime*state.speed*TRACK_MOTION_SCALE*speedFactor)%1.15;
    var z1=z0+len;
    if(z1>1.1 || z0<minZ) continue;
    var a=roadBoundsAtZ(z0), b=roadBoundsAtZ(z1);
    var x0=W/2+a.half*offsetRatio;
    var x1=W/2+b.half*offsetRatio;
    ctx.save(); ctx.strokeStyle=color; ctx.lineCap='round';
    ctx.lineWidth=widthBase+widthGrow*Math.max(0,a.e);
    ctx.beginPath(); ctx.moveTo(x0,a.y); ctx.lineTo(x1,b.y); ctx.stroke(); ctx.restore();
  }
}
function drawRoadTexture(strength){
  ctx.save();
  for(var i=-1;i<10;i++){
    var z=(i*.13 + roadTime*state.speed*TRACK_MOTION_SCALE*1.08)%1.1;
    if(z<.05) continue;
    var a=roadBoundsAtZ(z), b=roadBoundsAtZ(Math.min(1.1,z+.06));
    var alpha=.012+strength*Math.max(0,a.e);
    drawPoly(quad(a,b),'rgba(255,255,255,'+alpha+')');
  }
  ctx.restore();
}
function drawRoadShineSeries(color,alphaMul){
  ctx.save();ctx.strokeStyle=color;ctx.lineCap='round';
  for(var i=0;i<7;i++){
    var z=(i*.16 + roadTime*state.speed*TRACK_MOTION_SCALE*1.2)%1;
    if(z<.22) continue;
    var a=roadBoundsAtZ(z), b=roadBoundsAtZ(Math.min(1,z+.09));
    var xA=W/2 + (i%2?-1:1)*a.half*(.32+.18*(i%3));
    var xB=W/2 + (i%2?-1:1)*b.half*(.32+.18*(i%3));
    ctx.globalAlpha=(.16+.45*z)*alphaMul;ctx.lineWidth=2+5*z;
    ctx.beginPath();ctx.moveTo(xA,a.y);ctx.lineTo(xB,b.y);ctx.stroke();
  }
  ctx.restore();
}
function drawSideRails(color){
  ctx.save(); ctx.strokeStyle=color; ctx.lineCap='round';
  for(var i=0;i<10;i++){
    var z0=(i/10 + roadTime*state.speed*TRACK_MOTION_SCALE*.84)%1;
    var z1=z0+.075;
    if(z1>1 || z0<.06) continue;
    var a=roadBoundsAtZ(z0), b=roadBoundsAtZ(z1);
    ctx.globalAlpha=.14+.42*a.e; ctx.lineWidth=2+6*a.e;
    ctx.beginPath(); ctx.moveTo(a.l+12+a.e*8,a.y); ctx.lineTo(b.l+12+b.e*8,b.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(a.r-12-a.e*8,a.y); ctx.lineTo(b.r-12-b.e*8,b.y); ctx.stroke();
  }
  ctx.restore();
}

function drawBackground(){
  var pair = bgColors[state.bgMode] || ['#000000', '#050505'];
  var g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pair[0]); g.addColorStop(1, pair[1]);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function rClassic(){
  fillRoadBase('#7c8591','#454c57');
  drawRoadTexture(.028);
  drawEdgeStripSeries(18,.85,5,28,'#ff1f32','#ffffff');
  if(state.roadShine) drawRoadShineSeries('rgba(255,255,255,.38)',1.0);
}
function rTwinStripe(){
  fillRoadBase('#4a5665','#202731');
  drawRoadTexture(.026);
  drawEdgeStripSeries(18,.82,4,20,'#ffffff','#b6bcc6');
  drawCenterDashed(-.04,'rgba(255,216,82,.98)',2,5,.10,10,.84,.14);
  drawCenterDashed(.04,'rgba(255,216,82,.98)',2,5,.10,10,.84,.14);
}
function rTripleLane(){
  fillRoadBase('#46505c','#1f262f');
  drawRoadTexture(.024);
  drawEdgeStripSeries(18,.82,4,20,'#ff2333','#ffffff');
  drawCenterDashed(-.26,'rgba(255,255,255,.85)',2,4,.085,10,.82,.14);
  drawCenterDashed(0,'rgba(255,255,255,.85)',2,4,.085,10,.82,.14);
  drawCenterDashed(.26,'rgba(255,255,255,.85)',2,4,.085,10,.82,.14);
}

function drawRoad(){
  var dict={ classic: rClassic, twinStripe: rTwinStripe, tripleLane: rTripleLane };
  var fn = dict[state.roadVariant] || rClassic;
  fn();
}

// 🦁 3D GLASS PAD DRAWING WITH CLAMPED NATURAL BOUNDS
function drawRaisedPad(z, side, hexColor){
  var p=roadBoundsAtZ(z), e=Math.max(0, p.e);
  var laneCenter=side==='left' ? W/2-p.half*.48 : W/2+p.half*.48;
  var width=Math.max(14, p.half*.78);
  var height=Math.max(16, width * 0.58);
  var baseY=p.y + 1;
  var topY=baseY - height;
  
  var c = hexToRgb(hexColor);
  var rgb = c.r + ',' + c.g + ',' + c.b;
  var darkR = Math.max(0, Math.floor(c.r * 0.45));
  var darkG = Math.max(0, Math.floor(c.r * 0.45));
  var darkB = Math.max(0, Math.floor(c.b * 0.45));
  var dark = darkR + ',' + darkG + ',' + darkB;

  ctx.save();ctx.fillStyle='rgba(0,0,0,.24)';ctx.beginPath();ctx.ellipse(laneCenter,baseY+4,width*.46,4+7*e,0,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.save();ctx.fillStyle='rgba('+dark+',.78)';ctx.beginPath();ctx.roundRect(laneCenter-width/2,baseY-(state.padThickness||14)*.45,width,state.padThickness||14,5);ctx.fill();ctx.restore();
  
  var g=ctx.createLinearGradient(0,baseY,0,topY);
  g.addColorStop(0,'rgba('+rgb+',.88)'); g.addColorStop(.35,'rgba('+rgb+',.55)'); g.addColorStop(.75,'rgba('+rgb+',.22)'); g.addColorStop(1,'rgba('+rgb+',0)');
  
  ctx.save();ctx.shadowColor='rgb('+rgb+')';ctx.shadowBlur=16+24*e;ctx.fillStyle=g;
  ctx.beginPath();ctx.roundRect(laneCenter-width/2,topY,width,height,8);ctx.fill();ctx.restore();
  
  ctx.save();ctx.strokeStyle='rgba('+rgb+',.96)';ctx.lineWidth=2+2*e;ctx.beginPath();ctx.moveTo(laneCenter-width*.48,baseY-1);ctx.lineTo(laneCenter+width*.48,baseY-1);ctx.stroke();ctx.restore();
  
  return {center:[laneCenter,baseY-height*.43], baseY:baseY, topY:topY, width:width, height:height, e:e};
}

function drawImageFit(im, x, y, boxW, boxH, anchor){
  anchor = anchor || 'bottom';
  if(!im) return;
  var iw=im.naturalWidth||im.width, ih=im.naturalHeight||im.height;
  var scale=Math.min(boxW/iw, boxH/ih);
  var dw=iw*scale, dh=ih*scale;
  var dx=x-dw/2;
  var dy=anchor==='center' ? y-dh/2 : y-dh;
  ctx.drawImage(im,dx,dy,dw,dh);
}

function drawMysteryHUD(){
  if(!state.showHud) return;
  var count = 5;
  var boxS = state.hudBoxSize || 86;
  var gap = state.hudSpacing || 12;
  var totalW = count * boxS + (count - 1) * gap;
  var startX = (W - totalW) / 2;
  var hudY = state.hudY || 88;
  var th = hudThemes[state.hudStyle] || hudThemes.classicGold;

  for(var b = 0; b < count; b++){
    var bx = startX + b * (boxS + gap);
    var activeImg = manualHudImgs[b] || collectedHud[b];

    if(activeImg){
      ctx.save(); ctx.shadowColor = th.glow; ctx.shadowBlur = 14;
      drawImageFit(activeImg, bx + boxS/2, hudY + boxS - 4, boxS * 0.9, boxS * 0.9, 'bottom');
      ctx.restore();
    } else {
      ctx.save(); ctx.shadowColor = th.glow; ctx.shadowBlur = 8;
      ctx.fillStyle = th.border; ctx.beginPath(); ctx.roundRect(bx, hudY, boxS, boxS, 10); ctx.fill();
      ctx.fillStyle = th.face; ctx.beginPath(); ctx.roundRect(bx + 4, hudY + 4, boxS - 8, boxS - 8, 8); ctx.fill();
      ctx.strokeStyle = th.stroke; ctx.lineWidth = 3; ctx.strokeRect(bx + 4, hudY + 4, boxS - 8, boxS - 8);
      ctx.fillStyle = th.text; ctx.font = '900 ' + Math.floor(boxS * 0.65) + 'px Impact, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', bx + boxS/2, hudY + boxS/2 + 2);
      ctx.restore();
    }
  }
}

function getActiveRunnerInfo(){
  var curImg = null; var curSize = 145;
  if(currentPath === 'green' && currentStageLevel > 0){
    for(var g = currentStageLevel; g >= 1; g--){
      if(state.greenStages[g] && state.greenStages[g].img){ curImg = state.greenStages[g].img; curSize = state.greenStages[g].size || 165; break; }
    }
  } else if(currentPath === 'red' && currentStageLevel > 0){
    for(var r = currentStageLevel; r >= 1; r--){
      if(state.redStages[r] && state.redStages[r].img){ curImg = state.redStages[r].img; curSize = state.redStages[r].size || 130; break; }
    }
  }
  if(!curImg){ curImg = state.baseStage.img; curSize = state.baseStage.size || 145; }
  return { img: curImg, size: curSize };
}

function drawRunnerBehind(){
  var rInfo = getActiveRunnerInfo();
  if(!rInfo.img) return;

  var p = roadBoundsAtZ(state.playerZ || 0.86);
  var pSize = rInfo.size * (0.3 + 0.7 * Math.max(0, p.e));

  var targetX = W/2;
  if(state.playerLane === 'slider') targetX = W/2 + (p.half * 0.48 * state.steerOffset);
  else if(state.playerLane === 'right') targetX = W/2 + p.half * 0.48;
  else if(state.playerLane === 'left') targetX = W/2 - p.half * 0.48;
  else targetX = state.currentLane === 'right' ? (W/2 + p.half * 0.48) : (W/2 - p.half * 0.48);

  state.playerX = state.playerX || (W/2);
  state.playerX += (targetX - state.playerX) * 0.35;

  drawImageFit(rInfo.img, state.playerX, p.y + 4, pSize, pSize, 'bottom');
}

// 🌟 DEPTH-SORTED OVERLAP-FREE DRAWING PIPELINE
function drawRows(){
  var initialDelay=.85;
  var closestActiveZ = -1;
  var activeLaneColor = '#2aff84';
  var pZ = state.playerZ || 0.86;

  var renderQueue = [];

  state.rows.slice(0,5).forEach(function(row,i){
    var elapsed=roadTime-initialDelay-i*state.padDelay;
    var z=elapsed*state.speed*1.28*TRACK_MOTION_SCALE;
    if(z < -0.15 || z > 1.35) return;
    var zz=z;

    if(zz >= pZ - 0.02 && !processedPads[i]){
      processedPads[i] = true;
      var isPlayerOnRight = (state.playerX >= W/2);
      var padHex = isPlayerOnRight ? row.rightColor : row.leftColor;
      var itemImg = isPlayerOnRight ? row.rightImg : row.leftImg;
      if(state.autoCollectHud && itemImg) collectedHud[i] = itemImg;
      var isGreen = (padHex.indexOf('2a') !== -1 || padHex.indexOf('00') !== -1 || padHex.indexOf('green') !== -1);
      currentPath = isGreen ? 'green' : 'red';
      currentStageLevel = i + 1;
    }

    if(zz > closestActiveZ && zz < pZ + 0.15){
      closestActiveZ = zz;
      activeLaneColor = row.leftColor;
    }

    // Add pad to depth render queue
    renderQueue.push({ type: 'pad', row: row, rawZ: zz, sortKey: zz });
  });

  if(closestActiveZ !== -1){
    var isGreenLane = (activeLaneColor.indexOf('2a') !== -1 || activeLaneColor.indexOf('00') !== -1 || activeLaneColor.indexOf('green') !== -1);
    state.currentLane = isGreenLane ? 'left' : 'right';
  }

  // Stationary Boss Anchor
  var pad5WorldElapsed = roadTime - initialDelay - 4 * state.padDelay;
  var bDist = Math.max(1.0, state.bossDistance || 2.8);
  var bossWorldElapsed = pad5WorldElapsed - bDist;
  var bossRawZ = bossWorldElapsed * state.speed * 1.28 * TRACK_MOTION_SCALE;
  var pad2Finished = processedPads[1] === true;

  if(pad2Finished && state.opponent.img){
    var bossZ = Math.max(0.01, Math.min(pZ, bossRawZ));
    renderQueue.push({ type: 'boss', z: bossZ, sortKey: bossZ });
  }

  // Add runner to depth queue
  renderQueue.push({ type: 'runner', sortKey: pZ });

  // ⚡ CRITICAL: SORT FROM FURTHEST (smallest Z) TO CLOSEST (largest Z)
  renderQueue.sort(function(a, b){ return a.sortKey - b.sortKey; });

  // Render strictly by depth order to completely eliminate image clipping / overlaying!
  renderQueue.forEach(function(item){
    if(item.type === 'pad'){
      var clampedZ = Math.min(1.0, Math.max(0, item.rawZ));
      var left=drawRaisedPad(clampedZ,'left',item.row.leftColor);
      var right=drawRaisedPad(clampedZ,'right',item.row.rightColor);
      var pngScale=.18+0.95*Math.max(0, left.e);
      var leftSize=Math.min(item.row.leftSize*pngScale,left.width*.92);
      var rightSize=Math.min(item.row.rightSize*pngScale,right.width*.92);
      
      // Pad PNGs render with clean boundary
      if(item.row.leftImg) drawImageFit(item.row.leftImg,left.center[0],left.baseY-6,leftSize,leftSize,'bottom');
      if(item.row.rightImg) drawImageFit(item.row.rightImg,right.center[0],right.baseY-6,rightSize,rightSize,'bottom');
    } 
    else if(item.type === 'boss'){
      var op = roadBoundsAtZ(item.z);
      var rInfo = getActiveRunnerInfo();
      var dynamicBossBase = (rInfo.size || 145) * 1.18;
      var bossSize = dynamicBossBase * (0.3 + 0.7 * Math.max(0, op.e));
      drawImageFit(state.opponent.img, W/2, op.y + 4, bossSize, bossSize, 'bottom');
    }
    else if(item.type === 'runner'){
      drawRunnerBehind();
    }
  });
}

var FIXED_TIMESTEP = 1 / 60;

function frame(now){
  var delta = (now - last) / 1000;
  if(delta > 0.1) delta = FIXED_TIMESTEP;
  last = now;

  var pad5WorldElapsed = roadTime - 0.85 - 4 * state.padDelay;
  var bDist = Math.max(1.0, state.bossDistance || 2.8);
  var bossWorldElapsed = pad5WorldElapsed - bDist;
  var bossRawZ = bossWorldElapsed * state.speed * 1.28 * TRACK_MOTION_SCALE;

  var isTouching = processedPads[4] && bossRawZ >= (state.playerZ || 0.86);

  if(running && !isTouching){
    roadTime += delta;
    if($('timeScrubber') && document.activeElement !== $('timeScrubber')){
      $('timeScrubber').value = roadTime;
      $('v_timeScrubber').textContent = roadTime.toFixed(1) + 's';
    }
  }

  drawBackground();
  drawRoad();
  drawRows();
  drawMysteryHUD();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

$('playBtn').onclick=function(){running=!running;$('playBtn').textContent=running?'Pause':'Play';};
$('resetBtn').onclick=function(){
  roadTime=0;
  currentPath='base';
  currentStageLevel=0;
  processedPads={};
  collectedHud=[null, null, null, null, null];
  if($('timeScrubber')){ $('timeScrubber').value = 0; $('v_timeScrubber').textContent = '0.0s'; }
};
$('saveBtn').onclick=function(){
  autoSaveStudio();
  saveCardOrder();
  alert('Settings saved successfully!');
};
$('resetStorageBtn').onclick=function(){
  try{ 
    localStorage.removeItem('runner_studio_saved_v21'); 
    localStorage.removeItem('runner_studio_panel_order');
  }catch(e){}
  location.reload();
};
$('logoutBtn').onclick=async function(){await fetch('/api/logout',{method:'POST'});location.href='/';};

$('exportBtn').onclick = function(){
  if (recorder) return;
  var sec = Math.max(2, Math.min(60, +$('recordSec').value || 15));
  var stream = canvas.captureStream(60);
  var mime = 'video/webm;codecs=vp8';
  if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';
  
  var chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 16000000 });
  recorder.ondataavailable = function(e){ if (e.data.size) chunks.push(e.data); };
  recorder.onstop = function(){
    var blob = new Blob(chunks, { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'runner-perfect-60fps.webm';
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 5000);
    recorder = null;
    $('exportBtn').textContent = 'Export 60FPS Video';
  };
  recorder.start(100);
  $('exportBtn').textContent = 'Recording 60 FPS...';
  setTimeout(function(){ if (recorder && recorder.state !== 'inactive') recorder.stop(); }, sec * 1000);
};
})();
</script>
</body>
</html>`;

const server = http.createServer(function(req, res){
  req.on('error', function(err){ console.error('Req error:', err); });
  res.on('error', function(err){ console.error('Res error:', err); });

  var url;
  try {
    url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  } catch(e) {
    return send(res, 400, 'Bad Request');
  }

  if(url.pathname === '/api/login'){
    if(req.method !== 'POST') return send(res, 405, 'Method not allowed');
    var b = '';
    req.on('data', function(chunk){ b += chunk; });
    req.on('end', function(){
      try {
        var dat = JSON.parse(b);
        if(safeEqual(dat.password, APP_PASSWORD)){
          var exp = Date.now() + SESSION_MS;
          var nonce = crypto.randomBytes(12).toString('hex');
          var payload = exp + '.' + nonce;
          var sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
          var token = payload + '.' + sig;
          res.writeHead(200, {
            'Set-Cookie': 'runner_session=' + token + '; Path=/; HttpOnly; SameSite=Lax',
            'Content-Type': 'text/plain',
            'Connection': 'keep-alive'
          });
          res.end('OK');
        } else {
          send(res, 401, 'Unauthorized');
        }
      } catch(e) { send(res, 400, 'Bad Request'); }
    });
    return;
  }
  if(url.pathname === '/api/logout'){
    res.writeHead(302, {'Set-Cookie': 'runner_session=; Path=/; Max-Age=0', 'Location': '/'});
    return res.end();
  }
  if(url.pathname === '/app'){
    if(!authed(req)) return res.writeHead(302, {'Location': '/'}).end();
    return send(res, 200, APP_HTML, 'text/html; charset=utf-8');
  }
  if(url.pathname === '/'){
    if(authed(req)) return res.writeHead(302, {'Location': '/app'}).end();
    return send(res, 200, LOGIN_HTML, 'text/html; charset=utf-8');
  }
  send(res, 404, 'Not found');
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.listen(PORT, function(){ console.log('Pro Studio Server running on port ' + PORT); });
