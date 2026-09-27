const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const APP_PASSWORD = process.env.APP_PASSWORD || 'change-me-now';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

function parseCookies(req){
  const out={};
  (req.headers.cookie||'').split(';').forEach(p=>{
    const i=p.indexOf('=');
    if(i>0) out[p.slice(0,i).trim()]=decodeURIComponent(p.slice(i+1).trim());
  });
  return out;
}
function safeEqual(a,b){
  const aa=Buffer.from(String(a)), bb=Buffer.from(String(b));
  return aa.length===bb.length && crypto.timingSafeEqual(aa,bb);
}
function verifySession(token){
  if(!token) return false;
  const p=token.split('.');
  if(p.length!==3) return false;
  const [exp,nonce,sig]=p;
  const payload=`${exp}.${nonce}`;
  const expected=crypto.createHmac('sha256',SESSION_SECRET).update(payload).digest('hex');
  return safeEqual(sig,expected) && Number(exp)>Date.now();
}
function authed(req){return verifySession(parseCookies(req).runner_session)}
function send(res,status,body,type='text/plain; charset=utf-8',headers={}){
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store',...headers});
  res.end(body);
}

const LOGIN_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Private Runner Studio</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;background:radial-gradient(circle at 50% 15%,#174f37 0,#0c0e12 43%);font-family:Inter,system-ui,sans-serif;color:#f7f8fb}.card{width:min(100%,410px);padding:30px;border:1px solid #30353f;border-radius:24px;background:#17191f;box-shadow:0 30px 90px #0008}.mark{width:54px;height:54px;border-radius:17px;display:grid;place-items:center;background:#61f0a6;color:#08130d;font-weight:900;font-size:28px}.card h1{font-size:34px;line-height:1.05;margin:24px 0 8px}.muted{color:#9da4b0;font-size:18px;margin:0 0 28px}label{display:grid;gap:10px;font-size:16px}input{width:100%;padding:16px;border-radius:14px;border:1px solid #343943;background:#0e1014;color:white;font-size:18px}button{width:100%;margin-top:16px;padding:16px;border:0;border-radius:14px;background:#61f0a6;color:#07110c;font-size:19px;font-weight:900}.msg{min-height:22px;color:#ff8f8f;margin-top:12px}
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
<title>Private Runner Studio Auto-Save</title>
<style>
:root{--bg:#0b0d10;--panel:#15181e;--panel2:#1b1f27;--text:#f6f8fb;--muted:#9ca5b2;--line:#2b303a;--accent:#61f0a6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,sans-serif}
.top{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 14px;background:#0b0d10ee;border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}
.top strong{font-size:18px}.badge{font-size:11px;color:#07110c;background:var(--accent);border-radius:99px;padding:4px 7px;margin-left:6px}
.top-actions{display:flex;gap:7px}.top button,.transport button,.rowbar button{border:1px solid var(--line);background:#222731;color:white;border-radius:11px;padding:9px 12px;font:inherit}
.top .primary,.transport .primary{background:var(--accent);color:#07110c;border-color:transparent;font-weight:800}
.studio{max-width:1220px;margin:auto;padding:14px;display:grid;grid-template-columns:minmax(320px,660px) minmax(300px,1fr);gap:16px}
.preview{min-width:0}.shell{background:#050607;border:1px solid var(--line);border-radius:18px;padding:7px;display:flex;justify-content:center;box-shadow:0 18px 60px #0007}
.stageWrap{width:min(100%,460px);aspect-ratio:9/16;border-radius:13px;overflow:hidden;background:#050506}canvas{width:100%;height:100%;display:block}
.transport{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}.transport input[type=number]{width:70px;padding:9px;background:#fff;color:#111;border-radius:8px;border:0}
.note{font-size:12px;color:var(--muted);line-height:1.45;margin-top:8px}
.controls{display:flex-direction:column;gap:10px}
details{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--panel);margin-bottom:12px}summary{padding:13px 14px;background:var(--panel2);font-weight:800;cursor:pointer}
.grid{padding:13px;display:grid;gap:11px}.grid.two{grid-template-columns:1fr 1fr}.grid label,.side label{display:grid;gap:6px;color:#d7dbe2;font-size:13px}
input[type=file]{width:100%;font-size:12px}input[type=range]{width:100%}
select{padding:8px;background:#0f1217;color:white;border:1px solid var(--line);border-radius:8px}
.toggle{display:flex!important;align-items:center;gap:8px!important}
.rowbar{padding:11px 13px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.rows{padding:11px;display:grid;gap:10px}.row{border:1px solid var(--line);border-radius:13px;padding:10px;background:#101318}.rowhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.sides{display:grid;grid-template-columns:1fr 1fr;gap:8px}.side{background:#191d24;border-radius:10px;padding:9px;display:grid;gap:8px}.side b{font-size:12px}
.small{font-size:11px;color:var(--muted)}
@media(max-width:820px){.studio{grid-template-columns:1fr;padding:8px}.top{padding:9px}.top strong{font-size:14px}.top button{padding:8px 9px;font-size:12px}.grid.two,.sides{grid-template-columns:1fr}.controls{padding-bottom:40px}}
</style>
</head>
<body>
<header class="top">
  <div><strong>Private Runner Studio</strong><span class="badge">AUTO-PRESERVED</span></div>
  <div class="top-actions"><button id="saveBtn">Save State</button><button id="logoutBtn">Logout</button></div>
</header>
<main class="studio">
  <section class="preview">
    <div class="shell"><div class="stageWrap"><canvas id="stage" width="720" height="1280"></canvas></div></div>
    <div class="transport"><button class="primary" id="playBtn">Pause</button><button id="resetBtn">Reset</button><label>Record sec <input id="recordSec" type="number" min="2" max="60" value="15"></label><button id="exportBtn">Export Video</button></div>
    <div class="note">Settings auto-save automatically. Sliders and buttons stay exactly where you leave them on refresh.</div>
  </section>
  <section class="controls">
    <details open><summary>Moving Highway & Camera</summary><div class="grid two">
      <label>Forward speed <input id="speed" type="range" min="0.12" max="0.50" step="0.01" value="0.24"></label>
      <label>Horizon Height <input id="horizon" type="range" min="0.20" max="0.75" step="0.01" value="0.46"></label>
      <label>Top Width <input id="topWidth" type="range" min="0.02" max="0.25" step="0.005" value="0.08"></label>
      <label>Bottom Width (Lion Style) <input id="bottomWidth" type="range" min="0.50" max="1.10" step="0.02" value="0.88"></label>
      <label>Camera Height (Eye View) <input id="camHeight" type="range" min="0.5" max="3.0" step="0.05" value="1.2"></label>
      <label>Pad delay <input id="padDelay" type="range" min="1.10" max="2.60" step="0.05" value="1.75"></label>
      <label>Pad glow base <input id="padThickness" type="range" min="6" max="28" value="12"></label>
      <label>Road style <select id="roadVariant">
        <option value="classic">1. Classic V6 (Lion Video)</option><option value="neonPulse">2. Neon Pulse</option>
        <option value="twinStripe">3. Twin Stripe</option><option value="carbonTrack">4. Carbon Track</option>
        <option value="edgeGlow">5. Edge Glow</option><option value="tripleLane">6. Triple Lane</option>
        <option value="diamondFlow">7. Diamond Flow</option><option value="arcadeGrid">8. Arcade Grid</option>
        <option value="railRunner">9. Rail Runner</option><option value="chevronRush">10. Chevron Rush</option>
      </select></label>
      <label>Background Theme <select id="bgMode">
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
    <details open><summary>5 Fixed Rows + Opponent Boss</summary><div class="rowbar"><span class="small">5 main rows + Stationary Boss standing behind 5th pad.</span></div><div id="rows" class="rows"></div></details>
  </section>
</main>

<template id="rowTemplate">
  <div class="row">
    <div class="rowhead"><strong class="rowtitle">Row</strong><span class="small">fixed</span></div>
    <div class="sides">
      <div class="side">
        <b>LEFT</b>
        <label>Pad <select class="leftColor"><option value="green">Green</option><option value="red">Red</option></select></label>
        <label>PNG <input class="leftInput" type="file" accept="image/png,image/webp,image/jpeg"></label>
        <label class="toggle"><input class="leftRemove" type="checkbox" checked> Auto remove bg</label>
        <label>Size <input class="leftSize" type="range" min="45" max="450" value="95"></label>
      </div>
      <div class="side">
        <b>RIGHT</b>
        <label>Pad <select class="rightColor"><option value="red">Red</option><option value="green">Green</option></select></label>
        <label>PNG <input class="rightInput" type="file" accept="image/png,image/webp,image/jpeg"></label>
        <label class="toggle"><input class="rightRemove" type="checkbox" checked> Auto remove bg</label>
        <label>Size <input class="rightSize" type="range" min="45" max="450" value="95"></label>
      </div>
    </div>
  </div>
</template>

<template id="opponentTemplate">
  <div class="row" style="border-color:#61f0a6">
    <div class="rowhead"><strong style="color:#61f0a6">🔥 Opponent Boss</strong><span class="small">Static behind 5th pad (Appears after 2nd pad)</span></div>
    <div class="side" style="grid-column:span 2">
      <b>OPPONENT CHARACTER</b>
      <label>PNG <input class="oppInput" type="file" accept="image/png,image/webp,image/jpeg"></label>
      <label class="toggle"><input class="oppRemove" type="checkbox" checked> Auto remove bg</label>
      <label>Size <input class="oppSize" type="range" min="50" max="600" value="220"></label>
    </div>
  </div>
</template>

<script>
(()=>{
const canvas=document.getElementById('stage');
const ctx=canvas.getContext('2d');
const W=canvas.width,H=canvas.height;
const $=id=>document.getElementById(id);
let running=true,last=performance.now(),roadTime=0,recorder=null,rowCounter=0;

const state={
  speed:0.24,
  horizon:0.46,
  topWidth:0.08,
  bottomWidth:0.88,
  camHeight:1.2,
  padDelay:1.75,
  padThickness:12,
  roadVariant:'classic',
  bgMode:'black',
  speedLines:false,
  roadShine:true,
  rows:[],
  opponent:{src:null, img:null, removeBg:true, size:220}
};

const bgColors = {
  cleanWhite: ['#ffffff', '#f1f3f5'],
  softSilver: ['#f8f9fa', '#e9ecef'],
  cloudGrey: ['#edf2f7', '#cbd5e1'],
  skyBlueLight: ['#e0f2fe', '#bae6fd'],
  cyanBreeze: ['#ecfeff', '#cffafe'],
  mintFresh: ['#f0fdf4', '#dcfce7'],
  warmVanilla: ['#fefce8', '#fef08a'],
  peachDawn: ['#fff7ed', '#fed7aa'],
  lavenderLight: ['#faf5ff', '#e9d5ff'],
  rosePastel: ['#fff1f2', '#fecdd3'],
  lemonDay: ['#fef9c3', '#fde047'],
  iceWhite: ['#f0f9ff', '#e0f2fe'],
  cyberMintLight: ['#d1fae5', '#a7f3d0'],
  lilacMist: ['#f5f3ff', '#ddd6fe'],
  goldenSand: ['#fef3c7', '#fde68a'],
  black: ['#000000', '#050505'],
  midnight: ['#000000', '#05070c'],
  obsidian: ['#0a0a0f', '#12121a'],
  deepSpace: ['#010204', '#080c14'],
  cyberDark: ['#05020a', '#12071f'],
  matrixBlack: ['#000502', '#021207'],
  carbonDark: ['#09090b', '#18181b'],
  charcoal: ['#111111', '#1f1f1f'],
  gunmetal: ['#15181c', '#262b32'],
  onyx: ['#08080a', '#141418'],
  eclipse: ['#030005', '#0d0214'],
  abyss: ['#02060d', '#07182e'],
  deepNavy: ['#040810', '#0b1322'],
  midnightBlue: ['#030712', '#0f172a'],
  slateDark: ['#0f172a', '#1e293b'],
  asphalt: ['#18181b', '#27272a'],
  gravel: ['#202025', '#32323b'],
  steelDark: ['#1e293b', '#334155'],
  ironDark: ['#111827', '#1f2937'],
  phantom: ['#030303', '#0d0d0d'],
  shadow: ['#09090b', '#18181b'],
  vampire: ['#140305', '#2b060b'],
  crimsonDark: ['#1a0508', '#380b12'],
  bloodNight: ['#1f0408', '#450912'],
  neonPurpleDark: ['#10031c', '#24073d'],
  violetNight: ['#0d0214', '#1c052e'],
  electricBlueDark: ['#020d1a', '#072240'],
  cyanDark: ['#02121a', '#073142'],
  emeraldDark: ['#021a0f', '#073d24'],
  matrixGreen: ['#021205', '#073010'],
  toxicGreen: ['#051a02', '#123d07'],
  amberDark: ['#1a1002', '#3d2707'],
  sunsetDark: ['#1c0a02', '#401807'],
  laserRed: ['#1c0202', '#400707'],
  plasmaDark: ['#14021a', '#2d073d'],
  reactor: ['#1a1202', '#3d2c07'],
  synthwave: ['#12031c', '#2b0840'],
  retrowave: ['#1a0314', '#3d072f'],
  cyberpunkDark: ['#02141a', '#073845'],
  gotham: ['#0a0b0d', '#16191f'],
  underworld: ['#0d0202', '#210505'],
  infernoDark: ['#1c0802', '#421405'],
  magmaDark: ['#1f0b02', '#471a05'],
  voidBlue: ['#010914', '#051f40'],
  voidPurple: ['#0c0114', '#270540'],
  voidGreen: ['#011406', '#05401b'],
  voidRed: ['#140101', '#400505'],
  voidGold: ['#141101', '#403605'],
  cosmicDark: ['#08040d', '#140822'],
  nebulaDark: ['#040a14', '#08172c'],
  quantumVoid: ['#020508', '#061320'],
  ultimateDark: ['#050508', '#101017']
};

function autoSaveSliders(){
  const s = {
    speed: state.speed,
    horizon: state.horizon,
    topWidth: state.topWidth,
    bottomWidth: state.bottomWidth,
    camHeight: state.camHeight,
    padDelay: state.padDelay,
    padThickness: state.padThickness,
    roadVariant: state.roadVariant,
    bgMode: state.bgMode,
    speedLines: state.speedLines,
    roadShine: state.roadShine,
    oppSize: state.opponent.size,
    oppRemove: state.opponent.removeBg
  };
  localStorage.setItem('runner_auto_sliders_v1', JSON.stringify(s));
}

function restoreAutoSliders(){
  try{
    const raw = localStorage.getItem('runner_auto_sliders_v1');
    if(!raw) return;
    const s = JSON.parse(raw);
    ['speed','horizon','topWidth','bottomWidth','camHeight','padDelay','padThickness'].forEach(id=>{
      if(s[id] !== undefined && $(id)){
        state[id] = Number(s[id]);
        $(id).value = s[id];
      }
    });
    if(s.roadVariant && $('roadVariant')){ state.roadVariant = s.roadVariant; $('roadVariant').value = s.roadVariant; }
    if(s.bgMode && $('bgMode')){ state.bgMode = s.bgMode; $('bgMode').value = s.bgMode; }
    if(s.speedLines !== undefined && $('speedLines')){ state.speedLines = Boolean(s.speedLines); $('speedLines').checked = state.speedLines; }
    if(s.roadShine !== undefined && $('roadShine')){ state.roadShine = Boolean(s.roadShine); $('roadShine').checked = state.roadShine; }
    if(s.oppSize !== undefined){ state.opponent.size = Number(s.oppSize); }
    if(s.oppRemove !== undefined){ state.opponent.removeBg = Boolean(s.oppRemove); }
  }catch(e){}
}

function readFile(file){return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(file)})}
function dataToImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src})}
function processImageDataUrl(dataUrl, removeBg){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      if(!removeBg){resolve(dataUrl);return}
      const c=document.createElement('canvas');
      c.width=img.width; c.height=img.height;
      const cx=c.getContext('2d',{willReadFrequently:true});
      cx.drawImage(img,0,0);
      const id=cx.getImageData(0,0,c.width,c.height);
      const d=id.data;
      const sample=(x,y)=>{const i=(y*c.width+x)*4;return[d[i],d[i+1],d[i+2]]};
      const pts=[[0,0],[c.width-1,0],[0,c.height-1],[c.width-1,c.height-1],[Math.floor(c.width/2),0],[0,Math.floor(c.height/2)],[c.width-1,Math.floor(c.height/2)],[Math.floor(c.width/2),c.height-1]];
      let sr=0,sg=0,sb=0;
      pts.forEach(([x,y])=>{const [r,g,b]=sample(x,y);sr+=r;sg+=g;sb+=b;});
      const br=sr/pts.length,bg=sg/pts.length,bb=sb/pts.length;
      for(let i=0;i<d.length;i+=4){
        const dr=d[i]-br,dg=d[i+1]-bg,db=d[i+2]-bb;
        const dist=Math.sqrt(dr*dr+dg*dg+db*db);
        const bright=(d[i]+d[i+1]+d[i+2])/3;
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
async function dataToProcessedImage(src, removeBg){return dataToImage(await processImageDataUrl(src, removeBg))}

function bindRange(id,key){
  $(id).addEventListener('input', e=>{
    state[key]=Number(e.target.value);
    autoSaveSliders();
  });
}
['speed','horizon','topWidth','bottomWidth','camHeight','padDelay','padThickness'].forEach(id=>bindRange(id,id));
$('roadVariant').onchange=e=>{state.roadVariant=e.target.value; autoSaveSliders();};
$('speedLines').onchange=e=>{state.speedLines=e.target.checked; autoSaveSliders();};
$('roadShine').onchange=e=>{state.roadShine=e.target.checked; autoSaveSliders();};
$('bgMode').onchange=e=>{state.bgMode=e.target.value; autoSaveSliders();};

function makeId(){return (crypto.randomUUID&&crypto.randomUUID()) || String(Date.now()+Math.random())}
function addRow(saved={}){
  const row={
    id:makeId(),
    leftColor:saved.leftColor||'green', rightColor:saved.rightColor||'red',
    leftSize:saved.leftSize||95, rightSize:saved.rightSize||95,
    leftSrc:saved.leftSrc||null, rightSrc:saved.rightSrc||null,
    leftImg:null, rightImg:null,
    leftRemove:saved.leftRemove!==false, rightRemove:saved.rightRemove!==false
  };
  state.rows.push(row);
  const el=$('rowTemplate').content.firstElementChild.cloneNode(true);
  el.dataset.id=row.id;
  el.querySelector('.rowtitle').textContent='Row '+(++rowCounter);
  el.querySelector('.leftColor').value=row.leftColor;
  el.querySelector('.rightColor').value=row.rightColor;
  el.querySelector('.leftSize').value=row.leftSize;
  el.querySelector('.rightSize').value=row.rightSize;
  el.querySelector('.leftRemove').checked=row.leftRemove;
  el.querySelector('.rightRemove').checked=row.rightRemove;
  el.querySelector('.leftColor').onchange=e=>row.leftColor=e.target.value;
  el.querySelector('.rightColor').onchange=e=>row.rightColor=e.target.value;
  el.querySelector('.leftSize').oninput=e=>row.leftSize=Number(e.target.value);
  el.querySelector('.rightSize').oninput=e=>row.rightSize=Number(e.target.value);
  el.querySelector('.leftRemove').onchange=async e=>{row.leftRemove=e.target.checked;if(row.leftSrc)row.leftImg=await dataToProcessedImage(row.leftSrc,row.leftRemove)};
  el.querySelector('.rightRemove').onchange=async e=>{row.rightRemove=e.target.checked;if(row.rightSrc)row.rightImg=await dataToProcessedImage(row.rightSrc,row.rightRemove)};
  el.querySelector('.leftInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;row.leftSrc=await readFile(f);row.leftImg=await dataToProcessedImage(row.leftSrc,row.leftRemove)};
  el.querySelector('.rightInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;row.rightSrc=await readFile(f);row.rightImg=await dataToProcessedImage(row.rightSrc,row.rightRemove)};
  $('rows').appendChild(el);
  if(row.leftSrc)dataToProcessedImage(row.leftSrc,row.leftRemove).then(im=>row.leftImg=im);
  if(row.rightSrc)dataToProcessedImage(row.rightSrc,row.rightRemove).then(im=>row.rightImg=im);
}
for(let i=0;i<5;i++) addRow({leftColor:i%2?'red':'green', rightColor:i%2?'green':'red'});

const oppEl=$('opponentTemplate').content.firstElementChild.cloneNode(true);
oppEl.querySelector('.oppSize').value=state.opponent.size;
oppEl.querySelector('.oppSize').oninput=e=>{state.opponent.size=Number(e.target.value); autoSaveSliders();};
oppEl.querySelector('.oppRemove').onchange=async e=>{state.opponent.removeBg=e.target.checked; autoSaveSliders(); if(state.opponent.src)state.opponent.img=await dataToProcessedImage(state.opponent.src,state.opponent.removeBg)};
oppEl.querySelector('.oppInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;state.opponent.src=await readFile(f);state.opponent.img=await dataToProcessedImage(state.opponent.src,state.opponent.removeBg)};
$('rows').appendChild(oppEl);

// Automatically restore sliders immediately after building elements
restoreAutoSliders();
if(oppEl.querySelector('.oppSize')) oppEl.querySelector('.oppSize').value = state.opponent.size;
if(oppEl.querySelector('.oppRemove')) oppEl.querySelector('.oppRemove').checked = state.opponent.removeBg;

const TRACK_Z_LENGTH=220;
const BASE_TRACK_Z_LENGTH=125;
const TRACK_MOTION_SCALE=BASE_TRACK_Z_LENGTH/TRACK_Z_LENGTH;

function roadBoundsAtZ(z){
  const t=Math.max(0,Math.min(1,z));
  const HORIZON_Y=H*state.horizon;
  const TOP_HALF=W*state.topWidth;
  const BOTTOM_HALF=W*(state.bottomWidth || 0.88);

  const zWorld = (1.0 - t) * 11.5 + 0.85;
  const scale = 1.0 / (zWorld * state.camHeight);
  const minScale = 1.0 / (12.35 * state.camHeight);
  const maxScale = 1.0 / (0.85 * state.camHeight);
  const depth = (scale - minScale) / (maxScale - minScale);

  const y = HORIZON_Y + (H - HORIZON_Y) * depth;
  const half = TOP_HALF + (BOTTOM_HALF - TOP_HALF) * depth;

  return {e:depth, y, l:W/2-half, r:W/2+half, half};
}
function lerp(a,b,t){return a+(b-a)*t}
function drawPoly(pts, fill){ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill()}
function quad(a,b){return [[a.l,a.y],[a.r,a.y],[b.r,b.y],[b.l,b.y]]}
function fillRoadBase(topColor,bottomColor){
  const top=roadBoundsAtZ(0), bottom=roadBoundsAtZ(1);
  const g=ctx.createLinearGradient(0,top.y,0,H);
  g.addColorStop(0,topColor);
  g.addColorStop(1,bottomColor);
  drawPoly([[top.l,top.y],[top.r,top.y],[bottom.r,H],[bottom.l,H]],g);
  return {top,bottom};
}
function drawEdgeStripSeries(count,speedFactor,widthA,widthB,colorA,colorB){
  for(let i=0;i<count;i++){
    const z0=(i/count + roadTime*state.speed*TRACK_MOTION_SCALE*speedFactor)%1;
    const z1=z0+.065;
    if(z1>1) continue;
    const a=roadBoundsAtZ(z0), b=roadBoundsAtZ(z1);
    const wa=widthA+widthB*a.e, wb=widthA+widthB*b.e;
    const c=i%2===0?colorA:colorB;
    drawPoly([[a.l,a.y],[a.l+wa,a.y],[b.l+wb,b.y],[b.l,b.y]],c);
    drawPoly([[a.r-wa,a.y],[a.r,a.y],[b.r,b.y],[b.r-wb,b.y]],c);
  }
}
function drawCenterDashed(offsetRatio,color,widthBase,widthGrow,len,density,speedFactor,minZ){
  for(let i=0;i<density;i++){
    const z0=(i/density + roadTime*state.speed*TRACK_MOTION_SCALE*speedFactor)%1;
    const z1=z0+len;
    if(z1>1 || z0<minZ) continue;
    const a=roadBoundsAtZ(z0), b=roadBoundsAtZ(z1);
    const x0=W/2+a.half*offsetRatio;
    const x1=W/2+b.half*offsetRatio;
    ctx.save();
    ctx.strokeStyle=color;
    ctx.lineCap='round';
    ctx.lineWidth=widthBase+widthGrow*a.e;
    ctx.beginPath();
    ctx.moveTo(x0,a.y);
    ctx.lineTo(x1,b.y);
    ctx.stroke();
    ctx.restore();
  }
}
function drawCenterPulseDots(offsetRatio,color,sizeBase,sizeGrow,count,speedFactor,minZ){
  for(let i=0;i<count;i++){
    const z=(i/count + roadTime*state.speed*TRACK_MOTION_SCALE*speedFactor)%1;
    if(z<minZ) continue;
    const p=roadBoundsAtZ(z);
    const x=W/2+p.half*offsetRatio;
    ctx.save();
    ctx.fillStyle=color;
    ctx.shadowColor=color;
    ctx.shadowBlur=10+18*p.e;
    ctx.beginPath();
    ctx.arc(x,p.y,sizeBase+sizeGrow*p.e,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }
}
function drawRoadTexture(strength){
  ctx.save();
  for(let i=0;i<9;i++){
    const z=(i*.13 + roadTime*state.speed*TRACK_MOTION_SCALE*1.08)%1;
    if(z<.15) continue;
    const a=roadBoundsAtZ(z), b=roadBoundsAtZ(Math.min(1,z+.06));
    const alpha=.012+strength*a.e;
    drawPoly(quad(a,b),'rgba(255,255,255,'+alpha+')');
  }
  ctx.restore();
}
function drawRoadShineSeries(color,alphaMul){
  ctx.save();ctx.strokeStyle=color;ctx.lineCap='round';
  for(let i=0;i<7;i++){
    const z=(i*.16 + roadTime*state.speed*TRACK_MOTION_SCALE*1.2)%1;
    if(z<.22) continue;
    const a=roadBoundsAtZ(z), b=roadBoundsAtZ(Math.min(1,z+.09));
    const xA=W/2 + (i%2?-1:1)*a.half*(.32+.18*(i%3));
    const xB=W/2 + (i%2?-1:1)*b.half*(.32+.18*(i%3));
    ctx.globalAlpha=(.16+.45*z)*alphaMul;ctx.lineWidth=2+5*z;
    ctx.beginPath();ctx.moveTo(xA,a.y);ctx.lineTo(xB,b.y);ctx.stroke();
  }
  ctx.restore();
}
function drawSideRails(color){
  ctx.save();
  ctx.strokeStyle=color;
  ctx.lineCap='round';
  for(let i=0;i<10;i++){
    const z0=(i/10 + roadTime*state.speed*TRACK_MOTION_SCALE*.84)%1;
    const z1=z0+.075;
    if(z1>1 || z0<.06) continue;
    const a=roadBoundsAtZ(z0), b=roadBoundsAtZ(z1);
    ctx.globalAlpha=.14+.42*a.e;
    ctx.lineWidth=2+6*a.e;
    ctx.beginPath();
    ctx.moveTo(a.l+12+a.e*8,a.y);
    ctx.lineTo(b.l+12+b.e*8,b.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(a.r-12-a.e*8,a.y);
    ctx.lineTo(b.r-12-b.e*8,b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBackground(){
  const pair = bgColors[state.bgMode] || ['#000000', '#050505'];
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pair[0]);
  g.addColorStop(1, pair[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if(state.speedLines){
    ctx.save();ctx.strokeStyle='rgba(255,255,255,.38)';ctx.lineCap='round';
    for(let i=0;i<12;i++){
      const sideDir=i%2===0?-1:1;
      const phase=(i*.11 + roadTime*state.speed*TRACK_MOTION_SCALE*.62)%1;
      const y=(H*state.horizon)-250 + phase*350;
      const x=sideDir<0 ? 40+phase*80 : W-40-phase*80;
      const len=24+phase*80;
      ctx.globalAlpha=.08+.34*phase;ctx.lineWidth=2+3*phase;
      ctx.beginPath();ctx.moveTo(x,y-len*.55);ctx.lineTo(x+sideDir*14*phase,y+len*.45);ctx.stroke();
    }
    ctx.restore();
  }
}

function drawRoadClassic(){
  fillRoadBase('#7c8591','#454c57');
  drawRoadTexture(.028);
  drawEdgeStripSeries(18,.85,5,28,'#ff1f32','#ffffff');
  if(state.roadShine) drawRoadShineSeries('rgba(255,255,255,.38)',1.0);
}
function drawRoadNeonPulse(){
  fillRoadBase('#394458','#171d27');
  drawRoadTexture(.030);
  drawEdgeStripSeries(18,.82,4,20,'#ff2244','#ffffff');
  drawCenterDashed(-.04,'rgba(110,255,255,.95)',2,5,.08,11,.88,.15);
  drawCenterDashed(.04,'rgba(110,255,255,.95)',2,5,.08,11,.88,.15);
  drawCenterPulseDots(0,'rgba(255,74,201,.9)',2,6,9,1.12,.18);
  if(state.roadShine) drawRoadShineSeries('rgba(120,255,255,.55)',1.15);
}
function drawRoadTwinStripe(){
  fillRoadBase('#4a5665','#202731');
  drawRoadTexture(.026);
  drawEdgeStripSeries(18,.82,4,20,'#ffffff','#b6bcc6');
  drawCenterDashed(-.04,'rgba(255,216,82,.98)',2,5,.10,10,.84,.14);
  drawCenterDashed(.04,'rgba(255,216,82,.98)',2,5,.10,10,.84,.14);
  drawCenterDashed(-.22,'rgba(255,255,255,.45)',1.5,3.2,.06,8,.92,.22);
  drawCenterDashed(.22,'rgba(255,255,255,.45)',1.5,3.2,.06,8,.92,.22);
  if(state.roadShine) drawRoadShineSeries('rgba(255,255,255,.28)',.85);
}
function drawRoadCarbonTrack(){
  fillRoadBase('#323b49','#151c24');
  for(let i=0;i<11;i++){
    const z0=(i/11 + roadTime*state.speed*TRACK_MOTION_SCALE*.62)%1;
    const z1=z0+.075;
    if(z1>1 || z0<.12) continue;
    const a=roadBoundsAtZ(z0), b=roadBoundsAtZ(z1);
    const insetA=a.half*.08, insetB=b.half*.08;
    drawPoly([[a.l+insetA,a.y],[a.r-insetA,a.y],[b.r-insetB,b.y],[b.l+insetB,b.y]], i%2===0?'rgba(255,255,255,.05)':'rgba(0,0,0,.09)');
  }
  drawEdgeStripSeries(18,.78,4,18,'#ff8f29','#ffffff');
  drawCenterDashed(0,'rgba(255,171,85,.75)',2,4,.07,10,.90,.18);
  if(state.roadShine) drawRoadShineSeries('rgba(255,186,120,.22)',.75);
}
function drawRoadEdgeGlow(){
  fillRoadBase('#3a4552','#192028');
  drawRoadTexture(.022);
  drawEdgeStripSeries(18,.84,4,20,'rgba(45,255,128,.95)','rgba(255,62,86,.95)');
  drawSideRails('rgba(255,255,255,.16)');
  drawCenterDashed(-.17,'rgba(255,255,255,.36)',1.5,3,.08,9,.82,.22);
  drawCenterDashed(.17,'rgba(255,255,255,.36)',1.5,3,.08,9,.82,.22);
  if(state.roadShine) drawRoadShineSeries('rgba(110,255,170,.32)',.85);
}
function drawRoadTripleLane(){
  fillRoadBase('#46505c','#1f262f');
  drawRoadTexture(.024);
  drawEdgeStripSeries(18,.82,4,20,'#ff2333','#ffffff');
  drawCenterDashed(-.26,'rgba(255,255,255,.85)',2,4,.085,10,.82,.14);
  drawCenterDashed(0,'rgba(255,255,255,.85)',2,4,.085,10,.82,.14);
  drawCenterDashed(.26,'rgba(255,255,255,.85)',2,4,.085,10,.82,.14);
  if(state.roadShine) drawRoadShineSeries('rgba(255,255,255,.26)',.72);
}
function drawDiamondFlow(){
  fillRoadBase('#414b59','#1c232c');
  drawRoadTexture(.020);
  drawEdgeStripSeries(18,.82,4,20,'#ff3347','#ffffff');
  for(let i=0;i<8;i++){
    const z=(i/8 + roadTime*state.speed*TRACK_MOTION_SCALE*.88)%1;
    if(z<.15 || z>.94) continue;
    const a=roadBoundsAtZ(z), b=roadBoundsAtZ(Math.min(1,z+.06));
    const midY=(a.y+b.y)/2;
    const w=12+a.e*56;
    const h=6+a.e*32;
    ctx.save();
    ctx.fillStyle='rgba(255,255,255,'+(.14+.32*a.e)+')';
    ctx.beginPath();
    ctx.moveTo(W/2,midY-h);
    ctx.lineTo(W/2+w,midY);
    ctx.lineTo(W/2,midY+h);
    ctx.lineTo(W/2-w,midY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  if(state.roadShine) drawRoadShineSeries('rgba(255,255,255,.24)',.76);
}
function drawRoadArcadeGrid(){
  fillRoadBase('#434e5e','#1d242e');
  for(let i=0;i<12;i++){
    const z0=(i/12 + roadTime*state.speed*TRACK_MOTION_SCALE*.78)%1;
    const z1=z0+.065;
    if(z1>1 || z0<.15) continue;
    const a=roadBoundsAtZ(z0), b=roadBoundsAtZ(z1);
    drawPoly(quad(a,b),'rgba(255,255,255,'+(.018+.045*a.e)+')');
    const parts=4;
    for(let j=1;j<parts;j++){
      const x0=lerp(a.l,a.r,j/parts), x1=lerp(b.l,b.r,j/parts);
      ctx.save();
      ctx.strokeStyle='rgba(255,255,255,'+(.05+.14*a.e)+')';
      ctx.lineWidth=1.2+2.4*a.e;
      ctx.beginPath();
      ctx.moveTo(x0,a.y);
      ctx.lineTo(x1,b.y);
      ctx.stroke();
      ctx.restore();
    }
  }
  drawEdgeStripSeries(18,.80,4,20,'#ffffff','#7af5ff');
  if(state.roadShine) drawRoadShineSeries('rgba(170,245,255,.30)',.80);
}
function drawRoadRailRunner(){
  fillRoadBase('#3e4856','#1a212a');
  drawRoadTexture(.018);
  drawEdgeStripSeries(18,.76,4,18,'#ff2f45','#ffffff');
  drawSideRails('rgba(255,255,255,.52)');
  drawCenterDashed(-.10,'rgba(82,190,255,.78)',2,4,.07,10,.95,.16);
  drawCenterDashed(.10,'rgba(82,190,255,.78)',2,4,.07,10,.95,.16);
  drawCenterPulseDots(0,'rgba(255,255,255,.75)',1.6,4,10,1.04,.18);
  if(state.roadShine) drawRoadShineSeries('rgba(140,220,255,.24)',.72);
}
function drawRoadChevronRush(){
  fillRoadBase('#424b59','#1c232c');
  drawRoadTexture(.020);
  drawEdgeStripSeries(18,.82,4,20,'#ff3149','#ffffff');
  for(let i=0;i<10;i++){
    const z=(i/10 + roadTime*state.speed*TRACK_MOTION_SCALE*.92)%1;
    if(z<.15 || z>.96) continue;
    const p=roadBoundsAtZ(z);
    const span=20+p.e*95;
    const lift=10+p.e*44;
    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,'+(.22+.42*p.e)+')';
    ctx.lineWidth=2+5*p.e;
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(W/2-span,p.y-lift);
    ctx.lineTo(W/2,p.y);
    ctx.lineTo(W/2+span,p.y-lift);
    ctx.stroke();
    ctx.restore();
  }
  if(state.roadShine) drawRoadShineSeries('rgba(255,255,255,.22)',.70);
}
function drawRoad(){
  const fn={
    classic:drawRoadClassic,
    neonPulse:drawRoadNeonPulse,
    twinStripe:drawRoadTwinStripe,
    carbonTrack:drawRoadCarbonTrack,
    edgeGlow:drawRoadEdgeGlow,
    tripleLane:drawRoadTripleLane,
    diamondFlow:drawDiamondFlow,
    arcadeGrid:drawRoadArcadeGrid,
    railRunner:drawRoadRailRunner,
    chevronRush:drawRoadChevronRush
  }[state.roadVariant] || drawRoadClassic;
  fn();
}

function drawRaisedPad(z, side, color){
  const p=roadBoundsAtZ(z), e=p.e;
  const laneCenter=side==='left' ? W/2-p.half*.48 : W/2+p.half*.48;
  const width=Math.max(16,p.half*.82);
  const height=Math.max(6,width*.32);
  const baseY=p.y-3;
  const topY=baseY-height;
  const rgb=color==='red'?'255,50,58':'42,255,132';
  const dark=color==='red'?'118,23,28':'15,104,54';
  ctx.save();ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(laneCenter,baseY+5,width*.44,5+8*e,0,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.save();ctx.fillStyle='rgba('+dark+',.76)';ctx.beginPath();ctx.roundRect(laneCenter-width/2,baseY-state.padThickness*.45,width,state.padThickness,5);ctx.fill();ctx.restore();
  const g=ctx.createLinearGradient(0,baseY,0,topY);
  g.addColorStop(0,'rgba('+rgb+',.96)');
  g.addColorStop(.38,'rgba('+rgb+',.78)');
  g.addColorStop(.76,'rgba('+rgb+',.30)');
  g.addColorStop(1,'rgba('+rgb+',0)');
  ctx.save();ctx.shadowColor='rgb('+rgb+')';ctx.shadowBlur=14+22*e;ctx.fillStyle=g;
  ctx.beginPath();ctx.roundRect(laneCenter-width/2,topY,width,height,7);ctx.fill();ctx.restore();
  ctx.save();ctx.strokeStyle='rgba('+rgb+',.96)';ctx.lineWidth=2+1.5*e;ctx.beginPath();ctx.moveTo(laneCenter-width*.47,baseY-1);ctx.lineTo(laneCenter+width*.47,baseY-1);ctx.stroke();ctx.restore();
  return {center:[laneCenter,baseY-height*.43],baseY,width,height,e};
}

function drawImageFit(im, x, y, boxW, boxH, anchor='bottom'){
  if(!im) return;
  const iw=im.naturalWidth||im.width, ih=im.naturalHeight||im.height;
  const scale=Math.min(boxW/iw, boxH/ih);
  const dw=iw*scale, dh=ih*scale;
  const dx=x-dw/2;
  const dy=anchor==='center' ? y-dh/2 : y-dh;
  ctx.drawImage(im,dx,dy,dw,dh);
}

function drawRows(){
  const initialDelay=.75;
  state.rows.slice(0,5).forEach((row,i)=>{
    const elapsed=roadTime-initialDelay-i*state.padDelay;
    const z=elapsed*state.speed*1.28*TRACK_MOTION_SCALE;
    if(z<0 || z>1.03) return;
    const zz=Math.min(1,z);
    const left=drawRaisedPad(zz,'left',row.leftColor);
    const right=drawRaisedPad(zz,'right',row.rightColor);
    const pngScale=.18+0.95*left.e;
    const leftSize=Math.min(row.leftSize*pngScale,left.width*.92);
    const rightSize=Math.min(row.rightSize*pngScale,right.width*.92);
    if(row.leftImg) drawImageFit(row.leftImg,left.center[0],left.baseY-5,leftSize,leftSize,'bottom');
    if(row.rightImg) drawImageFit(row.rightImg,right.center[0],right.baseY-5,rightSize,rightSize,'bottom');
  });

  const secondPadFinishTime = initialDelay + 1 * state.padDelay;

  if(roadTime >= secondPadFinishTime && state.opponent.img){
    const p = roadBoundsAtZ(0.72);
    const oppSize = state.opponent.size * 0.75;
    drawImageFit(state.opponent.img, W/2, p.y + 4, oppSize, oppSize, 'bottom');
  }
}

function frame(now){
  const dt=Math.min(0.05,(now-last)/1000);
  last=now;
  if(running) roadTime+=dt;
  drawBackground();
  drawRoad();
  drawRows();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

$('playBtn').onclick=()=>{running=!running;$('playBtn').textContent=running?'Pause':'Play'};
$('resetBtn').onclick=()=>roadTime=0;
$('saveBtn').onclick=()=>{
  autoSaveSliders();
  alert('Settings saved successfully!');
};
$('logoutBtn').onclick=async()=>{await fetch('/api/logout',{method:'POST'});location.href='/'};

$('exportBtn').onclick = () => {
  if (recorder) return;
  const sec = Math.max(2, Math.min(60, +$('recordSec').value || 15));
  const stream = canvas.captureStream(60);
  let mime = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm;codecs=vp8';
  if (!MediaRecorder.isTypeSupported(mime)) mime = 'video/webm';
  const chunks = [];
  recorder = new MediaRecorder(stream, { 
    mimeType: mime, 
    videoBitsPerSecond: 20000000 
  });
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data) };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'runner-hd-video.webm';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    recorder = null;
    $('exportBtn').textContent = 'Export Video';
  };
  recorder.start();
  $('exportBtn').textContent = 'Recording HD...';
  setTimeout(() => { if (recorder && recorder.state !== 'inactive') recorder.stop(); }, sec * 1000);
};
})();
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if(url.pathname === '/api/login'){
    if(req.method !== 'POST') return send(res, 405, 'Method not allowed');
    let b = '';
    req.on('data', chunk => b += chunk);
    req.on('end', () => {
      try {
        const dat = JSON.parse(b);
        if(safeEqual(dat.password, APP_PASSWORD)){
          const exp = Date.now() + SESSION_MS;
          const nonce = crypto.randomBytes(12).toString('hex');
          const payload = `${exp}.${nonce}`;
          const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
          const token = `${payload}.${sig}`;
          res.writeHead(200, {
            'Set-Cookie': `runner_session=${token}; Path=/; HttpOnly; SameSite=Lax`,
            'Content-Type': 'text/plain'
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

server.listen(PORT, () => console.log('Server running on port ' + PORT));
