/* Fuel — views, routing and interaction. */
(function (G) {
  'use strict';

  const { $, $$, esc, toast, sheet, closeSheet, confirmSheet, ring, bar,
          lineChart, barChart, segmented, field, switchRow, emptyState } = G.UI;
  const U = G.Util, S = G.Store, C = G.Calc;

  let view = 'today';
  let date = U.today();
  let weightRange = '90';
  let app, nav, fab;

  const kcal = n => Math.round(n).toLocaleString('en-GB');

  /* ================= shell ================= */

  function render() {
    const scroll = app.scrollTop;
    const views = { today: viewToday, food: viewFood, move: viewMove, body: viewBody, stats: viewStats };
    app.innerHTML = views[view]();
    $$('.nav-btn', nav).forEach(b => b.classList.toggle('active', b.dataset.view === view));
    bindCommon();
    ({ today: bindToday, food: bindFood, move: bindMove, body: bindBody, stats: bindStats })[view]();
    app.scrollTop = view === 'today' || view === 'food' || view === 'move' ? scroll : 0;
  }

  function go(next) {
    if (view === next) { app.scrollTop = 0; return; }
    view = next;
    render();
  }

  function dateBar() {
    const isToday = date === U.today();
    return '<div class="datebar">' +
      '<button class="date-nav" data-day="-1" aria-label="Previous day">&#8249;</button>' +
      '<button class="date-label" data-jump>' + esc(U.friendlyDate(date)) + '</button>' +
      '<button class="date-nav" data-day="1" aria-label="Next day"' + (isToday ? ' disabled' : '') + '>&#8250;</button>' +
    '</div>';
  }

  function bindCommon() {
    $$('[data-day]', app).forEach(b => b.onclick = () => {
      const next = U.shiftDate(date, Number(b.dataset.day));
      if (next > U.today()) return;
      date = next;
      render();
    });
    const jump = $('[data-jump]', app);
    if (jump) jump.onclick = () => {
      if (date !== U.today()) { date = U.today(); render(); return; }
      pickDate();
    };
  }

  const segValue = seg => { const a = $('.seg-btn.active', seg); return a ? a.dataset.v : null; };

  function pickDate() {
    sheet('Jump to a date', (body, close) => {
      body.innerHTML =
        field('Date', '<input type="date" id="jd" value="' + date + '" max="' + U.today() + '">') +
        '<button class="btn primary wide" id="jgo">Go</button>';
      $('#jgo', body).onclick = () => {
        const v = $('#jd', body).value;
        if (v) { date = v; close(); render(); }
      };
    });
  }

  /* ================= TODAY ================= */

  function viewToday() {
    const s = S.summary(date);
    const p = S.get().profile;
    const d = S.day(date);
    const pct = s.budget > 0 ? s.eaten.kcal / s.budget : 0;
    const over = s.remaining < 0;

    let html = dateBar() + '<div class="pad">';

    /* headline ring */
    html += '<section class="card hero">' +
      '<div class="ring-wrap">' +
        ring(pct, over ? 'over by' : 'remaining', kcal(Math.abs(s.remaining)), 'kcal', over ? 'bad' : '') +
      '</div>' +
      '<div class="hero-stats">' +
        statCell('Target', kcal(s.targets.kcal), 'kcal') +
        statCell('Eaten', kcal(s.eaten.kcal), 'kcal') +
        statCell('Burned', kcal(s.burned), 'kcal') +
      '</div>' +
      (p.addExerciseCalories && s.burned > 0
        ? '<div class="hero-note">Budget today: ' + kcal(s.budget) + ' kcal (' + kcal(s.targets.kcal) + ' + ' + kcal(s.burned) + ' from exercise)</div>'
        : '') +
    '</section>';

    /* macros */
    if (p.trackMacros) {
      html += '<section class="card">' +
        '<h2 class="card-title">Macros</h2>' +
        bar('Protein', s.eaten.p, s.targets.protein, 'g', 'p') +
        bar('Carbs',   s.eaten.c, s.targets.carbs,   'g', 'c') +
        bar('Fat',     s.eaten.f, s.targets.fat,     'g', 'f') +
      '</section>';
    } else {
      html += '<section class="card">' +
        '<h2 class="card-title">Protein</h2>' +
        bar('Protein', s.eaten.p, s.targets.protein, 'g', 'p') +
      '</section>';
    }

    /* meals */
    html += '<section class="card">' +
      '<h2 class="card-title">Meals <button class="link-btn" data-goto="food">Open diary</button></h2>';
    for (const meal of S.meals()) {
      const t = S.mealTotals(date, meal.id);
      const n = d.food.filter(e => e.meal === meal.id).length;
      html += '<button class="meal-row" data-meal="' + esc(meal.id) + '">' +
        '<span class="meal-name">' + esc(meal.name) + '</span>' +
        '<span class="meal-sub">' + (n ? n + ' item' + (n > 1 ? 's' : '') : 'Nothing yet') + '</span>' +
        '<span class="meal-kcal">' + kcal(t.kcal) + '</span>' +
        '<span class="meal-add">+</span>' +
      '</button>';
    }
    html += '</section>';

    /* water */
    const cups = Math.round(p.waterGoalMl / 250);
    const filled = Math.floor(d.waterMl / 250);
    let cupHtml = '';
    for (let i = 0; i < Math.min(cups, 12); i++) {
      cupHtml += '<span class="cup' + (i < filled ? ' on' : '') + '"></span>';
    }
    html += '<section class="card">' +
      '<h2 class="card-title">Water <span class="card-note">' + d.waterMl + ' / ' + p.waterGoalMl + ' ml</span></h2>' +
      '<div class="cups">' + cupHtml + '</div>' +
      '<div class="row gap">' +
        '<button class="btn ghost flex1" data-water="-250">&minus; 250</button>' +
        '<button class="btn ghost flex1" data-water="250">+ 250 ml</button>' +
        '<button class="btn ghost flex1" data-water="500">+ 500 ml</button>' +
      '</div>' +
    '</section>';

    /* steps + weight */
    html += '<section class="card">' +
      '<h2 class="card-title">Steps</h2>' +
      bar('Steps', d.steps, p.stepGoal, '', 'c') +
      '<button class="btn ghost wide" data-steps>' + (d.steps ? 'Edit steps' : 'Log steps') + '</button>' +
    '</section>';

    const todayWeight = S.get().weights.find(w => w.d === date);
    html += '<section class="card">' +
      '<h2 class="card-title">Weight</h2>' +
      (todayWeight
        ? '<div class="big-stat">' + todayWeight.kg + ' <small>kg</small></div>'
        : '<p class="muted small" style="margin:0 0 12px">Not logged for this day.</p>') +
      '<button class="btn ghost wide" data-weigh>' + (todayWeight ? 'Update weight' : 'Log weight') + '</button>' +
    '</section>';

    /* note */
    html += '<section class="card">' +
      '<h2 class="card-title">Notes</h2>' +
      '<textarea id="dayNote" rows="2" placeholder="How did today feel?">' + esc(d.note || '') + '</textarea>' +
    '</section>';

    html += '</div>';
    return html;
  }

  const statCell = (label, value, unit) =>
    '<div class="stat"><div class="stat-v">' + esc(value) + '<small>' + esc(unit || '') + '</small></div>' +
    '<div class="stat-l">' + esc(label) + '</div></div>';

  function bindToday() {
    $$('[data-water]', app).forEach(b => b.onclick = () => {
      const d = S.day(date);
      d.waterMl = Math.max(0, d.waterMl + Number(b.dataset.water));
      S.save(); render();
    });
    $$('[data-meal]', app).forEach(b => b.onclick = () => openFoodPicker(b.dataset.meal));
    const goto = $('[data-goto]', app);
    if (goto) goto.onclick = () => go('food');
    const steps = $('[data-steps]', app);
    if (steps) steps.onclick = openSteps;
    const weigh = $('[data-weigh]', app);
    if (weigh) weigh.onclick = () => openWeight(date);
    const note = $('#dayNote', app);
    if (note) note.onblur = () => { S.day(date).note = note.value; S.save(); };
  }

  function openSteps() {
    sheet('Steps', (body, close) => {
      body.innerHTML =
        field('Steps walked', '<input type="number" inputmode="numeric" id="st" value="' + (S.day(date).steps || '') + '" placeholder="0">') +
        '<button class="btn primary wide" id="save">Save</button>';
      $('#save', body).onclick = () => {
        S.day(date).steps = Math.max(0, Number($('#st', body).value) || 0);
        S.save(); close(); render();
      };
    });
  }

  /* ================= FOOD ================= */

  function viewFood() {
    const d = S.day(date);
    const s = S.summary(date);
    let html = dateBar() + '<div class="pad">';

    html += '<section class="card compact">' +
      '<div class="hero-stats">' +
        statCell('Eaten', kcal(s.eaten.kcal), 'kcal') +
        statCell('Protein', Math.round(s.eaten.p), 'g') +
        statCell('Left', kcal(s.remaining), 'kcal') +
      '</div></section>';

    const entryRow = e =>
      '<li class="entry">' +
        '<div class="entry-main" data-entry="' + e.id + '">' +
          '<div class="entry-name">' + esc(e.name) + '</div>' +
          '<div class="entry-sub">' + esc(e.portion) + ' &middot; ' +
            Math.round(e.p) + 'P ' + Math.round(e.c) + 'C ' + Math.round(e.f) + 'F</div>' +
        '</div>' +
        '<div class="entry-kcal">' + kcal(e.kcal) + '</div>' +
        '<button class="x" data-del="' + e.id + '" aria-label="Remove ' + esc(e.name) + '">&times;</button>' +
      '</li>';

    const sections = S.meals().map(m => ({ id: m.id, name: m.name }));
    const orphans = S.orphanEntries(date);
    if (orphans.length) sections.push({ id: null, name: 'Other' });

    for (const meal of sections) {
      const entries = meal.id ? d.food.filter(e => e.meal === meal.id) : orphans;
      const total = entries.reduce((sum, e) => sum + e.kcal, 0);
      html += '<section class="card">' +
        '<h2 class="card-title">' + esc(meal.name) +
          '<span class="card-note">' + kcal(total) + ' kcal</span></h2>';
      if (!entries.length) {
        html += '<p class="muted small" style="margin:2px 0 12px">Nothing logged.</p>';
      } else {
        html += '<ul class="entries">' + entries.map(entryRow).join('') + '</ul>';
      }
      if (meal.id) {
        html += '<button class="btn ghost wide" data-add="' + esc(meal.id) + '">+ Add food</button>';
      }
      html += '</section>';
    }

    /* Fast ways in, rather than hiding these behind the settings screen. */
    const prev = S.lastFoodDay(date);
    html += '<section class="card">' +
      '<h2 class="card-title">Quick actions</h2>' +
      '<button class="btn ghost wide" data-quickadd>' +
        '<b>Just calories</b> — type a name and a number</button>' +
      '<button class="btn ghost wide" data-newfood>Create a food from a label</button>' +
      '<button class="btn ghost wide" data-newrecipe>Build a meal from ingredients</button>' +
      (prev
        ? '<button class="btn ghost wide" data-copy="' + prev + '">Copy food from ' +
          esc(U.friendlyDate(prev)) + '</button>'
        : '') +
    '</section>';

    html += '<section class="card">' +
      '<h2 class="card-title">My foods &amp; meals' +
        '<span class="card-note">' + (S.get().customFoods.length + S.get().recipes.length) + ' saved</span></h2>' +
      '<p class="muted small" style="margin:0 0 12px">Anything you create here shows up in search whenever you log food.</p>' +
      '<button class="btn ghost wide" data-manage>Manage my foods &amp; meals</button>' +
    '</section>';

    html += '</div>';
    return html;
  }

  function bindFood() {
    $$('[data-add]', app).forEach(b => b.onclick = () => openFoodPicker(b.dataset.add));
    $$('[data-entry]', app).forEach(el => el.onclick = () => editEntry(el.dataset.entry));
    $$('[data-del]', app).forEach(b => b.onclick = e => {
      e.stopPropagation();
      const day = S.day(date);
      const entry = day.food.find(x => x.id === b.dataset.del);
      day.food = day.food.filter(x => x.id !== b.dataset.del);
      S.save(); render();
      if (entry) toast('Removed ' + entry.name);
    });
    $('[data-quickadd]', app).onclick = quickAdd;
    $('[data-newfood]', app).onclick = () => editCustomFood(null);
    $('[data-newrecipe]', app).onclick = () => editRecipe(null);
    $('[data-manage]', app).onclick = manageFoods;
    const copy = $('[data-copy]', app);
    if (copy) copy.onclick = () => {
      const from = copy.dataset.copy;
      confirmSheet('Copy food?',
        'Everything you ate on ' + U.friendlyDate(from) + ' will be added to ' + U.friendlyDate(date) + '.',
        () => {
          const n = S.copyFood(from, date);
          render();
          toast('Copied ' + n + ' item' + (n === 1 ? '' : 's'));
        }, 'Copy');
    };
  }

  /* Where a quick-add lands when the user has not picked a meal. */
  function defaultMealId() {
    const list = S.meals();
    const hour = new Date().getHours();
    const guess = hour < 11 ? 0 : hour < 15 ? 1 : hour < 21 ? 2 : (list.length > 3 ? 3 : list.length - 1);
    return (list[Math.min(guess, list.length - 1)] || list[0]).id;
  }

  /* ---- food picker ---- */

  function openFoodPicker(meal) {
    sheet('Add to ' + S.mealName(meal), (body, close) => {
      body.innerHTML =
        '<input type="search" id="q" class="search" placeholder="Search foods…" autocomplete="off">' +
        segmented('tab', [
          { v: 'all', label: 'All' }, { v: 'recent', label: 'Recent' },
          { v: 'fav', label: 'Saved' }, { v: 'mine', label: 'Mine' }
        ], 'all') +
        '<div id="results" class="results"></div>';

      const q = $('#q', body), results = $('#results', body), seg = $('.seg', body);

      function list() {
        const tab = segValue(seg);
        const term = q.value;
        let items;
        if (tab === 'recent') {
          items = S.get().recents.map(S.resolveFood).filter(Boolean);
          if (term) items = items.filter(f => f.name.toLowerCase().includes(term.toLowerCase()));
        } else if (tab === 'fav') {
          items = S.get().favourites.map(S.resolveFood).filter(Boolean);
          if (term) items = items.filter(f => f.name.toLowerCase().includes(term.toLowerCase()));
        } else if (tab === 'mine') {
          items = S.get().recipes.map(S.recipeAsFood).concat(S.get().customFoods);
          if (term) items = items.filter(f => f.name.toLowerCase().includes(term.toLowerCase()));
        } else {
          items = S.searchFoods(term);
        }
        draw(items.slice(0, 120), tab);
      }

      function draw(items, tab) {
        if (!items.length) {
          const term = q.value.trim();
          results.innerHTML = emptyState('&#127859;',
            tab === 'fav' ? 'No saved foods yet' : tab === 'recent' ? 'Nothing logged yet' :
            tab === 'mine' ? 'No foods or meals of your own' : 'No matches for “' + esc(term) + '”',
            'Not in the list? Add it yourself — it takes a few seconds and it is there for good.') +
            (term
              ? '<button class="btn primary wide" data-mk="food">Create “' + esc(term) + '”</button>' +
                '<button class="btn ghost wide" data-mk="quick">Log “' + esc(term) + '” with just calories</button>'
              : '<button class="btn ghost wide" data-mk="food">Create a food</button>');

          const mk = $$('[data-mk]', results);
          mk.forEach(b => b.onclick = () => {
            close();
            if (b.dataset.mk === 'food') editCustomFood(null, term, meal);
            else quickAdd(term, meal);
          });
          return;
        }
        results.innerHTML = items.map(f =>
          '<button class="food-row" data-ref="' + esc(f.ref) + '">' +
            '<span class="food-main">' +
              '<span class="food-name">' + esc(f.name) + '</span>' +
              '<span class="food-sub">' + Math.round(f.kcal100) + ' kcal &middot; ' +
                U.round(f.p100, 1) + 'P ' + U.round(f.c100, 1) + 'C ' + U.round(f.f100, 1) + 'F per 100g</span>' +
            '</span>' +
            (f.src === 'built-in' ? '' : '<span class="tag">' + (f.src === 'recipe' ? 'Recipe' : 'Custom') + '</span>') +
          '</button>'
        ).join('');
        $$('.food-row', results).forEach(b => b.onclick = () => {
          close();
          openPortion(S.resolveFood(b.dataset.ref), meal, null);
        });
      }

      let debounce;
      q.oninput = () => { clearTimeout(debounce); debounce = setTimeout(list, 120); };
      seg.addEventListener('pick', list);
      list();
      setTimeout(() => q.focus(), 250);
    }, { tall: true });
  }

  /* ---- portion sheet: also used to edit an existing entry ---- */

  function openPortion(food, meal, existing) {
    if (!food) { toast('That food is no longer available.'); return; }
    sheet(existing ? 'Edit entry' : food.name, (body, close) => {
      const startAmount = existing ? existing.amount : 1;
      const startUnit = existing ? existing.unit : (food.servG ? 'serving' : 'g');

      body.innerHTML =
        (existing ? '' : '<p class="muted small" style="margin:-6px 0 14px">' +
          Math.round(food.kcal100) + ' kcal per 100g</p>') +
        '<div class="row gap">' +
          '<div class="flex1">' + field('Amount',
            '<input type="number" inputmode="decimal" id="amt" step="any" min="0" value="' + startAmount + '">') + '</div>' +
          '<div class="flex1">' + field('Unit', segmented('unit', [
            { v: 'serving', label: food.servLabel || 'Serving' }, { v: 'g', label: 'Grams' }
          ], startUnit)) + '</div>' +
        '</div>' +
        field('Meal', segmented('meal', S.meals().map(m => ({ v: m.id, label: m.name })), meal)) +
        '<div class="preview" id="prev"></div>' +
        '<div class="row gap">' +
          (existing ? '<button class="btn danger" id="del">Delete</button>' : '') +
          '<button class="btn primary flex1" id="ok">' + (existing ? 'Save' : 'Add') + '</button>' +
        '</div>' +
        (food.src === 'built-in' || food.src === 'custom' || food.src === 'recipe'
          ? '<button class="btn ghost wide" id="fav" style="margin-top:10px">' +
            (S.isFavourite(food.ref) ? '&#9733; Saved' : '&#9734; Save to my list') + '</button>'
          : '');

      const amt = $('#amt', body), unitSeg = $('[data-seg="unit"]', body), mealSeg = $('[data-seg="meal"]', body);

      function grams() {
        const a = Number(amt.value) || 0;
        return segValue(unitSeg) === 'g' ? a : a * (food.servG || 100);
      }

      function macros() {
        const m = grams() / 100;
        return {
          kcal: food.kcal100 * m, p: food.p100 * m,
          c: food.c100 * m, f: food.f100 * m, grams: grams()
        };
      }

      function paint() {
        const m = macros();
        $('#prev', body).innerHTML =
          '<div class="prev-kcal">' + kcal(m.kcal) + '<small> kcal</small></div>' +
          '<div class="prev-macros">' +
            '<span><b>' + U.round(m.p, 1) + 'g</b> protein</span>' +
            '<span><b>' + U.round(m.c, 1) + 'g</b> carbs</span>' +
            '<span><b>' + U.round(m.f, 1) + 'g</b> fat</span>' +
          '</div>' +
          '<div class="prev-g">' + U.round(m.grams) + ' g total</div>';
      }

      amt.oninput = paint;
      unitSeg.addEventListener('pick', () => {
        // Switching units keeps the meal sensible: 1 serving <-> its weight in grams.
        const a = Number(amt.value) || 0;
        amt.value = segValue(unitSeg) === 'g'
          ? U.round(a * (food.servG || 100))
          : U.round(a / (food.servG || 100), 2);
        paint();
      });
      paint();

      const favBtn = $('#fav', body);
      if (favBtn) favBtn.onclick = () => {
        S.toggleFavourite(food.ref);
        favBtn.innerHTML = S.isFavourite(food.ref) ? '&#9733; Saved' : '&#9734; Save to my list';
      };

      $('#ok', body).onclick = () => {
        const m = macros();
        if (m.grams <= 0) { toast('Enter an amount first.'); return; }
        const a = Number(amt.value) || 0;
        const unit = segValue(unitSeg);
        const entry = {
          id: existing ? existing.id : U.uid(),
          ref: food.ref, name: food.name, meal: segValue(mealSeg),
          amount: a, unit,
          portion: unit === 'g' ? U.round(m.grams) + ' g'
                                : U.round(a, 2) + ' × ' + (food.servLabel || 'serving'),
          kcal: U.round(m.kcal), p: U.round(m.p, 1), c: U.round(m.c, 1), f: U.round(m.f, 1),
          t: Date.now()
        };
        const d = S.day(date);
        if (existing) {
          const i = d.food.findIndex(e => e.id === existing.id);
          if (i >= 0) d.food[i] = entry;
        } else {
          d.food.push(entry);
          S.noteRecent(food.ref);
        }
        S.save(); close(); render();
        if (!existing) toast('Added ' + kcal(m.kcal) + ' kcal');
      };

      const del = $('#del', body);
      if (del) del.onclick = () => {
        const d = S.day(date);
        d.food = d.food.filter(e => e.id !== existing.id);
        S.save(); close(); render();
      };
    });
  }

  function editEntry(id) {
    const entry = S.day(date).food.find(e => e.id === id);
    if (!entry) return;
    const food = S.resolveFood(entry.ref);
    if (food) { openPortion(food, entry.meal, entry); return; }
    // Quick-added entries and foods since deleted are edited directly.
    sheet('Edit entry', (body, close) => {
      body.innerHTML =
        field('Name', '<input id="n" value="' + esc(entry.name) + '">') +
        field('Calories', '<input type="number" inputmode="numeric" id="k" value="' + entry.kcal + '">') +
        field('Protein (g)', '<input type="number" inputmode="decimal" id="p" step="any" value="' + entry.p + '">') +
        field('Meal', segmented('meal', S.meals().map(m => ({ v: m.id, label: m.name })), entry.meal)) +
        '<div class="row gap">' +
          '<button class="btn danger" id="del">Delete</button>' +
          '<button class="btn primary flex1" id="ok">Save</button>' +
        '</div>';
      $('#ok', body).onclick = () => {
        entry.name = $('#n', body).value.trim() || entry.name;
        entry.kcal = Number($('#k', body).value) || 0;
        entry.p = Number($('#p', body).value) || 0;
        entry.meal = segValue($('[data-seg="meal"]', body));
        S.save(); close(); render();
      };
      $('#del', body).onclick = () => {
        const d = S.day(date);
        d.food = d.food.filter(e => e.id !== id);
        S.save(); close(); render();
      };
    });
  }

  function quickAdd(prefillName, prefillMeal) {
    sheet('Just calories', (body, close) => {
      body.innerHTML =
        '<p class="muted small" style="margin:-6px 0 14px">Give it a name and a number. Use this for a takeaway, ' +
        'someone else’s cooking, or anything you cannot be bothered to weigh.</p>' +
        field('Name', '<input id="n" value="' + esc(prefillName || '') + '" placeholder="e.g. Nando’s">') +
        field('Calories', '<input type="number" inputmode="numeric" id="k" placeholder="0">') +
        field('Protein (g), optional', '<input type="number" inputmode="decimal" id="p" step="any" placeholder="0">') +
        field('Meal', segmented('meal', S.meals().map(m => ({ v: m.id, label: m.name })),
          prefillMeal || defaultMealId())) +
        '<button class="btn primary wide" id="ok">Add</button>';
      setTimeout(() => $(prefillName ? '#k' : '#n', body).focus(), 250);
      $('#ok', body).onclick = () => {
        const k = Number($('#k', body).value) || 0;
        if (k <= 0) { toast('Enter the calories.'); return; }
        S.day(date).food.push({
          id: U.uid(), ref: null, name: $('#n', body).value.trim() || 'Quick add',
          meal: segValue($('[data-seg="meal"]', body)),
          amount: 1, unit: 'quick', portion: 'Quick add',
          kcal: k, p: Number($('#p', body).value) || 0, c: 0, f: 0, t: Date.now()
        });
        S.save(); close(); render();
      };
    });
  }

  /* ---- custom foods ---- */

  /* `prefillName` and `thenLogTo` let this double as the "no match — create it"
     path out of search: save the food, then go straight on to logging it. */
  function editCustomFood(existing, prefillName, thenLogTo) {
    sheet(existing ? 'Edit food' : 'New food', (body, close) => {
      const f = existing || { name: prefillName || '', kcal100: '', p100: '', c100: '', f100: '', servG: 100, servLabel: '1 serving' };
      body.innerHTML =
        '<p class="muted small" style="margin:-6px 0 14px">Enter the values per 100 g, straight off the packet.</p>' +
        field('Name', '<input id="n" value="' + esc(f.name) + '" placeholder="e.g. Tesco protein yoghurt">') +
        '<div class="row gap">' +
          '<div class="flex1">' + field('Calories /100g', '<input type="number" inputmode="decimal" id="k" step="any" value="' + f.kcal100 + '">') + '</div>' +
          '<div class="flex1">' + field('Protein /100g', '<input type="number" inputmode="decimal" id="p" step="any" value="' + f.p100 + '">') + '</div>' +
        '</div>' +
        '<div class="row gap">' +
          '<div class="flex1">' + field('Carbs /100g', '<input type="number" inputmode="decimal" id="c" step="any" value="' + f.c100 + '">') + '</div>' +
          '<div class="flex1">' + field('Fat /100g', '<input type="number" inputmode="decimal" id="fa" step="any" value="' + f.f100 + '">') + '</div>' +
        '</div>' +
        '<div class="row gap">' +
          '<div class="flex1">' + field('Serving size (g)', '<input type="number" inputmode="decimal" id="sg" step="any" value="' + f.servG + '">') + '</div>' +
          '<div class="flex1">' + field('Serving name', '<input id="sl" value="' + esc(f.servLabel) + '">') + '</div>' +
        '</div>' +
        '<div class="row gap">' +
          (existing ? '<button class="btn danger" id="del">Delete</button>' : '') +
          '<button class="btn primary flex1" id="ok">Save</button>' +
        '</div>';

      $('#ok', body).onclick = () => {
        const name = $('#n', body).value.trim();
        if (!name) { toast('Give it a name.'); return; }
        const data = {
          name,
          kcal100: Number($('#k', body).value) || 0,
          p100: Number($('#p', body).value) || 0,
          c100: Number($('#c', body).value) || 0,
          f100: Number($('#fa', body).value) || 0,
          servG: Number($('#sg', body).value) || 100,
          servLabel: $('#sl', body).value.trim() || '1 serving',
          cat: 'My foods', src: 'custom'
        };
        let saved = existing;
        if (existing) Object.assign(existing, data);
        else {
          saved = Object.assign({ ref: 'c:' + U.uid() }, data);
          S.get().customFoods.unshift(saved);
        }
        S.save(); close(); render(); toast('Saved');
        // Came here from a fruitless search: carry straight on to logging it.
        if (thenLogTo && saved) setTimeout(() => openPortion(saved, thenLogTo, null), 200);
      };
      const del = $('#del', body);
      if (del) del.onclick = () => confirmSheet('Delete food?',
        'Meals you already logged with it keep their numbers.', () => {
          const st = S.get();
          st.customFoods = st.customFoods.filter(x => x.ref !== existing.ref);
          S.save(); render();
        });
    }, { tall: true });
  }

  /* ---- recipes ---- */

  /* `draftIn` lets the builder re-open with work in progress after a nested
     sheet (the ingredient picker) has closed it. The draft is shared by
     reference, so anything added there is already present when we come back. */
  function editRecipe(existing, draftIn) {
    const draft = draftIn || (existing
      ? { name: existing.name, servings: existing.servings, items: existing.items.slice() }
      : { name: '', servings: 1, items: [] });

    sheet(existing ? 'Edit recipe' : 'New recipe', (body, close) => {
      function paint() {
        const preview = S.recipeAsFood(Object.assign({ ref: 'tmp', name: draft.name || 'Recipe' }, draft));
        body.innerHTML =
          '<p class="muted small" style="margin:-6px 0 14px">Build a meal once, then log it in a tap.</p>' +
          field('Name', '<input id="n" value="' + esc(draft.name) + '" placeholder="e.g. My chicken rice bowl">') +
          field('Makes how many servings?', '<input type="number" inputmode="numeric" id="sv" min="1" value="' + draft.servings + '">') +
          '<h3 class="sub-title">Ingredients</h3>' +
          (draft.items.length
            ? '<ul class="entries">' + draft.items.map((it, i) => {
                const f = S.resolveFood(it.ref);
                const m = it.grams / 100;
                return '<li class="entry"><div class="entry-main">' +
                  '<div class="entry-name">' + esc(f ? f.name : 'Removed food') + '</div>' +
                  '<div class="entry-sub">' + it.grams + ' g</div></div>' +
                  '<div class="entry-kcal">' + (f ? kcal(f.kcal100 * m) : 0) + '</div>' +
                  '<button class="x" data-rm="' + i + '" aria-label="Remove">&times;</button></li>';
              }).join('') + '</ul>'
            : '<p class="muted small">No ingredients yet.</p>') +
          '<button class="btn ghost wide" id="addIng">+ Add ingredient</button>' +
          (draft.items.length
            ? '<div class="preview"><div class="prev-kcal">' + kcal(preview.kcal100 * preview.servG / 100) +
              '<small> kcal per serving</small></div>' +
              '<div class="prev-macros">' +
                '<span><b>' + U.round(preview.p100 * preview.servG / 100, 1) + 'g</b> protein</span>' +
                '<span><b>' + U.round(preview.c100 * preview.servG / 100, 1) + 'g</b> carbs</span>' +
                '<span><b>' + U.round(preview.f100 * preview.servG / 100, 1) + 'g</b> fat</span>' +
              '</div><div class="prev-g">' + preview.totalG + ' g total, ' + draft.servings + ' serving(s)</div></div>'
            : '') +
          '<div class="row gap">' +
            (existing ? '<button class="btn danger" id="del">Delete</button>' : '') +
            '<button class="btn primary flex1" id="ok">Save recipe</button>' +
          '</div>';

        $('#n', body).oninput = e => { draft.name = e.target.value; };
        $('#sv', body).oninput = e => { draft.servings = Math.max(1, Number(e.target.value) || 1); };
        $$('[data-rm]', body).forEach(b => b.onclick = () => {
          draft.items.splice(Number(b.dataset.rm), 1); paint();
        });

        $('#addIng', body).onclick = () => {
          // Reuse the search list, but collect grams instead of logging it.
          sheet('Add ingredient', (b2, close2) => {
            b2.innerHTML = '<input type="search" id="q2" class="search" placeholder="Search foods…">' +
                           '<div id="r2" class="results"></div>';
            const q2 = $('#q2', b2), r2 = $('#r2', b2);
            function list2() {
              const items = S.searchFoods(q2.value).filter(f => f.src !== 'recipe').slice(0, 80);
              r2.innerHTML = items.map(f =>
                '<button class="food-row" data-ref="' + esc(f.ref) + '"><span class="food-main">' +
                  '<span class="food-name">' + esc(f.name) + '</span>' +
                  '<span class="food-sub">' + Math.round(f.kcal100) + ' kcal per 100g</span>' +
                '</span></button>').join('') || emptyState('&#128269;', 'No matches', '');
              $$('.food-row', r2).forEach(b3 => b3.onclick = () => {
                const food = S.resolveFood(b3.dataset.ref);
                close2();
                sheet('How much ' + food.name + '?', (b4, close4) => {
                  b4.innerHTML = field('Grams', '<input type="number" inputmode="decimal" id="g" value="' + (food.servG || 100) + '">') +
                                 '<button class="btn primary wide" id="ok4">Add</button>';
                  $('#ok4', b4).onclick = () => {
                    const g = Number($('#g', b4).value) || 0;
                    if (g <= 0) { toast('Enter a weight.'); return; }
                    draft.items.push({ ref: food.ref, grams: g });
                    close4();
                    editRecipe(existing, draft);   // back to the builder, draft intact
                  };
                });
              });
            }
            let t2; q2.oninput = () => { clearTimeout(t2); t2 = setTimeout(list2, 120); };
            list2();
          }, { tall: true });
        };

        $('#ok', body).onclick = () => {
          if (!draft.name.trim()) { toast('Give the recipe a name.'); return; }
          if (!draft.items.length) { toast('Add at least one ingredient.'); return; }
          if (existing) Object.assign(existing, { name: draft.name.trim(), servings: draft.servings, items: draft.items });
          else S.get().recipes.unshift({ ref: 'r:' + U.uid(), name: draft.name.trim(), servings: draft.servings, items: draft.items });
          S.save(); close(); render(); toast('Recipe saved');
        };
        const del = $('#del', body);
        if (del) del.onclick = () => confirmSheet('Delete recipe?', 'Days you already logged keep their numbers.', () => {
          const st = S.get();
          st.recipes = st.recipes.filter(r => r.ref !== existing.ref);
          S.save(); render();
        });
      }

      paint();
    }, { tall: true });
  }

  /* ================= MOVE ================= */

  function viewMove() {
    const d = S.day(date);
    const burned = S.burnedTotal(date);
    let html = dateBar() + '<div class="pad">';

    const volume = d.strength.reduce((s, w) =>
      s + w.sets.reduce((v, st) => v + (st.w || 0) * (st.reps || 0), 0), 0);

    html += '<section class="card compact"><div class="hero-stats">' +
      statCell('Burned', kcal(burned), 'kcal') +
      statCell('Sessions', d.cardio.length + d.strength.length, '') +
      statCell('Volume', kcal(volume), 'kg') +
    '</div></section>';

    /* cardio */
    html += '<section class="card"><h2 class="card-title">Cardio &amp; activity</h2>';
    if (!d.cardio.length) {
      html += '<p class="muted small" style="margin:2px 0 12px">Nothing logged.</p>';
    } else {
      html += '<ul class="entries">' + d.cardio.map(e =>
        '<li class="entry" data-cardio="' + e.id + '"><div class="entry-main">' +
          '<div class="entry-name">' + esc(e.name) + '</div>' +
          '<div class="entry-sub">' + e.mins + ' min</div></div>' +
        '<div class="entry-kcal">' + kcal(e.kcal) + '</div></li>'
      ).join('') + '</ul>';
    }
    html += '<button class="btn ghost wide" data-addcardio>+ Log activity</button></section>';

    /* strength */
    html += '<section class="card"><h2 class="card-title">Strength</h2>';
    if (!d.strength.length) {
      html += '<p class="muted small" style="margin:2px 0 12px">No lifts logged.</p>';
    } else {
      html += d.strength.map(w => {
        const vol = w.sets.reduce((v, s) => v + (s.w || 0) * (s.reps || 0), 0);
        const best = w.sets.reduce((b, s) => Math.max(b, C.e1rm(s.w, s.reps)), 0);
        return '<div class="lift" data-lift="' + w.id + '">' +
          '<div class="lift-head"><span class="lift-name">' + esc(w.name) + '</span>' +
            '<span class="lift-meta">' + w.sets.length + ' sets &middot; ' + kcal(vol) + ' kg' +
            (best ? ' &middot; e1RM ' + best + ' kg' : '') + '</span></div>' +
          '<div class="sets">' + w.sets.map(s =>
            '<span class="set">' + (s.w || 0) + '<i>kg</i> × ' + (s.reps || 0) + '</span>').join('') +
          '</div></div>';
      }).join('');
    }
    html += '<button class="btn ghost wide" data-addlift>+ Log lift</button></section>';

    /* steps */
    html += '<section class="card"><h2 class="card-title">Steps</h2>' +
      bar('Steps', d.steps, S.get().profile.stepGoal, '', 'c') +
      '<button class="btn ghost wide" data-steps>' + (d.steps ? 'Edit steps' : 'Log steps') + '</button></section>';

    html += '</div>';
    return html;
  }

  function bindMove() {
    $('[data-addcardio]', app).onclick = () => openCardio(null);
    $('[data-addlift]', app).onclick = () => openLift(null);
    $('[data-steps]', app).onclick = openSteps;
    $$('[data-cardio]', app).forEach(li => li.onclick = () => {
      const e = S.day(date).cardio.find(x => x.id === li.dataset.cardio);
      if (e) openCardio(e);
    });
    $$('[data-lift]', app).forEach(el => el.onclick = () => {
      const w = S.day(date).strength.find(x => x.id === el.dataset.lift);
      if (w) openLift(w);
    });
  }

  function openCardio(existing) {
    sheet(existing ? 'Edit activity' : 'Log activity', (body, close) => {
      const weight = S.weightOn(date) || S.latestWeight() || 70;
      const cats = ['Cardio', 'Gym', 'Sport', 'Daily'];
      body.innerHTML =
        field('Activity',
          '<select id="act">' +
            cats.map(cat => '<optgroup label="' + cat + '">' +
              G.DB.ACTIVITIES.filter(a => a.cat === cat).map(a =>
                '<option value="' + a.ref + '"' +
                (existing && existing.ref === a.ref ? ' selected' : '') + '>' + esc(a.name) + '</option>'
              ).join('') + '</optgroup>').join('') +
            '<option value="custom"' + (existing && !existing.ref ? ' selected' : '') + '>Something else…</option>' +
          '</select>') +
        '<div id="customName" class="hidden">' +
          field('Name', '<input id="cn" value="' + esc(existing && !existing.ref ? existing.name : '') + '" placeholder="e.g. Trampolining">') +
        '</div>' +
        field('Duration (minutes)',
          '<input type="number" inputmode="numeric" id="mins" value="' + (existing ? existing.mins : 30) + '">') +
        '<div class="preview" id="prev"></div>' +
        field('Calories burned', '<input type="number" inputmode="numeric" id="kc" value="' + (existing ? existing.kcal : '') + '">',
          'Worked out from your weight — change it if your watch says otherwise.') +
        '<div class="row gap">' +
          (existing ? '<button class="btn danger" id="del">Delete</button>' : '') +
          '<button class="btn primary flex1" id="ok">Save</button>' +
        '</div>';

      const act = $('#act', body), mins = $('#mins', body), kc = $('#kc', body);
      let userEditedKcal = !!existing;

      function currentActivity() {
        return G.DB.ACTIVITIES.find(a => a.ref === act.value) || null;
      }

      function paint() {
        const a = currentActivity();
        $('#customName', body).classList.toggle('hidden', !!a);
        const m = Number(mins.value) || 0;
        const est = a ? C.activityKcal(a.met, m, weight) : 0;
        $('#prev', body).innerHTML = a
          ? '<div class="prev-kcal">' + kcal(est) + '<small> kcal</small></div>' +
            '<div class="prev-g">' + a.name + ', ' + m + ' min at ' + U.round(weight, 1) + ' kg</div>'
          : '<div class="prev-g">Enter the calories yourself below.</div>';
        if (!userEditedKcal && a) kc.value = est;
      }

      act.onchange = () => { userEditedKcal = false; paint(); };
      mins.oninput = () => { userEditedKcal = false; paint(); };
      kc.oninput = () => { userEditedKcal = true; };
      paint();

      $('#ok', body).onclick = () => {
        const a = currentActivity();
        const name = a ? a.name : ($('#cn', body).value.trim() || 'Activity');
        const entry = {
          id: existing ? existing.id : U.uid(),
          ref: a ? a.ref : null, name,
          mins: Number(mins.value) || 0,
          kcal: Math.max(0, Number(kc.value) || 0), t: Date.now()
        };
        const d = S.day(date);
        if (existing) {
          const i = d.cardio.findIndex(x => x.id === existing.id);
          if (i >= 0) d.cardio[i] = entry;
        } else d.cardio.push(entry);
        S.save(); close(); render();
      };
      const del = $('#del', body);
      if (del) del.onclick = () => {
        const d = S.day(date);
        d.cardio = d.cardio.filter(x => x.id !== existing.id);
        S.save(); close(); render();
      };
    }, { tall: true });
  }

  function openLift(existing) {
    const draft = existing
      ? { name: existing.name, sets: existing.sets.map(s => ({ w: s.w, reps: s.reps })) }
      : { name: '', sets: [{ w: '', reps: '' }] };

    sheet(existing ? 'Edit lift' : 'Log lift', (body, close) => {
      function paint() {
        const vol = draft.sets.reduce((v, s) => v + (Number(s.w) || 0) * (Number(s.reps) || 0), 0);
        const best = draft.sets.reduce((b, s) => Math.max(b, C.e1rm(Number(s.w), Number(s.reps))), 0);
        body.innerHTML =
          field('Exercise',
            '<input id="ln" list="lifts" value="' + esc(draft.name) + '" placeholder="Start typing…">' +
            '<datalist id="lifts">' + G.DB.LIFTS.map(l => '<option value="' + esc(l) + '">').join('') + '</datalist>') +
          '<h3 class="sub-title">Sets</h3>' +
          '<div class="set-rows">' +
            '<div class="set-head"><span>#</span><span>Weight (kg)</span><span>Reps</span><span></span></div>' +
            draft.sets.map((s, i) =>
              '<div class="set-row">' +
                '<span class="set-n">' + (i + 1) + '</span>' +
                '<input type="number" inputmode="decimal" step="any" data-w="' + i + '" value="' + s.w + '" placeholder="0">' +
                '<input type="number" inputmode="numeric" data-r="' + i + '" value="' + s.reps + '" placeholder="0">' +
                '<button class="x" data-rmset="' + i + '" aria-label="Remove set">&times;</button>' +
              '</div>').join('') +
          '</div>' +
          '<button class="btn ghost wide" id="addSet">+ Add set</button>' +
          '<div class="preview"><div class="prev-kcal">' + kcal(vol) + '<small> kg volume</small></div>' +
            (best ? '<div class="prev-g">Best set estimates a ' + best + ' kg one-rep max</div>' : '') + '</div>' +
          '<div class="row gap">' +
            (existing ? '<button class="btn danger" id="del">Delete</button>' : '') +
            '<button class="btn primary flex1" id="ok">Save</button>' +
          '</div>';

        $('#ln', body).oninput = e => { draft.name = e.target.value; };
        $$('[data-w]', body).forEach(inp => inp.oninput = e => { draft.sets[Number(inp.dataset.w)].w = e.target.value; });
        $$('[data-r]', body).forEach(inp => inp.oninput = e => { draft.sets[Number(inp.dataset.r)].reps = e.target.value; });
        $$('[data-rmset]', body).forEach(b => b.onclick = () => {
          draft.sets.splice(Number(b.dataset.rmset), 1);
          if (!draft.sets.length) draft.sets.push({ w: '', reps: '' });
          paint();
        });
        $('#addSet', body).onclick = () => {
          const last = draft.sets[draft.sets.length - 1] || { w: '', reps: '' };
          draft.sets.push({ w: last.w, reps: last.reps });   // most sets repeat the last one
          paint();
        };
        $('#ok', body).onclick = () => {
          const name = draft.name.trim();
          if (!name) { toast('Which exercise?'); return; }
          const sets = draft.sets
            .map(s => ({ w: Number(s.w) || 0, reps: Number(s.reps) || 0 }))
            .filter(s => s.reps > 0);
          if (!sets.length) { toast('Add at least one set with reps.'); return; }
          const entry = { id: existing ? existing.id : U.uid(), name, sets, kcal: 0, t: Date.now() };
          const d = S.day(date);
          if (existing) {
            const i = d.strength.findIndex(x => x.id === existing.id);
            if (i >= 0) d.strength[i] = entry;
          } else d.strength.push(entry);
          S.save(); close(); render();
        };
        const del = $('#del', body);
        if (del) del.onclick = () => {
          const d = S.day(date);
          d.strength = d.strength.filter(x => x.id !== existing.id);
          S.save(); close(); render();
        };
      }
      paint();
    }, { tall: true });
  }

  /* ================= BODY ================= */

  function viewBody() {
    const st = S.get(), p = st.profile;
    const ws = st.weights;
    const latest = ws.length ? ws[ws.length - 1] : null;
    const first = ws.length ? ws[0] : null;
    let html = '<div class="pad">';

    if (!latest) {
      html += '<section class="card">' + emptyState('&#9878;', 'No weigh-ins yet',
        'Log your weight to unlock trends and a finish-date estimate.') +
        '<button class="btn primary wide" data-weigh>Log weight</button></section></div>';
      return html;
    }

    const trend = C.weightTrend(ws);
    const proj = trend != null ? C.projection(latest.kg, p.goalWeightKg, trend) : null;
    const bmiV = C.bmi(latest.kg, p.heightCm);
    const band = C.bmiBand(bmiV);
    const since = ws.length > 1 ? latest.kg - first.kg : 0;

    const cutoff = U.shiftDate(U.today(), -7);
    const weekAgo = ws.filter(w => w.d <= cutoff).slice(-1)[0];
    const weekChange = weekAgo ? latest.kg - weekAgo.kg : null;

    html += '<section class="card hero">' +
      '<div class="big-stat">' + latest.kg + ' <small>kg</small></div>' +
      '<div class="muted small">Last weighed ' + esc(U.friendlyDate(latest.d)) + '</div>' +
      '<div class="hero-stats" style="margin-top:16px">' +
        statCell('7 days', weekChange == null ? '—' : (weekChange > 0 ? '+' : '') + U.round(weekChange, 1), 'kg') +
        statCell('Overall', (since > 0 ? '+' : '') + U.round(since, 1), 'kg') +
        statCell('BMI', bmiV || '—', '') +
      '</div>' +
      '<div class="hero-note">BMI ' + (bmiV || '—') + ' — <b class="' + band.tone + '">' + band.label + '</b></div>' +
    '</section>';

    /* trend and projection */
    html += '<section class="card"><h2 class="card-title">Trend</h2>';
    if (trend == null) {
      html += '<p class="muted small">Weigh in a few more times across at least a few days and a trend will appear here.</p>';
    } else {
      const dir = trend < 0 ? 'losing' : trend > 0 ? 'gaining' : 'holding';
      html += '<p class="lead">You are <b>' + dir + '</b> about <b>' + U.round(Math.abs(trend), 2) + ' kg a week</b>.</p>';
      if (p.goalWeightKg) {
        if (proj && proj.reached) html += '<p class="muted small">You are at your goal weight. Nice.</p>';
        else if (proj) html += '<p class="muted small">At this rate you reach ' + p.goalWeightKg + ' kg around <b>' +
          esc(proj.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })) +
          '</b> — about ' + proj.weeks + ' weeks away.</p>';
        else html += '<p class="muted small">Your weight is not currently moving toward ' + p.goalWeightKg + ' kg.</p>';
      } else {
        html += '<p class="muted small">Set a goal weight in settings for a finish-date estimate.</p>';
      }
    }
    html += '</section>';

    /* chart, over a selectable window */
    const windows = { '30': 30, '90': 90, '365': 365, 'all': 99999 };
    const cutoffDate = U.shiftDate(U.today(), -windows[weightRange]);
    const shown = weightRange === 'all' ? ws : ws.filter(w => w.d >= cutoffDate);
    const pts = shown.map(w => ({ x: U.dayNumber(w.d), y: w.kg, label: shortDate(w.d) }));
    const avg = C.movingAverage(shown.map(w => w.kg), 7);
    const overlay = pts.map((pt, i) => ({ x: pt.x, y: avg[i] }));
    html += '<section class="card"><h2 class="card-title">Weight history' +
      '<span class="card-note">7-day average</span></h2>' +
      segmented('wrange', [
        { v: '30', label: '30d' }, { v: '90', label: '90d' },
        { v: '365', label: '1y' }, { v: 'all', label: 'All' }
      ], weightRange) +
      '<div style="margin-top:14px">' + lineChart(pts, { overlay, goal: p.goalWeightKg, dp: 1 }) + '</div>' +
    '</section>';

    /* measurements */
    const withExtras = ws.filter(w => w.waistCm || w.bf).slice(-1)[0];
    html += '<section class="card"><h2 class="card-title">Measurements</h2>' +
      '<div class="hero-stats">' +
        statCell('Waist', withExtras && withExtras.waistCm ? withExtras.waistCm : '—', 'cm') +
        statCell('Body fat', withExtras && withExtras.bf ? withExtras.bf : '—', '%') +
        statCell('Height', p.heightCm, 'cm') +
      '</div></section>';

    /* log */
    html += '<section class="card"><h2 class="card-title">Weigh-ins</h2><ul class="entries">' +
      ws.slice().reverse().slice(0, 30).map(w =>
        '<li class="entry" data-w="' + w.d + '"><div class="entry-main">' +
          '<div class="entry-name">' + w.kg + ' kg</div>' +
          '<div class="entry-sub">' + esc(U.friendlyDate(w.d)) +
            (w.waistCm ? ' &middot; waist ' + w.waistCm + ' cm' : '') +
            (w.bf ? ' &middot; ' + w.bf + '% fat' : '') + '</div></div></li>'
      ).join('') + '</ul>' +
      '<button class="btn primary wide" data-weigh>Log weight</button></section>';

    html += '</div>';
    return html;
  }

  const shortDate = iso => {
    const d = U.parseISO(iso);
    return d.getDate() + ' ' + d.toLocaleDateString('en-GB', { month: 'short' });
  };

  function bindBody() {
    $$('[data-weigh]', app).forEach(b => b.onclick = () => openWeight(U.today()));
    $$('[data-w]', app).forEach(li => li.onclick = () => openWeight(li.dataset.w));
    const range = $('[data-seg="wrange"]', app);
    if (range) range.addEventListener('pick', e => { weightRange = e.detail; render(); });
  }

  function openWeight(forDate) {
    const existing = S.get().weights.find(w => w.d === forDate);
    sheet('Weigh-in', (body, close) => {
      body.innerHTML =
        field('Date', '<input type="date" id="wd" value="' + forDate + '" max="' + U.today() + '">') +
        field('Weight (kg)', '<input type="number" inputmode="decimal" step="any" id="wk" value="' +
          (existing ? existing.kg : (S.latestWeight() || '')) + '" placeholder="0.0">') +
        '<div class="row gap">' +
          '<div class="flex1">' + field('Waist (cm), optional',
            '<input type="number" inputmode="decimal" step="any" id="wa" value="' + (existing && existing.waistCm ? existing.waistCm : '') + '">') + '</div>' +
          '<div class="flex1">' + field('Body fat (%), optional',
            '<input type="number" inputmode="decimal" step="any" id="bf" value="' + (existing && existing.bf ? existing.bf : '') + '">') + '</div>' +
        '</div>' +
        '<div class="row gap">' +
          (existing ? '<button class="btn danger" id="del">Delete</button>' : '') +
          '<button class="btn primary flex1" id="ok">Save</button>' +
        '</div>';
      $('#ok', body).onclick = () => {
        const kg = Number($('#wk', body).value);
        if (!kg || kg <= 0) { toast('Enter your weight.'); return; }
        S.logWeight($('#wd', body).value || forDate, U.round(kg, 1), {
          waistCm: Number($('#wa', body).value) || null,
          bf: Number($('#bf', body).value) || null
        });
        close(); render(); toast('Weight saved');
      };
      const del = $('#del', body);
      if (del) del.onclick = () => { S.deleteWeight(forDate); close(); render(); };
    });
  }

  /* ================= STATS ================= */

  function viewStats() {
    const st = S.get(), p = st.profile;
    const kg = S.latestWeight();
    const targets = C.macroTargets(p, kg);
    let html = '<div class="pad">';

    /* the numbers behind everything */
    html += '<section class="card"><h2 class="card-title">Your numbers</h2>' +
      '<div class="rows">' +
        numRow('BMR — at complete rest', kcal(C.bmr(p, kg)) + ' kcal') +
        numRow('Maintenance (TDEE)', kcal(C.tdee(p, kg)) + ' kcal') +
        numRow('Daily target', kcal(targets.kcal) + ' kcal') +
        numRow('Difference', (targets.kcal - Math.round(C.tdee(p, kg)) > 0 ? '+' : '') +
          kcal(targets.kcal - Math.round(C.tdee(p, kg))) + ' kcal') +
        numRow('Protein', targets.protein + ' g') +
        numRow('Carbs', targets.carbs + ' g') +
        numRow('Fat', targets.fat + ' g') +
      '</div>' +
      '<button class="btn ghost wide" data-settings>Adjust goals</button></section>';

    /* last 7 days */
    const days = [];
    for (let i = 6; i >= 0; i--) days.push(U.shiftDate(U.today(), -i));
    const logged = days.filter(S.dayHasData);
    const intake = days.map(d => S.foodTotals(d).kcal);
    const loggedIntake = days.filter(S.dayHasData).map(d => S.foodTotals(d).kcal).filter(v => v > 0);
    const avg = loggedIntake.length ? loggedIntake.reduce((a, b) => a + b, 0) / loggedIntake.length : 0;

    html += '<section class="card"><h2 class="card-title">Last 7 days' +
      '<span class="card-note">avg ' + kcal(avg) + ' kcal</span></h2>' +
      barChart(days.map((d, i) => ({
        label: U.parseISO(d).toLocaleDateString('en-GB', { weekday: 'narrow' }),
        value: Math.round(intake[i]),
        tone: intake[i] > targets.kcal ? 'over' : ''
      })), { goal: targets.kcal }) +
      '<div class="hero-stats" style="margin-top:14px">' +
        statCell('Days logged', logged.length + '/7', '') +
        statCell('On target', days.filter(d => {
          const v = S.foodTotals(d).kcal;
          return v > 0 && Math.abs(v - targets.kcal) <= targets.kcal * 0.1;
        }).length, ' days') +
        statCell('Streak', S.streak(), ' days') +
      '</div></section>';

    /* protein + water + training */
    const pAvg = loggedIntake.length
      ? days.filter(d => S.foodTotals(d).kcal > 0).map(d => S.foodTotals(d).p).reduce((a, b) => a + b, 0) / loggedIntake.length : 0;
    const wAvg = logged.length ? logged.map(d => S.day(d).waterMl).reduce((a, b) => a + b, 0) / logged.length : 0;
    const burnTotal = days.reduce((s, d) => s + S.burnedTotal(d), 0);
    const sessions = days.reduce((s, d) => s + S.day(d).cardio.length + S.day(d).strength.length, 0);

    html += '<section class="card"><h2 class="card-title">Weekly averages</h2>' +
      bar('Protein per day', pAvg, targets.protein, 'g', 'p') +
      bar('Water per day', wAvg, p.waterGoalMl, 'ml', 'c') +
      '<div class="hero-stats" style="margin-top:8px">' +
        statCell('Sessions', sessions, '') +
        statCell('Burned', kcal(burnTotal), 'kcal') +
        statCell('Net avg', kcal(avg - burnTotal / 7), 'kcal') +
      '</div></section>';

    /* macro split actually eaten this week */
    const totP = days.reduce((s, d) => s + S.foodTotals(d).p, 0);
    const totC = days.reduce((s, d) => s + S.foodTotals(d).c, 0);
    const totF = days.reduce((s, d) => s + S.foodTotals(d).f, 0);
    const totalKcal = totP * 4 + totC * 4 + totF * 9;
    html += '<section class="card"><h2 class="card-title">Where your calories came from</h2>';
    if (totalKcal > 0) {
      const pc = v => Math.round(v / totalKcal * 100);
      html += '<div class="split">' +
        '<i class="p" style="width:' + pc(totP * 4) + '%"></i>' +
        '<i class="c" style="width:' + pc(totC * 4) + '%"></i>' +
        '<i class="f" style="width:' + pc(totF * 9) + '%"></i>' +
      '</div><div class="split-key">' +
        '<span><i class="p"></i>Protein ' + pc(totP * 4) + '%</span>' +
        '<span><i class="c"></i>Carbs ' + pc(totC * 4) + '%</span>' +
        '<span><i class="f"></i>Fat ' + pc(totF * 9) + '%</span>' +
      '</div>';
    } else {
      html += '<p class="muted small">Log some food this week to see the split.</p>';
    }
    html += '</section>';

    /* 30-day calorie history */
    const month = [];
    for (let i = 29; i >= 0; i--) {
      const d = U.shiftDate(U.today(), -i);
      const v = S.foodTotals(d).kcal;
      if (v > 0) month.push({ x: U.dayNumber(d), y: Math.round(v), label: shortDate(d) });
    }
    html += '<section class="card"><h2 class="card-title">Intake, last 30 days</h2>' +
      lineChart(month, { goal: targets.kcal }) + '</section>';

    /* data */
    html += '<section class="card"><h2 class="card-title">Your data</h2>' +
      '<p class="muted small" style="margin:0 0 12px">Everything lives on this device only. Back it up before changing phone.</p>' +
      '<div class="row gap wrap">' +
        '<button class="btn ghost flex1" data-export>Export backup</button>' +
        '<button class="btn ghost flex1" data-import>Import backup</button>' +
      '</div>' +
      '<button class="btn ghost wide" data-manage style="margin-top:8px">My foods &amp; recipes</button>' +
      '<button class="btn danger wide" data-reset style="margin-top:8px">Erase everything</button>' +
    '</section>';

    html += '</div>';
    return html;
  }

  const numRow = (label, value) =>
    '<div class="nrow"><span>' + esc(label) + '</span><b>' + esc(value) + '</b></div>';

  function bindStats() {
    $('[data-settings]', app).onclick = openSettings;
    $('[data-export]', app).onclick = exportData;
    $('[data-import]', app).onclick = importData;
    $('[data-manage]', app).onclick = manageFoods;
    $('[data-reset]', app).onclick = () => confirmSheet('Erase everything?',
      'Every meal, weigh-in and workout will be permanently deleted from this device.',
      () => { S.reset(); view = 'today'; date = U.today(); render(); openOnboarding(); }, 'Erase');
  }

  function manageFoods() {
    sheet('My foods & recipes', (body) => {
      const st = S.get();
      body.innerHTML =
        '<h3 class="sub-title">Recipes</h3>' +
        (st.recipes.length
          ? '<ul class="entries">' + st.recipes.map(r => {
              const f = S.recipeAsFood(r);
              return '<li class="entry" data-recipe="' + esc(r.ref) + '"><div class="entry-main">' +
                '<div class="entry-name">' + esc(r.name) + '</div>' +
                '<div class="entry-sub">' + r.items.length + ' ingredients &middot; ' + r.servings + ' servings</div></div>' +
                '<div class="entry-kcal">' + kcal(f.kcal100 * f.servG / 100) + '</div></li>';
            }).join('') + '</ul>'
          : '<p class="muted small">None yet.</p>') +
        '<button class="btn ghost wide" id="nr">+ New recipe</button>' +
        '<h3 class="sub-title">Custom foods</h3>' +
        (st.customFoods.length
          ? '<ul class="entries">' + st.customFoods.map(f =>
              '<li class="entry" data-cf="' + esc(f.ref) + '"><div class="entry-main">' +
                '<div class="entry-name">' + esc(f.name) + '</div>' +
                '<div class="entry-sub">per 100g</div></div>' +
                '<div class="entry-kcal">' + kcal(f.kcal100) + '</div></li>').join('') + '</ul>'
          : '<p class="muted small">None yet.</p>') +
        '<button class="btn ghost wide" id="nf">+ New food</button>';

      $('#nr', body).onclick = () => { closeSheet(); editRecipe(null); };
      $('#nf', body).onclick = () => { closeSheet(); editCustomFood(null); };
      $$('[data-recipe]', body).forEach(li => li.onclick = () => {
        const r = S.get().recipes.find(x => x.ref === li.dataset.recipe);
        closeSheet(); editRecipe(r);
      });
      $$('[data-cf]', body).forEach(li => li.onclick = () => {
        const f = S.get().customFoods.find(x => x.ref === li.dataset.cf);
        closeSheet(); editCustomFood(f);
      });
    }, { tall: true });
  }

  function exportData() {
    const blob = new Blob([S.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'fuel-backup-' + U.today() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Backup downloaded');
  }

  function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = () => {
      const file = input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          S.importJSON(reader.result);
          applyTheme();
          render();
          toast('Backup restored');
        } catch (err) {
          alert('Could not read that file: ' + err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  /* ================= QUICK LOG (floating button) ================= */

  function openQuickLog() {
    sheet('Log something', (body, close) => {
      const meals = S.meals();
      // Distinct icons make the meal you want easier to hit without reading.
      const mealIcons = ['&#127859;', '&#129386;', '&#127869;', '&#127822;', '&#129371;', '&#127853;'];
      body.innerHTML =
        '<div class="tiles">' +
          meals.slice(0, 6).map((m, i) =>
            '<button class="tile" data-qmeal="' + esc(m.id) + '">' +
              '<span class="tile-icon">' + mealIcons[i % mealIcons.length] + '</span>' +
              '<span class="tile-label">' + esc(m.name) + '</span></button>').join('') +
        '</div>' +
        '<div class="tiles">' +
          '<button class="tile" data-q="quick"><span class="tile-icon">&#9889;</span><span class="tile-label">Just calories</span></button>' +
          '<button class="tile" data-q="water"><span class="tile-icon">&#128167;</span><span class="tile-label">Water</span></button>' +
          '<button class="tile" data-q="weight"><span class="tile-icon">&#9878;</span><span class="tile-label">Weight</span></button>' +
          '<button class="tile" data-q="cardio"><span class="tile-icon">&#127939;</span><span class="tile-label">Activity</span></button>' +
          '<button class="tile" data-q="lift"><span class="tile-icon">&#127947;</span><span class="tile-label">Lift</span></button>' +
          '<button class="tile" data-q="steps"><span class="tile-icon">&#128099;</span><span class="tile-label">Steps</span></button>' +
        '</div>';

      $$('[data-qmeal]', body).forEach(b => b.onclick = () => {
        const id = b.dataset.qmeal;
        close();
        openFoodPicker(id);
      });

      const actions = {
        quick:  quickAdd,
        weight: () => openWeight(date),
        cardio: () => openCardio(null),
        lift:   () => openLift(null),
        steps:  openSteps,
        water:  () => {
          const d = S.day(date);
          d.waterMl += 250;
          S.save(); render();
          toast('Water ' + d.waterMl + ' ml');
        }
      };
      $$('[data-q]', body).forEach(b => b.onclick = () => {
        const fn = actions[b.dataset.q];
        close();
        if (b.dataset.q === 'water') fn(); else setTimeout(fn, 180);
      });
    });
  }

  /* ================= SETTINGS ================= */

  function openSettings() {
    sheet('Settings', (body, close) => {
      const p = S.get().profile;
      const kgNow = S.latestWeight();

      body.innerHTML =
        '<h3 class="sub-title">About you</h3>' +
        field('Sex', segmented('sex', [
          { v: 'male', label: 'Male' }, { v: 'female', label: 'Female' }, { v: 'other', label: 'Other' }
        ], p.sex), 'Used by the BMR equation only.') +
        '<div class="row gap">' +
          '<div class="flex1">' + field('Age', '<input type="number" inputmode="numeric" id="age" value="' + p.age + '">') + '</div>' +
          '<div class="flex1">' + field('Height (cm)', '<input type="number" inputmode="numeric" id="ht" value="' + p.heightCm + '">') + '</div>' +
        '</div>' +
        field('Current weight (kg)', '<input type="number" inputmode="decimal" step="any" id="wt" value="' + (kgNow || '') + '">',
          'Saves as today’s weigh-in.') +
        field('Day-to-day activity',
          '<select id="act">' + C.ACTIVITY_LEVELS.map(l =>
            '<option value="' + l.v + '"' + (Number(p.activity) === l.v ? ' selected' : '') + '>' +
            l.label + ' — ' + l.desc + '</option>').join('') + '</select>',
          'Exclude workouts you log in the app — those get added separately.') +

        '<h3 class="sub-title">Goal</h3>' +
        field('I want to', segmented('goal', [
          { v: 'lose', label: 'Lose' }, { v: 'maintain', label: 'Maintain' }, { v: 'gain', label: 'Gain' }
        ], p.goalType)) +
        '<div id="rateWrap">' +
          field('Rate (kg per week)',
            '<select id="rate">' + [0.25, 0.5, 0.75, 1].map(r =>
              '<option value="' + r + '"' + (Number(p.rateKgWeek) === r ? ' selected' : '') + '>' +
              r + ' kg/week' + (r <= 0.5 ? ' — steady' : r <= 0.75 ? ' — brisk' : ' — aggressive') +
              '</option>').join('') + '</select>') +
        '</div>' +
        field('Goal weight (kg), optional',
          '<input type="number" inputmode="decimal" step="any" id="gw" value="' + (p.goalWeightKg || '') + '">') +

        '<h3 class="sub-title">Calorie goal</h3>' +
        field('Daily target', segmented('cmode', [
          { v: 'auto', label: 'Work it out for me' }, { v: 'manual', label: 'I’ll set my own' }
        ], p.calorieMode)) +
        '<div id="manualCal" class="' + (p.calorieMode === 'manual' ? '' : 'hidden') + '">' +
          field('My calorie goal', '<input type="number" inputmode="numeric" id="mc" value="' + p.manualCalories + '">',
            'Your own number, used exactly as typed.') +
        '</div>' +
        '<div class="preview" id="calPrev"></div>' +
        switchRow('addEx', 'Add exercise calories to my budget', p.addExerciseCalories,
          'On: burning 400 kcal lets you eat 400 more. Off: your target stays fixed.') +

        '<h3 class="sub-title">Macros</h3>' +
        switchRow('trackMac', 'Track carbs and fat too', p.trackMacros,
          'Off: the app only nags you about protein.') +
        field('Protein', segmented('pmode', [
          { v: 'gkg', label: 'Per kg' }, { v: 'percent', label: '% kcal' }, { v: 'manual', label: 'Grams' }
        ], p.proteinMode)) +
        '<div id="pgkg" class="' + (p.proteinMode === 'gkg' ? '' : 'hidden') + '">' +
          field('Grams per kg of bodyweight',
            '<select id="pg">' + [1.2, 1.4, 1.6, 1.8, 2, 2.2].map(v =>
              '<option value="' + v + '"' + (Number(p.proteinGkg) === v ? ' selected' : '') + '>' + v +
              ' g/kg' + (v < 1.6 ? ' — general health' : v <= 2 ? ' — building muscle' : ' — cutting hard') +
              '</option>').join('') + '</select>') +
        '</div>' +
        '<div id="ppct" class="' + (p.proteinMode === 'percent' ? '' : 'hidden') + '">' +
          field('% of calories from protein', '<input type="number" inputmode="numeric" id="pp" value="' + p.proteinPercent + '">') +
        '</div>' +
        '<div id="pman" class="' + (p.proteinMode === 'manual' ? '' : 'hidden') + '">' +
          field('Protein per day (g)', '<input type="number" inputmode="numeric" id="pm" value="' + p.manualProtein + '">') +
        '</div>' +
        field('% of calories from fat', '<input type="number" inputmode="numeric" id="fp" value="' + p.fatPercent + '">',
          'Carbs fill whatever energy is left over.') +

        '<h3 class="sub-title">Daily targets</h3>' +
        '<div class="row gap">' +
          '<div class="flex1">' + field('Water (ml)', '<input type="number" inputmode="numeric" id="wg" value="' + p.waterGoalMl + '">') + '</div>' +
          '<div class="flex1">' + field('Steps', '<input type="number" inputmode="numeric" id="sg" value="' + p.stepGoal + '">') + '</div>' +
        '</div>' +

        '<h3 class="sub-title">Meals &amp; reminders</h3>' +
        '<button type="button" class="btn ghost wide" id="mealsBtn">Name my meals</button>' +
        '<button type="button" class="btn ghost wide" id="remindBtn">Reminders' +
          (p.notificationsOn && G.Notify.permission() === 'granted'
            ? ' <span class="pill on">' + p.reminders.filter(r => r.enabled).length + ' on</span>'
            : ' <span class="pill">off</span>') + '</button>' +

        '<h3 class="sub-title">Appearance</h3>' +
        field('Theme', segmented('theme', [
          { v: 'dark', label: 'Dark' }, { v: 'light', label: 'Light' }
        ], p.theme)) +

        '<button class="btn primary wide" id="save" style="margin-top:18px">Save settings</button>';

      /* live preview of what the settings produce */
      function collect() {
        const next = Object.assign({}, p, {
          sex: segValue($('[data-seg="sex"]', body)),
          age: Number($('#age', body).value) || p.age,
          heightCm: Number($('#ht', body).value) || p.heightCm,
          activity: Number($('#act', body).value),
          goalType: segValue($('[data-seg="goal"]', body)),
          rateKgWeek: Number($('#rate', body).value),
          goalWeightKg: Number($('#gw', body).value) || null,
          calorieMode: segValue($('[data-seg="cmode"]', body)),
          manualCalories: Number($('#mc', body).value) || p.manualCalories,
          addExerciseCalories: $('#addEx', body).checked,
          trackMacros: $('#trackMac', body).checked,
          proteinMode: segValue($('[data-seg="pmode"]', body)),
          proteinGkg: Number($('#pg', body).value),
          proteinPercent: Number($('#pp', body).value) || p.proteinPercent,
          manualProtein: Number($('#pm', body).value) || p.manualProtein,
          fatPercent: U.clamp(Number($('#fp', body).value) || p.fatPercent, 10, 60),
          waterGoalMl: Number($('#wg', body).value) || p.waterGoalMl,
          stepGoal: Number($('#sg', body).value) || p.stepGoal,
          theme: segValue($('[data-seg="theme"]', body))
        });
        return next;
      }

      function preview() {
        const next = collect();
        const w = Number($('#wt', body).value) || kgNow;
        const t = C.macroTargets(next, w);
        const maint = Math.round(C.tdee(next, w));
        $('#calPrev', body).innerHTML =
          '<div class="prev-kcal">' + kcal(t.kcal) + '<small> kcal a day</small></div>' +
          '<div class="prev-macros">' +
            '<span><b>' + t.protein + 'g</b> protein</span>' +
            '<span><b>' + t.carbs + 'g</b> carbs</span>' +
            '<span><b>' + t.fat + 'g</b> fat</span>' +
          '</div>' +
          '<div class="prev-g">Maintenance is about ' + kcal(maint) + ' kcal</div>';
        $('#rateWrap', body).classList.toggle('hidden', next.goalType === 'maintain');
        $('#manualCal', body).classList.toggle('hidden', next.calorieMode !== 'manual');
        $('#pgkg', body).classList.toggle('hidden', next.proteinMode !== 'gkg');
        $('#ppct', body).classList.toggle('hidden', next.proteinMode !== 'percent');
        $('#pman', body).classList.toggle('hidden', next.proteinMode !== 'manual');
      }

      body.addEventListener('input', preview);
      body.addEventListener('change', preview);
      body.addEventListener('pick', preview);   // segmented controls bubble 'pick'
      preview();

      /* Opening a sub-screen replaces this sheet, so anything typed is committed
         first — otherwise a trip to "Name my meals" would quietly discard it. */
      function commit() {
        Object.assign(S.get().profile, collect(), { onboarded: true });
        const w = Number($('#wt', body).value);
        if (w > 0 && w !== kgNow) S.logWeight(U.today(), U.round(w, 1), {});
        S.save();
        applyTheme();
      }

      $('#mealsBtn', body).onclick = () => { commit(); manageMeals(); };
      $('#remindBtn', body).onclick = () => { commit(); manageReminders(); };

      $('#save', body).onclick = () => {
        commit();
        close();
        render();
        toast('Settings saved');
      };
    }, { tall: true });
  }

  /* ================= MEAL NAMES ================= */

  function manageMeals() {
    sheet('My meals', (body) => {
      function paint() {
        const list = S.meals();
        body.innerHTML =
          '<p class="muted small" style="margin:-6px 0 16px">Name these whatever you actually eat — ' +
          '“Pre-workout”, “Tea”, “Late night”. Renaming one keeps everything already logged to it.</p>' +
          '<ul class="entries">' + list.map((m, i) =>
            '<li class="entry">' +
              '<div class="entry-main" data-rename="' + esc(m.id) + '">' +
                '<div class="entry-name">' + esc(m.name) + '</div>' +
                '<div class="entry-sub">Tap to rename</div>' +
              '</div>' +
              '<button class="x" data-up="' + esc(m.id) + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="Move up">&#8593;</button>' +
              '<button class="x" data-down="' + esc(m.id) + '"' + (i === list.length - 1 ? ' disabled' : '') + ' aria-label="Move down">&#8595;</button>' +
              (list.length > 1
                ? '<button class="x" data-rm="' + esc(m.id) + '" aria-label="Delete">&times;</button>' : '') +
            '</li>').join('') + '</ul>' +
          '<button class="btn ghost wide" id="addMeal">+ Add a meal</button>';

        $$('[data-rename]', body).forEach(el => el.onclick = () => {
          const id = el.dataset.rename;
          const meal = S.meals().find(m => m.id === id);
          sheet('Rename meal', (b2, close2) => {
            b2.innerHTML = field('Name', '<input id="mn" value="' + esc(meal.name) + '" maxlength="24">') +
                           '<button class="btn primary wide" id="ok2">Save</button>';
            $('#ok2', b2).onclick = () => {
              S.renameMeal(id, $('#mn', b2).value);
              close2();
              manageMeals();
              render();
            };
            setTimeout(() => { const i = $('#mn', b2); i.focus(); i.select(); }, 250);
          });
        });

        $$('[data-up]', body).forEach(b => b.onclick = () => { S.moveMeal(b.dataset.up, -1); paint(); render(); });
        $$('[data-down]', body).forEach(b => b.onclick = () => { S.moveMeal(b.dataset.down, 1); paint(); render(); });

        $$('[data-rm]', body).forEach(b => b.onclick = () => {
          const id = b.dataset.rm;
          const meal = S.meals().find(m => m.id === id);
          const others = S.meals().filter(m => m.id !== id);
          confirmSheet('Delete “' + meal.name + '”?',
            'Anything logged to it moves to “' + others[0].name + '” so no calories are lost.',
            () => { S.deleteMeal(id, others[0].id); manageMeals(); render(); });
        });

        $('#addMeal', body).onclick = () => {
          sheet('New meal', (b2, close2) => {
            b2.innerHTML = field('Name', '<input id="mn" placeholder="e.g. Pre-workout" maxlength="24">') +
                           '<button class="btn primary wide" id="ok2">Add</button>';
            $('#ok2', b2).onclick = () => {
              const v = $('#mn', b2).value.trim();
              if (!v) { toast('Give it a name.'); return; }
              S.addMeal(v);
              close2();
              manageMeals();
              render();
            };
            setTimeout(() => $('#mn', b2).focus(), 250);
          });
        };
      }
      paint();
    }, { tall: true });
  }

  /* ================= REMINDERS ================= */

  function manageReminders() {
    sheet('Reminders', (body) => {
      function paint() {
        const p = S.get().profile;
        const perm = G.Notify.permission();
        const blocked = perm === 'denied';
        const unsupported = perm === 'unsupported';

        body.innerHTML =
          (unsupported
            ? '<div class="notice bad">This browser cannot show notifications. On iPhone you need iOS 16.4 or newer, ' +
              'and the app must be added to your home screen.</div>'
            : blocked
              ? '<div class="notice bad">Notifications are blocked for this site. Turn them back on in your browser ' +
                'or phone settings, then come back here.</div>'
              : perm !== 'granted'
                ? '<div class="notice">Your phone needs to allow notifications first.</div>' +
                  '<button class="btn primary wide" id="ask">Allow notifications</button>'
                : '') +

          (perm === 'granted'
            ? switchRow('notifOn', 'Reminders on', p.notificationsOn,
                'Nudges you to log meals, drink water and weigh in.')
            : '') +

          '<h3 class="sub-title">Times</h3>' +
          '<ul class="entries">' + p.reminders.map(r =>
            '<li class="entry">' +
              '<div class="entry-main">' +
                '<div class="entry-name">' + esc(r.label) + '</div>' +
                '<div class="entry-sub">' + (r.enabled ? 'On at ' + esc(r.time) : 'Off') + '</div>' +
              '</div>' +
              '<input type="time" class="time-input" data-time="' + esc(r.id) + '" value="' + esc(r.time) + '">' +
              '<label class="switch"><input type="checkbox" data-on="' + esc(r.id) + '"' +
                (r.enabled ? ' checked' : '') + '><i></i></label>' +
            '</li>').join('') + '</ul>' +

          (perm === 'granted' ? '<button class="btn ghost wide" id="testN">Send a test notification</button>' : '') +

          '<div class="notice" style="margin-top:18px">' +
            '<b>Worth knowing.</b> A web app cannot hand alarms to your phone the way a ' +
            'shop-installed app can. Reminders fire reliably while Fuel is open or running in the ' +
            'background — on Android that is most of the time once it is installed to your home screen. ' +
            'On iPhone, if you swipe the app away it sleeps and nothing fires until you open it again. ' +
            'Anything you missed is shown the next time you open it.' +
          '</div>';

        const ask = $('#ask', body);
        if (ask) ask.onclick = async () => {
          const res = await G.Notify.request();
          if (res === 'granted') {
            S.get().profile.notificationsOn = true;
            S.save();
            G.Notify.start();
            toast('Notifications allowed');
          } else if (res === 'denied') {
            toast('Your phone said no');
          }
          paint();
        };

        const notifOn = $('#notifOn', body);
        if (notifOn) notifOn.onchange = () => {
          S.get().profile.notificationsOn = notifOn.checked;
          S.save();
          if (notifOn.checked) G.Notify.start(); else G.Notify.stop();
          paint();
        };

        $$('[data-time]', body).forEach(inp => inp.onchange = () => {
          const r = S.get().profile.reminders.find(x => x.id === inp.dataset.time);
          if (r) { r.time = inp.value; r.lastFired = null; S.save(); paint(); }
        });

        $$('[data-on]', body).forEach(cb => cb.onchange = async () => {
          const r = S.get().profile.reminders.find(x => x.id === cb.dataset.on);
          if (!r) return;
          r.enabled = cb.checked;
          // Turning one on for the first time implies wanting reminders at all.
          if (cb.checked && G.Notify.permission() === 'granted') {
            S.get().profile.notificationsOn = true;
            G.Notify.start();
          }
          S.save();
          paint();
        });

        const testN = $('#testN', body);
        if (testN) testN.onclick = async () => {
          const ok = await G.Notify.test();
          toast(ok ? 'Sent — check your notifications' : 'Could not send it');
        };
      }
      paint();
    }, { tall: true });
  }

  /* Reminders whose time passed while the app was shut are shown on reopen. */
  function showMissedReminders() {
    const p = S.get().profile;
    if (!p.notificationsOn) return;
    const missed = G.Notify.overdue().filter(r => r.enabled);
    if (!missed.length) return;
    missed.forEach(G.Notify.markFired);
    toast(missed.length === 1 ? missed[0].label : missed.length + ' reminders while you were away');
  }

  /* ================= ONBOARDING ================= */

  function openOnboarding() {
    sheet('Welcome to Fuel', (body, close) => {
      body.innerHTML =
        '<p class="muted" style="margin:-6px 0 18px">A few numbers and it will work out your maintenance calories, ' +
        'a daily target and your macros. You can change any of it later.</p>' +
        field('Sex', segmented('sex', [
          { v: 'male', label: 'Male' }, { v: 'female', label: 'Female' }, { v: 'other', label: 'Other' }
        ], 'male')) +
        '<div class="row gap">' +
          '<div class="flex1">' + field('Age', '<input type="number" inputmode="numeric" id="age" placeholder="25">') + '</div>' +
          '<div class="flex1">' + field('Height (cm)', '<input type="number" inputmode="numeric" id="ht" placeholder="178">') + '</div>' +
        '</div>' +
        field('Weight (kg)', '<input type="number" inputmode="decimal" step="any" id="wt" placeholder="75">') +
        field('How active are you day to day?',
          '<select id="act">' + C.ACTIVITY_LEVELS.map(l =>
            '<option value="' + l.v + '"' + (l.v === 1.375 ? ' selected' : '') + '>' +
            l.label + ' — ' + l.desc + '</option>').join('') + '</select>') +
        field('Goal', segmented('goal', [
          { v: 'lose', label: 'Lose fat' }, { v: 'maintain', label: 'Maintain' }, { v: 'gain', label: 'Build' }
        ], 'lose')) +
        '<div class="preview" id="prev"><div class="prev-g">Fill in the boxes above.</div></div>' +
        '<button class="btn primary wide" id="go">Start tracking</button>';

      function draft() {
        return Object.assign({}, S.get().profile, {
          sex: segValue($('[data-seg="sex"]', body)),
          age: Number($('#age', body).value) || 0,
          heightCm: Number($('#ht', body).value) || 0,
          activity: Number($('#act', body).value),
          goalType: segValue($('[data-seg="goal"]', body)),
          rateKgWeek: 0.5
        });
      }

      function preview() {
        const p = draft();
        const w = Number($('#wt', body).value) || 0;
        if (!p.age || !p.heightCm || !w) {
          $('#prev', body).innerHTML = '<div class="prev-g">Fill in the boxes above.</div>';
          return;
        }
        const t = C.macroTargets(p, w);
        $('#prev', body).innerHTML =
          '<div class="prev-kcal">' + kcal(t.kcal) + '<small> kcal a day</small></div>' +
          '<div class="prev-macros">' +
            '<span><b>' + t.protein + 'g</b> protein</span>' +
            '<span><b>' + t.carbs + 'g</b> carbs</span>' +
            '<span><b>' + t.fat + 'g</b> fat</span>' +
          '</div>' +
          '<div class="prev-g">Maintenance about ' + kcal(Math.round(C.tdee(p, w))) + ' kcal</div>';
      }

      body.addEventListener('input', preview);
      body.addEventListener('change', preview);
      body.addEventListener('pick', preview);   // segmented controls bubble 'pick'

      $('#go', body).onclick = () => {
        const p = draft();
        const w = Number($('#wt', body).value);
        if (!p.age || !p.heightCm || !w) { toast('Fill in age, height and weight.'); return; }
        p.goalWeightKg = p.goalType === 'maintain' ? null : null;
        p.onboarded = true;
        Object.assign(S.get().profile, p);
        S.logWeight(U.today(), U.round(w, 1), {});
        S.save();
        close();
        render();
      };
    }, { tall: true });
  }

  /* ================= boot ================= */

  function applyTheme() {
    const t = S.get().profile.theme || 'dark';
    document.documentElement.dataset.theme = t;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', t === 'light' ? '#f4f6fb' : '#0d1017');
  }

  function boot() {
    app = $('#app');
    nav = $('#nav');
    fab = $('#fab');
    S.load();
    applyTheme();

    $$('.nav-btn', nav).forEach(b => b.onclick = () => go(b.dataset.view));
    $('#settingsBtn').onclick = openSettings;
    $('#todayBtn').onclick = () => { date = U.today(); go('today'); render(); };
    fab.onclick = openQuickLog;

    // Rolling over midnight while the app sits open should land you on the new day.
    let lastSeen = U.today();
    setInterval(() => {
      const now = U.today();
      if (now !== lastSeen) {
        if (date === lastSeen) date = now;
        lastSeen = now;
        render();
      }
    }, 60000);

    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeSheet(); });

    render();
    if (!S.get().profile.onboarded) openOnboarding();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => G.Notify.setRegistration(reg))
        .catch(() => {});
    }

    if (S.get().profile.notificationsOn && G.Notify.permission() === 'granted') {
      showMissedReminders();
      G.Notify.start();
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window);
