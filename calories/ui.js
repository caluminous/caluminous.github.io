/* Fuel — reusable UI pieces: sheets, rings, charts, toasts. */
(function (G) {
  'use strict';

  const esc = s => G.Util.esc(s);
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------------- toast ---------------- */

  let toastTimer = null;
  function toast(msg) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
  }

  /* ---------------- bottom sheet ----------------
     Opens a panel over the app. `build` receives the body element and a close
     function, and fills in whatever the sheet needs. */

  let sheetCloser = null;

  function sheet(title, build, opts) {
    closeSheet();
    const options = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML =
      '<div class="sheet-backdrop"></div>' +
      '<div class="sheet' + (options.tall ? ' tall' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="sheet-head">' +
          '<div class="sheet-title">' + esc(title) + '</div>' +
          '<button class="sheet-x" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="sheet-body"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    document.body.classList.add('no-scroll');

    const close = () => {
      wrap.classList.add('closing');
      setTimeout(() => wrap.remove(), 180);
      document.body.classList.remove('no-scroll');
      sheetCloser = null;
      if (options.onClose) options.onClose();
    };
    sheetCloser = close;

    $('.sheet-x', wrap).addEventListener('click', close);
    $('.sheet-backdrop', wrap).addEventListener('click', close);

    build($('.sheet-body', wrap), close);
    requestAnimationFrame(() => wrap.classList.add('open'));
    return close;
  }

  function closeSheet() {
    if (sheetCloser) sheetCloser();
  }

  function confirmSheet(title, message, onYes, yesLabel) {
    sheet(title, (body, close) => {
      body.innerHTML =
        '<p class="muted" style="margin:0 0 18px">' + esc(message) + '</p>' +
        '<div class="row gap">' +
          '<button class="btn ghost flex1" data-no>Cancel</button>' +
          '<button class="btn danger flex1" data-yes>' + esc(yesLabel || 'Delete') + '</button>' +
        '</div>';
      $('[data-no]', body).onclick = close;
      $('[data-yes]', body).onclick = () => { close(); onYes(); };
    });
  }

  /* ---------------- calorie ring ----------------
     A single SVG arc. `pct` may exceed 1; the overflow is drawn in a warning
     colour on a second arc so going over the budget is obvious at a glance. */

  function ring(pct, centreTop, centreMain, centreSub, tone) {
    const R = 66, C = 2 * Math.PI * R;
    const main = Math.min(1, Math.max(0, pct));
    const over = Math.min(1, Math.max(0, pct - 1));
    const cls = tone ? ' ' + tone : '';
    return '' +
      '<svg class="ring" viewBox="0 0 160 160" aria-hidden="true">' +
        '<circle class="ring-track" cx="80" cy="80" r="' + R + '"></circle>' +
        '<circle class="ring-fill' + cls + '" cx="80" cy="80" r="' + R + '" ' +
          'stroke-dasharray="' + C + '" stroke-dashoffset="' + (C * (1 - main)) + '"></circle>' +
        (over > 0
          ? '<circle class="ring-over" cx="80" cy="80" r="' + R + '" stroke-dasharray="' + C +
            '" stroke-dashoffset="' + (C * (1 - over)) + '"></circle>'
          : '') +
      '</svg>' +
      '<div class="ring-centre">' +
        (centreTop ? '<div class="ring-top">' + esc(centreTop) + '</div>' : '') +
        '<div class="ring-main">' + esc(centreMain) + '</div>' +
        (centreSub ? '<div class="ring-sub">' + esc(centreSub) + '</div>' : '') +
      '</div>';
  }

  /* ---------------- macro / progress bar ---------------- */

  function bar(label, value, target, unit, tone) {
    const pct = target > 0 ? Math.min(1, value / target) : 0;
    const over = target > 0 && value > target;
    return '' +
      '<div class="mbar">' +
        '<div class="mbar-top">' +
          '<span class="mbar-label">' + esc(label) + '</span>' +
          '<span class="mbar-val' + (over ? ' over' : '') + '">' +
            Math.round(value) + (target ? ' / ' + Math.round(target) : '') + (unit || '') +
          '</span>' +
        '</div>' +
        '<div class="mbar-track"><i class="' + (tone || '') + (over ? ' over' : '') +
          '" style="width:' + (pct * 100).toFixed(1) + '%"></i></div>' +
      '</div>';
  }

  /* ---------------- line chart ----------------
     points: [{x: number, y: number, label: string}], optional overlay series. */

  function lineChart(points, opts) {
    const o = opts || {};
    const W = 320, H = 150, padL = 34, padR = 8, padT = 12, padB = 22;
    if (!points || points.length === 0) {
      return '<div class="chart-empty">Not enough data yet</div>';
    }
    if (points.length === 1) {
      return '<div class="chart-empty">Log at least twice to see a chart</div>';
    }

    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const overlay = o.overlay || [];
    const allY = ys.concat(overlay.map(p => p.y));
    let minY = Math.min.apply(null, allY), maxY = Math.max.apply(null, allY);
    const span = maxY - minY;
    const pad = span < 0.5 ? 0.5 : span * 0.15;
    minY -= pad; maxY += pad;
    const minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs);

    const sx = x => padL + ((x - minX) / (maxX - minX || 1)) * (W - padL - padR);
    const sy = y => padT + (1 - (y - minY) / (maxY - minY || 1)) * (H - padT - padB);

    const path = ps => ps.map((p, i) => (i ? 'L' : 'M') + sx(p.x).toFixed(1) + ' ' + sy(p.y).toFixed(1)).join(' ');
    const area = path(points) +
      ' L' + sx(points[points.length - 1].x).toFixed(1) + ' ' + (H - padB) +
      ' L' + sx(points[0].x).toFixed(1) + ' ' + (H - padB) + ' Z';

    // Three horizontal guides with values.
    let guides = '';
    for (let i = 0; i <= 2; i++) {
      const v = minY + (maxY - minY) * (i / 2);
      const y = sy(v);
      guides += '<line class="grid" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '"></line>' +
                '<text class="axis" x="' + (padL - 6) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end">' +
                  (o.dp != null ? v.toFixed(o.dp) : Math.round(v)) + '</text>';
    }

    // Goal line, if one is in range.
    let goalLine = '';
    if (o.goal != null && o.goal >= minY && o.goal <= maxY) {
      const gy = sy(o.goal);
      goalLine = '<line class="goal-line" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '"></line>';
    }

    const first = points[0].label, last = points[points.length - 1].label;
    const dots = points.length <= 30
      ? points.map(p => '<circle class="dot" cx="' + sx(p.x).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) + '" r="2.6"></circle>').join('')
      : '';

    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img">' +
      guides + goalLine +
      '<path class="area" d="' + area + '"></path>' +
      (overlay.length > 1 ? '<path class="trend" d="' + path(overlay) + '"></path>' : '') +
      '<path class="line" d="' + path(points) + '"></path>' +
      dots +
      '<text class="axis" x="' + padL + '" y="' + (H - 6) + '">' + esc(first) + '</text>' +
      '<text class="axis" x="' + (W - padR) + '" y="' + (H - 6) + '" text-anchor="end">' + esc(last) + '</text>' +
    '</svg>';
  }

  /* ---------------- bar chart ----------------
     bars: [{label, value, tone}], with an optional target line. */

  function barChart(bars, opts) {
    const o = opts || {};
    if (!bars || !bars.length) return '<div class="chart-empty">Nothing logged yet</div>';
    const W = 320, H = 150, padL = 34, padR = 8, padT = 12, padB = 22;
    const maxV = Math.max(o.goal || 0, Math.max.apply(null, bars.map(b => b.value)), 1) * 1.12;
    const bw = (W - padL - padR) / bars.length;
    const sy = v => padT + (1 - v / maxV) * (H - padT - padB);

    let out = '';
    for (let i = 0; i <= 2; i++) {
      const v = maxV * (i / 2), y = sy(v);
      out += '<line class="grid" x1="' + padL + '" y1="' + y.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y.toFixed(1) + '"></line>' +
             '<text class="axis" x="' + (padL - 6) + '" y="' + (y + 3.5).toFixed(1) + '" text-anchor="end">' + Math.round(v) + '</text>';
    }

    bars.forEach((b, i) => {
      const x = padL + i * bw + bw * 0.18;
      const w = bw * 0.64;
      const y = sy(b.value);
      const h = Math.max(b.value > 0 ? 2 : 0, (H - padB) - y);
      out += '<rect class="bar ' + (b.tone || '') + '" x="' + x.toFixed(1) + '" y="' + y.toFixed(1) +
             '" width="' + w.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="3"></rect>' +
             '<text class="axis" x="' + (x + w / 2).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + esc(b.label) + '</text>';
    });

    if (o.goal) {
      const gy = sy(o.goal);
      out += '<line class="goal-line" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '"></line>';
    }

    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img">' + out + '</svg>';
  }

  /* ---------------- misc helpers ---------------- */

  function segmented(name, options, current) {
    return '<div class="seg" data-seg="' + esc(name) + '">' +
      options.map(o =>
        '<button type="button" class="seg-btn' + (String(o.v) === String(current) ? ' active' : '') +
        '" data-v="' + esc(o.v) + '">' + esc(o.label) + '</button>'
      ).join('') + '</div>';
  }

  /* One delegated handler drives every segmented control, wherever it is —
     main view or sheet — so callers only ever listen for the 'pick' event.
     The event bubbles, so a container can watch all of its segments at once. */
  document.addEventListener('click', e => {
    const btn = e.target.closest && e.target.closest('.seg-btn');
    if (!btn) return;
    const seg = btn.closest('.seg');
    if (!seg) return;
    seg.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b === btn));
    seg.dispatchEvent(new CustomEvent('pick', { detail: btn.dataset.v, bubbles: true }));
  });

  /* A div rather than a label: these wrap selects, segmented buttons and
     switches, and nesting those inside a <label> makes clicks misfire. */
  function field(label, inner, hint) {
    return '<div class="field">' +
      '<span class="field-label">' + esc(label) + '</span>' + inner +
      (hint ? '<span class="field-hint">' + esc(hint) + '</span>' : '') +
    '</div>';
  }

  function switchRow(id, label, on, hint) {
    return '<div class="switch-row">' +
      '<div class="switch-text">' +
        '<span class="field-label">' + esc(label) + '</span>' +
        (hint ? '<span class="field-hint">' + esc(hint) + '</span>' : '') +
      '</div>' +
      '<label class="switch"><input type="checkbox" id="' + esc(id) + '"' + (on ? ' checked' : '') + '><i></i></label>' +
    '</div>';
  }

  function emptyState(icon, title, sub) {
    return '<div class="empty">' +
      '<div class="empty-icon">' + icon + '</div>' +
      '<div class="empty-title">' + esc(title) + '</div>' +
      (sub ? '<div class="empty-sub">' + esc(sub) + '</div>' : '') +
    '</div>';
  }

  G.UI = { $, $$, esc, toast, sheet, closeSheet, confirmSheet, ring, bar,
           lineChart, barChart, segmented, field, switchRow, emptyState };
})(window);
