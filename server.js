const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

const htmlContent = `<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Private Runner Studio</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', sans-serif; }
    body { background: #0d1117; color: #c9d1d9; display: flex; height: 100vh; overflow: hidden; }
    #sidebar { width: 420px; background: #161b22; border-right: 1px solid #30363d; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
    h2 { font-size: 1.1rem; color: #58a6ff; border-bottom: 1px solid #30363d; padding-bottom: 6px; }
    .group { background: #21262d; border-radius: 8px; padding: 12px; border: 1px solid #30363d; }
    label { font-size: 0.78rem; font-weight: 600; color: #8b949e; display: block; margin-top: 8px; margin-bottom: 4px; }
    input[type="range"] { width: 100%; }
    input[type="file"], select { width: 100%; background: #0d1117; color: #fff; border: 1px solid #30363d; border-radius: 6px; padding: 6px; font-size: 0.8rem; }
    .flex-row { display: flex; gap: 8px; align-items: center; justify-content: space-between; }
    .btn { background: #238636; color: #fff; border: none; padding: 10px; border-radius: 6px; font-weight: bold; cursor: pointer; text-align: center; }
    .btn:hover { background: #2ea043; }
    .btn-export { background: #1f6feb; }
    .btn-export:hover { background: #388bfd; }
    .row-card { background: #161b22; border: 1px solid #30363d; border-radius: 6px; padding: 8px; margin-top: 8px; }
    #viewport-container { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #010409; }
    #canvas-wrap { width: 360px; height: 640px; box-shadow: 0 0 30px rgba(0,0,0,0.8); border-radius: 12px; overflow: hidden; background: #000; }
    canvas { width: 100%; height: 100%; display: block; }
  </style>
</head>
<body>
  <div id="sidebar">
    <h2>🎮 Private Runner Pro Studio</h2>
    <div class="group">
      <div style="font-weight:bold; font-size:0.82rem; color:#f0883e;">⚡ Speed Controllers</div>
      <label>Run Speed: <span id="v-sp">1.0x</span></label>
      <input type="range" id="rSpeed" min="0.3" max="2.5" step="0.1" value="1.0">
      <label>Lane Switch Speed: <span id="v-sw">Normal</span></label>
      <input type="range" id="sSpeed" min="1" max="5" step="1" value="3">
    </div>

    <div class="group">
      <div style="font-weight:bold; font-size:0.82rem; color:#f0883e;">👤 Starting Runner</div>
      <label>Initial PNG:</label>
      <input type="file" id="startChar" accept="image/*">
    </div>

    <div class="group">
      <div style="font-weight:bold; font-size:0.82rem; color:#f0883e;">🛣️ 5 Rows: Lane & Evolution PNG</div>
      <div id="rows-box"></div>
    </div>

    <div class="group">
      <div style="font-weight:bold; font-size:0.82rem; color:#f0883e;">🥊 Boss Setup</div>
      <label>Boss PNG:</label>
      <input type="file" id="bossChar" accept="image/*">
    </div>

    <button class="btn" id="btnPlay">▶ Play / Pause</button>
    <button class="btn btn-export" id="btnExport">🔴 Export 60FPS Video</button>
  </div>

  <div id="viewport-container">
    <div id="canvas-wrap">
      <canvas id="cvs" width="720" height="1280"></canvas>
    </div>
  </div>

  <script>
    var cvs = document.getElementById('cvs');
    var ctx = cvs.getContext('2d');
    var runSpeed = 1.0;
    var switchSpeed = 3;
    var isPlaying = true;
    var trackProgress = 0;
    var startImg = null;
    var bossImg = null;
    var rowImgs = [null, null, null, null, null];
    var rowConfigs = [
      { lane: -1, z: 0.20, cL: '#39ff14', cR: '#ff0033' },
      { lane: 1,  z: 0.38, cL: '#ff0033', cR: '#39ff14' },
      { lane: 1,  z: 0.56, cL: '#00e5ff', cR: '#ff9900' },
      { lane: -1, z: 0.74, cL: '#39ff14', cR: '#ff0033' },
      { lane: 1,  z: 0.90, cL: '#ff0033', cR: '#39ff14' }
    ];

    var box = document.getElementById('rows-box');
    rowConfigs.forEach(function(row, i) {
      var d = document.createElement('div');
      d.className = 'row-card';
      var sL = row.lane === -1 ? 'selected' : '';
      var sR = row.lane === 1 ? 'selected' : '';
      d.innerHTML = '<div class="flex-row"><span style="color:#58a6ff; font-weight:bold; font-size:0.8rem;">Row ' + (i+1) + '</span><select id="sel_' + i + '" style="width:130px;"><option value="-1" ' + sL + '>LEFT ⬅</option><option value="1" ' + sR + '>RIGHT ➡</option></select></div><label>Evolution PNG:</label><input type="file" id="f_' + i + '" accept="image/*">';
      box.appendChild(d);

      document.getElementById('sel_' + i).onchange = function(e) {
        rowConfigs[i].lane = parseInt(e.target.value);
      };
      document.getElementById('f_' + i).onchange = function(e) {
        if(e.target.files[0]) {
          var img = new Image();
          img.src = URL.createObjectURL(e.target.files[0]);
          rowImgs[i] = img;
        }
      };
    });

    document.getElementById('startChar').onchange = function(e) {
      if(e.target.files[0]) {
        startImg = new Image();
        startImg.src = URL.createObjectURL(e.target.files[0]);
      }
    };
    document.getElementById('bossChar').onchange = function(e) {
      if(e.target.files[0]) {
        bossImg = new Image();
        bossImg.src = URL.createObjectURL(e.target.files[0]);
      }
    };

    document.getElementById('rSpeed').oninput = function(e) {
      runSpeed = parseFloat(e.target.value);
      document.getElementById('v-sp').innerText = runSpeed.toFixed(1) + 'x';
    };
    document.getElementById('sSpeed').oninput = function(e) {
      switchSpeed = parseInt(e.target.value);
      var lbls = ['Very Slow', 'Slow', 'Normal', 'Fast', 'Instant'];
      document.getElementById('v-sw').innerText = lbls[switchSpeed - 1];
    };

    var hY = 320, bY = 1220, topW = 120, botW = 600, midX = 360;
    function getP(z) {
      return { y: hY + (bY - hY) * z, w: topW + (botW - topW) * z, sc: 0.2 + 0.8 * z };
    }

    var curX = midX, tarX = midX;
    function draw() {
      ctx.clearRect(0, 0, cvs.width, cvs.height);

      ctx.fillStyle = '#001428';
      ctx.fillRect(0, 0, cvs.width, hY);

      ctx.beginPath();
      ctx.moveTo(midX - topW/2, hY);
      ctx.lineTo(midX + topW/2, hY);
      ctx.lineTo(midX + botW/2, bY);
      ctx.lineTo(midX - botW/2, bY);
      ctx.closePath();
      ctx.fillStyle = '#002855';
      ctx.fill();
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 5;
      ctx.stroke();

      var actImg = startImg;
      var dir = rowConfigs[0].lane;
      for(var i=0; i<rowConfigs.length; i++) {
        var rZ = (rowConfigs[i].z - trackProgress + 1.0) % 1.0;
        if(rZ < 0.25 && rowImgs[i]) actImg = rowImgs[i];
        if(trackProgress >= rowConfigs[i].z - 0.15) dir = rowConfigs[i].lane;
      }

      var pl = getP(0.85);
      tarX = midX + (pl.w * 0.25) * dir;
      var lerps = [0.03, 0.06, 0.12, 0.25, 0.95];
      curX += (tarX - curX) * lerps[switchSpeed - 1];

      var bs = getP(0.18);
      if(bossImg) {
        var bw = 160 * bs.sc, bh = 220 * bs.sc;
        ctx.drawImage(bossImg, midX - bw/2, bs.y - bh, bw, bh);
      }

      // 1. CHARACTER DRAWN BEHIND PADS
      var cw = 140 * pl.sc, ch = 220 * pl.sc;
      if(actImg) {
        ctx.drawImage(actImg, curX - cw/2, pl.y - ch, cw, ch);
      } else {
        ctx.fillStyle = '#00a6fb';
        ctx.fillRect(curX - cw/2, pl.y - ch, cw, ch);
      }

      // 2. PADS DRAWN OVER CHARACTER (DEPTH)
      rowConfigs.forEach(function(r) {
        var rZ = (r.z - trackProgress + 1.0) % 1.0;
        if(rZ > 0.05 && rZ < 0.98) {
          var p = getP(rZ);
          var pw = p.w * 0.42, ph = 28 * p.sc;
          drawGate(midX - (p.w * 0.25) - pw/2, p.y, pw, ph, r.cL);
          drawGate(midX + (p.w * 0.25) - pw/2, p.y, pw, ph, r.cR);
        }
      });

      if(isPlaying) {
        trackProgress += 0.0018 * runSpeed;
        if(trackProgress >= 1.0) trackProgress = 0;
      }
      requestAnimationFrame(draw);
    }

    function drawGate(x, y, w, h, col) {
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 18;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(x, y - h, w, h);
      ctx.fillStyle = '#fff';
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x + 4, y - h + 2, w - 8, h * 0.35);
      ctx.restore();
    }

    document.getElementById('btnPlay').onclick = function() {
      isPlaying = !isPlaying;
      this.innerText = isPlaying ? '⏸ Pause' : '▶ Play';
    };

    var mr = null, chunks = [];
    document.getElementById('btnExport').onclick = function() {
      if(mr && mr.state === 'recording') return;
      trackProgress = 0;
      isPlaying = true;
      chunks = [];
      var stream = cvs.captureStream(60);
      mr = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mr.ondataavailable = function(e) { if(e.data.size > 0) chunks.push(e.data); };
      mr.onstop = function() {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
        a.download = 'Runner_Video.webm';
        a.click();
      };
      mr.start();
      var dur = (1.0 / (0.0018 * runSpeed)) * 16.6;
      setTimeout(function() { mr.stop(); }, Math.min(dur, 22000));
    };

    requestAnimationFrame(draw);
  </script>
</body>
</html>`;

app.get('*', (req, res) => {
  res.send(htmlContent);
});

app.listen(port, () => {
  console.log('App running on port ' + port);
});
