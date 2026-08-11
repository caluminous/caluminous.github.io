/* Cast — rendering helpers, icons, star ratings and the rig diagram engine.

   Rig diagrams are generated, not drawn. Every rig in data.js is a list of components
   with a position along the line; this file turns that into SVG, so all 20 diagrams
   share one visual language and a new rig costs six lines of data. */
(function (G) {
  'use strict';

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  function h(tag, attrs = {}, children = []) {
    const n = document.createElement(tag);
    for (const [k, val] of Object.entries(attrs)) {
      if (val == null || val === false) continue;
      if (k === 'class') n.className = val;
      else if (k === 'html') n.innerHTML = val;
      else if (k === 'text') n.textContent = val;
      else if (k.startsWith('on') && typeof val === 'function') n.addEventListener(k.slice(2).toLowerCase(), val);
      else if (k === 'dataset') Object.assign(n.dataset, val);
      else n.setAttribute(k, val === true ? '' : val);
    }
    for (const c of [].concat(children)) {
      if (c == null || c === false) continue;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return n;
  }

  /* ---------------------------------------------------------------- icons */

  const ICON_PATHS = {
    car: '<path d="M5 16h14M6.5 16V9.8L8 6h8l1.5 3.8V16M4 10h16M7.5 19v-3M16.5 19v-3"/><circle cx="8" cy="13" r=".9"/><circle cx="16" cy="13" r=".9"/>',
    toilet: '<path d="M12 3v18M7 6h.01M17 6h.01"/><path d="M5 21c0-4 1-6 2-6s2 2 2 6M15 21c0-4 1-6 2-6s2 2 2 6"/><circle cx="7" cy="6" r="1.6"/><circle cx="17" cy="6" r="1.6"/>',
    tackle: '<path d="M4 6h9a6 6 0 0 1 0 12H8"/><path d="M4 6v6M8 18l-2.5 2.5M8 18l2.5 2.5"/><circle cx="4" cy="6" r="1.4"/>',
    cafe: '<path d="M4 8h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z"/><path d="M16 9h2.5a2.5 2.5 0 0 1 0 5H16M6 3.5V5M10 3.5V5M14 3.5V5"/>',
    accessible: '<circle cx="12" cy="5" r="1.8"/><path d="M9 9h6M12 9v6h5M9 12a5 5 0 1 0 6 6"/>',
    moon: '<path d="M20 13.5A8 8 0 1 1 10.5 4a6.5 6.5 0 0 0 9.5 9.5z"/>',
    dog: '<path d="M5 9V5l3 2h5l3-2v4M4 12c0 4 3 7 8 7s8-3 8-7c0-2-1-3-2-3H6c-1 0-2 1-2 3z"/><path d="M10 14h.01M14 14h.01M12 16v1"/>',
    badge: '<path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    pin: '<path d="M12 21s7-6 7-11a7 7 0 1 0-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
    map: '<path d="M9 4L3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5z"/><path d="M9 4v13M15 6.5v13"/>',
    book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v14H6.5A2.5 2.5 0 0 0 4 19.5z"/><path d="M4 19.5V21h16"/>',
    fish: '<path d="M3 12c3-4 7-6 11-6 3.5 0 6 2 7 6-1 4-3.5 6-7 6-4 0-8-2-11-6z"/><path d="M17 12h.01"/><path d="M3 12l-1-3M3 12l-1 3"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20c1-4 3.5-6 7-6s6 2 7 6"/>',
    star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>',
    warn: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    back: '<path d="M15 19l-7-7 7-7"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    filter: '<path d="M3 6h18M6 12h12M10 18h4"/>',
    directions: '<path d="M12 2l10 10-10 10L2 12z"/><path d="M9 14v-2.5A2.5 2.5 0 0 1 11.5 9H15"/><path d="M13 7l2 2-2 2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    wind: '<path d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5M3 12h14a3 3 0 1 1-3 3M3 16h7a2 2 0 1 1-2 2"/>',
    drop: '<path d="M12 3s6 6.5 6 10.5a6 6 0 0 1-12 0C6 9.5 12 3 12 3z"/>',
    gauge: '<path d="M4 16a8 8 0 1 1 16 0"/><path d="M12 16l4-4"/>'
  };

  function icon(name, size = 20, cls = '') {
    const d = ICON_PATHS[name];
    if (!d) return '';
    return `<svg class="icon ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">${d}</svg>`;
  }

  /* ---------------------------------------------------------------- stars */

  function starsHtml(value, { size = 14, label = null } = {}) {
    if (value == null) return `<span class="stars is-empty" title="Not rated">Not rated</span>`;
    const pct = Math.max(0, Math.min(100, (value / 5) * 100));
    const row = '★★★★★';
    return `<span class="stars" style="--star-size:${size}px" role="img" aria-label="${esc(label || value.toFixed(1) + ' out of 5')}">
      <span class="stars-back" aria-hidden="true">${row}</span>
      <span class="stars-fill" style="width:${pct}%" aria-hidden="true">${row}</span>
    </span>`;
  }

  function starPicker(current, onPick) {
    const wrap = h('div', { class: 'star-picker', role: 'group', 'aria-label': 'Your rating' });
    for (let i = 1; i <= 5; i++) {
      const b = h('button', {
        type: 'button',
        class: 'star-btn' + (current >= i ? ' is-on' : ''),
        'aria-label': `${i} star${i > 1 ? 's' : ''}`,
        'aria-pressed': current === i,
        onclick: () => onPick(current === i ? null : i)
      }, [h('span', { html: '★' })]);
      wrap.appendChild(b);
    }
    if (current) {
      wrap.appendChild(h('button', {
        type: 'button', class: 'star-clear', onclick: () => onPick(null), text: 'Clear'
      }));
    }
    return wrap;
  }

  /* ------------------------------------------------------------ score ring */

  function scoreRing(score, label, size = 62) {
    const r = (size - 8) / 2;
    const circ = 2 * Math.PI * r;
    const pct = score == null ? 0 : Math.max(0, Math.min(100, score));
    const tone = score == null ? 'unknown' : pct >= 68 ? 'good' : pct >= 44 ? 'ok' : 'poor';
    return `<div class="score-ring tone-${tone}" style="--ring:${size}px">
      <svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
        <circle class="ring-track" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="5" fill="none"/>
        <circle class="ring-value" cx="${size / 2}" cy="${size / 2}" r="${r}" stroke-width="5" fill="none"
          stroke-dasharray="${(circ * pct / 100).toFixed(1)} ${circ.toFixed(1)}"
          transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg>
      <span class="ring-text">${score == null ? '?' : Math.round(score)}</span>
      ${label ? `<span class="ring-label">${esc(label)}</span>` : ''}
    </div>`;
  }

  /* ---------------------------------------------------- rig diagram engine */

  /* Wide enough that the longest component label ("Two size 6 semi-barbless trebles")
     fits in the right-hand column without clipping. */
  const W = 384, HGT = 330;

  /* Each style gives the line a shape and decides where the water and the bed sit. */
  const LAYOUTS = {
    ledger: { p0: [62, 14], p1: [70, 150], p2: [126, 274], water: 26, bed: 286 },
    float:  { p0: [100, 10], p1: [100, 150], p2: [100, 276], water: 62, bed: 288 },
    lure:   { p0: [46, 18], p1: [96, 130], p2: [150, 262], water: 26, bed: null }
  };

  function bez(L, t) {
    const mt = 1 - t;
    return [
      mt * mt * L.p0[0] + 2 * mt * t * L.p1[0] + t * t * L.p2[0],
      mt * mt * L.p0[1] + 2 * mt * t * L.p1[1] + t * t * L.p2[1]
    ];
  }

  const GLYPH = {
    hook: (x, y) => `<path class="g-hook" d="M${x} ${y - 13} v9 a7 7 0 1 0 8 -1.5" />
                     <path class="g-hook-point" d="M${x + 8} ${y - 4} l3.4 4.6" />`,
    bait: (x, y) => `<circle class="g-bait" cx="${x + 11}" cy="${y + 6}" r="6.2"/>`,
    lead: (x, y) => `<path class="g-lead" d="M${x} ${y - 12} c8 3 11 10 11 15 a11 11 0 0 1 -22 0 c0 -5 3 -12 11 -15z"/>`,
    feeder: (x, y) => `<rect class="g-feeder" x="${x - 11}" y="${y - 13}" width="22" height="26" rx="7"/>
                       <path class="g-feeder-line" d="M${x - 5} ${y - 6} h10 M${x - 5} ${y} h10 M${x - 5} ${y + 6} h10"/>`,
    float: (x, y) => `<path class="g-float" d="M${x} ${y - 26} v16"/>
                      <ellipse class="g-float-body" cx="${x}" cy="${y + 2}" rx="6" ry="13"/>
                      <path class="g-float-stem" d="M${x} ${y + 15} v10"/>`,
    shot: (x, y) => `<circle class="g-shot" cx="${x}" cy="${y}" r="3.6"/>`,
    bead: (x, y) => `<circle class="g-bead" cx="${x}" cy="${y}" r="4.4"/>`,
    stop: (x, y) => `<rect class="g-stop" x="${x - 3}" y="${y - 3}" width="6" height="6" rx="1.6"/>`,
    swivel: (x, y) => `<circle class="g-swivel" cx="${x}" cy="${y - 4}" r="3.4"/>
                       <circle class="g-swivel" cx="${x}" cy="${y + 4}" r="3.4"/>
                       <path class="g-swivel-bar" d="M${x} ${y - 1} v2"/>`,
    sleeve: (x, y) => `<rect class="g-sleeve" x="${x - 4}" y="${y - 9}" width="8" height="18" rx="4"/>`,
    boom: (x, y) => `<path class="g-boom" d="M${x} ${y} l26 12"/><circle class="g-shot" cx="${x + 26}" cy="${y + 12}" r="2.6"/>`,
    blade: (x, y) => `<path class="g-blade" d="M${x} ${y - 12} c11 5 11 19 0 24 c-11 -5 -11 -19 0 -24z"/>
                      <circle class="g-bead" cx="${x}" cy="${y - 12}" r="2.6"/>`,
    fly: (x, y) => `<path class="g-hook" d="M${x} ${y - 8} v6 a5.5 5.5 0 1 0 6 -1"/>
                    <path class="g-fly-wing" d="M${x - 7} ${y - 10} q7 -6 14 0 q-7 4 -14 0z"/>`,
    clip: (x, y) => `<path class="g-clip" d="M${x - 4} ${y - 8} v10 a4.5 4.5 0 0 0 9 0 v-6"/>`,
    line: (x, y) => `<circle class="g-bead" cx="${x}" cy="${y}" r="3"/>`
  };

  function rigDiagramHtml(rig) {
    const L = LAYOUTS[rig.style] || LAYOUTS.ledger;
    const parts = [...rig.parts].sort((a, b) => a.p - b.p);

    let svg = `<svg class="rig-svg" viewBox="0 0 ${W} ${HGT}" role="img" aria-label="${esc(rig.name)} diagram">`;

    /* water and bed give the diagram a sense of up and down */
    svg += `<path class="rig-water" d="M0 ${L.water} q12 -5 24 0 t24 0 t24 0 t24 0 t24 0 t24 0 t24 0"/>`;
    svg += `<rect class="rig-water-fill" x="0" y="${L.water}" width="${W}" height="${HGT - L.water}"/>`;
    if (L.bed != null) {
      svg += `<path class="rig-bed" d="M0 ${L.bed} q18 -7 36 -2 t36 3 t36 -4 t36 2 t36 -3 t36 4 t36 -2 t36 3 t36 -2 L${W} ${HGT} L0 ${HGT} z"/>`;
    }

    /* the line itself, with the hooklength drawn heavier where a sleeve marks it */
    const d = `M${L.p0[0]} ${L.p0[1]} Q${L.p1[0]} ${L.p1[1]} ${L.p2[0]} ${L.p2[1]}`;
    svg += `<path class="rig-line" d="${d}"/>`;

    /* labels get evenly spaced slots down the right so they never collide */
    const labelX = 176;
    const slotTop = 30, slotGap = Math.min(34, (HGT - 60) / Math.max(1, parts.length));

    parts.forEach((part, i) => {
      const t = Math.max(0, Math.min(1, part.p));
      const [x, y] = bez(L, t);
      const slotY = slotTop + i * slotGap;

      svg += `<path class="rig-leader" d="M${x + 12} ${y} L${labelX - 8} ${slotY}"/>`;
      const glyph = GLYPH[part.t] || GLYPH.bead;
      svg += glyph(x, y);
      svg += `<text class="rig-label" x="${labelX}" y="${slotY + 3.5}">${esc(part.label)}</text>`;
    });

    svg += '</svg>';
    return svg;
  }

  function rigCard(rig, { open = false } = {}) {
    const card = h('details', { class: 'rig-card', open });
    card.appendChild(h('summary', {}, [
      h('span', { class: 'rig-name', text: rig.name }),
      h('span', { class: 'rig-use', text: rig.use })
    ]));
    const body = h('div', { class: 'rig-body' });
    body.appendChild(h('div', { class: 'rig-diagram', html: rigDiagramHtml(rig) }));
    if (rig.tips && rig.tips.length) {
      body.appendChild(h('ul', { class: 'rig-tips' }, rig.tips.map((t) => h('li', { text: t }))));
    }
    card.appendChild(body);
    return card;
  }

  /* ------------------------------------------------------------- fragments */

  function chip(text, cls = '') {
    return `<span class="chip ${cls}">${esc(text)}</span>`;
  }

  function facilityRow(ids, { max = 8 } = {}) {
    if (!ids || !ids.length) return '';
    return '<div class="facility-row">' + ids.slice(0, max).map((id) => {
      const f = G.data.facility(id);
      if (!f) return '';
      return `<span class="facility" title="${esc(f.label)}">${icon(f.icon, 15)}<span class="facility-label">${esc(f.label)}</span></span>`;
    }).join('') + '</div>';
  }

  function bandClass(band) {
    return ({
      'Good bet': 'good', 'Drop everything': 'good',
      'Worth a go': 'ok', 'Steady': 'ok',
      'Long shot': 'meh', 'Hard work': 'meh',
      'Unlikely': 'poor', 'Out of season': 'poor', 'No forecast': 'unknown'
    })[band] || 'unknown';
  }

  function toast(message, kind = 'info') {
    let host = document.getElementById('toasts');
    if (!host) {
      host = h('div', { id: 'toasts' });
      document.body.appendChild(host);
    }
    const t = h('div', { class: 'toast tone-' + kind, text: message });
    host.appendChild(t);
    requestAnimationFrame(() => t.classList.add('is-in'));
    setTimeout(() => {
      t.classList.remove('is-in');
      setTimeout(() => t.remove(), 300);
    }, 4200);
  }

  G.ui = { h, esc, icon, starsHtml, starPicker, scoreRing, rigDiagramHtml, rigCard, chip, facilityRow, bandClass, toast };
})(window.Cast = window.Cast || {});
