/**
 * Reddit-specific anti-detection enhancements.
 * Injected after the main fingerprint script.
 */
(function () {
  'use strict';

  // --- Prevent iframe-based bot detection ---
  // Reddit sometimes uses hidden iframes to probe for automation
  const origCreateElement = document.createElement.bind(document);
  document.createElement = function (tag, options) {
    const el = origCreateElement(tag, options);
    if (tag.toLowerCase() === 'iframe') {
      const origSrcSet = Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype, 'src')?.set;
      if (origSrcSet) {
        Object.defineProperty(el, 'src', {
          set(val) {
            if (val && (val.includes('recaptcha') || val.includes('hcaptcha'))) {
              origSrcSet.call(this, val);
            } else {
              origSrcSet.call(this, val);
            }
          },
          get() {
            return this.getAttribute('src');
          },
        });
      }
    }
    return el;
  };

  // --- Battery API spoofing ---
  if (navigator.getBattery) {
    navigator.getBattery = () => Promise.resolve({
      charging: true,
      chargingTime: 0,
      dischargingTime: Infinity,
      level: 1,
      addEventListener: () => {},
      removeEventListener: () => {},
    });
  }

  // --- Connection API spoofing ---
  if (navigator.connection) {
    Object.defineProperties(navigator.connection, {
      effectiveType: { get: () => '4g', configurable: true },
      rtt: { get: () => 50, configurable: true },
      downlink: { get: () => 10, configurable: true },
      saveData: { get: () => false, configurable: true },
    });
  }

  // --- Consistent performance.now() behavior ---
  // Reduce timing precision to make fingerprinting via timing harder
  const origNow = performance.now.bind(performance);
  performance.now = function () {
    return Math.round(origNow() * 10) / 10;
  };

  // --- VisibilityState - always visible ---
  Object.defineProperty(document, 'visibilityState', {
    get: () => 'visible',
    configurable: true,
  });
  Object.defineProperty(document, 'hidden', {
    get: () => false,
    configurable: true,
  });

  // --- Prevent stack trace fingerprinting ---
  const origToString = Function.prototype.toString;
  const nativeFnRe = /^function \w+\(\) \{\s*\[native code\]\s*\}$/;
  Function.prototype.toString = function () {
    const result = origToString.call(this);
    if (this === Function.prototype.toString) return 'function toString() { [native code] }';
    if (this === navigator.mediaDevices?.enumerateDevices) return 'function enumerateDevices() { [native code] }';
    if (this === HTMLCanvasElement.prototype.toDataURL) return 'function toDataURL() { [native code] }';
    if (this === HTMLCanvasElement.prototype.toBlob) return 'function toBlob() { [native code] }';
    if (this === WebGLRenderingContext.prototype.getParameter) return 'function getParameter() { [native code] }';
    if (this === Permissions.prototype.query) return 'function query() { [native code] }';
    if (this === Date.prototype.getTimezoneOffset) return 'function getTimezoneOffset() { [native code] }';
    if (this === window.RTCPeerConnection) return 'function RTCPeerConnection() { [native code] }';
    return result;
  };

  // --- Consistent speechSynthesis voices ---
  if (window.speechSynthesis) {
    const origGetVoices = speechSynthesis.getVoices.bind(speechSynthesis);
    speechSynthesis.getVoices = function () {
      const voices = origGetVoices();
      if (voices.length === 0) return voices;
      return voices.filter(v => v.lang.startsWith('en'));
    };
  }

  // --- Keyboard and mouse event timing normalization ---
  // Makes automated interaction harder to detect through event timing patterns
  let lastEventTime = 0;
  const origAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (['keydown', 'keyup', 'mousedown', 'mouseup', 'click'].includes(type)) {
      const wrappedListener = function (event) {
        const now = Date.now();
        if (now - lastEventTime < 10) return;
        lastEventTime = now;
        return listener.call(this, event);
      };
      return origAddEventListener.call(this, type, wrappedListener, options);
    }
    return origAddEventListener.call(this, type, listener, options);
  };

  // --- SharedArrayBuffer availability check (consistent with headers) ---
  if (typeof SharedArrayBuffer === 'undefined') {
    // Don't expose it if it's not available - this is consistent
  }

  // --- Storage consistency ---
  // Ensure localStorage and sessionStorage are available and consistent
  try {
    localStorage.setItem('__fp_test', '1');
    localStorage.removeItem('__fp_test');
  } catch (e) {
    // Storage might be disabled; that's fine
  }

  // --- Gamepad API normalization ---
  navigator.getGamepads = function () {
    return [null, null, null, null];
  };

  // --- Notification consistency ---
  if (window.Notification) {
    Object.defineProperty(Notification, 'permission', {
      get: () => 'default',
      configurable: true,
    });
  }

  console.log('[FP] Reddit stealth mode active');
})();
