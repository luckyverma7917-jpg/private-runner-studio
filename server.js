const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Private Runner Studio - Depth & Evolution Pro</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, sans-serif; }
    body { background: #0d1117; color: #c9d1d9; display: flex; height: 100vh; overflow: hidden; }
    
    /* SIDEBAR CONTROLS */
    #sidebar {
      width: 420px;
      background: #161b22;
      border-right: 1px solid #30363d;
      padding: 16px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    h2 { font-size: 1.1rem; color: #58a6ff; border-bottom: 1px solid #30363d; padding-bottom: 6px; }
    .group { background: #21262d; border-radius: 8px; padding: 12px; border: 1px solid #30363d; }
    label { font-size: 0.78rem; font-weight: 600; color: #8b949e; display: block; margin-top: 8px; margin-bottom: 4px; }
    input[type="text"], select, input[type="range"] {
      width: 100%;
      background: #0d1117;
      color: #fff;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 6px 8px;
      font-size: 0.8rem;
    }
    input[type="file"] { font-size: 0.75rem; color: #8b949e; width: 100%; }
    .flex-row { display: flex; gap: 8px; align-items: center; }
    .btn {
      background: #238636;
      color: #fff;
      border: none;
      padding: 10px;
      border-radius: 6px;
      font-weight: bold;
      cursor: pointer;
      text-align: center;
      transition: 0.2s;
    }
    .btn:hover { background: #2ea043; }
    .btn-export { background: #1f6feb; margin-top: 10px; }
    .btn-export:hover { background: #388bfd; }

    /* ROW BOX */
    .row-card {
      background: #161b22;
      border: 1px solid #30363d;
      border-radius: 6px;
      padding: 8px;
      margin-top: 8px;
    }
    .row-title { font-size: 0.82rem; font-weight: bold; color: #f0883e; margin-bottom: 4px; }

    /* VIEWPORT */
    #viewport-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: #010409;
      position: relative;
    }
    #canvas-wrap {
      width: 360px;
      height: 640px;
      box-shadow: 0 0 30px rgba(0,0,0,0.8);
      border-radius: 12px;
      overflow: hidden;
      background: #000;
      position: relative;
    }
    canvas { width: 100%; height: 100%; display: block; }
    #status-bar {
      position: absolute;
      top: 10px;
      background: rgba(0,0,0,0.7);
      color: #3fb950;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.75rem;
      border: 1px solid #30363d;
    }
  </style>
</head>
<body>

  <!-- CONTROLS SIDEBAR -->
  <div id="sidebar">
    <h2>🎮 Private Runner Pro Studio</h2>

    <!-- SPEED CONTROLS -->
    <div class="group">
      <div class="row-title">⚡ Speed & Motion Controllers</div>
      <label>Run Speed (दौड़ने की स्पीड): <span id="val-speed">1.0x</span></label>
      <input type="range" id="runSpeed" min="0.3" max="2.5" step="0.1" value="1.0">

      <label>Lane Switch Speed (लेन बदलने की स्मूथनेस): <span id="val-switch">Normal</span></label>
      <input type="range" id="switchSpeed" min="1" max="5" step="1" value="3">
    </div>

    <!-- INITIAL CHARACTER -->
    <div class="group">
      <div class="row-title">👤 Starting Runner Character</div>
      <label>Initial PNG (शुरुआती रूप - जैसे Skinny):</label>
      <input type="file" id="startCharFile" accept="image/png, image/jpeg, image/webp">
    </div>

    <!-- 5 ROWS CONFIGURATION WITH LAYER & EVOLUTION -->
    <div class="group">
      <div class="row-title">🛣️ 5 Rows: Lane Path & Evolution PNGs</div>
      <div id="rows-wrapper"></div>
    </div>

    <!-- OPPONENT / BOSS -->
    <div class="group">
      <div class="row-title">🥊 Final Boss Setup</div>
      <label>Boss PNG (जैसे Cactus Boxer):</label>
      <input type="file" id="bossCharFile" accept="image/png, image/jpeg, image/webp">
    </div>

    <!-- ACTION BUTTONS -->
    <button class="btn" id="btnPlayPause">▶ Play / Pause Animation</button>
    <button class="btn btn-export" id="btnExportVideo">🔴 Export 60FPS HD Video</button>
  </div>

  <!-- CANVAS DISPLAY -->
  <div id="viewport-container">
    <div id="status-bar">Studio Ready</div>
    <div id="canvas-wrap">
      <canvas id="gameCanvas" width="720" height="1280"></canvas>
    </div>
  </div>

  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const statusBar = document.getElementById('status-bar');

    // CONFIG STATE
    let runSpeed = 1.0;
    let switchSpeed = 3;
    let isPlaying = true;
    let trackProgress = 0; // 0 to 1
    
    // Character images storage
    let startCharImg = null;
    let bossCharImg = null;
    const rowCharImgs = [null, null, null, null, null];

    // Rows Data (Target Lane: -1 for Left, 1 for Right)
    const rowConfigs = [
      { lane: -1, z: 0.20, colorL: '#39ff14', colorR: '#ff0033' },
      { lane: 1,  z: 0.38, colorL: '#ff0033', colorR: '#39ff14' },
      { lane: 1,  z: 0.56, colorL: '#00e5ff', colorR: '#ff9900' },
      { lane: -1, z: 0.74, colorL: '#39ff14', colorR: '#ff0033' },
      { lane: 1,  z: 0.90, colorL: '#ff0033', colorR: '#39ff14' }
    ];

    // BUILD UI FOR ROWS
    const rowsWrapper = document.getElementById('rows-wrapper');
    rowConfigs.forEach((row, i) => {
      const card = document.createElement('div');
      card.className = 'row-card';
      card.innerHTML = \`
        <div class="flex-row" style="justify-content: space-between;">
          <span style="font-weight:bold; font-size:0.8rem; color:#58a6ff;">Row \${i+1}</span>
          <select id="laneSelect_\${i}" style="width: 140px;">
            <option value="-1" \${row.lane === -1 ? 'selected' : ''}>Slide LEFT ⬅</option>
            <option value="1" \${row.lane === 1 ? 'selected' : ''}>Slide RIGHT ➡</option>
          </select>
        </div>
        <label>Next Evolution PNG (पैड पार करते ही नया रूप):</label>
        <input type="file" id="rowFile_\${i}" accept="image/png, image/jpeg, image/webp">
      \`;
      rowsWrapper.appendChild(card);

      document.getElementById(\`laneSelect_\${i}\`).addEventListener('change', (e) => {
        rowConfigs[i].lane = parseInt(e.target.value);
      });

      document.getElementById(\`rowFile_\${i}\`).addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const img = new Image();
          img.src = URL.createObjectURL(file);
          img.onload = () => { rowCharImgs[i] = img; };
        }
      });
    });

    // FILE INPUT LISTENERS
    document.getElementById('startCharFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => { startCharImg = img; };
      }
    });

    document.getElementById('bossCharFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => { bossCharImg = img; };
      }
    });

    // SPEED SLIDERS
    document.getElementById('runSpeed').addEventListener('input', (e) => {
      runSpeed = parseFloat(e.target.value);
      document.getElementById('val-speed').innerText = runSpeed.toFixed(1) + 'x';
    });
    document.getElementById('switchSpeed').addEventListener('input', (e) => {
      switchSpeed = parseInt(e.target.value);
      const labels = ['Very Slow', 'Slow', 'Normal', 'Fast', 'Instant'];
      document.getElementById('val-switch').innerText = labels[switchSpeed - 1];
    });

    // ROAD PERSPECTIVE PROJECTION
    const horizonY = 320;
    const bottomY = 1220;
    const roadTopW = 120;
    const roadBotW = 600;
    const centerX = 360;

    function getPerspective(z) {
      // z is 0 (far horizon) to 1 (near bottom)
      const y = horizonY + (bottomY - horizonY) * z;
      const roadW = roadTopW + (roadBotW - roadTopW) * z;
      const scale = 0.2 + 0.8 * z;
      return { y, roadW, scale };
    }

    // INTERPOLATED CHARACTER POSITION
    let currentCharX = centerX;
    let targetCharX = centerX;

    function renderFrame() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // 1. SKY / BACKGROUND
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
      skyGrad.addColorStop(0, '#000814');
      skyGrad.addColorStop(1, '#001d3d');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, canvas.width, horizonY);

      // Speed lines / star effect
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      for(let i=0; i<15; i++) {
        let lx = (Math.sin(i*99 + trackProgress*10) * 0.5 + 0.5) * canvas.width;
        let ly = (Math.cos(i*33) * 0.5 + 0.5) * horizonY;
        ctx.fillRect(lx, ly, 2, 8);
      }

      // 2. ROAD BASE
      ctx.beginPath();
      ctx.moveTo(centerX - roadTopW/2, horizonY);
      ctx.lineTo(centerX + roadTopW/2, horizonY);
      ctx.lineTo(centerX + roadBotW/2, bottomY);
      ctx.lineTo(centerX - roadBotW/2, bottomY);
      ctx.closePath();
      
      const roadGrad = ctx.createLinearGradient(0, horizonY, 0, bottomY);
      roadGrad.addColorStop(0, '#001e3d');
      roadGrad.addColorStop(1, '#003566');
      ctx.fillStyle = roadGrad;
      ctx.fill();

      // Glowing Neon Borders
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 6;
      ctx.stroke();

      // Center Divider Neon Line
      ctx.beginPath();
      ctx.moveTo(centerX, horizonY);
      ctx.lineTo(centerX, bottomY);
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 3;
      ctx.setLineDash([20, 20]);
      ctx.lineDashOffset = -trackProgress * 300;
      ctx.stroke();
      ctx.setLineDash([]);

      // 3. DETERMINE CURRENT ACTIVE EVOLUTION & LANE SHIFT
      let activeCharacterImg = startCharImg;
      let targetLaneDir = rowConfigs[0].lane;

      // Check which row has passed
      for (let i = 0; i < rowConfigs.length; i++) {
        const rowRelativeZ = (rowConfigs[i].z - trackProgress + 1.0) % 1.0;
        // When pad passes player (near Z ~ 0.85)
        if (rowRelativeZ < 0.25 && rowCharImgs[i]) {
          activeCharacterImg = rowCharImgs[i];
        }
        if (trackProgress >= rowConfigs[i].z - 0.15) {
          targetLaneDir = rowConfigs[i].lane;
        }
      }

      // Smooth Lane Transition (Lerp based on switchSpeed)
      const pPlayer = getPerspective(0.85);
      const laneOffset = (pPlayer.roadW * 0.25) * targetLaneDir;
      targetCharX = centerX + laneOffset;

      const lerpRates = [0.03, 0.06, 0.12, 0.25, 0.95];
      const currentLerp = lerpRates[switchSpeed - 1];
      currentCharX += (targetCharX - currentCharX) * currentLerp;

      // 4. DRAW BOSS AT FAR END
      const pBoss = getPerspective(0.18);
      if (bossCharImg) {
        const bw = 160 * pBoss.scale;
        const bh = 220 * pBoss.scale;
        ctx.drawImage(bossCharImg, centerX - bw/2, pBoss.y - bh, bw, bh);
      } else {
        // Fallback Boss Placeholder
        ctx.fillStyle = '#ff9900';
        ctx.fillRect(centerX - 30, pBoss.y - 60, 60, 60);
      }

      // ==============================================================
      // 5. DEPTH FIX: DRAW RUNNER CHARACTER (BEHIND PADS)
      // ==============================================================
      const runnerY = pPlayer.y;
      const runnerScale = pPlayer.scale;
      const charWidth = 140 * runnerScale;
      const charHeight = 220 * runnerScale;

      ctx.save();
      if (activeCharacterImg) {
        ctx.drawImage(
          activeCharacterImg,
          currentCharX - charWidth/2,
          runnerY - charHeight,
          charWidth,
          charHeight
        );
      } else {
        // Default Clean Runner Dummy
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.roundRect(currentCharX - charWidth/2, runnerY - charHeight, charWidth, charHeight, 16);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px Segoe UI';
        ctx.textAlign = 'center';
        ctx.fillText('RUNNER', currentCharX, runnerY - charHeight/2);
      }
      ctx.restore();

      // ==============================================================
      // 6. DEPTH FIX: DRAW GLOWING PADS OVER THE CHARACTER
      // ==============================================================
      rowConfigs.forEach((row, i) => {
        // Move pads toward camera
        let rZ = (row.z - trackProgress + 1.0) % 1.0;
        if (rZ > 0.05 && rZ < 0.98) {
          const p = getPerspective(rZ);
          const padWidth = p.roadW * 0.42;
          const padHeight = 28 * p.scale;
          const padY = p.y;

          // LEFT PAD
          const leftX = centerX - (p.roadW * 0.25) - padWidth/2;
          drawGlowingGate(leftX, padY, padWidth, padHeight, row.colorL, 'LEFT');

          // RIGHT PAD
          const rightX = centerX + (p.roadW * 0.25) - padWidth/2;
          drawGlowingGate(rightX, padY, padWidth, padHeight, row.colorR, 'RIGHT');
        }
      });

      // UPDATE PROGRESS
      if (isPlaying) {
        trackProgress += 0.0018 * runSpeed;
        if (trackProgress >= 1.0) trackProgress = 0;
      }

      requestAnimationFrame(renderFrame);
    }

    // HELPER: GLOWING 3D GLASS PAD/GATE
    function drawGlowingGate(x, y, w, h, color, text) {
      ctx.save();
      // Outer Glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 20;

      // Base Pad Body
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.roundRect(x, y - h, w, h, 8);
      ctx.fill();

      // Top Glass Highlight
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x + 4, y - h + 2, w - 8, h * 0.35);

      // Pad Border
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 1.0;
      ctx.stroke();

      ctx.restore();
    }

    // PLAY/PAUSE
    const btnPlayPause = document.getElementById('btnPlayPause');
    btnPlayPause.addEventListener('click', () => {
      isPlaying = !isPlaying;
      btnPlayPause.innerText = isPlaying ? '⏸ Pause Animation' : '▶ Play Animation';
    });

    // 60FPS WEBM / MP4 RECORDER
    const btnExport = document.getElementById('btnExportVideo');
    let mediaRecorder = null;
    let recordedChunks = [];

    btnExport.addEventListener('click', () => {
      if (mediaRecorder && mediaRecorder.state === 'recording') return;

      trackProgress = 0;
      isPlaying = true;
      recordedChunks = [];

      const stream = canvas.captureStream(60); // Clean 60 FPS
      mediaRecorder = new MediaRecorder(stream, { mimeType: 'video/webm; codecs=vp9' });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Runner_Depth_Evolution_Video.webm';
        a.click();
        statusBar.innerText = '✅ Export Complete!';
        statusBar.style.color = '#3fb950';
      };

      mediaRecorder.start();
      statusBar.innerText = '🔴 Recording 60FPS Video...';
      statusBar.style.color = '#f85149';

      // Record for 1 full clean loop (~12 to 15 seconds)
      const recordDuration = (1.0 / (0.0018 * runSpeed)) * 16.6;
      setTimeout(() => {
        mediaRecorder.stop();
      }, Math.min(recordDuration, 25000));
    });

    // START ENGINE
    requestAnimationFrame(renderFrame);
  </script>
</body>
</html>`);
});

app.listen(port, () => {
  console.log('Server is running on port ' + port);
});
