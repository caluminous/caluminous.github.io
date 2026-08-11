/* Cast — a small slippy map, written from scratch.

   No mapping library: tiles come straight from OpenStreetMap and every interaction —
   drag, pinch, wheel, double-tap, marker hit-testing and clustering — is handled here.
   That keeps the whole app to four small files and works offline from the tile cache. */
(function (G) {
  'use strict';

  const TILE = 256;
  const MIN_Z = 5;
  const MAX_Z = 17;
  const TILE_URL = (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

  function project(lat, lon, z) {
    const scale = TILE * Math.pow(2, z);
    const s = Math.min(0.9999, Math.max(-0.9999, Math.sin(lat * Math.PI / 180)));
    return {
      x: (lon + 180) / 360 * scale,
      y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale
    };
  }

  function unproject(x, y, z) {
    const scale = TILE * Math.pow(2, z);
    const lon = x / scale * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / scale;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return { lat, lon };
  }

  function metresPerPixel(lat, z) {
    return 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
  }

  G.createMap = function createMap(container, opts = {}) {
    const state = {
      center: { lat: opts.lat ?? 52.6, lon: opts.lon ?? -1.5 },
      zoom: opts.zoom ?? 10,
      width: 0, height: 0,
      venues: [],
      selected: null,
      user: null,
      radiusMiles: null,
      dark: opts.dark !== false
    };

    container.classList.add('cast-map');
    container.innerHTML = '';

    const tilePane = el('div', 'map-tiles');
    const overlay = el('div', 'map-overlay');
    const markerPane = el('div', 'map-markers');
    const controls = el('div', 'map-controls');
    const attribution = el('div', 'map-attribution');
    attribution.innerHTML = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

    controls.append(
      ctrlButton('+', 'Zoom in', () => zoomBy(1)),
      ctrlButton('−', 'Zoom out', () => zoomBy(-1)),
      ctrlButton(locateIcon(), 'Centre on my location', () => opts.onLocate && opts.onLocate())
    );

    container.append(tilePane, overlay, markerPane, controls, attribution);
    if (state.dark) tilePane.classList.add('is-dark');

    const tiles = new Map();  /* "z/x/y" -> img */
    let frame = null;

    function el(tag, cls, text) {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }

    function ctrlButton(content, label, fn) {
      const b = el('button', 'map-btn');
      b.type = 'button';
      b.setAttribute('aria-label', label);
      if (typeof content === 'string') b.textContent = content;
      else b.appendChild(content);
      b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
      return b;
    }

    function locateIcon() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '17'); svg.setAttribute('height', '17');
      svg.innerHTML = '<circle cx="12" cy="12" r="4"></circle><path d="M12 2v3M12 19v3M2 12h3M19 12h3"></path>';
      svg.setAttribute('class', 'locate-icon');
      return svg;
    }

    /* ------------------------------------------------------------ rendering */

    function topLeft() {
      const c = project(state.center.lat, state.center.lon, state.zoom);
      return { x: c.x - state.width / 2, y: c.y - state.height / 2 };
    }

    function latLonToPoint(lat, lon) {
      const p = project(lat, lon, state.zoom);
      const tl = topLeft();
      return { x: p.x - tl.x, y: p.y - tl.y };
    }

    function pointToLatLon(px, py) {
      const tl = topLeft();
      return unproject(tl.x + px, tl.y + py, state.zoom);
    }

    function renderTiles() {
      const z = state.zoom;
      const tl = topLeft();
      const n = Math.pow(2, z);
      const x0 = Math.floor(tl.x / TILE), x1 = Math.floor((tl.x + state.width) / TILE);
      const y0 = Math.floor(tl.y / TILE), y1 = Math.floor((tl.y + state.height) / TILE);
      const wanted = new Set();

      for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
          if (y < 0 || y >= n) continue;
          const wx = ((x % n) + n) % n;   /* wrap the world horizontally */
          const key = `${z}/${wx}/${y}`;
          const left = x * TILE - tl.x;
          const top = y * TILE - tl.y;
          wanted.add(key + '@' + x);

          let img = tiles.get(key + '@' + x);
          if (!img) {
            img = new Image();
            img.className = 'map-tile';
            img.alt = '';
            img.decoding = 'async';
            img.loading = 'eager';
            img.src = TILE_URL(z, wx, y);
            img.addEventListener('load', () => img.classList.add('is-loaded'));
            img.addEventListener('error', () => img.classList.add('is-error'));
            tilePane.appendChild(img);
            tiles.set(key + '@' + x, img);
          }
          img.style.transform = `translate3d(${Math.round(left)}px, ${Math.round(top)}px, 0)`;
        }
      }
      for (const [key, img] of tiles) {
        if (!wanted.has(key)) { img.remove(); tiles.delete(key); }
      }
    }

    /* Pins that would sit on top of each other collapse into a count bubble.
       Grid-bucketing is enough here and costs nothing — it re-runs on every frame. */
    function cluster(points, cellPx) {
      const cells = new Map();
      for (const p of points) {
        const key = Math.floor(p.x / cellPx) + ':' + Math.floor(p.y / cellPx);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(p);
      }
      const out = [];
      for (const group of cells.values()) {
        if (group.length === 1 || group.some((g) => g.venue.id === state.selected)) {
          /* Never hide the selected pin inside a cluster. */
          if (group.length === 1) { out.push({ single: group[0] }); continue; }
          const sel = group.find((g) => g.venue.id === state.selected);
          out.push({ single: sel });
          const rest = group.filter((g) => g !== sel);
          if (rest.length === 1) out.push({ single: rest[0] });
          else out.push({ group: rest, x: avg(rest, 'x'), y: avg(rest, 'y') });
          continue;
        }
        out.push({ group, x: avg(group, 'x'), y: avg(group, 'y') });
      }
      return out;
    }

    const avg = (arr, k) => arr.reduce((s, p) => s + p[k], 0) / arr.length;

    function renderMarkers() {
      markerPane.innerHTML = '';

      if (state.radiusMiles) {
        const mpp = metresPerPixel(state.center.lat, state.zoom);
        const r = (state.radiusMiles * 1609.34) / mpp;
        if (r > 12 && r < 4000) {
          const ring = el('div', 'map-radius');
          const c = latLonToPoint(state.center.lat, state.center.lon);
          ring.style.width = ring.style.height = (r * 2) + 'px';
          ring.style.transform = `translate3d(${c.x - r}px, ${c.y - r}px, 0)`;
          markerPane.appendChild(ring);
        }
      }

      if (state.user) {
        const p = latLonToPoint(state.user.lat, state.user.lon);
        const dot = el('div', 'map-user');
        dot.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        dot.title = 'You are here';
        markerPane.appendChild(dot);
      }

      const pts = [];
      for (const v of state.venues) {
        const p = latLonToPoint(v.lat, v.lon);
        if (p.x < -80 || p.y < -80 || p.x > state.width + 80 || p.y > state.height + 80) continue;
        pts.push({ x: p.x, y: p.y, venue: v });
      }

      for (const item of cluster(pts, 40)) {
        if (item.single) markerPane.appendChild(pinFor(item.single));
        else markerPane.appendChild(clusterFor(item));
      }
    }

    function pinFor({ x, y, venue }) {
      const type = (G.data.WATER_TYPES[venue.type] || {});
      const rating = G.tactics.ratingFor(venue);
      const btn = el('button', 'map-pin');
      btn.type = 'button';
      btn.dataset.venue = venue.id;
      btn.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      btn.style.setProperty('--pin', type.colour || '#3fa7d6');
      if (venue.id === state.selected) btn.classList.add('is-selected');
      if (venue.source === 'osm') btn.classList.add('is-unverified');

      const label = rating.display != null ? rating.display.toFixed(1) : '?';
      btn.innerHTML = `<span class="pin-body"><span class="pin-label">${label}</span></span><span class="pin-tail"></span>`;
      btn.setAttribute('aria-label',
        `${venue.name}, ${type.label || venue.type}${rating.display != null ? ', rated ' + label + ' out of 5' : ', not rated'}`);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        select(venue.id, true);
      });
      return btn;
    }

    function clusterFor(item) {
      const btn = el('button', 'map-cluster');
      btn.type = 'button';
      btn.style.transform = `translate3d(${item.x}px, ${item.y}px, 0)`;
      btn.textContent = String(item.group.length);
      btn.setAttribute('aria-label', `${item.group.length} venues here — zoom in to separate them`);
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ll = pointToLatLon(item.x, item.y);
        state.center = ll;
        state.zoom = Math.min(MAX_Z, state.zoom + 2);
        schedule();
        notifyMove();
      });
      return btn;
    }

    function render() {
      frame = null;
      if (!state.width || !state.height) return;
      renderTiles();
      renderMarkers();
    }

    function schedule() {
      if (frame == null) frame = requestAnimationFrame(render);
    }

    function notifyMove() {
      opts.onMove && opts.onMove({ center: state.center, zoom: state.zoom });
    }

    /* ---------------------------------------------------------- interaction */

    const pointers = new Map();
    let dragStart = null;
    let pinchStart = null;
    let lastTap = 0;

    container.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.map-btn, .map-pin, .map-cluster, .map-attribution')) return;
      container.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1) {
        dragStart = { x: e.clientX, y: e.clientY, center: { ...state.center }, t: Date.now(), moved: 0 };
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom: state.zoom };
        dragStart = null;
      }
    });

    container.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2 && pinchStart) {
        const [a, b] = [...pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const ratio = dist / pinchStart.dist;
        const target = Math.round(pinchStart.zoom + Math.log2(ratio));
        if (target !== state.zoom && target >= MIN_Z && target <= MAX_Z) {
          const rect = container.getBoundingClientRect();
          zoomAround(target, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
        }
        return;
      }

      if (dragStart) {
        const dx = e.clientX - dragStart.x;
        const dy = e.clientY - dragStart.y;
        dragStart.moved = Math.max(dragStart.moved, Math.hypot(dx, dy));
        const c = project(dragStart.center.lat, dragStart.center.lon, state.zoom);
        state.center = unproject(c.x - dx, c.y - dy, state.zoom);
        container.classList.add('is-dragging');
        schedule();
      }
    });

    function endPointer(e) {
      if (!pointers.has(e.pointerId)) return;
      pointers.delete(e.pointerId);
      container.classList.remove('is-dragging');

      if (pointers.size < 2) pinchStart = null;

      if (dragStart && dragStart.moved < 6 && Date.now() - dragStart.t < 400) {
        const now = Date.now();
        if (now - lastTap < 300) {
          const rect = container.getBoundingClientRect();
          zoomAround(Math.min(MAX_Z, state.zoom + 1), e.clientX - rect.left, e.clientY - rect.top);
          lastTap = 0;
        } else {
          lastTap = now;
          /* A tap on bare map closes whatever is open. */
          if (state.selected) select(null, true);
        }
      } else if (dragStart) {
        notifyMove();
      }
      dragStart = null;
    }

    container.addEventListener('pointerup', endPointer);
    container.addEventListener('pointercancel', endPointer);

    container.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = container.getBoundingClientRect();
      const dir = e.deltaY < 0 ? 1 : -1;
      const target = Math.max(MIN_Z, Math.min(MAX_Z, state.zoom + dir));
      if (target !== state.zoom) zoomAround(target, e.clientX - rect.left, e.clientY - rect.top);
    }, { passive: false });

    container.addEventListener('keydown', (e) => {
      const step = 80;
      const moves = { ArrowUp: [0, -step], ArrowDown: [0, step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] };
      if (moves[e.key]) {
        e.preventDefault();
        const [dx, dy] = moves[e.key];
        const c = project(state.center.lat, state.center.lon, state.zoom);
        state.center = unproject(c.x + dx, c.y + dy, state.zoom);
        schedule(); notifyMove();
      } else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomBy(1); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomBy(-1); }
    });
    container.tabIndex = 0;

    function zoomAround(target, px, py) {
      const before = pointToLatLon(px, py);
      state.zoom = target;
      const after = pointToLatLon(px, py);
      const c = project(state.center.lat, state.center.lon, state.zoom);
      const shift = {
        x: project(before.lat, before.lon, state.zoom).x - project(after.lat, after.lon, state.zoom).x,
        y: project(before.lat, before.lon, state.zoom).y - project(after.lat, after.lon, state.zoom).y
      };
      state.center = unproject(c.x + shift.x, c.y + shift.y, state.zoom);
      schedule(); notifyMove();
    }

    function zoomBy(d) {
      const target = Math.max(MIN_Z, Math.min(MAX_Z, state.zoom + d));
      if (target === state.zoom) return;
      zoomAround(target, state.width / 2, state.height / 2);
    }

    function select(id, fromMap) {
      state.selected = id;
      schedule();
      if (fromMap) opts.onSelect && opts.onSelect(id);
    }

    /* ------------------------------------------------------------- sizing */

    function measure() {
      const rect = container.getBoundingClientRect();
      state.width = rect.width;
      state.height = rect.height;
      schedule();
    }

    const ro = new ResizeObserver(measure);
    ro.observe(container);
    measure();

    return {
      setVenues(list) { state.venues = list || []; schedule(); },
      setUser(pos) { state.user = pos; schedule(); },
      setRadius(miles) { state.radiusMiles = miles; schedule(); },
      setSelected(id) { select(id, false); },
      setCenter(lat, lon, zoom) {
        state.center = { lat, lon };
        if (zoom != null) state.zoom = Math.max(MIN_Z, Math.min(MAX_Z, zoom));
        schedule();
      },
      panTo(lat, lon) { state.center = { lat, lon }; schedule(); },
      setDark(on) { state.dark = on; tilePane.classList.toggle('is-dark', on); },
      /* Frame a set of venues, with a sane floor so a single pin does not zoom to a rooftop. */
      fit(points, maxZoom = 13) {
        const pts = (points || []).filter((p) => p && typeof p.lat === 'number');
        if (!pts.length) return;
        const lats = pts.map((p) => p.lat), lons = pts.map((p) => p.lon);
        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
        const minLon = Math.min(...lons), maxLon = Math.max(...lons);
        state.center = { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
        let z = MAX_Z;
        while (z > MIN_Z) {
          const a = project(minLat, minLon, z), b = project(maxLat, maxLon, z);
          if (Math.abs(a.x - b.x) < state.width - 70 && Math.abs(a.y - b.y) < state.height - 90) break;
          z--;
        }
        state.zoom = Math.min(z, maxZoom);
        schedule();
      },
      get zoom() { return state.zoom; },
      get center() { return { ...state.center }; },
      invalidate: measure,
      destroy() { ro.disconnect(); container.innerHTML = ''; }
    };
  };
})(window.Cast = window.Cast || {});
