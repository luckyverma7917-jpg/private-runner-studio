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
  res.writeHead(status, Object.assign({'Content-Type':type,'Cache-Control':'no-store'}, headers));
  res.end(body);
}

const LOGIN_HTML = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Private Runner Studio</title><style>*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;background:radial-gradient(circle at 50% 15%,#174f37 0,#0c0e12 43%);font-family:Inter,system-ui,sans-serif;color:#f7f8fb}.card{width:min(100%,410px);padding:30px;border:1px solid #30353f;border-radius:24px;background:#17191f;box-shadow:0 30px 90px #0008}.mark{width:54px;height:54px;border-radius:17px;display:grid;place-items:center;background:#61f0a6;color:#08130d;font-weight:900;font-size:28px}.card h1{font-size:34px;line-height:1.05;margin:24px 0 8px}.muted{color:#9da4b0;font-size:18px;margin:0 0 28px}label{display:grid;gap:10px;font-size:16px}input{width:100%;padding:16px;border-radius:14px;border:1px solid #343943;background:#0e1014;color:white;font-size:18px}button{width:100%;margin-top:16px;padding:16px;border:0;border-radius:14px;background:#61f0a6;color:#07110c;font-size:19px;font-weight:900}.msg{min-height:22px;color:#ff8f8f;margin-top:12px}</style></head><body><main class="card"><div class="mark">R</div><h1>Private Runner Studio</h1><p class="muted">Owner access only</p><form id="f"><label>Password<input id="p" type="password" autocomplete="current-password" placeholder="Enter your password"></label><button>Unlock Studio</button><div class="msg" id="m"></div></form></main><script>f.onsubmit=async function(e){e.preventDefault();m.textContent="";var r=await fetch("/api/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({password:p.value})});if(r.ok)location.href="/app";else m.textContent="Wrong password";};</script></body></html>';

const APP_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Private Runner Studio</title>
<style>
:root{--bg:#0b0d10;--panel:#15181e;--panel2:#1b1f27;--text:#f6f8fb;--muted:#9ca5b2;--line:#2b303a;--accent:#61f0a6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif}
.top{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 14px;background:#0b0d10ee;border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}
.top strong{font-size:18px}.badge{font-size:11px;color:#07110c;background:var(--accent);border-radius:99px;padding:4px 7px;margin-left:6px}
.top-actions{display:flex;gap:7px}.top button,.transport button,.rowbar button{border:1px solid var(--line);background:#222731;color:white;border-radius:11px;padding:9px 12px;font:inherit;cursor:pointer}
.top .primary,.transport .primary{background:var(--accent);color:#07110c;border-color:transparent;font-weight:800}
.studio{max-width:1220px;margin:auto;padding:14px;display:grid;grid-template-columns:minmax(320px,660px) minmax(300px,1fr);gap:16px}
.preview{min-width:0}.shell{background:#050607;border:1px solid var(--line);border-radius:18px;padding:7px;display:flex;justify-content:center;box-shadow:0 18px 60px #0007}
.stageWrap{width:min(100%,460px);aspect-ratio:9/16;border-radius:13px;overflow:hidden;background:#050506}canvas{width:100%;height:100%;display:block}
.transport{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}.transport input[type=number]{width:70px;padding:9px;background:#fff;color:#111;border-radius:8px;border:0}
.note{font-size:12px;color:var(--muted);line-height:1.45;margin-top:8px}
.controls{display:flex;flex-direction:column;gap:10px}
details{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--panel);margin-bottom:12px}summary{padding:13px 14px;background:var(--panel2);font-weight:800;cursor:pointer}
.grid{padding:13px;display:grid;gap:11px}.grid.two{grid-template-columns:1fr 1fr}.grid label,.side label{display:grid;gap:6px;color:#d7dbe2;font-size:13px}
.label-head{display:flex;justify-content:space-between;align-items:center}
.val-badge{font-size:11px;background:#242a35;color:var(--accent);padding:2px 7px;border-radius:6px;font-family:monospace;font-weight:700}
input[type=file]{width:100%;font-size:12px}input[type=range]{width:100%}
select{padding:8px;background:#0f1217;color:white;border:1px solid var(--line);border-radius:8px}
.toggle{display:flex!important;align-items:center;gap:8px!important}
.rowbar{padding:11px 13px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.rows{padding:11px;display:grid;gap:10px}.row{border:1px solid var(--line);border-radius:13px;padding:10px;background:#101318}.rowhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.sides{display:grid;grid-template-columns:1fr 1fr;gap:8px}.side{background:#191d24;border-radius:10px;padding:9px;display:grid;gap:8px}.side b{font-size:12px}
.color-picker-wrap{display:flex;align-items:center;gap:10px}
.color-picker-wrap input[type=color]{border:0;padding:0;width:38px;height:34px;border-radius:6px;background:none;cursor:pointer}
.small{font-size:11px;color:var(--muted)}
@media(max-width:820px){.studio{grid-template-columns:1fr;padding:8px}.top{padding:9px}.top strong{font-size:14px}.top button{padding:8px 9px;font-size:12px}.grid.two,.sides{grid-template-columns:1fr}.controls{padding-bottom:40px}}
</style>
</head>
<body>
<header class="top">
  <div><strong>Private Runner Studio</strong><span class="badge">V7 PRO ENGINE</span></div>
  <div class="top-actions"><button id="saveBtn">Save State</button><button id="resetStorageBtn">Reset UI</button><button id="logoutBtn">Logout</button></div>
</header>
<main class="studio">
  <section class="preview">
    <div class="shell"><div class="stageWrap"><canvas id="stage" width="720" height="1280"></canvas></div></div>
    <div class="transport"><button class="primary" id="playBtn">Pause</button><button id="resetBtn">Reset Time</button><label>Record sec <input id="recordSec" type="number" min="2" max="60" value="15"></label><button id="exportBtn">Export Video</button></div>
    <div class="note">All sliders update live on canvas. Settings auto-save continuously.</div>
  </section>
  <section class="controls">
    <details open><summary>🏃 Runner Behind Pads Setup</summary>
      <div class="grid two">
        <label>Runner Character PNG <input id="playerInput" type="file" accept="image/png,image/webp,image/jpeg"></label>
        <label>
          <span class="label-head"><span>Runner Size</span><span class="val-badge" id="v_playerSize">120</span></span>
          <input id="playerSize" type="range" min="40" max="400" value="120">
        </label>
        <label>Runner Lane
          <select id="playerLane">
            <option value="auto">Auto Follow Green Lane</option>
            <option value="left">Follow Left Lane</option>
            <option value="right">Follow Right Lane</option>
          </select>
        </label>
        <label>
          <span class="label-head"><span>Depth (Z-Position)</span><span class="val-badge" id="v_playerZ">0.84</span></span>
          <input id="playerZ" type="range" min="0.50" max="0.95" step="0.01" value="0.84">
        </label>
      </div>
    </details>

    <details open><summary>Moving Highway & Camera</summary><div class="grid two">
      <label>
        <span class="label-head"><span>Forward speed</span><span class="val-badge" id="v_speed">0.24</span></span>
        <input id="speed" type="range" min="0.10" max="0.60" step="0.01" value="0.24">
      </label>
      <label>
        <span class="label-head"><span>Horizon Height</span><span class="val-badge" id="v_horizon">0.46</span></span>
        <input id="horizon" type="range" min="0.20" max="0.75" step="0.01" value="0.46">
      </label>
      <label>
        <span class="label-head"><span>Top Width</span><span class="val-badge" id="v_topWidth">0.08</span></span>
        <input id="topWidth" type="range" min="0.02" max="0.25" step="0.005" value="0.08">
      </label>
      <label>
        <span class="label-head"><span>Bottom Width (Lion Style)</span><span class="val-badge" id="v_bottomWidth">0.88</span></span>
        <input id="bottomWidth" type="range" min="0.50" max="1.15" step="0.02" value="0.88">
      </label>
      <label>
        <span class="label-head"><span>Camera Height</span><span class="val-badge" id="v_camHeight">1.2</span></span>
        <input id="camHeight" type="range" min="0.5" max="3.0" step="0.05" value="1.2">
      </label>
      <label>
        <span class="label-head"><span>Pad delay</span><span class="val-badge" id="v_padDelay">1.75</span></span>
        <input id="padDelay" type="range" min="1.10" max="2.60" step="0.05" value="1.75">
      </label>
      <label>
        <span class="label-head"><span>Pad glow base</span><span class="val-badge" id="v_padThickness">14</span></span>
        <input id="padThickness" type="range" min="6" max="28" value="14">
      </label>
      <label>Road style (35+ Road Styles) <select id="roadVariant">
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
          <option value="laserCyan">12. Laser Cyan Circuit</option>
          <option value="matrixCode">13. Matrix Green Codeflow</option>
          <option value="plasmaPink">14. Plasma Pink Horizon</option>
          <option value="overdriveNeon">15. Overdrive Synthwave</option>
        </optgroup>
        <optgroup label="--- Elemental & Fantasy ---">
          <option value="lavaCrack">16. Molten Lava Magma</option>
          <option value="iceCrystal">17. Frozen Crystal Ice</option>
          <option value="goldenPath">18. Royal Golden Highway</option>
          <option value="toxicHazard">19. Toxic Biohazard</option>
          <option value="cosmicVoid">20. Cosmic Star Dust</option>
          <option value="amethystPath">21. Crystal Amethyst</option>
          <option value="infernoFire">22. Blazing Inferno Track</option>
          <option value="electricThunder">23. Electric Thunder Blue</option>
        </optgroup>
        <optgroup label="--- Modern & Aesthetic ---">
          <option value="carbonTrack">24. Carbon Fiber Sport</option>
          <option value="diamondFlow">25. Diamond Glow Flow</option>
          <option value="minimalGrey">26. Studio Minimalist Mono</option>
          <option value="pastelDream">27. Pastel Dreamway</option>
          <option value="sunsetBoulevard">28. Sunset Boulevard</option>
          <option value="rainbowPrism">29. Rainbow Prism Edge</option>
          <option value="retroSun">30. 80s Retro Sun Track</option>
          <option value="darkObsidian">31. Matte Dark Obsidian</option>
          <option value="hyperSpace">32. Hyper Space Warp</option>
          <option value="cleanWhiteTrack">33. Pure Ceramic White</option>
          <option value="emeraldCity">34. Radiant Emerald Run</option>
          <option value="rubyRoyale">35. Ruby Royale Luxury</option>
        </optgroup>
      </select></label>
      <label>Background Theme (52+ Themes) <select id="bgMode">
        <optgroup label="--- Light & Aesthetic Themes ---">
          <option value="cleanWhite">☀️ 1. Clean Studio White</option>
          <option value="softSilver">☀️ 2. Soft Silver Mist</option>
          <option value="cloudGrey">☀️ 3. Cloud Grey</option>
          <option value="skyBlueLight">☀️ 4. Clear Sky Blue</option>
          <option value="cyanBreeze">☀️ 5. Light Cyan Breeze</option>
          <option value="mintFresh">☀️ 6. Fresh Mint Pastel</option>
          <option value="warmVanilla">☀️ 7. Warm Vanilla</option>
          <option value="peachDawn">☀️ 8. Peach Sunrise</option>
          <option value="lavenderLight">☀️ 9. Soft Lavender</option>
          <option value="rosePastel">☀️ 10. Rose Pastel Glow</option>
          <option value="lemonDay">☀️ 11. Lemon Daylight</option>
          <option value="iceWhite">☀️ 12. Arctic Ice White</option>
          <option value="cyberMintLight">☀️ 13. Cyber Mint Light</option>
          <option value="lilacMist">☀️ 14. Lilac Morning</option>
          <option value="goldenSand">☀️ 15. Warm Golden Glow</option>
        </optgroup>
        <optgroup label="--- 50+ Dark Themes ---">
          <option value="black" selected>1. Pitch Black</option>
          <option value="midnight">2. Midnight Void</option>
          <option value="obsidian">3. Obsidian Matte</option>
          <option value="deepSpace">4. Deep Space Abyss</option>
          <option value="cyberDark">5. Cyber Dark</option>
          <option value="matrixBlack">6. Matrix Black</option>
          <option value="carbonDark">7. Carbon Fiber Dark</option>
          <option value="charcoal">8. Charcoal Shadow</option>
          <option value="gunmetal">9. Gunmetal Grey</option>
          <option value="onyx">10. Onyx Night</option>
          <option value="eclipse">11. Total Eclipse</option>
          <option value="abyss">12. Ocean Abyss</option>
          <option value="deepNavy">13. Deep Navy Dark</option>
          <option value="midnightBlue">14. Midnight Blue</option>
          <option value="slateDark">15. Slate Shadow</option>
          <option value="asphalt">16. Wet Asphalt</option>
          <option value="gravel">17. Dark Gravel</option>
          <option value="steelDark">18. Dark Steel</option>
          <option value="ironDark">19. Dark Iron</option>
          <option value="phantom">20. Phantom Black</option>
          <option value="shadow">21. Dark Shadow</option>
          <option value="vampire">22. Vampire Red-Black</option>
          <option value="crimsonDark">23. Dark Crimson</option>
          <option value="bloodNight">24. Blood Night</option>
          <option value="neonPurpleDark">25. Neon Purple Dark</option>
          <option value="violetNight">26. Violet Abyss</option>
          <option value="electricBlueDark">27. Electric Blue Dark</option>
          <option value="cyanDark">28. Dark Cyan Void</option>
          <option value="emeraldDark">29. Dark Emerald</option>
          <option value="matrixGreen">30. Matrix Green Dark</option>
          <option value="toxicGreen">31. Toxic Dark</option>
          <option value="amberDark">32. Amber Shadow</option>
          <option value="sunsetDark">33. Dark Sunset</option>
          <option value="laserRed">34. Laser Red Dark</option>
          <option value="plasmaDark">35. Plasma Dark</option>
          <option value="reactor">36. Reactor Core</option>
          <option value="synthwave">37. Synthwave Night</option>
          <option value="retrowave">38. Retrowave Dark</option>
          <option value="cyberpunkDark">39. Cyberpunk Night</option>
          <option value="gotham">40. Gotham Alley</option>
          <option value="underworld">41. Underworld</option>
          <option value="infernoDark">42. Dark Inferno</option>
          <option value="magmaDark">43. Dark Magma</option>
          <option value="voidBlue">44. Void Blue</option>
          <option value="voidPurple">45. Void Purple</option>
          <option value="voidGreen">46. Void Green</option>
          <option value="voidRed">47. Void Red</option>
          <option value="voidGold">48. Void Gold</option>
          <option value="cosmicDark">49. Cosmic Dark</option>
          <option value="nebulaDark">50. Dark Nebula</option>
          <option value="quantumVoid">51. Quantum Void</option>
          <option value="ultimateDark">52. Ultimate Dark V2</option>
        </optgroup>
      </select></label>
      <label class="toggle"><input id="speedLines" type="checkbox"> Motion streaks</label>
      <label class="toggle"><input id="roadShine" type="checkbox" checked> Road highlights</label>
    </div></details>
    <details open><summary>5 Fixed Rows + Opponent Boss</summary><div class="rowbar"><span class="small">5 main rows with custom color pickers & live size values + Stationary Boss.</span></div><div id="rows" class="rows"></div></details>
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
        <label>PNG <input class="leftInput" type="file" accept="image/png,image/webp,image/jpeg"></label>
        <label class="toggle"><input class="leftRemove" type="checkbox" checked> Auto remove bg</label>
        <label>
          <span class="label-head"><span>Size</span><span class="val-badge leftSizeVal">95</span></span>
          <input class="leftSize" type="range" min="45" max="450" value="95">
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
        <label>PNG <input class="rightInput" type="file" accept="image/png,image/webp,image/jpeg"></label>
        <label class="toggle"><input class="rightRemove" type="checkbox" checked> Auto remove bg</label>
        <label>
          <span class="label-head"><span>Size</span><span class="val-badge rightSizeVal">95</span></span>
          <input class="rightSize" type="range" min="45" max="450" value="95">
        </label>
      </div>
    </div>
  </div>
</template>

<template id="opponentTemplate">
  <div class="row" style="border-color:#61f0a6">
    <div class="rowhead"><strong style="color:#61f0a6">&#128293; Opponent Boss</strong><span class="small">Static behind 5th pad (Appears after 2nd pad)</span></div>
    <div class="side" style="grid-column:span 2">
      <b>OPPONENT CHARACTER</b>
      <label>PNG <input class="oppInput" type="file" accept="image/png,image/webp,image/jpeg"></label>
      <label class="toggle"><input class="oppRemove" type="checkbox" checked> Auto remove bg</label>
      <label>
        <span class="label-head"><span>Size</span><span class="val-badge oppSizeVal">220</span></span>
        <input class="oppSize" type="range" min="50" max="600" value="220">
      </label>
    </div>
  </div>
</template>

<script>
(function(){
var canvas=document.getElementById('stage');
var ctx=canvas.getContext('2d');
var W=canvas.width, H=canvas.height;
var $=function(id){ return document.getElementById(id); };
var running=true, last=performance.now(), roadTime=0, recorder=null;

var state={
  speed:0.24,
  horizon:0.46,
  topWidth:0.08,
  bottomWidth:0.88,
  camHeight:1.2,
  padDelay:1.75,
  padThickness:14,
  roadVariant:'classic',
  bgMode:'black',
  speedLines:false,
  roadShine:true,
  playerImg:null,
  playerSize:120,
  playerZ:0.84,
  playerLane:'auto',
  playerX:W/2,
  currentLane:'left',
  rows:[
    {left:{color:'#2aff84',img:null,remove:true,size:95}, right:{color:'#ff323a',img:null,remove:true,size:95}},
    {left:{color:'#ff323a',img:null,remove:true,size:95}, right:{color:'#2aff84',img:null,remove:true,size:95}},
    {left:{color:'#2aff84',img:null,remove:true,size:95}, right:{color:'#ff323a',img:null,remove:true,size:95}},
    {left:{color:'#ff323a',img:null,remove:true,size:95}, right:{color:'#2aff84',img:null,remove:true,size:95}},
    {left:{color:'#2aff84',img:null,remove:true,size:95}, right:{color:'#ff323a',img:null,remove:true,size:95}}
  ],
  opponent:{img:null,remove:true,size:220}
};

function removeBackground(img){
  var c=document.createElement('canvas');
  c.width=img.width; c.height=img.height;
  var cx=c.getContext('2d');
  cx.drawImage(img,0,0);
  var id=cx.getImageData(0,0,c.width,c.height);
  var d=id.data;
  var r0=d[0], g0=d[1], b0=d[2];
  for(var i=0;i<d.length;i+=4){
    var dr=Math.abs(d[i]-r0), dg=Math.abs(d[i+1]-g0), db=Math.abs(d[i+2]-b0);
    if(dr<38 && dg<38 && db<38) d[i+3]=0;
  }
  cx.putImageData(id,0,0);
  var out=new Image();
  out.src=c.toDataURL();
  return out;
}

function readFile(file){
  return new Promise(function(resolve){
    var r=new FileReader();
    r.onload=function(e){ resolve(e.target.result); };
    r.readAsDataURL(file);
  });
}

function dataToProcessedImage(src, removeBg){
  return new Promise(function(resolve){
    var im=new Image();
    im.onload=function(){
      if(removeBg){
        try{ resolve(removeBackground(im)); }catch(e){ resolve(im); }
      } else { resolve(im); }
    };
    im.src=src;
  });
}

function roadBoundsAtZ(z){
  var hy = H * state.horizon;
  var y = hy + (H - hy) * Math.pow(Math.max(0, Math.min(1, z)), state.camHeight);
  var e = Math.pow(Math.max(0, Math.min(1, z)), 2.0);
  var w = W * (state.topWidth + (state.bottomWidth - state.topWidth) * e);
  return { y: y, half: w / 2, e: e, z: z };
}

function drawImageFit(img, cx, baseBottomY, w, h){
  if(!img || !img.complete || img.naturalWidth === 0) return;
  var aspect = img.naturalWidth / img.naturalHeight;
  var dw = w, dh = h;
  if(aspect > 1) dh = dw / aspect; else dw = dh * aspect;
  ctx.drawImage(img, cx - dw / 2, baseBottomY - dh, dw, dh);
}

// 52 THEMES ENGINE
function drawBackground(){
  var hy = H * state.horizon;
  var bg = state.bgMode;
  var themeColors = {
    cleanWhite:'#f5f6f8', softSilver:'#e3e7ec', cloudGrey:'#cfd4dc', skyBlueLight:'#bfe4fc',
    cyanBreeze:'#d0f5f7', mintFresh:'#c8f5e2', warmVanilla:'#faf4e6', peachDawn:'#fde5d9',
    lavenderLight:'#ede2f7', rosePastel:'#fcdde5', lemonDay:'#fdf7d5', iceWhite:'#eaf4fc',
    cyberMintLight:'#dcfbf1', lilacMist:'#f2e8fa', goldenSand:'#faeed7',
    black:'#050608', midnight:'#030407', obsidian:'#080a0d', deepSpace:'#020512',
    cyberDark:'#050a12', matrixBlack:'#020d06', carbonDark:'#0a0b0d', charcoal:'#0c0d10',
    gunmetal:'#0d0f14', onyx:'#090b0e', eclipse:'#040405', abyss:'#020813',
    deepNavy:'#030a17', midnightBlue:'#040d1c', slateDark:'#0a0d13', asphalt:'#0e1015',
    gravel:'#111317', steelDark:'#0d1015', ironDark:'#0b0d11', phantom:'#06070a',
    shadow:'#050609', vampire:'#140306', crimsonDark:'#160408', bloodNight:'#180305',
    neonPurpleDark:'#10041a', violetNight:'#0d0317', electricBlueDark:'#030e21', cyanDark:'#02141a',
    emeraldDark:'#03160c', matrixGreen:'#031a0b', toxicGreen:'#041c09', amberDark:'#170e03',
    sunsetDark:'#1a090a', laserRed:'#1c0307', plasmaDark:'#13031a', reactor:'#031919',
    synthwave:'#130722', retrowave:'#170624', cyberpunkDark:'#04121a', gotham:'#090a0d',
    underworld:'#0d0407', infernoDark:'#1c0502', magmaDark:'#1f0601', voidBlue:'#010411',
    voidPurple:'#070112', voidGreen:'#011105', voidRed:'#120104', voidGold:'#120e01',
    cosmicDark:'#080214', nebulaDark:'#0b0317', quantumVoid:'#020712', ultimateDark:'#000000'
  };

  ctx.fillStyle = themeColors[bg] || '#050608';
  ctx.fillRect(0, 0, W, H);
}

// 35 ROAD VARIANTS ENGINE
function drawRoad(){
  var hy = H * state.horizon;
  var pTop = roadBoundsAtZ(0);
  var pBot = roadBoundsAtZ(1);
  var rv = state.roadVariant;

  ctx.save();

  // 1. Road Surface Base (Custom per variant)
  ctx.beginPath();
  ctx.moveTo(W/2 - pTop.half, hy);
  ctx.lineTo(W/2 + pTop.half, hy);
  ctx.lineTo(W/2 + pBot.half, H);
  ctx.lineTo(W/2 - pBot.half, H);
  ctx.closePath();

  if(rv === 'cleanWhiteTrack') ctx.fillStyle = '#f0f3f6';
  else if(rv === 'lavaCrack' || rv === 'infernoFire') ctx.fillStyle = '#140303';
  else if(rv === 'iceCrystal') ctx.fillStyle = '#061524';
  else if(rv === 'goldenPath') ctx.fillStyle = '#1c1503';
  else if(rv === 'cyberViolet') ctx.fillStyle = '#12031a';
  else if(rv === 'carbonTrack') ctx.fillStyle = '#0a0b0e';
  else ctx.fillStyle = '#0b0d12';
  ctx.fill();

  // 2. Road Borders / Side Rails (All 35 Styles Responding)
  var borderCol = '#2aff84';
  var glowCol = '#2aff84';
  var glowBlur = 18;
  var stripeCol = 'rgba(255, 255, 255, 0.85)';

  if(rv === 'neonPulse'){ borderCol = '#00ffcc'; glowCol = '#00ffcc'; glowBlur = 25; }
  else if(rv === 'edgeGlow'){ borderCol = '#00ff66'; glowCol = '#00ff66'; glowBlur = 24; }
  else if(rv === 'arcadeGrid'){ borderCol = '#ff0055'; glowCol = '#ff0055'; glowBlur = 20; stripeCol = '#00f0ff'; }
  else if(rv === 'railRunner'){ borderCol = '#00e5ff'; glowCol = '#00e5ff'; glowBlur = 28; }
  else if(rv === 'chevronRush'){ borderCol = '#ffbb00'; glowCol = '#ff7700'; glowBlur = 22; }
  else if(rv === 'cyberViolet'){ borderCol = '#d500f9'; glowCol = '#d500f9'; glowBlur = 24; stripeCol = '#ff4081'; }
  else if(rv === 'laserCyan'){ borderCol = '#00ffff'; glowCol = '#00ffff'; glowBlur = 25; stripeCol = '#00e5ff'; }
  else if(rv === 'matrixCode'){ borderCol = '#00ff44'; glowCol = '#00ff44'; glowBlur = 26; stripeCol = '#39ff14'; }
  else if(rv === 'plasmaPink'){ borderCol = '#ff007f'; glowCol = '#ff007f'; glowBlur = 26; stripeCol = '#ff80bf'; }
  else if(rv === 'overdriveNeon'){ borderCol = '#ff0055'; glowCol = '#7928ca'; glowBlur = 24; stripeCol = '#00dfd8'; }
  else if(rv === 'lavaCrack'){ borderCol = '#ff3300'; glowCol = '#ff9900'; glowBlur = 24; stripeCol = '#ff5500'; }
  else if(rv === 'iceCrystal'){ borderCol = '#a6f7ff'; glowCol = '#00e1ff'; glowBlur = 24; stripeCol = '#e0f7fa'; }
  else if(rv === 'goldenPath'){ borderCol = '#ffd700'; glowCol = '#ffaa00'; glowBlur = 24; stripeCol = '#ffe066'; }
  else if(rv === 'toxicHazard'){ borderCol = '#a6ff00'; glowCol = '#73ff00'; glowBlur = 25; stripeCol = '#ccff00'; }
  else if(rv === 'cosmicVoid'){ borderCol = '#9d4edd'; glowCol = '#7b2cbf'; glowBlur = 25; stripeCol = '#e0aaff'; }
  else if(rv === 'amethystPath'){ borderCol = '#c77dff'; glowCol = '#9d4edd'; glowBlur = 24; }
  else if(rv === 'infernoFire'){ borderCol = '#ff2200'; glowCol = '#ff6600'; glowBlur = 26; stripeCol = '#ffaa00'; }
  else if(rv === 'electricThunder'){ borderCol = '#00d4ff'; glowCol = '#0066ff'; glowBlur = 26; stripeCol = '#ffffff'; }
  else if(rv === 'twinStripe'){ borderCol = '#ffffff'; glowCol = '#ffffff'; glowBlur = 10; stripeCol = '#ffd700'; }
  else if(rv === 'rubyRoyale'){ borderCol = '#ff1744'; glowCol = '#d50000'; glowBlur = 24; stripeCol = '#ff5252'; }
  else if(rv === 'emeraldCity'){ borderCol = '#00e676'; glowCol = '#00c853'; glowBlur = 24; stripeCol = '#69f0ae'; }
  else if(rv === 'sunsetBoulevard'){ borderCol = '#ff5e3a'; glowCol = '#ff2a6d'; glowBlur = 22; stripeCol = '#ffc371'; }
  else if(rv === 'cleanWhiteTrack'){ borderCol = '#111317'; glowCol = 'transparent'; glowBlur = 0; stripeCol = '#333742'; }

  ctx.save();
  ctx.strokeStyle = borderCol;
  ctx.lineWidth = 6 + 14 * pBot.e;
  if(glowBlur > 0){
    ctx.shadowColor = glowCol;
    ctx.shadowBlur = glowBlur;
  }
  ctx.beginPath();
  ctx.moveTo(W/2 - pTop.half, hy);
  ctx.lineTo(W/2 - pBot.half, H);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(W/2 + pTop.half, hy);
  ctx.lineTo(W/2 + pBot.half, H);
  ctx.stroke();
  ctx.restore();

  // 3. Moving Highway Center Stripes (Twin or Single Center)
  var speedOffset = (roadTime * state.speed * 3.5) % 1;
  for(var i=0; i<16; i++){
    var z1 = (i + speedOffset) / 16;
    var z2 = (i + 0.5 + speedOffset) / 16;
    if(z1 >= 0 && z2 <= 1){
      var r1 = roadBoundsAtZ(z1);
      var r2 = roadBoundsAtZ(z2);

      if(rv === 'twinStripe'){
        var off = r1.half * 0.12;
        ctx.beginPath();
        ctx.moveTo(W/2 - off, r1.y); ctx.lineTo(W/2 - off, r2.y);
        ctx.moveTo(W/2 + off, r1.y); ctx.lineTo(W/2 + off, r2.y);
        ctx.strokeStyle = stripeCol;
        ctx.lineWidth = 2 + 6 * r1.e;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(W/2, r1.y);
        ctx.lineTo(W/2, r2.y);
        ctx.strokeStyle = stripeCol;
        ctx.lineWidth = 3 + 9 * r1.e;
        ctx.shadowColor = stripeCol;
        ctx.shadowBlur = 6;
        ctx.stroke();
      }
    }
  }

  ctx.restore();
}

// PAD GATES WITH INCREASED HEIGHT
function drawPadArch(x, y, w, h, col){
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - w/2, y - h, w, h);
  ctx.fillStyle = col + '22';
  ctx.fill();

  ctx.lineWidth = state.padThickness || 14;
  ctx.strokeStyle = col;
  ctx.shadowColor = col;
  ctx.shadowBlur = 24;
  ctx.stroke();

  ctx.fillStyle = col;
  ctx.fillRect(x - w/2, y - h, w, Math.max(6, 10 * (h / 160)));
  ctx.restore();
}

// 5 ROWS ENGINE + OPPONENT BOSS
function drawRows(){
  var delay = state.padDelay;
  var closestActiveRow = -1;
  var closestZ = 0;

  for(var r = state.rows.length - 1; r >= 0; r--){
    var rowTime = roadTime * state.speed - (r * delay * 0.2);
    var loopZ = (rowTime % 1.2);
    if(loopZ < 0) loopZ += 1.2;
    if(loopZ > 1.0) continue;

    if(loopZ > closestZ && loopZ < (state.playerZ || 0.84) + 0.15){
      closestZ = loopZ;
      closestActiveRow = r;
    }

    var p = roadBoundsAtZ(loopZ);
    var padW = p.half * 0.88;
    var padH = 160 * (0.25 + 0.75 * p.e); // Tall Pad Gates

    var lx = W/2 - p.half * 0.5;
    var rx = W/2 + p.half * 0.5;

    // LEFT PAD GATE
    var leftData = state.rows[r].left;
    drawPadArch(lx, p.y, padW, padH, leftData.color);
    if(leftData.img){
      var lSize = (leftData.size || 95) * (0.25 + 0.75 * p.e);
      drawImageFit(leftData.img, lx, p.y - 12, lSize, lSize);
    }

    // RIGHT PAD GATE
    var rightData = state.rows[r].right;
    drawPadArch(rx, p.y, padW, padH, rightData.color);
    if(rightData.img){
      var rSize = (rightData.size || 95) * (0.25 + 0.75 * p.e);
      drawImageFit(rightData.img, rx, p.y - 12, rSize, rSize);
    }
  }

  if(closestActiveRow !== -1){
    var activeLeft = state.rows[closestActiveRow].left;
    state.currentLane = (activeLeft.color.indexOf('2a') !== -1 || activeLeft.color.indexOf('green') !== -1 || activeLeft.color.indexOf('00') !== -1) ? 'left' : 'right';
  }

  // Stationary Opponent Boss behind 5th pad
  if(state.opponent && state.opponent.img){
    var op = roadBoundsAtZ(0.28);
    var opSize = (state.opponent.size || 220) * (0.25 + 0.75 * op.e);
    drawImageFit(state.opponent.img, W/2, op.y, opSize, opSize);
  }
}

// RUNNER BEHIND PADS
function drawRunnerBehind(){
  if(!state.playerImg) return;
  var p = roadBoundsAtZ(state.playerZ || 0.84);
  var pSize = (state.playerSize || 120) * (0.3 + 0.7 * p.e);

  var targetLane = state.playerLane;
  if(targetLane === 'auto'){
    targetLane = state.currentLane || 'left';
  }
  var targetX = targetLane === 'right' ? (W/2 + p.half * 0.48) : (W/2 - p.half * 0.48);
  state.playerX = state.playerX || (W/2);
  state.playerX += (targetX - state.playerX) * 0.15;

  drawImageFit(state.playerImg, state.playerX, p.y + 4, pSize, pSize);
}

// MAIN 60FPS LOOP
function frame(now){
  var dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if(running) roadTime += dt;

  drawBackground();
  drawRoad();
  drawRunnerBehind();
  drawRows();

  requestAnimationFrame(frame);
}

// CONTROLS INITIALIZATION
function initRowsUI(){
  var container = $('rows');
  var tpl = $('rowTemplate');
  container.innerHTML = '';

  state.rows.forEach(function(row, idx){
    var clone = tpl.content.cloneNode(true);
    clone.querySelector('.rowtitle').textContent = 'Row ' + (idx + 1);

    var lc = clone.querySelector('.leftColor');
    var lcv = clone.querySelector('.leftColorVal');
    lc.value = row.left.color;
    lcv.textContent = row.left.color;
    lc.oninput = function(e){ row.left.color = e.target.value; lcv.textContent = e.target.value; };

    var rc = clone.querySelector('.rightColor');
    var rcv = clone.querySelector('.rightColorVal');
    rc.value = row.right.color;
    rcv.textContent = row.right.color;
    rc.oninput = function(e){ row.right.color = e.target.value; rcv.textContent = e.target.value; };

    var li = clone.querySelector('.leftInput');
    var lr = clone.querySelector('.leftRemove');
    li.onchange = function(e){
      var f = e.target.files[0]; if(!f) return;
      readFile(f).then(function(src){ dataToProcessedImage(src, lr.checked).then(function(im){ row.left.img = im; }); });
    };

    var ri = clone.querySelector('.rightInput');
    var rr = clone.querySelector('.rightRemove');
    ri.onchange = function(e){
      var f = e.target.files[0]; if(!f) return;
      readFile(f).then(function(src){ dataToProcessedImage(src, rr.checked).then(function(im){ row.right.img = im; }); });
    };

    var ls = clone.querySelector('.leftSize');
    var lsv = clone.querySelector('.leftSizeVal');
    ls.value = row.left.size; lsv.textContent = row.left.size;
    ls.oninput = function(e){ row.left.size = Number(e.target.value); lsv.textContent = e.target.value; };

    var rs = clone.querySelector('.rightSize');
    var rsv = clone.querySelector('.rightSizeVal');
    rs.value = row.right.size; rsv.textContent = row.right.size;
    rs.oninput = function(e){ row.right.size = Number(e.target.value); rsv.textContent = e.target.value; };

    container.appendChild(clone);
  });

  var oppTpl = $('opponentTemplate');
  var oppClone = oppTpl.content.cloneNode(true);
  var oppInput = oppClone.querySelector('.oppInput');
  var oppRemove = oppClone.querySelector('.oppRemove');
  var oppSize = oppClone.querySelector('.oppSize');
  var oppSizeVal = oppClone.querySelector('.oppSizeVal');

  oppInput.onchange = function(e){
    var f = e.target.files[0]; if(!f) return;
    readFile(f).then(function(src){ dataToProcessedImage(src, oppRemove.checked).then(function(im){ state.opponent.img = im; }); });
  };
  oppSize.oninput = function(e){
    state.opponent.size = Number(e.target.value);
    oppSizeVal.textContent = e.target.value;
  };
  container.appendChild(oppClone);
}

function bindControls(){
  function bindVal(id, stateKey){
    var el = $(id);
    var badge = $('v_' + id);
    if(!el) return;
    el.oninput = function(e){
      state[stateKey] = Number(e.target.value);
      if(badge) badge.textContent = e.target.value;
    };
  }
  bindVal('speed', 'speed');
  bindVal('horizon', 'horizon');
  bindVal('topWidth', 'topWidth');
  bindVal('bottomWidth', 'bottomWidth');
  bindVal('camHeight', 'camHeight');
  bindVal('padDelay', 'padDelay');
  bindVal('padThickness', 'padThickness');
  bindVal('playerSize', 'playerSize');
  bindVal('playerZ', 'playerZ');

  if($('roadVariant')) $('roadVariant').onchange = function(e){ state.roadVariant = e.target.value; };
  if($('bgMode')) $('bgMode').onchange = function(e){ state.bgMode = e.target.value; };
  if($('playerLane')) $('playerLane').onchange = function(e){ state.playerLane = e.target.value; };

  if($('playerInput')) $('playerInput').onchange = function(e){
    var f = e.target.files[0]; if(!f) return;
    readFile(f).then(function(src){ dataToProcessedImage(src, true).then(function(im){ state.playerImg = im; }); });
  };

  $('playBtn').onclick = function(){
    running = !running;
    this.textContent = running ? 'Pause' : 'Play';
  };
  $('resetBtn').onclick = function(){ roadTime = 0; };
  $('logoutBtn').onclick = function(){ location.href = '/api/logout'; };
}

initRowsUI();
bindControls();
requestAnimationFrame(frame);
})();
</script>
</body>
</html>`;

const server = http.createServer(function(req, res){
  var url = req.url.split('?')[0];

  if(url === '/api/login' && req.method === 'POST'){
    var body = '';
    req.on('data', function(chunk){ body += chunk; });
    req.on('end', function(){
      try{
        var data = JSON.parse(body || '{}');
        if(data.password === APP_PASSWORD){
          var exp = Date.now() + SESSION_MS;
          var nonce = crypto.randomBytes(16).toString('hex');
          var sig = crypto.createHmac('sha256', SESSION_SECRET).update(exp + '.' + nonce).digest('hex');
          var token = exp + '.' + nonce + '.' + sig;
          send(res, 200, '{"ok":true}', 'application/json', {
            'Set-Cookie': 'runner_session=' + encodeURIComponent(token) + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + (SESSION_MS/1000)
          });
        } else {
          send(res, 401, '{"error":"Wrong password"}', 'application/json');
        }
      }catch(e){
        send(res, 400, '{"error":"Invalid JSON"}', 'application/json');
      }
    });
    return;
  }

  if(url === '/api/logout'){
    send(res, 302, '', 'text/plain', {
      'Set-Cookie': 'runner_session=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      'Location': '/'
    });
    return;
  }

  if(!authed(req)){
    send(res, 200, LOGIN_HTML, 'text/html; charset=utf-8');
    return;
  }

  if(url === '/' || url === '/app'){
    send(res, 200, APP_HTML, 'text/html; charset=utf-8');
    return;
  }

  send(res, 404, 'Not Found');
});

server.listen(PORT, function(){
  console.log('Server running on port ' + PORT);
});
