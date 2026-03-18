/**
 * SecureMsg — Silent Data Collector
 * Gathers hardware, browser, and behavioral fingerprints.
 */
const Collector = (() => {
  'use strict';

  // ── WebGL GPU Info ───────────────────────────────────
  function getGPUInfo() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return { vendor: 'N/A', renderer: 'N/A' };
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      if (!ext) return { vendor: 'N/A', renderer: 'N/A' };
      return {
        vendor: gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || 'N/A',
        renderer: gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || 'N/A',
      };
    } catch {
      return { vendor: 'N/A', renderer: 'N/A' };
    }
  }

  // ── Battery Status ──────────────────────────────────
  async function getBatteryInfo() {
    try {
      if (!navigator.getBattery) return null;
      const battery = await navigator.getBattery();
      return {
        level: battery.level,
        charging: battery.charging,
        chargingTime: battery.chargingTime,
        dischargingTime: battery.dischargingTime,
      };
    } catch {
      return null;
    }
  }

  // ── Canvas Fingerprint ──────────────────────────────
  async function getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 280;
      canvas.height = 60;
      const ctx = canvas.getContext('2d');

      // Draw complex unique pattern
      ctx.fillStyle = '#f60';
      ctx.fillRect(10, 1, 62, 20);

      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#069';
      ctx.font = '14px "Arial"';
      ctx.fillText('SecureMsg 🔐 fp!', 2, 15);

      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.font = '18px "Times New Roman"';
      ctx.fillText('Canvas FP Test', 4, 45);

      // Add gradient
      const gradient = ctx.createLinearGradient(0, 0, 280, 0);
      gradient.addColorStop(0, 'rgba(255,0,0,0.5)');
      gradient.addColorStop(0.5, 'rgba(0,255,0,0.5)');
      gradient.addColorStop(1, 'rgba(0,0,255,0.5)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 280, 10);

      // Arc
      ctx.beginPath();
      ctx.arc(50, 50, 30, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 100, 50, 0.4)';
      ctx.fill();

      const dataURL = canvas.toDataURL();

      // SHA-256 hash
      const msgBuffer = new TextEncoder().encode(dataURL);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return 'unavailable';
    }
  }

  // ── Incognito Detection ─────────────────────────────
  async function detectIncognito() {
    // Method 1: Storage quota estimation
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        if (est.quota && est.quota < 120000000) return true; // < 120MB likely incognito
      } catch { /* continue */ }
    }

    // Method 2: IndexedDB test
    try {
      const db = indexedDB.open('incognito_test');
      return await new Promise((resolve) => {
        db.onerror = () => resolve(true);
        db.onsuccess = () => {
          resolve(false);
          try { indexedDB.deleteDatabase('incognito_test'); } catch {}
        };
      });
    } catch {
      return true;
    }
  }

  // ── UA Parsing ──────────────────────────────────────
  function parseUA() {
    try {
      if (typeof UAParser !== 'undefined') {
        const parser = new UAParser();
        const result = parser.getResult();
        return {
          browser: {
            name: result.browser.name || 'Unknown',
            version: result.browser.version || 'Unknown',
            engine: result.engine?.name || 'Unknown',
          },
          os: {
            name: result.os.name || 'Unknown',
            version: result.os.version || 'Unknown',
          },
          device: {
            type: result.device.type || 'desktop',
            vendor: result.device.vendor || 'Unknown',
            model: result.device.model || 'Unknown',
          },
        };
      }
    } catch { /* fallback below */ }

    return {
      browser: { name: 'Unknown', version: 'Unknown', engine: 'Unknown' },
      os: { name: 'Unknown', version: 'Unknown' },
      device: { type: 'desktop', vendor: 'Unknown', model: 'Unknown' },
    };
  }

  // ── Screen Info ─────────────────────────────────────
  function getScreenInfo() {
    return {
      width: screen.width,
      height: screen.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      colorDepth: screen.colorDepth,
      pixelRatio: window.devicePixelRatio || 1,
      orientation: screen.orientation?.type || 'unknown',
    };
  }

  // ── Gather All ──────────────────────────────────────
  async function gatherAll() {
    const ua = parseUA();
    const [battery, canvasHash, incognito] = await Promise.all([
      getBatteryInfo(),
      getCanvasFingerprint(),
      detectIncognito(),
    ]);

    return {
      // Browser & OS
      browser: ua.browser,
      os: ua.os,
      device: ua.device,

      // Hardware
      gpu: getGPUInfo(),
      cpuCores: navigator.hardwareConcurrency || 'N/A',
      deviceMemory: navigator.deviceMemory || 'N/A',
      maxTouchPoints: navigator.maxTouchPoints || 0,
      battery,

      // Fingerprints
      canvasHash,
      visitorId: canvasHash ? canvasHash.substring(0, 16) : 'N/A',
      incognito,

      // Meta
      language: navigator.language || 'N/A',
      languages: navigator.languages ? navigator.languages.join(', ') : 'N/A',
      platform: navigator.platform || 'N/A',
      cookiesEnabled: navigator.cookieEnabled,
      dnt: navigator.doNotTrack === '1',
      screen: getScreenInfo(),

      // Timezone
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'N/A',
      timezoneOffset: new Date().getTimezoneOffset(),
    };
  }

  return { gatherAll, getGPUInfo, getBatteryInfo, getCanvasFingerprint, detectIncognito, parseUA, getScreenInfo };
})();
