/* Tap In — the live workout engine.

   A workout is a list of blocks. A block is one station: one machine, one
   stretch of time. Cardio blocks carry distance and splits, strength blocks
   carry sets. A plain treadmill session is a workout with one block; a
   circuit is the same workout with eight.

   Taps drive all of it. The rules are deliberately boring, because you are
   reading them out of the corner of your eye with a heart rate of 160:

     tap, nothing running        → start here
     tap, this station running   → finish this station
     tap, another station running→ close that one, start here
     tap, between stations       → start here
*/
(function (G) {
  'use strict';

  const S = () => G.Store;
  const U = () => G.Util;

  /* ---------------- reading the live workout ---------------- */

  function live() { return S().live(); }

  function activeBlock() {
    const w = live();
    if (!w || !w.blocks || !w.blocks.length) return null;
    const b = w.blocks[w.blocks.length - 1];
    return b && !b.endedAt ? b : null;
  }

  function lastBlock() {
    const w = live();
    if (!w || !w.blocks || !w.blocks.length) return null;
    return w.blocks[w.blocks.length - 1];
  }

  function isPaused() {
    const b = activeBlock();
    return !!(b && b.pauseStart);
  }

  /* Seconds of actual work in a block, with paused time taken back out. */
  function blockElapsed(b) {
    if (!b || !b.startedAt) return 0;
    const end = b.endedAt || Date.now();
    const paused = (b.pausedMs || 0) + (b.pauseStart ? Date.now() - b.pauseStart : 0);
    return Math.max(0, Math.round((end - b.startedAt - paused) / 1000));
  }

  function workoutElapsed() {
    const w = live();
    if (!w) return 0;
    return Math.max(0, Math.round((Date.now() - w.startedAt) / 1000));
  }

  /* ---------------- starting ---------------- */

  function newBlock(machineOrType, opts) {
    const o = opts || {};
    const m = typeof machineOrType === 'object' && machineOrType ? machineOrType : null;
    const typeId = m ? m.type : (machineOrType || 'other');
    const t = G.Data.type(typeId);
    const defaults = (m && m.defaults) || {};
    return {
      id: U().uid(),
      machineId: m ? m.id : null,
      name: o.name || (m ? m.name : t.name),
      exercise: o.exercise || (m && m.exercise) || '',
      type: typeId,
      startedAt: Date.now(),
      endedAt: null,
      pausedMs: 0,
      pauseStart: null,
      durationSec: 0,
      distanceM: 0,
      level: defaults.level != null ? defaults.level : null,
      inclinePct: defaults.inclinePct != null ? defaults.inclinePct : null,
      watts: null,
      avgHr: null,
      seat: defaults.seat != null ? defaults.seat : null,
      splits: [],
      sets: [],
      steps: 0,
      cadence: 0,
      route: null,
      distanceSource: null,   /* 'gps' | 'steps' | 'manual' */
      distanceManual: false,  /* set once you type over the measurement */
      note: ''
    };
  }

  /* ---------------- sensors ----------------

     Which sensors a station runs comes from the activity and from your
     settings; a bike outdoors wants GPS and not a step count, a treadmill
     wants the reverse, and a bench press wants neither. */

  function sensorsFor(typeId) {
    const t = G.Data.type(typeId);
    const p = S().profile();
    return {
      gps: !!(t.gps && p.useGps !== false && G.Track.gpsSupported()),
      steps: !!(t.steps && p.countSteps !== false && G.Track.motionSupported()),
      type: typeId
    };
  }

  /* What the block had already banked before this run of the sensors. The
     sensors always count from zero — on a reopened station, or after the
     page has been reloaded mid-session — so without this the distance
     already measured would be thrown away. */
  let trackBase = null;

  function startTracking(block) {
    const want = sensorsFor(block.type);
    trackBase = { blockId: block.id, distanceM: block.distanceM || 0, steps: block.steps || 0 };
    if (!want.gps && !want.steps) { G.Track.stop(); return want; }
    G.Track.start(want);
    return want;
  }

  function baseFor(blockId) {
    return (trackBase && trackBase.blockId === blockId) ? trackBase : { distanceM: 0, steps: 0 };
  }

  /* Fold whatever the sensors measured into the block. Called every second
     while a station runs, and once more as it closes. */
  function syncTracking(finalise) {
    const b = activeBlock();
    if (!b) return null;
    const t = G.Data.type(b.type);
    const snap = G.Track.snapshot();
    if (!snap.running) return null;

    const measured = G.Track.bestDistance(S().profile(), b.type);
    const base = baseFor(b.id);
    const patch = { steps: base.steps + snap.steps.count, cadence: snap.steps.cadence };

    /* Typing a distance yourself takes over from the sensors for good —
       you can see the machine's console and it cannot. */
    if (!b.distanceManual && t.kind !== 'sets' && measured.metres > 0) {
      patch.distanceM = Math.round(base.distanceM + measured.metres);
      patch.distanceSource = measured.source;
    }
    if (finalise && snap.gps.points.length > 1) {
      patch.route = (b.route && b.route.length ? b.route : []).concat(snap.gps.points);
    }

    patchBlock(patch, b.id);
    return patch;
  }

  function start(machineOrType, opts) {
    const o = opts || {};
    const block = newBlock(machineOrType, o);
    const w = {
      id: U().uid(),
      date: U().today(),
      startedAt: Date.now(),
      endedAt: null,
      title: o.title || '',
      planId: o.planId || null,
      planStep: o.planId ? 0 : null,
      notes: '',
      rpe: null,
      blocks: [block]
    };
    S().setLive(w);
    primeSets(block);
    startTracking(block);
    return w;
  }

  /* Open another station on the running workout. */
  function openStation(machineOrType, opts) {
    const w = live();
    if (!w) return start(machineOrType, opts);
    const cur = activeBlock();
    if (cur) closeStation();
    const block = newBlock(machineOrType, opts);
    S().patchLive(x => { x.blocks.push(block); });
    primeSets(block);
    startTracking(block);
    return block;
  }

  /* A strength station opens with the sets you did last time, greyed out as
     targets, so you are not typing the same numbers in every week. */
  function primeSets(block) {
    if (G.Data.type(block.type).kind !== 'sets') return;
    if (!block.machineId) return;
    const last = S().lastOn(block.machineId);
    if (!last || !last.block.sets || !last.block.sets.length) return;
    S().patchLive(x => {
      const b = x.blocks.find(bb => bb.id === block.id);
      if (b) b.suggested = last.block.sets.map(s => ({ weightKg: s.weightKg, reps: s.reps }));
    });
  }

  function closeStation() {
    const b = activeBlock();
    if (!b) return null;
    syncTracking(true);
    learnStride(b);
    G.Track.stop();
    const secs = blockElapsed(b);
    S().patchLive(x => {
      const blk = x.blocks[x.blocks.length - 1];
      blk.pauseStart = null;
      blk.endedAt = Date.now();
      blk.durationSec = secs;
      x.rest = null;
    });
    return b;
  }

  /* Reopen the station just closed — the undo for a mis-tap. */
  /* A session with both sensors running measures your own stride, which is
     what makes the step counter useful later when there is no GPS. */
  function learnStride(b) {
    const snap = G.Track.snapshot();
    const cal = G.Track.calibrate(S().profile(), b.type, snap.gps.distanceM, snap.steps.count);
    if (cal) S().setProfile({ strideCal: cal });
  }

  function reopenStation() {
    const w = live();
    if (!w || !w.blocks.length) return null;
    const b = w.blocks[w.blocks.length - 1];
    if (!b.endedAt) return b;
    S().patchLive(x => {
      const blk = x.blocks[x.blocks.length - 1];
      /* Push the start forward by the gap so the clock picks up where it
         stopped rather than counting the time spent staring at a summary. */
      blk.startedAt += (Date.now() - blk.endedAt);
      blk.endedAt = null;
      blk.durationSec = 0;
    });
    /* Carry on measuring, starting the distance again from what is already
       banked on the block rather than from zero. */
    startTracking(b);
    return b;
  }

  function removeStation(blockId) {
    S().patchLive(x => { x.blocks = x.blocks.filter(b => b.id !== blockId); });
    const w = live();
    if (w && !w.blocks.length) S().clearLive();
  }

  /* ---------------- pause ---------------- */

  function pause() {
    const b = activeBlock();
    if (!b || b.pauseStart) return;
    syncTracking(false);
    G.Track.pause();
    S().patchLive(x => { x.blocks[x.blocks.length - 1].pauseStart = Date.now(); });
  }

  function resume() {
    const b = activeBlock();
    if (!b || !b.pauseStart) return;
    S().patchLive(x => {
      const blk = x.blocks[x.blocks.length - 1];
      blk.pausedMs = (blk.pausedMs || 0) + (Date.now() - blk.pauseStart);
      blk.pauseStart = null;
    });
    G.Track.resume();
  }

  function togglePause() { isPaused() ? resume() : pause(); }

  /* ---------------- taps ----------------

     `resolve` turns a raw tag into a decision. The app does the talking;
     this only works out what the tap means. */

  function resolveTap(tag) {
    const machine = (tag.machineId && S().machine(tag.machineId)) || S().machineByTag(tag.serial);
    if (!machine) return { action: 'unknown', tag };

    const w = live();
    const cur = activeBlock();

    if (!w) return { action: 'start', machine, tag };
    if (cur && cur.machineId === machine.id) return { action: 'close', machine, block: cur, tag };
    if (cur) return { action: 'switch', machine, from: cur, tag };
    return { action: 'open', machine, tag };
  }

  /* Carry out a resolved tap. Returns what happened so the app can show it. */
  function applyTap(decision) {
    switch (decision.action) {
      case 'start':
        start(decision.machine);
        return { did: 'started', machine: decision.machine };
      case 'open':
        openStation(decision.machine);
        return { did: 'opened', machine: decision.machine };
      case 'switch':
        openStation(decision.machine);
        return { did: 'switched', machine: decision.machine, from: decision.from };
      case 'close': {
        const block = closeStation();
        const w = live();
        const soloAndSetToFinish = S().profile().tapOutEnds && w && w.blocks.length === 1;
        if (soloAndSetToFinish) return { did: 'closed', block, suggestFinish: true };
        return { did: 'closed', block, suggestFinish: false };
      }
      default:
        return { did: 'unknown', tag: decision.tag };
    }
  }

  /* ---------------- sets and rest ---------------- */

  function addSet(set) {
    const b = activeBlock();
    if (!b) return null;
    const entry = Object.assign({ weightKg: null, reps: null, rpe: null, at: Date.now() }, set || {});
    S().patchLive(x => {
      const blk = x.blocks[x.blocks.length - 1];
      blk.sets = blk.sets || [];
      blk.sets.push(entry);
    });
    if (S().profile().autoRest) startRest();
    return entry;
  }

  function updateSet(index, patch) {
    S().patchLive(x => {
      const blk = x.blocks[x.blocks.length - 1];
      if (blk && blk.sets && blk.sets[index]) Object.assign(blk.sets[index], patch);
    });
  }

  function removeSet(index) {
    S().patchLive(x => {
      const blk = x.blocks[x.blocks.length - 1];
      if (blk && blk.sets) blk.sets.splice(index, 1);
    });
  }

  /* The last set logged, looking back through earlier stations too, so
     "repeat that" works even after you have moved and come back. */
  function lastSet() {
    const w = live();
    if (!w) return null;
    for (let i = w.blocks.length - 1; i >= 0; i--) {
      const b = w.blocks[i];
      if (b.sets && b.sets.length) return b.sets[b.sets.length - 1];
    }
    return null;
  }

  function restSeconds() {
    const b = activeBlock();
    const m = b && b.machineId ? S().machine(b.machineId) : null;
    if (m && m.restSec > 0) return m.restSec;
    return S().profile().restSec || 90;
  }

  function startRest(seconds) {
    const total = seconds || restSeconds();
    S().patchLive(x => { x.rest = { until: Date.now() + total * 1000, total, rung: false }; });
  }

  function stopRest() { S().patchLive(x => { x.rest = null; }); }

  function addRest(seconds) {
    S().patchLive(x => {
      if (x.rest) x.rest.until += seconds * 1000;
      else x.rest = { until: Date.now() + seconds * 1000, total: seconds, rung: false };
    });
  }

  function restLeft() {
    const w = live();
    if (!w || !w.rest) return null;
    return Math.round((w.rest.until - Date.now()) / 1000);
  }

  /* ---------------- splits ---------------- */

  function lap() {
    const b = activeBlock();
    if (!b) return null;
    const at = blockElapsed(b);
    const prev = (b.splits || []).reduce((s, x) => s + x.sec, 0);
    const entry = { sec: Math.max(1, at - prev), distanceM: null };
    S().patchLive(x => {
      const blk = x.blocks[x.blocks.length - 1];
      blk.splits = blk.splits || [];
      blk.splits.push(entry);
    });
    G.NFC.buzz(30);
    return entry;
  }

  function removeLap(i) {
    S().patchLive(x => {
      const blk = x.blocks[x.blocks.length - 1];
      if (blk && blk.splits) blk.splits.splice(i, 1);
    });
  }

  /* ---------------- editing the live block ---------------- */

  function patchBlock(patch, blockId) {
    S().patchLive(x => {
      const blk = blockId ? x.blocks.find(b => b.id === blockId) : x.blocks[x.blocks.length - 1];
      if (blk) Object.assign(blk, patch);
    });
  }

  function patchWorkout(patch) {
    S().patchLive(x => Object.assign(x, patch));
  }

  /* ---------------- finishing ---------------- */

  function finish(extra) {
    const w = live();
    if (!w) return null;
    if (activeBlock()) closeStation();
    G.Track.stop();

    const done = JSON.parse(JSON.stringify(S().live()));
    Object.assign(done, extra || {});
    done.endedAt = Date.now();
    done.rest = null;
    /* A session that runs past midnight belongs to the day it started. */
    done.date = done.date || U().today();
    done.blocks = (done.blocks || []).filter(b => keepBlock(b));
    done.blocks.forEach(b => {
      delete b.suggested;
      delete b.pauseStart;
      b.durationSec = b.durationSec || 0;
      b.kcal = S().blockKcal(b);
    });

    if (!done.blocks.length) {
      S().clearLive();
      return { workout: null, records: [], empty: true };
    }

    const records = [];
    done.blocks.forEach(b => {
      S().recordsFor(b, done.id).forEach(r => records.push(Object.assign({ block: b }, r)));
    });

    S().saveWorkout(done);
    if (done.planId) S().updatePlan(done.planId, { lastUsed: done.date });
    S().clearLive();
    if (records.length) G.NFC.buzz([40, 60, 40, 60, 120]);
    return { workout: done, records };
  }

  /* Stations with no time and nothing logged are mis-taps, not workouts. */
  function keepBlock(b) {
    const secs = b.durationSec || 0;
    const has = (b.sets && b.sets.length) || (b.distanceM > 0) || (b.steps > 0) || (b.note && b.note.trim());
    return secs >= 20 || !!has;
  }

  function discard() {
    G.Track.stop();
    S().clearLive();
  }

  /* ---------------- plans ---------------- */

  function startPlan(planId) {
    const p = S().plan(planId);
    if (!p || !p.items.length) return null;
    const first = p.items[0];
    const m = first.machineId ? S().machine(first.machineId) : null;
    const w = start(m || first.type, { title: p.name, planId: p.id, name: first.name });
    return w;
  }

  function planStep() {
    const w = live();
    if (!w || !w.planId) return null;
    const p = S().plan(w.planId);
    if (!p) return null;
    const idx = Math.min(w.blocks.length - 1, p.items.length - 1);
    return { plan: p, index: idx, item: p.items[idx], next: p.items[idx + 1] || null, total: p.items.length };
  }

  function nextPlanStation() {
    const step = planStep();
    if (!step || !step.next) return null;
    const m = step.next.machineId ? S().machine(step.next.machineId) : null;
    return openStation(m || step.next.type, { name: step.next.name });
  }

  /* Called on boot: a session survives a reload through storage, but the
     sensors do not, so they are started again from what is banked. */
  function resumeTracking() {
    const b = activeBlock();
    if (!b || b.pauseStart) return null;
    return startTracking(b);
  }

  /* ---------------- screen wake lock ----------------
     A live session with the screen dropping out every 30 seconds is
     useless, so hold a wake lock while one is running and take it back
     after the phone has been in a pocket. */

  let wakeLock = null;

  async function holdScreen() {
    try {
      if (!('wakeLock' in navigator) || wakeLock) return;
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) { wakeLock = null; }
  }

  function releaseScreen() {
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* already gone */ }
    wakeLock = null;
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && live()) holdScreen();
  });

  G.Session = {
    live, activeBlock, lastBlock, blockElapsed, workoutElapsed, isPaused,
    start, openStation, closeStation, reopenStation, removeStation,
    pause, resume, togglePause,
    resolveTap, applyTap,
    addSet, updateSet, removeSet, lastSet, startRest, stopRest, addRest, restLeft, restSeconds,
    lap, removeLap, patchBlock, patchWorkout,
    finish, discard, keepBlock,
    sensorsFor, startTracking, syncTracking, resumeTracking,
    startPlan, planStep, nextPlanStation,
    holdScreen, releaseScreen, newBlock
  };

})(window.TapIn = window.TapIn || {});
