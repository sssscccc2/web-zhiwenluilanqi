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

  const screenW = fp.screen?.width || 1920;
  const screenH = fp.screen?.height || 1080;

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
  await sleep(500);

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

  // Build Chromium launch args
  const args = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process',
    '--disable-web-security=false',
    `--window-size=${screenW},${screenH}`,
    '--start-maximized',
    `--lang=${fp.languages?.[0] || 'en-US'}`,
    `--timezone=${fp.timezone || 'America/New_York'}`,
  ];

  if (fp.webrtc?.mode === 'fake') {
    args.push('--webrtc-ip-handling-policy=disable_non_proxied_udp');
    args.push('--enforce-webrtc-ip-permission-check');
  }

  const launchOptions = {
    headless: false,
    args,
    env: { ...process.env, DISPLAY: display, TZ: fp.timezone || 'America/New_York' },
    ignoreDefaultArgs: ['--enable-automation'],
    locale: fp.languages?.[0] || 'en-US',
    timezoneId: fp.timezone || 'America/New_York',
  };

  if (fp.geolocation && fp.geolocation.latitude) {
    launchOptions.geolocation = {
      latitude: fp.geolocation.latitude,
      longitude: fp.geolocation.longitude,
      accuracy: fp.geolocation.accuracy || 50,
    };
    launchOptions.permissions = ['geolocation'];
  }

  if (proxyServer) {
    launchOptions.proxy = {
      server: proxyServer,
    };
    // Auth is handled by the local relay, no need to pass credentials to Chromium
  }

  // Launch browser
  const browser = await chromium.launchPersistentContext(userDataDir, launchOptions);

  // Inject fingerprint script
  const injectScript = fs.readFileSync(
    path.join(__dirname, '../../scripts/inject-fingerprint.js'),
    'utf-8'
  );
  const scriptWithConfig = injectScript.replace('__FP_CONFIG__', JSON.stringify(fp));
  await browser.addInitScript(scriptWithConfig);

  const redditStealth = fs.readFileSync(
    path.join(__dirname, '../../scripts/reddit-stealth.js'),
    'utf-8'
  );
  await browser.addInitScript(redditStealth);

  // Set extra HTTP headers for consistent UA
  const pages = browser.pages();
  for (const page of pages) {
    await page.setExtraHTTPHeaders({
      'Accept-Language': fp.languages?.join(',') || 'en-US,en',
    });
  }

  browser.on('page', async (page) => {
    await page.setExtraHTTPHeaders({
      'Accept-Language': fp.languages?.join(',') || 'en-US,en',
    });
  });

  // Navigate first page to Google (verifies proxy works and gives user a starting point)
  try {
    const firstPage = pages[0] || await browser.newPage();
    await firstPage.goto('https://www.google.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.warn(`[Browser] Failed to load start page: ${err.message}`);
  }

  // Maximize the browser window to fill the virtual display
  await sleep(800);
  try {
    const wid = execSync(`DISPLAY=${display} xdotool search --onlyvisible --class chromium | head -1`, { timeout: 3000 }).toString().trim();
    if (wid) {
      execSync(`DISPLAY=${display} xdotool windowactivate ${wid} windowsize ${wid} ${screenW} ${screenH} windowmove ${wid} 0 0`, { timeout: 3000 });
    }
  } catch (e) {
    // Fallback: try wmctrl or key shortcut
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
    browser,
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
  if (!info) return;

  try { await info.browser.close(); } catch (e) {}

  for (const proc of [info.websockify, info.x11vnc, info.fluxbox, info.xvfb]) {
    try { process.kill(-proc.pid, 'SIGKILL'); } catch (e) {}
    try { proc.kill('SIGKILL'); } catch (e) {}
  }

  activeBrowsers.delete(profileId);
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
