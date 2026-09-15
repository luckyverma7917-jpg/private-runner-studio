const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const APP_PASSWORD = process.env.APP_PASSWORD || 'change-me-now';
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const IS_PROD = process.env.NODE_ENV === 'production';
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
function makeSession(){
  const exp=Date.now()+SESSION_MS;
  const nonce=crypto.randomBytes(12).toString('hex');
  const payload=`${exp}.${nonce}`;
  const sig=crypto.createHmac('sha256',SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
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
function readJson(req){
  return new Promise((resolve,reject)=>{
    let b='';
    req.on('data',c=>{b+=c; if(b.length>1e6){reject(new Error('too large')); req.destroy();}});
    req.on('end',()=>{try{resolve(JSON.parse(b||'{}'))}catch(e){reject(e)}});
    req.on('error',reject);
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
<title>Private Runner Studio V8 Front Slider Fixed</title>
<style>
:root{--bg:#0b0d10;--panel:#15181e;--panel2:#1b1f27;--text:#f6f8fb;--muted:#9ca5b2;--line:#2b303a;--accent:#61f0a6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.top{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 14px;background:#0b0d10ee;border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}
.top strong{font-size:18px}.badge{font-size:11px;color:#07110c;background:var(--accent);border-radius:99px;padding:4px 7px;margin-left:6px}
.top-actions{display:flex;gap:7px}.top button,.transport button,.rowbar button{border:1px solid var(--line);background:#222731;color:white;border-radius:11px;padding:9px 12px;font:inherit}
.top .primary,.transport .primary{background:var(--accent);color:#07110c;border-color:transparent;font-weight:800}
.studio{max-width:1220px;margin:auto;padding:14px;display:grid;grid-template-columns:minmax(320px,660px) minmax(300px,1fr);gap:16px}
.preview{min-width:0}.shell{background:#050607;border:1px solid var(--line);border-radius:18px;padding:7px;display:flex;justify-content:center;box-shadow:0 18px 60px #0007}
.stageWrap{width:min(100%,460px);aspect-ratio:9/16;border-radius:13px;overflow:hidden;background:#08ce78}canvas{width:100%;height:100%;display:block}
.transport{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}.transport input[type=number]{width:70px;padding:9px;background:#fff;color:#111;border-radius:8px;border:0}
.note{font-size:12px;color:var(--muted);line-height:1.45;margin-top:8px}
.controls{display:flex;flex-direction:column;gap:10px}
details{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--panel)}summary{padding:13px 14px;background:var(--panel2);font-weight:800;cursor:pointer}
.grid{padding:13px;display:grid;gap:11px}.grid.two{grid-template-columns:1fr 1fr}.grid label,.side label{display:grid;gap:6px;color:#d7dbe2;font-size:13px}
input[type=file]{width:100%;font-size:12px}input[type=range]{width:100%}
select{padding:8px;background:#0f1217;color:white;border:1px solid var(--line);border-radius:8px}
.toggle{display:flex!important;align-items:center;gap:8px!important}
.rowbar{padding:11px 13px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.rows{padding:11px;display:grid;gap:10px}.row{border:1px solid var(--line);border-radius:13px;padding:10px;background:#101318}.rowhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.remove{background:#312126;color:#ffb8c0;border:1px solid #58313a;border-radius:9px;padding:7px 9px}.sides{display:grid;grid-template-columns:1fr 1fr;gap:8px}.side{background:#191d24;border-radius:10px;padding:9px;display:grid;gap:8px}.side b{font-size:12px}
.small{font-size:11px;color:var(--muted)}
@media(max-width:820px){.studio{grid-template-columns:1fr;padding:8px}.top{padding:9px}.top strong{font-size:14px}.top button{padding:8px 9px;font-size:12px}.grid.two,.sides{grid-template-columns:1fr}.controls{padding-bottom:40px}}
</style>
</head>
<body>
<header class="top">
  <div><strong>Private Runner Studio</strong><span class="badge">V8 FRONT SLIDER FIXED + 5 HIGHWAYS</span></div>
  <div class="top-actions"><button id="saveBtn">Save</button><button id="loadBtn">Load</button><button id="logoutBtn">Logout</button></div>
</header>
<main class="studio">
  <section class="preview">
    <div class="shell"><div class="stageWrap"><canvas id="stage" width="720" height="1280"></canvas></div></div>
    <div class="transport"><button class="primary" id="playBtn">Pause</button><button id="resetBtn">Reset</button><label>Record sec <input id="recordSec" type="number" min="2" max="60" value="15"></label><button id="exportBtn">Export Video</button></div>
    <div class="note">V8 Front Slider Fixed: same black background, same 5 fixed pad rows, same standing pads, and the same 5 highway variants. Low Eye-level horizon = straighter front view. High Eye-level horizon = slightly higher view, while the road stays long.</div>
  </section>
  <section class="controls">
    <details open><summary>Moving Highway / Camera</summary><div class="grid two"><label>Highway <select id="roadVariant"><option value="v1" selected>Highway 1 / Original V6 Front</option><option value="v2">Highway 2 / Dark Asphalt</option><option value="v3">Highway 3 / Retro Track</option><option value="v4">Highway 4 / Neon Edge</option><option value="v5">Highway 5 / Clean Silver</option></select></label><label>Speed <input id="speed" type="range" min="0.12" max="0.42" step="0.01" value="0.24"></label><label>Road width <input id="roadWidth" type="range" min="0.94" max="1.12" step="0.01" value="1.00"></label><label>Eye-level horizon <input id="horizon" type="range" min="760" max="1240" value="820"></label><label>Perspective <input id="perspectivePower" type="range" min="0.58" max="0.96" step="0.02" value="0.88"></label><label>Pad delay <input id="padDelay" type="range" min="1.20" max="2.60" step="0.05" value="1.75"></label><label>Pad glow base <input id="padThickness" type="range" min="6" max="28" value="12"></label><label>Background <select id="bgMode"><option value="black" selected>Reference black</option><option value="green">Green</option></select></label><label class="toggle"><input id="speedLines" type="checkbox" checked> Motion streaks</label><label class="toggle"><input id="roadShine" type="checkbox" checked> Road highlights</label></div></details>
    <details open><summary>5 Fixed Choice Rows / Standing Pads</summary><div class="rowbar"><span class="small">Exactly 5 rows. No extra rows will spawn. Increase Pad delay above if you want more time between choices.</span></div><div id="rows" class="rows"></div></details>
  </section>
</main>

<template id="rowTemplate">
  <div class="row">
    <div class="rowhead"><strong class="rowtitle">Row</strong><span class="small">fixed</span></div>
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
const canvas=document.getElementById('stage');
const ctx=canvas.getContext('2d');
const W=canvas.width,H=canvas.height;
const $=id=>document.getElementById(id);
let running=true,last=performance.now(),roadTime=0,recorder=null,rowCounter=0;

const state={
  speed:0.24,
  roadWidth:1.00,
  horizon:820,
  perspectivePower:0.88,
  padDelay:1.75,
  padThickness:12,
  bgMode:'black',
  roadVariant:'v1',
  speedLines:true,
  roadShine:true,
  rows:[]
};

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
function bindRange(id,key){$(id).addEventListener('input',e=>state[key]=Number(e.target.value))}
['speed','roadWidth','horizon','perspectivePower','padDelay','padThickness'].forEach(id=>bindRange(id,id));
$('speedLines').onchange=e=>state.speedLines=e.target.checked;
$('roadShine').onchange=e=>state.roadShine=e.target.checked;
$('bgMode').onchange=e=>state.bgMode=e.target.value;
$('roadVariant').onchange=e=>state.roadVariant=e.target.value;

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
function renumber(){rowCounter=0;[...document.querySelectorAll('.row')].forEach(el=>el.querySelector('.rowtitle').textContent='Row '+(++rowCounter))}
for(let i=0;i<5;i++) addRow({leftColor:i%2?'red':'green', rightColor:i%2?'green':'red'});

function clamp(v,min,max){return Math.max(min,Math.min(max,v))}
function easeZ(z){z=clamp(z,0,1); return Math.pow(z,state.perspectivePower)}
function roadBoundsAtZ(z){
  const e=clamp(z,0,1);

  // FIXED slider logic for the user:
  // low Eye-level horizon  -> strong front / straight view
  // high Eye-level horizon -> slightly higher / more top-down view
  // Road stays long; width changes only a little.
  const t=clamp((state.horizon-760)/(1240-760),0,1);
  const front=1-t;

  // Keep a tight range so the road never becomes tiny.
  // Front view places the far road a bit higher and straighter.
  const visualHorizon=360 + t*115;

  // Nearly-parallel sides. Only a gentle width shift.
  const topHalf=(178 - t*24) * state.roadWidth;
  const bottomHalf=(316 - t*12) * state.roadWidth;

  // Long forward stretch with mild perspective only.
  const y=visualHorizon + (H - visualHorizon) * Math.pow(e, 0.98);
  const half=topHalf + (bottomHalf-topHalf) * Math.pow(e, 0.90);
  return {e,y,l:W/2-half,r:W/2+half,half,visualHorizon};
}
function lerp(a,b,t){return a+(b-a)*t}
function averagePoint(pts){return pts.reduce((s,p)=>[s[0]+p[0],s[1]+p[1]],[0,0]).map(v=>v/pts.length)}
function drawPoly(pts, fill){ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill()}

function drawBackground(){
  if(state.bgMode==='green'){
    const g=ctx.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#12dc82');g.addColorStop(.60,'#08c875');g.addColorStop(1,'#069b5b');
    ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  }else{
    ctx.fillStyle='#050506';ctx.fillRect(0,0,W,H);
  }
  if(state.speedLines){
    ctx.save();ctx.strokeStyle='rgba(255,255,255,.42)';ctx.lineCap='round';
    for(let i=0;i<12;i++){
      const sideDir=i%2===0?-1:1;
      const phase=(i*.11 + roadTime*state.speed*.62)%1;
      const guideTop=roadBoundsAtZ(0).y;
      const y=guideTop-320 + phase*430;
      const x=sideDir<0 ? 48+phase*96 : W-48-phase*96;
      const len=34+phase*96;
      ctx.globalAlpha=.08+.34*phase;ctx.lineWidth=2+3*phase;
      ctx.beginPath();ctx.moveTo(x,y-len*.55);ctx.lineTo(x+sideDir*14*phase,y+len*.45);ctx.stroke();
    }
    ctx.restore();
  }
}
function roadStyle(){
  const styles={
    v1:{base:'#59677f',edgeA:'#ff2333',edgeB:'#ffffff',lane:'scatter',texture:.038},
    v2:{base:'#343d4a',edgeA:'#f6f7fa',edgeB:'#f6f7fa',lane:'double',texture:.028},
    v3:{base:'#626d7d',edgeA:'#ff3b43',edgeB:'#f5f5f5',lane:'center',texture:.045},
    v4:{base:'#45566a',edgeA:'#55f7dc',edgeB:'#dffeff',lane:'double',texture:.030},
    v5:{base:'#8793a2',edgeA:'#ffffff',edgeB:'#ffffff',lane:'center',texture:.024}
  };
  return styles[state.roadVariant]||styles.v1;
}
function drawRoad(){
  const style=roadStyle();
  const top=roadBoundsAtZ(0), bottom=roadBoundsAtZ(1);
  drawPoly([[top.l,top.y],[top.r,top.y],[bottom.r,H],[bottom.l,H]], style.base);

  // Same subtle forward-moving road texture as V6 Front.
  ctx.save();
  for(let i=0;i<8;i++){
    const z=(i*.145 + roadTime*state.speed*.95)%1;
    if(z<.20) continue;
    const a=roadBoundsAtZ(z), b=roadBoundsAtZ(Math.min(1,z+.055));
    const alpha=.012+style.texture*a.e;
    drawPoly([[a.l,a.y],[a.r,a.y],[b.r,b.y],[b.l,b.y]],'rgba(255,255,255,'+alpha+')');
  }
  ctx.restore();

  // Edge strips stay runner-like; only their look changes by highway.
  for(let i=0;i<15;i++){
    const z0=(i/15 + roadTime*state.speed*.72)%1;
    const z1=z0+.055;
    if(z1>1) continue;
    const a=roadBoundsAtZ(z0), b=roadBoundsAtZ(z1);
    const wa=7+12*a.e, wb=7+12*b.e;
    const c=i%2===0?style.edgeA:style.edgeB;
    drawPoly([[a.l,a.y],[a.l+wa,a.y],[b.l+wb,b.y],[b.l,b.y]],c);
    drawPoly([[a.r-wa,a.y],[a.r,a.y],[b.r,b.y],[b.r-wb,b.y]],c);
  }

  if(state.roadShine){
    ctx.save();ctx.strokeStyle='rgba(255,255,255,.34)';ctx.lineCap='round';
    for(let i=0;i<6;i++){
      const z=(i*.19 + roadTime*state.speed*1.18)%1;
      if(z<.28) continue;
      const a=roadBoundsAtZ(z), b=roadBoundsAtZ(Math.min(1,z+.10));
      if(style.lane==='center'){
        ctx.globalAlpha=.20+.42*z;ctx.lineWidth=2+4*z;
        ctx.beginPath();ctx.moveTo(W/2,a.y);ctx.lineTo(W/2,b.y);ctx.stroke();
      }else if(style.lane==='double'){
        for(const side of [-1,1]){
          const xA=W/2+side*a.half*.31, xB=W/2+side*b.half*.31;
          ctx.globalAlpha=.18+.42*z;ctx.lineWidth=2+3.5*z;
          ctx.beginPath();ctx.moveTo(xA,a.y);ctx.lineTo(xB,b.y);ctx.stroke();
        }
      }else{
        const xA=W/2 + (i%2?-1:1)*a.half*(.30+.16*(i%3));
        const xB=W/2 + (i%2?-1:1)*b.half*(.30+.16*(i%3));
        ctx.globalAlpha=.18+.44*z;ctx.lineWidth=2+4*z;
        ctx.beginPath();ctx.moveTo(xA,a.y);ctx.lineTo(xB,b.y);ctx.stroke();
      }
    }
    ctx.restore();
  }
}
function drawRaisedPad(z, side, color){
  const p=roadBoundsAtZ(z), e=p.e;
  const laneCenter=side==='left' ? W/2-p.half*.48 : W/2+p.half*.48;

  // Standing panel, not a floor tile. Width follows road depth naturally.
  const width=Math.max(62,p.half*.78);
  const height=Math.max(28,width*.34);
  const baseY=p.y-3;
  const topY=baseY-height;
  const rgb=color==='red'?'255,50,58':'42,255,132';
  const dark=color==='red'?'118,23,28':'15,104,54';

  // Small ground shadow and thin glowing base.
  ctx.save();ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(laneCenter,baseY+5,width*.44,5+8*e,0,0,Math.PI*2);ctx.fill();ctx.restore();
  ctx.save();ctx.fillStyle='rgba('+dark+',.76)';ctx.beginPath();ctx.roundRect(laneCenter-width/2,baseY-state.padThickness*.45,width,state.padThickness,5);ctx.fill();ctx.restore();

  // Face fades toward the top exactly like a standing light gate.
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
    // Each row arrives once. No modulo = no endless extra pads.
    const elapsed=roadTime-initialDelay-i*state.padDelay;
    const z=elapsed*state.speed*1.16;
    if(z<0 || z>1.03) return;

    const zz=Math.min(1,z);
    const left=drawRaisedPad(zz,'left',row.leftColor);
    const right=drawRaisedPad(zz,'right',row.rightColor);
    const pngScale=.42+.74*left.e;
    const leftSize=Math.min(row.leftSize*pngScale,left.width*.92);
    const rightSize=Math.min(row.rightSize*pngScale,right.width*.92);
    if(row.leftImg) drawImageFit(row.leftImg,left.center[0],left.baseY-5,leftSize,leftSize,'bottom');
    if(row.rightImg) drawImageFit(row.rightImg,right.center[0],right.baseY-5,rightSize,rightSize,'bottom');
  });
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
  const save={...state, rows:state.rows.map(r=>({...r,leftImg:null,rightImg:null}))};
  localStorage.setItem('runnerStudioV8FrontSliderFixed', JSON.stringify(save));
  alert('Saved on this device');
};
$('loadBtn').onclick=async()=>{
  const raw=localStorage.getItem('runnerStudioV8FrontSliderFixed');
  if(!raw) return alert('No save found on this device');
  const s=JSON.parse(raw);
  Object.assign(state,s);
  ['speed','roadWidth','horizon','perspectivePower','padDelay','padThickness'].forEach(id=>$(id).value=state[id]);
  $('speedLines').checked=state.speedLines;
  $('roadShine').checked=state.roadShine;
  $('bgMode').value=state.bgMode||'black';
  if(!state.roadVariant) state.roadVariant='v1';
  $('roadVariant').value=state.roadVariant;
  $('rows').innerHTML='';
  state.rows=[];
  rowCounter=0;
  const fixed=(s.rows||[]).slice(0,5); while(fixed.length<5) fixed.push({leftColor:fixed.length%2?'red':'green',rightColor:fixed.length%2?'green':'red'}); fixed.forEach(addRow);
  alert('Loaded');
};
$('logoutBtn').onclick=async()=>{await fetch('/api/logout',{method:'POST'});location.href='/'};
$('exportBtn').onclick=()=>{
  if(recorder) return;
  const sec=Math.max(2,Math.min(60,+$('recordSec').value||15));
  const stream=canvas.captureStream(30);
  let mime='video/webm;codecs=vp9';
  if(!MediaRecorder.isTypeSupported(mime)) mime='video/webm';
  const chunks=[];
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:9000000});
  recorder.ondataavailable=e=>{if(e.data.size) chunks.push(e.data)};
  recorder.onstop=()=>{
    const blob=new Blob(chunks,{type:mime});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download='runner-video.webm';
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    recorder=null;
    $('exportBtn').textContent='Export Video';
  };
  recorder.start();
  $('exportBtn').textContent='Recording...';
  setTimeout(()=>{if(recorder&&recorder.state!=='inactive') recorder.stop()}, sec*1000);
};
})();
</script>
</body>
</html>`;

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  const pathname=decodeURIComponent(u.pathname);
  if(pathname==='/api/auth/status'&&req.method==='GET') return send(res,200,JSON.stringify({authenticated:authed(req)}),'application/json; charset=utf-8');
  if(pathname==='/api/login'&&req.method==='POST'){
    try{
      const body=await readJson(req);
      if(!safeEqual(body.password||'',APP_PASSWORD)) return send(res,401,JSON.stringify({ok:false,error:'Wrong password'}),'application/json; charset=utf-8');
      const cookie=[`runner_session=${encodeURIComponent(makeSession())}`,'Path=/','HttpOnly','SameSite=Strict',`Max-Age=${Math.floor(SESSION_MS/1000)}`,IS_PROD?'Secure':''].filter(Boolean).join('; ');
      return send(res,200,JSON.stringify({ok:true}),'application/json; charset=utf-8',{'Set-Cookie':cookie});
    }catch{
      return send(res,400,JSON.stringify({ok:false}),'application/json; charset=utf-8');
    }
  }
  if(pathname==='/api/logout'&&req.method==='POST') return send(res,200,JSON.stringify({ok:true}),'application/json; charset=utf-8',{'Set-Cookie':`runner_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${IS_PROD?'; Secure':''}`});
  if((pathname==='/'||pathname==='/app')&&req.method==='GET'){
    if(pathname==='/app'&&!authed(req)){res.writeHead(302,{Location:'/'});return res.end()}
    return send(res,200,authed(req)?APP_HTML:LOGIN_HTML,'text/html; charset=utf-8');
  }
  return send(res,404,'Not found');
});

server.listen(PORT,()=>console.log(`Private Runner Studio V8 Front Slider Fixed running on http://localhost:${PORT}`));
