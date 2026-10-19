/* ==========================================================================
   Einwand-Karussell – App-Logik (Vanilla-JS, keine Abhängigkeiten)
   ========================================================================== */
(function () {
  'use strict';

  var PHASEN = window.PHASEN || [];
  var EINWAENDE = window.EINWAENDE || [];
  var VERSTAERKER = window.VERSTAERKER || [];

  /* ------------------------------------------------------------------------
     Hilfsfunktionen
     ------------------------------------------------------------------------ */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function rand(n) { return Math.floor(Math.random() * n); }
  function pick(arr) { return arr[rand(arr.length)]; }
  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = rand(i + 1), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  var reduceMotionMQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reduced() { return !!(reduceMotionMQ && reduceMotionMQ.matches); }

  /* ------------------------------------------------------------------------
     Speicher (localStorage immer in try/catch, Fallback: Arbeitsspeicher)
     ------------------------------------------------------------------------ */
  var KEY = { settings: 'ek.v1.settings', ratings: 'ek.v1.ratings', stats: 'ek.v1.stats' };
  var memory = {};

  function load(key, fallback) {
    try {
      var raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* Speicher nicht verfügbar */ }
    return memory[key] !== undefined ? memory[key] : fallback;
  }
  function save(key, value) {
    memory[key] = value;
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignorieren */ }
  }
  function merge(defaults, saved) {
    var out = {};
    for (var k in defaults) out[k] = (saved && saved[k] !== undefined) ? saved[k] : defaults[k];
    return out;
  }

  var DEFAULTS = {
    rolle: 'alle', schwierigkeit: 'alle', timer: 30,
    sound: false, vibration: true, zweiWalzen: false,
    teamModus: false, peerFeedback: false, namen: ''
  };
  var settings = merge(DEFAULTS, load(KEY.settings, {}));
  var ratings = load(KEY.ratings, {});            // Einwand-ID -> 'sicher' | 'mittel' | 'ueben'
  var stats = merge({ spins: 0, sicher: 0, mittel: 0, ueben: 0 }, load(KEY.stats, {}));

  function saveSettings() { save(KEY.settings, settings); }
  function saveRatings() { save(KEY.ratings, ratings); }
  function saveStats() { save(KEY.stats, stats); }

  /* ------------------------------------------------------------------------
     Laufzeit-Zustand
     ------------------------------------------------------------------------ */
  var st = {
    screen: 'start', prevScreen: 'start',
    spinning: false,
    practice: false,
    current: null,        // { einwand, phase, verst, name }
    bag: [], bagSig: '', lastEinwand: '', lastVerst: '',
    namesDone: [], lastName: '',
    cardRating: null,
    timer: { id: null, end: 0, total: 0, running: false },
    sheetOpen: false,
    lastFocus: null,
    toastTimer: null
  };

  var LEVELS = {
    leicht: { label: 'Leicht', text: 'Leicht: Missverständnis oder Vorwand' },
    mittel: { label: 'Mittel', text: 'Mittel: teils berechtigt, ehrlich antworten' },
    schwer: { label: 'Schwer', text: 'Schwer: echter Ausschlussgrund' }
  };

  /* ------------------------------------------------------------------------
     Auswahl-Logik
     ------------------------------------------------------------------------ */
  function matchRolle(e) { return settings.rolle === 'alle' || e.rolle.indexOf(settings.rolle) > -1; }
  function matchLevel(e) { return settings.schwierigkeit === 'alle' || e.schwierigkeit === settings.schwierigkeit; }

  function getPool() {
    if (st.practice) return EINWAENDE.filter(function (e) { return ratings[e.id] === 'ueben'; });
    return EINWAENDE.filter(function (e) { return matchRolle(e) && matchLevel(e); });
  }

  /* Rotation ohne Wiederholung, bis alle dran waren */
  function drawEinwand(pool) {
    var sig = pool.map(function (e) { return e.id; }).join('|');
    if (st.bagSig !== sig || !st.bag.length) {
      st.bag = shuffle(pool.map(function (e) { return e.id; }));
      st.bagSig = sig;
      if (st.bag.length > 1 && st.bag[st.bag.length - 1] === st.lastEinwand) {
        var t = st.bag[0]; st.bag[0] = st.bag[st.bag.length - 1]; st.bag[st.bag.length - 1] = t;
      }
    }
    var id = st.bag.pop();
    st.lastEinwand = id;
    return byId(EINWAENDE, id);
  }

  function verstaerkerFor(phaseId) {
    return VERSTAERKER.filter(function (v) {
      return !v.passtZuPhasen || !v.passtZuPhasen.length || v.passtZuPhasen.indexOf(phaseId) > -1;
    });
  }
  function drawVerstaerker(phaseId) {
    var cands = verstaerkerFor(phaseId);
    if (!cands.length) return null;
    if (cands.length > 1) cands = cands.filter(function (v) { return v.id !== st.lastVerst; });
    var v = pick(cands);
    st.lastVerst = v.id;
    return v;
  }

  function parseNames() {
    var seen = {}, out = [];
    String(settings.namen || '').split(/[,;\n]/).forEach(function (n) {
      n = n.trim();
      if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = 1; out.push(n); }
    });
    return out;
  }
  function nextName() {
    var names = parseNames();
    if (!names.length) return '';
    st.namesDone = st.namesDone.filter(function (n) { return names.indexOf(n) > -1; });
    var cands = names.filter(function (n) { return st.namesDone.indexOf(n) < 0; });
    if (!cands.length) {
      st.namesDone = [];
      cands = names.filter(function (n) { return names.length < 2 || n !== st.lastName; });
    }
    var name = pick(cands);
    st.namesDone.push(name);
    st.lastName = name;
    return name;
  }

  /* ------------------------------------------------------------------------
     Navigation
     ------------------------------------------------------------------------ */
  var HASH = { start: 'start', game: 'spiel', settings: 'einstellungen' };
  var FROM_HASH = { start: 'start', spiel: 'game', einstellungen: 'settings' };
  var firstRoute = true;

  function go(screen) {
    var h = HASH[screen];
    if (location.hash.replace('#', '') === h) route(); else location.hash = h;
  }

  function route() {
    var screen = FROM_HASH[location.hash.replace('#', '')] || 'start';
    if (screen === 'game' && !getPool().length) {
      if (st.practice) { st.practice = false; toast('Geschafft! Keine Einwände mehr in der Übungsliste.'); }
      if (!getPool().length) screen = 'start';
    }
    showScreen(screen);
  }

  function showScreen(screen) {
    if (st.sheetOpen) closeSheet(true);
    if (st.screen !== screen) st.prevScreen = st.screen;
    st.screen = screen;
    $$('.screen').forEach(function (s) { s.hidden = s.getAttribute('data-screen') !== screen; });
    var onSettings = screen === 'settings';
    $('#nav-icon-settings').toggleAttribute('hidden', onSettings);   // SVG hat keine .hidden-Property
    $('#nav-icon-close').toggleAttribute('hidden', !onSettings);
    $('#btn-nav').setAttribute('aria-label', onSettings ? 'Einstellungen schließen' : 'Einstellungen und Statistik');
    if (screen === 'start') updateStart();
    if (screen === 'game') updateGame();
    if (screen === 'settings') renderStats();
    window.scrollTo(0, 0);
    if (!firstRoute) {
      var h = $('.screen:not([hidden]) [tabindex="-1"]');
      if (h) h.focus({ preventScroll: true });
    }
    firstRoute = false;
  }

  /* ------------------------------------------------------------------------
     Segmented Controls (Radios) und Schalter
     ------------------------------------------------------------------------ */
  var SEG = {
    rolle: [['setter', 'Setter'], ['closer', 'Closer'], ['alle', 'Alle']],
    schwierigkeit: [['leicht', 'Leicht'], ['mittel', 'Mittel'], ['schwer', 'Schwer'], ['alle', 'Alle']],
    timer: [[15, '15 s'], [30, '30 s'], [60, '60 s'], [0, 'Aus']]
  };

  function buildSegs() {
    $$('.seg').forEach(function (box, idx) {
      var key = box.getAttribute('data-seg');
      box.setAttribute('role', 'radiogroup');
      SEG[key].forEach(function (opt) {
        var label = document.createElement('label');
        label.className = 'seg-opt';
        var input = document.createElement('input');
        input.type = 'radio';
        input.name = key + '-' + idx;
        input.value = String(opt[0]);
        input.setAttribute('data-key', key);
        var span = document.createElement('span');
        span.textContent = opt[1];
        label.appendChild(input);
        label.appendChild(span);
        box.appendChild(label);
      });
    });
    document.addEventListener('change', function (ev) {
      var t = ev.target;
      if (t.matches && t.matches('input[type="radio"][data-key]')) {
        var key = t.getAttribute('data-key');
        settings[key] = key === 'timer' ? parseInt(t.value, 10) : t.value;
        saveSettings();
        syncControls();
        updateStart();
      } else if (t.matches && t.matches('input[data-setting]')) {
        settings[t.getAttribute('data-setting')] = t.checked;
        saveSettings();
        if (t.getAttribute('data-setting') === 'zweiWalzen') applyReelMode();
      }
    });
  }

  function syncControls() {
    $$('input[type="radio"][data-key]').forEach(function (r) {
      r.checked = String(settings[r.getAttribute('data-key')]) === r.value;
    });
    $$('input[data-setting]').forEach(function (c) { c.checked = !!settings[c.getAttribute('data-setting')]; });
    var n = $('#set-namen');
    if (n && n.value !== settings.namen) n.value = settings.namen;
  }

  /* ------------------------------------------------------------------------
     Start- und Spiel-Screen
     ------------------------------------------------------------------------ */
  function updateStart() {
    var pool = getPool();
    var info = $('#pool-info');
    var btn = $('#btn-start');
    $('#start-practice').hidden = !st.practice;
    if (!pool.length) {
      info.textContent = 'Für diese Auswahl gibt es keine Einwände. Wähle eine andere Rolle oder Schwierigkeit.';
      info.className = 'pool-info is-empty';
      btn.setAttribute('aria-disabled', 'true');
    } else {
      info.textContent = pool.length + (pool.length === 1 ? ' Einwand' : ' Einwände') + ' in dieser Auswahl.';
      info.className = 'pool-info';
      btn.removeAttribute('aria-disabled');
    }
  }

  function updateGame() {
    $('#game-practice').hidden = !st.practice;
    applyReelMode();
    updateWho();
    $('#btn-reopen').hidden = !st.current || st.spinning;
  }

  function updateWho() {
    var show = settings.teamModus && st.current && st.current.name;
    $('#who').hidden = !show;
    if (show) $('#who-name').textContent = st.current.name;
  }

  function applyReelMode() {
    $('#machine').classList.toggle('is-2', !!settings.zweiWalzen);
  }

  /* ------------------------------------------------------------------------
     Walzen
     ------------------------------------------------------------------------ */
  var reels = {};
  var IDLE_TEXT = {
    phase: 'Gesprächsphase',
    einwand: 'Dein Einwand erscheint hier',
    verstaerker: 'Dein Verstärker erscheint hier'
  };

  function makeItem(text, idle) {
    var d = document.createElement('div');
    d.className = 'reel-item' + (idle ? ' is-idle' : '');
    var s = document.createElement('span');
    s.textContent = text;
    d.appendChild(s);
    return d;
  }

  function initReels() {
    $$('.reel-block').forEach(function (block) {
      var key = block.getAttribute('data-reel');
      var win = $('.reel', block);
      reels[key] = { key: key, block: block, win: win, strip: $('.reel-strip', win), flash: $('.reel-flash', win), anim: null, timeout: null };
      setReelText(reels[key], IDLE_TEXT[key], true);
    });
  }

  function setReelText(r, text, idle) {
    r.strip.textContent = '';
    r.strip.style.transform = '';
    r.strip.appendChild(makeItem(text, idle));
  }

  /* Füll-Einträge aus den echten Daten, gemischt, ohne direkte Dopplungen */
  function fillerList(texts, count, finalText) {
    var src = texts.filter(function (t) { return t !== finalText; });
    if (!src.length) src = texts.slice();
    var out = [], bag = [], last = '';
    while (out.length < count) {
      if (!bag.length) bag = shuffle(src.slice());
      var t = bag.pop();
      if (t === last && src.length > 1) { bag.unshift(t); continue; }
      out.push(t); last = t;
    }
    return out;
  }

  function spinReel(r, finalText, fillers, duration, done) {
    var h = r.win.clientHeight || 60;
    var count = Math.max(6, Math.round(duration / 110));
    var items = [r.strip.firstChild ? r.strip.firstChild.textContent : ''].concat(fillerList(fillers, count, finalText));
    items.push(finalText);
    items.push(fillerList(fillers, 1, finalText)[0]);
    r.strip.textContent = '';
    items.forEach(function (t) { r.strip.appendChild(makeItem(t)); });
    var dist = (items.length - 2) * h;
    var over = Math.round(h * 0.16);
    r.anim = r.strip.animate([
      { transform: 'translateY(0)', offset: 0, easing: 'cubic-bezier(.2,.65,.3,1)' },
      { transform: 'translateY(' + (-(dist + over)) + 'px)', offset: 0.88, easing: 'ease-in-out' },
      { transform: 'translateY(' + (-dist) + 'px)', offset: 1 }
    ], { duration: duration, fill: 'forwards' });
    r.anim.onfinish = function () {
      try { r.anim.cancel(); } catch (e) { /* egal */ }
      r.anim = null;
      setReelText(r, finalText, false);
      flash(r);
      done();
    };
  }

  function fadeReel(r, finalText, delay, done) {
    r.timeout = setTimeout(function () {
      setReelText(r, finalText, false);
      if (r.strip.animate) r.strip.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
      done();
    }, delay);
  }

  function flash(r) {
    if (r.flash && r.flash.animate && !reduced()) {
      r.flash.animate([{ opacity: 0 }, { opacity: .75 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' });
    }
  }

  /* ------------------------------------------------------------------------
     Sound (WebAudio, keine Dateien) und Vibration
     ------------------------------------------------------------------------ */
  var audio = { ctx: null, tickTimer: null };

  function audioCtx() {
    if (!settings.sound) return null;
    try {
      if (!audio.ctx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audio.ctx = new AC();
      }
      if (audio.ctx.state === 'suspended') audio.ctx.resume();
      return audio.ctx;
    } catch (e) { return null; }
  }

  function tone(freq, dur, type, vol, freqEnd) {
    var ctx = audioCtx();
    if (!ctx) return;
    try {
      var t0 = ctx.currentTime;
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) { /* Audio ist optional */ }
  }
  function soundTick() { tone(240 + rand(80), 0.035, 'square', 0.035, 120); }
  function soundDing() { tone(880, 0.5, 'sine', 0.12); tone(1320, 0.4, 'sine', 0.06); }
  function soundDone() { tone(660, 0.18, 'sine', 0.1); setTimeout(function () { tone(990, 0.35, 'sine', 0.1); }, 130); }

  function startTicks() {
    stopTicks();
    if (!settings.sound) return;
    audio.tickTimer = setInterval(soundTick, 85);
  }
  function stopTicks() { if (audio.tickTimer) { clearInterval(audio.tickTimer); audio.tickTimer = null; } }

  function vibrate(pattern) {
    if (!settings.vibration) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;   // Browser blockt sonst mit Konsolenfehler
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* ignorieren */ }
  }

  /* ------------------------------------------------------------------------
     Drehen
     ------------------------------------------------------------------------ */
  function spin(source) {
    if (st.spinning) return;
    var pool = getPool();
    if (!pool.length) {
      toast('Für diese Auswahl gibt es keine Einwände.');
      return;
    }
    var e = drawEinwand(pool);
    var phase = byId(PHASEN, e.phase) || { id: e.phase, label: e.phase };
    var v = drawVerstaerker(e.phase);
    var name = settings.teamModus ? nextName() : '';
    st.current = { einwand: e, phase: phase, verst: v, name: name };
    st.spinning = true;
    stats.spins += 1;
    saveStats();

    $('#btn-spin').setAttribute('aria-disabled', 'true');
    $('#btn-spin').textContent = 'Dreht …';
    $('#btn-reopen').hidden = true;
    $('#who').hidden = true;
    announce('Walzen drehen sich.');

    if (source !== 'drag') leverPullAuto();
    vibrate(15);
    audioCtx();
    startTicks();

    var two = !!settings.zweiWalzen;
    var finals = [];
    var phaseTexts = PHASEN.filter(function (p) {
      return pool.some(function (x) { return x.phase === p.id; });
    }).map(function (p) { return p.label; });
    var einwandTexts = pool.filter(function (x) { return x.phase === e.phase; }).map(function (x) { return x.text; });
    if (einwandTexts.length < 3) einwandTexts = pool.map(function (x) { return x.text; });
    var vTexts = verstaerkerFor(e.phase).map(function (x) { return x.text; });

    if (!two) finals.push({ r: reels.phase, text: phase.label, fill: phaseTexts });
    finals.push({ r: reels.einwand, text: e.text, fill: einwandTexts });
    finals.push({ r: reels.verstaerker, text: v ? v.text : 'Keine Zusatzsituation.', fill: vTexts.length ? vTexts : ['Keine Zusatzsituation.'] });

    var useAnim = !reduced() && !!reels.einwand.strip.animate;
    var durations = two ? [1700, 2500] : [1400, 1950, 2500];
    var fadeDelays = two ? [350, 800] : [300, 650, 1000];
    var remaining = finals.length;

    finals.forEach(function (f, i) {
      var onStop = function () {
        soundDing();
        vibrate(i === finals.length - 1 ? [20, 40, 30] : 12);
        remaining -= 1;
        if (remaining === 0) finishSpin();
      };
      if (useAnim) spinReel(f.r, f.text, f.fill, durations[i], onStop);
      else fadeReel(f.r, f.text, fadeDelays[i], onStop);
    });
  }

  function finishSpin() {
    stopTicks();
    st.spinning = false;
    var b = $('#btn-spin');
    b.removeAttribute('aria-disabled');
    b.textContent = 'Drehen';
    $('#btn-reopen').hidden = false;
    updateWho();
    soundDone();
    var c = st.current;
    announce('Ergebnis. Phase: ' + c.phase.label + '. Einwand: „' + c.einwand.text + '“. ' +
      (c.verst ? 'Dazu: ' + c.verst.text : '') + (c.name ? ' Dran ist: ' + c.name + '.' : ''));
    setTimeout(function () { if (st.screen === 'game') openSheet(); }, reduced() ? 150 : 450);
  }

  /* ------------------------------------------------------------------------
     Hebel
     ------------------------------------------------------------------------ */
  var lever = { el: null, s: 1, raf: 0, drag: null };
  var LEVER_DOWN = -0.8;     // scaleY des Hebelarms in unterer Position
  var LEVER_DRAG_PX = 70;    // Ziehstrecke bis zur unteren Position

  function setLever(s) {
    lever.s = s;
    lever.el.style.setProperty('--s', s.toFixed(3));
  }
  function stopLeverAnim() { if (lever.raf) { cancelAnimationFrame(lever.raf); lever.raf = 0; } }

  /* Federt aus dem aktuellen Wert zurück in die Ruhelage (mit leichtem Überschwingen) */
  function leverSpringBack() {
    stopLeverAnim();
    var s0 = lever.s;
    if (reduced()) { setLever(1); return; }
    var t0 = performance.now();
    (function frame(now) {
      var t = (now - t0) / 1000;
      if (t >= 0.7) { setLever(1); lever.raf = 0; return; }
      setLever(1 + (s0 - 1) * Math.exp(-8 * t) * Math.cos(12 * t));
      lever.raf = requestAnimationFrame(frame);
    })(t0);
  }

  function leverPullAuto() {
    stopLeverAnim();
    if (reduced()) { setLever(LEVER_DOWN); setTimeout(function () { setLever(1); }, 180); return; }
    var s0 = lever.s, t0 = performance.now(), dur = 150;
    (function frame(now) {
      var p = clamp((now - t0) / dur, 0, 1);
      setLever(s0 + (LEVER_DOWN - s0) * (p * p));
      if (p < 1) lever.raf = requestAnimationFrame(frame);
      else { lever.raf = 0; setTimeout(leverSpringBack, 40); }
    })(t0);
  }

  function initLever() {
    lever.el = $('#lever');
    lever.el.addEventListener('pointerdown', function (ev) {
      if (st.spinning || lever.drag) return;
      lever.drag = { id: ev.pointerId, y0: ev.clientY, moved: false };
      stopLeverAnim();
      try { lever.el.setPointerCapture(ev.pointerId); } catch (e) { /* ok */ }
    });
    lever.el.addEventListener('pointermove', function (ev) {
      var d = lever.drag;
      if (!d || ev.pointerId !== d.id) return;
      var dy = ev.clientY - d.y0;
      if (Math.abs(dy) > 6) d.moved = true;
      if (d.moved) setLever(1 + (LEVER_DOWN - 1) * clamp(dy / LEVER_DRAG_PX, 0, 1));
    });
    function end(ev, cancelled) {
      var d = lever.drag;
      if (!d || ev.pointerId !== d.id) return;
      lever.drag = null;
      var p = (1 - lever.s) / (1 - LEVER_DOWN);
      if (cancelled) { leverSpringBack(); return; }
      if (!d.moved) { spin('tap'); return; }
      if (p >= 0.55) { spin('drag'); leverSpringBack(); }
      else leverSpringBack();
    }
    lever.el.addEventListener('pointerup', function (ev) { end(ev, false); });
    lever.el.addEventListener('pointercancel', function (ev) { end(ev, true); });
  }

  /* ------------------------------------------------------------------------
     Ergebnis-Karte (Sheet)
     ------------------------------------------------------------------------ */
  function fillSheet() {
    var c = st.current, e = c.einwand;
    st.cardRating = null;

    $('#sheet-who').hidden = !(settings.teamModus && c.name);
    $('#sheet-who-name').textContent = c.name || '';

    $('#sheet-phase').textContent = c.phase.label;
    var amp = $('#sheet-ampel');
    amp.setAttribute('data-level', e.schwierigkeit);
    $('#sheet-ampel-text').textContent = (LEVELS[e.schwierigkeit] || LEVELS.mittel).text;
    $('#sheet-level-note').hidden = e.schwierigkeit !== 'schwer';

    $('#sheet-title').textContent = e.text;
    var vEl = $('#sheet-verst');
    vEl.textContent = c.verst ? c.verst.text : '';
    vEl.hidden = !c.verst;
    $('#sheet-draft').hidden = !!e.validiert;

    // Timer
    resetTimer();
    $('#timer-box').hidden = !settings.timer;

    // Tipp
    $('#btn-tip').setAttribute('aria-expanded', 'false');
    $('#btn-tip').textContent = 'Tipp zeigen';
    $('#panel-tip').hidden = true;
    $('#tip-text').textContent = e.dahinter || 'Noch kein Tipp hinterlegt.';

    // Bewertung
    $$('.rate-btn').forEach(function (b) { b.setAttribute('aria-pressed', 'false'); });
    var last = ratings[e.id];
    $('#rating-last').textContent = last ? 'Zuletzt bewertet: ' + ratingLabel(last) : '';

    // Peer-Feedback
    var peer = $('#peer');
    peer.hidden = !settings.peerFeedback;
    $$('input', peer).forEach(function (i) { i.checked = false; });
    $('.sheet-body').scrollTop = 0;
  }

  function ratingLabel(k) { return k === 'sicher' ? 'Sicher' : k === 'mittel' ? 'Geht so' : 'Muss ich üben'; }

  function openSheet() {
    if (!st.current || st.sheetOpen) return;
    fillSheet();
    st.lastFocus = document.activeElement;
    var sheet = $('#sheet'), back = $('#sheet-backdrop');
    sheet.hidden = false; back.hidden = false;
    void sheet.offsetWidth;                       // Reflow, damit die Transition läuft
    sheet.classList.add('is-open'); back.classList.add('is-open');
    st.sheetOpen = true;
    $('#app').setAttribute('inert', '');
    setTimeout(function () { $('#sheet-title').focus({ preventScroll: true }); }, 60);
  }

  function closeSheet(immediate) {
    if (!st.sheetOpen) return;
    st.sheetOpen = false;
    resetTimer();
    var sheet = $('#sheet'), back = $('#sheet-backdrop');
    $('#app').removeAttribute('inert');
    sheet.classList.remove('is-open'); back.classList.remove('is-open');
    var hide = function () { if (!st.sheetOpen) { sheet.hidden = true; back.hidden = true; } };
    if (immediate || reduced()) hide(); else setTimeout(hide, 420);
    var target = st.lastFocus && document.contains(st.lastFocus) ? st.lastFocus : $('#btn-spin');
    if (!immediate && target && target.focus && !target.hidden) { try { target.focus({ preventScroll: true }); } catch (e) { /* ok */ } }
  }

  /* Timer */
  function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2); }

  function resetTimer() {
    var t = st.timer;
    if (t.id) { clearInterval(t.id); t.id = null; }
    t.running = false;
    t.total = settings.timer || 0;
    $('#timer-time').textContent = fmt(t.total);
    $('#timer-fill').style.transform = 'scaleX(1)';
    $('#timer-note').textContent = '';
    $('#btn-timer').textContent = 'Antwort starten';
  }

  function toggleTimer() {
    var t = st.timer;
    if (t.running) { resetTimer(); return; }
    t.total = settings.timer;
    if (!t.total) return;
    t.running = true;
    t.end = performance.now() + t.total * 1000;
    $('#btn-timer').textContent = 'Stopp';
    $('#timer-note').textContent = '';
    announce('Antwort läuft. ' + t.total + ' Sekunden.');
    tickTimer();
    t.id = setInterval(tickTimer, 200);
  }

  function tickTimer() {
    var t = st.timer;
    var left = (t.end - performance.now()) / 1000;
    $('#timer-time').textContent = fmt(left);
    $('#timer-fill').style.transform = 'scaleX(' + clamp(left / t.total, 0, 1).toFixed(3) + ')';
    if (left <= 0) {
      clearInterval(t.id); t.id = null; t.running = false;
      $('#btn-timer').textContent = 'Nochmal starten';
      $('#timer-note').textContent = 'Zeit ist um. Bring deinen Gedanken in Ruhe zu Ende.';
      vibrate([30, 60, 30]);
    }
  }

  /* Tipp / Bewertung */
  function togglePanel(btn, panel, onLabel, offLabel) {
    var open = panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    btn.textContent = open ? offLabel : onLabel;
    return open;
  }

  function rate(kind) {
    var id = st.current.einwand.id;
    if (st.cardRating) stats[st.cardRating] = Math.max(0, stats[st.cardRating] - 1);
    st.cardRating = kind;
    stats[kind] += 1;
    ratings[id] = kind;
    saveRatings(); saveStats();
    $$('.rate-btn').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-rate') === kind ? 'true' : 'false'); });
    $('#rating-last').textContent = 'Gespeichert: ' + ratingLabel(kind);
    if (kind === 'sicher') confetti();
  }

  function confetti() {
    var layer = $('#confetti');
    if (reduced() || !layer.animate) return;
    var colors = ['var(--color-accent)', 'var(--color-primary)', 'var(--color-secondary)', 'var(--color-success)'];
    layer.textContent = '';
    for (var i = 0; i < 22; i++) {
      var p = document.createElement('span');
      p.className = 'confetti-piece';
      p.style.background = colors[i % colors.length];
      layer.appendChild(p);
      var dx = (Math.random() - 0.5) * 320, dy = -80 - Math.random() * 180, rot = (Math.random() - 0.5) * 720;
      p.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + dx + 'px,' + dy + 'px) rotate(' + (rot / 2) + 'deg)', opacity: 1, offset: 0.45 },
        { transform: 'translate(' + (dx * 1.15) + 'px,' + (dy + 260) + 'px) rotate(' + rot + 'deg)', opacity: 0 }
      ], { duration: 950, easing: 'ease-out', fill: 'forwards' });
    }
    setTimeout(function () { layer.textContent = ''; }, 1050);
  }

  /* ------------------------------------------------------------------------
     Statistik
     ------------------------------------------------------------------------ */
  function renderStats() {
    $('#stat-spins').textContent = stats.spins;
    var total = stats.sicher + stats.mittel + stats.ueben;
    ['sicher', 'mittel', 'ueben'].forEach(function (k) {
      $('[data-count="' + k + '"]').textContent = stats[k];
      $('[data-fill="' + k + '"]').style.transform = 'scaleX(' + (total ? stats[k] / total : 0).toFixed(3) + ')';
    });
    var list = $('#practice-list');
    list.textContent = '';
    var items = EINWAENDE.filter(function (e) { return ratings[e.id] === 'ueben'; });
    items.forEach(function (e) {
      var li = document.createElement('li');
      li.textContent = '„' + e.text + '“';
      list.appendChild(li);
    });
    $('#practice-empty').hidden = items.length > 0;
    var pb = $('#btn-practice');
    pb.hidden = !items.length;
    pb.textContent = 'Nur diese üben (' + items.length + ')';
    disarmReset();
  }

  var resetTimerId = null;
  function disarmReset() {
    var b = $('#btn-reset');
    b.classList.remove('is-armed');
    b.textContent = 'Statistik zurücksetzen';
    if (resetTimerId) { clearTimeout(resetTimerId); resetTimerId = null; }
  }
  function onReset() {
    var b = $('#btn-reset');
    if (!b.classList.contains('is-armed')) {
      b.classList.add('is-armed');
      b.textContent = 'Wirklich zurücksetzen? Nochmal tippen';
      resetTimerId = setTimeout(disarmReset, 4000);
      return;
    }
    stats = { spins: 0, sicher: 0, mittel: 0, ueben: 0 };
    ratings = {};
    saveStats(); saveRatings();
    st.practice = false;
    renderStats();
    toast('Statistik zurückgesetzt.');
  }

  /* ------------------------------------------------------------------------
     Meldungen
     ------------------------------------------------------------------------ */
  function announce(text) {
    var live = $('#live');
    live.textContent = '';
    setTimeout(function () { live.textContent = text; }, 40);
  }

  function toast(text) {
    var t = $('#toast');
    t.textContent = text;
    t.hidden = false;
    if (st.toastTimer) clearTimeout(st.toastTimer);
    st.toastTimer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  /* ------------------------------------------------------------------------
     Service Worker und Update-Hinweis
     ------------------------------------------------------------------------ */
  function initServiceWorker() {
    showVersion();
    if (!('serviceWorker' in navigator)) return;
    var hadController = !!navigator.serviceWorker.controller;
    try {
      navigator.serviceWorker.register('service-worker.js').catch(function () { /* z. B. file:// */ });
    } catch (e) { return; }
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController) $('#update-bar').hidden = false;
    });
  }

  function showVersion() {
    var el = $('#version');
    if (!window.caches || !caches.keys) return;
    caches.keys().then(function (keys) {
      var mine = keys.filter(function (k) { return k.indexOf('einwand-karussell-') === 0; }).sort().pop();
      if (mine) el.textContent = 'App-Version: ' + mine.replace('einwand-karussell-', '');
    }).catch(function () { /* ignorieren */ });
  }

  /* ------------------------------------------------------------------------
     Start
     ------------------------------------------------------------------------ */
  function startGame() {
    if (!getPool().length) { updateStart(); toast('Für diese Auswahl gibt es keine Einwände.'); return; }
    go('game');
  }

  function bind() {
    $('#btn-start').addEventListener('click', startGame);
    $('#btn-home').addEventListener('click', function () { go('start'); });
    $('#btn-nav').addEventListener('click', function () {
      if (st.screen === 'settings') go(st.prevScreen === 'settings' ? 'start' : st.prevScreen);
      else go('settings');
    });
    $('#btn-spin').addEventListener('click', function () {
      if ($('#btn-spin').getAttribute('aria-disabled') === 'true') return;
      spin('button');
    });
    $('#btn-reopen').addEventListener('click', openSheet);
    $('#btn-timer').addEventListener('click', toggleTimer);
    $('#btn-tip').addEventListener('click', function () { togglePanel(this, $('#panel-tip'), 'Tipp zeigen', 'Tipp ausblenden'); });
    $$('.rate-btn').forEach(function (b) { b.addEventListener('click', function () { rate(b.getAttribute('data-rate')); }); });
    $('#btn-back').addEventListener('click', function () { closeSheet(); });
    $('#sheet-backdrop').addEventListener('click', function () { closeSheet(); });
    $('#btn-again').addEventListener('click', function () {
      closeSheet();
      setTimeout(function () { spin('button'); }, reduced() ? 0 : 300);
    });
    $('#btn-reset').addEventListener('click', onReset);
    $('#btn-update').addEventListener('click', function () { location.reload(); });
    $('#set-namen').addEventListener('input', function () {
      settings.namen = this.value;
      saveSettings();
    });

    document.addEventListener('click', function (ev) {
      var a = ev.target.closest ? ev.target.closest('[data-action]') : null;
      if (!a) return;
      var act = a.getAttribute('data-action');
      if (act === 'open-settings') go('settings');
      if (act === 'end-practice') { st.practice = false; st.bag = []; st.bagSig = ''; updateStart(); updateGame(); toast('Übungsmodus beendet.'); }
      if (act === 'start-practice') { st.practice = true; st.bag = []; st.bagSig = ''; go('game'); }
    });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && st.sheetOpen) closeSheet();
    });
    window.addEventListener('hashchange', route);
  }

  function init() {
    buildSegs();
    syncControls();
    initReels();
    initLever();
    bind();
    applyReelMode();
    route();
    initServiceWorker();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
