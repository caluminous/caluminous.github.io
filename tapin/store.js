/* Tap In — state, persistence and everything derived from it.
   One localStorage key holds the lot. No network, no accounts. */
(function (G) {
  'use strict';

  const KEY = 'tapin-v1';

  /* ---------------- small utilities ---------------- */

  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => iso(new Date());
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);

  function parseISO(s) {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }

  function shiftDate(isoStr, days) {
    const d = parseISO(isoStr);
    d.setDate(d.getDate() + days);
    return iso(d);
  }

  const dayNumber = s => Math.round(parseISO(s).getTime() / 86400000);

  function friendlyDate(isoStr) {
    const t = today();
    if (isoStr === t) return 'Today';
    if (isoStr === shiftDate(t, -1)) return 'Yesterday';
    const d = parseISO(isoStr);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      year: sameYear ? undefined : 'numeric'
    });
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const round = (n, dp = 0) => { const m = Math.pow(10, dp); return Math.round((n || 0) * m) / m; };
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  function clock(seconds) {
    const s = Math.max(0, Math.round(seconds || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return h > 0
      ? h + ':' + pad(m) + ':' + pad(sec)
      : m + ':' + pad(sec);
  }

  function clockWords(seconds) {
    const s = Math.max(0, Math.round(seconds || 0));
    if (s < 60) return s + 's';
    const h = Math.floor(s / 3600);
    const m = Math.round((s % 3600) / 60);
    if (h && m) return h + 'h ' + m + 'm';
    if (h) return h + 'h';
    return m + 'm';
  }

  /* Monday-start week key, so weekly totals line up with how people plan. */
  function weekStart(isoStr) {
    const d = parseISO(isoStr);
    const dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return iso(d);
  }

  /* ---------------- defaults ---------------- */

  function blankState() {
    return {
      v: 1,
      profile: {
        name: '',
        weightKg: 75,
        heightCm: 175,
        birthYear: null,
        units: 'metric',
        theme: 'dark',
        restSec: 90,
        autoRest: true,
        haptics: true,
        tapOutEnds: true,
        weeklyGoal: 4
      },
      machines: [],
      workouts: [],
      plans: [],
      live: null,          /* the in-progress workout, if any */
      seenNfc: false
    };
  }

  let state = blankState();
  const listeners = [];

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = Object.assign(blankState(), parsed);
        state.profile = Object.assign(blankState().profile, parsed.profile || {});
        state.machines = Array.isArray(parsed.machines) ? parsed.machines : [];
        state.workouts = Array.isArray(parsed.workouts) ? parsed.workouts : [];
        state.plans = Array.isArray(parsed.plans) ? parsed.plans : [];
      }
    } catch (e) {
      /* A corrupt store should not brick the app — start clean instead. */
      state = blankState();
    }
    return state;
  }

  let saveTimer = null;
  function save(immediate) {
    const write = () => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* quota — nothing useful to do */ }
    };
    clearTimeout(saveTimer);
    if (immediate) write(); else saveTimer = setTimeout(write, 200);
  }

  function onChange(fn) { listeners.push(fn); }
  function emit(what) {
    save();
    listeners.forEach(fn => { try { fn(what); } catch (e) { console.error(e); } });
  }

  /* ---------------- profile ---------------- */

  function profile() { return state.profile; }

  function setProfile(patch) {
    Object.assign(state.profile, patch);
    emit('profile');
  }

  function age() {
    const y = state.profile.birthYear;
    return y ? Math.max(10, new Date().getFullYear() - y) : 35;
  }

  /* ---------------- machines ----------------
     A machine is a thing you tap: a specific bike, a specific rower, a
     specific weight stack. Tags are NFC serial numbers bound to it — a
     machine can carry several, because some kit has more than one tag and
     some people stick their own on. */

  function machines() { return state.machines; }

  function machine(id) { return state.machines.find(m => m.id === id) || null; }

  function machineByTag(tagId) {
    if (!tagId) return null;
    return state.machines.find(m => (m.tags || []).includes(tagId)) || null;
  }

  function addMachine(data) {
    const d = Object.assign({}, data || {});
    if (!d.id) delete d.id;
    const m = Object.assign({
      id: uid(),
      name: 'New machine',
      type: 'cycle',
      place: '',
      tags: [],
      defaults: {},
      exercise: '',
      createdAt: Date.now(),
      colour: pickColour()
    }, d);
    state.machines.push(m);
    emit('machines');
    return m;
  }

  function updateMachine(id, patch) {
    const m = machine(id);
    if (!m) return null;
    Object.assign(m, patch);
    emit('machines');
    return m;
  }

  function removeMachine(id) {
    state.machines = state.machines.filter(m => m.id !== id);
    /* Workouts keep their own copy of the name, so history survives the delete. */
    emit('machines');
  }

  function bindTag(machineId, tagId) {
    const m = machine(machineId);
    if (!m || !tagId) return null;
    /* A tag can only point at one machine, so steal it from any other. */
    state.machines.forEach(other => {
      if (other.id !== machineId) other.tags = (other.tags || []).filter(t => t !== tagId);
    });
    m.tags = m.tags || [];
    if (!m.tags.includes(tagId)) m.tags.push(tagId);
    emit('machines');
    return m;
  }

  function unbindTag(machineId, tagId) {
    const m = machine(machineId);
    if (!m) return;
    m.tags = (m.tags || []).filter(t => t !== tagId);
    emit('machines');
  }

  const COLOURS = ['a', 'b', 'c', 'd', 'e', 'f'];
  function pickColour() {
    const counts = {};
    COLOURS.forEach(c => { counts[c] = 0; });
    state.machines.forEach(m => { if (counts[m.colour] != null) counts[m.colour]++; });
    return COLOURS.slice().sort((x, y) => counts[x] - counts[y])[0];
  }

  /* How often a machine gets used, and what happened last time — this is
     what the app shows the instant you tap something. */
  function machineHistory(machineId) {
    const out = [];
    state.workouts.forEach(w => {
      (w.blocks || []).forEach(b => {
        if (b.machineId === machineId) out.push({ workout: w, block: b });
      });
    });
    out.sort((a, b) => (b.workout.date < a.workout.date ? -1 : b.workout.date > a.workout.date ? 1 : (b.block.startedAt || 0) - (a.block.startedAt || 0)));
    return out;
  }

  function lastOn(machineId) {
    const h = machineHistory(machineId);
    return h.length ? h[0] : null;
  }

  /* ---------------- workouts ---------------- */

  function workouts() { return state.workouts; }

  function workout(id) { return state.workouts.find(w => w.id === id) || null; }

  function saveWorkout(w) {
    const i = state.workouts.findIndex(x => x.id === w.id);
    if (i >= 0) state.workouts[i] = w; else state.workouts.push(w);
    state.workouts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.startedAt || 0) - (a.startedAt || 0)));
    emit('workouts');
    return w;
  }

  function removeWorkout(id) {
    state.workouts = state.workouts.filter(w => w.id !== id);
    emit('workouts');
  }

  function workoutsOn(dateIso) {
    return state.workouts.filter(w => w.date === dateIso);
  }

  /* ---------------- live workout ----------------
     Kept in the same store so an accidental refresh, a phone lock or a
     browser tab eviction never loses a session in progress. */

  function live() { return state.live; }

  function setLive(w) {
    state.live = w;
    emit('live');
  }

  function patchLive(fn) {
    if (!state.live) return null;
    fn(state.live);
    emit('live');
    return state.live;
  }

  function clearLive() {
    state.live = null;
    emit('live');
  }

  /* ---------------- plans ---------------- */

  function plans() { return state.plans; }
  function plan(id) { return state.plans.find(p => p.id === id) || null; }

  function addPlan(data) {
    const p = Object.assign({ id: uid(), name: 'New routine', items: [], createdAt: Date.now(), lastUsed: null }, data || {});
    state.plans.push(p);
    emit('plans');
    return p;
  }

  function updatePlan(id, patch) {
    const p = plan(id);
    if (!p) return null;
    Object.assign(p, patch);
    emit('plans');
    return p;
  }

  function removePlan(id) {
    state.plans = state.plans.filter(p => p.id !== id);
    emit('plans');
  }

  /* ---------------- derived: block and workout totals ---------------- */

  function blockDuration(b) {
    if (b.durationSec > 0) return b.durationSec;
    if (b.startedAt && b.endedAt) return Math.round((b.endedAt - b.startedAt) / 1000);
    return 0;
  }

  function blockVolume(b) {
    return (b.sets || []).reduce((sum, s) => sum + (s.weightKg || 0) * (s.reps || 0), 0);
  }

  function blockKcal(b, weightKg) {
    if (b.kcal > 0) return b.kcal;
    return G.Data.kcal(b.type, {
      distanceM: b.distanceM, level: b.level, inclinePct: b.inclinePct,
      watts: b.watts, speedKph: b.speedKph
    }, weightKg || state.profile.weightKg, blockDuration(b));
  }

  function totals(w) {
    const wt = state.profile.weightKg;
    let sec = 0, dist = 0, kc = 0, vol = 0, sets = 0, reps = 0;
    (w.blocks || []).forEach(b => {
      const d = blockDuration(b);
      sec += d;
      dist += b.distanceM || 0;
      kc += blockKcal(b, wt);
      vol += blockVolume(b);
      sets += (b.sets || []).length;
      reps += (b.sets || []).reduce((s, x) => s + (x.reps || 0), 0);
    });
    return { seconds: sec, distanceM: dist, kcal: kc, volumeKg: vol, sets, reps, blocks: (w.blocks || []).length };
  }

  /* Elapsed wall-clock time, which for a circuit is longer than the sum of
     the blocks because it includes everything between stations. */
  function elapsed(w) {
    if (!w.startedAt) return totals(w).seconds;
    const end = w.endedAt || Date.now();
    return Math.max(0, Math.round((end - w.startedAt) / 1000));
  }

  /* ---------------- derived: personal bests ----------------

     Bests are tracked per machine where there is one, and otherwise per
     activity type, because "my best 5 k" means the same thing on any
     treadmill but "my best leg press" does not. */

  function bestKey(b) {
    return b.machineId ? 'm:' + b.machineId : 't:' + b.type + (b.name ? '|' + b.name.toLowerCase() : '');
  }

  /* Every block ever logged, oldest first, tagged with its workout. */
  function allBlocks() {
    const out = [];
    state.workouts.forEach(w => (w.blocks || []).forEach(b => out.push({ w, b })));
    out.sort((x, y) => (x.b.startedAt || dayNumber(x.w.date) * 86400000) - (y.b.startedAt || dayNumber(y.w.date) * 86400000));
    return out;
  }

  /* Which records a block sets, compared against everything logged before it.
     `exclude` skips a workout id, so re-saving an edit does not compete
     against its own earlier version. */
  function recordsFor(block, excludeWorkoutId) {
    const key = bestKey(block);
    const prior = allBlocks().filter(x => x.w.id !== excludeWorkoutId && bestKey(x.b) === key);
    const out = [];
    const dur = blockDuration(block);
    const t = G.Data.type(block.type);

    if (t.kind === 'sets') {
      const heaviest = Math.max(0, ...(block.sets || []).map(s => s.weightKg || 0));
      const bestPriorWeight = Math.max(0, ...prior.map(x => Math.max(0, ...(x.b.sets || []).map(s => s.weightKg || 0))));
      if (heaviest > 0 && heaviest > bestPriorWeight) out.push({ kind: 'weight', label: 'Heaviest set', value: heaviest + ' kg' });

      const e1 = Math.max(0, ...(block.sets || []).map(s => G.Data.oneRepMax(s.weightKg, s.reps)));
      const bestPrior1 = Math.max(0, ...prior.map(x => Math.max(0, ...(x.b.sets || []).map(s => G.Data.oneRepMax(s.weightKg, s.reps)))));
      if (e1 > 0 && e1 > bestPrior1 + 0.01) out.push({ kind: 'e1rm', label: 'Estimated 1RM', value: round(e1, 1) + ' kg' });

      const vol = blockVolume(block);
      const bestPriorVol = Math.max(0, ...prior.map(x => blockVolume(x.b)));
      if (vol > 0 && vol > bestPriorVol) out.push({ kind: 'volume', label: 'Most volume', value: Math.round(vol) + ' kg' });
    } else {
      if (block.distanceM > 0) {
        const bestPriorDist = Math.max(0, ...prior.map(x => x.b.distanceM || 0));
        if (block.distanceM > bestPriorDist) out.push({ kind: 'distance', label: 'Furthest', value: distLabel(block.distanceM, block.type) });
      }
      if (dur > 0) {
        const bestPriorDur = Math.max(0, ...prior.map(x => blockDuration(x.b)));
        if (dur > bestPriorDur) out.push({ kind: 'duration', label: 'Longest', value: clock(dur) });
      }
      /* Pace only counts as a record over a comparable distance — beating
         your 5 k pace over 400 m is not a record. */
      if (block.distanceM >= 400 && dur > 0) {
        const p = G.Data.paceSeconds(block.type, block.distanceM, dur);
        const comparable = prior.filter(x => (x.b.distanceM || 0) >= block.distanceM * 0.8 && blockDuration(x.b) > 0);
        const bestPriorPace = comparable.length
          ? Math.min(...comparable.map(x => G.Data.paceSeconds(x.b.type, x.b.distanceM, blockDuration(x.b))))
          : Infinity;
        if (p > 0 && p < bestPriorPace) out.push({ kind: 'pace', label: 'Best pace', value: G.Data.paceLabel(block.type, block.distanceM, dur) });
      }
    }
    return out;
  }

  /* The standing record board, for the stats screen. */
  function records() {
    const groups = {};
    allBlocks().forEach(({ w, b }) => {
      const key = bestKey(b);
      const t = G.Data.type(b.type);
      const m = b.machineId ? machine(b.machineId) : null;
      if (!groups[key]) {
        groups[key] = {
          key,
          name: (m && m.name) || b.name || t.name,
          type: b.type,
          kind: t.kind,
          count: 0,
          best: {}
        };
      }
      const g = groups[key];
      g.count++;
      const dur = blockDuration(b);
      const put = (field, value, label, date) => {
        if (!(value > 0)) return;
        const cur = g.best[field];
        const better = field === 'pace' ? (!cur || value < cur.value) : (!cur || value > cur.value);
        if (better) g.best[field] = { value, label, date };
      };
      if (t.kind === 'sets') {
        put('weight', Math.max(0, ...(b.sets || []).map(s => s.weightKg || 0)), null, w.date);
        put('e1rm', Math.max(0, ...(b.sets || []).map(s => G.Data.oneRepMax(s.weightKg, s.reps))), null, w.date);
        put('volume', blockVolume(b), null, w.date);
        put('reps', Math.max(0, ...(b.sets || []).map(s => s.reps || 0)), null, w.date);
      } else {
        put('distance', b.distanceM || 0, null, w.date);
        put('duration', dur, null, w.date);
        if ((b.distanceM || 0) >= 400 && dur > 0) put('pace', G.Data.paceSeconds(b.type, b.distanceM, dur), null, w.date);
      }
    });
    return Object.keys(groups).map(k => groups[k]).sort((a, b) => b.count - a.count);
  }

  /* ---------------- derived: streaks and weekly totals ---------------- */

  function activeDays() {
    const set = {};
    state.workouts.forEach(w => { set[w.date] = true; });
    return Object.keys(set).sort();
  }

  function streak() {
    const days = activeDays();
    if (!days.length) return { current: 0, best: 0 };
    const set = {};
    days.forEach(d => { set[d] = true; });

    let current = 0;
    let cursor = today();
    /* Today not being trained yet should not break a streak that is still
       alive — start counting from yesterday in that case. */
    if (!set[cursor]) cursor = shiftDate(cursor, -1);
    while (set[cursor]) { current++; cursor = shiftDate(cursor, -1); }

    let best = 0, run = 0, prev = null;
    days.forEach(d => {
      run = (prev && dayNumber(d) - dayNumber(prev) === 1) ? run + 1 : 1;
      best = Math.max(best, run);
      prev = d;
    });
    return { current, best };
  }

  function weekSummary(weekStartIso) {
    const start = weekStartIso || weekStart(today());
    const end = shiftDate(start, 6);
    const list = state.workouts.filter(w => w.date >= start && w.date <= end);
    let sec = 0, dist = 0, kc = 0, vol = 0;
    const days = {};
    list.forEach(w => {
      const t = totals(w);
      sec += t.seconds; dist += t.distanceM; kc += t.kcal; vol += t.volumeKg;
      days[w.date] = (days[w.date] || 0) + t.seconds;
    });
    return {
      start, end, count: list.length, sessions: list,
      seconds: sec, distanceM: dist, kcal: kc, volumeKg: vol,
      dayCount: Object.keys(days).length, days
    };
  }

  /* Minutes per muscle group over a window — shows what is being neglected. */
  function muscleCoverage(days) {
    const from = shiftDate(today(), -(days || 7) + 1);
    const out = {};
    G.Data.MUSCLES.forEach(m => { out[m.id] = { sets: 0, volumeKg: 0 }; });
    state.workouts.filter(w => w.date >= from).forEach(w => {
      (w.blocks || []).forEach(b => {
        if (G.Data.type(b.type).kind !== 'sets') return;
        const mus = b.muscle || G.Data.muscleFor(b.name) || G.Data.muscleFor((machine(b.machineId) || {}).exercise);
        if (!mus || !out[mus]) return;
        out[mus].sets += (b.sets || []).length;
        out[mus].volumeKg += blockVolume(b);
      });
    });
    return out;
  }

  /* Rolling totals per activity type, for the trend charts. */
  function typeTotals(days) {
    const from = shiftDate(today(), -(days || 30) + 1);
    const out = {};
    state.workouts.filter(w => w.date >= from).forEach(w => {
      (w.blocks || []).forEach(b => {
        const t = out[b.type] || (out[b.type] = { seconds: 0, distanceM: 0, kcal: 0, count: 0 });
        t.seconds += blockDuration(b);
        t.distanceM += b.distanceM || 0;
        t.kcal += blockKcal(b);
        t.count++;
      });
    });
    return out;
  }

  /* ---------------- units ---------------- */

  function metric() { return state.profile.units !== 'imperial'; }

  /* Two decimals on a 5 k is useful; two decimals on a season's mileage is
     just a number too wide for the tile it sits in. */
  function bigDp(v) { return v >= 1000 ? 0 : v >= 100 ? 1 : 2; }

  function distLabel(metres, typeId) {
    const m = metres || 0;
    const style = typeId ? G.Data.type(typeId).unit : 'km';
    if (metric()) {
      if (style === 'm' && m < 10000) return Math.round(m) + ' m';
      if (m < 1000) return Math.round(m) + ' m';
      const km = m / 1000;
      return round(km, bigDp(km)) + ' km';
    }
    if (style === 'm' && m < 10000) return Math.round(m * 1.09361) + ' yd';
    const miles = m / 1609.344;
    if (miles < 0.1) return Math.round(m * 1.09361) + ' yd';
    return round(miles, bigDp(miles)) + ' mi';
  }

  function weightLabel(kg) {
    if (metric()) return round(kg || 0, 1) + ' kg';
    return round((kg || 0) * 2.20462, 1) + ' lb';
  }

  /* ---------------- import / export ---------------- */

  function exportJson() {
    return JSON.stringify({
      app: 'Tap In', exported: new Date().toISOString(),
      profile: state.profile, machines: state.machines,
      workouts: state.workouts, plans: state.plans
    }, null, 2);
  }

  function exportCsv() {
    const rows = [['date', 'workout', 'station', 'type', 'machine', 'duration_s', 'distance_m', 'kcal', 'sets', 'volume_kg', 'note']];
    state.workouts.slice().reverse().forEach(w => {
      (w.blocks || []).forEach((b, i) => {
        rows.push([
          w.date, w.title || '', String(i + 1), b.type,
          (machine(b.machineId) || {}).name || b.name || '',
          blockDuration(b), Math.round(b.distanceM || 0), blockKcal(b),
          (b.sets || []).length, Math.round(blockVolume(b)), (b.note || '').replace(/[\r\n]+/g, ' ')
        ]);
      });
    });
    return rows.map(r => r.map(c => {
      const s = String(c == null ? '' : c);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')).join('\n');
  }

  function importJson(text) {
    const data = JSON.parse(text);
    if (!data || (!data.workouts && !data.machines)) throw new Error('Not a Tap In backup');
    state.profile = Object.assign(blankState().profile, data.profile || {});
    state.machines = Array.isArray(data.machines) ? data.machines : [];
    state.workouts = Array.isArray(data.workouts) ? data.workouts : [];
    state.plans = Array.isArray(data.plans) ? data.plans : [];
    state.live = null;
    emit('import');
    return { machines: state.machines.length, workouts: state.workouts.length };
  }

  function wipe() {
    state = blankState();
    save(true);
    emit('wipe');
  }

  G.Store = {
    load, save, onChange, emit, raw: () => state,
    profile, setProfile, age, metric, distLabel, weightLabel,
    machines, machine, machineByTag, addMachine, updateMachine, removeMachine,
    bindTag, unbindTag, machineHistory, lastOn,
    workouts, workout, saveWorkout, removeWorkout, workoutsOn,
    live, setLive, patchLive, clearLive,
    plans, plan, addPlan, updatePlan, removePlan,
    blockDuration, blockVolume, blockKcal, totals, elapsed,
    recordsFor, records, allBlocks, streak, weekSummary, muscleCoverage, typeTotals,
    exportJson, exportCsv, importJson, wipe
  };

  G.Util = {
    uid, iso, today, parseISO, shiftDate, dayNumber, friendlyDate, weekStart,
    esc, round, clamp, clock, clockWords, pad
  };

})(window.TapIn = window.TapIn || {});
