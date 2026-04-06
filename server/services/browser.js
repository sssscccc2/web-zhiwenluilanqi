// Priority: fingerprint-chromium (2.3k stars, more mature) > CloakBrowser > system Chrome
const FINGERPRINT_CHROMIUM_PATH = '/opt/fingerprint-chromium/ungoogled-chromium-144.0.7559.132-1-x86_64_linux/chrome';

let cloakBinaryPath = null;
let browserEngine = 'system';

const cloakReady = (async () => {
  // Check fingerprint-chromium first (preferred)
  const fs2 = require('fs');
  if (fs2.existsSync(FINGERPRINT_CHROMIUM_PATH)) {
    cloakBinaryPath = FINGERPRINT_CHROMIUM_PATH;
    browserEngine = 'fingerprint-chromium-144';
    console.log(`[Browser] fingerprint-chromium v144 binary: ${cloakBinaryPath}`);
    return;
  }

  // Fallback to CloakBrowser
  try {
    const m = await import('cloakbrowser');
    await m.ensureBinary();
    const info = m.binaryInfo();
    cloakBinaryPath = info.binaryPath;
    browserEngine = 'cloakbrowser';
    console.log(`[Browser] CloakBrowser v${info.version} binary: ${cloakBinaryPath}`);
  } catch (e) {
    console.log('[Browser] No stealth browser available:', e.message);
  }
})();

