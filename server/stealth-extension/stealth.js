(() => {
  'use strict';

  // === CRITICAL: Fix incognito/private browsing detection ===
  // Pixelscan and other sites detect incognito by checking storage quota
  // Incognito Chrome reports ~120MB, normal Chrome reports several GB
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    const origEstimate = navigator.storage.estimate.bind(navigator.storage);
    Object.defineProperty(navigator.storage, 'estimate', {
      value: async function estimate() {
        const real = await origEstimate();
        return {
          quota: Math.max(real.quota || 0, 2147483648 + Math.floor(Math.random() * 1073741824)),
          usage: real.usage || Math.floor(Math.random() * 50000),
          usageDetails: real.usageDetails || {},
        };
      },
      writable: true,
      configurable: true,
    });
  }

  // === Fix webkitRequestFileSystem (older incognito detection) ===
  if (typeof window !== 'undefined' && !window.webkitRequestFileSystem) {
    window.webkitRequestFileSystem = function(type, size, successCallback, errorCallback) {
      if (successCallback) {
        setTimeout(() => successCallback({ name: '', root: null }), 0);
      }
    };
    window.TEMPORARY = 0;
    window.PERSISTENT = 1;
  }

  // === Fix performance.memory (Chrome-specific, incognito detection) ===
  if (typeof performance !== 'undefined') {
    try {
      const memoryData = {
        jsHeapSizeLimit: 4294705152,
        totalJSHeapSize: 35000000 + Math.floor(Math.random() * 15000000),
        usedJSHeapSize: 25000000 + Math.floor(Math.random() * 10000000),
      };
      Object.defineProperty(performance, 'memory', {
        get: () => memoryData,
        configurable: true,
      });
    } catch (e) {}
  }

  // === NetworkInformation API (navigator.connection) ===
  // Real Chrome on WiFi reports these typical values
  const connectionData = {
    effectiveType: '4g',
    type: 'wifi',
    downlink: 10 + Math.random() * 40, // 10-50 Mbps, rounded to 0.05
    downlinkMax: Infinity,
    rtt: 50 + Math.floor(Math.random() * 100), // 50-150ms, rounded to 25
    saveData: false,
    onchange: null,
  };
  connectionData.downlink = Math.round(connectionData.downlink * 20) / 20;
  connectionData.rtt = Math.round(connectionData.rtt / 25) * 25;

  if (typeof navigator !== 'undefined' && !navigator.connection) {
    const connProto = {
      addEventListener: { value: function() {} },
      removeEventListener: { value: function() {} },
      dispatchEvent: { value: function() { return true; } },
    };
    for (const [key, val] of Object.entries(connectionData)) {
      connProto[key] = { value: val, writable: false, enumerable: true, configurable: true };
    }
    const conn = Object.create(EventTarget.prototype, connProto);
    Object.defineProperty(navigator, 'connection', {
      get: () => conn,
      enumerable: true,
      configurable: true,
    });
  }

  // === Battery API (navigator.getBattery) ===
  // Desktop PCs: always charging at 100%
  // Laptops: random between 60-100%
  if (typeof navigator !== 'undefined') {
    const isLaptop = Math.random() > 0.6;
    const batteryData = {
      charging: isLaptop ? Math.random() > 0.5 : true,
      chargingTime: 0,
      dischargingTime: Infinity,
      level: isLaptop ? 0.6 + Math.random() * 0.4 : 1.0,
    };
    batteryData.level = Math.round(batteryData.level * 100) / 100;
    if (batteryData.charging && batteryData.level < 1) {
      batteryData.chargingTime = Math.floor(Math.random() * 3600) + 600;
    }
    if (!batteryData.charging) {
      batteryData.dischargingTime = Math.floor(Math.random() * 14400) + 3600;
    }

    const batteryProto = {};
    for (const [key, val] of Object.entries(batteryData)) {
      batteryProto[key] = { value: val, writable: false, enumerable: true };
    }
    batteryProto.addEventListener = { value: function() {} };
    batteryProto.removeEventListener = { value: function() {} };
    batteryProto.dispatchEvent = { value: function() { return true; } };
    const batteryManager = Object.create(EventTarget.prototype, batteryProto);

    const origGetBattery = navigator.getBattery;
    Object.defineProperty(navigator, 'getBattery', {
      value: function getBattery() {
        return Promise.resolve(batteryManager);
      },
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  // === MediaDevices: fake camera + microphone ===
  if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
    const fakeDevices = [
      { deviceId: crypto.randomUUID(), kind: 'audioinput', label: '', groupId: crypto.randomUUID() },
      { deviceId: crypto.randomUUID(), kind: 'videoinput', label: '', groupId: crypto.randomUUID() },
      { deviceId: crypto.randomUUID(), kind: 'audiooutput', label: '', groupId: crypto.randomUUID() },
    ];

    const origEnumerate = navigator.mediaDevices.enumerateDevices;
    navigator.mediaDevices.enumerateDevices = function enumerateDevices() {
      return Promise.resolve(fakeDevices.map(d => {
        const info = new Object();
        Object.defineProperties(info, {
          deviceId: { value: d.deviceId, enumerable: true },
          kind: { value: d.kind, enumerable: true },
          label: { value: d.label, enumerable: true },
          groupId: { value: d.groupId, enumerable: true },
          toJSON: { value: function() { return { deviceId: d.deviceId, kind: d.kind, label: d.label, groupId: d.groupId }; } },
        });
        return info;
      }));
    };
  }

  // === Permissions API: return realistic values ===
  if (typeof navigator !== 'undefined' && navigator.permissions) {
    const origQuery = navigator.permissions.query.bind(navigator.permissions);
    const permissionOverrides = {
      'notifications': 'default',
      'geolocation': 'prompt',
      'camera': 'prompt',
      'microphone': 'prompt',
      'persistent-storage': 'granted',
      'push': 'default',
      'midi': 'granted',
      'background-sync': 'granted',
      'accelerometer': 'granted',
      'gyroscope': 'granted',
      'magnetometer': 'granted',
      'clipboard-read': 'prompt',
      'clipboard-write': 'granted',
    };

    navigator.permissions.query = function query(desc) {
      const name = desc && desc.name;
      if (name && permissionOverrides[name] !== undefined) {
        return Promise.resolve({
          state: permissionOverrides[name],
          status: permissionOverrides[name],
          onchange: null,
          addEventListener: function() {},
          removeEventListener: function() {},
          dispatchEvent: function() { return true; },
        });
      }
      return origQuery(desc);
    };
  }

  // === Notification.permission default value ===
  if (typeof Notification !== 'undefined') {
    try {
      Object.defineProperty(Notification, 'permission', {
        get: () => 'default',
        configurable: true,
      });
    } catch (e) {}
  }

  // === window.chrome completeness ===
  // Ensure window.chrome exists with expected methods
  if (typeof window !== 'undefined' && !window.chrome) {
    window.chrome = {};
  }
  if (typeof window !== 'undefined' && window.chrome) {
    if (!window.chrome.app) {
      window.chrome.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: function() { return null; },
        getIsInstalled: function() { return false; },
        installState: function(cb) { if (cb) cb('not_installed'); },
      };
    }
    if (!window.chrome.csi) {
      window.chrome.csi = function() {
        return {
          startE: Date.now() - Math.floor(Math.random() * 1000),
          onloadT: Date.now() - Math.floor(Math.random() * 500),
          pageT: Math.random() * 2000 + 500,
          tran: 15,
        };
      };
    }
    if (!window.chrome.loadTimes) {
      window.chrome.loadTimes = function() {
        return {
          commitLoadTime: Date.now() / 1000 - Math.random(),
          connectionInfo: 'h2',
          finishDocumentLoadTime: Date.now() / 1000 - Math.random() * 0.5,
          finishLoadTime: Date.now() / 1000 - Math.random() * 0.3,
          firstPaintAfterLoadTime: 0,
          firstPaintTime: Date.now() / 1000 - Math.random() * 0.8,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'h2',
          requestTime: Date.now() / 1000 - 1 - Math.random(),
          startLoadTime: Date.now() / 1000 - 1 - Math.random(),
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
        };
      };
    }
  }

  // === Prevent Brave/Firefox detection tricks ===
  if (typeof navigator !== 'undefined') {
    try {
      if (navigator.brave) {
        Object.defineProperty(navigator, 'brave', { get: () => undefined });
      }
    } catch (e) {}
  }

  // navigator.webdriver is already handled by --disable-blink-features=AutomationControlled
  // DO NOT override it here — JS-level overrides are detectable and counterproductive

  // === visibilityState and document.hasFocus ===
  if (typeof document !== 'undefined') {
    Object.defineProperty(document, 'visibilityState', {
      get: () => 'visible',
      configurable: true,
    });
    Object.defineProperty(document, 'hidden', {
      get: () => false,
      configurable: true,
    });
  }

  // === Block port scanning ===
  // Sites like BrowserScan scan localhost ports via WebSocket/fetch timing attacks
  if (typeof WebSocket !== 'undefined') {
    const OrigWebSocket = WebSocket;
    window.WebSocket = function(url, protocols) {
      try {
        const u = new URL(url);
        if (u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '0.0.0.0' || u.hostname === '::1') {
          throw new DOMException('WebSocket connection failed', 'SecurityError');
        }
      } catch (e) {
        if (e instanceof DOMException) throw e;
      }
      return protocols ? new OrigWebSocket(url, protocols) : new OrigWebSocket(url);
    };
    window.WebSocket.prototype = OrigWebSocket.prototype;
    window.WebSocket.CONNECTING = OrigWebSocket.CONNECTING;
    window.WebSocket.OPEN = OrigWebSocket.OPEN;
    window.WebSocket.CLOSING = OrigWebSocket.CLOSING;
    window.WebSocket.CLOSED = OrigWebSocket.CLOSED;
  }

  // === Spoof screen properties for consistency ===
  // Xvfb might have slight differences from what CloakBrowser reports
  if (typeof screen !== 'undefined') {
    try {
      const screenDesc = Object.getOwnPropertyDescriptor(screen, 'availTop');
      if (!screenDesc || screenDesc.configurable) {
        Object.defineProperty(screen, 'availTop', { get: () => 0, configurable: true });
        Object.defineProperty(screen, 'availLeft', { get: () => 0, configurable: true });
      }
    } catch (e) {}
  }

  // === Reduce fingerprint entropy: make devicePixelRatio consistent ===
  if (typeof window !== 'undefined') {
    try {
      Object.defineProperty(window, 'devicePixelRatio', {
        get: () => 1,
        configurable: true,
      });
    } catch (e) {}
  }

  // === Fix Intl API locale to match navigator.language ===
  // Xvfb/container env may report en-US, but we need it to match the profile language
  if (typeof navigator !== 'undefined' && typeof Intl !== 'undefined') {
    const profileLang = navigator.language || 'en-US';
    const origDTF = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function(...args) {
      if (!args[0]) args[0] = profileLang;
      return new origDTF(...args);
    };
    Intl.DateTimeFormat.prototype = origDTF.prototype;
    Intl.DateTimeFormat.supportedLocalesOf = origDTF.supportedLocalesOf.bind(origDTF);
    Object.defineProperty(Intl.DateTimeFormat, 'name', { value: 'DateTimeFormat' });

    const origNF = Intl.NumberFormat;
    Intl.NumberFormat = function(...args) {
      if (!args[0]) args[0] = profileLang;
      return new origNF(...args);
    };
    Intl.NumberFormat.prototype = origNF.prototype;
    Intl.NumberFormat.supportedLocalesOf = origNF.supportedLocalesOf.bind(origNF);
    Object.defineProperty(Intl.NumberFormat, 'name', { value: 'NumberFormat' });

    const origColl = Intl.Collator;
    Intl.Collator = function(...args) {
      if (!args[0]) args[0] = profileLang;
      return new origColl(...args);
    };
    Intl.Collator.prototype = origColl.prototype;
    Intl.Collator.supportedLocalesOf = origColl.supportedLocalesOf.bind(origColl);
    Object.defineProperty(Intl.Collator, 'name', { value: 'Collator' });
  }
})();
