const crypto = require('crypto');

// Must match actual installed Chrome version for TLS fingerprint consistency
const CHROME_VERSION = '145.0.0.0';

const OS_PROFILES = {
  windows: {
    userAgents: [
      `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`,
    ],
    platform: 'Win32',
    oscpu: 'Windows NT 10.0; Win64; x64',
    webglRenderers: [
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
      'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
    ],
    webglVendors: [
      'Google Inc. (NVIDIA)',
      'Google Inc. (AMD)',
      'Google Inc. (Intel)',
    ],
    fonts: [
      'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia',
      'Impact', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Lucida Console',
      'Calibri', 'Cambria', 'Segoe UI', 'Consolas', 'Tahoma',
    ],
    maxTouchPoints: [0, 0, 0, 10],
  },
  macos: {
    userAgents: [
      `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`,
    ],
    platform: 'MacIntel',
    oscpu: 'Intel Mac OS X 10.15',
    webglRenderers: [
      'ANGLE (Apple, Apple M1, OpenGL 4.1)',
      'ANGLE (Apple, Apple M2, OpenGL 4.1)',
      'ANGLE (Intel, Intel(R) Iris(TM) Plus Graphics, OpenGL 4.1)',
      'ANGLE (AMD, AMD Radeon Pro 5500M, OpenGL 4.1)',
    ],
    webglVendors: [
      'Google Inc. (Apple)',
      'Google Inc. (Intel)',
      'Google Inc. (AMD)',
    ],
    fonts: [
      'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia',
      'Impact', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Lucida Console',
      'Helvetica Neue', 'Menlo', 'Monaco', 'San Francisco', 'Avenir',
    ],
    maxTouchPoints: [0],
  },
  linux: {
    userAgents: [
      `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`,
    ],
    platform: 'Linux x86_64',
    oscpu: 'Linux x86_64',
    webglRenderers: [
      'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060, OpenGL 4.5)',
      'ANGLE (AMD, AMD Radeon RX 580, OpenGL 4.5)',
      'ANGLE (Intel, Intel(R) UHD Graphics 630, OpenGL 4.5)',
      'Mesa Intel(R) UHD Graphics 630 (CFL GT2)',
    ],
    webglVendors: [
      'Google Inc. (NVIDIA)',
      'Google Inc. (AMD)',
      'Google Inc. (Intel)',
    ],
    fonts: [
      'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia',
      'Impact', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Lucida Console',
      'DejaVu Sans', 'Liberation Mono', 'Ubuntu', 'Noto Sans', 'Droid Sans',
    ],
    maxTouchPoints: [0],
  },
};

const SCREEN_RESOLUTIONS = [
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
  { width: 1366, height: 768 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1680, height: 1050 },
];

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
];

const LANGUAGES = [
  ['en-US', 'en'],
  ['en-GB', 'en'],
  ['en-US', 'en', 'fr'],
  ['en-US', 'en', 'de'],
  ['en-US', 'en', 'es'],
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateCanvasNoise() {
  return crypto.randomBytes(8).toString('hex');
}

function generateDeviceName(os) {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
  if (os === 'macos') {
    const names = ['MacBook-Pro', 'MacBook-Air', 'iMac', 'Mac-mini', 'Mac-Studio'];
    return `${pick(names)}-${rand}`;
  }
  if (os === 'linux') {
    const names = ['ubuntu', 'fedora', 'debian', 'arch', 'mint'];
    return `${pick(names)}-${rand.toLowerCase()}`;
  }
  return `DESKTOP-${rand}`;
}

function generateLocalIP() {
  const subnets = ['192.168.1', '192.168.0', '10.0.0', '10.172.188', '172.16.0'];
  return `${pick(subnets)}.${randomInt(2, 254)}`;
}

function generateMAC() {
  const bytes = crypto.randomBytes(6);
  bytes[0] = (bytes[0] & 0xfe) | 0x02;
  return Array.from(bytes).map(b => b.toString(16).toUpperCase().padStart(2, '0')).join('-');
}

function generateFingerprint(overrides = {}) {
  const osKey = overrides.os || 'windows';
  const profile = OS_PROFILES[osKey] || OS_PROFILES.windows;

  const ua = overrides.userAgent || pick(profile.userAgents);
  const screen = overrides.screen || pick(SCREEN_RESOLUTIONS);
  const tz = overrides.timezone || pick(TIMEZONES);
  const langs = overrides.languages || pick(LANGUAGES);
  const webglVendor = overrides.webglVendor || pick(profile.webglVendors);
  const webglRenderer = overrides.webglRenderer || pick(profile.webglRenderers);

  const count = randomInt(profile.fonts.length - 3, profile.fonts.length);
  const fonts = [...profile.fonts].sort(() => Math.random() - 0.5).slice(0, count);

  return {
    os: osKey,
    userAgent: ua,
    platform: profile.platform,
    oscpu: profile.oscpu,
    hardwareConcurrency: overrides.hardwareConcurrency || pick([4, 8, 12, 16]),
    deviceMemory: overrides.deviceMemory || pick([4, 8, 16]),
    maxTouchPoints: pick(profile.maxTouchPoints),
    screen: {
      width: screen.width,
      height: screen.height,
      availWidth: screen.width,
      availHeight: screen.height - randomInt(30, 50),
      colorDepth: 24,
      pixelDepth: 24,
    },
    timezone: tz,
    timezoneOffset: getTimezoneOffset(tz),
    languages: langs,
    webgl: {
      vendor: webglVendor,
      renderer: webglRenderer,
    },
    canvas: {
      noise: generateCanvasNoise(),
    },
    audio: {
      noise: Math.random() * 0.0001,
    },
    fonts,
    webrtc: {
      mode: 'fake',
      publicIp: null,
    },
    doNotTrack: pick(['1', null]),
    mediaDevices: {
      audioinput: randomInt(1, 3),
      audiooutput: randomInt(1, 3),
      videoinput: randomInt(0, 2),
    },
    geolocation: overrides.geolocation || null,
    clientRects: overrides.clientRects || 'noise',
    deviceName: overrides.deviceName || generateDeviceName(osKey),
    localIP: overrides.localIP || generateLocalIP(),
    macAddress: overrides.macAddress || generateMAC(),
  };
}

function getTimezoneOffset(tz) {
  const offsets = {
    'America/New_York': 300,
    'America/Chicago': 360,
    'America/Denver': 420,
    'America/Los_Angeles': 480,
    'America/Phoenix': 420,
    'America/Anchorage': 540,
    'Europe/London': 0,
    'Europe/Berlin': -60,
    'Europe/Paris': -60,
  };
  return offsets[tz] || 0;
}

module.exports = { generateFingerprint, OS_PROFILES };