const { chromium } = require('playwright');
const { execSync, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const database = require('./database');
const { getRelay } = require('./proxy-relay');
const dnsResolver = require('./dns-resolver');

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

  // Always fix exit_type to prevent "Restore pages?" dialog
  if (fs.existsSync(prefsPath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
      let changed = false;
      if (!existing.profile) existing.profile = {};
      if (existing.profile.exit_type !== 'Normal') { existing.profile.exit_type = 'Normal'; changed = true; }
      if (existing.profile.exited_cleanly !== true) { existing.profile.exited_cleanly = true; changed = true; }
      if (changed) fs.writeFileSync(prefsPath, JSON.stringify(existing, null, 2));
    } catch (e) {}
    return;
  }

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
      enabled: true,
      enhanced: false,
    },
    autofill: {
      profile_enabled: true,
      credit_card_enabled: true,
    },
    credentials_enable_service: true,
    signin: {
      allowed: true,
      allowed_on_next_startup: true,
    },
    payments: {
      can_make_payment_enabled: true,
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

  // Use 1920x1080 as the standard virtual display size — CloakBrowser's fingerprint seed
  // derives screen.width/height independently, and we need the Xvfb to be at least as large
  // to avoid outerWidth vs screen.width mismatches that trigger headless detection
  const screenW = Math.max(fp.screen?.width || 1920, 1920);
  const screenH = Math.max(fp.screen?.height || 1080, 1080);

  const userDataDir = path.join(USER_DATA_BASE, profileId);
  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  setupChromePreferences(userDataDir, fp);
  setupBookmarks(userDataDir);

  // Start Xvfb: -ac allows all clients (chrome-user needs access)
  const xvfb = spawn('Xvfb', [display, '-screen', '0', `${screenW}x${screenH}x24`, '-ac', '-nolisten', 'tcp', '-dpi', '96'], {
    stdio: 'ignore',
    detached: true,
  });
  xvfb.unref();
  await sleep(1500);

  // Allow chrome-user to access the X display
  try { execSync(`xhost +SI:localuser:chrome-user 2>/dev/null || true`, { env: { ...process.env, DISPLAY: display }, timeout: 2000 }); } catch (e) {}

  // Start fluxbox window manager
  const fluxbox = spawn('fluxbox', [], {
    env: { ...process.env, DISPLAY: display },
    stdio: 'ignore',
    detached: true,
  });
  fluxbox.unref();
  await sleep(300);

  // Build proxy config with auto-detected local DNS
  let proxyServer = null;
  let relayInfo = null;
  if (profile.proxy_type && profile.proxy_host) {
    if (profile.proxy_user) {
      // Step 1: Create a basic relay first to detect exit IP country
      const socksProxy = {
        host: profile.proxy_host,
        port: parseInt(profile.proxy_port),
        user: profile.proxy_user,
        pass: profile.proxy_pass || '',
      };

      // Step 2: Auto-detect exit IP country for local DNS
      let localDnsOpts = null;
      try {
        console.log('[Browser] Detecting proxy exit IP country for local DNS...');
        const geoInfo = await dnsResolver.detectCountry(socksProxy);
        if (geoInfo && geoInfo.country) {
          const dnsServers = dnsResolver.getDnsForCountry(geoInfo.country);
          console.log(`[Browser] Exit IP: ${geoInfo.ip} (${geoInfo.country}/${geoInfo.city}) ISP: ${geoInfo.isp}`);
          console.log(`[Browser] Local DNS: ${dnsServers.join(', ')} (${geoInfo.country})`);
          localDnsOpts = {
            servers: dnsServers,
            socksProxy,
          };
        } else {
          console.log('[Browser] Could not detect country, using default DNS');
        }
      } catch (e) {
        console.log('[Browser] Country detection failed:', e.message);
      }

      // Step 3: Create relay with local DNS resolution
      relayInfo = getRelay(
        profile.proxy_type,
        profile.proxy_host,
        profile.proxy_port,
        profile.proxy_user,
        profile.proxy_pass,
        { localDns: localDnsOpts }
      );
      proxyServer = `socks5://127.0.0.1:${relayInfo.localPort}`;
      console.log(`[Browser] Proxy relay: ${profile.proxy_type}://${profile.proxy_host}:${profile.proxy_port} → local :${relayInfo.localPort}${localDnsOpts ? ' (with local DNS)' : ''}`);
    } else {
      proxyServer = `${profile.proxy_type}://${profile.proxy_host}:${profile.proxy_port}`;
    }
  }

  // === STANDALONE MODE: CloakBrowser as independent process ===
  const cloakBinary = cloakBinaryPath || '/usr/bin/google-chrome-stable';

  // Persistent fingerprint seed per profile — ensures Canvas/WebGL/Audio hashes
  // stay consistent across sessions (prevents fingerprint rotation detection)
  const seedFile = path.join(userDataDir, '.fp_seed');
  let fpSeed;
  if (fs.existsSync(seedFile)) {
    fpSeed = parseInt(fs.readFileSync(seedFile, 'utf8').trim(), 10) || 12345;
  } else {
    fpSeed = Math.floor(Math.random() * 99999);
    fs.writeFileSync(seedFile, String(fpSeed));
  }

  const osPlatform = fp.os || 'windows';
  const gpuList = GPU_PROFILES[osPlatform] || GPU_PROFILES.windows;
  // Also persist GPU selection so it doesn't change between launches
  const gpuFile = path.join(userDataDir, '.gpu_index');
  let gpu;
  if (fp.webgl?.vendor) {
    gpu = fp.webgl;
  } else if (fs.existsSync(gpuFile)) {
    const idx = parseInt(fs.readFileSync(gpuFile, 'utf8').trim(), 10) || 0;
    gpu = gpuList[idx % gpuList.length];
  } else {
    const idx = Math.floor(Math.random() * gpuList.length);
    fs.writeFileSync(gpuFile, String(idx));
    gpu = gpuList[idx];
  }

  const platformVersionMap = {
    windows: '10.0.19045.3803',
    macos: '14.4.0',
    linux: '6.5.0',
  };
  const langPrimary = fp.languages?.[0] || 'en-US';
  const langAccept = fp.languages ? fp.languages.join(',') : 'en-US,en;q=0.9';

  const brandVersion = browserEngine === 'fingerprint-chromium-144' ? '144.0.0.0' : '145.0.0.0';
  console.log(`[Browser] Engine: ${browserEngine} | Seed: ${fpSeed} | OS: ${osPlatform}`);

  const chromeArgs = [
    '--test-type',
    '--disable-blink-features=AutomationControlled',
    `--fingerprint=${fpSeed}`,
    `--fingerprint-platform=${osPlatform}`,
    `--fingerprint-platform-version=${platformVersionMap[osPlatform] || '10.0.19045.3803'}`,
    '--fingerprint-brand=Chrome',
    `--fingerprint-brand-version=${brandVersion}`,
    `--fingerprint-hardware-concurrency=${fp.hardwareConcurrency || 8}`,
    '--ignore-gpu-blocklist',
  ];

  // fingerprint-chromium v144 removed individual GPU flags; uses seed-derived GPU
  if (browserEngine !== 'fingerprint-chromium-144') {
    chromeArgs.push(`--fingerprint-gpu-vendor=${gpu.vendor}`);
    chromeArgs.push(`--fingerprint-gpu-renderer=${gpu.renderer}`);
  } else {
    // fingerprint-chromium needs --no-sandbox (no chrome-sandbox binary shipped)
    // --test-type suppresses the warning bar
    chromeArgs.push('--no-sandbox');
  }

  chromeArgs.push(
    '--enable-features=PredictableReportedQuota',

    '--no-first-run',
    '--no-default-browser-check',
    '--disable-translate',
    '--disable-features=TranslateUI,DnsOverHttps',
    '--dns-over-https-mode=off',
    `--window-size=${screenW},${screenH}`,
    '--start-maximized',
    `--lang=${langPrimary}`,
    `--accept-lang=${langAccept}`,
    `--user-data-dir=${userDataDir}`,
  );

  // fingerprint-chromium uses --timezone; CloakBrowser uses --fingerprint-timezone
  if (browserEngine === 'fingerprint-chromium-144') {
    chromeArgs.push(`--timezone=${fp.timezone || 'America/New_York'}`);
  } else {
    chromeArgs.push(`--fingerprint-timezone=${fp.timezone || 'America/New_York'}`);
    chromeArgs.push(`--fingerprint-locale=${langPrimary}`);
  }

  chromeArgs.push(

    '--disable-hang-monitor',
    '--disable-prompt-on-repost',
    '--disable-ipc-flooding-protection',

    `--load-extension=${path.join(__dirname, '..', 'stealth-extension')}`,
    '--disable-extensions-except=' + path.join(__dirname, '..', 'stealth-extension'),
  );

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

  // Ensure user data dir is writable by chrome-user
  try {
    execSync(`chown -R chrome-user:chrome-user "${userDataDir}"`, { timeout: 3000 });
  } catch (e) {}

  console.log(`[Browser] Launching CloakBrowser on ${display} | OS: ${osPlatform} | GPU: ${gpu.renderer.substring(0, 40)}...`);
  console.log(`[Browser] Binary: ${cloakBinary} (as chrome-user, real sandbox)`);

  // Run as non-root 'chrome-user' so Chrome can use real sandbox (no --no-sandbox needed)
  // This eliminates the warning bar and makes the environment more realistic
  const cmdLine = `"${cloakBinary}" ${chromeArgs.map(a => `'${a}'`).join(' ')}`;
  console.log(`[Browser] Full command: ${cmdLine.substring(0, 500)}`);

  const chromeProc = spawn('su', ['-s', '/bin/bash', 'chrome-user', '-c', cmdLine], {
    env: {
      ...process.env,
      DISPLAY: display,
      TZ: fp.timezone || 'America/New_York',
      HOME: '/home/chrome-user',
      FONTCONFIG_PATH: '/etc/fonts',
      LANG: `${langPrimary.replace('-', '_')}.utf8`,
      LC_ALL: `${langPrimary.replace('-', '_')}.utf8`,
      LANGUAGE: langPrimary.replace('-', '_'),
    },
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  });
  chromeProc.stderr?.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg && !msg.includes('dbus') && !msg.includes('Xlib')) {
      console.log(`[Browser:stderr] ${msg.substring(0, 200)}`);
    }
  });
  chromeProc.unref();

  await sleep(3000);

  // Profile warmup: visit popular sites to build cookies/history on first launch
  const warmupMarker = path.join(userDataDir, '.warmed_up');
  if (!fs.existsSync(warmupMarker)) {
    console.log('[Browser] First launch — warming up profile with popular sites...');
    const warmupUrls = [
      'https://www.google.com/search?q=weather',
      'https://www.youtube.com/',
      'https://en.wikipedia.org/wiki/Main_Page',
    ];
    for (const url of warmupUrls) {
      try {
        execSync(`DISPLAY=${display} xdotool key --clearmodifiers ctrl+l`, { timeout: 2000 });
        await sleep(300);
        execSync(`DISPLAY=${display} xdotool type --clearmodifiers --delay 30 '${url}'`, { timeout: 5000 });
        await sleep(200);
        execSync(`DISPLAY=${display} xdotool key --clearmodifiers Return`, { timeout: 2000 });
        await sleep(4000);
      } catch (e) {}
    }
    try { fs.writeFileSync(warmupMarker, new Date().toISOString()); } catch (e) {}
    console.log('[Browser] Warmup complete');
  }

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

  // Clean up orphaned SHM segments to prevent "No space left on device"
  try {
    const shmOut = execSync("ipcs -m | awk '$6 == 0 {print $2}'", { timeout: 5000 }).toString().trim();
    if (shmOut) {
      const ids = shmOut.split('\n').filter(Boolean);
      if (ids.length > 100) {
        console.log(`[Browser] Cleaning ${ids.length} orphaned SHM segments...`);
        execSync("ipcs -m | awk '$6 == 0 {print $2}' | xargs -r -n1 ipcrm -m 2>/dev/null || true", { timeout: 30000 });
      }
    }
  } catch (e) { /* ignore */ }

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
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: true,
  });
  x11vnc.stderr.on('data', (d) => {
    const msg = d.toString();
    if (msg.includes('shmget') || msg.includes('No space left')) {
      console.error(`[x11vnc] SHM error detected, attempting cleanup...`);
      try { execSync("ipcs -m | awk '$6 == 0 {print $2}' | xargs -r -n1 ipcrm -m 2>/dev/null || true", { timeout: 10000 }); } catch (e) {}
    }
  });
  x11vnc.unref();
  await sleep(1000);

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
    userDataDir,
    startedAt: new Date().toISOString(),
  };

  activeBrowsers.set(profileId, browserInfo);
  database.setProfileStatus(profileId, 'running');

  return browserInfo;
}

