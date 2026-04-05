const crypto = require('crypto');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
];

const PLATFORMS = {
  'Windows NT 10.0': { platform: 'Win32', oscpu: 'Windows NT 10.0; Win64; x64' },
  'Macintosh': { platform: 'MacIntel', oscpu: 'Intel Mac OS X 10.15' },
  'X11; Linux': { platform: 'Linux x86_64', oscpu: 'Linux x86_64' },
};

const WEBGL_VENDORS = [
  'Google Inc. (NVIDIA)',
  'Google Inc. (AMD)',
  'Google Inc. (Intel)',
];

const WEBGL_RENDERERS = [
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)',
];

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

function generateFingerprint(overrides = {}) {
  const ua = overrides.userAgent || pick(USER_AGENTS);

  let platformKey = 'Windows NT 10.0';
  if (ua.includes('Macintosh')) platformKey = 'Macintosh';
  else if (ua.includes('Linux')) platformKey = 'X11; Linux';

  const platformInfo = PLATFORMS[platformKey];
  const screen = overrides.screen || pick(SCREEN_RESOLUTIONS);
  const tz = overrides.timezone || pick(TIMEZONES);
  const langs = overrides.languages || pick(LANGUAGES);
  const webglVendor = overrides.webglVendor || pick(WEBGL_VENDORS);
  const webglRenderer = overrides.webglRenderer || pick(WEBGL_RENDERERS);

  return {
    userAgent: ua,
    platform: platformInfo.platform,
    oscpu: platformInfo.oscpu,
    hardwareConcurrency: overrides.hardwareConcurrency || pick([4, 8, 12, 16]),
    deviceMemory: overrides.deviceMemory || pick([4, 8, 16]),
    maxTouchPoints: platformKey === 'Windows NT 10.0' ? pick([0, 0, 0, 10]) : 0,
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
    fonts: generateFontList(platformKey),
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

function generateFontList(platform) {
  const base = [
    'Arial', 'Arial Black', 'Comic Sans MS', 'Courier New', 'Georgia',
    'Impact', 'Times New Roman', 'Trebuchet MS', 'Verdana', 'Lucida Console',
  ];
  if (platform === 'Windows NT 10.0') {
    base.push('Calibri', 'Cambria', 'Segoe UI', 'Consolas', 'Tahoma');
  } else if (platform === 'Macintosh') {
    base.push('Helvetica Neue', 'Menlo', 'Monaco', 'San Francisco', 'Avenir');
  }
  const count = randomInt(base.length - 3, base.length);
  const shuffled = base.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

module.exports = { generateFingerprint };
