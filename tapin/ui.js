/* Tap In — reusable interface pieces: sheets, toasts, fields, charts. */
(function (G) {
  'use strict';

  const esc = s => G.Util.esc(s);
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------------- toast ---------------- */

  let toastTimer = null;
  function toast(msg, kind) {
    let el = $('#toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.className = 'show' + (kind ? ' ' + kind : '');
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.className = ''; }, kind === 'long' ? 4200 : 2400);
  }

  /* ---------------- bottom sheet ---------------- */

  const openSheets = [];

  function sheet(title, build, opts) {
    const options = opts || {};
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap' + (options.full ? ' full' : '');
    wrap.innerHTML =
      '<div class="sheet-backdrop"></div>' +
      '<div class="sheet' + (options.tall ? ' tall' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
        '<div class="sheet-grab"></div>' +
        (title === null ? '' :
          '<div class="sheet-head">' +
            '<div class="sheet-title">' + esc(title) + '</div>' +
            '<button class="sheet-x" aria-label="Close">&times;</button>' +
          '</div>') +
        '<div class="sheet-body"></div>' +
      '</div>';
    document.body.appendChild(wrap);
    document.body.classList.add('no-scroll');

    let closed = false;
    const close = (result) => {
      if (closed) return;
      closed = true;
      wrap.classList.add('closing');
      setTimeout(() => wrap.remove(), 200);
      const i = openSheets.indexOf(close);
      if (i >= 0) openSheets.splice(i, 1);
      if (!openSheets.length) document.body.classList.remove('no-scroll');
      if (options.onClose) options.onClose(result);
    };
    openSheets.push(close);

    const x = $('.sheet-x', wrap);
    if (x) x.addEventListener('click', () => close());
    if (!options.sticky) $('.sheet-backdrop', wrap).addEventListener('click', () => close());

    build($('.sheet-body', wrap), close, wrap);
    requestAnimationFrame(() => wrap.classList.add('in'));
    return close;
  }

  function closeTopSheet() {
    const close = openSheets[openSheets.length - 1];
    if (close) { close(); return true; }
    return false;
  }

  /* ---------------- confirm ---------------- */

  function confirmSheet(title, body, okLabel, onOk, opts) {
    const o = opts || {};
    sheet(title, (el, close) => {
      el.innerHTML =
        '<p class="sheet-copy">' + body + '</p>' +
        '<div class="sheet-actions">' +
          '<button class="btn ghost" data-a="no">' + esc(o.cancelLabel || 'Cancel') + '</button>' +
          '<button class="btn ' + (o.danger ? 'danger' : 'primary') + '" data-a="yes">' + esc(okLabel) + '</button>' +
        '</div>';
      $('[data-a="no"]', el).onclick = () => close();
      $('[data-a="yes"]', el).onclick = () => { close(); onOk(); };
    });
  }

  /* ---------------- form fields ----------------
     Every input in this app is one of a handful of shapes, so they are
     built here rather than repeated across the views. */

  function field(label, inner, hint) {
    return '<label class="field">' +
      '<span class="field-label">' + esc(label) + '</span>' + inner +
      (hint ? '<span class="field-hint">' + hint + '</span>' : '') +
      '</label>';
  }

  function textField(label, name, value, opts) {
    const o = opts || {};
    return field(label,
      '<input class="input" name="' + name + '" type="' + (o.type || 'text') +
      '" value="' + esc(value == null ? '' : value) + '"' +
      (o.placeholder ? ' placeholder="' + esc(o.placeholder) + '"' : '') +
      (o.inputmode ? ' inputmode="' + o.inputmode + '"' : '') +
      (o.step ? ' step="' + o.step + '"' : '') +
      (o.maxlength ? ' maxlength="' + o.maxlength + '"' : '') +
      (o.autofocus ? ' autofocus' : '') + '>', o.hint);
  }

  function numField(label, name, value, opts) {
    const o = Object.assign({ type: 'number', inputmode: 'decimal', step: 'any' }, opts || {});
    return textField(label, name, value, o);
  }

  function selectField(label, name, value, options, hint) {
    const opts = options.map(o => {
      const v = o.value != null ? o.value : o;
      const l = o.label != null ? o.label : o;
      return '<option value="' + esc(v) + '"' + (String(v) === String(value) ? ' selected' : '') + '>' + esc(l) + '</option>';
    }).join('');
    return field(label, '<select class="input" name="' + name + '">' + opts + '</select>', hint);
  }

  function toggleRow(label, name, on, hint) {
    return '<div class="toggle-row">' +
      '<div><div class="toggle-label">' + esc(label) + '</div>' +
      (hint ? '<div class="toggle-hint">' + hint + '</div>' : '') + '</div>' +
      '<button class="switch' + (on ? ' on' : '') + '" role="switch" aria-checked="' + (!!on) + '" data-toggle="' + name + '"><span></span></button>' +
      '</div>';
  }

  function wireToggles(root, onChange) {
    $$('[data-toggle]', root).forEach(btn => {
      btn.onclick = () => {
        const on = !btn.classList.contains('on');
        btn.classList.toggle('on', on);
        btn.setAttribute('aria-checked', String(on));
        onChange(btn.getAttribute('data-toggle'), on);
      };
    });
  }

  /* A stepper for the numbers you change one notch at a time mid-set. */
  function stepper(name, value, step, unit) {
    return '<div class="stepper" data-stepper="' + name + '" data-step="' + step + '">' +
      '<button type="button" data-d="-1" aria-label="Less">−</button>' +
      '<input class="stepper-val" name="' + name + '" type="number" inputmode="decimal" step="any" value="' + (value == null ? '' : esc(value)) + '">' +
      (unit ? '<span class="stepper-unit">' + esc(unit) + '</span>' : '') +
      '<button type="button" data-d="1" aria-label="More">+</button>' +
      '</div>';
  }

  function wireSteppers(root) {
    $$('[data-stepper]', root).forEach(box => {
      const step = parseFloat(box.getAttribute('data-step')) || 1;
      const input = $('input', box);
      $$('button', box).forEach(b => {
        b.onclick = () => {
          const d = parseFloat(b.getAttribute('data-d'));
          const cur = parseFloat(input.value);
          const next = Math.max(0, (isNaN(cur) ? 0 : cur) + d * step);
          input.value = G.Util.round(next, 2);
          input.dispatchEvent(new Event('input', { bubbles: true }));
        };
      });
    });
  }

  function values(root) {
    const out = {};
    $$('input,select,textarea', root).forEach(el => {
      if (!el.name) return;
      out[el.name] = el.type === 'number' ? (el.value === '' ? null : parseFloat(el.value)) : el.value;
    });
    return out;
  }

  /* ---------------- chips ---------------- */

  function chips(name, value, options) {
    return '<div class="chips" data-chips="' + name + '">' +
      options.map(o => {
        const v = o.value != null ? o.value : o;
        const l = o.label != null ? o.label : o;
        return '<button type="button" class="chip' + (String(v) === String(value) ? ' on' : '') + '" data-v="' + esc(v) + '">' +
          (o.icon || '') + esc(l) + '</button>';
      }).join('') + '</div>';
  }

  function wireChips(root, onPick) {
    $$('[data-chips]', root).forEach(box => {
      const name = box.getAttribute('data-chips');
      $$('.chip', box).forEach(c => {
        c.onclick = () => {
          $$('.chip', box).forEach(o => o.classList.remove('on'));
          c.classList.add('on');
          onPick(name, c.getAttribute('data-v'));
        };
      });
    });
  }

  /* ---------------- charts ----------------
     Small inline SVGs — no library, no network, and they theme themselves
     off currentColor. */

  function barChart(points, opts) {
    const o = Object.assign({ height: 74, gap: 3, format: v => String(v) }, opts || {});
    if (!points.length) return '<div class="chart-empty">Nothing yet</div>';
    const max = Math.max(1, ...points.map(p => p.value));
    const w = 100 / points.length;
    return '<div class="bars" style="height:' + o.height + 'px">' +
      points.map(p => {
        const h = Math.max(p.value > 0 ? 4 : 1, Math.round(p.value / max * 100));
        return '<div class="bar-slot" style="width:' + w + '%" title="' + esc(p.label + ': ' + o.format(p.value)) + '">' +
          '<div class="bar' + (p.highlight ? ' hi' : '') + (p.value > 0 ? '' : ' zero') + '" style="height:' + h + '%"></div>' +
          '<span class="bar-tick">' + esc(p.tick || '') + '</span>' +
          '</div>';
      }).join('') + '</div>';
  }

  function sparkline(values, opts) {
    const o = Object.assign({ width: 300, height: 60, invert: false }, opts || {});
    const vals = values.filter(v => typeof v === 'number' && isFinite(v));
    if (vals.length < 2) return '<div class="chart-empty">Not enough data yet</div>';
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = (max - min) || 1;
    const pts = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * o.width;
      const norm = (v - min) / span;
      const y = o.height - (o.invert ? 1 - norm : norm) * (o.height - 8) - 4;
      return [G.Util.round(x, 1), G.Util.round(y, 1)];
    });
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ' ' + p[1]).join(' ');
    const area = line + ' L' + o.width + ' ' + o.height + ' L0 ' + o.height + ' Z';
    return '<svg class="spark" viewBox="0 0 ' + o.width + ' ' + o.height + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<path class="spark-area" d="' + area + '"></path>' +
      '<path class="spark-line" d="' + line + '"></path>' +
      '<circle class="spark-dot" cx="' + pts[pts.length - 1][0] + '" cy="' + pts[pts.length - 1][1] + '" r="3"></circle>' +
      '</svg>';
  }

  function ring(pct, label, sub, opts) {
    const o = opts || {};
    const size = o.size || 132;
    const r = (size / 2) - 11;
    const c = 2 * Math.PI * r;
    const p = G.Util.clamp(pct || 0, 0, 1);
    return '<div class="ring" style="width:' + size + 'px;height:' + size + 'px">' +
      '<svg viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">' +
        '<circle class="ring-bg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '"></circle>' +
        '<circle class="ring-fg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" ' +
          'stroke-dasharray="' + G.Util.round(c, 1) + '" stroke-dashoffset="' + G.Util.round(c * (1 - p), 1) + '" ' +
          'transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"></circle>' +
      '</svg>' +
      '<div class="ring-mid"><div class="ring-val">' + label + '</div>' +
      (sub ? '<div class="ring-sub">' + esc(sub) + '</div>' : '') + '</div></div>';
  }

  /* ---------------- misc ---------------- */

  function stat(value, label, opts) {
    const o = opts || {};
    return '<div class="stat' + (o.wide ? ' wide' : '') + '">' +
      '<div class="stat-val">' + value + '</div>' +
      '<div class="stat-label">' + esc(label) + '</div></div>';
  }

  function empty(icon, title, body, action) {
    return '<div class="empty">' +
      '<div class="empty-icon">' + icon + '</div>' +
      '<h3>' + esc(title) + '</h3>' +
      '<p>' + body + '</p>' +
      (action || '') + '</div>';
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  G.UI = {
    $, $$, esc, toast, sheet, closeTopSheet, confirmSheet,
    field, textField, numField, selectField, toggleRow, wireToggles,
    stepper, wireSteppers, values, chips, wireChips,
    barChart, sparkline, ring, stat, empty, download
  };

})(window.TapIn = window.TapIn || {});
