(() => {
  'use strict';

  // === toString() protection: make overridden functions look native ===
  const nativeFnMap = new WeakMap();

  function maskAsNative(fn, nativeName) {
    nativeFnMap.set(fn, `function ${nativeName || fn.name || ''}() { [native code] }`);
    return fn;
  }

  const origToString = Function.prototype.toString;
  Function.prototype.toString = function() {
    if (nativeFnMap.has(this)) return nativeFnMap.get(this);
    return origToString.call(this);
  };
  nativeFnMap.set(Function.prototype.toString, 'function toString() { [native code] }');

  // === Fix incognito/private browsing detection ===
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.estimate) {
    const origEstimate = navigator.storage.estimate.bind(navigator.storage);
    const fakeEstimate = async function estimate() {
      const real = await origEstimate();
      return {
        quota: Math.max(real.quota || 0, 2147483648 + Math.floor(Math.random() * 1073741824)),
        usage: real.usage || Math.floor(Math.random() * 50000),
        usageDetails: real.usageDetails || {},
      };
    };
    Object.defineProperty(navigator.storage, 'estimate', {
      value: fakeEstimate,
      writable: true,
      configurable: true,
    });
  }

  if (typeof window !== 'undefined' && !window.webkitRequestFileSystem) {
    window.webkitRequestFileSystem = function webkitRequestFileSystem(type, size, successCallback, errorCallback) {
      if (successCallback) {
        setTimeout(() => successCallback({ name: '', root: null }), 0);
      }
    };
    window.TEMPORARY = 0;
    window.PERSISTENT = 1;
  }

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
  if (typeof navigator !== 'undefined' && !navigator.connection) {
    const connectionData = {
      effectiveType: '4g',
      type: 'wifi',
      downlink: Math.round((10 + Math.random() * 40) * 20) / 20,
      downlinkMax: Infinity,
      rtt: Math.round((50 + Math.floor(Math.random() * 100)) / 25) * 25,
      saveData: false,
      onchange: null,
    };
    const connProto = {
      addEventListener: { value: function addEventListener() {} },
      removeEventListener: { value: function removeEventListener() {} },
      dispatchEvent: { value: function dispatchEvent() { return true; } },
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

  // === Battery API ===
  if (typeof navigator !== 'undefined') {
    const isLaptop = Math.random() > 0.6;
    const batteryData = {
      charging: isLaptop ? Math.random() > 0.5 : true,
      chargingTime: 0,
      dischargingTime: Infinity,
      level: isLaptop ? Math.round((0.6 + Math.random() * 0.4) * 100) / 100 : 1.0,
    };
    if (batteryData.charging && batteryData.level < 1) batteryData.chargingTime = Math.floor(Math.random() * 3600) + 600;
    if (!batteryData.charging) batteryData.dischargingTime = Math.floor(Math.random() * 14400) + 3600;

    const batteryProto = {};
    for (const [key, val] of Object.entries(batteryData)) {
      batteryProto[key] = { value: val, writable: false, enumerable: true };
    }
    batteryProto.addEventListener = { value: function addEventListener() {} };
    batteryProto.removeEventListener = { value: function removeEventListener() {} };
    batteryProto.dispatchEvent = { value: function dispatchEvent() { return true; } };
    const batteryManager = Object.create(EventTarget.prototype, batteryProto);

    Object.defineProperty(navigator, 'getBattery', {
      value: function getBattery() {
        return Promise.resolve(batteryManager);
      },
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }

  // === window.chrome completeness ===
  if (typeof window !== 'undefined' && !window.chrome) window.chrome = {};
  if (typeof window !== 'undefined' && window.chrome) {
    if (!window.chrome.app) {
      window.chrome.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: function getDetails() { return null; },
        getIsInstalled: function getIsInstalled() { return false; },
        installState: function installState(cb) { if (cb) cb('not_installed'); },
      };
    }
    if (!window.chrome.csi) {
      window.chrome.csi = function csi() {
        return {
          startE: Date.now() - Math.floor(Math.random() * 1000),
          onloadT: Date.now() - Math.floor(Math.random() * 500),
          pageT: Math.random() * 2000 + 500,
          tran: 15,
        };
      };
    }
    if (!window.chrome.loadTimes) {
      window.chrome.loadTimes = function loadTimes() {
        const now = Date.now() / 1000;
        return {
          commitLoadTime: now - Math.random(),
          connectionInfo: 'h2',
          finishDocumentLoadTime: now - Math.random() * 0.5,
          finishLoadTime: now - Math.random() * 0.3,
          firstPaintAfterLoadTime: 0,
          firstPaintTime: now - Math.random() * 0.8,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'h2',
          requestTime: now - 1 - Math.random(),
          startLoadTime: now - 1 - Math.random(),
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
        };
      };
    }
  }

  // === Prevent Brave detection ===
  if (typeof navigator !== 'undefined') {
    try { if (navigator.brave) Object.defineProperty(navigator, 'brave', { get: () => undefined }); } catch (e) {}
  }

  // === visibilityState ===
  if (typeof document !== 'undefined') {
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true });
  }

  // === Screen consistency ===
  if (typeof screen !== 'undefined') {
    try {
      const d = Object.getOwnPropertyDescriptor(screen, 'availTop');
      if (!d || d.configurable) {
        Object.defineProperty(screen, 'availTop', { get: () => 0, configurable: true });
        Object.defineProperty(screen, 'availLeft', { get: () => 0, configurable: true });
      }
    } catch (e) {}
  }

  if (typeof window !== 'undefined') {
    try { Object.defineProperty(window, 'devicePixelRatio', { get: () => 1, configurable: true }); } catch (e) {}
  }

  // === Intl API locale fix ===
  if (typeof navigator !== 'undefined' && typeof Intl !== 'undefined') {
    const profileLang = navigator.language || 'en-US';

    const wrapIntl = (OrigClass, name) => {
      const Wrapped = function(...args) {
        if (!args[0]) args[0] = profileLang;
        if (new.target) return new OrigClass(...args);
        return OrigClass(...args);
      };
      Wrapped.prototype = OrigClass.prototype;
      Wrapped.supportedLocalesOf = OrigClass.supportedLocalesOf.bind(OrigClass);
      Object.defineProperty(Wrapped, 'name', { value: name, configurable: true });
      nativeFnMap.set(Wrapped, `function ${name}() { [native code] }`);
      nativeFnMap.set(Wrapped.supportedLocalesOf, `function supportedLocalesOf() { [native code] }`);
      return Wrapped;
    };

    Intl.DateTimeFormat = wrapIntl(Intl.DateTimeFormat, 'DateTimeFormat');
    Intl.NumberFormat = wrapIntl(Intl.NumberFormat, 'NumberFormat');
    Intl.Collator = wrapIntl(Intl.Collator, 'Collator');
  }
})();
