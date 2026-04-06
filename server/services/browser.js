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

const GPU_PROFILES = {
  windows: [
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  ],
  macos: [
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1, OpenGL 4.1)' },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M2, OpenGL 4.1)' },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, Apple M1 Pro, OpenGL 4.1)' },
  ],
  linux: [
    { vendor: 'Google Inc. (NVIDIA Corporation)', renderer: 'ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3060/PCIe/SSE2, OpenGL 4.5)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 (CFL GT2), OpenGL 4.6)' },
  ],
};

function setupChromePreferences(userDataDir, fp) {
  const defaultDir = path.join(userDataDir, 'Default');
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }

  const prefsPath = path.join(defaultDir, 'Preferences');
  if (fs.existsSync(prefsPath)) return;

  const lang = fp.languages?.[0] || 'en-US';
  const langBase = lang.split('-')[0];

  const prefs = {
    profile: {
      name: 'Person 1',
      avatar_index: Math.floor(Math.random() * 26),
      content_settings: { exceptions: {} },
      default_content_setting_values: {},
      exit_type: 'Normal',
      exited_cleanly: true,
    },
    browser: {
      has_seen_welcome_page: true,
      check_default_browser: false,
      should_reset_check_default_browser: false,
      window_placement: {
        bottom: fp.screen?.height || 720,
        left: 0,
        maximized: true,
        right: fp.screen?.width || 1280,
        top: 0,
      },
    },
    search: {
      suggest_enabled: true,
    },
    translate: {
      enabled: false,
    },
    translate_blocked_languages: [langBase],
    intl: {
      accept_languages: fp.languages ? fp.languages.join(',') : 'en-US,en',
      selected_languages: fp.languages ? fp.languages.join(',') : 'en-US,en',
    },
    download: {
      prompt_for_download: false,
      directory_upgrade: true,
    },
    safebrowsing: {
      enabled: false,
    },
    autofill: {
      profile_enabled: false,
    },
    credentials_enable_service: false,
    signin: {
      allowed: false,
    },
    distribution: {
      import_bookmarks: false,
      import_history: false,
      import_search_engine: false,
      suppress_first_run_bubble: true,
      skip_first_run_ui: true,
    },
    session: {
      restore_on_startup: 4,
    },
    bookmark_bar: {
      show_on_all_tabs: true,
    },
    webkit: {
      webprefs: {
        default_font_size: 16,
        default_fixed_font_size: 13,
        minimum_font_size: 0,
      },
    },
  };

  fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));

  const localStatePath = path.join(userDataDir, 'Local State');
  if (!fs.existsSync(localStatePath)) {
    const localState = {
      browser: {
        enabled_labs_experiments: [],
        has_seen_welcome_page: true,
      },
      profile: {
        info_cache: {},
        profiles_created: 1,
      },
      data_reduction: {
        daily_original_length: ['0'],
      },
    };
    fs.writeFileSync(localStatePath, JSON.stringify(localState, null, 2));
  }

  console.log('[Browser] Chrome preferences pre-configured');
}