async function closeBrowser(profileId) {
  const info = activeBrowsers.get(profileId);
  if (info) {
    // Fix Chrome preferences before killing to prevent "Restore pages?" dialog
    if (info.userDataDir) {
      try {
        const prefsPath = path.join(info.userDataDir, 'Default', 'Preferences');
        if (fs.existsSync(prefsPath)) {
          const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
          if (!prefs.profile) prefs.profile = {};
          prefs.profile.exit_type = 'Normal';
          prefs.profile.exited_cleanly = true;
          fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
        }
      } catch (e) {}
    }

    // Try graceful SIGTERM first, then SIGKILL after 2s
    for (const proc of [info.chromeProc]) {
      if (!proc) continue;
      try { process.kill(-proc.pid, 'SIGTERM'); } catch (e) {}
    }
    await sleep(2000);

    for (const proc of [info.chromeProc, info.websockify, info.x11vnc, info.fluxbox, info.xvfb]) {
      if (!proc) continue;
      try { process.kill(-proc.pid, 'SIGKILL'); } catch (e) {}
      try { proc.kill('SIGKILL'); } catch (e) {}
    }

    // Fix preferences again after killing (in case SIGTERM updated them)
    if (info.userDataDir) {
      try {
        const prefsPath = path.join(info.userDataDir, 'Default', 'Preferences');
        if (fs.existsSync(prefsPath)) {
          const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'));
          if (!prefs.profile) prefs.profile = {};
          prefs.profile.exit_type = 'Normal';
          prefs.profile.exited_cleanly = true;
          fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
        }
      } catch (e) {}
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
