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
  const aa=Buffer.from(String(a)),bb=Buffer.from(String(b));
  return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);
}
function makeSession(){
  const exp=Date.now()+SESSION_MS, nonce=crypto.randomBytes(12).toString('hex');
  const payload=`${exp}.${nonce}`;
  const sig=crypto.createHmac('sha256',SESSION_SECRET).update(payload).digest('hex');
  return `${payload}.${sig}`;
}
function verifySession(token){
  if(!token) return false;
  const p=token.split('.');
  if(p.length!==3) return false;
  const [exp,nonce,sig]=p, payload=`${exp}.${nonce}`;
  const expected=crypto.createHmac('sha256',SESSION_SECRET).update(payload).digest('hex');
  return safeEqual(sig,expected)&&Number(exp)>Date.now();
}
function authed(req){return verifySession(parseCookies(req).runner_session)}
function send(res,status,body,type='text/plain; charset=utf-8',headers={}){
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store',...headers});res.end(body);
}
function readJson(req){
  return new Promise((resolve,reject)=>{
    let b=''; req.on('data',c=>{b+=c;if(b.length>1e6){reject(new Error('too large'));req.destroy()}});
    req.on('end',()=>{try{resolve(JSON.parse(b||'{}'))}catch(e){reject(e)}}); req.on('error',reject);
  });
}

