/* Fuel — state, persistence and the derived-totals layer. */
(function (G) {
  'use strict';

  const KEY = 'fuel-tracker-v1';

  /* Meals are user-defined: these are only the starting set. Food entries store
     the meal's id, so renaming a meal never touches already-logged food. */
  const DEFAULT_MEALS = [
    { id: 'breakfast', name: 'Breakfast' },
    { id: 'lunch',     name: 'Lunch' },
    { id: 'dinner',    name: 'Dinner' },
    { id: 'snacks',    name: 'Snacks' }
  ];

  /* `mealId` ties a reminder to a meal, so it stays quiet once that meal is
     already in the diary. It points at a default meal that the user may later
     rename or delete — consumers must tolerate it going missing. */
  const DEFAULT_REMINDERS = [
    { id: 'r-weigh',  label: 'Morning weigh-in',   time: '07:30', enabled: false },
    { id: 'r-bfast',  label: 'Log your breakfast', time: '09:00', enabled: false, mealId: 'breakfast' },
    { id: 'r-lunch',  label: 'Log your lunch',     time: '13:30', enabled: false, mealId: 'lunch' },
    { id: 'r-water',  label: 'Drink some water',   time: '15:30', enabled: false },
    { id: 'r-dinner', label: 'Log your dinner',    time: '19:30', enabled: false, mealId: 'dinner' },
    { id: 'r-check',  label: 'Check your day',     time: '21:00', enabled: false }
  ];

  /* ---------------- utilities ---------------- */

  const pad = n => String(n).padStart(2, '0');
  const iso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => iso(new Date());

  function parseISO(s) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  /* Days since epoch — used for trend maths, avoids timezone drift. */
  const dayNumber = s => Math.round(parseISO(s).getTime() / 86400000);

  function shiftDate(isoStr, days) {
    const d = parseISO(isoStr);
    d.setDate(d.getDate() + days);
    return iso(d);
  }

  function friendlyDate(isoStr) {
    const t = today();
    if (isoStr === t) return 'Today';
    if (isoStr === shiftDate(t, -1)) return 'Yesterday';
    if (isoStr === shiftDate(t, 1)) return 'Tomorrow';
    const d = parseISO(isoStr);
    const sameYear = d.getFullYear() === new Date().getFullYear();
    return d.toLocaleDateString('en-GB', {
      weekday: 'short', day: 'numeric', month: 'short',
      year: sameYear ? undefined : 'numeric'
    });
  }

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const round = (n, dp = 0) => { const m = Math.pow(10, dp); return Math.round((n || 0) * m) / m; };
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  G.Util = { pad, iso, today, parseISO, dayNumber, shiftDate, friendlyDate, uid, round, clamp, esc };

  /* ---------------- defaults ---------------- */

  function defaultState() {
    return {
      v: 1,
      created: today(),
      profile: {
        sex: 'male',
        age: 25,
        heightCm: 178,
        activity: 1.375,
        goalType: 'lose',
        rateKgWeek: 0.5,
        goalWeightKg: null,
        calorieMode: 'auto',
        manualCalories: 2200,
        proteinMode: 'gkg',
        proteinGkg: 1.8,
        manualProtein: 150,
        proteinPercent: 30,
        fatPercent: 27,
        trackMacros: true,
        waterGoalMl: 2500,
        stepGoal: 8000,
        addExerciseCalories: true,
        units: { weight: 'kg', height: 'cm' },
        theme: 'dark',
        onboarded: false,
        meals: DEFAULT_MEALS.map(m => Object.assign({}, m)),
        reminders: DEFAULT_REMINDERS.map(r => Object.assign({}, r)),
        notificationsOn: false
      },
      days: {},
      weights: [],
      customFoods: [],
      recipes: [],
      favourites: [],
      recents: []
    };
  }

  /* ---------------- load / save ---------------- */

  let state = defaultState();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        state = migrate(parsed);
      }
    } catch (err) {
      console.warn('Could not read saved data, starting fresh.', err);
    }
    return state;
  }

  /* Merge saved data over the defaults so fields added in later versions appear
     for people who already have data. Everything copies into fresh objects —
     assigning onto `base` directly would replace the defaults before they are
     read, and newly added fields would silently never arrive. */
  function migrate(saved) {
    const base = defaultState();
    const savedProfile = (saved && saved.profile) || {};

    const profile = Object.assign({}, base.profile, savedProfile);
    profile.units = Object.assign({}, base.profile.units, savedProfile.units || {});

    const merged = Object.assign({}, base, saved, { profile });

    /* Meals and reminders arrived after the first release; rebuild them from the
       defaults for anyone whose save predates them. */
    if (!Array.isArray(profile.meals) || !profile.meals.length) {
      profile.meals = DEFAULT_MEALS.map(m => Object.assign({}, m));
    }
    profile.meals = profile.meals
      .filter(m => m && m.id)
      .map(m => ({ id: String(m.id), name: String(m.name || 'Meal') }));

    if (!Array.isArray(profile.reminders)) {
      profile.reminders = DEFAULT_REMINDERS.map(r => Object.assign({}, r));
    }

    if (!merged.days || typeof merged.days !== 'object' || Array.isArray(merged.days)) {
      merged.days = {};
    }
    for (const k of ['weights', 'customFoods', 'recipes', 'favourites', 'recents']) {
      if (!Array.isArray(merged[k])) merged[k] = [];
    }
    return merged;
  }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (err) {
        alert('Could not save — your device storage may be full.');
      }
    }, 120);
  }

  const get = () => state;

  function replace(next) {
    state = migrate(next);
    save();
  }

  function reset() {
    state = defaultState();
    save();
  }

  /* ---------------- day access ---------------- */

  function day(dateStr) {
    if (!state.days[dateStr]) {
      state.days[dateStr] = { food: [], cardio: [], strength: [], waterMl: 0, steps: 0, note: '' };
    }
    const d = state.days[dateStr];
    d.food = d.food || []; d.cardio = d.cardio || []; d.strength = d.strength || [];
    d.waterMl = d.waterMl || 0; d.steps = d.steps || 0;
    return d;
  }

  /* True only when something was actually recorded — used for streaks and stats. */
  function dayHasData(dateStr) {
    const d = state.days[dateStr];
    if (!d) return false;
    return (d.food && d.food.length > 0) || (d.cardio && d.cardio.length > 0) ||
           (d.strength && d.strength.length > 0) || d.waterMl > 0 || d.steps > 0;
  }

  /* ---------------- meals ---------------- */

  const meals = () => state.profile.meals;

  function mealName(id) {
    const m = meals().find(x => x.id === id);
    return m ? m.name : 'Other';
  }

  function addMeal(name) {
    const meal = { id: 'm-' + uid(), name: name.trim() || 'New meal' };
    state.profile.meals.push(meal);
    save();
    return meal;
  }

  function renameMeal(id, name) {
    const m = meals().find(x => x.id === id);
    if (m) { m.name = name.trim() || m.name; save(); }
  }

  /* Deleting a meal moves anything already logged to it into `moveToId`, so no
     food silently disappears from a day's totals. */
  function deleteMeal(id, moveToId) {
    if (meals().length <= 1) return false;
    const target = moveToId || meals().find(m => m.id !== id).id;
    for (const dateStr of Object.keys(state.days)) {
      const d = state.days[dateStr];
      if (!d.food) continue;
      d.food.forEach(e => { if (e.meal === id) e.meal = target; });
    }
    state.profile.meals = meals().filter(m => m.id !== id);
    save();
    return true;
  }

  function moveMeal(id, delta) {
    const list = meals();
    const i = list.findIndex(m => m.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    list.splice(j, 0, list.splice(i, 1)[0]);
    save();
  }

  /* Entries whose meal was removed by an older build still need somewhere to go. */
  function orphanEntries(dateStr) {
    const ids = meals().map(m => m.id);
    return day(dateStr).food.filter(e => ids.indexOf(e.meal) < 0);
  }

  /* ---------------- food resolution ---------------- */

  function resolveFood(ref) {
    if (!ref) return null;
    const [kind, id] = ref.split(':');
    if (kind === 'b') return G.DB.FOODS[Number(id)] || null;
    if (kind === 'c') return state.customFoods.find(f => f.ref === ref) || null;
    if (kind === 'r') {
      const r = state.recipes.find(x => x.ref === ref);
      return r ? recipeAsFood(r) : null;
    }
    return null;
  }

  /* A recipe behaves exactly like a food once its per-100g values are worked out. */
  function recipeAsFood(recipe) {
    let g = 0, kcal = 0, p = 0, c = 0, f = 0;
    for (const item of recipe.items) {
      const food = resolveFood(item.ref);
      if (!food) continue;
      const m = item.grams / 100;
      g += item.grams;
      kcal += food.kcal100 * m; p += food.p100 * m; c += food.c100 * m; f += food.f100 * m;
    }
    const servings = Math.max(1, recipe.servings || 1);
    const per100 = g > 0 ? 100 / g : 0;
    return {
      ref: recipe.ref, name: recipe.name, cat: 'My recipes', src: 'recipe',
      kcal100: round(kcal * per100, 1), p100: round(p * per100, 1),
      c100: round(c * per100, 1), f100: round(f * per100, 1),
      servG: round(g / servings), servLabel: '1 serving', totalG: round(g)
    };
  }

  function allFoods() {
    return state.recipes.map(recipeAsFood).concat(state.customFoods, G.DB.FOODS);
  }

  function searchFoods(query) {
    const q = query.trim().toLowerCase();
    const list = allFoods();
    if (!q) return list;
    const terms = q.split(/\s+/);
    return list
      .map(f => {
        const name = f.name.toLowerCase();
        if (!terms.every(t => name.includes(t))) return null;
        // Rank: exact match, then prefix match, then anything else.
        let score = 2;
        if (name === q) score = 0;
        else if (name.startsWith(q)) score = 1;
        return { f, score };
      })
      .filter(Boolean)
      .sort((a, b) => a.score - b.score || a.f.name.length - b.f.name.length)
      .map(x => x.f);
  }

  function noteRecent(ref) {
    state.recents = [ref].concat(state.recents.filter(r => r !== ref)).slice(0, 40);
  }

  function toggleFavourite(ref) {
    const i = state.favourites.indexOf(ref);
    if (i >= 0) state.favourites.splice(i, 1);
    else state.favourites.unshift(ref);
    save();
  }

  const isFavourite = ref => state.favourites.includes(ref);

  /* ---------------- weight ---------------- */

  /* One entry per date — logging again replaces that day's reading. */
  function logWeight(dateStr, kg, extras) {
    const existing = state.weights.find(w => w.d === dateStr);
    if (existing) Object.assign(existing, { kg }, extras || {});
    else state.weights.push(Object.assign({ d: dateStr, kg }, extras || {}));
    state.weights.sort((a, b) => a.d.localeCompare(b.d));
    save();
  }

  function deleteWeight(dateStr) {
    state.weights = state.weights.filter(w => w.d !== dateStr);
    save();
  }

  /* The weight to use for calculations on a given day: the most recent reading
     on or before it, falling back to the earliest reading we have. */
  function weightOn(dateStr) {
    const list = state.weights;
    if (!list.length) return null;
    let best = null;
    for (const w of list) { if (w.d <= dateStr) best = w; else break; }
    return best ? best.kg : list[0].kg;
  }

  const latestWeight = () => (state.weights.length ? state.weights[state.weights.length - 1].kg : null);

  /* ---------------- derived totals ---------------- */

  function foodTotals(dateStr) {
    const d = day(dateStr);
    return d.food.reduce((t, e) => {
      t.kcal += e.kcal; t.p += e.p; t.c += e.c; t.f += e.f;
      return t;
    }, { kcal: 0, p: 0, c: 0, f: 0 });
  }

  function mealTotals(dateStr, meal) {
    return day(dateStr).food.filter(e => e.meal === meal).reduce((t, e) => {
      t.kcal += e.kcal; t.p += e.p; t.c += e.c; t.f += e.f;
      return t;
    }, { kcal: 0, p: 0, c: 0, f: 0 });
  }

  function burnedTotal(dateStr) {
    const d = day(dateStr);
    const cardio = d.cardio.reduce((s, e) => s + (e.kcal || 0), 0);
    const strength = d.strength.reduce((s, w) => s + (w.kcal || 0), 0);
    return Math.round(cardio + strength);
  }

  /* Everything the Today screen needs, in one shot. */
  function summary(dateStr) {
    const p = state.profile;
    const kg = weightOn(dateStr) || latestWeight();
    const override = day(dateStr).goalKcal;
    /* A one-day goal runs through the same macro maths as the everyday one, so
       protein, carbs and fat stay consistent with the number shown. */
    const targets = override
      ? G.Calc.macroTargets(Object.assign({}, p, { calorieMode: 'manual', manualCalories: override }), kg)
      : G.Calc.macroTargets(p, kg);
    const eaten = foodTotals(dateStr);
    const burned = burnedTotal(dateStr);
    const budget = targets.kcal + (p.addExerciseCalories ? burned : 0);
    return {
      date: dateStr,
      weightKg: kg,
      targets,
      eaten: { kcal: round(eaten.kcal), p: round(eaten.p), c: round(eaten.c), f: round(eaten.f) },
      burned,
      budget,
      remaining: Math.round(budget - eaten.kcal),
      maintenance: Math.round(G.Calc.tdee(p, kg)),
      bmr: Math.round(G.Calc.bmr(p, kg)),
      water: day(dateStr).waterMl,
      steps: day(dateStr).steps,
      goalOverridden: !!override
    };
  }

  /* Set the everyday calorie goal — the number used on every day without its own. */
  function setDailyGoal(kcal) {
    state.profile.calorieMode = 'manual';
    state.profile.manualCalories = Math.max(1, Math.round(kcal));
    save();
  }

  /* Hand the everyday goal back to the calculator. */
  function useCalculatedGoal() {
    state.profile.calorieMode = 'auto';
    save();
  }

  /* Set (or with a falsy value, clear) a goal that applies to one day only. */
  function setDayGoal(dateStr, kcal) {
    const d = day(dateStr);
    if (kcal) d.goalKcal = Math.max(1, Math.round(kcal));
    else delete d.goalKcal;
    save();
  }

  /* Consecutive days with any logged data, counting back from today.
     Today not being logged yet does not break a streak that ran to yesterday. */
  function streak() {
    let n = 0;
    let cursor = today();
    if (!dayHasData(cursor)) cursor = shiftDate(cursor, -1);
    while (dayHasData(cursor)) { n++; cursor = shiftDate(cursor, -1); }
    return n;
  }

  /* Copy every food entry from one day onto another — for repeated meals.
     Entries are cloned with new ids so editing one does not change the other. */
  function copyFood(fromDate, toDate, mealId) {
    const src = day(fromDate).food.filter(e => !mealId || e.meal === mealId);
    if (!src.length) return 0;
    const dest = day(toDate);
    src.forEach(e => {
      dest.food.push(Object.assign({}, e, { id: uid(), t: Date.now() }));
    });
    save();
    return src.length;
  }

  /* The most recent earlier day that has any food logged, for "copy previous". */
  function lastFoodDay(beforeDate) {
    const dates = Object.keys(state.days)
      .filter(d => d < beforeDate && state.days[d].food && state.days[d].food.length)
      .sort();
    return dates.length ? dates[dates.length - 1] : null;
  }

  /* ---------------- export / import ---------------- */

  function exportJSON() {
    return JSON.stringify(state, null, 2);
  }

  function importJSON(text) {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || !parsed.profile) {
      throw new Error('That file does not look like a Fuel backup.');
    }
    replace(parsed);
  }

  G.Store = {
    KEY, DEFAULT_MEALS, DEFAULT_REMINDERS,
    meals, mealName, addMeal, renameMeal, deleteMeal, moveMeal, orphanEntries,
    copyFood, lastFoodDay,
    load, save, get, replace, reset, defaultState,
    day, dayHasData, summary, foodTotals, mealTotals, burnedTotal, streak,
    setDailyGoal, useCalculatedGoal, setDayGoal,
    resolveFood, recipeAsFood, allFoods, searchFoods, noteRecent,
    toggleFavourite, isFavourite,
    logWeight, deleteWeight, weightOn, latestWeight,
    exportJSON, importJSON
  };
})(window);
