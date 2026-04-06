let cloakBinaryPath = null;
const cloakReady = import('cloakbrowser')
  .then(async (m) => {
    await m.ensureBinary();
    const info = m.binaryInfo();
    cloakBinaryPath = info.binaryPath;
    console.log(`[Browser] CloakBrowser v${info.version} binary: ${cloakBinaryPath}`);
  })
  .catch((e) => { console.log('[Browser] CloakBrowser not available:', e.message); });

const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const database = require('./database');
const { getRelay } = require('./proxy-relay');

const activeBrowsers = new Map();

const DISPLAY_BASE = 100;
const VNC_PORT_BASE = 5900;
const WEBSOCKIFY_PORT_BASE = 6080;
const USER_DATA_BASE = path.join(__dirname, '..', 'data', 'profiles');

let displayCounter = 0;

function getNextDisplay() {
  displayCounter++;
  return DISPLAY_BASE + displayCounter;
}

async function launchBrowser(profileId) {
  await cloakReady;

  if (activeBrowsers.has(profileId)) {
    return activeBrowsers.get(profileId);
  }

  const profile = database.getProfile(profileId);
  if (!profile) throw new Error('Profile not found');

  const fp = profile.fingerprint;
  const displayNum = getNextDisplay();
  const display = `:${displayNum}`;
  const vncPort = VNC_PORT_BASE + displayNum;
  const wsPort = WEBSOCKIFY_PORT_BASE + displayNum;

  const screenW = fp.screen?.width || 1280;
  const screenH = fp.screen?.height || 720;

  const userDataDir = path.join(USER_DATA_BASE, profileId);
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  // Start Xvfb
  const xvfb = spawn('Xvfb', [display, '-screen', '0', `${screenW}x${screenH}x24`, '-ac', '-nolisten', 'tcp'], {
    stdio: 'ignore',
    detached: true,
  });
  xvfb.unref();
  await sleep(1500);

  // Start fluxbox window manager
  const fluxbox = spawn('fluxbox', [], {
    env: { ...process.env, DISPLAY: display },
    stdio: 'ignore',
    detached: true,
  });
  fluxbox.unref();
  await sleep(300);

  // Build proxy config - use local relay for authenticated proxies
  let proxyServer = null;
  let relayInfo = null;
  if (profile.proxy_type && profile.proxy_host) {
    if (profile.proxy_user) {
      // Chromium doesn't support SOCKS5 auth, so relay through local proxy
      relayInfo = getRelay(
        profile.proxy_type,
        profile.proxy_host,
        profile.proxy_port,
        profile.proxy_user,
        profile.proxy_pass
      );
      proxyServer = `socks5://127.0.0.1:${relayInfo.localPort}`;
      console.log(`[Browser] Proxy relay: ${profile.proxy_type}://${profile.proxy_host}:${profile.proxy_port} → local :${relayInfo.localPort}`);
    } else {
      proxyServer = `${profile.proxy_type}://${profile.proxy_host}:${profile.proxy_port}`;
    }
  }

  // === STANDALONE MODE (like BitBrowser): No Playwright, no CDP ===
  // Launch CloakBrowser as an independent process, zero automation leaks
  const cloakBinary = cloakBinaryPath || '/usr/bin/google-chrome-stable';
  const fpSeed = Math.floor(Math.random() * 99999);

  const chromeArgs = [
    // CloakBrowser C++ stealth flags
    '--no-sandbox',
    '--disable-blink-features=AutomationControlled',
    `--fingerprint=${fpSeed}`,
    '--fingerprint-platform=windows',
    `--fingerprint-gpu-vendor=${fp.webgl?.vendor || 'Google Inc. (NVIDIA)'}`,
    `--fingerprint-gpu-renderer=${fp.webgl?.renderer || 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 (0x00002484) Direct3D11 vs_5_0 ps_5_0, D3D11)'}`,
    '--ignore-gpu-blocklist',

    // Normal browser flags (same as BitBrowser)
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
    '--disable-sync',
    `--window-size=${screenW},${screenH}`,
    '--start-maximized',
    `--lang=${fp.languages?.[0] || 'en-US'}`,
    `--user-data-dir=${userDataDir}`,
    `--fingerprint-timezone=${fp.timezone || 'America/New_York'}`,
    `--fingerprint-locale=${fp.languages?.[0] || 'en-US'}`,
  ];

  if (proxyServer) {
    // === PROXY KILL SWITCH: all traffic MUST go through proxy, no fallback ===
    chromeArgs.push(`--proxy-server=${proxyServer}`);
    // <-loopback> removes the implicit loopback bypass, so even 127.0.0.1 destinations go through proxy
    chromeArgs.push('--proxy-bypass-list=<-loopback>');
    // Force DNS through the SOCKS5 proxy — without this, Chrome resolves DNS locally
    chromeArgs.push('--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1');
    // WebRTC: block non-proxied UDP to prevent real IP leak via STUN
    chromeArgs.push('--webrtc-ip-handling-policy=disable_non_proxied_udp');
    chromeArgs.push('--enforce-webrtc-ip-permission-check');
    // Disable QUIC/HTTP3: SOCKS5 is TCP-only, UDP QUIC bypasses proxy
    chromeArgs.push('--disable-quic');
    // === Prevent Chrome background services from bypassing proxy ===
    chromeArgs.push('--disable-background-networking');
    chromeArgs.push('--disable-component-update');
    chromeArgs.push('--disable-domain-reliability');
    chromeArgs.push('--disable-client-side-phishing-detection');
    chromeArgs.push('--disable-breakpad');
    chromeArgs.push('--metrics-recording-only');
    chromeArgs.push('--no-pings');
    chromeArgs.push('--safebrowsing-disable-auto-update');
  }

  // Start page
  chromeArgs.push('https://www.google.com');

  console.log(`[Browser] Launching standalone CloakBrowser (NO CDP/Playwright) on ${display}`);
  console.log(`[Browser] Binary: ${cloakBinary}`);

  const chromeProc = spawn(cloakBinary, chromeArgs, {
    env: { ...process.env, DISPLAY: display, TZ: fp.timezone || 'America/New_York' },
    stdio: 'ignore',
    detached: true,
  });
  chromeProc.unref();

  // Wait for Chrome to fully start and render
  await sleep(3000);

  // Maximize the browser window to fill the virtual display
  try {
    const wid = execSync(`DISPLAY=${display} xdotool search --onlyvisible --name "" | head -1`, { timeout: 5000 }).toString().trim();
    if (wid) {
      execSync(`DISPLAY=${display} xdotool windowactivate ${wid} windowsize ${wid} ${screenW} ${screenH} windowmove ${wid} 0 0`, { timeout: 3000 });
      console.log('[Browser] Window maximized');
    }
  } catch (e) {
    try { execSync(`DISPLAY=${display} xdotool key --clearmodifiers super+Up`, { timeout: 2000 }); } catch (e2) {}
  }

  // Start x11vnc
  const x11vnc = spawn('x11vnc', [
    '-display', display,
    '-nopw',
    '-listen', '0.0.0.0',
    '-rfbport', String(vncPort),
    '-shared',
    '-forever',
    '-noxdamage',
    '-cursor', 'arrow',
    '-defer', '10',
    '-wait', '10',
    '-pointer_mode', '1',
  ], {
    stdio: 'ignore',
    detached: true,
  });
  x11vnc.unref();
  await sleep(500);

  // Start websockify: WebSocket on wsPort relays to VNC port
  const websockify = spawn('/usr/local/bin/websockify', [
    String(wsPort),
    `localhost:${vncPort}`,
  ], {
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true,
    env: { ...process.env },
  });
  websockify.unref();
  await sleep(500);

  const browserInfo = {
    profileId,
    displayNum,
    display,
    vncPort,
    wsPort,
    chromeProc,
    xvfb,
    fluxbox,
    x11vnc,
    websockify,
    relayInfo,
    startedAt: new Date().toISOString(),
  };

  activeBrowsers.set(profileId, browserInfo);
  database.setProfileStatus(profileId, 'running');

  return browserInfo;
}