const LOGIN_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Private Runner Studio</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:22px;background:radial-gradient(circle at 50% 15%,#174f37 0,#0c0e12 43%);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#f7f8fb}.card{width:min(100%,410px);padding:30px;border:1px solid #30353f;border-radius:24px;background:#17191f;box-shadow:0 30px 90px #0008}.mark{width:54px;height:54px;border-radius:17px;display:grid;place-items:center;background:#61f0a6;color:#08130d;font-weight:900;font-size:28px}.card h1{font-size:34px;line-height:1.05;margin:24px 0 8px}.muted{color:#9da4b0;font-size:18px;margin:0 0 28px}label{display:grid;gap:10px;font-size:16px}input{width:100%;padding:16px;border-radius:14px;border:1px solid #343943;background:#0e1014;color:white;font-size:18px}button{width:100%;margin-top:16px;padding:16px;border:0;border-radius:14px;background:#61f0a6;color:#07110c;font-size:19px;font-weight:900}.msg{min-height:22px;color:#ff8f8f;margin-top:12px}</style></head><body><main class="card"><div class="mark">R</div><h1>Private Runner Studio</h1><p class="muted">Owner access only</p><form id="f"><label>Password<input id="p" type="password" autocomplete="current-password" placeholder="Enter your password"></label><button>Unlock Studio</button><div class="msg" id="m"></div></form></main><script>
f.onsubmit=async(e)=>{e.preventDefault();m.textContent='';const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p.value})});if(r.ok)location.href='/app';else m.textContent='Wrong password';};
</script></body></html>`;

const APP_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Private Runner Studio V2</title><style>
:root{--bg:#0b0d10;--panel:#15181e;--panel2:#1b1f27;--text:#f6f8fb;--muted:#9ca5b2;--line:#2b303a;--accent:#61f0a6}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif}.top{position:sticky;top:0;z-index:20;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:11px 14px;background:#0b0d10ee;border-bottom:1px solid var(--line);backdrop-filter:blur(12px)}.top strong{font-size:18px}.badge{font-size:11px;color:#07110c;background:var(--accent);border-radius:99px;padding:4px 7px;margin-left:6px}.top-actions{display:flex;gap:7px}.top button,.transport button{border:1px solid var(--line);background:#222731;color:white;border-radius:11px;padding:9px 12px;font:inherit}.top .primary,.transport .primary{background:var(--accent);color:#07110c;border-color:transparent;font-weight:800}.studio{max-width:1180px;margin:auto;padding:14px;display:grid;grid-template-columns:minmax(320px,650px) minmax(300px,1fr);gap:16px}.preview{min-width:0}.shell{background:#050607;border:1px solid var(--line);border-radius:18px;padding:7px;display:flex;justify-content:center;box-shadow:0 18px 60px #0007}.stageWrap{width:min(100%,450px);aspect-ratio:9/16;border-radius:13px;overflow:hidden;background:#08ce78}canvas{width:100%;height:100%;display:block}.transport{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}.transport input[type=number]{width:70px;padding:9px;background:#fff;color:#111;border-radius:8px;border:0}.note{font-size:12px;color:var(--muted);line-height:1.45;margin-top:8px}.controls{display:flex;flex-direction:column;gap:10px}details{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--panel)}summary{padding:13px 14px;background:var(--panel2);font-weight:800;cursor:pointer}.grid{padding:13px;display:grid;gap:11px}.grid.two{grid-template-columns:1fr 1fr}.grid label,.side label{display:grid;gap:6px;color:#d7dbe2;font-size:13px}input[type=file]{width:100%;font-size:12px}input[type=range]{width:100%}select{padding:8px;background:#0f1217;color:white;border:1px solid var(--line);border-radius:8px}.toggle{display:flex!important;grid-template-columns:auto 1fr!important;align-items:center;gap:8px!important}.rowbar{padding:11px 13px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:center}.rowbar button{background:#222731;color:white;border:1px solid var(--line);border-radius:10px;padding:9px 11px}.rows{padding:11px;display:grid;gap:10px}.row{border:1px solid var(--line);border-radius:13px;padding:10px;background:#101318}.rowhead{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}.remove{background:#312126;color:#ffb8c0;border:1px solid #58313a;border-radius:9px;padding:7px 9px}.sides{display:grid;grid-template-columns:1fr 1fr;gap:8px}.side{background:#191d24;border-radius:10px;padding:9px;display:grid;gap:8px}.side b{font-size:12px}.small{font-size:11px;color:var(--muted)}@media(max-width:820px){.studio{grid-template-columns:1fr;padding:8px}.top{padding:9px}.top strong{font-size:14px}.top button{padding:8px 9px;font-size:12px}.grid.two{grid-template-columns:1fr}.sides{grid-template-columns:1fr 1fr}.controls{padding-bottom:40px}}
</style></head><body>
<header class="top"><div><strong>Private Runner Studio</strong><span class="badge">V2 GAME</span></div><div class="top-actions"><button id="saveBtn">Save</button><button id="loadBtn">Load</button><button id="logoutBtn">Logout</button></div></header>
<main class="studio"><section class="preview"><div class="shell"><div class="stageWrap"><canvas id="stage" width="720" height="1280"></canvas></div></div><div class="transport"><button class="primary" id="playBtn">Pause</button><button id="resetBtn">Reset</button><label>Record sec <input id="recordSec" type="number" min="2" max="60" value="15"></label><button id="exportBtn">Export Video</button></div><div class="note">V2 uses full-width perspective pads, moving road tiles, motion streaks and camera-style scaling. For best results upload transparent PNG/WebP. If an image has a plain white border background, keep “Auto remove border background” enabled.</div></section>
<section class="controls">
<details open><summary>Runner / Character</summary><div class="grid"><label>Runner PNG/WebP <input id="runnerInput" type="file" accept="image/png,image/webp,image/jpeg"></label><label class="toggle"><input id="runnerRemoveBg" type="checkbox" checked> Auto remove border background</label><label>Runner size <input id="runnerSize" type="range" min="70" max="360" value="175"></label><label>Runner X <input id="runnerX" type="range" min="-260" max="260" value="0"></label><label>Runner Y <input id="runnerY" type="range" min="750" max="1190" value="1015"></label></div></details>
<details open><summary>Final Target / Enemy</summary><div class="grid"><label>Target PNG/WebP <input id="targetInput" type="file" accept="image/png,image/webp,image/jpeg"></label><label class="toggle"><input id="targetRemoveBg" type="checkbox" checked> Auto remove border background</label><label>Target size <input id="targetSize" type="range" min="50" max="300" value="130"></label><label>Target distance <input id="targetZ" type="range" min="0.05" max="0.55" step="0.01" value="0.16"></label></div></details>
<details open><summary>Moving Highway / Camera</summary><div class="grid two"><label>Speed <input id="speed" type="range" min="0.06" max="0.75" step="0.01" value="0.24"></label><label>Road width <input id="roadWidth" type="range" min="0.78" max="1.05" step="0.01" value="1"></label><label>Horizon <input id="horizon" type="range" min="315" max="610" value="500"></label><label>Perspective <input id="perspectivePower" type="range" min="1.0" max="2.2" step="0.05" value="1.42"></label><label class="toggle"><input id="speedLines" type="checkbox" checked> Motion streaks</label><label class="toggle"><input id="roadShine" type="checkbox" checked> Road highlights</label></div></details>
<details open><summary>Choice Rows / Glowing Pads</summary><div class="rowbar"><button id="addRowBtn">+ Add Row</button><label>Row gap <input id="rowGap" type="range" min="0.14" max="0.38" step="0.01" value="0.23"></label></div><div id="rows" class="rows"></div></details>
</section></main>
<template id="rowTemplate"><div class="row"><div class="rowhead"><b class="rowtitle">Row</b><button class="remove">Remove</button></div><div class="sides"><div class="side"><b>LEFT</b><label>Pad<select class="leftColor"><option value="green">Green</option><option value="red">Red</option></select></label><label>PNG<input class="leftImg" type="file" accept="image/png,image/webp,image/jpeg"></label><label class="toggle"><input class="leftBg" type="checkbox" checked> Remove bg</label><label>Size<input class="leftSize" type="range" min="55" max="330" value="165"></label></div><div class="side"><b>RIGHT</b><label>Pad<select class="rightColor"><option value="red">Red</option><option value="green">Green</option></select></label><label>PNG<input class="rightImg" type="file" accept="image/png,image/webp,image/jpeg"></label><label class="toggle"><input class="rightBg" type="checkbox" checked> Remove bg</label><label>Size<input class="rightSize" type="range" min="55" max="330" value="165"></label></div></div></div></template>
<script>
(()=>{
const canvas=document.getElementById('stage'),ctx=canvas.getContext('2d',{alpha:false}); const W=canvas.width,H=canvas.height; let running=true,last=performance.now(),roadTime=0,rowSeq=0,recorder=null;
const state={speed:.24,roadWidth:1,horizon:500,perspectivePower:1.42,rowGap:.23,runnerSize:175,runnerX:0,runnerY:1015,targetSize:130,targetZ:.16,speedLines:true,roadShine:true,runner:null,target:null,runnerSrc:null,targetSrc:null,runnerRemoveBg:true,targetRemoveBg:true,rows:[]};
const $=id=>document.getElementById(id);
function readFile(file){return new Promise((resolve,reject)=>{const fr=new FileReader();fr.onload=()=>resolve(fr.result);fr.onerror=reject;fr.readAsDataURL(file)})}
function imageFromDataURL(src){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src})}
async function dataToProcessedImage(src,removeBg){const im=await imageFromDataURL(src);if(!removeBg)return im;try{return await removeConnectedBorder(im)}catch{return im}}
async function removeConnectedBorder(im){
  const max=1000,sc=Math.min(1,max/Math.max(im.naturalWidth||im.width,im.naturalHeight||im.height)),w=Math.max(1,Math.round((im.naturalWidth||im.width)*sc)),h=Math.max(1,Math.round((im.naturalHeight||im.height)*sc));
  const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{willReadFrequently:true});x.drawImage(im,0,0,w,h);const d=x.getImageData(0,0,w,h),a=d.data,seen=new Uint8Array(w*h),q=new Int32Array(w*h),tol=34;
  const corners=[[0,0],[w-1,0],[0,h-1],[w-1,h-1]].map(([xx,yy])=>{const i=(yy*w+xx)*4;return[a[i],a[i+1],a[i+2]]});
  const base=corners.reduce((o,p)=>[o[0]+p[0]/4,o[1]+p[1]/4,o[2]+p[2]/4],[0,0,0]);
  if(Math.min(...base)<190) return im;
  const match=i=>Math.abs(a[i]-base[0])<tol&&Math.abs(a[i+1]-base[1])<tol&&Math.abs(a[i+2]-base[2])<tol&&a[i+3]>0;
  let head=0,tail=0;function push(px,py){if(px<0||py<0||px>=w||py>=h)return;const p=py*w+px;if(seen[p])return;const i=p*4;if(!match(i))return;seen[p]=1;q[tail++]=p}
  for(let xx=0;xx<w;xx++){push(xx,0);push(xx,h-1)}for(let yy=0;yy<h;yy++){push(0,yy);push(w-1,yy)}
  while(head<tail){const p=q[head++],px=p%w,py=(p/w)|0;const i=p*4;a[i+3]=0;push(px+1,py);push(px-1,py);push(px,py+1);push(px,py-1)}
  x.putImageData(d,0,0);return imageFromDataURL(c.toDataURL('image/png'));
}
function bindRange(id,key){$(id).addEventListener('input',e=>state[key]=Number(e.target.value))}
bindRange('speed','speed');bindRange('roadWidth','roadWidth');bindRange('horizon','horizon');bindRange('perspectivePower','perspectivePower');bindRange('rowGap','rowGap');bindRange('runnerSize','runnerSize');bindRange('runnerX','runnerX');bindRange('runnerY','runnerY');bindRange('targetSize','targetSize');bindRange('targetZ','targetZ');
$('speedLines').onchange=e=>state.speedLines=e.target.checked;$('roadShine').onchange=e=>state.roadShine=e.target.checked;$('runnerRemoveBg').onchange=e=>state.runnerRemoveBg=e.target.checked;$('targetRemoveBg').onchange=e=>state.targetRemoveBg=e.target.checked;
$('runnerInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;state.runnerSrc=await readFile(f);state.runner=await dataToProcessedImage(state.runnerSrc,state.runnerRemoveBg)};
$('targetInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;state.targetSrc=await readFile(f);state.target=await dataToProcessedImage(state.targetSrc,state.targetRemoveBg)};
function addRow(saved={}){const row={id:String(++rowSeq),leftColor:saved.leftColor||'green',rightColor:saved.rightColor||'red',leftSize:saved.leftSize||165,rightSize:saved.rightSize||165,leftSrc:saved.leftSrc||null,rightSrc:saved.rightSrc||null,leftImg:null,rightImg:null,leftRemove:saved.leftRemove!==false,rightRemove:saved.rightRemove!==false};state.rows.push(row);const el=$('rowTemplate').content.firstElementChild.cloneNode(true);el.dataset.id=row.id;el.querySelector('.rowtitle').textContent='Row '+state.rows.length;const lc=el.querySelector('.leftColor'),rc=el.querySelector('.rightColor'),ls=el.querySelector('.leftSize'),rs=el.querySelector('.rightSize'),lb=el.querySelector('.leftBg'),rb=el.querySelector('.rightBg');lc.value=row.leftColor;rc.value=row.rightColor;ls.value=row.leftSize;rs.value=row.rightSize;lb.checked=row.leftRemove;rb.checked=row.rightRemove;lc.onchange=e=>row.leftColor=e.target.value;rc.onchange=e=>row.rightColor=e.target.value;ls.oninput=e=>row.leftSize=+e.target.value;rs.oninput=e=>row.rightSize=+e.target.value;lb.onchange=e=>row.leftRemove=e.target.checked;rb.onchange=e=>row.rightRemove=e.target.checked;
  el.querySelector('.leftImg').onchange=async e=>{const f=e.target.files[0];if(!f)return;row.leftSrc=await readFile(f);row.leftImg=await dataToProcessedImage(row.leftSrc,row.leftRemove)};el.querySelector('.rightImg').onchange=async e=>{const f=e.target.files[0];if(!f)return;row.rightSrc=await readFile(f);row.rightImg=await dataToProcessedImage(row.rightSrc,row.rightRemove)};el.querySelector('.remove').onclick=()=>{state.rows=state.rows.filter(r=>r.id!==row.id);el.remove();renumber()};$('rows').appendChild(el);if(row.leftSrc)dataToProcessedImage(row.leftSrc,row.leftRemove).then(im=>row.leftImg=im);if(row.rightSrc)dataToProcessedImage(row.rightSrc,row.rightRemove).then(im=>row.rightImg=im)}
function renumber(){[...document.querySelectorAll('.row')].forEach((el,i)=>el.querySelector('.rowtitle').textContent='Row '+(i+1))}
$('addRowBtn').onclick=()=>addRow();for(let i=0;i<5;i++)addRow({leftColor:i%2?'red':'green',rightColor:i%2?'green':'red'});
function easeZ(z){z=Math.max(0,Math.min(1,z));return Math.pow(z,state.perspectivePower)}
function geom(z){const e=easeZ(z),y=state.horizon+(H-state.horizon)*e,top=78,bottom=W*.505*state.roadWidth,half=top+(bottom-top)*e;return{e,y,half}}
function drawBackground(){
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,'#12e98b');g.addColorStop(.45,'#08dc7e');g.addColorStop(1,'#05b968');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  const rg=ctx.createRadialGradient(W/2,260,10,W/2,430,520);rg.addColorStop(0,'rgba(255,255,255,.12)');rg.addColorStop(1,'rgba(0,0,0,.12)');ctx.fillStyle=rg;ctx.fillRect(0,0,W,H);
  // subtle side walls / vignette
  const lg=ctx.createLinearGradient(0,0,W,0);lg.addColorStop(0,'rgba(2,82,44,.5)');lg.addColorStop(.14,'rgba(255,255,255,.03)');lg.addColorStop(.5,'rgba(255,255,255,0)');lg.addColorStop(.86,'rgba(255,255,255,.03)');lg.addColorStop(1,'rgba(2,82,44,.5)');ctx.fillStyle=lg;ctx.fillRect(0,0,W,H);
  if(state.speedLines){ctx.save();ctx.strokeStyle='rgba(255,255,255,.43)';ctx.lineWidth=4;ctx.lineCap='round';for(let i=0;i<18;i++){const side=i%2===0?-1:1,slot=(i/18+roadTime*state.speed*.62)%1,e=easeZ(slot),y=state.horizon-190+(H-state.horizon+180)*e;const x=side<0?W*.08+(W*.31)*e:W*.92-(W*.31)*e;const len=18+125*e;ctx.globalAlpha=.13+.58*e;ctx.beginPath();ctx.moveTo(x,y-len*.75);ctx.lineTo(x+side*18*e,y+len*.25);ctx.stroke()}ctx.restore()}
}
function roadBoundsAtZ(z){const p=geom(z);return{y:p.y,l:W/2-p.half,r:W/2+p.half,half:p.half,e:p.e}}
function drawRoad(){
  const h=geom(0),b=geom(1);ctx.beginPath();ctx.moveTo(W/2-h.half,h.y);ctx.lineTo(W/2+h.half,h.y);ctx.lineTo(W/2+b.half,H);ctx.lineTo(W/2-b.half,H);ctx.closePath();ctx.fillStyle='#9f989b';ctx.fill();
  // moving road slabs
  const count=16;for(let i=0;i<count;i++){const z0=(i/count+roadTime*state.speed)%1,z1=(z0+.065)%1;if(z1<z0)continue;const a=roadBoundsAtZ(z0),bb=roadBoundsAtZ(z1);ctx.beginPath();ctx.moveTo(a.l,a.y);ctx.lineTo(a.r,a.y);ctx.lineTo(bb.r,bb.y);ctx.lineTo(bb.l,bb.y);ctx.closePath();ctx.fillStyle=i%2?'rgba(255,255,255,.045)':'rgba(70,55,60,.065)';ctx.fill()}
  if(state.roadShine){ctx.save();ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=2.2;ctx.beginPath();ctx.moveTo(W/2-h.half,h.y);ctx.lineTo(W/2-b.half,H);ctx.moveTo(W/2+h.half,h.y);ctx.lineTo(W/2+b.half,H);ctx.stroke();ctx.restore()}
  // road speed streaks
  if(state.speedLines){ctx.save();ctx.strokeStyle='rgba(255,255,255,.72)';ctx.lineCap='round';for(let i=0;i<9;i++){const z=(i*.143+roadTime*state.speed*1.35)%1,p=roadBoundsAtZ(z);if(z<.35)continue;ctx.globalAlpha=(z-.3)*.9;ctx.lineWidth=2+5*z;const xOff=(i%2?-1:1)*p.half*(.55+.3*((i%3)/2));ctx.beginPath();ctx.moveTo(W/2+xOff,p.y-18-55*z);ctx.lineTo(W/2+xOff*(1.03),p.y+14+55*z);ctx.stroke()}ctx.restore()}
}
function padPoly(z,side,color){const depth=.115,z2=Math.min(1,z+depth),a=roadBoundsAtZ(z),b=roadBoundsAtZ(z2),gapA=4+8*a.e,gapB=5+10*b.e;let pts;if(side==='left')pts=[[a.l+gapA,a.y],[W/2-gapA,a.y],[W/2-gapB,b.y],[b.l+gapB,b.y]];else pts=[[W/2+gapA,a.y],[a.r-gapA,a.y],[b.r-gapB,b.y],[W/2+gapB,b.y]];const rgb=color==='red'?'255,47,47':'37,255,137';ctx.save();ctx.shadowColor='rgb('+rgb+')';ctx.shadowBlur=12+30*a.e;ctx.fillStyle='rgba('+rgb+',.82)';ctx.beginPath();ctx.moveTo(...pts[0]);pts.slice(1).forEach(p=>ctx.lineTo(...p));ctx.closePath();ctx.fill();ctx.restore();return{cx:pts.reduce((s,p)=>s+p[0],0)/4,cy:pts.reduce((s,p)=>s+p[1],0)/4,e:(a.e+b.e)/2}}
function drawImage(im,x,y,size,anchor='bottom'){if(!im)return;const w0=im.naturalWidth||im.width,h0=im.naturalHeight||im.height,ratio=w0/h0;let dw,dh;if(ratio>=1){dw=size;dh=size/ratio}else{dh=size;dw=size*ratio}ctx.drawImage(im,x-dw/2,anchor==='bottom'?y-dh:y-dh/2,dw,dh)}
function placeholder(x,y,size,label){ctx.save();ctx.fillStyle='rgba(0,0,0,.28)';ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(x-size*.28,y-size*.5,size*.56,size*.42,11);ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.font='800 '+Math.max(14,size*.13)+'px system-ui';ctx.textAlign='center';ctx.fillText(label,x,y-size*.23);ctx.restore()}
function drawRows(){state.rows.forEach((row,i)=>{let z=(i*state.rowGap+roadTime*state.speed*.95)%1;if(z<.04||z>.90)return;const l=padPoly(z,'left',row.leftColor),r=padPoly(z,'right',row.rightColor),scale=.24+1.22*l.e,ls=row.leftSize*scale,rs=row.rightSize*scale,y=l.cy+10+44*l.e;row.leftImg?drawImage(row.leftImg,l.cx,y,ls,'bottom'):placeholder(l.cx,y,ls,'PNG');row.rightImg?drawImage(row.rightImg,r.cx,y,rs,'bottom'):placeholder(r.cx,y,rs,'PNG')})}
function drawTarget(){const p=roadBoundsAtZ(state.targetZ),s=state.targetSize*(.38+.88*p.e);if(state.target)drawImage(state.target,W/2,p.y+9,s,'bottom');else placeholder(W/2,p.y+5,s,'TARGET')}
function drawRunner(){const bob=Math.sin(roadTime*7)*2.5,x=W/2+state.runnerX,y=state.runnerY+bob;if(state.runner){ctx.save();ctx.shadowColor='rgba(0,0,0,.32)';ctx.shadowBlur=18;ctx.shadowOffsetY=10;drawImage(state.runner,x,y,state.runnerSize,'bottom');ctx.restore()}else{ctx.save();ctx.fillStyle='#f4f1f1';ctx.beginPath();ctx.arc(x,y-state.runnerSize*.62,state.runnerSize*.18,0,Math.PI*2);ctx.fill();ctx.fillRect(x-state.runnerSize*.24,y-state.runnerSize*.46,state.runnerSize*.48,state.runnerSize*.46);ctx.fillStyle='#171719';ctx.font='800 '+Math.max(15,state.runnerSize*.11)+'px system-ui';ctx.textAlign='center';ctx.fillText('YOUR PNG',x,y-state.runnerSize*.18);ctx.restore()}}
function frame(now){const dt=Math.min(.05,(now-last)/1000);last=now;if(running)roadTime+=dt;drawBackground();drawRoad();drawTarget();drawRows();drawRunner();requestAnimationFrame(frame)}requestAnimationFrame(frame);
$('playBtn').onclick=()=>{running=!running;$('playBtn').textContent=running?'Pause':'Play'};$('resetBtn').onclick=()=>roadTime=0;
$('saveBtn').onclick=()=>{const save={...state,runner:null,target:null,rows:state.rows.map(r=>({...r,leftImg:null,rightImg:null}))};localStorage.setItem('runnerStudioV2',JSON.stringify(save));alert('Saved on this device')};
$('loadBtn').onclick=async()=>{const raw=localStorage.getItem('runnerStudioV2');if(!raw)return alert('No save found on this device');const s=JSON.parse(raw);Object.assign(state,s);['speed','roadWidth','horizon','perspectivePower','rowGap','runnerSize','runnerX','runnerY','targetSize','targetZ'].forEach(id=>{$(id).value=state[id]});$('speedLines').checked=state.speedLines;$('roadShine').checked=state.roadShine;$('runnerRemoveBg').checked=state.runnerRemoveBg;$('targetRemoveBg').checked=state.targetRemoveBg;if(state.runnerSrc)state.runner=await dataToProcessedImage(state.runnerSrc,state.runnerRemoveBg);if(state.targetSrc)state.target=await dataToProcessedImage(state.targetSrc,state.targetRemoveBg);$('rows').innerHTML='';const rows=s.rows||[];state.rows=[];rows.forEach(addRow);alert('Loaded')};
$('logoutBtn').onclick=async()=>{await fetch('/api/logout',{method:'POST'});location.href='/'};
$('exportBtn').onclick=()=>{if(recorder)return;const sec=Math.max(2,Math.min(60,+$('recordSec').value||15)),stream=canvas.captureStream(30);let mime='video/webm;codecs=vp9';if(!MediaRecorder.isTypeSupported(mime))mime='video/webm';const chunks=[];recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8000000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};recorder.onstop=()=>{const blob=new Blob(chunks,{type:mime}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='runner-video.webm';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);recorder=null;$('exportBtn').textContent='Export Video'};recorder.start();$('exportBtn').textContent='Recording...';setTimeout(()=>{if(recorder&&recorder.state!=='inactive')recorder.stop()},sec*1000)};
})();
</script></body></html>`;

const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,`http://${req.headers.host||'localhost'}`),pathname=decodeURIComponent(u.pathname);
  if(pathname==='/api/auth/status'&&req.method==='GET')return send(res,200,JSON.stringify({authenticated:authed(req)}),'application/json; charset=utf-8');
  if(pathname==='/api/login'&&req.method==='POST'){
    try{const body=await readJson(req);if(!safeEqual(body.password||'',APP_PASSWORD))return send(res,401,JSON.stringify({ok:false,error:'Wrong password'}),'application/json; charset=utf-8');
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
server.listen(PORT,()=>console.log(`Private Runner Studio V2 running on http://localhost:${PORT}`));