function setupBookmarks(userDataDir) {
  const bookmarksPath = path.join(userDataDir, 'Default', 'Bookmarks');
  if (fs.existsSync(bookmarksPath)) return;

  const bookmarks = {
    checksum: '',
    roots: {
      bookmark_bar: {
        children: [
          { date_added: String(Date.now() * 1000 - Math.random() * 86400000000), name: 'YouTube', type: 'url', url: 'https://www.youtube.com/' },
          { date_added: String(Date.now() * 1000 - Math.random() * 86400000000), name: 'Gmail', type: 'url', url: 'https://mail.google.com/' },
          { date_added: String(Date.now() * 1000 - Math.random() * 86400000000), name: 'Amazon', type: 'url', url: 'https://www.amazon.com/' },
        ],
        date_added: String(Date.now() * 1000 - 864000000000),
        date_last_used: '0',
        date_modified: String(Date.now() * 1000),
        name: 'Bookmarks bar',
        type: 'folder',
      },
      other: { children: [], name: 'Other bookmarks', type: 'folder' },
      synced: { children: [], name: 'Mobile bookmarks', type: 'folder' },
    },
    version: 1,
  };

  fs.writeFileSync(bookmarksPath, JSON.stringify(bookmarks, null, 2));
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

  setupChromePreferences(userDataDir, fp);
  setupBookmarks(userDataDir);

  // Start Xvfb with color depth matching real displays
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

  // Build proxy config
  let proxyServer = null;
  let relayInfo = null;
  if (profile.proxy_type && profile.proxy_host) {
    if (profile.proxy_user) {
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

  // === STANDALONE MODE: CloakBrowser as independent process ===
  const cloakBinary = cloakBinaryPath || '/usr/bin/google-chrome-stable';
  const fpSeed = Math.floor(Math.random() * 99999);

  // Determine OS platform from fingerprint (dynamic, not hardcoded)
  const osPlatform = fp.os || 'windows';
  const gpuList = GPU_PROFILES[osPlatform] || GPU_PROFILES.windows;
  const gpu = fp.webgl?.vendor ? fp.webgl : gpuList[Math.floor(Math.random() * gpuList.length)];

  const chromeArgs = [
    '--no-sandbox',
    '--disable-blink-features=AutomationControlled',
    `--fingerprint=${fpSeed}`,
    `--fingerprint-platform=${osPlatform}`,
    `--fingerprint-gpu-vendor=${gpu.vendor}`,
    `--fingerprint-gpu-renderer=${gpu.renderer}`,
    '--ignore-gpu-blocklist',

    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
    '--disable-sync',
    '--disable-translate',
    '--disable-features=TranslateUI',
    `--window-size=${screenW},${screenH}`,
    '--start-maximized',
    `--lang=${fp.languages?.[0] || 'en-US'}`,
    `--user-data-dir=${userDataDir}`,
    `--fingerprint-timezone=${fp.timezone || 'America/New_York'}`,
    `--fingerprint-locale=${fp.languages?.[0] || 'en-US'}`,

    // Look like a real user's Chrome — keep these ON
    '--enable-features=PasswordImport',
    // Disable obvious automation artifacts
    '--disable-hang-monitor',
    '--disable-prompt-on-repost',
    '--disable-ipc-flooding-protection',
  ];

  if (proxyServer) {
    // === PROXY KILL SWITCH ===
    chromeArgs.push(`--proxy-server=${proxyServer}`);
    chromeArgs.push('--proxy-bypass-list=<-loopback>');
    chromeArgs.push('--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1');
    chromeArgs.push('--webrtc-ip-handling-policy=disable_non_proxied_udp');
    chromeArgs.push('--enforce-webrtc-ip-permission-check');
    chromeArgs.push('--disable-quic');
    // Kill all Chrome background direct connections
    chromeArgs.push('--disable-background-networking');
    chromeArgs.push('--disable-component-update');
    chromeArgs.push('--disable-domain-reliability');
    chromeArgs.push('--disable-client-side-phishing-detection');
    chromeArgs.push('--disable-breakpad');
    chromeArgs.push('--metrics-recording-only');
    chromeArgs.push('--no-pings');
    chromeArgs.push('--safebrowsing-disable-auto-update');
  }

  chromeArgs.push('https://www.google.com');

  console.log(`[Browser] Launching CloakBrowser on ${display} | OS: ${osPlatform} | GPU: ${gpu.renderer.substring(0, 40)}...`);
  console.log(`[Browser] Binary: ${cloakBinary}`);

  const chromeProc = spawn(cloakBinary, chromeArgs, {
    env: {
      ...process.env,
      DISPLAY: display,
      TZ: fp.timezone || 'America/New_York',
      // Ensure fontconfig picks up Windows fonts
      FONTCONFIG_PATH: '/etc/fonts',
    },
    stdio: 'ignore',
    detached: true,
  });
  chromeProc.unref();

  await sleep(3000);

  // Maximize browser window
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

  // Start websockify
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
