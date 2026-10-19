const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const APP_PASSWORD = process.env.APP_PASSWORD || 'change-me-now';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

if(!process.env.APP_PASSWORD) console.warn('WARNING: APP_PASSWORD env var set nahi hai - default password "change-me-now" chal raha hai. Render > Environment me APP_PASSWORD set karo.');
if(!process.env.SESSION_SECRET) console.warn('WARNING: SESSION_SECRET env var set nahi hai - har restart par login logout ho jayega. Render > Environment me SESSION_SECRET (lambi random string) set karo.');

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
<title>Private Runner Studio Straight Road Edition</title>
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
  <div><strong>Private Runner Studio</strong><span class="badge">1080P FULL HD 60FPS</span></div>
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
    <div class="note"><b>⚡ 1080p Ultra-Smooth Engine:</b> Ground Contact Shadow + Live Cutout Sensitivity!</div>
  </section>

  <section class="controls" id="panelsContainer">

    <!-- 🌟 CARD 1: SCREEN INTRO TEXT 1 (LET'S GO) -->
    <details class="drag-card" id="card_intro_text1" open>
      <summary>
        <span>🚀 Screen Intro Text 1: LET'S GO</span>
        <span class="drag-handle" draggable="true" title="Sirf ise pakad kar upar-niche khinchein">⠿ Drag</span>
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
            <option value="cyberCyan">⚡ 3. Cyber Neon Cyan (Electric)</option>
            <option value="infernoFire">🔥 4. Inferno Blaze Orange</option>
            <option value="monsterLime">🦖 5. Monster Neon Lime</option>
            <option value="plasmaPink">💖 6. Plasma Cyber Pink</option>
            <option value="cleanWhite">⚪ 7. Minimal Bold White (Dark Outline)</option>
            <option value="synthViolet">🟣 8. Synthwave Violet Sunset</option>
            <option value="toxicAcid">☣️ 9. Toxic Biohazard Lime</option>
            <option value="pureYellow">⭐ 10. Bright Arcade Yellow</option>
            <option value="royalAmber">👑 11. Royal Amber Orange</option>
            <option value="iceFrost">❄️ 12. Frozen Ice Crystal Blue</option>
            <option value="stealthDark">🖤 13. Stealth Matte Charcoal</option>
            <option value="candyPop">🍭 14. Candy Pastel Multi-Glow</option>
            <option value="laserCrimson">🛑 15. Laser Crimson Warning</option>
          </select>
        </label>

        <label>In-Animation (Entry)
          <select id="t1_inAnim">
            <option value="elasticPunch" selected>💥 1. Elastic Mega-Punch (Zoom & Bounce)</option>
            <option value="slamImpact">🔨 2. Comic Slam Impact (Drop & Shake)</option>
            <option value="jelloBounce">🍮 3. Wobbly Jello Pop</option>
            <option value="speedWarp">⚡ 4. Speed Warp Flash In</option>
            <option value="dropSpring">🚀 5. Drop & Spring</option>
            <option value="static">⏸️ 6. Static Pop (Instant)</option>
          </select>
        </label>

        <label>Out-Animation (Exit)
          <select id="t1_outAnim">
            <option value="shrinkPop" selected>🫧 1. Shrink & Bubble Pop Away</option>
            <option value="flyUp">🚀 2. Rocket Fly Up</option>
            <option value="flashFade">✨ 3. Smooth Glow Flash Fade</option>
            <option value="instantCut">✂️ 4. Instant Cut Out</option>
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

    <!-- 🌟 CARD 2: SCREEN INTRO TEXT 2 (WIN OR LOSE) -->
    <details class="drag-card" id="card_intro_text2" open>
      <summary>
        <span>⚡ Screen Intro Text 2: WIN OR LOSE</span>
        <span class="drag-handle" draggable="true" title="Sirf ise pakad kar upar-niche khinchein">⠿ Drag</span>
      </summary>
      <div class="grid two">
        <label class="toggle" style="grid-column:1/-1">
          <input id="t2_show" type="checkbox" checked> <b>Show Intro Text 2 ("WIN OR LOSE!")</b>
        </label>
        <label class="toggle" style="grid-column:1/-1">
          <input id="t2_chainWithT1" type="checkbox" checked> <span style="color:var(--accent);font-weight:700">⚡ Start Immediately After Text 1 Exits (Auto-Chain)</span>
        </label>
        <label style="grid-column:1/-1">Text Message
          <input id="t2_val" type="text" value="Win or Lose!" placeholder="e.g. Win or Lose!">
        </label>

        <label>Visual Style
          <select id="t2_style">
            <option value="arcadeGold" selected>👑 1. 3D Championship Gold (Viral)</option>
            <option value="dualWinLose">🌓 2. Split Dual-Tone (Green WIN / Red LOSE)</option>
            <option value="cyberYellow">⚡ 3. Cyber Neon Yellow Alert</option>
            <option value="tryloxyRed">🔴 4. TryLoxy Bold Red & White</option>
            <option value="comicLime">🦖 5. Comic Pop Lime Beast</option>
            <option value="electricCyan">🔵 6. Electric Blue Thunder</option>
            <option value="fireInferno">🔥 7. Burning Inferno Heatwave</option>
            <option value="synthPurple">🟣 8. Synthwave Glow Violet</option>
            <option value="candyRainbow">🍭 9. Candy Rainbow Celebration</option>
            <option value="laserRedWarning">🛑 10. Red Danger Hazard Alert</option>
            <option value="cleanWhite">⚪ 11. Minimal Clean Paper White</option>
            <option value="frozenFrost">❄️ 12. Sub-Zero Crystal Cyan</option>
            <option value="deepAmethyst">💎 13. Deep Amethyst Royale</option>
            <option value="stealthCharcoal">🖤 14. Stealth Gunmetal Outline</option>
            <option value="sunsetTrophy">🌅 15. Sunset Amber Trophy</option>
          </select>
        </label>

        <label>In-Animation (Entry)
          <select id="t2_inAnim">
            <option value="slamImpact" selected>🔨 1. Comic Slam Impact (Drop & Shake)</option>
            <option value="elasticPunch">💥 2. Elastic Mega-Punch (Pop & Zoom)</option>
            <option value="jelloBounce">🍮 3. Wobbly Jello Pop</option>
            <option value="speedWarp">⚡ 4. Speed Warp Flash In</option>
            <option value="dropSpring">🚀 5. Drop & Spring</option>
            <option value="static">⏸️ 6. Static Pop (Instant)</option>
          </select>
        </label>

        <label>Out-Animation (Exit)
          <select id="t2_outAnim">
            <option value="shrinkPop" selected>🫧 1. Shrink & Bubble Pop Away</option>
            <option value="flyUp">🚀 2. Rocket Fly Up</option>
            <option value="flashFade">✨ 3. Smooth Glow Flash Fade</option>
            <option value="instantCut">✂️ 4. Instant Cut Out</option>
          </select>
        </label>

        <label>
          <span class="label-head"><span>Duration (0.5s - 10.0s)</span><span class="val-badge gold" id="v_t2_duration">3.5s</span></span>
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

    <!-- 🌟 CARD 3: RUNNER IMPACT VFX WITH LIVE INTENSITY SLIDERS -->
    <details class="drag-card" id="card_impact_vfx" open>
      <summary>
        <span>⚡ Runner Transformation VFX & Intensity</span>
        <span class="drag-handle" draggable="true" title="Sirf ise pakad kar upar-niche khinchein">⠿ Drag</span>
      </summary>
      <div class="grid two">
        <label class="toggle" style="grid-column:1/-1">
          <input id="enableVfx" type="checkbox" checked> <b>Enable Pad Hit VFX & Transformation Aura</b>
        </label>

        <label>
          <span class="label-head"><span>VFX Scale/Bounce Jump</span><span class="val-badge gold" id="v_vfxScaleJump">0.08</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="vfxScaleJump" data-dir="-1">◀</button>
            <input id="vfxScaleJump" type="range" min="0.0" max="0.30" step="0.01" value="0.08">
            <button type="button" class="step-btn" data-step-for="vfxScaleJump" data-dir="1">▶</button>
          </div>
          <span class="small" style="color:var(--muted)">पैड छूते ही कैरेक्टर का उछाल (कम या ज्यादा)।</span>
        </label>

        <label>
          <span class="label-head"><span>Glow & Lightning Spread</span><span class="val-badge gold" id="v_vfxAuraSpread">0.85</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="vfxAuraSpread" data-dir="-1">◀</button>
            <input id="vfxAuraSpread" type="range" min="0.2" max="2.0" step="0.05" value="0.85">
            <button type="button" class="step-btn" data-step-for="vfxAuraSpread" data-dir="1">▶</button>
          </div>
          <span class="small" style="color:var(--muted)">साइड में निकलने वाली बिजली और ऑरा का फैलाव।</span>
        </label>
      </div>
    </details>

    <details class="drag-card" id="card_hud" open>
      <summary>
        <span>🎁 5 Mystery Boxes HUD (Elements & Question Themes)</span>
        <span class="drag-handle" draggable="true" title="Sirf ise pakad kar upar-niche khinchein">⠿ Drag</span>
      </summary>
      <div class="grid two">
        <label class="toggle"><input id="showHud" type="checkbox" checked> Show 5 Mystery Boxes</label>
        <label class="toggle"><input id="autoCollectHud" type="checkbox" checked> Auto Collect PNG from Pads</label>

        <label style="grid-column:1/-1">Box VFX Style (Extreme Eye-Catching)
          <select id="hudStyle">
            <optgroup label="--- 🔥 Elemental Icons (No Question Mark) ---">
              <option value="fireInferno" selected>🔥 1. Inferno Flame (Burning Fire Icon)</option>
              <option value="waterCrystal">💧 2. Aqua Splash (Crystal Water Drop)</option>
              <option value="amethystGem">💎 3. Faceted Diamond Gem (Magic Sparkle)</option>
              <option value="electricThunder">⚡ 4. Neon Lightning Bolt (Thunder Zap)</option>
            </optgroup>
            <optgroup label="--- ❓ Classic & Viral Question Marks ---">
              <option value="royal3DGold">👑 5. 3D Mario Classic Gold (?)</option>
              <option value="royalAmber">👑 6. Royal Amber Gold (?)</option>
              <option value="arcadeYellow">⭐ 7. 80s Arcade Bright Yellow (?)</option>
              <option value="laserCrimson">🔴 8. Laser Crimson Red (?)</option>
              <option value="cyberCyan">🔵 9. Cyber Cyan Circuit (?)</option>
              <option value="neonGreen">🟢 10. Emerald Neon Pulse (?)</option>
              <option value="plasmaPink">💖 11. Plasma Cyber Pink (?)</option>
              <option value="electricBlue">⚡ 12. Electric Blue Thunder (?)</option>
              <option value="synthwaveViolet">🟣 13. Synthwave Violet (?)</option>
              <option value="toxicAcid">☣️ 14. Toxic Biohazard Lime (?)</option>
              <option value="pureWhiteBox">⚪ 15. Clean Minimal Studio White (?)</option>
              <option value="stealthCarbon">🖤 16. Stealth Carbon Matte (?)</option>
            </optgroup>
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

        <div class="sub-title" style="color:var(--gold)">📁 Manual PNG Override for Boxes</div>
        <label>Box 1 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_hud_0"><span>None</span><img src=""></div>
            <input id="hudImg_0" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_hud_0">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="hudRemove_0" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="hudTol_0" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_hudTol_0">32</span>
          </div>
        </label>
        <label>Box 2 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_hud_1"><span>None</span><img src=""></div>
            <input id="hudImg_1" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_hud_1">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="hudRemove_1" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="hudTol_1" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_hudTol_1">32</span>
          </div>
        </label>
        <label>Box 3 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_hud_2"><span>None</span><img src=""></div>
            <input id="hudImg_2" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_hud_2">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="hudRemove_2" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="hudTol_2" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_hudTol_2">32</span>
          </div>
        </label>
        <label>Box 4 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_hud_3"><span>None</span><img src=""></div>
            <input id="hudImg_3" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_hud_3">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="hudRemove_3" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="hudTol_3" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_hudTol_3">32</span>
          </div>
        </label>
        <label style="grid-column:1/-1">Box 5 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_hud_4"><span>None</span><img src=""></div>
            <input id="hudImg_4" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_hud_4">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="hudRemove_4" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="hudTol_4" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_hudTol_4">32</span>
          </div>
        </label>
      </div>
    </details>

    <details class="drag-card" id="card_runner" open>
      <summary>
        <span>🏃 Runner Evolution Settings (Balanced Proportions)</span>
        <span class="drag-handle" draggable="true" title="Sirf ise pakad kar upar-niche khinchein">⠿ Drag</span>
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

        <div class="sub-title" style="color:#61f0a6">&#128170; GREEN PAD UPGRADES</div>
        <label>Green Stage 1 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_gImg_1"><span>None</span><img src=""></div>
            <input id="gImg_1" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_gImg_1">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="gRemove_1" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="gTol_1" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_gTol_1">32</span>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Green 1 Size</span><span class="val-badge" id="v_gSize_1">245</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="gSize_1" data-dir="-1">◀</button>
            <input id="gSize_1" type="range" min="60" max="1200" value="245">
            <button type="button" class="step-btn" data-step-for="gSize_1" data-dir="1">▶</button>
          </div>
        </label>

        <label>Green Stage 2 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_gImg_2"><span>None</span><img src=""></div>
            <input id="gImg_2" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_gImg_2">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="gRemove_2" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="gTol_2" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_gTol_2">32</span>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Green 2 Size</span><span class="val-badge" id="v_gSize_2">285</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="gSize_2" data-dir="-1">◀</button>
            <input id="gSize_2" type="range" min="60" max="1200" value="285">
            <button type="button" class="step-btn" data-step-for="gSize_2" data-dir="1">▶</button>
          </div>
        </label>

        <label>Green Stage 3 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_gImg_3"><span>None</span><img src=""></div>
            <input id="gImg_3" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_gImg_3">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="gRemove_3" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="gTol_3" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_gTol_3">32</span>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Green 3 Size</span><span class="val-badge" id="v_gSize_3">330</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="gSize_3" data-dir="-1">◀</button>
            <input id="gSize_3" type="range" min="60" max="1200" value="330">
            <button type="button" class="step-btn" data-step-for="gSize_3" data-dir="1">▶</button>
          </div>
        </label>

        <label>Green Stage 4 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_gImg_4"><span>None</span><img src=""></div>
            <input id="gImg_4" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_gImg_4">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="gRemove_4" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="gTol_4" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_gTol_4">32</span>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Green 4 Size</span><span class="val-badge" id="v_gSize_4">380</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="gSize_4" data-dir="-1">◀</button>
            <input id="gSize_4" type="range" min="60" max="1200" value="380">
            <button type="button" class="step-btn" data-step-for="gSize_4" data-dir="1">▶</button>
          </div>
        </label>

        <label>Green Stage 5 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_gImg_5"><span>None</span><img src=""></div>
            <input id="gImg_5" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_gImg_5">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="gRemove_5" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="gTol_5" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_gTol_5">32</span>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Green 5 Size</span><span class="val-badge" id="v_gSize_5">435</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="gSize_5" data-dir="-1">◀</button>
            <input id="gSize_5" type="range" min="60" max="1200" value="435">
            <button type="button" class="step-btn" data-step-for="gSize_5" data-dir="1">▶</button>
          </div>
        </label>

        <div class="sub-title" style="color:#ff6b6b">&#128128; RED PAD DOWNGRADES</div>
        <label>Red Stage 1 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_rImg_1"><span>None</span><img src=""></div>
            <input id="rImg_1" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_rImg_1">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="rRemove_1" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="rTol_1" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_rTol_1">32</span>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Red 1 Size</span><span class="val-badge red" id="v_rSize_1">195</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="rSize_1" data-dir="-1">◀</button>
            <input id="rSize_1" type="range" min="60" max="1200" value="195">
            <button type="button" class="step-btn" data-step-for="rSize_1" data-dir="1">▶</button>
          </div>
        </label>

        <label>Red Stage 2 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_rImg_2"><span>None</span><img src=""></div>
            <input id="rImg_2" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_rImg_2">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="rRemove_2" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="rTol_2" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_rTol_2">32</span>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Red 2 Size</span><span class="val-badge red" id="v_rSize_2">170</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="rSize_2" data-dir="-1">◀</button>
            <input id="rSize_2" type="range" min="60" max="1200" value="170">
            <button type="button" class="step-btn" data-step-for="rSize_2" data-dir="1">▶</button>
          </div>
        </label>

        <label>Red Stage 3 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_rImg_3"><span>None</span><img src=""></div>
            <input id="rImg_3" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_rImg_3">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="rRemove_3" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="rTol_3" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_rTol_3">32</span>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Red 3 Size</span><span class="val-badge red" id="v_rSize_3">150</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="rSize_3" data-dir="-1">◀</button>
            <input id="rSize_3" type="range" min="60" max="1200" value="150">
            <button type="button" class="step-btn" data-step-for="rSize_3" data-dir="1">▶</button>
          </div>
        </label>

        <label>Red Stage 4 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_rImg_4"><span>None</span><img src=""></div>
            <input id="rImg_4" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_rImg_4">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="rRemove_4" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="rTol_4" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_rTol_4">32</span>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Red 4 Size</span><span class="val-badge red" id="v_rSize_4">130</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="rSize_4" data-dir="-1">◀</button>
            <input id="rSize_4" type="range" min="60" max="1200" value="130">
            <button type="button" class="step-btn" data-step-for="rSize_4" data-dir="1">▶</button>
          </div>
        </label>

        <label>Red Stage 5 PNG
          <div class="file-wrap">
            <div class="thumb-box" id="thumb_rImg_5"><span>None</span><img src=""></div>
            <input id="rImg_5" type="file" accept="image/png,image/webp,image/jpeg">
            <button type="button" class="clear-btn" id="clear_rImg_5">✕ Clear</button>
          </div>
          <div class="cutout-ctrl">
            <input id="rRemove_5" type="checkbox" checked><span class="small">Auto Cut</span>
            <input id="rTol_5" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
            <span class="val-badge" id="v_rTol_5">32</span>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Red 5 Size</span><span class="val-badge red" id="v_rSize_5">110</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="rSize_5" data-dir="-1">◀</button>
            <input id="rSize_5" type="range" min="60" max="1200" value="110">
            <button type="button" class="step-btn" data-step-for="rSize_5" data-dir="1">▶</button>
          </div>
        </label>
      </div>
    </details>

    <details class="drag-card" id="card_highway" open>
      <summary>
        <span>🛣️ Moving Highway & Perspective (Straight YouTube Setup)</span>
        <span class="drag-handle" draggable="true" title="Sirf ise pakad kar upar-niche khinchein">⠿ Drag</span>
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
          <span class="label-head"><span>Horizon Height</span><span class="val-badge" id="v_horizon">0.42</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="horizon" data-dir="-1">◀</button>
            <input id="horizon" type="range" min="0.20" max="0.75" step="0.01" value="0.42">
            <button type="button" class="step-btn" data-step-for="horizon" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Top Width (सीधी सड़क की चौड़ाई)</span><span class="val-badge" id="v_topWidth">0.20</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="topWidth" data-dir="-1">◀</button>
            <input id="topWidth" type="range" min="0.04" max="0.35" step="0.005" value="0.20">
            <button type="button" class="step-btn" data-step-for="topWidth" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Bottom Width (निचली चौड़ाई)</span><span class="val-badge" id="v_bottomWidth">0.70</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="bottomWidth" data-dir="-1">◀</button>
            <input id="bottomWidth" type="range" min="0.50" max="1.15" step="0.02" value="0.70">
            <button type="button" class="step-btn" data-step-for="bottomWidth" data-dir="1">▶</button>
          </div>
        </label>
        <label>
          <span class="label-head"><span>Road Length (सड़क की लंबाई)</span><span class="val-badge gold" id="v_roadLen">3</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="roadLen" data-dir="-1">◀</button>
            <input id="roadLen" type="range" min="1" max="11" step="0.2" value="3">
            <button type="button" class="step-btn" data-step-for="roadLen" data-dir="1">▶</button>
          </div>
          <span class="small" style="color:var(--muted)">कम = लंबी और सीधी सड़क (YouTube जैसी)। 11 = पुरानी छोटी/त्रिकोण वाली सड़क।</span>
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
          <span class="label-head"><span>Pad glow base</span><span class="val-badge" id="v_padThickness">22</span></span>
          <div class="range-wrap">
            <button type="button" class="step-btn" data-step-for="padThickness" data-dir="-1">◀</button>
            <input id="padThickness" type="range" min="8" max="42" value="22">
            <button type="button" class="step-btn" data-step-for="padThickness" data-dir="1">▶</button>
          </div>
        </label>

        <label style="border:1px solid #61f0a6;padding:8px;border-radius:10px;background:#0d1813">
          <span style="color:#61f0a6;font-weight:900">🌟 Quick Selector: 20 New Day-Light & V6 Editions</span>
          <select id="newRoadSelector">
            <option value="" selected>-- 🚀 Choose from 20 New Roads Directly --</option>
            <optgroup label="--- 🦁 5 Classic V6 Special Variants (Same HD Look) ---">
              <option value="v6Gold">👑 1. Classic V6 Gold Edition (Championship)</option>
              <option value="v6CyberBlue">⚡ 2. Classic V6 Cyber-Blue (Electric Rumble)</option>
              <option value="v6LimeBeast">🦖 3. Classic V6 Lime Beast (Monster Track)</option>
              <option value="v6SunsetOrange">🔥 4. Classic V6 Sunset Orange (Hyper Curve)</option>
              <option value="v6Monza">🏎️ 5. Classic V6 Formula Monza (Yellow/Black)</option>
            </optgroup>
            <optgroup label="--- ☀️ 15 Ultra-Clean Day-Light Roads ---">
              <option value="sunnyDesert">☀️ 6. Sunny Desert Highway (Sandy Gold)</option>
              <option value="miamiBeach">🌴 7. Miami Beach Coastal Drive (Turquoise)</option>
              <option value="greenMeadow">🍃 8. Fresh Green Meadow Track (Nature)</option>
              <option value="tokyoDay">🏙️ 9. Tokyo City Day Asphalt (Modern Pro)</option>
              <option value="californiaSunset">🌅 10. California Golden Hour (Warm Glow)</option>
              <option value="redClayTrail">🏜️ 11. Grand Canyon Red Clay Trail</option>
              <option value="monacoF1">🏁 12. Monaco F1 Grand Prix Track</option>
              <option value="nordicSnow">❄️ 13. Nordic Snow Valley Road (Crisp Blue)</option>
              <option value="studioPaperWhite">⚪ 14. Studio Minimalist Paper White (4K Pop)</option>
              <option value="autumnMaple">🍁 15. Autumn Maple Highway (Amber)</option>
              <option value="skyRainbow">🌈 16. Sky High Rainbow Bridge (Bright)</option>
              <option value="goldenSands">🏖️ 17. Golden Sands Coastline</option>
              <option value="alpineMountain">🏔️ 18. Alpine Mountain Pass (Slate Crisp)</option>
              <option value="neonDaylight">🔮 19. Cyberpunk Daylight (Day-Glo)</option>
              <option value="emeraldGolfway">⛳ 20. Emerald Golfway Asphalt (Royal)</option>
            </optgroup>
          </select>
        </label>

        <label>Master Road Style (All 55+ Roads) <select id="roadVariant">
          <optgroup label="--- 🌟 5 New Classic V6 Editions ---">
            <option value="v6Gold">👑 V6 Gold Edition (Championship)</option>
            <option value="v6CyberBlue">⚡ V6 Cyber-Blue (Electric Rumble)</option>
            <option value="v6LimeBeast">🦖 V6 Lime Beast (Monster Track)</option>
            <option value="v6SunsetOrange">🔥 V6 Sunset Orange (Hyper Curve)</option>
            <option value="v6Monza">🏎️ V6 Formula Monza (Yellow/Black)</option>
          </optgroup>
          <optgroup label="--- ☀️ 15 New Day-Light Roads ---">
            <option value="sunnyDesert">☀️ Sunny Desert Highway</option>
            <option value="miamiBeach">🌴 Miami Beach Coastal</option>
            <option value="greenMeadow">🍃 Fresh Green Meadow</option>
            <option value="tokyoDay">🏙️ Tokyo City Day Asphalt</option>
            <option value="californiaSunset">🌅 California Golden Hour</option>
            <option value="redClayTrail">🏜️ Grand Canyon Red Clay</option>
            <option value="monacoF1">🏁 Monaco F1 Grand Prix</option>
            <option value="nordicSnow">❄️ Nordic Snow Valley</option>
            <option value="studioPaperWhite">⚪ Studio Minimalist White</option>
            <option value="autumnMaple">🍁 Autumn Maple Highway</option>
            <option value="skyRainbow">🌈 Sky High Rainbow Bridge</option>
            <option value="goldenSands">🏖️ Golden Sands Coastline</option>
            <option value="alpineMountain">🏔️ Alpine Mountain Pass</option>
            <option value="neonDaylight">🔮 Cyberpunk Daylight</option>
            <option value="emeraldGolfway">⛳ Emerald Golfway Asphalt</option>
          </optgroup>
          <optgroup label="--- Classic & Highway ---">
            <option value="classic" selected>1. Classic V6 (Lion Challenge)</option>
            <option value="twinStripe">2. Twin Yellow Stripes</option>
            <option value="tripleLane">3. Triple Fast Lane</option>
            <option value="asphaltSpeed">4. Speed Asphalt Pro</option>
            <option value="midnightHighway">5. Midnight Highway</option>
            <option value="carbonTrack">6. Carbon Track Pro</option>
            <option value="diamondFlow">7. Diamond Flow Runner</option>
            <option value="minimalGrey">8. Minimal Studio Grey</option>
          </optgroup>
          <optgroup label="--- Neon & Cyberpunk ---">
            <option value="neonPulse">9. Neon Pulse Glow</option>
            <option value="edgeGlow">10. Emerald Edge Glow</option>
            <option value="arcadeGrid">11. Tron Arcade Grid</option>
            <option value="railRunner">12. Rail Runner Lightbeam</option>
            <option value="chevronRush">13. Chevron Rush Neon</option>
            <option value="cyberViolet">14. Cyber Violet Drift</option>
            <option value="laserCyan">15. Laser Cyan Circuit</option>
            <option value="matrixCode">16. Matrix Green Codeflow</option>
            <option value="plasmaPink">17. Plasma Pink Horizon</option>
            <option value="overdriveNeon">18. Overdrive Synthwave</option>
            <option value="hyperSpace">19. Hyper Space Neon</option>
            <option value="retroSun">20. Retro 80s Sun Road</option>
          </optgroup>
          <optgroup label="--- Elements & Fantasy Themes ---">
            <option value="lavaCrack">21. Molten Lava Cracks</option>
            <option value="iceCrystal">22. Frozen Ice Crystal Road</option>
            <option value="goldenPath">23. Golden Treasury Trail</option>
            <option value="toxicHazard">24. Toxic Biohazard Grid</option>
            <option value="cosmicVoid">25. Cosmic Star Void</option>
            <option value="amethystPath">26. Royal Amethyst Glow</option>
            <option value="infernoFire">27. Blazing Inferno Track</option>
            <option value="electricThunder">28. Thunderstorm Blue Strike</option>
            <option value="rainbowPrism">29. Rainbow Light Prism</option>
            <option value="sunsetBoulevard">30. Sunset Boulevard Warm</option>
            <option value="pastelDream">31. Pastel Dreamscape</option>
            <option value="emeraldCity">32. Emerald City Highway</option>
            <option value="rubyRoyale">33. Ruby Royale Glow</option>
            <option value="cleanWhiteTrack">34. Clean White Modern</option>
            <option value="darkObsidian">35. Dark Obsidian Deep</option>
          </optgroup>
        </select></label>

        <!-- 🌟 10 VIRAL SHORTS STUDIO BACKDROPS -->
        <label style="grid-column:1/-1">Background Theme (30+ HD Moods) <select id="bgMode">
          <optgroup label="--- 🌟 Viral Shorts Studio Backdrops (TryLoxy Style) ---">
            <option value="studioSkyCyan" selected>🎨 1. Sky Cyan Studio (Viral Shorts)</option>
            <option value="studioLimePop">🎨 2. Lime Pop Studio (Cartoons & SpongeBob)</option>
            <option value="studioPaperSlate">🎨 3. Paper Slate Grey (Matte Clean)</option>
            <option value="studioWarmSand">🎨 4. Warm Sand Studio (Paper Cream)</option>
            <option value="studioSunsetAmber">🎨 5. Sunset Amber Studio (Warm Orange)</option>
            <option value="studioCrimsonRuby">🎨 6. Crimson Ruby Studio (Rich Red)</option>
            <option value="studioSoftPearl">🎨 7. Soft Pearl Studio (Gentle Off-White)</option>
            <option value="studioCandyViolet">🎨 8. Candy Violet Studio (Pastel)</option>
            <option value="studioMintFresh">🎨 9. Mint Fresh Studio (Soft Green)</option>
            <option value="studioRoyalCobalt">🎨 10. Royal Cobalt Studio (Electric Blue)</option>
          </optgroup>
          <optgroup label="--- Dark & Cinematic Moods ---">
            <option value="black">11. Pitch Black (Pure Focus)</option>
            <option value="midnight">12. Midnight Void</option>
            <option value="obsidian">13. Obsidian Matte (High Contrast)</option>
            <option value="deepSpace">14. Deep Space Abyss</option>
            <option value="cyberDark">15. Cyber Dark Purple</option>
            <option value="matrixBlack">16. Matrix Deep Green</option>
            <option value="lavaAbyss">17. Volcanic Lava Abyss</option>
            <option value="royalNavy">18. Royal Navy Dark</option>
            <option value="carbonDark">19. Carbon Industrial Dark</option>
            <option value="crimsonDark">20. Crimson Night Dark</option>
          </optgroup>
          <optgroup label="--- Light & Studio Moods ---">
            <option value="cleanWhite">☀️ 21. Clean Studio White</option>
            <option value="softSilver">☀️ 22. Soft Silver Mist</option>
            <option value="cloudGrey">☀️ 23. Cloud Grey Minimal</option>
            <option value="skyBlueLight">☀️ 24. Clear Sky Blue</option>
            <option value="cyanBreeze">☀️ 25. Light Cyan Breeze</option>
            <option value="mintFresh">☀️ 26. Fresh Mint Pastel</option>
            <option value="pastelLavender">☀️ 27. Pastel Lavender</option>
            <option value="sunsetWarm">☀️ 28. Sunset Warm Peach</option>
            <option value="goldAura">☀️ 29. Golden Aura Light</option>
        <span>🚦 5 Fixed Rows + Master Color PNG Batch Controller</span>
        <span class="drag-handle" draggable="true" title="Sirf ise pakad kar upar-niche khinchein">⠿ Drag</span>
      </summary>
      <div class="rowbar">
        <span class="small">5 main rows with custom color pickers & live size values + Stationary Boss.</span>
        
        <div style="width:100%;background:#101318;padding:12px;border:1px solid #3c4454;border-radius:12px;display:grid;gap:10px;margin-top:6px">
          <div style="font-weight:900;font-size:13px;color:var(--accent);display:flex;align-items:center;gap:6px">
            <span>⚡ Smart Master Color PNG (Applies by Color, NOT Straight Line!)</span>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:10px">
            <div style="background:#191d24;padding:9px;border-radius:9px;display:grid;gap:6px">
              <b style="font-size:11px;color:#2aff84">MASTER GREEN PADS PNG (All Green Pads)</b>
              <div class="file-wrap">
                <div class="thumb-box" id="thumb_master_green"><span>None</span><img src=""></div>
                <input id="master_green_file" type="file" accept="image/png,image/webp,image/jpeg">
                <button type="button" class="clear-btn" id="master_green_clear">✕ Clear</button>
              </div>
              <div class="cutout-ctrl">
                <input id="master_green_rm" type="checkbox" checked><span class="small">Auto Cut</span>
                <input id="master_green_tol" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
                <span class="val-badge" id="v_master_green_tol">32</span>
              </div>
            </div>
            <div style="background:#191d24;padding:9px;border-radius:9px;display:grid;gap:6px">
              <b style="font-size:11px;color:#ff4d4d">MASTER RED PADS PNG (All Red Pads)</b>
              <div class="file-wrap">
                <div class="thumb-box" id="thumb_master_red"><span>None</span><img src=""></div>
                <input id="master_red_file" type="file" accept="image/png,image/webp,image/jpeg">
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
          <div class="small" style="width:100%;color:var(--muted)">5वें पैड के जाने के बाद लड़ाई के बीच का गैप (सेकंड में)।</div>
        </div>
      </div>
      <div id="rows" class="rows"></div>
    </details>

  </section>
</main>

<template id="rowTemplate">
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
          <input class="leftTol" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
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
          <input class="rightTol" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
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
      <label>PNG (सड़क के अंत में खंभे की तरह रहेगा और 5वें पैड के बाद रनर से टकराएगा)
        <div class="file-wrap">
          <div class="thumb-box" id="thumb_oppImg"><span>None</span><img src=""></div>
          <input class="oppInput" type="file" accept="image/png,image/webp,image/jpeg">
          <button type="button" class="clear-btn" id="clear_oppImg">✕ Clear</button>
        </div>
      </label>
      <div class="cutout-ctrl">
        <input class="oppRemove" type="checkbox" checked><span class="small">Auto Cut</span>
        <input id="oppTol" type="range" min="10" max="80" value="32" title="Cutout Tolerance">
        <span class="val-badge" id="v_oppTol">32</span>
var manualHudImgs = [null, null, null, null, null];
var manualHudRaw = [null, null, null, null, null];
var manualHudRemove = [true, true, true, true, true];
var manualHudTol = [32, 32, 32, 32, 32];

var lastImpactType = null;
var lastImpactTime = -999;
var vfxParticles = [];

var state={
  speed:0.24,
  horizon:0.42,
  topWidth:0.20,
  bottomWidth:0.70,
  roadLen:3.0,
  camHeight:0.95,
  padDelay:2.40,
  padThickness:22,
  bossDistance:2.8,
  roadVariant:'classic',
  bgMode:'studioSkyCyan',
  speedLines:true,
  roadShine:true,
  showHud:true,
  autoCollectHud:true,
  hudStyle:'fireInferno',
  hudY:155,
  hudBoxSize:132,
  hudSpacing:18,
    });

    card.addEventListener('drop', function(e){
      if(!draggedCard || draggedCard === card) return;
      e.preventDefault();
      card.classList.remove('drag-over');
      var rect = card.getBoundingClientRect();
      var midY = rect.top + rect.height / 2;
      if(e.clientY < midY){
        container.insertBefore(draggedCard, card);
      } else {
        container.insertBefore(draggedCard, card.nextSibling);
      }
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
