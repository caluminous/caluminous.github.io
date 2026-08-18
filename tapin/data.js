/* Tap In — the catalogue: machine types, effort maths, exercise list.
   Everything here is static reference data plus pure functions over it. */
(function (G) {
  'use strict';

  /* ---------------- machine / activity types ----------------

     `kind` decides which live screen you get:
       'distance' — a cardio machine you cover ground on (bike, treadmill, rower)
       'effort'   — cardio with no meaningful distance (stair climber, class)
       'sets'     — anything logged as sets of reps
     `fields` are the extra numbers the finish screen asks for, in order.
     `met` returns a metabolic equivalent for the effort described, which is
     what the calorie estimate is built on. */

  const TYPES = [
    {
      id: 'cycle', name: 'Indoor bike', short: 'Bike', kind: 'distance', group: 'cardio',
      unit: 'km', fields: ['distance', 'level', 'watts', 'cadence'],
      hint: 'Upright or recumbent studio bike',
      /* Cycling is the one case where kilojoules of work and kilocalories of
         food come out near enough equal: gross efficiency sits around 24%,
         and 1 kcal is 4.184 kJ, so the two corrections cancel. */
      kcalFn: v => (v.watts > 0 ? v.watts * v.durationSec / 1000 : 0),
      met: v => {
        if (v.watts > 0) return clamp(v.watts * 0.0128 + 1.2, 3, 20);
        const s = v.speedKph || 0;
        const base = s > 0 ? clamp(0.0035 * s * s + 0.28 * s + 1.4, 3, 16) : 6.8;
        return clamp(base + (v.level || 0) * 0.18, 3, 18);
      }
    },
    {
      id: 'treadmill', name: 'Treadmill', short: 'Tread', kind: 'distance', group: 'cardio', steps: true,
      unit: 'km', fields: ['distance', 'incline', 'speed'],
      hint: 'Running or walking indoors',
      met: v => acsmMet(v.speedKph || 0, (v.inclinePct || 0) / 100)
    },
    {
      id: 'rower', name: 'Rower', short: 'Row', kind: 'distance', group: 'cardio',
      unit: 'm', fields: ['distance', 'damper', 'strokeRate'],
      hint: 'Concept2 and friends',
      met: () => 7,
      kcalFn: (v, wt, secs) => ergKcal(v.distanceM, secs, wt)
    },
    {
      id: 'elliptical', name: 'Cross-trainer', short: 'Cross', kind: 'distance', group: 'cardio', steps: true,
      unit: 'km', fields: ['distance', 'level', 'resistance'],
      hint: 'Elliptical / arc trainer',
      met: v => clamp(4.8 + (v.level || 0) * 0.32 + (v.speedKph || 0) * 0.25, 3.5, 15)
    },
    {
      id: 'stair', name: 'Stair climber', short: 'Stairs', kind: 'effort', group: 'cardio', steps: true,
      unit: 'floors', fields: ['floors', 'level'],
      hint: 'Stepmill or step machine',
      met: v => clamp(7 + (v.level || 0) * 0.28, 4, 16)
    },
    {
      id: 'airbike', name: 'Air bike', short: 'Air', kind: 'distance', group: 'cardio',
      unit: 'cal', fields: ['calories', 'distance'],
      hint: 'Assault / Echo fan bike',
      met: v => clamp(9 + (v.speedKph || 0) * 0.2, 5, 20)
    },
    {
      id: 'skierg', name: 'Ski erg', short: 'Ski', kind: 'distance', group: 'cardio',
      unit: 'm', fields: ['distance', 'damper'],
      met: () => 7,
      kcalFn: (v, wt, secs) => ergKcal(v.distanceM, secs, wt)
    },
    {
      id: 'run', name: 'Run', short: 'Run', kind: 'distance', group: 'cardio', outdoor: true, gps: true, steps: true,
      unit: 'km', fields: ['distance', 'incline'],
      met: v => acsmMet(v.speedKph || 0, (v.inclinePct || 0) / 100)
    },
    {
      id: 'ride', name: 'Ride', short: 'Ride', kind: 'distance', group: 'cardio', outdoor: true, gps: true,
      unit: 'km', fields: ['distance'],
      met: v => clamp(0.0035 * sq(v.speedKph || 0) + 0.28 * (v.speedKph || 0) + 1.4, 3, 16)
    },
    {
      id: 'walk', name: 'Walk', short: 'Walk', kind: 'distance', group: 'cardio', outdoor: true, gps: true, steps: true,
      unit: 'km', fields: ['distance', 'incline'],
      met: v => acsmMet(v.speedKph || 0, (v.inclinePct || 0) / 100)
    },
    {
      id: 'swim', name: 'Swim', short: 'Swim', kind: 'distance', group: 'cardio', outdoor: true, gps: true,
      unit: 'm', fields: ['distance'],
      met: v => clamp(5 + (v.speedKph || 0) * 1.8, 4, 14)
    },
    {
      id: 'strength', name: 'Weight machine', short: 'Machine', kind: 'sets', group: 'strength',
      unit: 'kg', fields: ['seat'],
      hint: 'Selectorised stack — leg press, lat pulldown…',
      met: () => 5
    },
    {
      id: 'freeweight', name: 'Free weights', short: 'Weights', kind: 'sets', group: 'strength',
      unit: 'kg', fields: [],
      hint: 'Barbell, dumbbell, kettlebell',
      met: () => 5.5
    },
    {
      id: 'cable', name: 'Cable machine', short: 'Cable', kind: 'sets', group: 'strength',
      unit: 'kg', fields: ['seat'],
      met: () => 4.5
    },
    {
      id: 'bodyweight', name: 'Bodyweight', short: 'Body', kind: 'sets', group: 'strength',
      unit: 'reps', fields: [],
      hint: 'Pull-ups, dips, press-ups',
      met: () => 4.5
    },
    {
      id: 'class', name: 'Class', short: 'Class', kind: 'effort', group: 'other',
      unit: 'min', fields: [],
      hint: 'Spin, HIIT, yoga, anything led',
      met: () => 7
    },
    {
      id: 'other', name: 'Other', short: 'Other', kind: 'effort', group: 'other', steps: true,
      unit: 'min', fields: [],
      met: () => 5
    }
  ];

  const TYPE_BY_ID = {};
  TYPES.forEach(t => { TYPE_BY_ID[t.id] = t; });

  function type(id) { return TYPE_BY_ID[id] || TYPE_BY_ID.other; }

  /* ---------------- effort maths ---------------- */

  function sq(n) { return n * n; }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  /* ACSM walking / running oxygen-cost equations, converted to METs.
     Below 7 km/h people walk, above it they run, and the two equations differ. */
  function acsmMet(speedKph, grade) {
    if (speedKph <= 0) return 2;
    const mPerMin = speedKph * 1000 / 60;
    const g = clamp(grade || 0, -0.2, 0.4);
    const vo2 = speedKph < 7
      ? 0.1 * mPerMin + 1.8 * mPerMin * g + 3.5
      : 0.2 * mPerMin + 0.9 * mPerMin * g + 3.5;
    return clamp(vo2 / 3.5, 1.5, 23);
  }

  /* Concept2's published relationship between pace and watts:
     watts = 2.80 / pace³, where pace is seconds per metre. */
  function ergWatts(distanceM, durationSec) {
    if (!(distanceM > 0) || !(durationSec > 0)) return 0;
    const pace = durationSec / distanceM;
    return 2.8 / (pace * pace * pace);
  }

  /* Concept2's own energy figure: 4 kcal per hour per watt of work, on top
     of what the body burns just being alive. The work term is the same
     whatever you weigh; only the resting term scales with body mass, and
     C2's published constant assumes a 79.4 kg rower. */
  function ergKcal(distanceM, seconds, weightKg) {
    const w = ergWatts(distanceM, seconds);
    if (!(w > 0)) return 0;
    return (4 * w + 300 * ((weightKg || 75) / 79.4)) * (seconds / 3600);
  }

  /* Calories burnt. Where a machine measures the work directly — an erg, a
     power meter — that measurement wins; otherwise it comes from METs, body
     mass and time, one MET being roughly 1 kcal per kg per hour. */
  function kcal(typeId, v, weightKg, seconds) {
    if (!(seconds > 0)) return 0;
    const t = type(typeId);
    const wt = weightKg || 75;
    const vals = Object.assign({}, v);
    if (vals.distanceM > 0 && seconds > 0 && !vals.speedKph) {
      vals.speedKph = (vals.distanceM / 1000) / (seconds / 3600);
    }
    vals.durationSec = seconds;

    if (t.kcalFn) {
      const direct = t.kcalFn(vals, wt, seconds);
      if (direct > 0) return Math.round(direct);
    }
    const met = t.met(vals) || 5;
    return Math.round(met * wt * (seconds / 3600));
  }

  /* ---------------- pace and speed ---------------- */

  function speedKph(distanceM, seconds) {
    if (!(distanceM > 0) || !(seconds > 0)) return 0;
    return (distanceM / 1000) / (seconds / 3600);
  }

  /* The unit people actually talk in differs by machine: runners think in
     minutes per kilometre, rowers in a 500 m split, cyclists in km/h. */
  function paceStyle(typeId) {
    if (typeId === 'rower' || typeId === 'skierg') return 'split500';
    if (typeId === 'swim') return 'per100';
    if (typeId === 'run' || typeId === 'treadmill' || typeId === 'walk') return 'perKm';
    return 'kph';
  }

  function paceLabel(typeId, distanceM, seconds) {
    const style = paceStyle(typeId);
    if (!(distanceM > 0) || !(seconds > 0)) return '—';
    if (style === 'kph') return speedKph(distanceM, seconds).toFixed(1) + ' km/h';
    const per = style === 'split500' ? 500 : style === 'per100' ? 100 : 1000;
    const secs = seconds / distanceM * per;
    return clockShort(secs) + (style === 'split500' ? ' /500m' : style === 'per100' ? ' /100m' : ' /km');
  }

  function paceSeconds(typeId, distanceM, seconds) {
    if (!(distanceM > 0) || !(seconds > 0)) return 0;
    const style = paceStyle(typeId);
    const per = style === 'split500' ? 500 : style === 'per100' ? 100 : 1000;
    return seconds / distanceM * per;
  }

  /* The same pace value, rendered in whatever unit the activity is spoken
     in. `secs` is what paceSeconds returns: seconds per 1000 m, per 500 m
     or per 100 m depending on the style. */
  function paceLabelFromSeconds(typeId, secs) {
    if (!(secs > 0)) return '—';
    const style = paceStyle(typeId);
    if (style === 'kph') return (3600 / secs).toFixed(1) + ' km/h';
    if (style === 'split500') return clockShort(secs) + ' /500m';
    if (style === 'per100') return clockShort(secs) + ' /100m';
    return clockShort(secs) + ' /km';
  }

  function clockShort(secs) {
    const s = Math.max(0, Math.round(secs));
    const m = Math.floor(s / 60);
    return m + ':' + String(s % 60).padStart(2, '0');
  }

  /* ---------------- heart-rate zones ---------------- */

  const ZONES = [
    { n: 1, name: 'Recovery', lo: 0.50, hi: 0.60, colour: 'z1' },
    { n: 2, name: 'Easy',     lo: 0.60, hi: 0.70, colour: 'z2' },
    { n: 3, name: 'Steady',   lo: 0.70, hi: 0.80, colour: 'z3' },
    { n: 4, name: 'Hard',     lo: 0.80, hi: 0.90, colour: 'z4' },
    { n: 5, name: 'Max',      lo: 0.90, hi: 1.01, colour: 'z5' }
  ];

  function maxHr(age) { return Math.round(211 - 0.64 * (age || 35)); }

  function zoneFor(hr, age) {
    if (!(hr > 0)) return null;
    const pct = hr / maxHr(age);
    return ZONES.find(z => pct >= z.lo && pct < z.hi) || ZONES[ZONES.length - 1];
  }

  /* ---------------- strength exercises ----------------
     Used for suggestions and for the muscle-coverage view. */

  const EXERCISES = [
    ['Bench press', 'chest', 'freeweight'],
    ['Incline bench press', 'chest', 'freeweight'],
    ['Dumbbell press', 'chest', 'freeweight'],
    ['Chest press', 'chest', 'strength'],
    ['Pec deck', 'chest', 'strength'],
    ['Cable fly', 'chest', 'cable'],
    ['Press-up', 'chest', 'bodyweight'],
    ['Dip', 'chest', 'bodyweight'],
    ['Pull-up', 'back', 'bodyweight'],
    ['Chin-up', 'back', 'bodyweight'],
    ['Lat pulldown', 'back', 'strength'],
    ['Seated row', 'back', 'strength'],
    ['Bent-over row', 'back', 'freeweight'],
    ['Dumbbell row', 'back', 'freeweight'],
    ['T-bar row', 'back', 'freeweight'],
    ['Cable row', 'back', 'cable'],
    ['Face pull', 'back', 'cable'],
    ['Deadlift', 'back', 'freeweight'],
    ['Romanian deadlift', 'hamstrings', 'freeweight'],
    ['Back squat', 'quads', 'freeweight'],
    ['Front squat', 'quads', 'freeweight'],
    ['Goblet squat', 'quads', 'freeweight'],
    ['Leg press', 'quads', 'strength'],
    ['Hack squat', 'quads', 'strength'],
    ['Leg extension', 'quads', 'strength'],
    ['Bulgarian split squat', 'quads', 'freeweight'],
    ['Lunge', 'quads', 'freeweight'],
    ['Leg curl', 'hamstrings', 'strength'],
    ['Hip thrust', 'glutes', 'freeweight'],
    ['Glute bridge', 'glutes', 'bodyweight'],
    ['Cable kickback', 'glutes', 'cable'],
    ['Hip abduction', 'glutes', 'strength'],
    ['Calf raise', 'calves', 'strength'],
    ['Seated calf raise', 'calves', 'strength'],
    ['Overhead press', 'shoulders', 'freeweight'],
    ['Shoulder press', 'shoulders', 'strength'],
    ['Arnold press', 'shoulders', 'freeweight'],
    ['Lateral raise', 'shoulders', 'freeweight'],
    ['Front raise', 'shoulders', 'freeweight'],
    ['Rear delt fly', 'shoulders', 'strength'],
    ['Upright row', 'shoulders', 'freeweight'],
    ['Shrug', 'shoulders', 'freeweight'],
    ['Bicep curl', 'arms', 'freeweight'],
    ['Hammer curl', 'arms', 'freeweight'],
    ['Preacher curl', 'arms', 'strength'],
    ['Cable curl', 'arms', 'cable'],
    ['Tricep pushdown', 'arms', 'cable'],
    ['Skull crusher', 'arms', 'freeweight'],
    ['Overhead tricep extension', 'arms', 'freeweight'],
    ['Close-grip bench press', 'arms', 'freeweight'],
    ['Plank', 'core', 'bodyweight'],
    ['Hanging leg raise', 'core', 'bodyweight'],
    ['Cable crunch', 'core', 'cable'],
    ['Ab machine', 'core', 'strength'],
    ['Russian twist', 'core', 'bodyweight'],
    ['Back extension', 'core', 'bodyweight'],
    ['Farmer carry', 'core', 'freeweight'],
    ['Kettlebell swing', 'glutes', 'freeweight'],
    ['Clean', 'back', 'freeweight'],
    ['Snatch', 'back', 'freeweight'],
    ['Thruster', 'quads', 'freeweight'],
    ['Burpee', 'core', 'bodyweight'],
    ['Box jump', 'quads', 'bodyweight'],
    ['Sit-up', 'core', 'bodyweight'],
    ['Wall ball', 'quads', 'freeweight']
  ].map(([name, muscle, type]) => ({ name, muscle, type }));

  const MUSCLES = [
    { id: 'chest', name: 'Chest' },
    { id: 'back', name: 'Back' },
    { id: 'shoulders', name: 'Shoulders' },
    { id: 'arms', name: 'Arms' },
    { id: 'quads', name: 'Quads' },
    { id: 'hamstrings', name: 'Hamstrings' },
    { id: 'glutes', name: 'Glutes' },
    { id: 'calves', name: 'Calves' },
    { id: 'core', name: 'Core' }
  ];

  function muscleFor(name) {
    if (!name) return null;
    const n = String(name).toLowerCase().trim();
    let best = null;
    EXERCISES.forEach(e => {
      const en = e.name.toLowerCase();
      if (n === en) { best = e.muscle; return; }
      if (!best && (n.includes(en) || en.includes(n)) && Math.abs(en.length - n.length) < 12) best = e.muscle;
    });
    return best;
  }

  function suggestExercises(query, typeId) {
    const q = String(query || '').toLowerCase().trim();
    let list = EXERCISES.slice();
    if (typeId) list.sort((a, b) => (b.type === typeId) - (a.type === typeId));
    if (!q) return list.slice(0, 12);
    return list.filter(e => e.name.toLowerCase().includes(q)).slice(0, 12);
  }

  /* One-rep max, Epley. Used to compare sets of different weights and reps. */
  function oneRepMax(weightKg, reps) {
    if (!(weightKg > 0) || !(reps > 0)) return 0;
    if (reps === 1) return weightKg;
    return weightKg * (1 + reps / 30);
  }

  /* ---------------- icons ----------------
     Stroke-only glyphs, one per type, drawn on a 24×24 grid. */

  const ICONS = {
    cycle: '<circle cx="5.5" cy="17.5" r="3.5"></circle><circle cx="18.5" cy="17.5" r="3.5"></circle><path d="M5.5 17.5l4-8h5M14.5 9.5l4 8M12 17.5l3-8M9 6h3"></path>',
    treadmill: '<path d="M3 19h13a4 4 0 0 0 4-4V5M3 19v-2M20 19h1M6.5 15l2-4 3 1 2-3"></path><circle cx="16" cy="5.5" r="1.6"></circle>',
    rower: '<path d="M3 6l7 5M3 18l7-5M10 11h11M10 13h4"></path><circle cx="10.5" cy="12" r="1.6"></circle>',
    elliptical: '<ellipse cx="12" cy="16.5" rx="8" ry="3.5"></ellipse><path d="M8 16.5l3-7h4l2 4"></path><circle cx="15" cy="6.5" r="1.7"></circle>',
    stair: '<path d="M3 21h4v-5h5v-5h5V6h4"></path><path d="M3 21V9"></path>',
    airbike: '<circle cx="12" cy="9" r="5.5"></circle><path d="M12 3.5v11M6.5 9h11M8 5.5l8 7M16 5.5l-8 7M8 21h8M12 14.5V21"></path>',
    skierg: '<path d="M5 4h14M12 4v6M8 21l4-11 4 11"></path><circle cx="12" cy="10.5" r="1.5"></circle>',
    run: '<circle cx="14" cy="4.5" r="2"></circle><path d="M6 21l3-5 3-2-1-4-3 2-2 3M12 10l3 3 1 5M15 13l4-1"></path>',
    ride: '<circle cx="5.5" cy="17.5" r="3.5"></circle><circle cx="18.5" cy="17.5" r="3.5"></circle><path d="M5.5 17.5l4-8h5M14.5 9.5l4 8M12 17.5l3-8"></path>',
    walk: '<circle cx="13" cy="4.5" r="2"></circle><path d="M8 21l3-6 2-3-1-4-3 2-1 3M13 12l3 3v6"></path>',
    swim: '<path d="M3 17c2 0 2 1.5 4 1.5S9 17 11 17s2 1.5 4 1.5S17 17 19 17M4 12l6-3 4 3"></path><circle cx="17" cy="7" r="2"></circle>',
    strength: '<path d="M4 8v8M8 6v12M16 6v12M20 8v8M8 12h8"></path>',
    freeweight: '<path d="M3 9v6M6.5 7v10M17.5 7v10M21 9v6M6.5 12h11"></path>',
    cable: '<path d="M5 3v6a4 4 0 0 0 4 4h6M15 10l4 3-4 3M5 21h6"></path>',
    bodyweight: '<circle cx="12" cy="4.5" r="2"></circle><path d="M12 7v7M12 14l-3 7M12 14l3 7M6 10l6-2 6 2"></path>',
    'class': '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 7v5l3 2"></path>',
    other: '<circle cx="12" cy="12" r="8.5"></circle><path d="M12 8v4M12 16h.01"></path>'
  };

  function icon(typeId, size) {
    const s = size || 22;
    return '<svg class="ticon" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" aria-hidden="true">' +
      (ICONS[typeId] || ICONS.other) + '</svg>';
  }

  G.Data = {
    TYPES, ZONES, MUSCLES, EXERCISES,
    type, icon, kcal, ergWatts, ergKcal, acsmMet,
    speedKph, paceLabel, paceSeconds, paceLabelFromSeconds, paceStyle, clockShort,
    maxHr, zoneFor, muscleFor, suggestExercises, oneRepMax
  };

})(window.TapIn = window.TapIn || {});
