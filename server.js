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
    req.on('data',c=>{b+=c;if(b.length>1e6){reject(new Error('too large'));req.destroy();}});
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
<title>Private Runner Studio - Low Front Road</title>
<style>
:root{--bg:#0b0d10;--panel:#15181e;--panel2:#1b1f27;--text:#f6f8fb;--muted:#9ca5b2;--line:#2b303a;--accent:#61f0a6}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.top{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 14px;background:#0b0d10ee;border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}
.top strong{font-size:18px}.badge{font-size:11px;color:#07110c;background:var(--accent);border-radius:99px;padding:4px 8px;margin-left:6px}
.top-actions{display:flex;gap:7px}.top button,.transport button{border:1px solid var(--line);background:#222731;color:white;border-radius:11px;padding:9px 12px;font:inherit}.top .primary,.transport .primary{background:var(--accent);color:#07110c;border-color:transparent;font-weight:800}
.studio{max-width:1220px;margin:auto;padding:14px;display:grid;grid-template-columns:minmax(320px,660px) minmax(300px,1fr);gap:16px}
.preview{min-width:0}.shell{background:#050607;border:1px solid var(--line);border-radius:18px;padding:7px;display:flex;justify-content:center;box-shadow:0 18px 60px #0007}.stageWrap{width:min(100%,460px);aspect-ratio:9/16;border-radius:13px;overflow:hidden;background:#050506}canvas{width:100%;height:100%;display:block}
.transport{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}.transport input[type=number]{width:70px;padding:9px;background:#fff;color:#111;border-radius:8px;border:0}.note{font-size:12px;color:var(--muted);line-height:1.5;margin-top:8px}
.controls{display:flex;flex-direction:column;gap:10px}details{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--panel)}summary{padding:13px 14px;background:var(--panel2);font-weight:800;cursor:pointer}.grid{padding:13px;display:grid;gap:11px}.grid.two{grid-template-columns:1fr 1fr}.grid label,.side label{display:grid;gap:6px;color:#d7dbe2;font-size:13px}input[type=file]{width:100%;font-size:12px}input[type=range]{width:100%}select{padding:8px;background:#0f1217;color:white;border:1px solid var(--line);border-radius:8px}.toggle{display:flex!important;align-items:center;gap:8px!important}
.rows{padding:11px;display:grid;gap:10px}.row{border:1px solid var(--line);border-radius:13px;padding:10px;background:#101318}.rowhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.sides{display:grid;grid-template-columns:1fr 1fr;gap:8px}.side{background:#191d24;border-radius:10px;padding:9px;display:grid;gap:8px}.side b{font-size:12px}.small{font-size:11px;color:var(--muted)}
@media(max-width:820px){.studio{grid-template-columns:1fr;padding:8px}.top{padding:9px}.top strong{font-size:14px}.top button{padding:8px 9px;font-size:12px}.grid.two,.sides{grid-template-columns:1fr}.controls{padding-bottom:40px}}
</style>
</head>
<body>
<header class="top">
  <div><strong>Private Runner Studio</strong><span class="badge">COMBINED TRUE FRONT</span></div>
  <div class="top-actions"><button id="saveBtn">Save</button><button id="loadBtn">Load</button><button id="logoutBtn">Logout</button></div>
</header>
<main class="studio">
  <section class="preview">
    <div class="shell"><div class="stageWrap"><canvas id="stage" width="720" height="1280"></canvas></div></div>
    <div class="transport"><button class="primary" id="playBtn">Pause</button><button id="resetBtn">Reset</button><label>Record sec <input id="recordSec" type="number" min="2" max="60" value="20"></label><button id="exportBtn">Export Video</button></div>
    <div class="note">Combined true-front version: road pushed lower and straighter for a stronger front-driving view, while keeping the raised thin glowing pads, black background, red/white road edges, and exactly 5 moving choice rows.</div>
  </section>
  <section class="controls">
    <details open><summary>Road / Motion</summary><div class="grid two">
      <label>Speed <input id="speed" type="range" min="0.12" max="0.34" step="0.01" value="0.22"></label>
      <label>Row gap <input id="rowGap" type="range" min="1.20" max="3.20" step="0.05" value="2.00"></label>
      <label>Start delay <input id="startDelay" type="range" min="0.20" max="2.00" step="0.05" value="0.65"></label>
      <label>Background <select id="bgMode"><option value="black" selected>Black reference</option><option value="green">Green screen</option></select></label>
      <label class="toggle"><input id="speedLines" type="checkbox" checked> Long speed streaks</label>
      <label class="toggle"><input id="roadShine" type="checkbox" checked> Road highlights</label>
    </div></details>
    <details open><summary>5 Choice Rows</summary><div class="rows" id="rows"></div></details>
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
        <label>Object size <input class="leftSize" type="range" min="50" max="210" value="100"></label>
      </div>
      <div class="side">
        <b>RIGHT</b>
        <label>Pad <select class="rightColor"><option value="red">Red</option><option value="green">Green</option></select></label>
        <label>PNG <input class="rightInput" type="file" accept="image/png,image/webp,image/jpeg"></label>
        <label class="toggle"><input class="rightRemove" type="checkbox" checked> Auto remove bg</label>
        <label>Object size <input class="rightSize" type="range" min="50" max="210" value="100"></label>
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
  speed:0.22,
  rowGap:2.00,
  startDelay:0.65,
  bgMode:'black',
  speedLines:true,
  roadShine:true,
  rows:[]
};

function clamp(v,a=0,b=1){return Math.max(a,Math.min(b,v))}
function lerp(a,b,t){return a+(b-a)*t}
function drawPoly(pts,fill){ctx.beginPath();ctx.moveTo(pts[0][0],pts[0][1]);for(let i=1;i<pts.length;i++)ctx.lineTo(pts[i][0],pts[i][1]);ctx.closePath();ctx.fillStyle=fill;ctx.fill()}
function readFile(file){return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(file)})}
function dataToImage(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src})}
function processImageDataUrl(dataUrl,removeBg){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>{
      if(!removeBg){resolve(dataUrl);return}
      const c=document.createElement('canvas');c.width=img.width;c.height=img.height;
      const cx=c.getContext('2d',{willReadFrequently:true});cx.drawImage(img,0,0);
      const id=cx.getImageData(0,0,c.width,c.height),d=id.data;
      const sample=(x,y)=>{const i=(y*c.width+x)*4;return[d[i],d[i+1],d[i+2]]};
      const pts=[[0,0],[c.width-1,0],[0,c.height-1],[c.width-1,c.height-1],[Math.floor(c.width/2),0],[0,Math.floor(c.height/2)],[c.width-1,Math.floor(c.height/2)],[Math.floor(c.width/2),c.height-1]];
      let sr=0,sg=0,sb=0;pts.forEach(([x,y])=>{const [r,g,b]=sample(x,y);sr+=r;sg+=g;sb+=b});
      const br=sr/pts.length,bg=sg/pts.length,bb=sb/pts.length;
      for(let i=0;i<d.length;i+=4){
        const dr=d[i]-br,dg=d[i+1]-bg,db=d[i+2]-bb;const dist=Math.sqrt(dr*dr+dg*dg+db*db);const bright=(d[i]+d[i+1]+d[i+2])/3;
        if(dist<27||bright>249)d[i+3]=0;else if(dist<44)d[i+3]=Math.min(d[i+3],120);
      }
      cx.putImageData(id,0,0);resolve(c.toDataURL('image/png'));
    };
    img.onerror=reject;img.src=dataUrl;
  });
}
async function dataToProcessedImage(src,removeBg){return dataToImage(await processImageDataUrl(src,removeBg))}

