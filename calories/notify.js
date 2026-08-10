/* Fuel — reminder notifications.

   What the web can and cannot do here, honestly:
   a website has no way to hand a list of future alarms to the phone's OS the way
   a native app can. Without a push server there is no guaranteed background
   delivery. So reminders are checked on a timer while the app is running, and
   again the moment you reopen it. In practice:

   - Android, installed to the home screen: the app usually stays alive in the
     background, so reminders fire close to their time.
   - iOS: notifications need iOS 16.4+ and the app added to the home screen, and
     only fire while it is still running in the background. Swiped away, it is
     asleep and nothing fires until you open it again.
   - Either way, missed reminders are shown as a catch-up when you next open it.

   The UI states this plainly rather than pretending otherwise. */
(function (G) {
  'use strict';

  const U = G.Util;
  let timer = null;
  let swReg = null;

  const supported = () => typeof Notification !== 'undefined';
  const permission = () => (supported() ? Notification.permission : 'unsupported');

  function setRegistration(reg) { swReg = reg; }

  async function request() {
    if (!supported()) return 'unsupported';
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try {
      return await Notification.requestPermission();
    } catch (err) {
      return Notification.permission;
    }
  }

  /* Showing through the service worker keeps notifications alive when the page
     itself is backgrounded; `new Notification()` is the fallback. */
  async function show(title, body, tag) {
    if (!supported() || Notification.permission !== 'granted') return false;
    const opts = {
      body,
      tag: tag || 'fuel',
      icon: './icon.svg',
      badge: './icon.svg',
      renotify: false,
      data: { url: './' }
    };
    try {
      const reg = swReg || (navigator.serviceWorker && await navigator.serviceWorker.getRegistration());
      if (reg && reg.showNotification) { await reg.showNotification(title, opts); return true; }
    } catch (err) { /* fall through to the direct constructor */ }
    try { new Notification(title, opts); return true; } catch (err) { return false; }
  }

  const minutesNow = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

  function parseTime(hhmm) {
    const parts = String(hhmm || '').split(':');
    const h = Number(parts[0]), m = Number(parts[1]);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  /* A reminder is due when its time has passed today and it has not already
     fired today. `lastFired` holds a date string, so each fires at most once a day. */
  function due(reminder, nowMins, today) {
    if (!reminder.enabled) return false;
    if (reminder.lastFired === today) return false;
    const at = parseTime(reminder.time);
    return at != null && nowMins >= at;
  }

  /* Reminders whose moment passed while the app was closed. Anything more than
     three hours stale is dropped — a 9am nudge at 8pm is just noise. */
  function overdue() {
    const today = U.today();
    const now = minutesNow();
    return G.Store.get().profile.reminders.filter(r =>
      due(r, now, today) && (now - parseTime(r.time)) <= 180
    );
  }

  function markFired(reminder) {
    reminder.lastFired = U.today();
    G.Store.save();
  }

  /* Skip a reminder whose job is already done — no point nagging about breakfast
     that is already in the diary. */
  function alreadySatisfied(reminder) {
    const today = U.today();
    const d = G.Store.day(today);
    if (reminder.id === 'r-weigh') return G.Store.get().weights.some(w => w.d === today);
    if (reminder.id === 'r-water') return d.waterMl >= G.Store.get().profile.waterGoalMl;
    if (reminder.mealId) {
      // The meal may have been renamed (fine — same id) or deleted (then this
      // reminder has nothing to check, so let it through).
      const exists = G.Store.meals().some(m => m.id === reminder.mealId);
      if (!exists) return false;
      return d.food.some(e => e.meal === reminder.mealId);
    }
    if (reminder.id === 'r-check') return d.food.length > 0;
    return false;
  }

  async function check() {
    const p = G.Store.get().profile;
    if (!p.notificationsOn || permission() !== 'granted') return;
    const today = U.today();
    const now = minutesNow();
    for (const r of p.reminders) {
      if (!due(r, now, today)) continue;
      if (alreadySatisfied(r)) { markFired(r); continue; }
      // Stale by more than three hours: mark it done without shouting about it.
      if (now - parseTime(r.time) > 180) { markFired(r); continue; }
      await show('Fuel', r.label, r.id);
      markFired(r);
    }
  }

  function start() {
    stop();
    check();
    timer = setInterval(check, 60000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check();
    });
  }

  function stop() { if (timer) { clearInterval(timer); timer = null; } }

  async function test() {
    const ok = await show('Fuel', 'Reminders are working. This is a test.', 'fuel-test');
    return ok;
  }

  G.Notify = {
    supported, permission, request, show, start, stop, check, test,
    overdue, markFired, setRegistration, parseTime
  };
})(window);
