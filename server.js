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
<title>Private Runner Studio - Straight YouTube Edition</title>
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

.transport{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}.transport input[type=number]{width:70px;padding:9px;background:#fff;color:#111;border-radius:8px;border:0}
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
.range-wrap input[type=range]::-webkit-slider-thumb:hover{
  transform:scale(1.15);
  box-shadow:0 0 14px rgba(97,240,166,0.9);
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

.cutout-ctrl{display:flex;align-items:center;gap:8px;margin-top:4px;padding:4px 8px;background:#101318;border-radius:8px;border:1px solid #232832}
.cutout-ctrl span{font-size:11px;color:var(--muted);white-space:nowrap}
.cutout-ctrl input[type=range]{height:5px;flex:1}

input[type=text], select{padding:9px;background:#0f1217;color:white;border:1px solid var(--line);border-radius:8px;width:100%}
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
  <div><strong>Private Runner Studio</strong><span class="badge">1080P STRAIGHT HIGHWAY</span></div>
  <div class="top-actions"><button id="saveBtn">Save State</button><button id="resetStorageBtn">Reset UI</button><button id="logoutBtn">Logout</button></div>
</header>
<main class="studio">
  <section class="preview">
    <div class="shell"><div class="stageWrap"><canvas id="stage" width="1080" height="1920"></canvas></div></div>

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
      <label>Record sec <input id="recordSec" type="number" min="2" max="60" value="20"></label>
      <button id="exportBtn">Export 1080P 60FPS</button>
      <div style="width:100%;margin-top:6px;display:flex;align-items:center;gap:8px">
        <span style="font-size:12px;font-weight:700">⏱️ Scrub Video:</span>
        <div class="range-wrap" style="flex:1">
          <input id="scrubBar" type="range" min="0" max="25" step="0.05" value="0">
        </div>
        <span class="val-badge gold" id="v_scrubBar">0.0s</span>
      </div>
    </div>
    <div class="note"><b>⚡ Straight Highway Engine:</b> True Parallel Road (No Triangle) + Paper Slate HD!</div>
  </section>

  <section class="controls" id="panelsContainer">

    <!-- CARD 1: SCREEN INTRO TEXT 1 -->
    <details class="drag-card" id="card_intro_text1" open>
      <summary>
        <span>🚀 Screen Intro Text 1: LET'S GO</span>
        <span class="drag-handle" draggable="true">⠿ Drag</span>
      </summary>
      <div class="grid two">
        <label class="toggle" style="grid-column:1/-1">
          <input id="t1_show" type="checkbox" checked> <b>Show Intro Text 1 ("LET'S GO")</b>
        </label>
        <label style="grid-column:1/-1">Text Message
          <input id="t1_val" type="text" value="LET'S GO" placeholder="e.g. LET'S GO">
        </label>
        <label>Visual Style
          <select id="t1_style">
            <option value="tryloxyRed" selected>🔴 1. TryLoxy Classic Red & White</option>
            <option value="arcadeGold">👑 2. 3D Arcade Gold & Yellow</option>
            <option value="cyberCyan">⚡ 3. Cyber Neon Cyan</option>
            <option value="infernoFire">🔥 4. Inferno Blaze Orange</option>
            <option value="monsterLime">🦖 5. Monster Neon Lime</option>
            <option value="plasmaPink">💖 6. Plasma Cyber Pink</option>
            <option value="cleanWhite">⚪ 7. Minimal Bold White</option>
            <option value="synthViolet">🟣 8. Synthwave Violet Sunset</option>
            <option value="candyPop">🍭 9. Candy Pastel Multi-Glow</option>
          </select>
        </label>
        <label>In-Animation
          <select id="t1_inAnim">
            <option value="elasticPunch" selected>💥 Elastic Punch</option>
            <option value="slamImpact">🔨 Comic Slam Impact</option>
            <option value="jelloBounce">🍮 Wobbly Jello Pop</option>
            <option value="speedWarp">⚡ Speed Warp Flash In</option>
            <option value="dropSpring">🚀 Drop & Spring</option>
          </select>
        </label>
        <label>Out-Animation
          <select id="t1_outAnim">
            <option value="shrinkPop" selected>🫧 Shrink & Pop Away</option>
            <option value="flyUp">🚀 Rocket Fly Up</option>
            <option value="flashFade">✨ Glow Flash Fade</option>
            <option value="instantCut">✂️ Instant Cut Out</option>
          </select>
        </label>
        <label>
          <span class="label-head"><span>Duration (0.5s - 10.0s)</span><span class="val-badge gold" id="v_t1_duration">2.2s</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="t1_duration" data-dir="-1">◀</button>
            <input id="t1_duration" type="range" min="0.5" max="10.0" step="0.1" value="2.2">
            <button type="button" class="step-btn" data-step-for="t1_duration" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Text Y-Position</span><span class="val-badge gold" id="v_t1_y">430</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="t1_y" data-dir="-1">◀</button>
            <input id="t1_y" type="range" min="150" max="950" value="430">
            <button type="button" class="step-btn" data-step-for="t1_y" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Font Size</span><span class="val-badge gold" id="v_t1_size">110</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="t1_size" data-dir="-1">◀</button>
            <input id="t1_size" type="range" min="40" max="220" value="110">
            <button type="button" class="step-btn" data-step-for="t1_size" data-dir="1">▶</button>
          </div>
        </label>
      </div>
    </details>

    <!-- CARD 2: SCREEN INTRO TEXT 2 -->
    <details class="drag-card" id="card_intro_text2" open>
      <summary>
        <span>⚡ Screen Intro Text 2: WIN OR LOSE</span>
        <span class="drag-handle" draggable="true">⠿ Drag</span>
      </summary>
      <div class="grid two">
        <label class="toggle" style="grid-column:1/-1">
          <input id="t2_show" type="checkbox" checked> <b>Show Intro Text 2 ("WIN OR LOSE!")</b>
        </label>
        <label class="toggle" style="grid-column:1/-1">
          <input id="t2_chainWithT1" type="checkbox" checked> <span style="color:var(--accent);font-weight:700">⚡ Auto-Chain After Text 1</span>
        </label>
        <label style="grid-column:1/-1">Text Message
          <input id="t2_val" type="text" value="Win or Lose!" placeholder="e.g. Win or Lose!">
        </label>
        <label>Visual Style
          <select id="t2_style">
            <option value="arcadeGold" selected>👑 1. 3D Gold Trophy</option>
            <option value="dualWinLose">🌓 2. Split (Green WIN / Red LOSE)</option>
            <option value="tryloxyRed">🔴 3. TryLoxy Bold Red & White</option>
            <option value="comicLime">🦖 4. Comic Lime Beast</option>
            <option value="electricCyan">🔵 5. Electric Blue Thunder</option>
            <option value="cleanWhite">⚪ 6. Clean Paper White</option>
          </select>
        </label>
        <label>In-Animation
          <select id="t2_inAnim">
            <option value="slamImpact" selected>🔨 Comic Slam Impact</option>
            <option value="elasticPunch">💥 Elastic Mega-Punch</option>
            <option value="jelloBounce">🍮 Wobbly Jello Pop</option>
          </select>
        </label>
        <label>Out-Animation
          <select id="t2_outAnim">
            <option value="shrinkPop" selected>🫧 Shrink & Pop Away</option>
            <option value="flyUp">🚀 Rocket Fly Up</option>
            <option value="flashFade">✨ Glow Flash Fade</option>
          </select>
        </label>
        <label>
          <span class="label-head"><span>Duration</span><span class="val-badge gold" id="v_t2_duration">3.5s</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="t2_duration" data-dir="-1">◀</button>
            <input id="t2_duration" type="range" min="0.5" max="10.0" step="0.1" value="3.5">
            <button type="button" class="step-btn" data-step-for="t2_duration" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Text Y-Position</span><span class="val-badge gold" id="v_t2_y">430</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="t2_y" data-dir="-1">◀</button>
            <input id="t2_y" type="range" min="150" max="950" value="430">
            <button type="button" class="step-btn" data-step-for="t2_y" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Font Size</span><span class="val-badge gold" id="v_t2_size">105</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="t2_size" data-dir="-1">◀</button>
            <input id="t2_size" type="range" min="40" max="220" value="105">
            <button type="button" class="step-btn" data-step-for="t2_size" data-dir="1">▶</button>
          </div>
        </label>
      </div>
    </details>

    <!-- CARD 3: RUNNER VFX -->
    <details class="drag-card" id="card_impact_vfx" open>
      <summary>
        <span>⚡ Runner Transformation VFX & Intensity</span>
        <span class="drag-handle" draggable="true">⠿ Drag</span>
      </summary>
      <div class="grid two">
        <label class="toggle" style="grid-column:1/-1">
          <input id="enableVfx" type="checkbox" checked> <b>Enable Pad Hit VFX & Transformation Aura</b>
        </label>
        <label>
          <span class="label-head"><span>VFX Scale Jump</span><span class="val-badge gold" id="v_vfxScaleJump">0.08</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="vfxScaleJump" data-dir="-1">◀</button>
            <input id="vfxScaleJump" type="range" min="0.0" max="0.30" step="0.01" value="0.08">
            <button type="button" class="step-btn" data-step-for="vfxScaleJump" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Glow & Aura Spread</span><span class="val-badge gold" id="v_vfxAuraSpread">0.85</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="vfxAuraSpread" data-dir="-1">◀</button>
            <input id="vfxAuraSpread" type="range" min="0.2" max="2.0" step="0.05" value="0.85">
            <button type="button" class="step-btn" data-step-for="vfxAuraSpread" data-dir="1">▶</button>
          </div>
        </label>
      </div>
    </details>

    <!-- CARD 4: HUD BOXES -->
    <details class="drag-card" id="card_hud" open>
      <summary>
        <span>🎁 5 Mystery Boxes HUD</span>
        <span class="drag-handle" draggable="true">⠿ Drag</span>
      </summary>
      <div class="grid two">
        <label class="toggle"><input id="showHud" type="checkbox" checked> Show 5 Mystery Boxes</label>
        <label class="toggle"><input id="autoCollectHud" type="checkbox" checked> Auto Collect PNG from Pads</label>
        <label style="grid-column:1/-1">Box Style
          <select id="hudStyle">
            <option value="fireInferno" selected>🔥 1. Inferno Flame</option>
            <option value="waterCrystal">💧 2. Aqua Splash</option>
            <option value="amethystGem">💎 3. Diamond Gem</option>
            <option value="electricThunder">⚡ 4. Neon Lightning Bolt</option>
            <option value="royal3DGold">👑 5. 3D Mario Classic Gold (?)</option>
            <option value="laserCrimson">🔴 6. Laser Crimson Red (?)</option>
            <option value="cyberCyan">🔵 7. Cyber Cyan Circuit (?)</option>
            <option value="neonGreen">🟢 8. Emerald Neon Pulse (?)</option>
          </select>
        </label>
        <label>
          <span class="label-head"><span>HUD Y-Position</span><span class="val-badge gold" id="v_hudY">155</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="hudY" data-dir="-1">◀</button>
            <input id="hudY" type="range" min="30" max="450" value="155">
            <button type="button" class="step-btn" data-step-for="hudY" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Box Size</span><span class="val-badge gold" id="v_hudBoxSize">132</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="hudBoxSize" data-dir="-1">◀</button>
            <input id="hudBoxSize" type="range" min="50" max="220" value="132">
            <button type="button" class="step-btn" data-step-for="hudBoxSize" data-dir="1">▶</button>
          </div>
        </label>
        <label style="grid-column:1/-1">
          <span class="label-head"><span>Box Spacing</span><span class="val-badge gold" id="v_hudSpacing">18</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="hudSpacing" data-dir="-1">◀</button>
            <input id="hudSpacing" type="range" min="6" max="60" value="18">
            <button type="button" class="step-btn" data-step-for="hudSpacing" data-dir="1">▶</button>
          </div>
        </label>
      </div>
    </details>

    <!-- CARD 5: RUNNER EVOLUTION -->
    <details class="drag-card" id="card_runner" open>
      <summary>
        <span>🏃 Runner Evolution Settings</span>
        <span class="drag-handle" draggable="true">⠿ Drag</span>
      </summary>
      <div class="grid two">
        <label>Base Start PNG (Stage 0)
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_pImg_0"><span>None</span><img src=""></div>
            <input id="pImg_0" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_pImg_0">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="pRemove_0" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="pTol_0" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_pTol_0">32</span>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Stage 0 Base Size</span><span class="val-badge" id="v_pSize_0">215</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="pSize_0" data-dir="-1">◀</button>
            <input id="pSize_0" type="range" min="60" max="1200" value="215">
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

        <div class="sub-title" style="color:#61f0a6">&#128170; GREEN PAD UPGRADES (Stages 1 to 5)</div>
        ${[1,2,3,4,5].map(i => `
        <label>Green Stage ${i} PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_gImg_${i}"><span>None</span><img src=""></div>
            <input id="gImg_${i}" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_gImg_${i}">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="gRemove_${i}" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="gTol_${i}" type="range" min="10" max="80" value="32">
            <span class="val-badge" id="v_gTol_${i}">32</span>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Green ${i} Size</span><span class="val-badge" id="v_gSize_${i}">${200 + i*45}</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="gSize_${i}" data-dir="-1">◀</button>
            <input id="gSize_${i}" type="range" min="60" max="1200" value="${200 + i*45}">
            <button type="button" class="step-btn" data-step-for="gSize_${i}" data-dir="1">▶</button>
          </div>
        </label>
        `).join('')}

        <div class="sub-title" style="color:#ff6b6b">&#128128; RED PAD DOWNGRADES (Stages 1 to 5)</div>
        ${[1,2,3,4,5].map(i => `
        <label>Red Stage ${i} PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_rImg_${i}"><span>None</span><img src=""></div>
            <input id="rImg_${i}" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_rImg_${i}">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="rRemove_${i}" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="rTol_${i}" type="range" min="10" max="80" value="32">
            <span class="val-badge" id="v_rTol_${i}">32</span>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Red ${i} Size</span><span class="val-badge red" id="v_rSize_${i}">${210 - i*20}</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="rSize_${i}" data-dir="-1">◀</button>
            <input id="rSize_${i}" type="range" min="60" max="1200" value="${210 - i*20}">
            <button type="button" class="step-btn" data-step-for="rSize_${i}" data-dir="1">▶</button>
          </div>
        </label>
        `).join('')}
      </div>
    </details>

    <!-- CARD 6: MOVING HIGHWAY & EYE-COMFORT THEMES -->
    <details class="drag-card" id="card_highway" open>
      <summary>
        <span>🛣️ Highway & Eye-Comfort Studio Backdrops</span>
        <span class="drag-handle" draggable="true">⠿ Drag</span>
      </summary>
      <div class="grid two">
        <label>
          <span class="label-head"><span>Forward speed</span><span class="val-badge" id="v_speed">0.24</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="speed" data-dir="-1">◀</button>
            <input id="speed" type="range" min="0.10" max="0.50" step="0.01" value="0.24">
            <button type="button" class="step-btn" data-step-for="speed" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Horizon Height (सड़क की लंबाई)</span><span class="val-badge" id="v_horizon">0.38</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="horizon" data-dir="-1">◀</button>
            <input id="horizon" type="range" min="0.20" max="0.65" step="0.01" value="0.38">
            <button type="button" class="step-btn" data-step-for="horizon" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Top Width (सीधी सड़क की चौड़ाई)</span><span class="val-badge" id="v_topWidth">0.38</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="topWidth" data-dir="-1">◀</button>
            <input id="topWidth" type="range" min="0.15" max="0.60" step="0.005" value="0.38">
            <button type="button" class="step-btn" data-step-for="topWidth" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Bottom Width (निचली चौड़ाई - नो ट्रायंगल)</span><span class="val-badge" id="v_bottomWidth">0.65</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="bottomWidth" data-dir="-1">◀</button>
            <input id="bottomWidth" type="range" min="0.40" max="0.95" step="0.01" value="0.65">
            <button type="button" class="step-btn" data-step-for="bottomWidth" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Camera Height</span><span class="val-badge" id="v_camHeight">1.05</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="camHeight" data-dir="-1">◀</button>
            <input id="camHeight" type="range" min="0.5" max="3.0" step="0.05" value="1.05">
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
          <span class="label-head"><span>Pad glow base</span><span class="val-badge" id="v_padThickness">22</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="padThickness" data-dir="-1">◀</button>
            <input id="padThickness" type="range" min="8" max="42" value="22">
            <button type="button" class="step-btn" data-step-for="padThickness" data-dir="1">▶</button>
          </div>
        </label>

        <!-- BACKGROUND THEME -->
        <label style="grid-column:1/-1;border:1px solid #61f0a6;padding:10px;border-radius:12px;background:#0d1813">
          <span style="color:#61f0a6;font-weight:900;font-size:14px">🎨 Eye-Comfort Studio Backdrops</span>
          <select id="bgMode" style="margin-top:6px">
            <optgroup label="--- ⭐ TOP FAVORITES ---">
              <option value="studioPaperSlate" selected>👑 1. Paper Slate Grey (Most Recommended - Best HD Pop)</option>
              <option value="studioRoyalCobalt">👑 2. Royal Cobalt Studio (Deep Pro Navy Blue)</option>
              <option value="studioSkyCyan">👑 3. Sky Cyan Studio (Viral Shorts Classic)</option>
              <option value="studioNordicMist">👑 4. Nordic Mist Grey (Soft Silver Studio)</option>
            </optgroup>
            <optgroup label="--- 🌿 Modern Aesthetic Moods ---">
              <option value="studioOceanTeal">🌊 5. Ocean Teal Studio</option>
              <option value="studioMintFresh">🍃 6. Pastel Mint Studio</option>
              <option value="studioSageClean">🌿 7. Soft Sage Studio</option>
              <option value="studioWarmSand">📜 8. Warm Paper Sand</option>
              <option value="studioPeachySunset">🍑 9. Peachy Sunset Studio</option>
              <option value="studioLavenderDusk">💜 10. Soft Lilac Studio</option>
              <option value="studioRoseVelvet">🌸 11. Dusty Rose Velvet</option>
              <option value="studioBubblegum">🍭 12. Soft Bubblegum Studio</option>
              <option value="studioGraphiteMatte">🖤 13. Matte Graphite Studio</option>
              <option value="studioDeepIndigo">🌌 14. Cinematic Deep Indigo</option>
              <option value="studioSoftPearl">⚪ 15. Studio Soft Pearl</option>
            </optgroup>
          </select>
        </label>

        <!-- 56 ROADS -->
        <label style="grid-column:1/-1">
          <span style="font-weight:900;color:var(--accent)">🛣️ Master Road Style (All 56 Straight Highway Roads)</span>
          <select id="roadVariant">
            <optgroup label="--- 🏆 1. Viral YouTube Pro Racing (10 Roads) ---">
              <option value="classic" selected>1. Classic V6 Red/White Racing Kerbs</option>
              <option value="v6Gold">2. Championship Matte Gold & Slate</option>
              <option value="v6CyberBlue">3. Cyber Blue Rumble Track</option>
              <option value="v6LimeBeast">4. Lime & Slate Speed Track</option>
              <option value="v6Monza">5. Formula Monza Yellow/Dark Curb</option>
              <option value="monacoF1">6. Monaco GP Crimson/White</option>
              <option value="asphaltSpeed">7. Pure Asphalt Speed Pro</option>
              <option value="tokyoDay">8. Tokyo City Day Asphalt</option>
              <option value="studioPaperWhite">9. Studio Minimalist White/Slate</option>
              <option value="carbonTrack">10. Sport Carbon Slate</option>
            </optgroup>
            <optgroup label="--- 🍭 2. Cartoon, Arcade & Candy Land (10 Roads) ---">
              <option value="candyPop">11. Bubblegum & Cyan Candy Road</option>
              <option value="skyRainbow">12. Sky High Rainbow Ribbon</option>
              <option value="marioKartCircuit">13. Kart Circuit Green & Curb</option>
              <option value="toyTownBlock">14. Vibrant Toy Town Track</option>
              <option value="pastelDream">15. Pastel Cotton Candy Highway</option>
              <option value="donutDune">16. Sugar Frosting Peach Road</option>
              <option value="retroPixel">17. 80s Arcade Pixel Runner</option>
              <option value="lemonLimeSpeed">18. Fizzy Lemon-Lime Sprint</option>
              <option value="mintChoco">19. Fresh Mint & Slate Road</option>
              <option value="sunflowerMeadow">20. Cheerful Honey Yellow Dash</option>
            </optgroup>
            <optgroup label="--- ☀️ 3. Day-Light, Coastal & Scenic (12 Roads) ---">
              <option value="sunnyDesert">21. Sunny Desert Sandstone</option>
              <option value="miamiBeach">22. Miami Coastal Turquoise</option>
              <option value="greenMeadow">23. Fresh Green Meadow Track</option>
              <option value="californiaSunset">24. California Warm Amber Sunset</option>
              <option value="redClayTrail">25. Grand Canyon Red Clay</option>
              <option value="nordicSnow">26. Nordic Ice Slate Valley</option>
              <option value="autumnMaple">27. Autumn Maple & Amber</option>
              <option value="goldenSands">28. Coastal Golden Shore</option>
              <option value="alpineMountain">29. Alpine Mountain Slate</option>
              <option value="emeraldGolfway">30. Emerald Golfway Royal</option>
              <option value="hawaiianOcean">31. Pacific Deep Teal Coast</option>
              <option value="lavenderValley">32. French Lavender Slate Highway</option>
            </optgroup>
            <optgroup label="--- ⚡ 4. Clean Cyber & Synth (12 Roads) ---">
              <option value="neonPulse">33. Soft Magenta & Cyan Circuit</option>
              <option value="edgeGlow">34. Clean Emerald Edge Runner</option>
              <option value="arcadeGrid">35. Tron Electric Grid</option>
              <option value="railRunner">36. Dual Lightbeam Highway</option>
              <option value="chevronRush">37. Arrow Chevron Sprint</option>
              <option value="cyberViolet">38. Ultra Violet Drift</option>
              <option value="laserCyan">39. Laser Cyan Circuit</option>
              <option value="plasmaPink">40. Smooth Cyber Pink Wave</option>
              <option value="overdriveNeon">41. Synthwave Dusk Drive</option>
              <option value="hyperSpace">42. Deep Space Periwinkle</option>
              <option value="matrixCode">43. Clean Matrix Greenflow</option>
              <option value="midnightHighway">44. Smooth Navy Midnight</option>
            </optgroup>
            <optgroup label="--- 💎 5. Elemental & Crystal Worlds (12 Roads) ---">
              <option value="iceCrystal">45. Frozen Sub-Zero Crystal</option>
              <option value="amethystPath">46. Royal Amethyst Gemstone</option>
              <option value="emeraldCity">47. Emerald Jade Highway</option>
              <option value="rubyRoyale">48. Royal Crimson Ruby Path</option>
              <option value="electricThunder">49. Storm Blue Lightning Dash</option>
              <option value="infernoFire">50. Warm Magma Hearth</option>
              <option value="lavaCrack">51. Deep Slate Lava Ridge</option>
              <option value="goldenPath">52. Royal Gold Treasury</option>
              <option value="toxicHazard">53. Bio-Lime Hazard Strip</option>
              <option value="cosmicVoid">54. Cosmic Purple Galaxy</option>
              <option value="cleanSlateMinimal">55. Crisp Studio Slate Grey</option>
              <option value="twinStripe">56. Twin Yellow Classic Stripes</option>
            </optgroup>
          </select>
        </label>

        <label class="toggle"><input id="speedLines" type="checkbox" checked> Motion streaks (YouTube speed)</label>
        <label class="toggle"><input id="roadShine" type="checkbox" checked> Road highlights</label>
      </div>
    </details>

    <!-- CARD 7: 5 ROWS CONTROLLER -->
    <details class="drag-card" id="card_rows" open>
      <summary>
        <span>🚦 5 Fixed Rows + Master Color Controller</span>
        <span class="drag-handle" draggable="true">⠿ Drag</span>
      </summary>
      <div class="rowbar">
        <div style="width:100%;background:#101318;padding:12px;border:1px solid #3c4454;border-radius:12px;display:grid;gap:10px">
          <b style="color:var(--accent)">⚡ Smart Master Color PNG (Applies by Color, NOT Straight Line!)</b>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:10px">
            <div style="background:#191d24;padding:9px;border-radius:9px;display:grid;gap:6px">
              <b style="font-size:11px;color:#2aff84">MASTER GREEN PADS PNG</b>
              <div class="file-wrap">
                <div class="thumb-box" id="thumb_master_green"><span>None</span><img src=""></div>
                <input id="master_green_file" type="file" accept="image/png,image/webp,image/jpeg">
                <button type="button" class="clear-btn" id="master_green_clear">✕ Clear</button>
              </div>
              <div class="cutout-ctrl">
                <input id="master_green_rm" type="checkbox" checked><span class="small">Auto Cut</span>
                <input id="master_green_tol" type="range" min="10" max="80" value="32">
                <span class="val-badge" id="v_master_green_tol">32</span>
              </div>
            </div>
            <div style="background:#191d24;padding:9px;border-radius:9px;display:grid;gap:6px">
              <b style="font-size:11px;color:#ff4d4d">MASTER RED PADS PNG</b>
              <div class="file-wrap">
                <div class="thumb-box" id="thumb_master_red"><span>None</span><img src=""></div>
                <input id="master_red_file" type="file" accept="image/png,image/webp,image/jpeg">
                <button type="button" class="clear-btn" id="master_red_clear">✕ Clear</button>
              </div>
              <div class="cutout-ctrl">
                <input id="master_red_rm" type="checkbox" checked><span class="small">Auto Cut</span>
                <input id="master_red_tol" type="range" min="10" max="80" value="32">
                <span class="val-badge" id="v_master_red_tol">32</span>
              </div>
            </div>
          </div>
        </div>

        <div style="width:100%;margin-top:6px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-weight:bold;font-size:12px;color:var(--accent)">⚡ Master All Pads PNG Size:</span>
          <div class="range-wrap" style="flex:1;min-width:140px">
            <button type="button" class="step-btn" data-step-for="masterPadPngSize" data-dir="-1">◀</button>
            <input id="masterPadPngSize" type="range" min="60" max="650" value="142">
            <button type="button" class="step-btn" data-step-for="masterPadPngSize" data-dir="1">▶</button>
          </div>
          <span class="val-badge" id="v_masterPadPngSize">142</span>
        </div>

        <div style="width:100%;margin-top:8px;padding-top:8px;border-top:1px dashed var(--line);display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <span style="font-weight:bold;font-size:12px;color:var(--gold)">⏱️ Boss Walk Distance:</span>
          <div class="range-wrap" style="flex:1;min-width:140px">
            <button type="button" class="step-btn" data-step-for="bossDistance" data-dir="-1">◀</button>
            <input id="bossDistance" type="range" min="1.0" max="6.0" step="0.2" value="2.8">
            <button type="button" class="step-btn" data-step-for="bossDistance" data-dir="1">▶</button>
          </div>
          <span class="val-badge gold" id="v_bossDistance">2.8s</span>
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
        <div class="cutout-ctrl">
          <input class="leftRemove" type="checkbox" checked><span class="small">Auto Cut</span>
          <input class="leftTol" type="range" min="10" max="80" value="32">
          <span class="val-badge leftTolVal">32</span>
        </div>
        <label>
          <span class="label-head"><span>Size</span><span class="val-badge leftSizeVal">142</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn step-left-minus">◀</button>
            <input class="leftSize" type="range" min="60" max="650" value="142">
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
        <div class="cutout-ctrl">
          <input class="rightRemove" type="checkbox" checked><span class="small">Auto Cut</span>
          <input class="rightTol" type="range" min="10" max="80" value="32">
          <span class="val-badge rightTolVal">32</span>
        </div>
        <label>
          <span class="label-head"><span>Size</span><span class="val-badge rightSizeVal">142</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn step-right-minus">◀</button>
            <input class="rightSize" type="range" min="60" max="650" value="142">
            <button type="button" class="step-right-plus step-btn">▶</button>
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
      <label>PNG
        <div class="file-wrap">
          <div class="thumb-box" id="thumb_oppImg"><span>None</span><img src=""></div>
          <input class="oppInput" type="file" accept="image/png,image/webp,image/jpeg">
          <button type="button" class="clear-btn" id="clear_oppImg">✕ Clear</button>
        </div>
      </label>
      <div class="cutout-ctrl">
        <input class="oppRemove" type="checkbox" checked><span class="small">Auto Cut</span>
        <input id="oppTol" type="range" min="10" max="80" value="32">
        <span class="val-badge" id="v_oppTol">32</span>
      </div>
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
var isScrubbing = false;
var frameCount = 0;

var currentPath = 'base';
var currentStageLevel = 0;
var processedPads = {};

var collectedHud = [null, null, null, null, null];
var collectedTimes = [-999, -999, -999, -999, -999];
var manualHudImgs = [null, null, null, null, null];
var manualHudRaw = [null, null, null, null, null];
var manualHudRemove = [true, true, true, true, true];
var manualHudTol = [32, 32, 32, 32, 32];

var lastImpactType = null;
var lastImpactTime = -999;
var vfxParticles = [];

// 🌟 UPGRADED PROPORTIONS: Straight Road Like Tom Video (No Sharp Triangle)
var state={
  speed:0.24,
  horizon:0.38,
  topWidth:0.38,
  bottomWidth:0.65,
  camHeight:1.05,
  padDelay:2.40,
  padThickness:22,
  bossDistance:2.8,
  roadVariant:'classic',
  bgMode:'studioPaperSlate',
  speedLines:true,
  roadShine:true,
  showHud:true,
  autoCollectHud:true,
  hudStyle:'fireInferno',
  hudY:155,
  hudBoxSize:132,
  hudSpacing:18,
  
  t1_show: true,
  t1_val: "LET'S GO",
  t1_style: 'tryloxyRed',
  t1_inAnim: 'elasticPunch',
  t1_outAnim: 'shrinkPop',
  t1_y: 430,
  t1_size: 110,
  t1_duration: 2.2,

  t2_show: true,
  t2_chainWithT1: true,
  t2_val: "Win or Lose!",
  t2_style: 'arcadeGold',
  t2_inAnim: 'slamImpact',
  t2_outAnim: 'shrinkPop',
  t2_y: 430,
  t2_size: 105,
  t2_duration: 3.5,

  enableVfx: true,
  vfxScaleJump: 0.08,
  vfxAuraSpread: 0.85,

  steerOffset:-1.0,
  baseStage: {img:null, raw:null, removeBg:true, tol:32, size:215},
  greenStages:[
    null,
    {img:null, raw:null, removeBg:true, tol:32, size:245},
    {img:null, raw:null, removeBg:true, tol:32, size:285},
    {img:null, raw:null, removeBg:true, tol:32, size:330},
    {img:null, raw:null, removeBg:true, tol:32, size:380},
    {img:null, raw:null, removeBg:true, tol:32, size:435}
  ],
  redStages:[
    null,
    {img:null, raw:null, removeBg:true, tol:32, size:195},
    {img:null, raw:null, removeBg:true, tol:32, size:170},
    {img:null, raw:null, removeBg:true, tol:32, size:150},
    {img:null, raw:null, removeBg:true, tol:32, size:130},
    {img:null, raw:null, removeBg:true, tol:32, size:110}
  ],
  playerZ:0.86,
  playerLane:'slider',
  playerX:W/2,
  currentLane:'left',
  rows:[],
  opponent:{src:null, img:null, removeBg:true, tol:32, size:330}
};

var bgColors = {
  studioPaperSlate: ['#64748b', '#334155', '#94a3b8'], 
  studioRoyalCobalt:['#1e3a8a', '#0f172a', '#3b82f6'], 
  studioSkyCyan:    ['#0284c7', '#082f49', '#38bdf8'], 
  studioNordicMist: ['#475569', '#1e293b', '#64748b'], 
  studioOceanTeal:  ['#0d9488', '#042f2e', '#2dd4bf'], 
  studioMintFresh:  ['#0d9488', '#083344', '#5eead4'], 
  studioSageClean:  ['#059669', '#064e3b', '#34d399'], 
  studioWarmSand:   ['#9a3412', '#431407', '#fdba74'], 
  studioPeachySunset:['#ea580c', '#7c2d12', '#fdba74'], 
  studioLavenderDusk:['#7c3aed', '#3b0764', '#a78bfa'], 
  studioRoseVelvet: ['#db2777', '#831843', '#f472b6'], 
  studioBubblegum:  ['#e11d48', '#881337', '#fb7185'], 
  studioGraphiteMatte:['#374151', '#1f2937', '#4b5563'], 
  studioDeepIndigo: ['#312e81', '#1e1b4b', '#4f46e5'], 
  studioSoftPearl:  ['#cbd5e1', '#94a3b8', '#f8fafc']
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
    if(key === 'bossDistance' || key === 'scrubBar' || key === 't1_duration' || key === 't2_duration') el.textContent = val + 's';
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
  if(k === 'arrowleft' || k === 'a') setRunnerLane(-1.0, 'Left');
  else if(k === 'arrowright' || k === 'd') setRunnerLane(1.0, 'Right');
  else if(k === 'arrowdown' || k === 's' || k === ' '){
    e.preventDefault();
    setRunnerLane(0.0, 'Center');
  }
});

function setupDragAndDrop(){
  var container = $('panelsContainer');
  if(!container) return;
  var draggedCard = null;

  var handles = container.querySelectorAll('.drag-handle');
  handles.forEach(function(handle){
    handle.addEventListener('dragstart', function(e){
      draggedCard = handle.closest('.drag-card');
      if(draggedCard){
        draggedCard.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      }
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
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', function(){
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', function(e){
      if(!draggedCard || draggedCard === card) return;
      e.preventDefault();
      card.classList.remove('drag-over');
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
    order.forEach(function(id){
      var el = $(id);
      if(el) container.appendChild(el);
    });
  }catch(e){}
}

function autoSaveStudio(){
  try{
    var s = {
      speed: state.speed,
      horizon: state.horizon,
      topWidth: state.topWidth,
      bottomWidth: state.bottomWidth,
      camHeight: state.camHeight,
      padDelay: state.padDelay,
      padThickness: state.padThickness,
      bossDistance: state.bossDistance,
      roadVariant: state.roadVariant,
      bgMode: state.bgMode,
      speedLines: state.speedLines,
      roadShine: state.roadShine,
      showHud: state.showHud,
      autoCollectHud: state.autoCollectHud,
      hudStyle: state.hudStyle,
      hudY: state.hudY,
      hudBoxSize: state.hudBoxSize,
      hudSpacing: state.hudSpacing,
      t1_show: state.t1_show,
      t1_val: state.t1_val,
      t1_style: state.t1_style,
      t1_inAnim: state.t1_inAnim,
      t1_outAnim: state.t1_outAnim,
      t1_y: state.t1_y,
      t1_size: state.t1_size,
      t1_duration: state.t1_duration,
      t2_show: state.t2_show,
      t2_chainWithT1: state.t2_chainWithT1,
      t2_val: state.t2_val,
      t2_style: state.t2_style,
      t2_inAnim: state.t2_inAnim,
      t2_outAnim: state.t2_outAnim,
      t2_y: state.t2_y,
      t2_size: state.t2_size,
      t2_duration: state.t2_duration,
      enableVfx: state.enableVfx,
      vfxScaleJump: state.vfxScaleJump,
      vfxAuraSpread: state.vfxAuraSpread,
      playerZ: state.playerZ,
      playerLane: state.playerLane,
      steerOffset: state.steerOffset,
      baseSize: state.baseStage.size,
      gSizes: [0, state.greenStages[1].size, state.greenStages[2].size, state.greenStages[3].size, state.greenStages[4].size, state.greenStages[5].size],
      rSizes: [0, state.redStages[1].size, state.redStages[2].size, state.redStages[3].size, state.redStages[4].size, state.redStages[5].size],
      oppRemove: state.opponent.removeBg,
      rows: state.rows.map(function(r){
        return {
          leftColor: r.leftColor,
          rightColor: r.rightColor,
          leftSize: r.leftSize,
          rightSize: r.rightSize,
          leftRemove: r.leftRemove,
          rightRemove: r.rightRemove
        };
      })
    };
    localStorage.setItem('runner_studio_saved_v36', JSON.stringify(s));
  }catch(err){}
}

function getSavedSettings(){
  try{
    var raw = localStorage.getItem('runner_studio_saved_v36');
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

function processImageDataUrl(dataUrl, removeBg, tolerance){
  tolerance = (tolerance !== undefined) ? Number(tolerance) : 32;
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
      
      var tol1 = tolerance;
      var tol2 = tolerance * 1.45;

      for(var i=0;i<d.length;i+=4){
        var dr=d[i]-br,dg=d[i+1]-bg,db=d[i+2]-bb;
        var dist=Math.sqrt(dr*dr+dg*dg+db*db);
        var bright=(d[i]+d[i+1]+d[i+2])/3;
        if(dist < tol1 || bright > (255 - tolerance*0.35)){
          d[i+3]=0;
        } else if(dist < tol2){
          d[i+3]=Math.min(d[i+3], 110);
        }
      }
      cx.putImageData(id,0,0);
      resolve(c.toDataURL('image/png'));
    };
    img.onerror=reject;
    img.src=dataUrl;
  });
}

function dataToProcessedImage(src, removeBg, tolerance){
  return processImageDataUrl(src, removeBg, tolerance).then(function(cleanSrc){
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

if($('t1_duration')) $('t1_duration').oninput = function(e){ state.t1_duration = Number(e.target.value); updateBadge('t1_duration', e.target.value); autoSaveStudio(); };
if($('t1_y')) $('t1_y').oninput = function(e){ state.t1_y = Number(e.target.value); updateBadge('t1_y', e.target.value); autoSaveStudio(); };
if($('t1_size')) $('t1_size').oninput = function(e){ state.t1_size = Number(e.target.value); updateBadge('t1_size', e.target.value); autoSaveStudio(); };
if($('t2_duration')) $('t2_duration').oninput = function(e){ state.t2_duration = Number(e.target.value); updateBadge('t2_duration', e.target.value); autoSaveStudio(); };
if($('t2_y')) $('t2_y').oninput = function(e){ state.t2_y = Number(e.target.value); updateBadge('t2_y', e.target.value); autoSaveStudio(); };
if($('t2_size')) $('t2_size').oninput = function(e){ state.t2_size = Number(e.target.value); updateBadge('t2_size', e.target.value); autoSaveStudio(); };

if($('vfxScaleJump')) $('vfxScaleJump').oninput = function(e){ state.vfxScaleJump = Number(e.target.value); updateBadge('vfxScaleJump', e.target.value); autoSaveStudio(); };
if($('vfxAuraSpread')) $('vfxAuraSpread').oninput = function(e){ state.vfxAuraSpread = Number(e.target.value); updateBadge('vfxAuraSpread', e.target.value); autoSaveStudio(); };

if($('showHud')) $('showHud').onchange = function(e){ state.showHud = e.target.checked; autoSaveStudio(); };
if($('autoCollectHud')) $('autoCollectHud').onchange = function(e){ state.autoCollectHud = e.target.checked; autoSaveStudio(); };
if($('hudStyle')) $('hudStyle').onchange = function(e){ state.hudStyle = e.target.value; autoSaveStudio(); };

if($('t1_show')) $('t1_show').onchange = function(e){ state.t1_show = e.target.checked; autoSaveStudio(); };
if($('t1_val')) $('t1_val').oninput = function(e){ state.t1_val = e.target.value; autoSaveStudio(); };
if($('t1_style')) $('t1_style').onchange = function(e){ state.t1_style = e.target.value; autoSaveStudio(); };
if($('t1_inAnim')) $('t1_inAnim').onchange = function(e){ state.t1_inAnim = e.target.value; autoSaveStudio(); };
if($('t1_outAnim')) $('t1_outAnim').onchange = function(e){ state.t1_outAnim = e.target.value; autoSaveStudio(); };

if($('t2_show')) $('t2_show').onchange = function(e){ state.t2_show = e.target.checked; autoSaveStudio(); };
if($('t2_chainWithT1')) $('t2_chainWithT1').onchange = function(e){ state.t2_chainWithT1 = e.target.checked; autoSaveStudio(); };
if($('t2_val')) $('t2_val').oninput = function(e){ state.t2_val = e.target.value; autoSaveStudio(); };
if($('t2_style')) $('t2_style').onchange = function(e){ state.t2_style = e.target.value; autoSaveStudio(); };
if($('t2_inAnim')) $('t2_inAnim').onchange = function(e){ state.t2_inAnim = e.target.value; autoSaveStudio(); };
if($('t2_outAnim')) $('t2_outAnim').onchange = function(e){ state.t2_outAnim = e.target.value; autoSaveStudio(); };
if($('enableVfx')) $('enableVfx').onchange = function(e){ state.enableVfx = e.target.checked; autoSaveStudio(); };

var steerInput = $('laneSteer');
if(steerInput){
  steerInput.oninput = function(e){
    state.steerOffset = Number(e.target.value);
    state.playerLane = 'slider';
    if($('playerLane')) $('playerLane').value = 'slider';
    var textVal = state.steerOffset <= -0.2 ? (state.steerOffset + ' (Left)') : (state.steerOffset >= 0.2 ? (state.steerOffset + ' (Right)') : '0.0 (Center)');
    updateBadge('laneSteer', textVal);
    autoSaveStudio();
  };
}

$('quickLeftBtn').onclick = function(){ setRunnerLane(-1.0, 'Left'); };
$('quickCenterBtn').onclick = function(){ setRunnerLane(0.0, 'Center'); };
$('quickRightBtn').onclick = function(){ setRunnerLane(1.0, 'Right'); };

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
    if(state.baseStage.raw){
      dataToProcessedImage(state.baseStage.raw, state.baseStage.removeBg, state.baseStage.tol).then(function(im){
        state.baseStage.img = im;
        updateThumbBox($('thumb_pImg_0'), im.src);
      });
    }
  };
}
if($('pTol_0')){
  $('pTol_0').oninput = function(e){
    state.baseStage.tol = Number(e.target.value);
    updateBadge('pTol_0', e.target.value);
    if(state.baseStage.raw){
      dataToProcessedImage(state.baseStage.raw, state.baseStage.removeBg, state.baseStage.tol).then(function(im){
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
      state.baseStage.raw = src;
      dataToProcessedImage(src, state.baseStage.removeBg, state.baseStage.tol).then(function(im){
        state.baseStage.img = im;
        updateThumbBox($('thumb_pImg_0'), im.src);
      });
    });
  };
}
if($('clear_pImg_0')){
  $('clear_pImg_0').onclick = function(){
    if($('pImg_0')) $('pImg_0').value = '';
    state.baseStage.raw = null;
    state.baseStage.img = null;
    updateThumbBox($('thumb_pImg_0'), null);
  };
}

for(var k=1; k<=5; k++){
  (function(idx){
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
        if(state.greenStages[idx].raw){
          dataToProcessedImage(state.greenStages[idx].raw, state.greenStages[idx].removeBg, state.greenStages[idx].tol).then(function(im){
            state.greenStages[idx].img = im;
            updateThumbBox($('thumb_gImg_' + idx), im.src);
          });
        }
      };
    }
    if($('gTol_' + idx)){
      $('gTol_' + idx).oninput = function(e){
        state.greenStages[idx].tol = Number(e.target.value);
        updateBadge('gTol_' + idx, e.target.value);
        if(state.greenStages[idx].raw){
          dataToProcessedImage(state.greenStages[idx].raw, state.greenStages[idx].removeBg, state.greenStages[idx].tol).then(function(im){
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
          state.greenStages[idx].raw = src;
          dataToProcessedImage(src, state.greenStages[idx].removeBg, state.greenStages[idx].tol).then(function(im){
            state.greenStages[idx].img = im;
            updateThumbBox($('thumb_gImg_' + idx), im.src);
          });
        });
      };
    }
    if($('clear_gImg_' + idx)){
      $('clear_gImg_' + idx).onclick = function(){
        if($('gImg_' + idx)) $('gImg_' + idx).value = '';
        state.greenStages[idx].raw = null;
        state.greenStages[idx].img = null;
        updateThumbBox($('thumb_gImg_' + idx), null);
      };
    }

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
        if(state.redStages[idx].raw){
          dataToProcessedImage(state.redStages[idx].raw, state.redStages[idx].removeBg, state.redStages[idx].tol).then(function(im){
            state.redStages[idx].img = im;
            updateThumbBox($('thumb_rImg_' + idx), im.src);
          });
        }
      };
    }
    if($('rTol_' + idx)){
      $('rTol_' + idx).oninput = function(e){
        state.redStages[idx].tol = Number(e.target.value);
        updateBadge('rTol_' + idx, e.target.value);
        if(state.redStages[idx].raw){
          dataToProcessedImage(state.redStages[idx].raw, state.redStages[idx].removeBg, state.redStages[idx].tol).then(function(im){
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
          state.redStages[idx].raw = src;
          dataToProcessedImage(src, state.redStages[idx].removeBg, state.redStages[idx].tol).then(function(im){
            state.redStages[idx].img = im;
            updateThumbBox($('thumb_rImg_' + idx), im.src);
          });
        });
      };
    }
    if($('clear_rImg_' + idx)){
      $('clear_rImg_' + idx).onclick = function(){
        if($('rImg_' + idx)) $('rImg_' + idx).value = '';
        state.redStages[idx].raw = null;
        state.redStages[idx].img = null;
        updateThumbBox($('thumb_rImg_' + idx), null);
      };
    }
  })(k);
}

if($('masterPadPngSize')){
  $('masterPadPngSize').oninput = function(e){
    var val = Number(e.target.value);
    updateBadge('masterPadPngSize', val);
    state.rows.forEach(function(r){
      r.leftSize = val;
      r.rightSize = val;
    });
    document.querySelectorAll('.leftSize').forEach(function(inp){ inp.value = val; });
    document.querySelectorAll('.rightSize').forEach(function(inp){ inp.value = val; });
    document.querySelectorAll('.leftSizeVal').forEach(function(bdg){ bdg.textContent = val; });
    document.querySelectorAll('.rightSizeVal').forEach(function(bdg){ bdg.textContent = val; });
    autoSaveStudio();
  };
}

if($('roadVariant')) $('roadVariant').onchange=function(e){
  state.roadVariant=e.target.value; 
  autoSaveStudio();
};

if($('speedLines')) $('speedLines').onchange=function(e){state.speedLines=e.target.checked; autoSaveStudio();};
if($('roadShine')) $('roadShine').onchange=function(e){state.roadShine=e.target.checked; autoSaveStudio();};
if($('bgMode')) $('bgMode').onchange=function(e){state.bgMode=e.target.value; autoSaveStudio();};
if($('playerLane')) $('playerLane').onchange=function(e){state.playerLane=e.target.value; autoSaveStudio();};

function makeId(){ return String(Date.now()+Math.random()); }

function addRow(saved){
  saved = saved || {};
  var defSize = 142;
  var row={
    id:makeId(),
    leftColor: (saved.leftColor && saved.leftColor.charAt(0)==='#') ? saved.leftColor : '#2aff84', 
    rightColor: (saved.rightColor && saved.rightColor.charAt(0)==='#') ? saved.rightColor : '#ff323a',
    leftSize: Number(saved.leftSize) || defSize, 
    rightSize: Number(saved.rightSize) || defSize,
    leftSrc: saved.leftSrc || null, 
    rightSrc: saved.rightSrc || null,
    leftImg: null, 
    rightImg: null,
    leftRemove: saved.leftRemove!==false, 
    rightRemove: saved.rightRemove!==false,
    leftTol: Number(saved.leftTol) || 32,
    rightTol: Number(saved.rightTol) || 32
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

  var leftTolInp = el.querySelector('.leftTol');
  var rightTolInp = el.querySelector('.rightTol');
  var leftTolVal = el.querySelector('.leftTolVal');
  var rightTolVal = el.querySelector('.rightTolVal');

  leftColorInput.value=row.leftColor;
  rightColorInput.value=row.rightColor;
  if(leftColorVal) leftColorVal.textContent=row.leftColor;
  if(rightColorVal) rightColorVal.textContent=row.rightColor;

  leftSizeInput.value=row.leftSize;
  rightSizeInput.value=row.rightSize;
  if(leftSizeVal) leftSizeVal.textContent=row.leftSize;
  if(rightSizeVal) rightSizeVal.textContent=row.rightSize;

  leftTolInp.value = row.leftTol;
  rightTolInp.value = row.rightTol;
  if(leftTolVal) leftTolVal.textContent = row.leftTol;
  if(rightTolVal) rightTolVal.textContent = row.rightTol;

  stepLeftMinus.onclick = function(){ stepSlider(leftSizeInput, -1); };
  stepLeftPlus.onclick = function(){ stepSlider(leftSizeInput, 1); };
  stepRightMinus.onclick = function(){ stepSlider(rightSizeInput, -1); };
  stepRightPlus.onclick = function(){ stepSlider(rightSizeInput, 1); };

  clearLeft.onclick = function(){
    el.querySelector('.leftInput').value = '';
    row.leftSrc = null;
    row.leftImg = null;
    updateThumbBox(thumbLeft, null);
  };
  clearRight.onclick = function(){
    el.querySelector('.rightInput').value = '';
    row.rightSrc = null;
    row.rightImg = null;
    updateThumbBox(thumbRight, null);
  };

  el.querySelector('.leftRemove').checked=row.leftRemove;
  el.querySelector('.rightRemove').checked=row.rightRemove;

  leftTolInp.oninput = function(e){
    row.leftTol = Number(e.target.value);
    if(leftTolVal) leftTolVal.textContent = e.target.value;
    if(row.leftSrc){
      dataToProcessedImage(row.leftSrc, row.leftRemove, row.leftTol).then(function(im){
        row.leftImg = im;
        updateThumbBox(thumbLeft, im.src);
      });
    }
  };

  rightTolInp.oninput = function(e){
    row.rightTol = Number(e.target.value);
    if(rightTolVal) rightTolVal.textContent = e.target.value;
    if(row.rightSrc){
      dataToProcessedImage(row.rightSrc, row.rightRemove, row.rightTol).then(function(im){
        row.rightImg = im;
        updateThumbBox(thumbRight, im.src);
      });
    }
  };

  leftColorInput.oninput=function(e){
    row.leftColor=e.target.value;
    if(leftColorVal) leftColorVal.textContent=e.target.value;
    autoSaveStudio();
  };
  rightColorInput.oninput=function(e){
    row.rightColor=e.target.value;
    if(rightColorVal) rightColorVal.textContent=e.target.value;
    autoSaveStudio();
  };
  leftSizeInput.oninput=function(e){
    row.leftSize=Number(e.target.value); 
    if(leftSizeVal) leftSizeVal.textContent=e.target.value;
    autoSaveStudio();
  };
  rightSizeInput.oninput=function(e){
    row.rightSize=Number(e.target.value); 
    if(rightSizeVal) rightSizeVal.textContent=e.target.value;
    autoSaveStudio();
  };
  
  el.querySelector('.leftRemove').onchange=function(e){
    row.leftRemove=e.target.checked; 
    autoSaveStudio(); 
    if(row.leftSrc){
      dataToProcessedImage(row.leftSrc, row.leftRemove, row.leftTol).then(function(im){
        row.leftImg=im;
        updateThumbBox(thumbLeft, im.src);
      });
    }
  };
  el.querySelector('.rightRemove').onchange=function(e){
    row.rightRemove=e.target.checked; 
    autoSaveStudio(); 
    if(row.rightSrc){
      dataToProcessedImage(row.rightSrc, row.rightRemove, row.rightTol).then(function(im){
        row.rightImg=im;
        updateThumbBox(thumbRight, im.src);
      });
    }
  };
  el.querySelector('.leftInput').onchange=function(e){
    var f=e.target.files[0];if(!f)return;
    readFile(f).then(function(src){
      row.leftSrc=src;
      dataToProcessedImage(row.leftSrc, row.leftRemove, row.leftTol).then(function(im){
        row.leftImg=im;
        updateThumbBox(thumbLeft, im.src);
      });
    });
  };
  el.querySelector('.rightInput').onchange=function(e){
    var f=e.target.files[0];if(!f)return;
    readFile(f).then(function(src){
      row.rightSrc=src;
      dataToProcessedImage(row.rightSrc, row.rightRemove, row.rightTol).then(function(im){
        row.rightImg=im;
        updateThumbBox(thumbRight, im.src);
      });
    });
  };
  
  $('rows').appendChild(el);
  if(row.leftSrc) dataToProcessedImage(row.leftSrc, row.leftRemove, row.leftTol).then(function(im){ row.leftImg=im; updateThumbBox(thumbLeft, im.src); });
  if(row.rightSrc) dataToProcessedImage(row.rightSrc, row.rightRemove, row.rightTol).then(function(im){ row.rightImg=im; updateThumbBox(thumbRight, im.src); });
}

function setupMasterBatchUploaders(){
  var mGreenInp = $('master_green_file');
  var mGreenClr = $('master_green_clear');
  var mGreenBox = $('thumb_master_green');
  var mGreenRm = $('master_green_rm');
  var mGreenTol = $('master_green_tol');

  var mRedInp = $('master_red_file');
  var mRedClr = $('master_red_clear');
  var mRedBox = $('thumb_master_red');
  var mRedRm = $('master_red_rm');
  var mRedTol = $('master_red_tol');

  function isGreenPad(hex){
    var h = (hex || '').toLowerCase();
    return h.indexOf('2a') !== -1 || h.indexOf('00') !== -1 || h.indexOf('green') !== -1;
  }

  function applyMasterGreen(src, removeBg, tol){
    updateThumbBox(mGreenBox, src);
    if(!src){
      state.rows.forEach(function(r, idx){
        var isLeftGreen = isGreenPad(r.leftColor);
        if(isLeftGreen){ r.leftSrc = null; r.leftImg = null; }
        else { r.rightSrc = null; r.rightImg = null; }
        var rEl = document.querySelectorAll('.row')[idx];
        if(rEl){
          if(isLeftGreen){ rEl.querySelector('.leftInput').value = ''; updateThumbBox(rEl.querySelector('.thumb-left'), null); }
          else { rEl.querySelector('.rightInput').value = ''; updateThumbBox(rEl.querySelector('.thumb-right'), null); }
        }
      });
      return;
    }
    dataToProcessedImage(src, removeBg, tol).then(function(im){
      state.rows.forEach(function(r, idx){
        var isLeftGreen = isGreenPad(r.leftColor);
        var rEl = document.querySelectorAll('.row')[idx];
        if(isLeftGreen){
          r.leftSrc = src;
          r.leftImg = im;
          r.leftRemove = removeBg;
          r.leftTol = tol;
          if(rEl){
            rEl.querySelector('.leftRemove').checked = removeBg;
            rEl.querySelector('.leftTol').value = tol;
            rEl.querySelector('.leftTolVal').textContent = tol;
            updateThumbBox(rEl.querySelector('.thumb-left'), im.src);
          }
        } else {
          r.rightSrc = src;
          r.rightImg = im;
          r.rightRemove = removeBg;
          r.rightTol = tol;
          if(rEl){
            rEl.querySelector('.rightRemove').checked = removeBg;
            rEl.querySelector('.rightTol').value = tol;
            rEl.querySelector('.rightTolVal').textContent = tol;
            updateThumbBox(rEl.querySelector('.thumb-right'), im.src);
          }
        }
      });
      autoSaveStudio();
    });
  }

  function applyMasterRed(src, removeBg, tol){
    updateThumbBox(mRedBox, src);
    if(!src){
      state.rows.forEach(function(r, idx){
        var isLeftRed = !isGreenPad(r.leftColor);
        if(isLeftRed){ r.leftSrc = null; r.leftImg = null; }
        else { r.rightSrc = null; r.rightImg = null; }
        var rEl = document.querySelectorAll('.row')[idx];
        if(rEl){
          if(isLeftRed){ rEl.querySelector('.leftInput').value = ''; updateThumbBox(rEl.querySelector('.thumb-left'), null); }
          else { rEl.querySelector('.rightInput').value = ''; updateThumbBox(rEl.querySelector('.thumb-right'), null); }
        }
      });
      return;
    }
    dataToProcessedImage(src, removeBg, tol).then(function(im){
      state.rows.forEach(function(r, idx){
        var isLeftRed = !isGreenPad(r.leftColor);
        var rEl = document.querySelectorAll('.row')[idx];
        if(isLeftRed){
          r.leftSrc = src;
          r.leftImg = im;
          r.leftRemove = removeBg;
          r.leftTol = tol;
          if(rEl){
            rEl.querySelector('.leftRemove').checked = removeBg;
            rEl.querySelector('.leftTol').value = tol;
            rEl.querySelector('.leftTolVal').textContent = tol;
            updateThumbBox(rEl.querySelector('.thumb-left'), im.src);
          }
        } else {
          r.rightSrc = src;
          r.rightImg = im;
          r.rightRemove = removeBg;
          r.rightTol = tol;
          if(rEl){
            rEl.querySelector('.rightRemove').checked = removeBg;
            rEl.querySelector('.rightTol').value = tol;
            rEl.querySelector('.rightTolVal').textContent = tol;
            updateThumbBox(rEl.querySelector('.thumb-right'), im.src);
          }
        }
      });
      autoSaveStudio();
    });
  }

  var curMasterGreenSrc = null;
  var curMasterRedSrc = null;

  if(mGreenInp){
    mGreenInp.onchange = function(e){
      var f = e.target.files[0]; if(!f) return;
      readFile(f).then(function(src){
        curMasterGreenSrc = src;
        applyMasterGreen(src, mGreenRm.checked, Number(mGreenTol.value));
      });
    };
  }
  if(mGreenTol){
    mGreenTol.oninput = function(e){
      updateBadge('master_green_tol', e.target.value);
      if(curMasterGreenSrc) applyMasterGreen(curMasterGreenSrc, mGreenRm.checked, Number(e.target.value));
    };
  }
  if(mGreenRm){
    mGreenRm.onchange = function(){
      if(curMasterGreenSrc) applyMasterGreen(curMasterGreenSrc, mGreenRm.checked, Number(mGreenTol.value));
    };
  }
  if(mGreenClr){
    mGreenClr.onclick = function(){
      if(mGreenInp) mGreenInp.value = '';
      curMasterGreenSrc = null;
      applyMasterGreen(null, true, 32);
    };
  }

  if(mRedInp){
    mRedInp.onchange = function(e){
      var f = e.target.files[0]; if(!f) return;
      readFile(f).then(function(src){
        curMasterRedSrc = src;
        applyMasterRed(src, mRedRm.checked, Number(mRedTol.value));
      });
    };
  }
  if(mRedTol){
    mRedTol.oninput = function(e){
      updateBadge('master_red_tol', e.target.value);
      if(curMasterRedSrc) applyMasterRed(curMasterRedSrc, mRedRm.checked, Number(e.target.value));
    };
  }
  if(mRedRm){
    mRedRm.onchange = function(){
      if(curMasterRedSrc) applyMasterRed(curMasterRedSrc, mRedRm.checked, Number(mRedTol.value));
    };
  }
  if(mRedClr){
    mRedClr.onclick = function(){
      if(mRedInp) mRedInp.value = '';
      curMasterRedSrc = null;
      applyMasterRed(null, true, 32);
    };
  }
}

function initRows(){
  $('rows').innerHTML='';
  state.rows=[];
  rowCounter=0;
  
  var savedData = getSavedSettings();
  if(savedData && typeof savedData === 'object'){
    ['speed','horizon','topWidth','bottomWidth','camHeight','padDelay','padThickness','bossDistance','playerZ','hudY','hudBoxSize','hudSpacing'].forEach(function(id){
      if(savedData[id] !== undefined && $(id)){
        state[id] = Number(savedData[id]);
        $(id).value = savedData[id];
        updateBadge(id, savedData[id]);
      }
    });

    if(savedData.t1_show !== undefined && $('t1_show')){ state.t1_show = Boolean(savedData.t1_show); $('t1_show').checked = state.t1_show; }
    if(savedData.t1_val !== undefined && $('t1_val')){ state.t1_val = savedData.t1_val; $('t1_val').value = state.t1_val; }
    if(savedData.t1_style && $('t1_style')){ state.t1_style = savedData.t1_style; $('t1_style').value = state.t1_style; }
    if(savedData.t1_duration !== undefined && $('t1_duration')){ state.t1_duration = Number(savedData.t1_duration); $('t1_duration').value = state.t1_duration; updateBadge('t1_duration', state.t1_duration); }
    if(savedData.t1_y !== undefined && $('t1_y')){ state.t1_y = Number(savedData.t1_y); $('t1_y').value = state.t1_y; updateBadge('t1_y', state.t1_y); }
    if(savedData.t1_size !== undefined && $('t1_size')){ state.t1_size = Number(savedData.t1_size); $('t1_size').value = state.t1_size; updateBadge('t1_size', state.t1_size); }

    if(savedData.t2_show !== undefined && $('t2_show')){ state.t2_show = Boolean(savedData.t2_show); $('t2_show').checked = state.t2_show; }
    if(savedData.t2_chainWithT1 !== undefined && $('t2_chainWithT1')){ state.t2_chainWithT1 = Boolean(savedData.t2_chainWithT1); $('t2_chainWithT1').checked = state.t2_chainWithT1; }
    if(savedData.t2_val !== undefined && $('t2_val')){ state.t2_val = savedData.t2_val; $('t2_val').value = state.t2_val; }
    if(savedData.t2_style && $('t2_style')){ state.t2_style = savedData.t2_style; $('t2_style').value = state.t2_style; }
    if(savedData.t2_duration !== undefined && $('t2_duration')){ state.t2_duration = Number(savedData.t2_duration); $('t2_duration').value = state.t2_duration; updateBadge('t2_duration', state.t2_duration); }
    if(savedData.t2_y !== undefined && $('t2_y')){ state.t2_y = Number(savedData.t2_y); $('t2_y').value = state.t2_y; updateBadge('t2_y', state.t2_y); }
    if(savedData.t2_size !== undefined && $('t2_size')){ state.t2_size = Number(savedData.t2_size); $('t2_size').value = state.t2_size; updateBadge('t2_size', state.t2_size); }

    if(savedData.roadVariant && $('roadVariant')){ 
      state.roadVariant = savedData.roadVariant; 
      $('roadVariant').value = savedData.roadVariant; 
    }
    if(savedData.bgMode && $('bgMode')){ state.bgMode = savedData.bgMode; $('bgMode').value = savedData.bgMode; }

    var rowList = (Array.isArray(savedData.rows) && savedData.rows.length===5) ? savedData.rows : [
      {leftColor:'#2aff84', rightColor:'#ff323a'},
      {leftColor:'#ff323a', rightColor:'#2aff84'},
      {leftColor:'#2aff84', rightColor:'#ff323a'},
      {leftColor:'#ff323a', rightColor:'#2aff84'},
      {leftColor:'#2aff84', rightColor:'#ff323a'}
    ];
    rowList.forEach(addRow);
  } else {
    ['speed','horizon','topWidth','bottomWidth','camHeight','padDelay','padThickness','bossDistance','playerZ','hudY','hudBoxSize','hudSpacing'].forEach(function(id){
      updateBadge(id, state[id]);
    });
    updateBadge('pSize_0', state.baseStage.size);
    for(var i=1;i<=5;i++){
      updateBadge('gSize_' + i, state.greenStages[i].size);
      updateBadge('rSize_' + i, state.redStages[i].size);
    }
    for(var i=0;i<5;i++){
      addRow({leftColor:i%2?'#ff323a':'#2aff84', rightColor:i%2?'#2aff84':'#ff323a'});
    }
  }

  var oppEl=$('opponentTemplate').content.firstElementChild.cloneNode(true);
  oppEl.querySelector('.oppRemove').onchange=function(e){
    state.opponent.removeBg=e.target.checked; 
    autoSaveStudio(); 
    if(state.opponent.src){
      dataToProcessedImage(state.opponent.src, state.opponent.removeBg, state.opponent.tol).then(function(im){
        state.opponent.img=im;
        updateThumbBox($('thumb_oppImg'), im.src);
      });
    }
  };
  var oppTolInp = oppEl.querySelector('#oppTol');
  if(oppTolInp){
    oppTolInp.oninput = function(e){
      state.opponent.tol = Number(e.target.value);
      updateBadge('oppTol', e.target.value);
      if(state.opponent.src){
        dataToProcessedImage(state.opponent.src, state.opponent.removeBg, state.opponent.tol).then(function(im){
          state.opponent.img=im;
          updateThumbBox($('thumb_oppImg'), im.src);
        });
      }
    };
  }

  oppEl.querySelector('.oppInput').onchange=function(e){
    var f=e.target.files[0];if(!f)return;
    readFile(f).then(function(src){
      state.opponent.src=src;
      dataToProcessedImage(state.opponent.src, state.opponent.removeBg, state.opponent.tol).then(function(im){
        state.opponent.img=im;
        updateThumbBox($('thumb_oppImg'), im.src);
      });
    });
  };
  var clearOpp = oppEl.querySelector('#clear_oppImg');
  if(clearOpp){
    clearOpp.onclick = function(){
      oppEl.querySelector('.oppInput').value = '';
      state.opponent.src = null;
      state.opponent.img = null;
      updateThumbBox($('thumb_oppImg'), null);
    };
  }
  $('rows').appendChild(oppEl);

  setupMasterBatchUploaders();
  restoreCardOrder();
  setupDragAndDrop();
}
initRows();

var TRACK_Z_LENGTH=220;
var BASE_TRACK_Z_LENGTH=125;
var TRACK_MOTION_SCALE=BASE_TRACK_Z_LENGTH/TRACK_Z_LENGTH;

// 🌟 MATHEMATICALLY BALANCED STRAIGHT HIGHWAY (TELEPHOTO RUNNER LOOK)
function roadBoundsAtZ(z){
  var t = Math.max(0, z);
  var camH = Math.max(0.4, state.camHeight || 1.05);
  
  var dynamicHorizon = H * (state.horizon || 0.38) + (1.0 - camH) * (H * 0.08);
  var dynamicHorizonY = Math.max(H * 0.15, Math.min(H * 0.70, dynamicHorizon));

  var TOP_HALF = W * (state.topWidth || 0.38) * 0.50;
  var BOTTOM_HALF = W * (state.bottomWidth || 0.65) * 0.50;

  var zDistance = Math.max(0.01, (1.0 - t) * (5.5 / camH) + 1.25);
  var scale = 1.0 / zDistance;
  var minScale = 1.0 / ((5.5 / camH) + 1.25);
  var maxScale = 1.0 / 1.25;
  var depth = (scale - minScale) / (maxScale - minScale);

  var y = dynamicHorizonY + (H - dynamicHorizonY) * depth;
  var half = TOP_HALF + (BOTTOM_HALF - TOP_HALF) * depth;

  return {e:depth, y:y, l:W/2-half, r:W/2+half, half:half};
}

function drawPoly(pts, fill){
  ctx.beginPath();
  ctx.moveTo(pts[0][0],pts[0][1]);
  for(var i=1;i<pts.length;i++) ctx.lineTo(pts[i][0],pts[i][1]);
  ctx.closePath();
  ctx.fillStyle=fill;
  ctx.fill();
}
function quad(a,b){return [[a.l,a.y],[a.r,a.y],[b.r,b.y],[b.l,b.y]];}

function fillRoadBase(topColor,bottomColor){
  var top=roadBoundsAtZ(0), bottom=roadBoundsAtZ(1);
  var g=ctx.createLinearGradient(0,top.y,0,H);
  g.addColorStop(0,topColor);
  g.addColorStop(1,bottomColor);
  drawPoly([[top.l,top.y],[top.r,top.y],[bottom.r,H],[bottom.l,H]],g);
  return {top:top,bottom:bottom};
}

function drawEdgeStripSeries(count,speedFactor,widthA,widthB,colorA,colorB){
  for(var i=0;i<count;i++){
    var z0=(i/count + roadTime*state.speed*TRACK_MOTION_SCALE*speedFactor)%1;
    var z1=z0+.065;
    if(z1>1) continue;
    var a=roadBoundsAtZ(z0), b=roadBoundsAtZ(z1);
    var wa=widthA+widthB*a.e, wb=widthA+widthB*b.e;
    var c=i%2===0?colorA:colorB;
    drawPoly([[a.l,a.y],[a.l+wa,a.y],[b.l+wb,b.y],[b.l,b.y]],c);
    drawPoly([[a.r-wa,a.y],[a.r,a.y],[b.r,b.y],[b.r-wb,b.y]],c);
  }
}

function drawCenterDashed(offsetRatio,color,widthBase,widthGrow,len,density,speedFactor,minZ){
  for(var i=0;i<density;i++){
    var z0=(i/density + roadTime*state.speed*TRACK_MOTION_SCALE*speedFactor)%1;
    var z1=z0+len;
    if(z1>1 || z0<minZ) continue;
    var a=roadBoundsAtZ(z0), b=roadBoundsAtZ(z1);
    var x0=W/2+a.half*offsetRatio;
    var x1=W/2+b.half*offsetRatio;
    ctx.save();
    ctx.strokeStyle=color;
    ctx.lineCap='round';
    ctx.lineWidth=(widthBase+widthGrow*a.e)*1.5;
    ctx.beginPath();
    ctx.moveTo(x0,a.y);
    ctx.lineTo(x1,b.y);
    ctx.stroke();
    ctx.restore();
  }
}

function drawSideRails(color){
  ctx.save();
  ctx.strokeStyle=color;
  ctx.lineCap='round';
  for(var i=0;i<10;i++){
    var z0=(i/10 + roadTime*state.speed*TRACK_MOTION_SCALE*.84)%1;
    var z1=z0+.075;
    if(z1>1 || z0<.06) continue;
    var a=roadBoundsAtZ(z0), b=roadBoundsAtZ(z1);
    ctx.globalAlpha=.14+.42*a.e;
    ctx.lineWidth=(2+6*a.e)*1.5;
    ctx.beginPath();
    ctx.moveTo(a.l+18+a.e*12,a.y);
    ctx.lineTo(b.l+18+b.e*12,b.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(a.r-18-a.e*12,a.y);
    ctx.lineTo(b.r-18-b.e*12,b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawRoadTexture(strength){
  ctx.save();
  for(var i=0;i<9;i++){
    var z=(i*.13 + roadTime*state.speed*TRACK_MOTION_SCALE*1.08)%1;
    if(z<.15) continue;
    var a=roadBoundsAtZ(z), b=roadBoundsAtZ(Math.min(1,z+.06));
    var alpha=.015+strength*a.e;
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
    ctx.globalAlpha=(.16+.45*z)*alphaMul;ctx.lineWidth=(2+5*z)*1.5;
    ctx.beginPath();ctx.moveTo(xA,a.y);ctx.lineTo(xB,b.y);ctx.stroke();
  }
  ctx.restore();
}

function drawBackground(){
  var theme = bgColors[state.bgMode] || bgColors.studioPaperSlate;
  var rad = ctx.createRadialGradient(W/2, H*0.35, W*0.08, W/2, H*0.40, W*0.85);
  rad.addColorStop(0, theme[2]);
  rad.addColorStop(0.55, theme[0]);
  rad.addColorStop(1, theme[1]);
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, W, H);
}

function makeRoad(baseT, baseB, curbA, curbB, dashColor, dualDash, railsColor){
  fillRoadBase(baseT, baseB);
  drawRoadTexture(0.024);
  drawEdgeStripSeries(18, 0.85, 8, 42, curbA, curbB);
  if(dualDash){
    drawCenterDashed(-0.05, dashColor, 2.5, 5.5, 0.09, 10, 0.85, 0.14);
    drawCenterDashed(0.05, dashColor, 2.5, 5.5, 0.09, 10, 0.85, 0.14);
  } else if(dashColor){
    drawCenterDashed(0, dashColor, 3, 7, 0.12, 10, 0.85, 0.12);
  }
  if(railsColor) drawSideRails(railsColor);
  if(state.roadShine) drawRoadShineSeries('rgba(255,255,255,0.30)', 1.0);
}

// 56 ROADS FUNCTIONS
function rClassic(){ makeRoad('#64748b', '#334155', '#ff3344', '#ffffff', 'rgba(255,255,255,0.95)', false); }
function rV6Gold(){ makeRoad('#6b7280', '#374151', '#f59e0b', '#ffffff', 'rgba(255,255,255,0.9)', false); }
function rV6CyberBlue(){ makeRoad('#5a6b82', '#2d3748', '#0ea5e9', '#ffffff', '#38bdf8', false); }
function rV6LimeBeast(){ makeRoad('#566963', '#2a3b34', '#10b981', '#1f2937', '#6ee7b7', false); }
function rV6Monza(){ makeRoad('#5b6470', '#2d333b', '#eab308', '#111827', '#fef08a', false); }
function rMonacoF1(){ makeRoad('#52525b', '#27272a', '#ef4444', '#fafafa', '#ffffff', false); }
function rAsphaltSpeed(){ makeRoad('#475569', '#1e293b', '#facc15', '#1e293b', 'rgba(255,255,255,0.95)', false); }
function rTokyoDay(){ makeRoad('#4b5563', '#1f2937', '#ffffff', '#dc2626', '#ffffff', false); }
function rStudioPaperWhite(){ makeRoad('#cbd5e1', '#94a3b8', '#334155', '#ffffff', '#334155', false); }
function rCarbonTrack(){ makeRoad('#475569', '#1e293b', '#fb923c', '#ffffff', 'rgba(255,255,255,0.85)', false); }

function rCandyPop(){ makeRoad('#6b7280', '#3b4252', '#f472b6', '#38bdf8', '#ffffff', true); }
function rSkyRainbow(){
  fillRoadBase('#64748b', '#334155');
  var rainColors=['#f43f5e','#fb923c','#facc15','#34d399','#38bdf8','#a855f7'];
  for(var i=0;i<18;i++){
    var z0=(i/18 + roadTime*state.speed*TRACK_MOTION_SCALE*.85)%1;
    var z1=z0+.055; if(z1>1) continue;
    var a=roadBoundsAtZ(z0), b=roadBoundsAtZ(z1);
    var col=rainColors[i%rainColors.length];
    drawPoly([[a.l,a.y],[a.l+12+a.e*28,a.y],[b.l+12+b.e*28,b.y],[b.l,b.y]],col);
    drawPoly([[a.r-12-a.e*28,a.y],[a.r,a.y],[b.r,b.y],[b.r-12-b.e*28,b.y]],col);
  }
  drawCenterDashed(0, '#ffffff', 3, 7, 0.1, 10, 0.85, 0.12);
}
function rMarioKartCircuit(){ makeRoad('#57606f', '#2f3542', '#2ed573', '#ff4757', '#ffffff', false); }
function rToyTownBlock(){ makeRoad('#5f6b7c', '#333e4f', '#ffa502', '#1e90ff', '#ffffff', true); }
function rPastelDream(){ makeRoad('#6c7a89', '#3b444f', '#ff9ff3', '#54a0ff', '#ffffff', false); }
function rDonutDune(){ makeRoad('#7a6f68', '#453d38', '#ff78b9', '#fbe7c6', '#ffffff', true); }
function rRetroPixel(){ makeRoad('#505969', '#272d37', '#00d2d3', '#ff6b6b', '#ffffff', false); }
function rLemonLimeSpeed(){ makeRoad('#5a6c5b', '#2e3a2f', '#cbf3f0', '#2ec4b6', '#ffffff', false); }
function rMintChoco(){ makeRoad('#526159', '#2d3832', '#a8dadc', '#1d3557', '#ffffff', false); }
function rSunflowerMeadow(){ makeRoad('#636657', '#34382c', '#ffeaa7', '#55efc4', '#ffffff', false); }

function rSunnyDesert(){ makeRoad('#8a7561', '#4f3f31', '#f59e0b', '#fdf6e2', '#ffffff', false); }
function rMiamiBeach(){ makeRoad('#586b7c', '#2c3c4a', '#06b6d4', '#ffffff', '#ffffff', true); }
function rGreenMeadow(){ makeRoad('#536653', '#2b3b2b', '#22c55e', '#ecfdf5', '#ffffff', false); }
function rCaliforniaSunset(){ makeRoad('#7c5848', '#42281c', '#fb923c', '#fef3c7', '#fed7aa', true); }
function rRedClayTrail(){ makeRoad('#7c4a40', '#44221c', '#f87171', '#fee2e2', '#ffffff', false); }
function rNordicSnow(){ makeRoad('#64748b', '#334155', '#93c5fd', '#f0f9ff', '#ffffff', true); }
function rAutumnMaple(){ makeRoad('#705345', '#3d281e', '#ea580c', '#fde047', '#ffedd5', false); }
function rGoldenSands(){ makeRoad('#7c6f5a', '#42392b', '#f59e0b', '#2563eb', '#ffffff', false); }
function rAlpineMountain(){ makeRoad('#525c68', '#2a313a', '#e2e8f0', '#eab308', '#fef08a', false, 'rgba(255,255,255,0.6)'); }
function rEmeraldGolfway(){ makeRoad('#4d6154', '#26332b', '#10b981', '#d1fae5', '#ffffff', false); }
function rHawaiianOcean(){ makeRoad('#4b6670', '#23373e', '#14b8a6', '#f0fdfa', '#ffffff', true); }
function rLavenderValley(){ makeRoad('#5d596b', '#302d3b', '#c084fc', '#faf5ff', '#ffffff', false); }

function rNeonPulse(){ makeRoad('#4b4257', '#251e2d', '#ec4899', '#06b6d4', '#ffffff', true); }
function rEdgeGlow(){ makeRoad('#3d5248', '#1b2923', '#10b981', '#064e3b', '#6ee7b7', false, 'rgba(16,185,129,0.7)'); }
function rArcadeGrid(){ makeRoad('#43495d', '#1f2331', '#f43f5e', '#38bdf8', '#38bdf8', false); }
function rRailRunner(){ makeRoad('#475569', '#1e293b', '#38bdf8', '#0284c7', '#ffffff', true, 'rgba(56,189,248,0.7)'); }
function rChevronRush(){ makeRoad('#4b4b5e', '#242431', '#f43f5e', '#ffffff', '#ffffff', false); }
function rCyberViolet(){ makeRoad('#534460', '#2a1f33', '#c084fc', '#e879f9', '#ffffff', false); }
function rLaserCyan(){ makeRoad('#3b5568', '#1b2d39', '#38bdf8', '#0284c7', '#38bdf8', true); }
function rPlasmaPink(){ makeRoad('#5b4055', '#2f1a2b', '#fb7185', '#fda4af', '#ffffff', false); }
function rOverdriveNeon(){ makeRoad('#513e63', '#271b33', '#f472b6', '#a78bfa', '#fbcfe8', false); }
function rHyperSpace(){ makeRoad('#464964', '#202235', '#818cf8', '#c7d2fe', '#ffffff', true); }
function rMatrixCode(){ makeRoad('#385342', '#182b1f', '#22c55e', '#14532d', '#86efac', false); }
function rMidnightHighway(){ makeRoad('#3b4559', '#1a2233', '#60a5fa', '#93c5fd', '#ffffff', false, 'rgba(96,165,250,0.6)'); }

function rIceCrystal(){ makeRoad('#4b6070', '#21303b', '#7dd3fc', '#f0f9ff', '#ffffff', true, 'rgba(125,211,252,0.7)'); }
function rAmethystPath(){ makeRoad('#564468', '#2d1e3a', '#c084fc', '#f3e8ff', '#e9d5ff', false); }
function rEmeraldCity(){ makeRoad('#3b5a4d', '#1a332a', '#34d399', '#d1fae5', '#a7f3d0', false); }
function rRubyRoyale(){ makeRoad('#643b46', '#361b23', '#fb7185', '#ffe4e6', '#ffffff', false); }
function rElectricThunder(){ makeRoad('#3c516d', '#1a293c', '#38bdf8', '#ffffff', '#7dd3fc', false, 'rgba(56,189,248,0.8)'); }
function rInfernoFire(){ makeRoad('#6d4540', '#3a1f1b', '#f97316', '#fef08a', '#ffedd5', false); }
function rLavaCrack(){ makeRoad('#543936', '#2b1917', '#ea580c', '#431407', '#fdba74', false); }
function rGoldenPath(){ makeRoad('#685c46', '#352e1f', '#eab308', '#fef08a', '#ffffff', false); }
function rToxicHazard(){ makeRoad('#4c5c36', '#253017', '#84cc16', '#142008', '#d9f99d', false); }
function rCosmicVoid(){ makeRoad('#494161', '#211c31', '#a855f7', '#38bdf8', '#ffffff', true); }
function rCleanSlateMinimal(){ makeRoad('#556272', '#2c3540', '#94a3b8', '#cbd5e1', '#ffffff', false); }
function rTwinStripe(){ makeRoad('#515b69', '#262d36', '#ffffff', '#cbd5e1', '#facc15', true); }

function drawRoad(){
  var dict={
    classic: rClassic,
    v6Gold: rV6Gold,
    v6CyberBlue: rV6CyberBlue,
    v6LimeBeast: rV6LimeBeast,
    v6Monza: rV6Monza,
    monacoF1: rMonacoF1,
    asphaltSpeed: rAsphaltSpeed,
    tokyoDay: rTokyoDay,
    studioPaperWhite: rStudioPaperWhite,
    carbonTrack: rCarbonTrack,
    candyPop: rCandyPop,
    skyRainbow: rSkyRainbow,
    marioKartCircuit: rMarioKartCircuit,
    toyTownBlock: rToyTownBlock,
    pastelDream: rPastelDream,
    donutDune: rDonutDune,
    retroPixel: rRetroPixel,
    lemonLimeSpeed: rLemonLimeSpeed,
    mintChoco: rMintChoco,
    sunflowerMeadow: rSunflowerMeadow,
    sunnyDesert: rSunnyDesert,
    miamiBeach: rMiamiBeach,
    greenMeadow: rGreenMeadow,
    californiaSunset: rCaliforniaSunset,
    redClayTrail: rRedClayTrail,
    nordicSnow: rNordicSnow,
    autumnMaple: rAutumnMaple,
    goldenSands: rGoldenSands,
    alpineMountain: rAlpineMountain,
    emeraldGolfway: rEmeraldGolfway,
    hawaiianOcean: rHawaiianOcean,
    lavenderValley: rLavenderValley,
    neonPulse: rNeonPulse,
    edgeGlow: rEdgeGlow,
    arcadeGrid: rArcadeGrid,
    railRunner: rRailRunner,
    chevronRush: rChevronRush,
    cyberViolet: rCyberViolet,
    laserCyan: rLaserCyan,
    plasmaPink: rPlasmaPink,
    overdriveNeon: rOverdriveNeon,
    hyperSpace: rHyperSpace,
    matrixCode: rMatrixCode,
    midnightHighway: rMidnightHighway,
    iceCrystal: rIceCrystal,
    amethystPath: rAmethystPath,
    emeraldCity: rEmeraldCity,
    rubyRoyale: rRubyRoyale,
    electricThunder: rElectricThunder,
    infernoFire: rInfernoFire,
    lavaCrack: rLavaCrack,
    goldenPath: rGoldenPath,
    toxicHazard: rToxicHazard,
    cosmicVoid: rCosmicVoid,
    cleanSlateMinimal: rCleanSlateMinimal,
    twinStripe: rTwinStripe
  };
  var fn = dict[state.roadVariant] || rClassic;
  fn();
}

function drawRaisedPad(z, side, hexColor){
  var p=roadBoundsAtZ(z), e=p.e;
  var laneCenter=side==='left' ? W/2-p.half*.50 : W/2+p.half*.50;
  var width=Math.max(24, p.half*.96);
  var height=Math.max(26, width * 0.60);
  var baseY=p.y + 1;
  var topY=baseY - height;
  
  var c = hexToRgb(hexColor);
  var rgb = c.r + ',' + c.g + ',' + c.b;
  var darkR = Math.max(0, Math.floor(c.r * 0.45));
  var darkG = Math.max(0, Math.floor(c.r * 0.45));
  var darkB = Math.max(0, Math.floor(c.r * 0.45));
  var dark = darkR + ',' + darkG + ',' + darkB;

  ctx.save();ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(laneCenter,baseY+6,width*.48,7+12*e,0,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.save();ctx.fillStyle='rgba('+dark+',.85)';ctx.beginPath();ctx.roundRect(laneCenter-width/2,baseY-(state.padThickness||22)*.45,width,state.padThickness||22,8);ctx.fill();ctx.restore();
  
  var g=ctx.createLinearGradient(0,baseY,0,topY);
  g.addColorStop(0,'rgba('+rgb+',.92)');
  g.addColorStop(.35,'rgba('+rgb+',.58)');
  g.addColorStop(.75,'rgba('+rgb+',.25)');
  g.addColorStop(1,'rgba('+rgb+',0)');
  
  ctx.save();ctx.fillStyle=g;
  ctx.beginPath();ctx.roundRect(laneCenter-width/2,topY,width,height,10);ctx.fill();ctx.restore();
  
  ctx.save();ctx.strokeStyle='rgba('+rgb+',.98)';ctx.lineWidth=(2.5+2.5*e)*1.5;ctx.beginPath();ctx.moveTo(laneCenter-width*.49,baseY-1);ctx.lineTo(laneCenter+width*.49,baseY-1);ctx.stroke();ctx.restore();
  
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
  var boxS = state.hudBoxSize || 132;
  var gap = state.hudSpacing || 18;
  var totalW = count * boxS + (count - 1) * gap;
  var startX = (W - totalW) / 2;
  var hudY = state.hudY || 155;

  for(var b = 0; b < count; b++){
    var bx = startX + b * (boxS + gap);
    var activeImg = manualHudImgs[b] || collectedHud[b];

    var popAge = roadTime - collectedTimes[b];
    var isPopping = popAge >= 0 && popAge <= 0.40;
    var popScale = 1.0;
    if(isPopping){
      var progress = popAge / 0.40;
      popScale = 1.0 + Math.sin(progress * Math.PI) * 0.28;
    }

    ctx.save();
    var cx = bx + boxS/2;
    var cy = hudY + boxS/2;
    ctx.translate(cx, cy);
    ctx.scale(popScale, popScale);
    ctx.translate(-cx, -cy);

    if(activeImg){
      ctx.fillStyle = 'rgba(0,0,0,0.58)';
      ctx.beginPath(); ctx.roundRect(bx, hudY, boxS, boxS, 18); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 3.5; ctx.stroke();
      drawImageFit(activeImg, cx, hudY + boxS - 8, boxS * 0.88, boxS * 0.88, 'bottom');
    } else {
      ctx.fillStyle = '#ff9900'; ctx.beginPath(); ctx.roundRect(bx, hudY, boxS, boxS, 18); ctx.fill();
      ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.roundRect(bx+5, hudY+5, boxS-10, boxS-10, 14); ctx.fill();
      ctx.strokeStyle = '#451a03'; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = '#451a03';
      ctx.font = '900 ' + Math.floor(boxS * 0.68) + 'px Impact, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('?', cx, cy + 3);
    }
    ctx.restore();
  }
}

function renderAnimatedText(text, style, inAnim, outAnim, targetY, fSize, startTime, duration){
  var elapsed = roadTime - startTime;
  if(elapsed < 0 || elapsed > duration) return;

  var inDur = 0.35, outDur = 0.35;
  var remain = duration - elapsed;
  var scale = 1.0, alpha = 1.0, curY = targetY;

  if(elapsed < inDur){
    var tIn = elapsed / inDur;
    if(inAnim === 'elasticPunch') scale = 0.2 + 0.8 * Math.sin(tIn * Math.PI * 0.7);
    else if(inAnim === 'slamImpact') { scale = 2.4 - 1.4 * tIn; curY = (targetY - 140) + 140 * tIn; }
    else if(inAnim === 'jelloBounce') { scale = 0.4 + 0.6 * Math.sin(tIn * Math.PI); curY = targetY + Math.sin(tIn * Math.PI * 3) * 14; }
  } else if(remain > outDur){
    scale = 1.0 + Math.sin(elapsed * 4.2) * 0.03;
  }

  if(remain <= outDur){
    var tOut = (outDur - remain) / outDur;
    if(outAnim === 'shrinkPop') { scale = 1.0 - 0.8 * Math.sin(tOut * Math.PI * 0.5); alpha = Math.max(0, 1.0 - tOut * 1.2); }
    else if(outAnim === 'flyUp') { curY = targetY - (tOut * tOut * 240); alpha = Math.max(0, 1.0 - tOut); }
  }

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1.0, alpha));
  ctx.translate(W / 2, curY);
  ctx.scale(scale, scale);
  ctx.font = '900 ' + fSize + 'px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  var strokeW = Math.floor(fSize * 0.22);
  ctx.strokeStyle = '#090d16';
  ctx.lineWidth = strokeW;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, 0, 0);
  ctx.fillStyle = (style === 'tryloxyRed') ? '#ff1133' : '#ffffff';
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function drawDualChainIntroTexts(){
  var t1Start = 0.0;
  var t1Dur = Math.max(0.5, state.t1_duration || 2.2);
  if(state.t1_show && state.t1_val && state.t1_val.trim()){
    renderAnimatedText(state.t1_val.trim(), state.t1_style, state.t1_inAnim, state.t1_outAnim, state.t1_y, state.t1_size, t1Start, t1Dur);
  }
  if(state.t2_show && state.t2_val && state.t2_val.trim()){
    var t2Start = (state.t2_chainWithT1 && state.t1_show) ? t1Dur : 0.0;
    var t2Dur = Math.max(0.5, state.t2_duration || 3.5);
    renderAnimatedText(state.t2_val.trim(), state.t2_style, state.t2_inAnim, state.t2_outAnim, state.t2_y, state.t2_size, t2Start, t2Dur);
  }
}

function getActiveRunnerInfo(){
  var curImg = null;
  var curSize = 215;

  if(currentPath === 'green' && currentStageLevel > 0){
    for(var g = currentStageLevel; g >= 1; g--){
      if(state.greenStages[g] && state.greenStages[g].img){
        curImg = state.greenStages[g].img;
        curSize = state.greenStages[g].size || 245;
        break;
      }
    }
  } else if(currentPath === 'red' && currentStageLevel > 0){
    for(var r = currentStageLevel; r >= 1; r--){
      if(state.redStages[r] && state.redStages[r].img){
        curImg = state.redStages[r].img;
        curSize = state.redStages[r].size || 195;
        break;
      }
    }
  }

  if(!curImg){
    curImg = state.baseStage.img;
    curSize = state.baseStage.size || 215;
  }
  return { img: curImg, size: curSize };
}

function triggerImpactVfx(isGreen, rx, ry){
  lastImpactType = isGreen ? 'green' : 'red';
  lastImpactTime = roadTime;
  vfxParticles.length = 0;
  var count = isGreen ? 18 : 22;
  var spreadMul = state.vfxAuraSpread || 0.85;

  for(var i = 0; i < count; i++){
    var angle = Math.random() * Math.PI * 2;
    var spd = isGreen ? ((70 + Math.random() * 180) * spreadMul) : ((35 + Math.random() * 110) * spreadMul);
    vfxParticles.push({
      x: rx,
      y: ry - 40 - Math.random() * 50,
      vx: Math.cos(angle) * spd,
      vy: Math.sin(angle) * spd - (isGreen ? 50 : 20),
      life: 0,
      maxLife: isGreen ? 0.32 : 0.40,
      size: isGreen ? (3.5 + Math.random() * 5) : (10 + Math.random() * 16),
      isGreen: isGreen
    });
  }
}

function drawRunnerBehind(){
  var rInfo = getActiveRunnerInfo();
  if(!rInfo.img) return;

  var p = roadBoundsAtZ(state.playerZ || 0.86);
  var pSize = rInfo.size * (0.3 + 0.7 * p.e);

  var targetX = W/2;
  if(state.playerLane === 'slider') targetX = W/2 + (p.half * 0.50 * state.steerOffset);
  else if(state.playerLane === 'right') targetX = W/2 + p.half * 0.50;
  else if(state.playerLane === 'left') targetX = W/2 - p.half * 0.50;
  else targetX = state.currentLane === 'right' ? (W/2 + p.half * 0.50) : (W/2 - p.half * 0.50);

  state.playerX = state.playerX || (W/2);
  state.playerX += (targetX - state.playerX) * 0.35;

  var drawX = state.playerX;
  var drawY = p.y + 6;
  var scaleMul = 1.0;
  var hitAge = roadTime - lastImpactTime;

  if(state.enableVfx && hitAge >= 0 && hitAge < 0.35){
    var progress = hitAge / 0.35;
    var maxJump = (state.vfxScaleJump !== undefined) ? state.vfxScaleJump : 0.08;
    if(lastImpactType === 'green') scaleMul = 1.0 + Math.sin(progress * Math.PI) * maxJump;
    else if(lastImpactType === 'red') drawX += Math.sin(hitAge * 55) * Math.max(0, 10 * (1 - progress));
  }

  var finalW = pSize * scaleMul;
  var finalH = pSize * scaleMul;

  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.48)';
  ctx.beginPath();
  ctx.ellipse(drawX, drawY + 2, finalW * 0.38, 9 + 14 * p.e, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  drawImageFit(rInfo.img, drawX, drawY, finalW, finalH, 'bottom');
}

function updateAndDrawVfx(delta){
  if(!state.enableVfx || vfxParticles.length === 0) return;
  for(var i = vfxParticles.length - 1; i >= 0; i--){
    var p = vfxParticles[i];
    p.life += delta;
    if(p.life >= p.maxLife){ vfxParticles.splice(i, 1); continue; }
    var progress = p.life / p.maxLife;
    p.x += p.vx * delta;
    p.y += p.vy * delta;

    ctx.save();
    ctx.fillStyle = p.isGreen ? (progress < 0.5 ? '#00f5ff' : '#2aff84') : 'rgba(200,20,30,0.4)';
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (1.0 - progress * 0.5), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function syncStateFromTime(t){
  roadTime = Math.max(0, t);
  processedPads = {};
  collectedHud = [null, null, null, null, null];
  collectedTimes = [-999, -999, -999, -999, -999];
  currentPath = 'base';
  currentStageLevel = 0;
  vfxParticles = [];
  
  var initialDelay = 0.85;
  var pZ = state.playerZ || 0.86;
  
  state.rows.slice(0,5).forEach(function(row, i){
    var elapsed = roadTime - initialDelay - i * state.padDelay;
    var z = elapsed * state.speed * 1.28 * TRACK_MOTION_SCALE;
    if(z >= pZ - 0.02){
      processedPads[i] = true;
      var isPlayerOnRight = (state.steerOffset > 0);
      var padHex = isPlayerOnRight ? row.rightColor : row.leftColor;
      var itemImg = isPlayerOnRight ? row.rightImg : row.leftImg;
      if(state.autoCollectHud && itemImg){
        collectedHud[i] = itemImg;
        collectedTimes[i] = roadTime;
      }
      var isGreen = (padHex.indexOf('2a') !== -1 || padHex.indexOf('00') !== -1 || padHex.indexOf('green') !== -1);
      currentPath = isGreen ? 'green' : 'red';
      currentStageLevel = i + 1;
    }
  });
}

function drawSinglePadRow(item){
  var left=drawRaisedPad(item.zz,'left',item.row.leftColor);
  var right=drawRaisedPad(item.zz,'right',item.row.rightColor);
  var pngScale=.18+0.95*left.e;
  var leftSize=Math.min(item.row.leftSize*pngScale,left.width*.92);
  var rightSize=Math.min(item.row.rightSize*pngScale,right.width*.92);
  if(item.row.leftImg) drawImageFit(item.row.leftImg,left.center[0],left.baseY-8,leftSize,leftSize,'bottom');
  if(item.row.rightImg) drawImageFit(item.row.rightImg,right.center[0],right.baseY-8,rightSize,rightSize,'bottom');
}

function drawRows(){
  var initialDelay=.85;
  var closestActiveZ = -1;
  var activeLaneColor = '#2aff84';
  var pZ = state.playerZ || 0.86;
  var activePads = [];

  state.rows.slice(0,5).forEach(function(row,i){
    var elapsed=roadTime-initialDelay-i*state.padDelay;
    var z=elapsed*state.speed*1.28*TRACK_MOTION_SCALE;
    if(z<0 || z>1.15) return;
    var zz=z;

    if(zz >= pZ - 0.02 && !processedPads[i]){
      processedPads[i] = true;
      var isPlayerOnRight = (state.playerX >= W/2);
      var padHex = isPlayerOnRight ? row.rightColor : row.leftColor;
      var itemImg = isPlayerOnRight ? row.rightImg : row.leftImg;

      if(state.autoCollectHud && itemImg){
        collectedHud[i] = itemImg;
        collectedTimes[i] = roadTime;
      }
      var isGreen = (padHex.indexOf('2a') !== -1 || padHex.indexOf('00') !== -1 || padHex.indexOf('green') !== -1);
      currentPath = isGreen ? 'green' : 'red';
      currentStageLevel = i + 1;

      var p = roadBoundsAtZ(pZ);
      triggerImpactVfx(isGreen, state.playerX, p.y);
    }

    if(zz > closestActiveZ && zz < pZ + 0.15){
      closestActiveZ = zz;
      activeLaneColor = row.leftColor;
    }
    activePads.push({row: row, zz: zz, rawZ: zz});
  });

  if(closestActiveZ !== -1){
    var isGreenLane = (activeLaneColor.indexOf('2a') !== -1 || activeLaneColor.indexOf('00') !== -1 || activeLaneColor.indexOf('green') !== -1);
    state.currentLane = isGreenLane ? 'left' : 'right';
  }

  activePads.sort(function(a, b){ return a.rawZ - b.rawZ; });

  var initialBossZ = 0.08;
  var pad5CrossTime = initialDelay + 4 * state.padDelay + (pZ / (state.speed * 1.28 * TRACK_MOTION_SCALE));
  var bDist = Math.max(1.0, state.bossDistance || 2.8);
  var bossZ = initialBossZ;

  if (roadTime > pad5CrossTime) {
    var walkProgress = Math.min(1.0, (roadTime - pad5CrossTime) / bDist);
    bossZ = initialBossZ + (pZ - initialBossZ) * walkProgress;
  }

  var staticBaseSize = (state.greenStages[5] && state.greenStages[5].size) ? state.greenStages[5].size : 435;
  var lockedBossBase = staticBaseSize * 1.18;

  activePads.forEach(function(item){
    if(item.rawZ < bossZ) drawSinglePadRow(item);
  });

  if(state.opponent.img){
    var op = roadBoundsAtZ(bossZ);
    var bossSize = lockedBossBase * (0.30 + 0.70 * op.e);
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.beginPath();
    ctx.ellipse(W/2, op.y + 2, bossSize * 0.35, 5 + 9 * op.e, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    drawImageFit(state.opponent.img, W/2, op.y + 2, bossSize, bossSize, 'bottom');
  }

  activePads.forEach(function(item){
    if(item.rawZ >= bossZ && item.rawZ < pZ) drawSinglePadRow(item);
  });

  drawRunnerBehind();

  activePads.forEach(function(item){
    if(item.rawZ >= pZ) drawSinglePadRow(item);
  });
}

var scrubber = $('scrubBar');
if(scrubber){
  scrubber.addEventListener('mousedown', function(){ isScrubbing = true; });
  scrubber.addEventListener('touchstart', function(){ isScrubbing = true; }, {passive:true});
  scrubber.addEventListener('mouseup', function(){ isScrubbing = false; });
  scrubber.addEventListener('touchend', function(){ isScrubbing = false; });
  scrubber.addEventListener('input', function(e){
    var t = Number(e.target.value);
    updateBadge('scrubBar', t.toFixed(1));
    syncStateFromTime(t);
  });
}

var FIXED_TIMESTEP = 1 / 60;

function frame(now){
  var delta = (now - last) / 1000;
  if(delta > 0.05) delta = FIXED_TIMESTEP;
  last = now;

  var pZ = state.playerZ || 0.86;
  var pad5CrossTime = 0.85 + 4 * state.padDelay + (pZ / (state.speed * 1.28 * TRACK_MOTION_SCALE));
  var bDist = Math.max(1.0, state.bossDistance || 2.8);
  var isTouching = processedPads[4] && roadTime >= (pad5CrossTime + bDist);

  if(running && !isTouching && !isScrubbing){
    roadTime += delta;
    frameCount++;
    if(frameCount % 6 === 0 && scrubber){
      scrubber.value = roadTime.toFixed(2);
      updateBadge('scrubBar', roadTime.toFixed(1));
    }
  }

  drawBackground();
  drawRoad();
  drawRows();
  updateAndDrawVfx(delta);
  drawMysteryHUD();
  drawDualChainIntroTexts();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

$('playBtn').onclick=function(){running=!running;$('playBtn').textContent=running?'Pause':'Play';};
$('resetBtn').onclick=function(){
  syncStateFromTime(0);
  if(scrubber){ scrubber.value = 0; updateBadge('scrubBar', '0.0'); }
};
$('saveBtn').onclick=function(){
  autoSaveStudio();
  saveCardOrder();
  alert('Settings saved successfully!');
};
$('resetStorageBtn').onclick=function(){
  try{ 
    localStorage.removeItem('runner_studio_saved_v36'); 
    localStorage.removeItem('runner_studio_panel_order');
  }catch(e){}
  location.reload();
};
$('logoutBtn').onclick=async function(){await fetch('/api/logout',{method:'POST'});location.href='/';};

$('exportBtn').onclick = function(){
  if (recorder) return;
  var sec = Math.max(2, Math.min(60, +$('recordSec').value || 20));
  var stream = canvas.captureStream(60);
  var mime = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm;codecs=vp8';
  if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';
  
  var chunks = [];
  recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 28000000 });
  recorder.ondataavailable = function(e){ if (e.data.size) chunks.push(e.data); };
  recorder.onstop = function(){
    var blob = new Blob(chunks, { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'runner-1080p-fullhd-60fps.webm';
    a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); }, 5000);
    recorder = null;
    $('exportBtn').textContent = 'Export 1080P 60FPS';
  };
  recorder.start(100);
  $('exportBtn').textContent = 'Recording 1080P 60FPS...';
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
            'Set-Cookie': 'runner_session=' + token + '; Path=/; SameSite=Lax',
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

server.listen(PORT, function(){ console.log('Straight Highway 1080P Server running on port ' + PORT); });