$('speed').oninput=e=>state.speed=Number(e.target.value);
$('rowGap').oninput=e=>state.rowGap=Number(e.target.value);
$('startDelay').oninput=e=>state.startDelay=Number(e.target.value);
$('bgMode').onchange=e=>state.bgMode=e.target.value;
$('speedLines').onchange=e=>state.speedLines=e.target.checked;
$('roadShine').onchange=e=>state.roadShine=e.target.checked;

function makeId(){return (crypto.randomUUID&&crypto.randomUUID())||String(Date.now()+Math.random())}
function addRow(saved={}){
  const row={
    id:makeId(),
    leftColor:saved.leftColor||'green',rightColor:saved.rightColor||'red',
    leftSize:saved.leftSize||100,rightSize:saved.rightSize||100,
    leftSrc:saved.leftSrc||null,rightSrc:saved.rightSrc||null,
    leftImg:null,rightImg:null,
    leftRemove:saved.leftRemove!==false,rightRemove:saved.rightRemove!==false
  };
  state.rows.push(row);
  const el=$('rowTemplate').content.firstElementChild.cloneNode(true);el.dataset.id=row.id;
  el.querySelector('.rowtitle').textContent='Row '+(++rowCounter);
  el.querySelector('.leftColor').value=row.leftColor;el.querySelector('.rightColor').value=row.rightColor;
  el.querySelector('.leftSize').value=row.leftSize;el.querySelector('.rightSize').value=row.rightSize;
  el.querySelector('.leftRemove').checked=row.leftRemove;el.querySelector('.rightRemove').checked=row.rightRemove;
  el.querySelector('.leftColor').onchange=e=>row.leftColor=e.target.value;el.querySelector('.rightColor').onchange=e=>row.rightColor=e.target.value;
  el.querySelector('.leftSize').oninput=e=>row.leftSize=Number(e.target.value);el.querySelector('.rightSize').oninput=e=>row.rightSize=Number(e.target.value);
  el.querySelector('.leftRemove').onchange=async e=>{row.leftRemove=e.target.checked;if(row.leftSrc)row.leftImg=await dataToProcessedImage(row.leftSrc,row.leftRemove)};
  el.querySelector('.rightRemove').onchange=async e=>{row.rightRemove=e.target.checked;if(row.rightSrc)row.rightImg=await dataToProcessedImage(row.rightSrc,row.rightRemove)};
  el.querySelector('.leftInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;row.leftSrc=await readFile(f);row.leftImg=await dataToProcessedImage(row.leftSrc,row.leftRemove)};
  el.querySelector('.rightInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;row.rightSrc=await readFile(f);row.rightImg=await dataToProcessedImage(row.rightSrc,row.rightRemove)};
  $('rows').appendChild(el);
  if(row.leftSrc)dataToProcessedImage(row.leftSrc,row.leftRemove).then(im=>row.leftImg=im);
  if(row.rightSrc)dataToProcessedImage(row.rightSrc,row.rightRemove).then(im=>row.rightImg=im);
}
for(let i=0;i<5;i++)addRow({leftColor:i%2?'red':'green',rightColor:i%2?'green':'red'});

// Locked geometry from the three references: low/front camera, straight road sides,
// narrow far end around mid-frame, near road filling past the phone edges.
const ROAD={horizonY:545,farHalf:122,nearHalf:360,nearY:1460};
function project(z){
  z=clamp(z);
  // Stronger driver/front view: road starts lower, stretches farther, and tapers less.
  const yCurve=Math.pow(z,1.92);
  const wCurve=Math.pow(z,1.04);
  const y=lerp(ROAD.horizonY,ROAD.nearY,yCurve);
  const half=lerp(ROAD.farHalf,ROAD.nearHalf,wCurve);
  return {z,y,half,l:W/2-half,r:W/2+half};
}
function roadBoundsAtZ(z){
  const p=project(z);
  return {e:p.z,y:p.y,l:p.l,r:p.r,half:p.half};
}

function drawBackground(){
  if(state.bgMode==='green'){
    const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#09d774');g.addColorStop(1,'#079957');ctx.fillStyle=g;
  }else ctx.fillStyle='#050506';
  ctx.fillRect(0,0,W,H);

  if(state.speedLines){
    ctx.save();ctx.lineCap='round';ctx.strokeStyle='rgba(255,255,255,.88)';
    for(let i=0;i<16;i++){
      let z=(i/16 + roadTime*state.speed*.72)%1;
      const a=project(z),b=project(clamp(z+.08));
      const side=i%2?-1:1;
      const outside=lerp(1.18,1.78,z);
      const x1=W/2+side*a.half*outside;
      const x2=W/2+side*b.half*outside;
      ctx.globalAlpha=.08+.42*z;ctx.lineWidth=1.5+4.8*z;
      ctx.beginPath();ctx.moveTo(x1,a.y-12);ctx.lineTo(x2,b.y+55*z);ctx.stroke();
    }
    ctx.restore();
  }
}

function drawRoad(){
  const top=project(0),bottom=project(1);
  const g=ctx.createLinearGradient(0,top.y,0,H);
  g.addColorStop(0,'#536781');g.addColorStop(.55,'#4a5d78');g.addColorStop(1,'#43546c');
  drawPoly([[top.l,top.y],[top.r,top.y],[bottom.r,bottom.y],[bottom.l,bottom.y]],g);

  // Moving red/white curb segments create forward travel while road geometry stays fixed.
  for(let i=0;i<20;i++){
    const z0=(i/18 + roadTime*state.speed*.58)%1;
    const z1=z0+.05;if(z1>1)continue;
    const a=project(z0),b=project(z1);
    const wa=5+15*z0,wb=5+15*z1;
    const c=i%2===0?'#ff2439':'#ffffff';
    drawPoly([[a.l,a.y],[a.l+wa,a.y],[b.l+wb,b.y],[b.l,b.y]],c);
    drawPoly([[a.r-wa,a.y],[a.r,a.y],[b.r,b.y],[b.r-wb,b.y]],c);
  }

  if(state.roadShine){
    ctx.save();ctx.strokeStyle='rgba(255,255,255,.62)';ctx.lineCap='round';
    for(let i=0;i<9;i++){
      const z=(i/9 + roadTime*state.speed*.96)%1;
      if(z<.14)continue;
      const a=project(z),b=project(clamp(z+.12));
      const lane=(i%3-1)*.20;
      ctx.globalAlpha=.10+.42*z;ctx.lineWidth=1.2+4.5*z;
      ctx.beginPath();ctx.moveTo(W/2+a.half*lane,a.y);ctx.lineTo(W/2+b.half*lane,b.y);ctx.stroke();
    }
    ctx.restore();
  }
}

function drawRaisedPad(z, side, color){
  const p=roadBoundsAtZ(z), e=p.e;
  const laneCenter=side==='left' ? W/2-p.half*.48 : W/2+p.half*.48;

  const width=Math.max(62,p.half*.78);
  const height=Math.max(28,width*.34);
  const baseY=p.y-3;
  const topY=baseY-height;
  const rgb=color==='red'?'255,50,58':'42,255,132';
  const dark=color==='red'?'118,23,28':'15,104,54';
  const padThickness=Math.max(8,Math.min(16,7+e*8));

  ctx.save();
  ctx.fillStyle='rgba(0,0,0,.22)';
  ctx.beginPath();
  ctx.ellipse(laneCenter,baseY+5,width*.44,5+8*e,0,0,Math.PI*2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.fillStyle='rgba('+dark+',.76)';
  ctx.beginPath();
  ctx.roundRect(laneCenter-width/2,baseY-padThickness*.45,width,padThickness,5);
  ctx.fill();
  ctx.restore();

  const g=ctx.createLinearGradient(0,baseY,0,topY);
  g.addColorStop(0,'rgba('+rgb+',.96)');
  g.addColorStop(.38,'rgba('+rgb+',.78)');
  g.addColorStop(.76,'rgba('+rgb+',.30)');
  g.addColorStop(1,'rgba('+rgb+',0)');
  ctx.save();
  ctx.shadowColor='rgb('+rgb+')';
  ctx.shadowBlur=14+22*e;
  ctx.fillStyle=g;
  ctx.beginPath();
  ctx.roundRect(laneCenter-width/2,topY,width,height,7);
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle='rgba('+rgb+',.96)';
  ctx.lineWidth=2+1.5*e;
  ctx.beginPath();
  ctx.moveTo(laneCenter-width*.47,baseY-1);
  ctx.lineTo(laneCenter+width*.47,baseY-1);
  ctx.stroke();
  ctx.restore();
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
  state.rows.slice(0,5).forEach((row,i)=>{
    const elapsed=roadTime-state.startDelay-i*state.rowGap;
    const z=elapsed*state.speed*.86;
    if(z<0||z>1.03)return;
    const zz=clamp(z);
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
  const dt=Math.min(.05,(now-last)/1000);last=now;if(running)roadTime+=dt;
  drawBackground();drawRoad();drawRows();requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

$('playBtn').onclick=()=>{running=!running;$('playBtn').textContent=running?'Pause':'Play'};
$('resetBtn').onclick=()=>roadTime=0;
$('saveBtn').onclick=()=>{const save={...state,rows:state.rows.map(r=>({...r,leftImg:null,rightImg:null}))};localStorage.setItem('runnerStudioNewLowFront',JSON.stringify(save));alert('Saved on this device')};
$('loadBtn').onclick=async()=>{
  const raw=localStorage.getItem('runnerStudioNewLowFront');if(!raw)return alert('No save found on this device');
  const s=JSON.parse(raw);Object.assign(state,s);
  $('speed').value=state.speed;$('rowGap').value=state.rowGap;$('startDelay').value=state.startDelay;$('bgMode').value=state.bgMode||'black';$('speedLines').checked=state.speedLines;$('roadShine').checked=state.roadShine;
  $('rows').innerHTML='';state.rows=[];rowCounter=0;const fixed=(s.rows||[]).slice(0,5);while(fixed.length<5)fixed.push({leftColor:fixed.length%2?'red':'green',rightColor:fixed.length%2?'green':'red'});fixed.forEach(addRow);alert('Loaded');
};
$('logoutBtn').onclick=async()=>{await fetch('/api/logout',{method:'POST'});location.href='/'};
$('exportBtn').onclick=()=>{
  if(recorder)return;const sec=Math.max(2,Math.min(60,+$('recordSec').value||20));const stream=canvas.captureStream(30);let mime='video/webm;codecs=vp9';if(!MediaRecorder.isTypeSupported(mime))mime='video/webm';const chunks=[];
  recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:9000000});
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onstop=()=>{const blob=new Blob(chunks,{type:mime});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='runner-low-front.webm';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);recorder=null;$('exportBtn').textContent='Export Video'};
  recorder.start();$('exportBtn').textContent='Recording...';setTimeout(()=>{if(recorder&&recorder.state!=='inactive')recorder.stop()},sec*1000);
};
})();
</script>
</body>
</html>`;

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
  const pathname=decodeURIComponent(u.pathname);
  if(pathname==='/api/auth/status'&&req.method==='GET')return send(res,200,JSON.stringify({authenticated:authed(req)}),'application/json; charset=utf-8');
  if(pathname==='/api/login'&&req.method==='POST'){
    try{
      const body=await readJson(req);
      if(!safeEqual(body.password||'',APP_PASSWORD))return send(res,401,JSON.stringify({ok:false,error:'Wrong password'}),'application/json; charset=utf-8');
      const cookie=[`runner_session=${encodeURIComponent(makeSession())}`,'Path=/','HttpOnly','SameSite=Strict',`Max-Age=${Math.floor(SESSION_MS/1000)}`,IS_PROD?'Secure':''].filter(Boolean).join('; ');
      return send(res,200,JSON.stringify({ok:true}),'application/json; charset=utf-8',{'Set-Cookie':cookie});
    }catch{return send(res,400,JSON.stringify({ok:false}),'application/json; charset=utf-8')}
  }
  if(pathname==='/api/logout'&&req.method==='POST')return send(res,200,JSON.stringify({ok:true}),'application/json; charset=utf-8',{'Set-Cookie':`runner_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${IS_PROD?'; Secure':''}`});
  if((pathname==='/'||pathname==='/app')&&req.method==='GET'){
    if(pathname==='/app'&&!authed(req)){res.writeHead(302,{Location:'/'});return res.end()}
    return send(res,200,authed(req)?APP_HTML:LOGIN_HTML,'text/html; charset=utf-8');
  }
  return send(res,404,'Not found');
});

server.listen(PORT,()=>console.log(`Private Runner Studio - New Low Front Road running on http://localhost:${PORT}`));
