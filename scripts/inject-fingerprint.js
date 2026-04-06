/**
 * Browser-side fingerprint injection script.
 * Injected via Playwright's addInitScript before any page loads.
 * The `__FP_CONFIG__` placeholder is replaced with actual fingerprint data at runtime.
 */
(function () {
  'use strict';
  const config = __FP_CONFIG__;
  if (!config) return;

  // --- Navigator overrides ---
  const navProps = {
    userAgent: config.userAgent,
    platform: config.platform,
    hardwareConcurrency: config.hardwareConcurrency,
    deviceMemory: config.deviceMemory,
    maxTouchPoints: config.maxTouchPoints,
    languages: Object.freeze(config.languages),
    language: config.languages[0],
    doNotTrack: config.doNotTrack,
  };

  for (const [key, value] of Object.entries(navProps)) {
    if (value === undefined || value === null) continue;
    try {
      Object.defineProperty(Navigator.prototype, key, {
        get: () => value,
        configurable: true,
      });
    } catch (e) {}
  }

  // Consistent appVersion derived from userAgent
  try {
    Object.defineProperty(Navigator.prototype, 'appVersion', {
      get: () => config.userAgent.replace('Mozilla/', ''),
      configurable: true,
    });
  } catch (e) {}

  // --- Screen overrides ---
  if (config.screen) {
    const screenProps = config.screen;
    for (const [key, value] of Object.entries(screenProps)) {
      try {
        Object.defineProperty(Screen.prototype, key, {
          get: () => value,
          configurable: true,
        });
      } catch (e) {}
    }
    try {
      Object.defineProperty(window, 'outerWidth', { get: () => screenProps.width, configurable: true });
      Object.defineProperty(window, 'outerHeight', { get: () => screenProps.height, configurable: true });
      Object.defineProperty(window, 'innerWidth', { get: () => screenProps.width, configurable: true });
      Object.defineProperty(window, 'innerHeight', { get: () => screenProps.availHeight, configurable: true });
    } catch (e) {}
  }

  // --- Timezone override ---
  if (config.timezone) {
    const origDTF = Intl.DateTimeFormat;
    const handler = {
      construct(target, args) {
        if (args.length > 1 && args[1]) {
          args[1].timeZone = args[1].timeZone || config.timezone;
        } else {
          args[1] = { timeZone: config.timezone };
        }
        return new target(...args);
      },
    };
    window.Intl.DateTimeFormat = new Proxy(origDTF, handler);
    Object.defineProperty(window.Intl.DateTimeFormat, 'name', { value: 'DateTimeFormat' });

    const resolvedProto = origDTF.prototype.resolvedOptions;
    origDTF.prototype.resolvedOptions = function () {
      const result = resolvedProto.call(this);
      result.timeZone = config.timezone;
      return result;
    };

    if (config.timezoneOffset !== undefined) {
      Date.prototype.getTimezoneOffset = function () {
        return config.timezoneOffset;
      };
    }
  }

  // --- Canvas fingerprint noise ---
  if (config.canvas && config.canvas.noise) {
    const seed = config.canvas.noise;
    let seedNum = 0;
    for (let i = 0; i < seed.length; i++) {
      seedNum = ((seedNum << 5) - seedNum + seed.charCodeAt(i)) | 0;
    }

    function seededRandom() {
      seedNum = (seedNum * 16807 + 0) % 2147483647;
      return (seedNum & 0xfffffff) / 0x10000000;
    }

    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function () {
      const ctx = this.getContext('2d');
      if (ctx) {
        try {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          const pixels = imageData.data;
          for (let i = 0; i < pixels.length; i += 4) {
            const noise = (seededRandom() - 0.5) * 2;
            pixels[i] = Math.max(0, Math.min(255, pixels[i] + noise));
          }
          ctx.putImageData(imageData, 0, 0);
        } catch (e) {}
      }
      return origToDataURL.apply(this, arguments);
    };

    const origToBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (cb, type, quality) {
      const ctx = this.getContext('2d');
      if (ctx) {
        try {
          const imageData = ctx.getImageData(0, 0, this.width, this.height);
          const pixels = imageData.data;
          for (let i = 0; i < pixels.length; i += 4) {
            const noise = (seededRandom() - 0.5) * 2;
            pixels[i] = Math.max(0, Math.min(255, pixels[i] + noise));
          }
          ctx.putImageData(imageData, 0, 0);
        } catch (e) {}
      }
      return origToBlob.call(this, cb, type, quality);
    };
  }

  // --- WebGL fingerprint ---
  if (config.webgl) {
    const getParamOrig = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (param) {
      if (param === 0x9245) return config.webgl.vendor;     // UNMASKED_VENDOR_WEBGL
      if (param === 0x9246) return config.webgl.renderer;   // UNMASKED_RENDERER_WEBGL
      return getParamOrig.call(this, param);
    };

    if (typeof WebGL2RenderingContext !== 'undefined') {
      const getParam2Orig = WebGL2RenderingContext.prototype.getParameter;
      WebGL2RenderingContext.prototype.getParameter = function (param) {
        if (param === 0x9245) return config.webgl.vendor;
        if (param === 0x9246) return config.webgl.renderer;
        return getParam2Orig.call(this, param);
      };
    }
  }

  // --- AudioContext fingerprint noise ---
  if (config.audio) {
    const origCreateOscillator = (window.AudioContext || window.webkitAudioContext)?.prototype.createOscillator;
    if (origCreateOscillator) {
      const origGetChannelData = AudioBuffer.prototype.getChannelData;
      AudioBuffer.prototype.getChannelData = function (channel) {
        const data = origGetChannelData.call(this, channel);
        if (this._fpNoised) return data;
        this._fpNoised = true;
        for (let i = 0; i < data.length; i++) {
          data[i] += config.audio.noise * (Math.random() * 2 - 1);
        }
        return data;
      };
    }
  }

  // --- ClientRects noise ---
  if (config.clientRects !== 'off') {
    const crSeed = config.canvas?.noise ? parseInt(config.canvas.noise.slice(0, 8), 16) : Math.random() * 1e9;
    let crCounter = 0;
    function crNoise() {
      crCounter++;
      const x = Math.sin(crSeed + crCounter) * 10000;
      return (x - Math.floor(x)) * 0.001 - 0.0005;
    }

    function noiseDOMRect(rect) {
      const n = crNoise;
      return new DOMRect(
        rect.x + n(), rect.y + n(),
        rect.width + n(), rect.height + n()
      );
    }

    const origGetBCR = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function () {
      return noiseDOMRect(origGetBCR.call(this));
    };

    const origGetCR = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function () {
      const rects = origGetCR.call(this);
      const result = [];
      for (let i = 0; i < rects.length; i++) {
        result.push(noiseDOMRect(rects[i]));
      }
      result.item = (idx) => result[idx];
      Object.defineProperty(result, 'length', { value: rects.length });
      return result;
    };
  }

  // --- WebRTC protection ---
  if (config.webrtc && config.webrtc.mode !== 'real') {
    const origRTC = window.RTCPeerConnection;

    if (config.webrtc.mode === 'disabled') {
      window.RTCPeerConnection = function () {
        throw new DOMException('RTCPeerConnection is disabled', 'NotSupportedError');
      };
      window.RTCPeerConnection.prototype = origRTC.prototype;
    } else if (config.webrtc.mode === 'replace' && config.webrtc.publicIp) {
      const replaceIp = config.webrtc.publicIp;
      window.RTCPeerConnection = function (...args) {
        const pc = new origRTC(...args);
        const origCreateOffer = pc.createOffer.bind(pc);
        pc.createOffer = function (options) {
          return origCreateOffer(options).then(offer => {
            offer.sdp = offer.sdp.replace(
              /a=candidate:(\S+ \d+ \S+ \d+) (\d+\.\d+\.\d+\.\d+)/g,
              (m, prefix, ip) => `a=candidate:${prefix} ${replaceIp}`
            );
            return offer;
          });
        };
        return pc;
      };
      window.RTCPeerConnection.prototype = origRTC.prototype;
    } else {
      window.RTCPeerConnection = function (...args) {
        if (args[0] && args[0].iceServers) {
          args[0].iceServers = [];
        }
        const pc = new origRTC(...args);
        const origCreateOffer = pc.createOffer.bind(pc);
        pc.createOffer = function (options) {
          return origCreateOffer(options).then(offer => {
            offer.sdp = offer.sdp.replace(/a=candidate:.*typ srflx.*/g, '');
            offer.sdp = offer.sdp.replace(/a=candidate:.*typ relay.*/g, '');
            return offer;
          });
        };
        return pc;
      };
      window.RTCPeerConnection.prototype = origRTC.prototype;
    }

    if (window.webkitRTCPeerConnection) {
      window.webkitRTCPeerConnection = window.RTCPeerConnection;
    }
  }

  // --- Media devices count ---
  if (config.mediaDevices) {
    const origEnumerate = navigator.mediaDevices?.enumerateDevices;
    if (origEnumerate) {
      navigator.mediaDevices.enumerateDevices = async function () {
        const devices = [];
        const kinds = { audioinput: config.mediaDevices.audioinput, audiooutput: config.mediaDevices.audiooutput, videoinput: config.mediaDevices.videoinput };
        for (const [kind, count] of Object.entries(kinds)) {
          for (let i = 0; i < count; i++) {
            devices.push({
              deviceId: `${kind}_${i}_${config.canvas?.noise || 'x'}`,
              groupId: `group_${i}`,
              kind,
              label: '',
              toJSON() { return { deviceId: this.deviceId, kind: this.kind, label: this.label, groupId: this.groupId }; },
            });
          }
        }
        return devices;
      };
    }
  }

  // --- Geolocation override ---
  if (config.geolocation && config.geolocation.latitude) {
    const geoPos = {
      coords: {
        latitude: config.geolocation.latitude,
        longitude: config.geolocation.longitude,
        accuracy: config.geolocation.accuracy || 50,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    };

    navigator.geolocation.getCurrentPosition = function (success, error, options) {
      setTimeout(() => success({ ...geoPos, timestamp: Date.now() }), 100 + Math.random() * 400);
    };

    navigator.geolocation.watchPosition = function (success, error, options) {
      const id = setInterval(() => {
        const jitter = 0.0001 * (Math.random() - 0.5);
        success({
          coords: {
            ...geoPos.coords,
            latitude: geoPos.coords.latitude + jitter,
            longitude: geoPos.coords.longitude + jitter,
          },
          timestamp: Date.now(),
        });
      }, 3000 + Math.random() * 2000);
      return id;
    };

    navigator.geolocation.clearWatch = function (id) {
      clearInterval(id);
    };
  }

  // --- Plugins emulation (Chrome-like) ---
  Object.defineProperty(Navigator.prototype, 'plugins', {
    get: () => {
      const plugins = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ];
      plugins.length = 3;
      plugins.item = (i) => plugins[i];
      plugins.namedItem = (name) => plugins.find(p => p.name === name) || null;
      plugins.refresh = () => {};
      return plugins;
    },
    configurable: true,
  });

  // --- Prevent automation detection ---
  Object.defineProperty(Navigator.prototype, 'webdriver', {
    get: () => false,
    configurable: true,
  });

  delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
  delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
  delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

  // Remove Playwright/Puppeteer artifacts
  const cleanProps = [
    '__playwright',
    '__pw_manual',
    '__PW_inspect',
    '_phantom',
    '__nightmare',
    '_selenium',
    'callPhantom',
    '_Recaptcha',
  ];
  for (const prop of cleanProps) {
    try { delete window[prop]; } catch (e) {}
  }

  // --- Device info spoofing (deviceName, localIP, macAddress) ---
  if (config.deviceName) {
    Object.defineProperty(Navigator.prototype, 'deviceName', {
      get: () => config.deviceName,
      configurable: true,
    });
  }
  if (config.localIP || config.macAddress) {
    const origRTCGetStats = window.RTCPeerConnection?.prototype?.getStats;
    if (origRTCGetStats) {
      const origProto = window.RTCPeerConnection.prototype;
      origProto.getStats = function () {
        return origRTCGetStats.call(this).then(stats => {
          stats.forEach(report => {
            if (report.type === 'local-candidate' && config.localIP) {
              report.address = config.localIP;
              report.ip = config.localIP;
            }
          });
          return stats;
        });
      };
    }
  }

  // Chrome runtime mock
  if (!window.chrome) window.chrome = {};
  if (!window.chrome.runtime) {
    window.chrome.runtime = {
      connect: () => {},
      sendMessage: () => {},
      id: undefined,
    };
  }

  // --- navigator.userAgentData spoofing ---
  if (config.userAgent) {
    const chromeMatch = config.userAgent.match(/Chrome\/(\d+)/);
    const chromeVersion = chromeMatch ? chromeMatch[1] : '131';
    const fullVersion = config.userAgent.match(/Chrome\/([\d.]+)/)?.[1] || `${chromeVersion}.0.0.0`;
    const platformMap = { Win32: 'Windows', MacIntel: 'macOS', 'Linux x86_64': 'Linux' };
    const uadPlatform = platformMap[config.platform] || 'Windows';

    const brands = [
      { brand: 'Google Chrome', version: chromeVersion },
      { brand: 'Chromium', version: chromeVersion },
      { brand: 'Not_A Brand', version: '24' },
    ];

    const uaData = {
      brands: Object.freeze(brands),
      mobile: false,
      platform: uadPlatform,
      getHighEntropyValues: (hints) => Promise.resolve({
        brands,
        mobile: false,
        platform: uadPlatform,
        platformVersion: uadPlatform === 'Windows' ? '15.0.0' : uadPlatform === 'macOS' ? '10.15.7' : '6.5.0',
        architecture: 'x86',
        bitness: '64',
        model: '',
        uaFullVersion: fullVersion,
        fullVersionList: brands.map(b => ({ brand: b.brand, version: fullVersion })),
      }),
    };

    try {
      Object.defineProperty(Navigator.prototype, 'userAgentData', {
        get: () => uaData,
        configurable: true,
      });
    } catch (e) {}
  }

  // Permission query override for notifications
  const origQuery = window.Permissions?.prototype?.query;
  if (origQuery) {
    window.Permissions.prototype.query = function (desc) {
      if (desc.name === 'notifications') {
        return Promise.resolve({ state: 'prompt', onchange: null });
      }
      return origQuery.call(this, desc);
    };
  }

  console.log('[FP] Fingerprint injected successfully');
})();
