/* Tap In — views, routing and everything the user actually touches. */
(function (G) {
  'use strict';

  const UI = G.UI, Store = G.Store, Data = G.Data, Session = G.Session, NFC = G.NFC, Track = G.Track, U = G.Util;
  const $ = UI.$, $$ = UI.$$, esc = UI.esc;

  let view = 'tap';
  let tickTimer = null;
  let nfcState = { armed: false, error: null, permission: 'unknown' };
  let logFilter = 'all';

  /* ---------------- routing ---------------- */

  function go(next) {
    view = next;
    $$('#nav .nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === next));
    render();
    const app = $('#app');
    if (app) app.scrollTop = 0;
  }

  function render() {
    const app = $('#app');
    if (!app) return;
    const live = Session.live();

    if (view === 'tap' && live) renderLive(app);
    else if (view === 'tap') renderTap(app);
    else if (view === 'log') renderLog(app);
    else if (view === 'plans') renderPlans(app);
    else if (view === 'kit') renderKit(app);
    else renderStats(app);

    renderLiveBar();
    manageTicker();
  }

  /* A pill under the header whenever a session is running and you have
     wandered off to another tab, so it is never quietly lost. */
  function renderLiveBar() {
    const live = Session.live();
    let bar = $('#livebar');
    const show = live && view !== 'tap';
    if (!show) { if (bar) bar.remove(); document.body.classList.remove('has-livebar'); return; }
    if (!bar) {
      bar = document.createElement('button');
      bar.id = 'livebar';
      bar.onclick = () => go('tap');
      document.body.appendChild(bar);
    }
    document.body.classList.add('has-livebar');
    const b = Session.activeBlock() || Session.lastBlock();
    bar.innerHTML = '<span class="pulse-dot"></span>' +
      '<span class="lb-name">' + esc(b ? b.name : 'Workout') + '</span>' +
      '<span class="lb-time" data-tick="workout">' + U.clock(Session.workoutElapsed()) + '</span>';
  }

  /* ---------------- the ticking clock ----------------
     Timers update in place rather than through a re-render, so typing in a
     field mid-session never gets interrupted. */

  function manageTicker() {
    const needed = !!Session.live();
    if (needed && !tickTimer) tickTimer = setInterval(tick, 1000);
    if (!needed && tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function tick() {
    const live = Session.live();
    if (!live) return;
    const block = Session.activeBlock();

    /* Fold the sensors into the live block first, silently, so the numbers
       painted below are this second's and no render is triggered. */
    Track.tick();
    if (block) silently(() => Session.syncTracking(false));
    const snap = Track.snapshot();

    $$('[data-tick]').forEach(el => {
      const what = el.getAttribute('data-tick');
      if (what === 'workout') el.textContent = U.clock(Session.workoutElapsed());
      else if (what === 'block') el.textContent = U.clock(Session.blockElapsed(block));
      else if (what === 'pace' && block) el.textContent = paceNow(block);
      else if (what === 'kcal' && block) el.textContent = String(liveKcal());
      else if (what === 'distance' && block) el.textContent = Store.distLabel(block.distanceM || 0, block.type);
      else if (what === 'steps' && block) el.textContent = String(block.steps || 0);
      else if (what === 'cadence' && block) el.textContent = block.cadence > 0 ? String(block.cadence) : '—';
      else if (what === 'gpspill') repaintPill(el, gpsPill(snap));
      else if (what === 'steppill') repaintPill(el, stepPill(snap, block));
      else if (what === 'manualnote' && block) el.hidden = !block.distanceManual;
    });

    syncDistanceField(block);

    const left = Session.restLeft();
    if (left != null) {
      const label = $('#rest-left');
      const bar = $('#rest-bar');
      const rest = live.rest;
      if (label) label.textContent = left > 0 ? U.clock(left) : 'Go';
      if (bar && rest) {
        const pct = U.clamp(1 - left / rest.total, 0, 1);
        bar.style.transform = 'scaleX(' + pct + ')';
      }
      if (left <= 0 && rest && !rest.rung) {
        rest.rung = true;
        NFC.buzz([120, 80, 120]);
        const box = $('#rest');
        if (box) box.classList.add('done');
      }
    }
  }

  /* Swap a pill's text and colour without rebuilding the row around it. */
  function repaintPill(el, html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    const next = tmp.firstElementChild;
    if (!next) return;
    if (el.className !== next.className) el.className = next.className;
    if (el.textContent !== next.textContent) el.textContent = next.textContent;
  }

  /* Keep the typed-in distance box showing what the sensors measured —
     unless you are actually typing in it, or have taken it over. */
  function syncDistanceField(block) {
    if (!block || block.distanceManual) return;
    const input = $('[data-ro="distance"]');
    if (!input || document.activeElement === input) return;
    if (!block.distanceSource || block.distanceSource === 'manual') return;
    const want = String(distanceInputValue(block));
    if (input.value !== want) input.value = want;
  }

  function paceNow(block) {
    if (!block) return '—';
    const secs = Session.blockElapsed(block);
    return Data.paceLabel(block.type, block.distanceM || 0, secs);
  }

  function liveKcal() {
    const live = Session.live();
    if (!live) return 0;
    const wt = Store.profile().weightKg;
    let total = 0;
    live.blocks.forEach(b => {
      const secs = b.endedAt ? (b.durationSec || 0) : Session.blockElapsed(b);
      total += Data.kcal(b.type, { distanceM: b.distanceM, level: b.level, inclinePct: b.inclinePct, watts: b.watts }, wt, secs);
    });
    return total;
  }

  /* ---------------- NFC wiring ----------------

     The reader is armed whenever the app is in the foreground and either
     screen that can act on a tap is showing. Arming needs a gesture the
     first time; after that Chrome remembers and it happens on load. */

  async function armNfc(fromGesture) {
    if (!NFC.supported()) return;
    if (NFC.isArmed()) return;
    try {
      await NFC.arm();
      nfcState.armed = true;
      nfcState.error = null;
      if (fromGesture) UI.toast('Ready — hold your phone to the machine');
      paintNfcState();
    } catch (e) {
      nfcState.armed = false;
      nfcState.error = NFC.describe(e);
      paintNfcState();
      if (fromGesture) UI.toast(nfcState.error, 'long');
    }
  }

  function paintNfcState() {
    const pad = $('#tappad');
    if (pad) {
      pad.classList.toggle('armed', nfcState.armed);
      const s = $('.pad-sub', pad);
      if (s) s.innerHTML = padSubtitle();
    }
    const dot = $('#nfcdot');
    if (dot) dot.classList.toggle('on', nfcState.armed);
  }

  function padSubtitle() {
    if (!NFC.supported()) return 'This browser can’t read tags — tap to start manually';
    if (nfcState.error) return esc(nfcState.error);
    if (nfcState.armed) return 'Listening — hold your phone to the tag';
    return 'Tap once to switch the reader on';
  }

  NFC.on('tag', onTag);
  NFC.on('state', s => {
    nfcState.armed = !!s.armed;
    if (s.warning) UI.toast(s.warning, 'long');
    paintNfcState();
  });

  /* Debounce: NFC hardware happily fires the same tag several times a
     second while the phone is held against it. */
  let lastTagAt = 0;
  let lastTagKey = '';

  function onTag(tag) {
    const key = (tag.serial || '') + '|' + (tag.machineId || '');
    const now = Date.now();
    if (key === lastTagKey && now - lastTagAt < 2500) return;
    lastTagKey = key; lastTagAt = now;
    handleTap(tag);
  }

  /* While a "bind a tag" sheet is open, taps belong to it rather than to
     the workout — otherwise binding a tag would also start a session. */
  const bindWaiters = [];

  function handleTap(tag) {
    if (bindWaiters.length) { bindWaiters[bindWaiters.length - 1](tag); return; }
    const decision = Session.resolveTap(tag);
    if (decision.action === 'unknown') { unknownTagSheet(tag); return; }

    const res = Session.applyTap(decision);
    Session.holdScreen();

    if (res.did === 'started') {
      go('tap');
      UI.toast('Started on ' + res.machine.name);
      showLastTime(res.machine);
    } else if (res.did === 'switched' || res.did === 'opened') {
      go('tap');
      UI.toast(res.machine.name + ' — station ' + Session.live().blocks.length);
      showLastTime(res.machine);
    } else if (res.did === 'closed') {
      go('tap');
      if (res.suggestFinish) finishFlow();
      else stationDoneSheet(res.block);
    }
  }

  /* The single most useful thing to see the moment you tap in: what you
     did on this exact machine last time. */
  function showLastTime(machine) {
    const last = Store.lastOn(machine.id);
    if (!last) return;
    const b = last.block;
    const t = Data.type(b.type);
    let line;
    if (t.kind === 'sets') {
      const best = Math.max(0, ...(b.sets || []).map(s => s.weightKg || 0));
      line = (b.sets || []).length + ' sets' + (best > 0 ? ' · top ' + Store.weightLabel(best) : '');
    } else {
      line = [b.distanceM > 0 ? Store.distLabel(b.distanceM, b.type) : null,
        U.clock(Store.blockDuration(b)),
        b.distanceM > 0 ? Data.paceLabel(b.type, b.distanceM, Store.blockDuration(b)) : null]
        .filter(Boolean).join(' · ');
    }
    const el = document.createElement('div');
    el.className = 'lasttime';
    el.innerHTML = '<span class="lt-when">' + esc(U.friendlyDate(last.workout.date)) + '</span>' + esc(line);
    const host = $('#lasttime-host');
    if (host) { host.innerHTML = ''; host.appendChild(el); }
  }

  /* ---------------- unknown tag ----------------
     An unrecognised tag is the interesting case: it is either gym kit that
     came with its own tag, or a blank sticker. Either way the answer is
     the same — name it once and it is yours forever. */

  function unknownTagSheet(tag) {
    NFC.buzz([20, 50, 20]);
    UI.sheet('New tag', (el, close) => {
      const suggestion = tag.text && tag.text.length < 40 && !/^https?:/i.test(tag.text) ? tag.text : '';
      el.innerHTML =
        '<p class="sheet-copy">Nothing is bound to this tag yet. Tell the app what it is and every future tap goes straight into a workout.</p>' +
        '<form id="newtag">' +
        UI.textField('Name', 'name', suggestion, { placeholder: 'Bike 4, Leg press, Rower by the window', autofocus: true }) +
        '<div class="field"><span class="field-label">What is it</span>' + typeGrid('type', 'cycle') + '</div>' +
        UI.textField('Where', 'place', lastPlace(), { placeholder: 'Optional — gym, home, hotel' }) +
        '<div class="tag-serial">Tag ' + esc(shortSerial(tag.serial || tag.machineId)) +
          (tag.serial ? (tag.records ? ' · ' + tag.records + ' record' + (tag.records === 1 ? '' : 's') : ' · blank') : ' · written by Tap In') + '</div>' +
        '<div class="sheet-actions">' +
          '<button type="button" class="btn ghost" data-a="skip">Not now</button>' +
          '<button type="submit" class="btn primary">Save &amp; start</button>' +
        '</div></form>';
      wireTypeGrid(el);
      $('[data-a="skip"]', el).onclick = () => close();
      $('#newtag', el).onsubmit = ev => {
        ev.preventDefault();
        const v = UI.values(el);
        const type = el.querySelector('.type-grid .on').getAttribute('data-v');
        const machine = Store.addMachine({
          /* Keep the id the sticker already points at, where there is one. */
          id: tag.machineId || undefined,
          name: (v.name || '').trim() || Data.type(type).name,
          type,
          place: (v.place || '').trim(),
          tags: tag.serial ? [tag.serial] : []
        });
        close();
        const decision = Session.resolveTap({ serial: tag.serial, machineId: machine.id });
        const res = Session.applyTap(decision);
        Session.holdScreen();
        go('tap');
        UI.toast(machine.name + ' saved — tap it any time');
        if (res.machine) showLastTime(res.machine);
      };
    }, { tall: true });
  }

  function shortSerial(s) {
    if (!s) return 'no serial';
    return s.length > 10 ? s.slice(0, 4) + '…' + s.slice(-4) : s;
  }

  function lastPlace() {
    const ms = Store.machines();
    for (let i = ms.length - 1; i >= 0; i--) if (ms[i].place) return ms[i].place;
    return '';
  }

  /* A picker over every activity type, used in several sheets. */
  function typeGrid(name, value, filter) {
    const list = Data.TYPES.filter(t => !filter || filter(t));
    return '<div class="type-grid" data-name="' + name + '">' +
      list.map(t =>
        '<button type="button" class="type-pick' + (t.id === value ? ' on' : '') + '" data-v="' + t.id + '">' +
        Data.icon(t.id, 22) + '<span>' + esc(t.short) + '</span></button>'
      ).join('') + '</div>';
  }

  function wireTypeGrid(root, onPick) {
    $$('.type-grid', root).forEach(grid => {
      $$('.type-pick', grid).forEach(btn => {
        btn.onclick = () => {
          $$('.type-pick', grid).forEach(b => b.classList.remove('on'));
          btn.classList.add('on');
          if (onPick) onPick(btn.getAttribute('data-v'));
        };
      });
    });
  }

  /* ---------------- view: tap (home) ---------------- */

  function renderTap(app) {
    const machines = Store.machines();
    const recent = recentMachines(6);
    const week = Store.weekSummary();
    const st = Store.streak();
    const goal = Store.profile().weeklyGoal || 4;

    app.innerHTML = '<div class="pad">' +
      tapPad() +
      '<div id="lasttime-host"></div>' +
      (machines.length ? quickStartBlock(recent) : firstRunBlock()) +
      '<div class="row2">' +
        UI.stat(week.count + '<span class="unit">/' + goal + '</span>', 'This week') +
        UI.stat(st.current + '<span class="unit">d</span>', 'Streak') +
      '</div>' +
      todayBlock() +
      '</div>';

    $('#tappad').onclick = () => {
      if (!NFC.supported()) { quickStartSheet(); return; }
      if (NFC.isArmed()) { quickStartSheet(); return; }
      armNfc(true);
    };

    $$('[data-start-machine]', app).forEach(b => {
      b.onclick = () => {
        const m = Store.machine(b.getAttribute('data-start-machine'));
        if (!m) return;
        Session.start(m);
        Session.holdScreen();
        render();
        showLastTime(m);
      };
    });

    const more = $('[data-a="more"]', app);
    if (more) more.onclick = quickStartSheet;

    const help = $('[data-a="howto"]', app);
    if (help) help.onclick = howItWorksSheet;

    $$('[data-open-workout]', app).forEach(b => {
      b.onclick = () => workoutSheet(Store.workout(b.getAttribute('data-open-workout')));
    });

    paintNfcState();
    if (NFC.supported()) armNfc(false);
  }

  function tapPad() {
    return '<button id="tappad" class="tappad' + (nfcState.armed ? ' armed' : '') + '">' +
      '<span class="pad-rings"><i></i><i></i><i></i></span>' +
      '<span class="pad-core">' +
        '<svg viewBox="0 0 24 24" width="46" height="46" aria-hidden="true">' +
          '<path d="M12 20a8 8 0 0 0 0-16"></path>' +
          '<path d="M12 16.5a4.5 4.5 0 0 0 0-9"></path>' +
          '<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"></circle>' +
        '</svg>' +
      '</span>' +
      '<span class="pad-title">Tap a machine</span>' +
      '<span class="pad-sub">' + padSubtitle() + '</span>' +
      '</button>';
  }

  /* Machines you have actually used lately, most recent first, with
     anything never used yet trailing behind. */
  function recentMachines(n) {
    const seen = {};
    Store.workouts().forEach(w => {
      (w.blocks || []).forEach(b => {
        if (b.machineId && !seen[b.machineId]) seen[b.machineId] = w.date + ' ' + (b.startedAt || 0);
      });
    });
    return Store.machines().slice().sort((a, b) => {
      const av = seen[a.id] || '', bv = seen[b.id] || '';
      if (av === bv) return a.name.localeCompare(b.name);
      return av < bv ? 1 : -1;
    }).slice(0, n);
  }

  function quickStartBlock(recent) {
    return '<section class="card">' +
      '<div class="card-head"><h2>Quick start</h2>' +
        '<button class="link" data-a="more">Everything</button></div>' +
      '<div class="tile-grid">' +
        recent.map(m => machineTile(m)).join('') +
      '</div></section>';
  }

  function machineTile(m) {
    const last = Store.lastOn(m.id);
    return '<button class="tile c-' + esc(m.colour || 'a') + '" data-start-machine="' + esc(m.id) + '">' +
      Data.icon(m.type, 24) +
      '<span class="tile-name">' + esc(m.name) + '</span>' +
      '<span class="tile-sub">' + (last ? esc(U.friendlyDate(last.workout.date)) : 'Never used') + '</span>' +
      ((m.tags || []).length ? '<span class="tile-tag" title="Has an NFC tag">' + tagGlyph() + '</span>' : '') +
      '</button>';
  }

  function tagGlyph() {
    return '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">' +
      '<path d="M12 19a7 7 0 0 0 0-14"></path><path d="M12 15.5a3.5 3.5 0 0 0 0-7"></path></svg>';
  }

  function firstRunBlock() {
    return '<section class="card intro">' +
      '<h2>Nothing tapped yet</h2>' +
      '<p>Hold your phone against the NFC tag on a gym machine and Tap In will ask what it is — once. After that, one tap starts the workout, and a second tap ends it.</p>' +
      '<p class="dim">No tag on your kit? Stick a blank NFC sticker on it and write it from the Kit tab. Tags written here open the app on any phone, iPhones included.</p>' +
      '<div class="sheet-actions">' +
        '<button class="btn ghost" data-a="howto">How it works</button>' +
        '<button class="btn primary" data-a="more">Start without a tag</button>' +
      '</div></section>';
  }

  function todayBlock() {
    const list = Store.workoutsOn(U.today());
    if (!list.length) return '';
    return '<section class="card">' +
      '<div class="card-head"><h2>Today</h2></div>' +
      list.map(w => workoutRow(w)).join('') +
      '</section>';
  }

  /* ---------------- quick start without a tag ---------------- */

  function quickStartSheet() {
    UI.sheet('Start a workout', (el, close) => {
      const machines = Store.machines();
      el.innerHTML =
        (machines.length ? '<div class="sub-head">Your kit</div>' +
          '<div class="tile-grid">' + machines.map(m => machineTile(m)).join('') + '</div>' : '') +
        '<div class="sub-head">Anything else</div>' +
        typeGrid('type', null) +
        '<p class="sheet-copy dim">Starting from a type logs the session without tying it to a machine. Tap a tag any time during a workout to add a station.</p>';

      $$('[data-start-machine]', el).forEach(b => {
        b.onclick = () => {
          const m = Store.machine(b.getAttribute('data-start-machine'));
          close();
          Session.start(m);
          Session.holdScreen();
          go('tap');
          showLastTime(m);
        };
      });
      wireTypeGrid(el, typeId => {
        close();
        Session.start(typeId);
        Session.holdScreen();
        go('tap');
      });
    }, { tall: true });
  }

  function howItWorksSheet() {
    UI.sheet('How Tap In works', (el) => {
      el.innerHTML =
        '<ol class="howto">' +
        '<li><b>Tap in.</b> Hold your phone to a machine’s NFC tag. The first time, you name it. Every time after that, the workout starts on the spot — no menus, no typing.</li>' +
        '<li><b>Work.</b> The clock runs. Log sets with two thumbs, hit Lap for intervals, or just leave it alone.</li>' +
        '<li><b>Tap out.</b> Touch the same tag again to close the station. Touch a <i>different</i> machine instead and it closes one station and opens the next — which is the whole of circuit training, handled by walking to the next machine.</li>' +
        '<li><b>Finish.</b> Fill in the numbers off the machine’s console, and anything that beat your old best is flagged there and then.</li>' +
        '</ol>' +
        '<div class="sub-head">If your gym has no tags</div>' +
        '<p class="sheet-copy">Blank NFC stickers cost pennies. Add the machine in the Kit tab, choose <b>Write a tag</b>, and hold your phone to the sticker. The app writes a link to itself, so tapping that sticker opens Tap In on that machine — on Android <i>and</i> on iPhone, which can’t run the live reader but reads link tags from the lock screen.</p>' +
        '<div class="sub-head">Privacy</div>' +
        '<p class="sheet-copy">Everything stays in this browser. No account, no server, no analytics. Back it up from Settings whenever you like.</p>';
    }, { tall: true });
  }

  /* ---------------- view: live session ----------------

     Built for a phone held in one sweaty hand: big clock, big buttons,
     nothing that needs precision. Field edits write straight to the store
     without re-rendering, so a keyboard never closes under you. */

  let suppressRender = 0;
  function silently(fn) {
    suppressRender++;
    try { fn(); } finally { suppressRender--; }
  }

  function renderLive(app) {
    const w = Session.live();
    const block = Session.activeBlock();
    const t = block ? Data.type(block.type) : null;
    const step = Session.planStep();

    app.innerHTML = '<div class="pad live">' +
      '<div class="live-top">' +
        '<div class="live-elapsed"><span class="pulse-dot"></span><span data-tick="workout">' + U.clock(Session.workoutElapsed()) + '</span></div>' +
        '<div class="live-meta">' + w.blocks.length + ' station' + (w.blocks.length === 1 ? '' : 's') +
          ' · <span data-tick="kcal">' + liveKcal() + '</span> kcal</div>' +
        '<button class="btn small ghost" data-a="finish">Finish</button>' +
      '</div>' +
      (step ? planStrip(step) : '') +
      (block ? activeStationCard(block, t) : betweenStations(w)) +
      restStrip() +
      '<div id="lasttime-host"></div>' +
      priorStations(w, block) +
      '<div class="live-foot">' +
        '<button class="btn ghost wide" data-a="addstation">Add a station</button>' +
        '<button class="btn primary wide" data-a="finish">Finish workout</button>' +
      '</div>' +
      '<button class="link danger centred" data-a="discard">Discard this session</button>' +
      '</div>';

    wireLive(app, block);
  }

  function planStrip(step) {
    return '<div class="plan-strip">' +
      '<span class="ps-name">' + esc(step.plan.name) + '</span>' +
      '<span class="ps-step">' + (step.index + 1) + ' of ' + step.total + '</span>' +
      (step.next ? '<button class="link" data-a="plannext">Next: ' + esc(step.next.name || Data.type(step.next.type).name) + '</button>' : '<span class="dim">Last station</span>') +
      '</div>';
  }

  function activeStationCard(b, t) {
    const paused = Session.isPaused();
    const machine = b.machineId ? Store.machine(b.machineId) : null;
    return '<section class="card station' + (paused ? ' paused' : '') + '">' +
      '<div class="station-head">' +
        '<span class="station-icon c-' + esc((machine && machine.colour) || 'a') + '">' + Data.icon(b.type, 22) + '</span>' +
        '<div class="station-id">' +
          '<div class="station-name">' + esc(b.name) + '</div>' +
          stationSubtitle(b, t, machine) +
        '</div>' +
        '<button class="icon-btn" data-a="renamestation" aria-label="Rename station">' +
          '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 20h4l10-10-4-4L4 16z"></path><path d="M14 6l4 4"></path></svg>' +
        '</button>' +
      '</div>' +
      '<div class="clock' + (paused ? ' dim' : '') + '" data-tick="block">' + U.clock(Session.blockElapsed(b)) + '</div>' +
      (paused ? '<div class="paused-note">Paused</div>' : '') +
      (t.kind === 'sets' ? setsPanel(b) : cardioPanel(b, t)) +
      '<div class="station-actions">' +
        '<button class="btn ghost" data-a="pause">' + (paused ? 'Resume' : 'Pause') + '</button>' +
        (t.kind === 'sets'
          ? '<button class="btn ghost" data-a="rest">Rest</button>'
          : '<button class="btn ghost" data-a="lap">Lap</button>') +
        '<button class="btn accent" data-a="close">Tap out</button>' +
      '</div>' +
      '</section>';
  }

  /* Nothing at all beats repeating the station's own name back at it. */
  function stationSubtitle(b, t, machine) {
    const bits = [t.name === b.name ? null : t.name, machine && machine.place].filter(Boolean);
    return bits.length ? '<div class="station-type">' + esc(bits.join(' · ')) + '</div>' : '';
  }

  /* ---------------- cardio ---------------- */

  function cardioPanel(b, t) {
    const fields = t.fields || [];
    const rows = [];
    if (fields.includes('distance') || fields.includes('calories') || fields.includes('floors')) {
      const label = fields.includes('floors') ? 'Floors' : fields.includes('calories') && t.id === 'airbike' ? 'Calories' : 'Distance';
      rows.push(readoutField(label, 'distance', distanceInputValue(b), distanceUnit(b)));
    }
    if (fields.includes('level') || fields.includes('damper') || fields.includes('resistance')) {
      rows.push(readoutField(fields.includes('damper') ? 'Damper' : 'Level', 'level', b.level, ''));
    }
    if (fields.includes('incline')) rows.push(readoutField('Incline', 'incline', b.inclinePct, '%'));
    if (fields.includes('watts')) rows.push(readoutField('Watts', 'watts', b.watts, 'W'));
    rows.push(readoutField('Avg HR', 'hr', b.avgHr, 'bpm'));

    const want = Session.sensorsFor(b.type);
    const metrics = [
      ['pace', paceNow(b), 'Pace'],
      ['distance', Store.distLabel(b.distanceM || 0, b.type), 'Distance'],
      ['kcal', String(liveKcal()), 'kcal']
    ];
    if (want.steps) {
      metrics.push(['steps', String(b.steps || 0), 'Steps']);
      metrics.push(['cadence', (b.cadence || 0) || '—', 'Cadence']);
    }

    return trackingStrip(b, t, want) +
      '<div class="live-metrics">' +
        metrics.map(m => '<div class="metric"><span class="m-val" data-tick="' + m[0] + '">' + m[1] +
          '</span><span class="m-label">' + esc(m[2]) + '</span></div>').join('') +
      '</div>' +
      '<div class="readouts">' +
        '<div class="readout-head">' + (want.gps || want.steps ? 'Correct it by hand' : 'Off the console') + '</div>' +
        '<div class="readout-grid">' + rows.join('') + '</div>' +
      '</div>' +
      splitsList(b);
  }

  /* ---------------- measuring ----------------
     Says which sensors are actually running, because "0.00 km" means two
     very different things depending on whether anything is listening. */

  function trackingStrip(b, t, want) {
    const canGps = !!t.gps, canSteps = !!t.steps;
    if (!canGps && !canSteps) return '';
    const p = Store.profile();
    const snap = Track.snapshot();

    /* Switched off in settings rather than unavailable — a different
       problem, and one the user can fix in two taps. */
    if ((canGps && p.useGps === false) && (!canSteps || p.countSteps === false)) {
      return '<div class="trk off"><span>Measuring is switched off.</span>' +
        '<button class="link" data-a="settings">Turn it on</button></div>';
    }

    const pills = [];
    if (want.gps) pills.push(gpsPill(snap));
    else if (canGps && Track.gpsSupported() && p.useGps === false) pills.push('<span class="pill">GPS off</span>');
    else if (canGps && !Track.gpsSupported()) pills.push('<span class="pill">No GPS here</span>');

    if (want.steps) pills.push(stepPill(snap, b));
    else if (canSteps && !Track.motionSupported()) pills.push('<span class="pill">No motion sensor</span>');
    else if (canSteps && p.countSteps === false) pills.push('<span class="pill">Steps off</span>');

    const err = (want.gps && snap.gps.error) || (want.steps && snap.steps.error) || null;
    const needsPerm = want.steps && Track.motionNeedsPermission() && snap.steps.status !== 'on';

    return '<div class="trk">' +
      '<div class="trk-pills">' + pills.join('') + '</div>' +
      (needsPerm ? '<button class="btn ghost wide small" data-a="motionperm">Allow motion access to count steps</button>' : '') +
      (err ? '<div class="trk-err">' + esc(err) + '</div>' : '') +
      /* Always in the DOM, shown by the ticker: typing in the distance box
         deliberately skips a re-render, so this cannot be conditional on
         the markup being rebuilt. */
      '<div class="trk-note" data-tick="manualnote"' + (b.distanceManual ? '' : ' hidden') + '>' +
        'You typed the distance, so the sensors have stopped overwriting it. ' +
        '<button class="link" data-a="unmanual">Measure it again</button></div>' +
      '</div>';
  }

  function gpsPill(snap) {
    const g = snap.gps;
    const label = g.status === 'good' ? 'GPS ' + (g.accuracy != null ? '±' + Math.round(g.accuracy) + ' m' : 'locked')
      : g.status === 'acquiring' ? 'Finding GPS…'
      : g.status === 'poor' ? 'GPS weak'
      : g.status === 'denied' ? 'GPS blocked'
      : 'GPS off';
    const cls = g.status === 'good' ? 'ok' : g.status === 'acquiring' ? 'wait' : 'bad';
    return '<span class="pill ' + cls + '" data-tick="gpspill">' + esc(label) + '</span>';
  }

  function stepPill(snap, b) {
    const st = snap.steps;
    const label = st.status === 'on' ? 'Counting steps'
      : st.status === 'waiting' ? 'Waiting for movement'
      : st.status === 'unsupported' ? 'No motion sensor'
      : st.status === 'blocked' ? 'Motion blocked' : 'Steps off';
    const cls = st.status === 'on' ? 'ok' : st.status === 'waiting' ? 'wait' : 'bad';
    return '<span class="pill ' + cls + '" data-tick="steppill">' + esc(label) + '</span>';
  }

  function readoutField(label, name, value, unit) {
    return '<label class="readout">' +
      '<span class="ro-label">' + esc(label) + '</span>' +
      '<span class="ro-input"><input type="number" inputmode="decimal" step="any" data-ro="' + name + '" value="' +
        (value == null || value === '' ? '' : esc(value)) + '" placeholder="—">' +
        (unit ? '<span class="ro-unit">' + esc(unit) + '</span>' : '') + '</span>' +
      '</label>';
  }

  /* Rowers and swimmers count in metres, everyone else in kilometres. */
  function distanceUnit(b) {
    const u = Data.type(b.type).unit;
    if (u === 'm') return Store.metric() ? 'm' : 'yd';
    if (u === 'cal') return 'cal';
    if (u === 'floors') return '';
    return Store.metric() ? 'km' : 'mi';
  }

  function distanceInputValue(b) {
    if (!(b.distanceM > 0)) return '';
    const u = Data.type(b.type).unit;
    if (u === 'm') return Store.metric() ? Math.round(b.distanceM) : Math.round(b.distanceM * 1.09361);
    if (u === 'cal' || u === 'floors') return U.round(b.distanceM, 0);
    return Store.metric() ? U.round(b.distanceM / 1000, 2) : U.round(b.distanceM / 1609.344, 2);
  }

  function distanceToMetres(b, entered) {
    if (entered == null || entered === '' || isNaN(entered)) return 0;
    const u = Data.type(b.type).unit;
    if (u === 'm') return Store.metric() ? entered : entered / 1.09361;
    if (u === 'cal' || u === 'floors') return entered;
    return Store.metric() ? entered * 1000 : entered * 1609.344;
  }

  function splitsList(b) {
    const splits = b.splits || [];
    if (!splits.length) return '';
    let running = 0;
    return '<div class="splits"><div class="readout-head">Laps</div>' +
      splits.map((s, i) => {
        running += s.sec;
        return '<div class="split"><span class="sp-n">' + (i + 1) + '</span>' +
          '<span class="sp-t">' + U.clock(s.sec) + '</span>' +
          '<span class="sp-total dim">' + U.clock(running) + '</span>' +
          '<button class="sp-x" data-lap-x="' + i + '" aria-label="Delete lap">&times;</button></div>';
      }).join('') + '</div>';
  }

  /* ---------------- strength ---------------- */

  function setsPanel(b) {
    const sets = b.sets || [];
    const last = Session.lastSet();
    const suggested = b.suggested || [];
    const nextSuggestion = suggested[sets.length];
    const seed = last || nextSuggestion || {};
    const bodyweight = b.type === 'bodyweight';

    return '<div class="sets">' +
      (sets.length ? '<div class="set-list">' +
        sets.map((s, i) =>
          '<div class="set-row">' +
            '<span class="set-n">' + (i + 1) + '</span>' +
            '<span class="set-body">' +
              (s.weightKg > 0 ? '<b>' + esc(Store.weightLabel(s.weightKg)) + '</b> × ' : '') +
              '<b>' + (s.reps || 0) + '</b> rep' + (s.reps === 1 ? '' : 's') +
              (s.weightKg > 0 && s.reps > 0 ? '<span class="dim"> · ' + U.round(Data.oneRepMax(s.weightKg, s.reps), 1) + ' kg e1RM</span>' : '') +
            '</span>' +
            '<button class="set-x" data-set-x="' + i + '" aria-label="Delete set">&times;</button>' +
          '</div>').join('') +
        '</div>' : '') +
      (nextSuggestion && !sets.length
        ? '<div class="suggest">Last time you started at <b>' + esc(Store.weightLabel(nextSuggestion.weightKg || 0)) + ' × ' + (nextSuggestion.reps || 0) + '</b></div>'
        : '') +
      '<div class="set-entry">' +
        (bodyweight ? '' : '<div class="entry-col"><span class="entry-label">Weight</span>' +
          UI.stepper('sw', seed.weightKg != null ? seed.weightKg : '', 2.5, Store.metric() ? 'kg' : 'lb') + '</div>') +
        '<div class="entry-col"><span class="entry-label">Reps</span>' +
          UI.stepper('sr', seed.reps != null ? seed.reps : 8, 1, '') + '</div>' +
      '</div>' +
      '<button class="btn primary wide" data-a="logset">Log set ' + (sets.length + 1) + '</button>' +
      '</div>';
  }

  /* ---------------- rest ---------------- */

  function restStrip() {
    const left = Session.restLeft();
    if (left == null) return '';
    const w = Session.live();
    const pct = U.clamp(1 - left / w.rest.total, 0, 1);
    return '<div id="rest" class="rest' + (left <= 0 ? ' done' : '') + '">' +
      '<div id="rest-bar" class="rest-bar" style="transform:scaleX(' + pct + ')"></div>' +
      '<div class="rest-inner">' +
        '<span class="rest-label">Rest</span>' +
        '<span id="rest-left" class="rest-time">' + (left > 0 ? U.clock(left) : 'Go') + '</span>' +
        '<button class="link" data-a="rest30">+30s</button>' +
        '<button class="link" data-a="restskip">Skip</button>' +
      '</div></div>';
  }

  /* ---------------- between stations ---------------- */

  function betweenStations(w) {
    const last = w.blocks[w.blocks.length - 1];
    return '<section class="card between">' +
      '<h2>Between stations</h2>' +
      '<p class="dim">Tap the next machine to carry on, or finish here.</p>' +
      (last ? '<div class="last-station">' + blockSummaryLine(last) + '</div>' : '') +
      '<div class="sheet-actions">' +
        '<button class="btn ghost" data-a="reopen">Back to ' + esc(last ? last.name : 'station') + '</button>' +
        '<button class="btn accent" data-a="addstation">Next station</button>' +
      '</div></section>';
  }

  function priorStations(w, activeBlock) {
    const done = w.blocks.filter(b => b !== activeBlock && b.endedAt);
    if (!done.length) return '';
    return '<section class="card">' +
      '<div class="card-head"><h2>Done so far</h2></div>' +
      done.map(b =>
        '<div class="done-row" data-edit-block="' + esc(b.id) + '">' +
          '<span class="dr-icon">' + Data.icon(b.type, 18) + '</span>' +
          '<span class="dr-body"><b>' + esc(b.name) + '</b><br><span class="dim">' + blockSummaryLine(b) + '</span></span>' +
          '<span class="dr-time">' + U.clock(Store.blockDuration(b)) + '</span>' +
        '</div>').join('') +
      '</section>';
  }

  function blockSummaryLine(b) {
    const t = Data.type(b.type);
    const secs = Store.blockDuration(b) || Session.blockElapsed(b);
    if (t.kind === 'sets') {
      const sets = (b.sets || []).length;
      const vol = Store.blockVolume(b);
      return sets + ' set' + (sets === 1 ? '' : 's') + (vol > 0 ? ' · ' + Math.round(vol) + ' kg volume' : '') + ' · ' + U.clock(secs);
    }
    return [b.distanceM > 0 ? Store.distLabel(b.distanceM, b.type) : null, U.clock(secs),
      b.distanceM > 0 ? Data.paceLabel(b.type, b.distanceM, secs) : null,
      b.steps > 0 ? b.steps.toLocaleString('en-GB') + ' steps' : null].filter(Boolean).join(' · ');
  }

  /* ---------------- live wiring ---------------- */

  function wireLive(app, block) {
    const act = (name, fn) => $$('[data-a="' + name + '"]', app).forEach(b => { b.onclick = fn; });

    act('finish', finishFlow);
    act('discard', () => UI.confirmSheet('Discard session?',
      'Nothing from this session will be saved.', 'Discard', () => { Session.discard(); Session.releaseScreen(); render(); }, { danger: true }));
    act('addstation', () => addStationSheet());
    act('reopen', () => { Session.reopenStation(); render(); });
    act('pause', () => { Session.togglePause(); render(); });
    act('close', () => {
      const b = Session.closeStation();
      const w = Session.live();
      if (Store.profile().tapOutEnds && w && w.blocks.length === 1) finishFlow();
      else { render(); stationDoneSheet(b); }
    });
    act('lap', () => { Session.lap(); render(); });
    act('rest', () => { Session.startRest(); render(); });
    act('rest30', () => { Session.addRest(30); render(); });
    act('restskip', () => { Session.stopRest(); render(); });
    act('plannext', () => { Session.nextPlanStation(); render(); });
    act('settings', settingsSheet);
    act('unmanual', () => {
      Session.patchBlock({ distanceManual: false, distanceSource: null });
      render();
    });
    act('motionperm', async () => {
      const ok = await Track.requestMotionPermission();
      if (!ok) { UI.toast('Motion access was refused — steps cannot be counted', 'long'); return; }
      Track.startSteps();
      UI.toast('Counting steps');
      render();
    });
    act('renamestation', () => {
      if (!block) return;
      renameStationSheet(block);
    });

    const logSet = $('[data-a="logset"]', app);
    if (logSet) logSet.onclick = () => {
      const wEl = $('[name="sw"]', app);
      const rEl = $('[name="sr"]', app);
      const reps = rEl ? parseFloat(rEl.value) : null;
      let weight = wEl ? parseFloat(wEl.value) : null;
      if (!(reps > 0)) { UI.toast('Reps first'); return; }
      if (weight != null && !isNaN(weight) && !Store.metric()) weight = weight / 2.20462;
      Session.addSet({ weightKg: isNaN(weight) ? null : weight, reps });
      NFC.buzz(25);
      render();
    };

    $$('[data-set-x]', app).forEach(b => {
      b.onclick = () => { Session.removeSet(parseInt(b.getAttribute('data-set-x'), 10)); render(); };
    });
    $$('[data-lap-x]', app).forEach(b => {
      b.onclick = () => { Session.removeLap(parseInt(b.getAttribute('data-lap-x'), 10)); render(); };
    });
    $$('[data-edit-block]', app).forEach(row => {
      row.onclick = () => editBlockSheet(row.getAttribute('data-edit-block'));
    });

    /* Console read-offs write through on every keystroke but never
       re-render, so the field keeps focus and the caret stays put. */
    $$('[data-ro]', app).forEach(input => {
      input.oninput = () => {
        const name = input.getAttribute('data-ro');
        const raw = input.value === '' ? null : parseFloat(input.value);
        const b = Session.activeBlock();
        if (!b) return;
        silently(() => {
          if (name === 'distance') Session.patchBlock({
            distanceM: distanceToMetres(b, raw),
            /* Your eyes beat the sensors: from here the box is yours. */
            distanceManual: true,
            distanceSource: 'manual'
          });
          else if (name === 'level') Session.patchBlock({ level: raw });
          else if (name === 'incline') Session.patchBlock({ inclinePct: raw });
          else if (name === 'watts') Session.patchBlock({ watts: raw });
          else if (name === 'hr') Session.patchBlock({ avgHr: raw });
        });
        tick();
      };
    });

    UI.wireSteppers(app);
    if (NFC.supported()) armNfc(false);
  }

  function renameStationSheet(block) {
    UI.sheet('Rename station', (el, close) => {
      el.innerHTML = '<form id="rn">' +
        UI.textField('Name', 'name', block.name, { autofocus: true }) +
        (Data.type(block.type).kind === 'sets'
          ? UI.textField('Exercise', 'exercise', block.exercise || '', { placeholder: 'Bench press, leg press…', hint: 'Used to group your records' })
          : '') +
        '<div class="sheet-actions"><button class="btn primary wide" type="submit">Save</button></div></form>';
      $('#rn', el).onsubmit = ev => {
        ev.preventDefault();
        const v = UI.values(el);
        Session.patchBlock({
          name: (v.name || '').trim() || block.name,
          exercise: (v.exercise || '').trim(),
          muscle: Data.muscleFor(v.exercise || v.name)
        }, block.id);
        close();
        render();
      };
    });
  }

  function addStationSheet() {
    UI.sheet('Next station', (el, close) => {
      el.innerHTML =
        (Store.machines().length ? '<div class="sub-head">Your kit</div><div class="tile-grid">' +
          recentMachines(12).map(m => machineTile(m)).join('') + '</div>' : '') +
        '<div class="sub-head">Anything else</div>' + typeGrid('type', null) +
        '<p class="sheet-copy dim">Or just tap the machine — the app closes the station you are on and opens the new one.</p>';
      $$('[data-start-machine]', el).forEach(b => {
        b.onclick = () => {
          const m = Store.machine(b.getAttribute('data-start-machine'));
          close();
          Session.openStation(m);
          render();
          showLastTime(m);
        };
      });
      wireTypeGrid(el, typeId => { close(); Session.openStation(typeId); render(); });
    }, { tall: true });
  }

  /* Shown after a tap-out when there is more than one way to carry on. */
  function stationDoneSheet(block) {
    if (!block) return;
    UI.sheet(block.name + ' done', (el, close) => {
      el.innerHTML =
        '<div class="done-big">' + blockSummaryLine(block) + '</div>' +
        '<div class="sheet-actions col">' +
          '<button class="btn primary wide" data-a="fin">Finish workout</button>' +
          '<button class="btn ghost wide" data-a="next">Next station</button>' +
          '<button class="link centred" data-a="back">Carry on here</button>' +
        '</div>';
      $('[data-a="fin"]', el).onclick = () => { close(); finishFlow(); };
      $('[data-a="next"]', el).onclick = () => { close(); addStationSheet(); };
      $('[data-a="back"]', el).onclick = () => { close(); Session.reopenStation(); render(); };
    });
  }

  /* ---------------- finishing ----------------

     The finish sheet is the one place the app asks you to type. It asks
     only for what the machine's console knows and the phone cannot: the
     distance, the level, your heart rate. Everything else is already
     measured. */

  function finishFlow() {
    const w = Session.live();
    if (!w) return;
    if (Session.activeBlock()) Session.closeStation();

    UI.sheet('Finish workout', (el, close) => {
      const blocks = Session.live().blocks;
      el.innerHTML =
        '<form id="fin">' +
        blocks.map((b, i) => finishBlockFields(b, i, blocks.length)).join('') +
        '<div class="sub-head">How did it feel</div>' +
        UI.chips('rpe', w.rpe, [
          { value: '3', label: 'Easy' }, { value: '5', label: 'Steady' },
          { value: '7', label: 'Hard' }, { value: '9', label: 'All out' }
        ]) +
        UI.textField('Workout name', 'title', w.title || suggestTitle(blocks), { placeholder: 'Optional' }) +
        '<label class="field"><span class="field-label">Notes</span>' +
          '<textarea class="input" name="notes" rows="2" placeholder="Anything worth remembering">' + esc(w.notes || '') + '</textarea></label>' +
        '<div class="sheet-actions col">' +
          '<button class="btn primary wide" type="submit">Save workout</button>' +
          '<button class="link centred" type="button" data-a="back">Keep going instead</button>' +
        '</div></form>';

      let rpe = w.rpe;
      UI.wireChips(el, (n, v) => { rpe = parseFloat(v); });
      $('[data-a="back"]', el).onclick = () => { close(); Session.reopenStation(); render(); };

      $('#fin', el).onsubmit = ev => {
        ev.preventDefault();
        blocks.forEach((b, i) => {
          const patch = {};
          const get = key => {
            const node = $('[name="b' + i + '_' + key + '"]', el);
            if (!node) return undefined;
            return node.value === '' ? null : parseFloat(node.value);
          };
          const dist = get('distance');
          if (dist !== undefined) patch.distanceM = distanceToMetres(b, dist);
          const lvl = get('level'); if (lvl !== undefined) patch.level = lvl;
          const inc = get('incline'); if (inc !== undefined) patch.inclinePct = inc;
          const hr = get('hr'); if (hr !== undefined) patch.avgHr = hr;
          const dur = get('mins');
          if (dur !== undefined && dur > 0) patch.durationSec = Math.round(dur * 60);
          Session.patchBlock(patch, b.id);
        });
        const v = UI.values(el);
        const result = Session.finish({ title: (v.title || '').trim(), notes: (v.notes || '').trim(), rpe: rpe || null });
        close();
        Session.releaseScreen();
        render();
        if (result && result.empty) { UI.toast('Nothing logged — session dropped'); return; }
        summarySheet(result);
      };
    }, { tall: true });
  }

  function finishBlockFields(b, i, count) {
    const t = Data.type(b.type);
    const secs = Store.blockDuration(b);
    const rows = [];
    if (t.kind !== 'sets') {
      const label = t.unit === 'cal' ? 'Calories' : t.unit === 'floors' ? 'Floors' : 'Distance';
      rows.push(finishField(label, 'b' + i + '_distance', distanceInputValue(b), distanceUnit(b)));
      if ((t.fields || []).includes('level') || (t.fields || []).includes('damper')) rows.push(finishField('Level', 'b' + i + '_level', b.level, ''));
      if ((t.fields || []).includes('incline')) rows.push(finishField('Incline', 'b' + i + '_incline', b.inclinePct, '%'));
    }
    rows.push(finishField('Avg HR', 'b' + i + '_hr', b.avgHr, 'bpm'));
    rows.push(finishField('Minutes', 'b' + i + '_mins', secs ? U.round(secs / 60, 1) : '', 'min'));

    return '<div class="fin-block">' +
      '<div class="fin-head">' + Data.icon(b.type, 18) +
        '<b>' + esc(b.name) + '</b>' +
        (count > 1 ? '<span class="dim"> · station ' + (i + 1) + '</span>' : '') +
        '<span class="fin-time">' + U.clock(secs) + '</span></div>' +
      (t.kind === 'sets' && (b.sets || []).length
        ? '<div class="fin-sets">' + b.sets.map(s => (s.weightKg > 0 ? U.round(s.weightKg, 1) + '×' : '') + (s.reps || 0)).join(' · ') + '</div>'
        : '') +
      (b.steps > 0 ? '<div class="fin-sets">' + b.steps.toLocaleString('en-GB') + ' steps' +
        (b.cadence > 0 ? ' · ' + b.cadence + ' spm' : '') +
        (b.distanceSource && b.distanceSource !== 'manual' ? ' · distance by ' + esc(sourceWord(b.distanceSource)).toLowerCase() : '') +
        '</div>'
        : (b.distanceSource === 'gps' ? '<div class="fin-sets">Distance measured by GPS</div>' : '')) +
      '<div class="readout-grid">' + rows.join('') + '</div>' +
      '</div>';
  }

  function finishField(label, name, value, unit) {
    return '<label class="readout">' +
      '<span class="ro-label">' + esc(label) + '</span>' +
      '<span class="ro-input"><input type="number" inputmode="decimal" step="any" name="' + name + '" value="' +
        (value == null || value === '' ? '' : esc(value)) + '" placeholder="—">' +
        (unit ? '<span class="ro-unit">' + esc(unit) + '</span>' : '') + '</span></label>';
  }

  function suggestTitle(blocks) {
    if (!blocks.length) return '';
    if (blocks.length === 1) return blocks[0].name;
    const groups = {};
    blocks.forEach(b => { groups[Data.type(b.type).group] = true; });
    const keys = Object.keys(groups);
    if (keys.length > 1) return 'Mixed session';
    return keys[0] === 'strength' ? 'Weights' : 'Cardio';
  }

  /* ---------------- summary ---------------- */

  function summarySheet(result) {
    const w = result.workout;
    if (!w) return;
    const tot = Store.totals(w);
    const records = result.records || [];
    if (records.length) NFC.buzz([40, 60, 40, 60, 140]);

    UI.sheet(null, (el, close) => {
      el.innerHTML =
        '<div class="summary">' +
          '<div class="sum-hero">' +
            '<div class="sum-tick">' + (records.length ? '★' : '✓') + '</div>' +
            '<h2>' + esc(w.title || 'Workout saved') + '</h2>' +
            '<p class="dim">' + esc(U.friendlyDate(w.date)) + ' · ' + U.clockWords(Store.elapsed(w)) + ' elapsed</p>' +
          '</div>' +
          (records.length ? '<div class="records">' +
            '<div class="rec-head">' + records.length + ' personal best' + (records.length === 1 ? '' : 's') + '</div>' +
            records.map(r => '<div class="rec"><span class="rec-what">' + esc(r.block.name) + ' · ' + esc(r.label) + '</span>' +
              '<span class="rec-val">' + esc(r.value) + '</span></div>').join('') +
            '</div>' : '') +
          '<div class="row3">' +
            UI.stat(U.clockWords(tot.seconds), 'Moving') +
            UI.stat(tot.distanceM > 0 ? esc(Store.distLabel(tot.distanceM)) : '—', 'Distance') +
            UI.stat(String(tot.kcal), 'kcal') +
          '</div>' +
          (tot.sets ? '<div class="row3">' +
            UI.stat(String(tot.sets), 'Sets') +
            UI.stat(String(tot.reps), 'Reps') +
            UI.stat(Math.round(tot.volumeKg) + '<span class="unit">kg</span>', 'Volume') +
            '</div>' : '') +
          (tot.steps ? '<div class="row2">' +
            UI.stat(tot.steps.toLocaleString('en-GB'), 'Steps') +
            UI.stat(String(bestCadence(w) || '—') + (bestCadence(w) ? '<span class="unit">spm</span>' : ''), 'Cadence') +
            '</div>' : '') +
          routeBlock(w) +
          '<div class="sum-blocks">' + w.blocks.map(b =>
            '<div class="done-row"><span class="dr-icon">' + Data.icon(b.type, 18) + '</span>' +
            '<span class="dr-body"><b>' + esc(b.name) + '</b><br><span class="dim">' + blockSummaryLine(b) + '</span></span></div>').join('') +
          '</div>' +
          '<div class="sheet-actions col">' +
            '<button class="btn primary wide" data-a="done">Done</button>' +
            '<button class="link centred" data-a="edit">Edit this workout</button>' +
          '</div>' +
        '</div>';
      $('[data-a="done"]', el).onclick = () => close();
      $('[data-a="edit"]', el).onclick = () => { close(); workoutSheet(w); };
    }, { tall: true });
  }

  /* A route drawn from its own points — no tiles, no network, and it still
     tells you at a glance which run this was. */
  function routeSvg(points) {
    if (!points || points.length < 3) return '';
    const lats = points.map(p => p[0]), lons = points.map(p => p[1]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLon = Math.min(...lons), maxLon = Math.max(...lons);
    /* Longitude degrees shrink towards the poles; without this correction
       every route comes out stretched sideways. */
    const midLat = (minLat + maxLat) / 2;
    const kx = Math.cos(midLat * Math.PI / 180);
    const w = Math.max((maxLon - minLon) * kx, 1e-9);
    const h = Math.max(maxLat - minLat, 1e-9);
    const pad = 6, box = 100;
    const scale = (box - pad * 2) / Math.max(w, h);
    const ox = (box - w * scale) / 2, oy = (box - h * scale) / 2;

    const d = points.map((p, i) => {
      const x = ox + (p[1] - minLon) * kx * scale;
      const y = box - (oy + (p[0] - minLat) * scale);
      return (i ? 'L' : 'M') + U.round(x, 1) + ' ' + U.round(y, 1);
    }).join(' ');

    const first = points[0], last = points[points.length - 1];
    const pt = p => [ox + (p[1] - minLon) * kx * scale, box - (oy + (p[0] - minLat) * scale)];
    const a = pt(first), b = pt(last);
    return '<svg class="route" viewBox="0 0 100 100" aria-label="Route shape">' +
      '<path class="route-line" d="' + d + '"></path>' +
      '<circle class="route-start" cx="' + U.round(a[0], 1) + '" cy="' + U.round(a[1], 1) + '" r="2.6"></circle>' +
      '<circle class="route-end" cx="' + U.round(b[0], 1) + '" cy="' + U.round(b[1], 1) + '" r="2.6"></circle>' +
      '</svg>';
  }

  function bestCadence(w) {
    return Math.max(0, ...(w.blocks || []).map(b => b.cadence || 0)) || 0;
  }

  function routeBlock(w) {
    const withRoute = (w.blocks || []).filter(b => b.route && b.route.length > 2);
    if (!withRoute.length) return '';
    return '<div class="route-wrap big">' + routeSvg(withRoute[0].route) + '</div>';
  }

  /* ---------------- view: log ---------------- */

  function renderLog(app) {
    const all = Store.workouts();
    const filtered = logFilter === 'all' ? all : all.filter(w =>
      (w.blocks || []).some(b => Data.type(b.type).group === logFilter));

    if (!all.length) {
      app.innerHTML = '<div class="pad">' + UI.empty(Data.icon('other', 34), 'No workouts yet',
        'Tap a machine, or start one from the Tap tab. Everything you finish lands here.') + '</div>';
      return;
    }

    const groups = {};
    filtered.forEach(w => { (groups[w.date] = groups[w.date] || []).push(w); });
    const dates = Object.keys(groups).sort().reverse();

    app.innerHTML = '<div class="pad">' +
      '<div class="filter-row">' +
        UI.chips('f', logFilter, [
          { value: 'all', label: 'Everything' },
          { value: 'cardio', label: 'Cardio' },
          { value: 'strength', label: 'Strength' },
          { value: 'other', label: 'Other' }
        ]) +
      '</div>' +
      logTotals(filtered) +
      (dates.length ? dates.map(d =>
        '<section class="day">' +
          '<div class="day-head"><span>' + esc(U.friendlyDate(d)) + '</span>' +
            '<span class="dim">' + dayLine(groups[d]) + '</span></div>' +
          groups[d].map(w => workoutRow(w)).join('') +
        '</section>').join('')
        : '<div class="chart-empty">Nothing in that filter</div>') +
      '</div>';

    UI.wireChips(app, (n, v) => { logFilter = v; render(); });
    $$('[data-open-workout]', app).forEach(b => {
      b.onclick = () => workoutSheet(Store.workout(b.getAttribute('data-open-workout')));
    });
  }

  function dayLine(list) {
    let secs = 0, kc = 0;
    list.forEach(w => { const t = Store.totals(w); secs += t.seconds; kc += t.kcal; });
    return U.clockWords(secs) + ' · ' + kc + ' kcal';
  }

  function logTotals(list) {
    let secs = 0, dist = 0, kc = 0, vol = 0;
    list.forEach(w => { const t = Store.totals(w); secs += t.seconds; dist += t.distanceM; kc += t.kcal; vol += t.volumeKg; });
    return '<div class="row3">' +
      UI.stat(String(list.length), 'Sessions') +
      UI.stat(U.clockWords(secs), 'Time') +
      UI.stat(dist > 0 ? esc(Store.distLabel(dist)) : Math.round(vol) + '<span class="unit">kg</span>', dist > 0 ? 'Distance' : 'Volume') +
      '</div>';
  }

  function workoutRow(w) {
    const t = Store.totals(w);
    const types = [];
    (w.blocks || []).forEach(b => { if (!types.includes(b.type)) types.push(b.type); });
    return '<button class="wrow" data-open-workout="' + esc(w.id) + '">' +
      '<span class="wrow-icons">' + types.slice(0, 3).map(x => Data.icon(x, 20)).join('') + '</span>' +
      '<span class="wrow-body">' +
        '<span class="wrow-title">' + esc(w.title || (w.blocks[0] ? w.blocks[0].name : 'Workout')) + '</span>' +
        '<span class="wrow-sub">' + esc(rowSub(w, t)) + '</span>' +
      '</span>' +
      '<span class="wrow-time">' + U.clockWords(t.seconds) + '</span>' +
      '</button>';
  }

  function rowSub(w, t) {
    const bits = [];
    if (w.blocks.length > 1) bits.push(w.blocks.length + ' stations');
    if (t.distanceM > 0) bits.push(Store.distLabel(t.distanceM));
    if (t.sets) bits.push(t.sets + ' sets');
    bits.push(t.kcal + ' kcal');
    return bits.join(' · ');
  }

  /* ---------------- a saved workout ---------------- */

  function workoutSheet(w) {
    if (!w) return;
    UI.sheet(w.title || U.friendlyDate(w.date), (el, close) => {
      const t = Store.totals(w);
      const paint = () => {
        el.innerHTML =
          '<div class="row3">' +
            UI.stat(U.clockWords(t.seconds), 'Moving') +
            UI.stat(t.distanceM > 0 ? esc(Store.distLabel(t.distanceM)) : '—', 'Distance') +
            UI.stat(String(t.kcal), 'kcal') +
          '</div>' +
          (w.rpe ? '<div class="rpe-line">Felt: <b>' + rpeWord(w.rpe) + '</b></div>' : '') +
          (w.notes ? '<div class="notes">' + esc(w.notes) + '</div>' : '') +
          '<div class="sub-head">Stations</div>' +
          w.blocks.map(b => detailBlock(b)).join('') +
          '<div class="sheet-actions col">' +
            '<button class="btn ghost wide" data-a="rename">Rename &amp; notes</button>' +
            '<button class="btn ghost wide" data-a="repeat">Do this again</button>' +
            '<button class="link danger centred" data-a="del">Delete workout</button>' +
          '</div>';

        $$('[data-edit-saved]', el).forEach(row => {
          row.onclick = () => editSavedBlock(w, row.getAttribute('data-edit-saved'), paint);
        });
        $('[data-a="rename"]', el).onclick = () => renameWorkoutSheet(w, paint);
        $('[data-a="repeat"]', el).onclick = () => { close(); repeatWorkout(w); };
        $('[data-a="del"]', el).onclick = () => UI.confirmSheet('Delete workout?',
          'This one session will be removed. Records recalculate without it.', 'Delete', () => {
            Store.removeWorkout(w.id); close(); render();
          }, { danger: true });
      };
      paint();
    }, { tall: true });
  }

  function sourceWord(src) {
    return src === 'gps' ? 'GPS' : src === 'steps' ? 'Step count' : 'Typed in';
  }

  function rpeWord(v) {
    return v <= 3 ? 'Easy' : v <= 5 ? 'Steady' : v <= 7 ? 'Hard' : 'All out';
  }

  function detailBlock(b) {
    const t = Data.type(b.type);
    const secs = Store.blockDuration(b);
    const rows = [];
    if (t.kind !== 'sets') {
      if (b.distanceM > 0) rows.push(['Distance', Store.distLabel(b.distanceM, b.type)]);
      if (b.distanceM > 0 && secs) rows.push(['Pace', Data.paceLabel(b.type, b.distanceM, secs)]);
      if (b.level != null) rows.push(['Level', String(b.level)]);
      if (b.inclinePct != null) rows.push(['Incline', b.inclinePct + '%']);
    }
    if (b.steps > 0) {
      rows.push(['Steps', b.steps.toLocaleString('en-GB')]);
      if (b.cadence > 0) rows.push(['Cadence', b.cadence + ' spm']);
    }
    if (b.avgHr) {
      const z = Data.zoneFor(b.avgHr, Store.age());
      rows.push(['Avg HR', b.avgHr + ' bpm' + (z ? ' · Z' + z.n + ' ' + z.name : '')]);
    }
    rows.push(['Time', U.clock(secs)]);
    rows.push(['Energy', Store.blockKcal(b) + ' kcal']);
    if (b.distanceM > 0 && b.distanceSource) rows.push(['Measured by', sourceWord(b.distanceSource)]);

    return '<div class="detail" data-edit-saved="' + esc(b.id) + '">' +
      '<div class="detail-head">' + Data.icon(b.type, 18) + '<b>' + esc(b.name) + '</b>' +
        '<span class="dim">' + esc(t.name) + '</span></div>' +
      ((b.route && b.route.length > 2) ? '<div class="route-wrap">' + routeSvg(b.route) + '</div>' : '') +
      ((b.sets || []).length ? '<div class="detail-sets">' +
        b.sets.map((s, i) => '<span class="setpill">' + (i + 1) + '. ' +
          (s.weightKg > 0 ? esc(Store.weightLabel(s.weightKg)) + ' × ' : '') + (s.reps || 0) + '</span>').join('') +
        '</div>' : '') +
      ((b.splits || []).length ? '<div class="detail-sets">' +
        b.splits.map((s, i) => '<span class="setpill">L' + (i + 1) + ' ' + U.clock(s.sec) + '</span>').join('') +
        '</div>' : '') +
      '<div class="detail-grid">' + rows.map(r =>
        '<div class="dg"><span class="dg-l">' + esc(r[0]) + '</span><span class="dg-v">' + r[1] + '</span></div>').join('') + '</div>' +
      (b.note ? '<div class="notes small">' + esc(b.note) + '</div>' : '') +
      '</div>';
  }

  function editSavedBlock(w, blockId, after) {
    const b = w.blocks.find(x => x.id === blockId);
    if (!b) return;
    const t = Data.type(b.type);
    UI.sheet('Edit ' + b.name, (el, close) => {
      el.innerHTML = '<form id="eb">' +
        UI.textField('Name', 'name', b.name) +
        (t.kind !== 'sets' ? finishField('Distance', 'distance', distanceInputValue(b), distanceUnit(b)) : '') +
        finishField('Minutes', 'mins', U.round(Store.blockDuration(b) / 60, 1), 'min') +
        finishField('Avg HR', 'hr', b.avgHr, 'bpm') +
        (t.kind !== 'sets' ? finishField('Level', 'level', b.level, '') : '') +
        '<label class="field"><span class="field-label">Note</span>' +
          '<textarea class="input" name="note" rows="2">' + esc(b.note || '') + '</textarea></label>' +
        (t.kind === 'sets' ? setEditor(b) : '') +
        '<div class="sheet-actions col">' +
          '<button class="btn primary wide" type="submit">Save</button>' +
          '<button class="link danger centred" type="button" data-a="delblock">Remove this station</button>' +
        '</div></form>';

      wireSetEditor(el, b);
      $('[data-a="delblock"]', el).onclick = () => {
        w.blocks = w.blocks.filter(x => x.id !== blockId);
        if (!w.blocks.length) { Store.removeWorkout(w.id); close(); UI.closeTopSheet(); render(); return; }
        Store.saveWorkout(w); close(); after(); render();
      };
      $('#eb', el).onsubmit = ev => {
        ev.preventDefault();
        const v = UI.values(el);
        if (v.distance !== undefined) b.distanceM = distanceToMetres(b, v.distance);
        if (v.mins > 0) b.durationSec = Math.round(v.mins * 60);
        b.avgHr = v.hr || null;
        if (v.level !== undefined) b.level = v.level;
        b.name = (v.name || '').trim() || b.name;
        b.note = (v.note || '').trim();
        b.kcal = 0;
        b.kcal = Store.blockKcal(b);
        Store.saveWorkout(w);
        close(); after(); render();
      };
    }, { tall: true });
  }

  function setEditor(b) {
    return '<div class="sub-head">Sets</div><div class="set-edit">' +
      (b.sets || []).map((s, i) =>
        '<div class="se-row" data-i="' + i + '">' +
          '<span class="set-n">' + (i + 1) + '</span>' +
          '<input class="input tiny" type="number" inputmode="decimal" step="any" data-se="w" value="' + (s.weightKg == null ? '' : U.round(s.weightKg, 2)) + '" placeholder="kg">' +
          '<span class="times">×</span>' +
          '<input class="input tiny" type="number" inputmode="numeric" data-se="r" value="' + (s.reps == null ? '' : s.reps) + '" placeholder="reps">' +
          '<button type="button" class="set-x" data-se-x="' + i + '" aria-label="Delete set">&times;</button>' +
        '</div>').join('') +
      '<button type="button" class="btn ghost wide" data-a="addset">Add a set</button>' +
      '</div>';
  }

  function wireSetEditor(el, b) {
    const box = $('.set-edit', el);
    if (!box) return;
    $$('[data-se-x]', el).forEach(btn => {
      btn.onclick = () => {
        b.sets.splice(parseInt(btn.getAttribute('data-se-x'), 10), 1);
        box.outerHTML = setEditor(b);
        wireSetEditor(el, b);
      };
    });
    $$('.se-row', el).forEach(row => {
      const i = parseInt(row.getAttribute('data-i'), 10);
      $$('[data-se]', row).forEach(input => {
        input.oninput = () => {
          const val = input.value === '' ? null : parseFloat(input.value);
          if (input.getAttribute('data-se') === 'w') b.sets[i].weightKg = val;
          else b.sets[i].reps = val;
        };
      });
    });
    const add = $('[data-a="addset"]', el);
    if (add) add.onclick = () => {
      b.sets = b.sets || [];
      const last = b.sets[b.sets.length - 1] || {};
      b.sets.push({ weightKg: last.weightKg || null, reps: last.reps || null });
      box.outerHTML = setEditor(b);
      wireSetEditor(el, b);
    };
  }

  function renameWorkoutSheet(w, after) {
    UI.sheet('Workout details', (el, close) => {
      el.innerHTML = '<form id="rw">' +
        UI.textField('Name', 'title', w.title || '', { autofocus: true }) +
        UI.textField('Date', 'date', w.date, { type: 'date' }) +
        '<div class="field"><span class="field-label">How did it feel</span>' +
          UI.chips('rpe', w.rpe, [
            { value: '3', label: 'Easy' }, { value: '5', label: 'Steady' },
            { value: '7', label: 'Hard' }, { value: '9', label: 'All out' }]) + '</div>' +
        '<label class="field"><span class="field-label">Notes</span>' +
          '<textarea class="input" name="notes" rows="3">' + esc(w.notes || '') + '</textarea></label>' +
        '<div class="sheet-actions"><button class="btn primary wide" type="submit">Save</button></div></form>';
      let rpe = w.rpe;
      UI.wireChips(el, (n, v) => { rpe = parseFloat(v); });
      $('#rw', el).onsubmit = ev => {
        ev.preventDefault();
        const v = UI.values(el);
        w.title = (v.title || '').trim();
        w.notes = (v.notes || '').trim();
        w.rpe = rpe || null;
        if (v.date) w.date = v.date;
        Store.saveWorkout(w);
        close(); after(); render();
      };
    });
  }

  /* Rebuild a past workout as a live one — same stations, no numbers. */
  function repeatWorkout(w) {
    if (Session.live()) { UI.toast('Finish the session you are in first'); return; }
    const first = w.blocks[0];
    const m = first.machineId ? Store.machine(first.machineId) : null;
    Session.start(m || first.type, { title: w.title, name: first.name });
    Session.holdScreen();
    go('tap');
    UI.toast('Repeating ' + (w.title || 'workout') + ' — tap through the stations');
  }

  /* ---------------- view: kit ----------------
     Your machines, and the tags bound to them. */

  function renderKit(app) {
    const machines = Store.machines();
    const places = {};
    machines.forEach(m => { (places[m.place || ''] = places[m.place || ''] || []).push(m); });
    const keys = Object.keys(places).sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));

    app.innerHTML = '<div class="pad">' +
      nfcStatusCard() +
      (machines.length
        ? keys.map(k =>
          '<section class="card">' +
            '<div class="card-head"><h2>' + esc(k || 'No place set') + '</h2>' +
              '<span class="dim">' + places[k].length + '</span></div>' +
            places[k].map(m => kitRow(m)).join('') +
          '</section>').join('')
        : UI.empty(tagGlyphBig(), 'No kit yet',
            'Tap an NFC tag to add a machine in one go, or add one by hand and write a sticker for it later.')) +
      '<button class="btn primary wide" data-a="addmachine">Add a machine</button>' +
      '<button class="link centred" data-a="howto">How tags work</button>' +
      '</div>';

    $('[data-a="addmachine"]', app).onclick = () => machineSheet(null);
    $('[data-a="howto"]', app).onclick = howItWorksSheet;
    $$('[data-machine]', app).forEach(row => {
      row.onclick = () => machineSheet(Store.machine(row.getAttribute('data-machine')));
    });
    const arm = $('[data-a="armnfc"]', app);
    if (arm) arm.onclick = () => armNfc(true);
  }

  function tagGlyphBig() {
    return '<svg viewBox="0 0 24 24" width="34" height="34" aria-hidden="true">' +
      '<path d="M12 20a8 8 0 0 0 0-16"></path><path d="M12 16.5a4.5 4.5 0 0 0 0-9"></path>' +
      '<circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"></circle></svg>';
  }

  function nfcStatusCard() {
    if (!NFC.supported()) {
      return '<section class="card note">' +
        '<div class="note-head">' + tagGlyph() + ' NFC reading is not available here</div>' +
        '<p>Live tag reading needs Chrome on Android. Everything else works: log by hand, and any tag you have already written still opens the app straight into its machine — including on an iPhone.</p>' +
        '</section>';
    }
    return '<section class="card note">' +
      '<div class="note-head"><span id="nfcdot" class="dot' + (nfcState.armed ? ' on' : '') + '"></span>' +
        (nfcState.armed ? 'Reader is listening' : 'Reader is off') + '</div>' +
      '<p>' + (nfcState.armed
        ? 'Hold your phone against any tag to add it, or to start a workout from the Tap tab.'
        : 'Switch the reader on to bind tags and start workouts by tapping.') + '</p>' +
      (nfcState.armed ? '' : '<button class="btn ghost wide" data-a="armnfc">Switch the reader on</button>') +
      '</section>';
  }

  function kitRow(m) {
    const hist = Store.machineHistory(m.id);
    const last = hist[0];
    return '<div class="kit-row" data-machine="' + esc(m.id) + '">' +
      '<span class="kit-icon c-' + esc(m.colour || 'a') + '">' + Data.icon(m.type, 20) + '</span>' +
      '<span class="kit-body">' +
        '<span class="kit-name">' + esc(m.name) + '</span>' +
        '<span class="kit-sub">' + esc(Data.type(m.type).name) +
          ' · ' + hist.length + ' session' + (hist.length === 1 ? '' : 's') +
          (last ? ' · ' + esc(U.friendlyDate(last.workout.date)) : '') + '</span>' +
      '</span>' +
      ((m.tags || []).length
        ? '<span class="kit-tag on" title="' + m.tags.length + ' tag bound">' + tagGlyph() + '</span>'
        : '<span class="kit-tag" title="No tag bound">' + tagGlyph() + '</span>') +
      '</div>';
  }

  /* ---------------- a machine ---------------- */

  function machineSheet(m) {
    const creating = !m;
    /* Edits live in a draft until you save, so switching the type — which
       repaints the form, because the fields depend on it — never throws
       away what you have already typed. */
    const draft = creating
      ? { id: null, name: '', type: 'cycle', place: lastPlace(), exercise: '', restSec: null, tags: [], defaults: {} }
      : Object.assign({}, Store.machine(m.id));

    UI.sheet(creating ? 'Add a machine' : m.name, (el, close) => {
      const readForm = () => {
        const v = UI.values(el);
        if (v.name !== undefined) draft.name = v.name;
        if (v.place !== undefined) draft.place = v.place;
        if (v.exercise !== undefined) draft.exercise = v.exercise;
        if (v.restSec !== undefined) draft.restSec = v.restSec;
      };

      const paint = () => {
        const cur = draft;
        if (!creating && !Store.machine(m.id)) { close(); return; }
        const hist = creating ? [] : Store.machineHistory(cur.id);

        el.innerHTML = '<form id="mf">' +
          UI.textField('Name', 'name', cur.name, { placeholder: 'Bike 4, Leg press…', autofocus: creating }) +
          '<div class="field"><span class="field-label">Type</span>' + typeGrid('type', cur.type) + '</div>' +
          UI.textField('Where', 'place', cur.place, { placeholder: 'Gym, home, hotel' }) +
          (Data.type(cur.type).kind === 'sets'
            ? UI.textField('Exercise', 'exercise', cur.exercise || '', { placeholder: 'Bench press, lat pulldown…', hint: 'Groups this machine’s records with the same lift elsewhere' })
            : '') +
          UI.numField('Rest timer', 'restSec', cur.restSec || '', { placeholder: String(Store.profile().restSec), hint: 'Seconds. Blank uses your default.' }) +
          (creating ? '' : tagsBlock(cur)) +
          (hist.length ? historyBlock(cur, hist) : '') +
          '<div class="sheet-actions col">' +
            '<button class="btn primary wide" type="submit">' + (creating ? 'Add machine' : 'Save') + '</button>' +
            (creating ? '' : '<button class="btn ghost wide" type="button" data-a="start">Start a workout here</button>') +
            (creating ? '' : '<button class="link danger centred" type="button" data-a="del">Delete machine</button>') +
          '</div></form>';

        wireTypeGrid(el, typeId => {
          /* Re-paint so the type-specific fields follow the choice. */
          readForm();
          draft.type = typeId;
          paint();
        });

        const refreshTags = () => { draft.tags = (Store.machine(cur.id) || { tags: [] }).tags || []; paint(); };
        const writeBtn = $('[data-a="write"]', el);
        if (writeBtn) writeBtn.onclick = () => writeTagSheet(cur);
        const bindBtn = $('[data-a="bind"]', el);
        if (bindBtn) bindBtn.onclick = () => bindTagSheet(cur, refreshTags);
        $$('[data-untag]', el).forEach(b => {
          b.onclick = () => {
            readForm();
            Store.unbindTag(cur.id, b.getAttribute('data-untag'));
            refreshTags();
          };
        });

        const startBtn = $('[data-a="start"]', el);
        if (startBtn) startBtn.onclick = () => {
          close();
          const saved = Store.machine(cur.id);
          if (Session.live()) Session.openStation(saved); else Session.start(saved);
          Session.holdScreen();
          go('tap');
          showLastTime(saved);
        };

        const delBtn = $('[data-a="del"]', el);
        if (delBtn) delBtn.onclick = () => UI.confirmSheet('Delete ' + cur.name + '?',
          'Past workouts keep their record of it — only the machine and its tags go.', 'Delete', () => {
            Store.removeMachine(cur.id); close(); render();
          }, { danger: true });

        $('#mf', el).onsubmit = ev => {
          ev.preventDefault();
          readForm();
          const patch = {
            name: (draft.name || '').trim() || Data.type(draft.type).name,
            type: draft.type,
            place: (draft.place || '').trim(),
            exercise: (draft.exercise || '').trim(),
            restSec: draft.restSec > 0 ? draft.restSec : null
          };
          if (creating) { Store.addMachine(Object.assign(patch, { tags: draft.tags })); close(); render(); UI.toast(patch.name + ' added'); }
          else { Store.updateMachine(cur.id, patch); close(); render(); }
        };
      };
      paint();
    }, { tall: true });
  }

  function tagsBlock(m) {
    const tags = m.tags || [];
    return '<div class="sub-head">NFC tags</div>' +
      '<div class="taglist">' +
        (tags.length ? tags.map(t =>
          '<div class="tagrow">' + tagGlyph() + '<span class="mono">' + esc(shortSerial(t)) + '</span>' +
          '<button type="button" class="set-x" data-untag="' + esc(t) + '" aria-label="Unbind tag">&times;</button></div>').join('')
          : '<div class="dim small">No tag bound yet.</div>') +
      '</div>' +
      '<div class="sheet-actions">' +
        (NFC.supported() ? '<button type="button" class="btn ghost" data-a="bind">Bind a tag</button>' : '') +
        (NFC.canWrite() ? '<button type="button" class="btn ghost" data-a="write">Write a sticker</button>' : '') +
      '</div>';
  }

  function historyBlock(m, hist) {
    const t = Data.type(m.type);
    const recent = hist.slice(0, 8);
    const points = recent.slice().reverse().map(h => ({
      label: U.friendlyDate(h.workout.date),
      tick: '',
      value: t.kind === 'sets' ? Store.blockVolume(h.block) : (h.block.distanceM || Store.blockDuration(h.block))
    }));
    return '<div class="sub-head">On this machine</div>' +
      UI.barChart(points, { height: 60, format: v => Math.round(v) }) +
      '<div class="hist-list">' +
        recent.map(h => '<div class="hist-row"><span>' + esc(U.friendlyDate(h.workout.date)) + '</span>' +
          '<span class="dim">' + esc(blockSummaryLine(h.block)) + '</span></div>').join('') +
      '</div>';
  }

  /* ---------------- binding and writing tags ---------------- */

  function bindTagSheet(machine, after) {
    UI.sheet('Bind a tag', (el, close) => {
      el.innerHTML =
        '<p class="sheet-copy">Hold your phone against the tag you want to use for <b>' + esc(machine.name) + '</b>. Any tag works — the one already on the machine, or a blank sticker.</p>' +
        '<div class="waiting"><span class="pulse-dot big"></span><span>Waiting for a tag…</span></div>' +
        '<div class="sheet-actions"><button class="btn ghost wide" data-a="cancel">Cancel</button></div>';

      let done = false;
      const listener = tag => {
        if (done) return;
        done = true;
        if (!tag.serial) { UI.toast('That tag has no readable serial'); close(); return; }
        Store.bindTag(machine.id, tag.serial);
        NFC.buzz([30, 60, 30]);
        close();
        after();
        UI.toast('Tag bound to ' + machine.name);
      };
      bindWaiters.push(listener);

      const stop = () => { const i = bindWaiters.indexOf(listener); if (i >= 0) bindWaiters.splice(i, 1); };
      $('[data-a="cancel"]', el).onclick = () => { done = true; stop(); close(); };
      armNfc(true);
    }, { onClose: () => { bindWaiters.length = 0; } });
  }

  function writeTagSheet(machine) {
    UI.sheet('Write a sticker', (el, close) => {
      el.innerHTML =
        '<p class="sheet-copy">This writes a link to <b>' + esc(machine.name) + '</b> onto a blank NFC sticker. Tapping that sticker afterwards opens Tap In straight into this machine — on any phone, iPhones included.</p>' +
        '<div class="waiting"><span class="pulse-dot big"></span><span>Hold your phone against the sticker…</span></div>' +
        '<div class="mono link-preview">' + esc(NFC.linkFor(machine.id)) + '</div>' +
        '<div class="sheet-actions"><button class="btn ghost wide" data-a="cancel">Cancel</button></div>';

      $('[data-a="cancel"]', el).onclick = () => close();

      NFC.write(machine.id, machine.name).then(() => {
        close();
        UI.toast('Sticker written — give it a tap to test');
        /* The written link identifies the machine, but binding the serial
           too means the tag also works when the app is already open. */
      }).catch(e => {
        if (e && e.name === 'AbortError') return;
        el.querySelector('.waiting').innerHTML = '<span class="warn">' + esc(NFC.describe(e)) + '</span>';
      });
    }, { sticky: true });
  }

  /* ---------------- view: plans ----------------
     A routine is an ordered list of stations. Running one turns the tap
     screen into a guide: it knows what is next, and tapping the right
     machine moves you along. */

  function renderPlans(app) {
    const plans = Store.plans();
    app.innerHTML = '<div class="pad">' +
      (plans.length
        ? plans.map(p => planCard(p)).join('')
        : UI.empty(Data.icon('strength', 34), 'No routines yet',
            'Build the circuit you actually do — push day, a 5×5, the treadmill-and-weights hour — and the app will walk you through it.')) +
      '<button class="btn primary wide" data-a="addplan">New routine</button>' +
      (Store.workouts().length ? '<button class="btn ghost wide" data-a="fromlast">Build one from my last workout</button>' : '') +
      '</div>';

    $('[data-a="addplan"]', app).onclick = () => planSheet(null);
    const fromLast = $('[data-a="fromlast"]', app);
    if (fromLast) fromLast.onclick = () => {
      const w = Store.workouts()[0];
      const p = Store.addPlan({
        name: w.title || 'Routine from ' + U.friendlyDate(w.date),
        items: w.blocks.map(b => ({ machineId: b.machineId, type: b.type, name: b.name, targetSets: (b.sets || []).length || null }))
      });
      render();
      planSheet(p);
    };
    $$('[data-plan]', app).forEach(b => { b.onclick = () => planSheet(Store.plan(b.getAttribute('data-plan'))); });
    $$('[data-plan-start]', app).forEach(b => {
      b.onclick = ev => {
        ev.stopPropagation();
        if (Session.live()) { UI.toast('Finish the session you are in first'); return; }
        Session.startPlan(b.getAttribute('data-plan-start'));
        Session.holdScreen();
        go('tap');
      };
    });
  }

  function planCard(p) {
    return '<section class="card plan" data-plan="' + esc(p.id) + '">' +
      '<div class="card-head"><h2>' + esc(p.name) + '</h2>' +
        '<button class="btn small accent" data-plan-start="' + esc(p.id) + '">Start</button></div>' +
      '<div class="plan-items">' +
        (p.items.length
          ? p.items.map((it, i) => '<span class="plan-item">' + (i + 1) + '. ' +
              Data.icon(it.type || 'other', 14) + esc(it.name || Data.type(it.type).name) +
              (it.targetSets ? ' <span class="dim">×' + it.targetSets + '</span>' : '') + '</span>').join('')
          : '<span class="dim">Empty — tap to add stations</span>') +
      '</div>' +
      (p.lastUsed ? '<div class="dim small">Last run ' + esc(U.friendlyDate(p.lastUsed)) + '</div>' : '') +
      '</section>';
  }

  function planSheet(p) {
    const creating = !p;
    if (creating) p = Store.addPlan({ name: '' });
    UI.sheet(creating ? 'New routine' : 'Edit routine', (el, close) => {
      const paint = () => {
        const cur = Store.plan(p.id);
        if (!cur) { close(); return; }
        el.innerHTML =
          UI.textField('Name', 'name', cur.name, { placeholder: 'Push day, Tuesday circuit…', autofocus: creating }) +
          '<div class="sub-head">Stations</div>' +
          '<div class="plan-edit">' +
            (cur.items.length ? cur.items.map((it, i) =>
              '<div class="pe-row">' +
                '<span class="pe-n">' + (i + 1) + '</span>' +
                '<span class="pe-icon">' + Data.icon(it.type || 'other', 18) + '</span>' +
                '<span class="pe-name">' + esc(it.name || Data.type(it.type).name) + '</span>' +
                '<button class="pe-btn" data-up="' + i + '" aria-label="Move up">↑</button>' +
                '<button class="pe-btn" data-down="' + i + '" aria-label="Move down">↓</button>' +
                '<button class="set-x" data-rm="' + i + '" aria-label="Remove">&times;</button>' +
              '</div>').join('') : '<div class="dim small">Nothing here yet.</div>') +
          '</div>' +
          '<button class="btn ghost wide" data-a="additem">Add a station</button>' +
          '<div class="sheet-actions col">' +
            '<button class="btn primary wide" data-a="save">Save routine</button>' +
            '<button class="link danger centred" data-a="del">Delete routine</button>' +
          '</div>';

        $('[data-a="additem"]', el).onclick = () => addPlanItemSheet(cur, paint);
        $$('[data-rm]', el).forEach(b => b.onclick = () => {
          cur.items.splice(parseInt(b.getAttribute('data-rm'), 10), 1);
          Store.updatePlan(cur.id, { items: cur.items }); paint();
        });
        $$('[data-up]', el).forEach(b => b.onclick = () => {
          const i = parseInt(b.getAttribute('data-up'), 10);
          if (i > 0) { const x = cur.items.splice(i, 1)[0]; cur.items.splice(i - 1, 0, x); Store.updatePlan(cur.id, { items: cur.items }); paint(); }
        });
        $$('[data-down]', el).forEach(b => b.onclick = () => {
          const i = parseInt(b.getAttribute('data-down'), 10);
          if (i < cur.items.length - 1) { const x = cur.items.splice(i, 1)[0]; cur.items.splice(i + 1, 0, x); Store.updatePlan(cur.id, { items: cur.items }); paint(); }
        });
        $('[data-a="save"]', el).onclick = () => {
          const v = UI.values(el);
          Store.updatePlan(cur.id, { name: (v.name || '').trim() || 'Routine' });
          close(); render();
        };
        $('[data-a="del"]', el).onclick = () => UI.confirmSheet('Delete routine?', 'Workouts you have already logged from it stay put.', 'Delete', () => {
          Store.removePlan(cur.id); close(); render();
        }, { danger: true });
      };
      paint();
    }, { tall: true, onClose: () => {
      /* A routine created and then abandoned with nothing in it is noise. */
      const cur = Store.plan(p.id);
      if (cur && !cur.items.length && !cur.name) Store.removePlan(cur.id);
      render();
    } });
  }

  function addPlanItemSheet(plan, after) {
    UI.sheet('Add a station', (el, close) => {
      el.innerHTML =
        (Store.machines().length ? '<div class="sub-head">Your kit</div><div class="tile-grid">' +
          Store.machines().map(m => machineTile(m)).join('') + '</div>' : '') +
        '<div class="sub-head">Anything else</div>' + typeGrid('type', null);
      $$('[data-start-machine]', el).forEach(b => {
        b.onclick = () => {
          const m = Store.machine(b.getAttribute('data-start-machine'));
          plan.items.push({ machineId: m.id, type: m.type, name: m.name });
          Store.updatePlan(plan.id, { items: plan.items });
          close(); after();
        };
      });
      wireTypeGrid(el, typeId => {
        plan.items.push({ machineId: null, type: typeId, name: Data.type(typeId).name });
        Store.updatePlan(plan.id, { items: plan.items });
        close(); after();
      });
    }, { tall: true });
  }

  /* ---------------- view: stats ---------------- */

  function renderStats(app) {
    const week = Store.weekSummary();
    const st = Store.streak();
    const goal = Store.profile().weeklyGoal || 4;
    const workouts = Store.workouts();

    if (!workouts.length) {
      app.innerHTML = '<div class="pad">' + UI.empty(Data.icon('run', 34), 'Nothing to measure yet',
        'Finish a workout and this fills up: weekly load, personal bests, what you have been neglecting.') + '</div>';
      return;
    }

    app.innerHTML = '<div class="pad">' +
      '<section class="card centre">' +
        UI.ring(week.count / goal, String(week.count), 'of ' + goal + ' this week') +
        '<div class="row3 tight">' +
          UI.stat(U.clockWords(week.seconds), 'Time') +
          UI.stat(week.distanceM > 0 ? esc(Store.distLabel(week.distanceM)) : '—', 'Distance') +
          UI.stat(String(week.kcal), 'kcal') +
        '</div>' +
      '</section>' +
      '<div class="row2">' +
        UI.stat(st.current + '<span class="unit">d</span>', 'Current streak') +
        UI.stat(st.best + '<span class="unit">d</span>', 'Best streak') +
      '</div>' +
      stepsBlock(week) +
      weekBars() +
      loadTrend() +
      typeBreakdown() +
      muscleBlock() +
      recordsBlock() +
      '</div>';

    $$('[data-rec]', app).forEach(b => { b.onclick = () => recordSheet(b.getAttribute('data-rec')); });
    const mus = $('[data-a="muscledays"]', app);
    if (mus) mus.onclick = () => { muscleDays = muscleDays === 7 ? 28 : 7; render(); };
  }

  /* Steps counted during sessions. Deliberately not called a daily step
     count: nothing runs while the app is closed, and saying otherwise
     would be a lie the user could not check. */
  function stepsBlock(week) {
    if (!week.steps) return '';
    const points = [];
    for (let i = 6; i >= 0; i--) {
      const date = U.shiftDate(U.today(), -i);
      points.push({
        label: U.friendlyDate(date),
        tick: U.parseISO(date).toLocaleDateString('en-GB', { weekday: 'narrow' }),
        value: Store.stepsOn(date),
        highlight: i === 0
      });
    }
    return '<section class="card">' +
      '<div class="card-head"><h2>Steps</h2><span class="dim">this week</span></div>' +
      '<div class="row2 tightless">' +
        UI.stat(week.steps.toLocaleString('en-GB'), 'While training') +
        UI.stat(Math.round(week.steps / 7).toLocaleString('en-GB'), 'A day') +
      '</div>' +
      UI.barChart(points, { height: 62, format: v => v.toLocaleString('en-GB') + ' steps' }) +
      '<p class="dim small">Counted only while a session is running — a web app cannot follow you around the rest of the day.</p>' +
      '</section>';
  }

  function weekBars() {
    const points = [];
    for (let i = 11; i >= 0; i--) {
      const start = U.shiftDate(U.weekStart(U.today()), -i * 7);
      const w = Store.weekSummary(start);
      points.push({
        label: 'Week of ' + U.friendlyDate(start),
        tick: i % 3 === 0 ? U.parseISO(start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '',
        value: Math.round(w.seconds / 60),
        highlight: i === 0
      });
    }
    return '<section class="card">' +
      '<div class="card-head"><h2>Twelve weeks</h2><span class="dim">minutes / week</span></div>' +
      UI.barChart(points, { height: 86, format: v => v + ' min' }) +
      '</section>';
  }

  /* Weekly minutes as a line, with the four-week average behind it —
     the shape that tells you whether load is going up or drifting down. */
  function loadTrend() {
    const vals = [];
    for (let i = 11; i >= 0; i--) {
      const start = U.shiftDate(U.weekStart(U.today()), -i * 7);
      vals.push(Math.round(Store.weekSummary(start).seconds / 60));
    }
    const recent = vals.slice(-4).reduce((a, b) => a + b, 0) / 4;
    const prior = vals.slice(-8, -4).reduce((a, b) => a + b, 0) / 4;
    const change = prior > 0 ? Math.round((recent - prior) / prior * 100) : null;
    return '<section class="card">' +
      '<div class="card-head"><h2>Training load</h2>' +
        (change == null ? '' : '<span class="' + (change >= 0 ? 'up' : 'down') + '">' +
          (change >= 0 ? '+' : '') + change + '%</span>') + '</div>' +
      UI.sparkline(vals) +
      '<p class="dim small">' + (change == null
        ? 'Keep logging and a four-week trend appears here.'
        : 'Last four weeks averaged ' + Math.round(recent) + ' minutes a week against ' + Math.round(prior) + ' before that.') +
      '</p></section>';
  }

  function typeBreakdown() {
    const totals = Store.typeTotals(30);
    const keys = Object.keys(totals).sort((a, b) => totals[b].seconds - totals[a].seconds);
    if (!keys.length) return '';
    const max = Math.max(...keys.map(k => totals[k].seconds));
    return '<section class="card">' +
      '<div class="card-head"><h2>Last 30 days</h2></div>' +
      keys.map(k => {
        const t = totals[k];
        return '<div class="tb-row">' +
          '<span class="tb-icon">' + Data.icon(k, 18) + '</span>' +
          '<span class="tb-name">' + esc(Data.type(k).name) + '</span>' +
          '<span class="tb-bar"><i style="width:' + Math.round(t.seconds / max * 100) + '%"></i></span>' +
          '<span class="tb-val">' + U.clockWords(t.seconds) + '</span>' +
          '</div>';
      }).join('') +
      '</section>';
  }

  let muscleDays = 7;

  function muscleBlock() {
    const cover = Store.muscleCoverage(muscleDays);
    const any = Object.keys(cover).some(k => cover[k].sets > 0);
    if (!any) return '';
    const max = Math.max(1, ...Object.keys(cover).map(k => cover[k].sets));
    return '<section class="card">' +
      '<div class="card-head"><h2>Muscles worked</h2>' +
        '<button class="link" data-a="muscledays">' + muscleDays + ' days</button></div>' +
      '<div class="muscles">' +
        Data.MUSCLES.map(m => {
          const c = cover[m.id];
          const pct = Math.round(c.sets / max * 100);
          return '<div class="mus' + (c.sets ? '' : ' none') + '">' +
            '<span class="mus-name">' + esc(m.name) + '</span>' +
            '<span class="mus-bar"><i style="width:' + pct + '%"></i></span>' +
            '<span class="mus-val">' + (c.sets || '—') + '</span></div>';
        }).join('') +
      '</div>' +
      '<p class="dim small">Sets per muscle group. Anything sitting at a dash has not been touched in ' + muscleDays + ' days.</p>' +
      '</section>';
  }

  function recordsBlock() {
    const recs = Store.records().filter(r => Object.keys(r.best).length);
    if (!recs.length) return '';
    return '<section class="card">' +
      '<div class="card-head"><h2>Personal bests</h2><span class="dim">' + recs.length + '</span></div>' +
      recs.slice(0, 12).map(r => {
        const headline = bestHeadline(r);
        return '<button class="rec-row" data-rec="' + esc(r.key) + '">' +
          '<span class="rr-icon">' + Data.icon(r.type, 18) + '</span>' +
          '<span class="rr-body"><b>' + esc(r.name) + '</b><br><span class="dim">' + esc(headline) + '</span></span>' +
          '<span class="rr-count dim">' + r.count + '×</span>' +
          '</button>';
      }).join('') +
      '</section>';
  }

  function bestHeadline(r) {
    const b = r.best;
    if (r.kind === 'sets') {
      const bits = [];
      if (b.weight) bits.push('Top ' + Store.weightLabel(b.weight.value));
      if (b.e1rm) bits.push(U.round(b.e1rm.value, 1) + ' kg e1RM');
      if (b.volume) bits.push(Math.round(b.volume.value) + ' kg best session');
      return bits.join(' · ') || 'No numbers yet';
    }
    const bits = [];
    if (b.distance) bits.push('Furthest ' + Store.distLabel(b.distance.value, r.type));
    if (b.duration) bits.push('Longest ' + U.clock(b.duration.value));
    if (b.pace) bits.push('Best ' + Data.paceLabelFromSeconds(r.type, b.pace.value));
    return bits.join(' · ') || 'No numbers yet';
  }

  function recordSheet(key) {
    const rec = Store.records().find(r => r.key === key);
    if (!rec) return;
    const machineId = key.indexOf('m:') === 0 ? key.slice(2) : null;
    const hist = machineId ? Store.machineHistory(machineId)
      : Store.allBlocks().filter(x => (x.b.type + (x.b.name ? '|' + x.b.name.toLowerCase() : '')) === key.slice(2))
        .reverse().map(x => ({ workout: x.w, block: x.b }));

    UI.sheet(rec.name, (el) => {
      const b = rec.best;
      const rows = [];
      const put = (label, value, date) => { if (value) rows.push([label, value, date]); };
      if (rec.kind === 'sets') {
        if (b.weight) put('Heaviest set', Store.weightLabel(b.weight.value), b.weight.date);
        if (b.e1rm) put('Estimated 1RM', U.round(b.e1rm.value, 1) + ' kg', b.e1rm.date);
        if (b.reps) put('Most reps in a set', String(b.reps.value), b.reps.date);
        if (b.volume) put('Best session volume', Math.round(b.volume.value) + ' kg', b.volume.date);
      } else {
        if (b.distance) put('Furthest', Store.distLabel(b.distance.value, rec.type), b.distance.date);
        if (b.duration) put('Longest', U.clock(b.duration.value), b.duration.date);
        if (b.pace) put('Best pace', Data.paceLabelFromSeconds(rec.type, b.pace.value), b.pace.date);
      }

      const points = hist.slice(0, 10).reverse().map(h => ({
        label: U.friendlyDate(h.workout.date), tick: '',
        value: rec.kind === 'sets'
          ? Math.max(0, ...(h.block.sets || []).map(s => Data.oneRepMax(s.weightKg, s.reps)))
          : (h.block.distanceM || Store.blockDuration(h.block))
      }));

      el.innerHTML =
        '<div class="pb-grid">' + rows.map(r =>
          '<div class="pb"><span class="pb-l">' + esc(r[0]) + '</span>' +
          '<span class="pb-v">' + esc(r[1]) + '</span>' +
          '<span class="pb-d dim">' + esc(U.friendlyDate(r[2])) + '</span></div>').join('') + '</div>' +
        '<div class="sub-head">' + (rec.kind === 'sets' ? 'Estimated 1RM over time' : 'Recent sessions') + '</div>' +
        UI.barChart(points, { height: 70, format: v => U.round(v, 1) }) +
        '<div class="hist-list">' +
          hist.slice(0, 12).map(h => '<div class="hist-row"><span>' + esc(U.friendlyDate(h.workout.date)) + '</span>' +
            '<span class="dim">' + esc(blockSummaryLine(h.block)) + '</span></div>').join('') +
        '</div>';
    }, { tall: true });
  }

  /* ---------------- settings ---------------- */

  function settingsSheet() {
    UI.sheet('Settings', (el, close) => {
      const p = Store.profile();
      el.innerHTML =
        '<form id="sf">' +
        '<div class="sub-head">You</div>' +
        UI.textField('Name', 'name', p.name, { placeholder: 'Optional' }) +
        UI.numField('Body weight', 'weightKg', Store.metric() ? p.weightKg : U.round(p.weightKg * 2.20462, 1),
          { hint: 'Used for the calorie estimate — nothing else' }) +
        UI.numField('Year of birth', 'birthYear', p.birthYear || '', { hint: 'Sets your heart-rate zones' }) +
        UI.numField('Height', 'heightCm', Store.metric() ? p.heightCm : U.round((p.heightCm || 175) / 2.54, 1),
          { hint: Store.metric() ? 'cm — the first guess at your stride length' : 'inches — the first guess at your stride length' }) +
        UI.selectField('Units', 'units', p.units, [
          { value: 'metric', label: 'Metric — kg, km' },
          { value: 'imperial', label: 'Imperial — lb, miles' }]) +
        UI.numField('Sessions a week', 'weeklyGoal', p.weeklyGoal) +

        '<div class="sub-head">Measuring</div>' +
        UI.toggleRow('Use GPS outdoors', 'useGps', p.useGps !== false,
          'Measures distance and pace on runs, rides and walks' +
          (Track.gpsSupported() ? '' : ' — not available in this browser')) +
        UI.toggleRow('Count steps', 'countSteps', p.countSteps !== false,
          'Uses the motion sensor during a session' +
          (Track.motionSupported() ? '' : ' — no motion sensor found here')) +
        strideBlock(p) +

        '<div class="sub-head">Training</div>' +
        UI.numField('Default rest', 'restSec', p.restSec, { hint: 'Seconds between sets. Machines can override it.' }) +
        UI.toggleRow('Start the rest timer automatically', 'autoRest', p.autoRest, 'As soon as you log a set') +
        UI.toggleRow('Tapping out finishes the workout', 'tapOutEnds', p.tapOutEnds, 'Only when it is your one and only station — circuits always ask') +
        UI.toggleRow('Vibrate on a tap', 'haptics', p.haptics) +

        '<div class="sub-head">Look</div>' +
        UI.selectField('Theme', 'theme', p.theme, [
          { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]) +

        '<div class="sub-head">Your data</div>' +
        '<p class="sheet-copy dim">Everything lives in this browser and nowhere else. Clearing site data wipes it, so keep a backup.</p>' +
        '<div class="btn-col">' +
          '<button type="button" class="btn ghost wide" data-a="exp">Export a backup (JSON)</button>' +
          '<button type="button" class="btn ghost wide" data-a="csv">Export sessions (CSV)</button>' +
          '<button type="button" class="btn ghost wide" data-a="imp">Restore from a backup</button>' +
          '<button type="button" class="link danger centred" data-a="wipe">Delete everything</button>' +
        '</div>' +
        '<input type="file" id="importfile" accept="application/json,.json" hidden>' +

        '<div class="sub-head">About</div>' +
        '<p class="sheet-copy dim">Tap In — ' + Store.machines().length + ' machines, ' +
          Store.workouts().length + ' workouts logged. NFC reading is ' +
          (NFC.supported() ? 'available' : 'not available in this browser') + '.</p>' +
        '<button type="button" class="link centred" data-a="howto">How tags work</button>' +

        '<div class="sheet-actions"><button class="btn primary wide" type="submit">Save</button></div>' +
        '</form>';

      UI.wireToggles(el, (name, on) => Store.setProfile({ [name]: on }));

      const resetStride = $('[data-a="resetstride"]', el);
      if (resetStride) resetStride.onclick = () => {
        Store.setProfile({ strideCal: {} });
        UI.toast('Stride reset — it will be measured again on your next run');
        close();
        settingsSheet();
      };

      $('[data-a="exp"]', el).onclick = () =>
        UI.download('tapin-backup-' + U.today() + '.json', Store.exportJson(), 'application/json');
      $('[data-a="csv"]', el).onclick = () =>
        UI.download('tapin-sessions-' + U.today() + '.csv', Store.exportCsv(), 'text/csv');
      $('[data-a="howto"]', el).onclick = howItWorksSheet;

      const file = $('#importfile', el);
      $('[data-a="imp"]', el).onclick = () => file.click();
      file.onchange = () => {
        const f = file.files && file.files[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const res = Store.importJson(String(reader.result));
            close();
            applyTheme();
            render();
            UI.toast('Restored ' + res.workouts + ' workouts and ' + res.machines + ' machines', 'long');
          } catch (e) {
            UI.toast('That file could not be read as a Tap In backup', 'long');
          }
        };
        reader.readAsText(f);
      };

      $('[data-a="wipe"]', el).onclick = () => UI.confirmSheet('Delete everything?',
        'Every workout, machine, tag binding and routine goes. This cannot be undone — export a backup first if you are unsure.',
        'Delete it all', () => { Store.wipe(); close(); applyTheme(); go('tap'); }, { danger: true });

      $('#sf', el).onsubmit = ev => {
        ev.preventDefault();
        const v = UI.values(el);
        const wasMetric = Store.metric();
        const weight = v.weightKg > 0 ? (wasMetric ? v.weightKg : v.weightKg / 2.20462) : p.weightKg;
        const height = v.heightCm > 0 ? (wasMetric ? v.heightCm : v.heightCm * 2.54) : p.heightCm;
        Store.setProfile({
          name: (v.name || '').trim(),
          weightKg: U.round(weight, 1),
          heightCm: U.round(U.clamp(height, 100, 250), 1),
          birthYear: v.birthYear > 1900 ? v.birthYear : null,
          units: v.units,
          weeklyGoal: U.clamp(v.weeklyGoal || 4, 1, 14),
          restSec: U.clamp(v.restSec || 90, 5, 900),
          theme: v.theme
        });
        applyTheme();
        close();
        render();
      };
    }, { tall: true });
  }

  /* What the app has learnt about your stride, and where that came from. */
  function strideBlock(p) {
    const cal = p.strideCal || {};
    const rows = [
      ['Running', cal.run, Track.defaultStride(p.heightCm, 'run')],
      ['Walking', cal.walk, Track.defaultStride(p.heightCm, 'walk')]
    ];
    return '<div class="stride">' +
      '<div class="readout-head">Stride length</div>' +
      rows.map(r => '<div class="stride-row"><span>' + esc(r[0]) + '</span>' +
        '<span class="' + (r[1] > 0 ? 'stride-cal' : 'dim') + '">' +
        U.round(r[1] > 0 ? r[1] : r[2], 2) + ' m · ' + (r[1] > 0 ? 'measured' : 'from your height') +
        '</span></div>').join('') +
      '<p class="dim small">A session with both GPS and steps running measures this for real, and the step counter uses it afterwards — on a treadmill, or anywhere the signal goes.</p>' +
      ((cal.run > 0 || cal.walk > 0) ? '<button type="button" class="link" data-a="resetstride">Reset stride</button>' : '') +
      '</div>';
  }

  function applyTheme() {
    document.documentElement.setAttribute('data-theme', Store.profile().theme === 'light' ? 'light' : 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', Store.profile().theme === 'light' ? '#f3f5f9' : '#0b0f16');
  }

  /* ---------------- deep links ----------------
     A tag written by this app opens the page at #m=<id>. That is the route
     an iPhone takes, and the route Android takes when the app is closed. */

  function handleDeepLink(machineId) {
    const m = Store.machine(machineId);
    if (!m) {
      /* A sticker written on another phone, or before the data was wiped.
         Adopting it keeps the id, so the tag carries on working. */
      unknownTagSheet({ machineId, serial: null, at: Date.now() });
      return;
    }
    handleTap({ machineId: m.id, serial: null, at: Date.now() });
  }

  window.addEventListener('hashchange', () => {
    const id = NFC.readDeepLink();
    if (id) handleDeepLink(id);
  });

  /* ---------------- boot ---------------- */

  function boot() {
    Store.load();
    applyTheme();

    Store.onChange(() => { if (!suppressRender) render(); });

    $$('#nav .nav-btn').forEach(b => { b.onclick = () => go(b.dataset.view); });
    $('#settingsBtn').onclick = settingsSheet;
    $('#brand').onclick = () => go('tap');

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') UI.closeTopSheet();
    });

    render();

    if (Session.live()) {
      Session.holdScreen();
      Session.resumeTracking();
    }

    const deep = NFC.readDeepLink();
    if (deep) setTimeout(() => handleDeepLink(deep), 60);

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(() => { /* offline support is a bonus, not a requirement */ });
      });
    }

    NFC.permission().then(state => {
      nfcState.permission = state;
      /* Permission already granted means the reader can come up without a
         gesture, so a tap works the second the app opens. */
      if (state === 'granted') armNfc(false);
      paintNfcState();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  G.App = { go, render, settingsSheet };

})(window.TapIn = window.TapIn || {});
