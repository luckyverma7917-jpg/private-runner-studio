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
<head><meta charset="utf-8"><title>Login</title></head>
<body style="background:#0b0d10;color:#fff;display:grid;place-items:center;height:100vh;font-family:sans-serif">
  <form id="f" style="background:#15181e;padding:30px;border-radius:14px;display:grid;gap:15px;width:320px">
    <h3>Private Runner Studio</h3>
    <input id="p" type="password" placeholder="Password" style="padding:12px;border-radius:8px;border:1px solid #333;background:#0b0d10;color:#fff">
    <button style="padding:12px;background:#61f0a6;border:0;border-radius:8px;font-weight:bold;cursor:pointer">Login</button>
  </form>
  <script>
  f.onsubmit=async(e)=>{e.preventDefault();const r=await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p.value})});if(r.ok)location.href='/app';else alert('Wrong password');};
  </script>
</body>
</html>`;

const APP_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Studio</title></head>
<body style="background:#0b0d10;color:#fff;font-family:sans-serif;text-align:center;padding:50px">
  <h1>Private Runner Studio is Live!</h1>
  <p>Opponent Boss & 60FPS Export enabled successfully.</p>
  <button onclick="location.href='/api/logout'" style="padding:10px 20px;background:#ff3347;color:#fff;border:0;border-radius:8px;cursor:pointer">Logout</button>
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