async function closeBrowser(profileId) {
  const info = activeBrowsers.get(profileId);
  if (info) {
    // Kill all child processes: chrome, websockify, x11vnc, fluxbox, xvfb
    for (const proc of [info.chromeProc, info.websockify, info.x11vnc, info.fluxbox, info.xvfb]) {
      if (!proc) continue;
      try { process.kill(-proc.pid, 'SIGKILL'); } catch (e) {}
      try { proc.kill('SIGKILL'); } catch (e) {}
    }

    activeBrowsers.delete(profileId);
  }
  database.setProfileStatus(profileId, 'idle');
}

function getBrowserInfo(profileId) {
  const info = activeBrowsers.get(profileId);
  if (!info) return null;
  return {
    profileId: info.profileId,
    display: info.display,
    vncPort: info.vncPort,
    wsPort: info.wsPort,
    startedAt: info.startedAt,
  };
}

function getAllActiveBrowsers() {
  const result = [];
  for (const [id, info] of activeBrowsers) {
    result.push({
      profileId: id,
      display: info.display,
      vncPort: info.vncPort,
      wsPort: info.wsPort,
      startedAt: info.startedAt,
    });
  }
  return result;
}

async function closeAllBrowsers() {
  for (const [id] of activeBrowsers) {
    await closeBrowser(id);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  launchBrowser,
  closeBrowser,
  getBrowserInfo,
  getAllActiveBrowsers,
  closeAllBrowsers,
};
