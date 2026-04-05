const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { createProxyServer } = require('http-proxy');

const profilesRouter = require('./routes/profiles');
const browsersRouter = require('./routes/browsers');
const browserService = require('./services/browser');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/profiles', profilesRouter);
app.use('/api/browsers', browsersRouter);

// Load noVNC bundle into memory at startup for inline embedding
const noVNCBundle = fs.readFileSync(path.join(__dirname, 'public', 'novnc-bundle.js'), 'utf8');

// noVNC viewer page
app.get('/vnc/:profileId', (req, res) => {
  const info = browserService.getBrowserInfo(req.params.profileId);
  if (!info) return res.status(404).send('Browser not running');

  const wsPort = info.wsPort;
  const profileId = req.params.profileId;

  // Build HTML with inlined noVNC bundle to avoid external script loading issues
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>VNC</title>
<style>
body{margin:0;overflow:hidden;background:#111}
#screen{width:100vw;height:100vh}
#log{position:fixed;top:0;left:0;right:0;padding:10px 16px;background:#222;color:#0f0;font:14px/1.5 monospace;z-index:99999;white-space:pre-wrap;max-height:40vh;overflow:auto}
</style>
</head><body>
<div id="log">VNC 页面已加载</div>
<div id="screen"></div>
<script>
var _log = document.getElementById('log');
function addLog(msg, color) {
  var line = document.createElement('div');
  line.style.color = color || '#0f0';
  line.textContent = new Date().toLocaleTimeString() + ' ' + msg;
  _log.appendChild(line);
  _log.scrollTop = _log.scrollHeight;
}
window.onerror = function(msg, src, line, col) {
  addLog('JS: ' + msg, '#f55');
};
</script>
<script>
// --- noVNC bundle (inlined) ---
${noVNCBundle}
</script>
<script>
function setupClipboard(rfb) {
  // Remote -> Local: when VNC server sends clipboard content
  rfb.addEventListener('clipboard', function(ev) {
    if (ev.detail && ev.detail.text) {
      navigator.clipboard.writeText(ev.detail.text).catch(function(){});
    }
  });

  // Local -> Remote: listen for paste events and Ctrl+V, send to VNC
  document.addEventListener('paste', function(ev) {
    var text = ev.clipboardData && ev.clipboardData.getData('text');
    if (text && rfb._rfbConnectionState === 'connected') {
      rfb.clipboardPasteFrom(text);
    }
  });

  // Also listen for postMessage from parent iframe (BrowserView)
  window.addEventListener('message', function(ev) {
    if (ev.data && ev.data.type === 'clipboard-paste' && ev.data.text) {
      if (rfb._rfbConnectionState === 'connected') {
        rfb.clipboardPasteFrom(ev.data.text);
      }
    }
  });

  // Periodically sync local clipboard to VNC (when focused)
  document.addEventListener('focus', function() {
    if (navigator.clipboard && navigator.clipboard.readText) {
      navigator.clipboard.readText().then(function(text) {
        if (text && rfb._rfbConnectionState === 'connected') {
          rfb.clipboardPasteFrom(text);
        }
      }).catch(function(){});
    }
  }, true);
}

addLog('RFB=' + (typeof window.noVNC_RFB));
try {
  var RFB = window.noVNC_RFB;
  if (!RFB) throw new Error('RFB undefined');
  var wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  var urls = [
    { url: wsProto + '://' + location.hostname + ':${wsPort}', label: '直连' },
    { url: wsProto + '://' + location.host + '/ws-vnc/${profileId}', label: '代理' },
  ];
  function tryVNC(idx) {
    if (idx >= urls.length) { addLog('所有连接均失败', '#f55'); return; }
    var e = urls[idx];
    addLog(e.label + ' → ' + e.url);
    document.getElementById('screen').innerHTML = '';
    var rfb = new RFB(document.getElementById('screen'), e.url);
    rfb.scaleViewport = true; rfb.resizeSession = true;
    var ok = false;
    var t = setTimeout(function(){ if(!ok){ addLog(e.label+' 超时','#ff0'); try{rfb.disconnect();}catch(x){} tryVNC(idx+1); } }, 8000);
    rfb.addEventListener('connect', function(){
      ok=true; clearTimeout(t);
      addLog('VNC 已连接! ('+e.label+')','#0f0');
      setTimeout(function(){_log.style.display='none';},3000);
      window._rfb = rfb;
      setupClipboard(rfb);
    });
    rfb.addEventListener('disconnect', function(ev){ clearTimeout(t); if(!ok){ addLog(e.label+' 断开','#ff0'); tryVNC(idx+1); } else { addLog('连接断开','#ff0'); _log.style.display='block'; }});
  }
  tryVNC(0);
} catch(ex) { addLog('错误: '+ex.message,'#f55'); }
</script></body></html>`;

  res.type('html').send(html);

});

app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/{*path}', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'client', 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).json({ error: 'Frontend not built yet' });
  }
});

const dataDir = path.join(__dirname, 'data', 'profiles');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const server = http.createServer(app);

// WebSocket proxy: route /ws-vnc/:profileId to websockify port
const wsProxy = createProxyServer({ ws: true });
wsProxy.on('error', (err) => {
  console.error('[WS-Proxy] Error:', err.message);
});

server.on('upgrade', (req, socket, head) => {
  const match = req.url.match(/^\/ws-vnc\/([a-f0-9-]+)/);
  if (!match) { socket.destroy(); return; }

  const info = browserService.getBrowserInfo(match[1]);
  if (!info) { socket.destroy(); return; }

  console.log(`[WS-Proxy] Proxying WS to websockify port ${info.wsPort}`);
  wsProxy.ws(req, socket, head, {
    target: `ws://127.0.0.1:${info.wsPort}`,
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Fingerprint Browser Manager running on http://0.0.0.0:${PORT}`);
});

process.on('SIGINT', async () => {
  console.log('\n[Server] Shutting down...');
  await browserService.closeAllBrowsers();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await browserService.closeAllBrowsers();
  process.exit(0);
});
