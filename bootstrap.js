(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var root = $('bootstrapper');
  var msgEl = $('bxMsg'), pctEl = $('bxPct'), barEl = $('bxBar'), fillEl = $('bxFill');
  var subEl = $('bxSub'), chipEl = $('bxChip'), chipTx = $('bxChipText'), verEl = $('bxVer');
  var actionsEl = $('bxActions'), video = $('bxVideo');
  var hasHost = !!(window.chrome && window.chrome.webview);
  var params = new URLSearchParams(location.search);
  var demo = hasHost ? null : (params.get('demo') || 'latest');
  var startedAt = performance.now();
  var MIN_SPLASH_MS = 2400;
  var HOST_WAIT_MS = 20000;
  var hostTimer = 0, continued = false, lastState = '', installed = '';

  // ---- logo / name ---------------------------------------------------------------------------
  var nameEl = $('bxName');
  'OblivionX'.split('').forEach(function (ch, i, a) {
    var s = document.createElement('span');
    s.textContent = ch;
    if (i === a.length - 1) s.className = 'x';
    s.style.animationDelay = (0.25 + i * 0.045) + 's';
    nameEl.appendChild(s);
  });
  nameEl.setAttribute('aria-label', 'OblivionX');
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches && video) video.pause();

  // ---- tiny view helpers ---------------------------------------------------------------------
  function post(action) {
    if (hasHost) window.chrome.webview.postMessage({ action: action });
  }
  function chip(kind, text) { root.dataset.tone = kind || ''; chipEl.className = 'bx-chip' + (kind ? ' ' + kind : ''); chipTx.textContent = text; }
  function progress(value) {
    if (value == null) { barEl.classList.add('indet'); pctEl.textContent = ''; return; }
    var p = Math.max(0, Math.min(100, value));
    barEl.classList.remove('indet');
    fillEl.style.width = p + '%';
    pctEl.textContent = Math.round(p) + '%';
  }
  function message(text, dots) {
    msgEl.textContent = text;
    root.classList.toggle('no-dots', dots === false);
  }
  function sub(text) { subEl.textContent = text || ''; }
  function bytes(n) {
    if (!n) return '0 MB';
    return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  }
  function actions(list) {
    actionsEl.textContent = '';
    actionsEl.hidden = !list || !list.length;
    (list || []).forEach(function (a, index) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'bx-btn' + (a.primary ? ' primary' : '');
      b.textContent = a.label;
      b.addEventListener('click', function () {
        if (a.action === 'bootstrap-continue') {
          if (continued) return;
          continued = true;
        }
        actions([]);
        a.run ? a.run() : post(a.action);
      });
      actionsEl.appendChild(b);
      if (index === 0) setTimeout(function () { b.focus({ preventScroll: true }); }, 30);
    });
  }
  function waitForHost() {
    clearTimeout(hostTimer);
    hostTimer = setTimeout(function () {
      handle({ state: 'offline', message: 'The update service did not respond.' });
    }, HOST_WAIT_MS);
  }

  // ---- host state machine ----------------------------------------------------------------------
  function continueSoon() {
    var delay = Math.max(250, MIN_SPLASH_MS - (performance.now() - startedAt));
    setTimeout(function () {
      if (continued) return;
      continued = true;
      post('bootstrap-continue');
    }, delay);
  }
  function continueButton() { return { label: 'Continue with v' + (installed || 'installed'), action: 'bootstrap-continue' }; }

  function handle(d) {
    clearTimeout(hostTimer);
    if (!d || typeof d.state !== 'string') return;
    if (d.installedVersion) { installed = d.installedVersion; verEl.textContent = 'OblivionX v' + installed; }
    lastState = d.state;
    switch (d.state) {
      case 'checking':
        message('Checking for updates'); sub(''); progress(null); chip('', 'Checking'); actions([]); waitForHost(); break;
      case 'latest':
        message('You\u2019re up to date', false); sub('Installed v' + installed); progress(100); chip('ok', 'Up to date');
        actions([]); continueSoon(); break;
      case 'available':
        message('Update available: v' + d.latestVersion, false);
        sub('Installed v' + installed + '  \u2192  v' + d.latestVersion + '. ' + (d.message || ''));
        progress(100); chip('warn', 'Update available');
        actions((d.canDownload
          ? [{ label: 'Download update', action: 'bootstrap-download', primary: true }]
          : [{ label: 'Open release page', action: 'bootstrap-open-release', primary: true }]).concat([continueButton()]));
        break;
      case 'offline':
        message('Couldn\u2019t check for updates', false); sub(d.message || ''); progress(100); chip('warn', 'Offline');
        actions([{ label: 'Retry', action: 'bootstrap-retry', primary: true }, continueButton()]); break;
      case 'downloading':
        message('Downloading update'); progress(d.progress);
        sub(d.total ? bytes(d.received) + ' of ' + bytes(d.total) : ''); chip('', 'Downloading'); actions([]); waitForHost(); break;
      case 'verifying':
        message('Verifying download'); sub('Checking the SHA-256 checksum'); progress(null); chip('', 'Verifying'); waitForHost(); break;
      case 'download-ready':
        message('Update downloaded and verified', false); sub(d.message || ''); progress(100); chip('ok', 'Verified');
        actions([{ label: 'Show file', action: 'bootstrap-open-download', primary: true }, continueButton()]); break;
      case 'download-error':
        message('Update download failed', false); sub(d.message || ''); progress(100); chip('err', 'Failed');
        actions([{ label: 'Retry download', action: 'bootstrap-download', primary: true },
                 { label: 'Open release page', action: 'bootstrap-open-release' }, continueButton()]); break;
      case 'starting':
        message('Starting OblivionX'); sub(''); progress(null); chip('', 'Starting'); actions([]); waitForHost(); break;
      case 'loading-ui':
        message('Loading application'); sub(''); progress(null); chip('', 'Loading'); actions([]); waitForHost(); break;
      case 'startup-error':
        continued = false; message('OblivionX could not start', false); sub(d.message || ''); progress(100); chip('err', 'Error');
        actions([{ label: 'Retry', action: 'bootstrap-continue', primary: true },
                 { label: 'Close', action: 'window-close' }]); break;
    }
  }

  if (hasHost) {
    window.chrome.webview.addEventListener('message', function (event) {
      var d = event.data;
      if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { return; } }
      if (d && d.action === 'bootstrap') handle(d);
    });
  }
  $('bxClose').addEventListener('click', function () { post('window-close'); });
  verEl.textContent = 'OblivionX';

  // ---- browser preview only (?demo=latest|available|offline|download|error) -----------------
  function previewStates() {
    var base = { installedVersion: '15.2.1', latestVersion: '15.3.0', canDownload: true };
    function emit(extra, wait) { return new Promise(function (r) { setTimeout(function () { handle(Object.assign({}, base, extra)); r(); }, wait); }); }
    emit({ state: 'checking' }, 150).then(function () {
      if (demo === 'latest') return emit({ state: 'latest' }, 1200);
      if (demo === 'offline') return emit({ state: 'offline', message: 'Preview: the update service could not be reached.' }, 1200);
      return emit({ state: 'available', message: 'Preview data only.' }, 1200).then(function () {
        if (demo === 'available') return;
        actions([]);
        return emit({ state: 'downloading', progress: 38, received: 3.1 * 1048576, total: 8.2 * 1048576 }, 200).then(function () {
          if (demo === 'error') return emit({ state: 'download-error', message: 'Preview: checksum mismatch. The file was not saved.' }, 800);
          return emit({ state: 'download-ready', message: 'Preview: saved in the OblivionX Updates folder.' }, 1000);
        });
      });
    });
  }
  window.__bootstrapPreview = hasHost ? undefined : handle;
  if (hasHost) { post('bootstrap-ready'); waitForHost(); }
  else previewStates();
})();
