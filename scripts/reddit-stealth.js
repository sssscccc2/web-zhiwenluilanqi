/**
 * Reddit-specific anti-detection enhancements.
 * Injected after the main fingerprint script.
 */
(function () {
  'use strict';

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

  // --- VisibilityState - always visible ---
  Object.defineProperty(document, 'visibilityState', {
    get: () => 'visible',
    configurable: true,
  });
  Object.defineProperty(document, 'hidden', {
    get: () => false,
    configurable: true,
  });

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
