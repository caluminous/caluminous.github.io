/* Circuit Lab — main app: canvas, touch interactions, panels, code editor, learn UI, main loop */
'use strict';

const app = {
  parts: [], wires: [], nextId: 1,
  links: [],            // wireless connections: snapped terminals & legs in board holes
  view3d: false,
  sel: null,            // {kind:'part'|'wire', id}
  pendingWire: null,    // {part, term, sticky}
  runtimes: {},         // partId → MCU.Runtime
  serials: {},          // partId → string
  vb: { x:0, y:0, w:900 },
  activeLevel: null, levelMem: {},
  progress: JSON.parse(localStorage.getItem('cl_progress')||'{}'),
  settings: Object.assign({sound:false}, JSON.parse(localStorage.getItem('cl_settings')||'{}')),
  toastTimes: {},
  anyBoardRunning(pred){
    return Object.entries(this.runtimes).some(([id, rt])=>{
      const p = this.parts.find(x=>x.id===id);
      return rt && rt.running && p && p.state.powered && (!pred || pred(rt));
    });
  },
};

const $ = s => document.querySelector(s);
const svgNS = 'http://www.w3.org/2000/svg';
const snap = v => Math.round(v/10)*10;
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;');

/* ============================ CANVAS RENDER ============================ */
const canvas = $('#canvas');

function applyVB(){
  const r = canvas.getBoundingClientRect();
  const h = app.vb.w * (r.height/Math.max(1,r.width));
  canvas.setAttribute('viewBox', `${app.vb.x} ${app.vb.y} ${app.vb.w} ${h}`);
}

/* ---- 3D workbench view: an invertible affine tilt applied to the whole scene,
   so building/wiring stays fully interactive while tilted ---- */
let VIEW = new DOMMatrix();
function viewStr(){ return `matrix(${VIEW.a} ${VIEW.b} ${VIEW.c} ${VIEW.d} ${VIEW.e} ${VIEW.f})`; }
function setView3d(on){
  app.view3d = on;
  if (on){
    const r = canvas.getBoundingClientRect();
    const cx = app.vb.x + app.vb.w/2, cy = app.vb.y + app.vb.w*(r.height/Math.max(1,r.width))/2;
    VIEW = new DOMMatrix().translate(cx, cy).skewX(-16).scale(1, 0.62).translate(-cx, -cy);
  } else VIEW = new DOMMatrix();
  canvas.classList.toggle('tilted', on);
  const b = $('#btn3d'); if (b){ b.textContent = on ? '2D' : '3D'; b.classList.toggle('active', on); }
  renderAll();
}
function svgPt(cx, cy){ // client pixels → world coordinates (through viewBox AND tilt)
  // getScreenCTM reflects the REAL current mapping, including letterboxing
  // while a panel open/close resize hasn't been flushed into the viewBox yet
  const ctm = canvas.getScreenCTM();
  if (!ctm){
    const r = canvas.getBoundingClientRect();
    return { x: app.vb.x + (cx-r.left)/r.width*app.vb.w, y: app.vb.y + (cy-r.top)/r.width*app.vb.w };
  }
  const v = new DOMPoint(cx, cy).matrixTransform(ctm.inverse()); // client → view coords
  const m = VIEW.inverse();
  return { x: m.a*v.x + m.c*v.y + m.e, y: m.b*v.x + m.d*v.y + m.f };
}

function termAbs(part, termId){
  if (termId.startsWith('H:')) return PARTS.holePos(part).find(t=>t.id===termId);
  return PARTS.termPos(part).find(t=>t.id===termId);
}

/* nearest connection point (terminal or board hole) to a world point — board
   pins sit close together, so distance beats whichever hit-circle is on top */
function nearestConn(pt, maxDist, exclude){
  let best = null, bd = maxDist;
  for (const p of app.parts){
    for (const t of PARTS.connPoints(p)){
      if (exclude && exclude.part===p.id && exclude.term===t.id) continue;
      const d = Math.hypot(t.x-pt.x, t.y-pt.y);
      if (d < bd){ bd = d; best = {part:p.id, term:t.id, x:t.x, y:t.y, hole:!!t.hole}; }
    }
  }
  return best;
}
const nearestTerm = nearestConn; // back-compat alias

/* wireless connectivity: any part terminal touching another terminal or
   sitting in a board hole conducts — like legs pushed into a breadboard */
const LINK_TOL = 9;
function computeLinks(){
  const links = [];
  const pts = [];
  for (const p of app.parts){
    const base = PARTS.defs[p.type].boardBase;
    for (const t of PARTS.connPoints(p)) pts.push({part:p.id, term:t.id, x:t.x, y:t.y, hole:!!t.hole, base});
  }
  for (let i=0;i<pts.length;i++){
    const a = pts[i];
    if (a.hole) continue;                    // pair each leg against holes/legs, once
    for (let j=0;j<pts.length;j++){
      if (i===j) continue;
      const b = pts[j];
      if (b.part===a.part) continue;
      if (!b.hole && j<i) continue;          // leg↔leg counted once
      if (Math.hypot(a.x-b.x, a.y-b.y) > LINK_TOL) continue;
      links.push({a:{part:a.part, term:a.term}, b:{part:b.part, term:b.term},
                  x:(a.x+b.x)/2, y:(a.y+b.y)/2, hole:b.hole});
    }
  }
  app.links = links;
}

/* snap-dock: after dropping a part, pull it so its nearest leg sits exactly
   on the closest hole/terminal — parts "click" together without wires */
function dockPart(p){
  if (PARTS.defs[p.type].boardBase) return;
  let best = null, bd = 14;
  for (const t of PARTS.termPos(p)){
    for (const q of app.parts){
      if (q.id===p.id) continue;
      for (const c of PARTS.connPoints(q)){
        const d = Math.hypot(c.x-t.x, c.y-t.y);
        if (d < bd && d > 0.01){ bd = d; best = {dx:c.x-t.x, dy:c.y-t.y}; }
      }
    }
  }
  if (best){ p.x += best.dx; p.y += best.dy; }
}

/* full route of a wire = endpoint, joints..., endpoint (world coords) */
function wireRoute(w){
  const pa = app.parts.find(p=>p.id===w.a.part), pb = app.parts.find(p=>p.id===w.b.part);
  if (!pa||!pb) return null;
  const a = termAbs(pa, w.a.term), b = termAbs(pb, w.b.term);
  if (!a||!b) return null;
  return [{x:a.x,y:a.y}, ...(w.pts||[]), {x:b.x,y:b.y}];
}
function wirePath(route){
  // smooth polyline: quadratic curves through joints; gentle sag when jointless
  if (route.length===2){
    const [a,b]=route;
    const mx=(a.x+b.x)/2, my=(a.y+b.y)/2 + Math.min(40, Math.hypot(b.x-a.x,b.y-a.y)*0.15+8);
    return `M${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`;
  }
  let d = `M${route[0].x} ${route[0].y}`;
  for (let i=1;i<route.length-1;i++){
    const m = {x:(route[i].x+route[i+1].x)/2, y:(route[i].y+route[i+1].y)/2};
    d += ` Q ${route[i].x} ${route[i].y} ${i===route.length-2?route[i+1].x:m.x} ${i===route.length-2?route[i+1].y:m.y}`;
  }
  return d;
}

function renderAll(){
  computeLinks();
  const deco=[], wiresS=[], partsS=[], termsS=[], linkS=[], handleS=[];
  for (const p of app.parts){
    const d = PARTS.defs[p.type];
    const sel = app.sel?.kind==='part' && app.sel.id===p.id;
    const g = `<g class="part${sel?' sel':''}" data-part="${p.id}"
      transform="translate(${p.x},${p.y}) rotate(${p.rot||0},${d.w/2},${d.h/2})">
      ${sel?`<rect x="-6" y="-6" width="${d.w+12}" height="${d.h+12}" rx="8" fill="none" stroke="#4da3ff" stroke-width="2" stroke-dasharray="6 4"/>`:''}
      <g class="art">${d.draw(p)}</g></g>`;
    (d.deco?deco:partsS).push(g);
    for (const t of PARTS.termPos(p)){
      const hot = app.pendingWire && !(app.pendingWire.part===p.id && app.pendingWire.term===t.id);
      const src = app.pendingWire && app.pendingWire.part===p.id && app.pendingWire.term===t.id;
      const cls = /\+|3V3|5V|VIN/.test(t.id)?'tpos':/-|GND/.test(t.id)?'tneg':'tsig';
      termsS.push(`<g class="term" data-part="${p.id}" data-term="${t.id}">
        <circle cx="${t.x}" cy="${t.y}" r="16" fill="transparent"/>
        <circle class="tdot ${cls}${hot?' hot':''}${src?' src':''}" cx="${t.x}" cy="${t.y}" r="${src?8:5.5}"/></g>`);
    }
  }
  for (const w of app.wires){
    const route = wireRoute(w);
    if (!route) continue;
    const sel = app.sel?.kind==='wire' && app.sel.id===w.id;
    const d = wirePath(route);
    wiresS.push(`<g class="wire${sel?' sel':''}" data-wire="${w.id}">
      <path d="${d}" class="whit"/>
      <path d="${d}" class="wvis" style="stroke:${sel?'#4da3ff':w.color}"/></g>`);
    if (sel){
      // endpoint handles + joint handles + ghost midpoints for inserting joints
      handleS.push(`<circle class="wjoint wend" data-wire="${w.id}" data-kind="end" data-end="a" cx="${route[0].x}" cy="${route[0].y}" r="9"/>`);
      handleS.push(`<circle class="wjoint wend" data-wire="${w.id}" data-kind="end" data-end="b" cx="${route[route.length-1].x}" cy="${route[route.length-1].y}" r="9"/>`);
      (w.pts||[]).forEach((pt,i)=> handleS.push(
        `<circle class="wjoint" data-wire="${w.id}" data-kind="joint" data-idx="${i}" cx="${pt.x}" cy="${pt.y}" r="8"/>`));
      for (let i=0;i<route.length-1;i++){
        const mx=(route[i].x+route[i+1].x)/2, my=(route[i].y+route[i+1].y)/2;
        handleS.push(`<circle class="wjoint wghost" data-wire="${w.id}" data-kind="ghost" data-idx="${i}" cx="${mx}" cy="${my}" r="7"/>`);
      }
    }
  }
  for (const l of app.links)
    linkS.push(`<circle class="linkdot${l.hole?' inhole':''}" cx="${l.x}" cy="${l.y}" r="${l.hole?5:7}"/>`);
  $('#scene').innerHTML = `<g id="world" transform="${viewStr()}">
    <g>${deco.join('')}</g><g>${wiresS.join('')}</g><g>${partsS.join('')}</g>
    <g class="links">${linkS.join('')}</g><g>${termsS.join('')}</g><g>${handleS.join('')}</g>
    <path id="rubber" class="rubber" d="" visibility="hidden"/></g>`;
  app._hashes = {};
}

/* update just the dynamic art of parts whose visual state changed */
function updateDynamic(){
  app._hashes = app._hashes||{};
  for (const p of app.parts){
    const d = PARTS.defs[p.type];
    const h = JSON.stringify([p.state.broken, p.state.on, p.state.pressed, p.state.powered,
      Math.round((p.state.brightness||0)*20), Math.round(p.state.rotAngle||0), p.state.beeping,
      p.state.chargingOut, p.state.charging, Math.round(p.props.charge||0), p.props.value, p.props.color, p.props.t, p.props.usb, p.props.vout,
      p.props.solders ? p.props.solders.length : 0,
      d.board ? Math.round(((p.state.pins?.[d.builtinLed]?.duty)||0)*20) : 0]);
    if (app._hashes[p.id] !== h){
      app._hashes[p.id] = h;
      const g = $('#scene')?.querySelector(`.part[data-part="${p.id}"] .art`);
      if (g) g.innerHTML = d.draw(p);
    }
  }
}

/* ============================ MUTATIONS ============================ */
function addPart(type){
  const d = PARTS.defs[type];
  const r = canvas.getBoundingClientRect();
  const cx = app.vb.x + app.vb.w/2, cy = app.vb.y + app.vb.w*(r.height/Math.max(1,r.width))/2;
  const p = {
    id:'p'+(app.nextId++), type,
    x: snap(cx - d.w/2 + (Math.random()*80-40)), y: snap(cy - d.h/2 + (Math.random()*60-30)),
    rot:0, props: JSON.parse(JSON.stringify(d.defaults||{})), state:{},
  };
  app.parts.push(p);
  select({kind:'part', id:p.id});
  renderAll(); save();
  if (!app._quiet) toast(`${d.name} added — drag to move, tap a ● terminal to wire`, 'info', 'add'+type);
  return p;
}
function deletePart(id){
  stopRuntime(id);
  app.wires = app.wires.filter(w=>w.a.part!==id && w.b.part!==id);
  app.parts = app.parts.filter(p=>p.id!==id);
  select(null); renderAll(); save();
}
const WIRE_COLORS = ['#e84545','#3a86ff','#39c26d','#f4b53f','#b678f0','#e8e8e8','#ff8c66'];
function addWire(a, b){
  if (a.part===b.part && a.term===b.term) return;
  if (app.wires.some(w=>(w.a.part===a.part&&w.a.term===a.term&&w.b.part===b.part&&w.b.term===b.term)||(w.a.part===b.part&&w.a.term===b.term&&w.b.part===a.part&&w.b.term===a.term))) return;
  app.wires.push({id:'w'+(app.nextId++), a, b, color: WIRE_COLORS[app.wires.length%WIRE_COLORS.length]});
  renderAll(); save();
}
function select(sel){
  app.sel = sel;
  renderPanel();
}

/* ============================ POINTER INPUT ============================ */
let gesture = null; // {mode:'drag'|'pan'|'wire'|'pinch', ...}
const activePtrs = new Map();

canvas.addEventListener('pointerdown', ev=>{
  ev.preventDefault();
  canvas.setPointerCapture(ev.pointerId);
  activePtrs.set(ev.pointerId, {x:ev.clientX, y:ev.clientY});
  if (activePtrs.size===2){ // pinch takes over
    const pts = [...activePtrs.values()];
    gesture = {mode:'pinch', d0: Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y), w0: app.vb.w,
      mid: svgPt((pts[0].x+pts[1].x)/2,(pts[0].y+pts[1].y)/2)};
    return;
  }
  const wp = svgPt(ev.clientX, ev.clientY);
  const jointEl = ev.target.closest('.wjoint');
  const termEl = ev.target.closest('.term');
  const partEl = ev.target.closest('.part');
  const wireEl = ev.target.closest('.wire');
  if (jointEl){
    const w = app.wires.find(x=>x.id===jointEl.dataset.wire);
    const kind = jointEl.dataset.kind;
    if (kind==='ghost'){ // inserting a new joint mid-segment and dragging it
      const idx = +jointEl.dataset.idx;
      w.pts = w.pts||[];
      w.pts.splice(idx, 0, {x:wp.x, y:wp.y});
      gesture = {mode:'joint', wire:w, idx, sx:ev.clientX, sy:ev.clientY, moved:true};
      renderAll();
    } else if (kind==='joint'){
      gesture = {mode:'joint', wire:w, idx:+jointEl.dataset.idx, sx:ev.clientX, sy:ev.clientY, moved:false};
    } else { // endpoint: drag to re-plug elsewhere
      gesture = {mode:'end', wire:w, end:jointEl.dataset.end, sx:ev.clientX, sy:ev.clientY, moved:false};
    }
  } else if (termEl){
    const from = nearestConn(wp, 40) || {part:termEl.dataset.part, term:termEl.dataset.term};
    gesture = {mode:'wire', from:{part:from.part, term:from.term}, sx:ev.clientX, sy:ev.clientY, moved:false};
    app.pendingWire = {part:from.part, term:from.term};
    renderAll();
  } else if (partEl){
    const p = app.parts.find(x=>x.id===partEl.dataset.part);
    const nearHole = PARTS.defs[p.type].boardBase && nearestConn(wp, 11);
    if (nearHole && nearHole.hole && nearHole.part===p.id){
      // start a wire straight from a breadboard/perfboard hole
      gesture = {mode:'wire', from:{part:nearHole.part, term:nearHole.term}, sx:ev.clientX, sy:ev.clientY, moved:false};
      app.pendingWire = {part:nearHole.part, term:nearHole.term};
      renderAll();
    } else {
      gesture = {mode:'drag', part:p, ox:p.x, oy:p.y, w0:wp, sx:ev.clientX, sy:ev.clientY, moved:false};
    }
  } else if (wireEl){
    gesture = {mode:'wiredrag', id:wireEl.dataset.wire, w0:wp, sx:ev.clientX, sy:ev.clientY, moved:false};
  } else {
    gesture = {mode:'pan', sx:ev.clientX, sy:ev.clientY, vx:app.vb.x, vy:app.vb.y, moved:false};
  }
});

canvas.addEventListener('pointermove', ev=>{
  if (activePtrs.has(ev.pointerId)) activePtrs.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
  if (!gesture) return;
  const r = canvas.getBoundingClientRect();
  const scale = app.vb.w / r.width;
  if (gesture.mode==='pinch' && activePtrs.size>=2){
    const pts = [...activePtrs.values()];
    const d = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
    const nw = Math.min(3000, Math.max(250, gesture.w0 * gesture.d0/Math.max(20,d)));
    const midC = svgPt((pts[0].x+pts[1].x)/2,(pts[0].y+pts[1].y)/2);
    app.vb.w = nw;
    // keep pinch midpoint stable
    const midC2 = svgPt((pts[0].x+pts[1].x)/2,(pts[0].y+pts[1].y)/2);
    app.vb.x += midC.x - midC2.x + (gesture.mid.x-midC.x)*0; app.vb.y += midC.y - midC2.y;
    applyVB(); return;
  }
  const dx = ev.clientX-(gesture.sx??0), dy = ev.clientY-(gesture.sy??0);
  if (Math.hypot(dx,dy) > 7) gesture.moved = true;
  const wp = svgPt(ev.clientX, ev.clientY);
  if (gesture.mode==='drag' && gesture.moved){
    gesture.part.x = snap(gesture.ox + wp.x - gesture.w0.x);
    gesture.part.y = snap(gesture.oy + wp.y - gesture.w0.y);
    renderAll();
  } else if (gesture.mode==='pan' && gesture.moved){
    app.vb.x = gesture.vx - dx*scale; app.vb.y = gesture.vy - dy*scale;
    applyVB();
  } else if (gesture.mode==='wire'){
    const p = app.parts.find(x=>x.id===gesture.from.part);
    const a = termAbs(p, gesture.from.term);
    const rb = $('#rubber');
    if (rb){ rb.setAttribute('d', `M${a.x} ${a.y} L${wp.x} ${wp.y}`); rb.setAttribute('visibility','visible'); }
  } else if (gesture.mode==='joint' && gesture.moved){
    gesture.wire.pts[gesture.idx] = {x:snap(wp.x), y:snap(wp.y)};
    renderAll();
  } else if (gesture.mode==='end' && gesture.moved){
    const other = gesture.end==='a' ? gesture.wire.b : gesture.wire.a;
    const po = app.parts.find(x=>x.id===other.part);
    const o = po && termAbs(po, other.term);
    const rb = $('#rubber');
    if (rb && o){ rb.setAttribute('d', `M${o.x} ${o.y} L${wp.x} ${wp.y}`); rb.setAttribute('visibility','visible'); }
  } else if (gesture.mode==='wiredrag' && gesture.moved && !gesture.started){
    // dragging the wire body: grab it by inserting a joint at the press point
    const w = app.wires.find(x=>x.id===gesture.id);
    if (w){
      const route = wireRoute(w) || [];
      let idx = 0, bd = 1e9;
      for (let i=0;i<route.length-1;i++){
        const mx=(route[i].x+route[i+1].x)/2, my=(route[i].y+route[i+1].y)/2;
        const d = Math.hypot(mx-gesture.w0.x, my-gesture.w0.y);
        if (d < bd){ bd = d; idx = i; }
      }
      w.pts = w.pts||[];
      w.pts.splice(idx, 0, {x:snap(wp.x), y:snap(wp.y)});
      select({kind:'wire', id:w.id});
      gesture = {mode:'joint', wire:w, idx, sx:gesture.sx, sy:gesture.sy, moved:true};
      renderAll();
    }
  }
});

canvas.addEventListener('pointerup', ev=>{
  activePtrs.delete(ev.pointerId);
  const g = gesture; gesture = null;
  if (!g || g.mode==='pinch') return;

  if (g.mode==='wire'){
    const moved = Math.hypot(ev.clientX-g.sx, ev.clientY-g.sy) > 12;
    if (!moved){
      // sticky tap-to-tap mode: keep pendingWire, wait for next tap
      app.pendingWire = {...g.from, sticky:true};
      toast('Now tap another ● point to finish the wire (tap empty space to cancel)', 'info', 'wire2');
    } else {
      const scale = app.vb.w / canvas.getBoundingClientRect().width;
      const to = nearestConn(svgPt(ev.clientX, ev.clientY), 40*Math.max(1,scale), g.from);
      if (to) addWire(g.from, {part:to.part, term:to.term});
      app.pendingWire = null;
    }
    renderAll(); return;
  }
  if (g.mode==='joint'){
    if (!g.moved){ select({kind:'wire', id:g.wire.id}); renderAll(); }
    save(); return;
  }
  if (g.mode==='end'){
    if (g.moved){
      const to = nearestConn(svgPt(ev.clientX, ev.clientY), 34);
      const other = g.end==='a' ? g.wire.b : g.wire.a;
      if (to && !(to.part===other.part && to.term===other.term)){
        g.wire[g.end] = {part:to.part, term:to.term};
        save();
      }
      renderAll();
    }
    return;
  }
  if (g.mode==='wiredrag'){
    if (!g.moved){ select({kind:'wire', id:g.id}); renderAll(); }
    return;
  }

  if (g.mode==='drag' && !g.moved){
    // tap on part
    const p = g.part;
    if (app.pendingWire?.sticky){ app.pendingWire=null; renderAll(); }
    if (p.type==='switch'){ p.state.on = !p.state.on; }
    else if (p.type==='button'){ p.state.pressed = true; setTimeout(()=>{p.state.pressed=false;}, 650); }
    select({kind:'part', id:p.id});
    renderAll(); return;
  }
  if (g.mode==='drag'){
    dockPart(g.part);   // click into touching terminals / board holes
    renderAll(); save(); return;
  }
  if (g.mode==='pan' && !g.moved){
    // tap empty: complete sticky wire? cancel things
    if (app.pendingWire){ app.pendingWire=null; renderAll(); }
    select(null); renderAll();
  }
});
canvas.addEventListener('pointercancel', ev=>{ activePtrs.delete(ev.pointerId); gesture=null; });

// second tap completes sticky wire — accepts terminals AND board holes
canvas.addEventListener('pointerdown', ev=>{
  if (!app.pendingWire?.sticky) return;
  const from = {part:app.pendingWire.part, term:app.pendingWire.term};
  const near = ev.target.closest('.term') ? 40 : 16; // generous on dots, tight elsewhere
  const to = nearestConn(svgPt(ev.clientX, ev.clientY), near, from);
  if (to){
    addWire(from, {part:to.part, term:to.term});
    app.pendingWire = null; gesture = null;
    ev.stopPropagation();
    renderAll();
  }
}, true);

canvas.addEventListener('wheel', ev=>{
  ev.preventDefault();
  const before = svgPt(ev.clientX, ev.clientY);
  app.vb.w = Math.min(3000, Math.max(250, app.vb.w * (ev.deltaY>0?1.12:0.89)));
  applyVB();
  const after = svgPt(ev.clientX, ev.clientY);
  app.vb.x += before.x-after.x; app.vb.y += before.y-after.y;
  applyVB();
}, {passive:false});

/* ============================ SELECTION PANEL ============================ */
function renderPanel(){
  const el = $('#panel');
  if (!app.sel){ el.classList.remove('open'); el.innerHTML=''; return; }
  el.classList.add('open');

  if (app.sel.kind==='wire'){
    const w = app.wires.find(x=>x.id===app.sel.id);
    if (!w){ el.classList.remove('open'); return; }
    el.innerHTML = `<div class="prow"><b>Wire</b>
      <span class="reads">drag the wire to bend it · ◌ adds a joint · drag ends to re-plug</span>
      <span class="spacer"></span>
      ${(w.pts&&w.pts.length)?'<button class="btn" id="pStr">✨ Straighten</button>':''}
      <button class="btn danger" id="pDelW">🗑 Delete</button></div>
      <div class="prow props"><span class="reads">Colour</span>
      ${WIRE_COLORS.map(c=>`<button class="swatch${c===w.color?' on':''}" data-c="${c}" style="background:${c}"></button>`).join('')}</div>`;
    $('#pDelW').onclick = ()=>{ app.wires = app.wires.filter(x=>x.id!==w.id); select(null); renderAll(); save(); };
    if ($('#pStr')) $('#pStr').onclick = ()=>{ w.pts = []; renderAll(); renderPanel(); save(); };
    el.querySelectorAll('.swatch').forEach(b=> b.onclick = ()=>{ w.color = b.dataset.c; renderAll(); renderPanel(); save(); });
    return;
  }
  const p = app.parts.find(x=>x.id===app.sel.id);
  if (!p){ el.classList.remove('open'); return; }
  const d = PARTS.defs[p.type];
  const rd = p.state.reads;
  let readout = '';
  if (rd && !d.deco){
    readout = `<span class="reads">${PARTS.fmt(rd.v||0,'V')} · ${PARTS.fmt(rd.i||0,'A')} · ${PARTS.fmt(rd.p||0,'W')}</span>`;
  }
  let props = '';
  if (p.type==='resistor') props = `<label>Value <select id="pVal">${PARTS.E_VALUES.map(v=>`<option value="${v}" ${v==p.props.value?'selected':''}>${PARTS.fmtOhm(v)}</option>`).join('')}</select></label>`;
  if (p.type==='led') props = `<label>Colour <select id="pCol">${Object.keys(PARTS.LED_COLORS).map(c=>`<option ${c===p.props.color?'selected':''}>${c}</option>`).join('')}</select></label>`;
  if (p.type==='pot') props = `<label>Track <select id="pVal">${[1000,5000,10000,50000,100000].map(v=>`<option value="${v}" ${v==p.props.value?'selected':''}>${PARTS.fmtOhm(v)}</option>`).join('')}</select></label>
    <label class="grow">Knob <input type="range" id="pKnob" min="0" max="1" step="0.01" value="${p.props.t??0.5}"></label>`;
  if (p.type==='lipo') props = `<label class="grow">Charge <input type="range" id="pChg" min="0" max="100" step="1" value="${Math.round(p.props.charge??65)}"></label>`;
  if (p.type==='boost') props = `<label>Output <select id="pVout">${[5,9,12].map(v=>`<option value="${v}" ${v==(p.props.vout??5)?'selected':''}>${v} V</option>`).join('')}</select></label>`;
  if (d.board) props = `<label class="chk"><input type="checkbox" id="pUsb" ${p.props.usb?'checked':''}> USB power</label>
    <button class="btn accent" id="pCode">&lt;/&gt; Code</button>`;
  if (p.type==='button') props += `<button class="btn" id="pHold">👇 HOLD</button>`;
  if (p.type==='perfboard') props += `<button class="btn accent" id="pFlip">🔁 Flip &amp; solder</button>`;

  el.innerHTML = `<div class="prow">
      <b>${d.name}</b> ${readout}<span class="spacer"></span>
      ${p.state.broken?'<button class="btn ok" id="pFix">🔧 Repair</button>':''}
      <button class="btn" id="pInfo">ℹ️ Info</button>
      <button class="btn" id="pRot">⟳</button>
      <button class="btn danger" id="pDel">🗑</button>
    </div>
    ${props?`<div class="prow props">${props}</div>`:''}`;

  $('#pRot').onclick = ()=>{ p.rot = ((p.rot||0)+90)%360; renderAll(); save(); };
  $('#pDel').onclick = ()=>deletePart(p.id);
  $('#pInfo').onclick = ()=>showInfo(p.type);
  if ($('#pFix')) $('#pFix').onclick = ()=>{ p.state.broken=false; p.state.hot=false; renderAll(); renderPanel(); };
  if ($('#pVal')) $('#pVal').onchange = e=>{ p.props.value=+e.target.value; renderAll(); save(); };
  if ($('#pCol')) $('#pCol').onchange = e=>{ p.props.color=e.target.value; renderAll(); save(); };
  if ($('#pKnob')) $('#pKnob').oninput = e=>{ p.props.t=+e.target.value; save(); };
  if ($('#pChg')) $('#pChg').oninput = e=>{ p.props.charge=+e.target.value; save(); };
  if ($('#pVout')) $('#pVout').onchange = e=>{ p.props.vout=+e.target.value; renderAll(); save(); };
  if ($('#pUsb')) $('#pUsb').onchange = e=>{ p.props.usb=e.target.checked; renderAll(); save(); };
  if ($('#pCode')) $('#pCode').onclick = ()=>openEditor(p.id);
  if ($('#pFlip')) $('#pFlip').onclick = ()=>openSolder(p.id);
  if ($('#pHold')){
    const b = $('#pHold');
    b.onpointerdown = e=>{ e.preventDefault(); p.state.pressed=true; b.classList.add('active'); };
    const up = ()=>{ p.state.pressed=false; b.classList.remove('active'); };
    b.onpointerup = up; b.onpointerleave = up; b.onpointercancel = up;
  }
}

/* live refresh of panel readouts without rebuilding inputs */
function refreshPanelReads(){
  if (app.sel?.kind!=='part') return;
  const p = app.parts.find(x=>x.id===app.sel.id);
  const span = $('#panel .reads');
  if (p?.state.reads && span)
    span.textContent = `${PARTS.fmt(p.state.reads.v||0,'V')} · ${PARTS.fmt(p.state.reads.i||0,'A')} · ${PARTS.fmt(p.state.reads.p||0,'W')}`;
}

/* ============================ INFO MODAL ============================ */
function showInfo(type){
  const d = PARTS.defs[type];
  const fake = {id:'preview', type, x:0, y:0, rot:0, props:JSON.parse(JSON.stringify(d.defaults||{})), state:{}};
  $('#modalBody').innerHTML = `
    <h2>${d.info.title}</h2>
    <div class="preview"><svg viewBox="-10 -10 ${d.w+20} ${d.h+20}"><defs>${PARTS.SVG_DEFS}</defs>${d.draw(fake)}</svg></div>
    <div class="infotext">${d.info.body}</div>`;
  $('#modal').classList.add('open');
}
$('#modalClose').onclick = ()=>$('#modal').classList.remove('open');
$('#modal').onclick = e=>{ if(e.target.id==='modal') $('#modal').classList.remove('open'); };

/* ============================ SOLDER VIEW (perfboard flipped to copper side) ============================ */
let solderBoard = null, solderGesture = null;

function openSolder(partId){
  solderBoard = partId;
  $('#solder').classList.add('open');
  renderSolder();
}
$('#solderClose').onclick = ()=>{ $('#solder').classList.remove('open'); solderBoard=null; renderAll(); save(); };

function solderLocalPads(bb){
  const d = PARTS.defs[bb.type];
  return d.holes.call(d, bb); // local coords
}
/* which pads have a component leg or wire through them */
function padOccupants(bb){
  const occ = {};
  for (const l of app.links){
    for (const e of [l.a, l.b]){
      if (e.part===bb.id && e.term.startsWith('H:')){
        const o = l.a.part===bb.id ? l.b : l.a;
        const p = app.parts.find(x=>x.id===o.part);
        occ[e.term] = p ? PARTS.defs[p.type].name : 'part';
      }
    }
  }
  for (const w of app.wires){
    for (const e of [w.a, w.b])
      if (e.part===bb.id && e.term.startsWith('H:')) occ[e.term] = occ[e.term] || 'wire';
  }
  return occ;
}
function renderSolder(){
  const bb = app.parts.find(p=>p.id===solderBoard);
  if (!bb) return;
  const d = PARTS.defs[bb.type];
  const W = d.w, H = d.h;
  const mx = x => W - x; // horizontal mirror = looking at the back
  const occ = padOccupants(bb);
  const pads = solderLocalPads(bb);
  const at = {}; pads.forEach(h=>at[h.id]=h);
  let s = `<rect x="0" y="0" width="${W}" height="${H}" rx="6" fill="#9c7433" stroke="#6e4f1e"/>
    <rect x="2" y="2" width="${W-4}" height="${H-4}" rx="5" fill="#ad8340"/>`;
  for (const [i, sol] of (bb.props.solders||[]).entries()){
    const a = at[sol[0]], b = at[sol[1]];
    if (!a||!b) continue;
    s += `<g class="strace" data-i="${i}">
      <line x1="${mx(a.x)}" y1="${a.y}" x2="${mx(b.x)}" y2="${b.y}" stroke="transparent" stroke-width="16"/>
      <line x1="${mx(a.x)}" y1="${a.y}" x2="${mx(b.x)}" y2="${b.y}" stroke="#c7cdd6" stroke-width="7" stroke-linecap="round"/>
      <line x1="${mx(a.x)}" y1="${a.y}" x2="${mx(b.x)}" y2="${b.y}" stroke="#eef1f6" stroke-width="3" stroke-linecap="round"/></g>`;
  }
  for (const h of pads){
    const has = occ[h.id];
    s += `<g class="spad" data-pad="${h.id}">
      <circle cx="${mx(h.x)}" cy="${h.y}" r="7.5" fill="url(#gCopper)" stroke="#7a4a1a"/>
      <circle cx="${mx(h.x)}" cy="${h.y}" r="${has?4:2.6}" fill="${has?'#e8ebf2':'#3a2a10'}" stroke="${has?'#8a929d':'none'}"/>
      </g>`;
  }
  // legend for occupied pads
  for (const h of pads){
    if (occ[h.id]) s += `<text x="${mx(h.x)}" y="${h.y-11}" font-size="6.5" fill="#ffe9b8" text-anchor="middle" pointer-events="none">${occ[h.id]}</text>`;
  }
  s += `<line id="srubber" x1="0" y1="0" x2="0" y2="0" stroke="#eef1f6" stroke-width="5" stroke-linecap="round" stroke-dasharray="8 6" visibility="hidden"/>`;
  const svg = $('#solderSvg');
  svg.setAttribute('viewBox', `-8 -8 ${W+16} ${H+16}`);
  svg.innerHTML = `<defs>${PARTS.SVG_DEFS}</defs>${s}`;
  $('#solderCount').textContent = `${(bb.props.solders||[]).length} solder trace${(bb.props.solders||[]).length===1?'':'s'}`;
}
function solderPt(ev){
  const svg = $('#solderSvg');
  const bb = app.parts.find(p=>p.id===solderBoard);
  const d = PARTS.defs[bb.type];
  const W = d.w+16, H = d.h+16;
  const r = svg.getBoundingClientRect();
  const s = Math.min(r.width/W, r.height/H);
  const ox = (r.width - W*s)/2, oy = (r.height - H*s)/2;
  const vx = (ev.clientX - r.left - ox)/s - 8, vy = (ev.clientY - r.top - oy)/s - 8;
  return { x: d.w - vx, y: vy }; // un-mirror back to board coords
}
function nearestPad(pt, maxDist){
  const bb = app.parts.find(p=>p.id===solderBoard);
  let best=null, bd=maxDist;
  for (const h of solderLocalPads(bb)){
    const dd = Math.hypot(h.x-pt.x, h.y-pt.y);
    if (dd<bd){ bd=dd; best=h; }
  }
  return best;
}
$('#solderSvg').addEventListener('pointerdown', ev=>{
  ev.preventDefault();
  $('#solderSvg').setPointerCapture(ev.pointerId);
  const tr = ev.target.closest('.strace');
  if (tr){ solderGesture = {mode:'deltrace', i:+tr.dataset.i, sx:ev.clientX, sy:ev.clientY}; return; }
  const pad = nearestPad(solderPt(ev), 16);
  if (pad) solderGesture = {mode:'trace', from:pad, sx:ev.clientX, sy:ev.clientY, moved:false};
});
$('#solderSvg').addEventListener('pointermove', ev=>{
  if (!solderGesture || solderGesture.mode!=='trace') return;
  if (Math.hypot(ev.clientX-solderGesture.sx, ev.clientY-solderGesture.sy) > 6) solderGesture.moved = true;
  const bb = app.parts.find(p=>p.id===solderBoard);
  const d = PARTS.defs[bb.type];
  const pt = solderPt(ev);
  const rb = $('#srubber');
  if (rb){ rb.setAttribute('x1', d.w-solderGesture.from.x); rb.setAttribute('y1', solderGesture.from.y);
    rb.setAttribute('x2', d.w-pt.x); rb.setAttribute('y2', pt.y); rb.setAttribute('visibility','visible'); }
});
$('#solderSvg').addEventListener('pointerup', ev=>{
  const g = solderGesture; solderGesture = null;
  if (!g) return;
  const bb = app.parts.find(p=>p.id===solderBoard);
  if (g.mode==='deltrace'){
    bb.props.solders.splice(g.i, 1);
    renderSolder(); save();
    return;
  }
  if (g.mode==='trace' && g.moved){
    const to = nearestPad(solderPt(ev), 16);
    if (to && to.id!==g.from.id){
      bb.props.solders = bb.props.solders||[];
      const dup = bb.props.solders.some(s=>(s[0]===g.from.id&&s[1]===to.id)||(s[0]===to.id&&s[1]===g.from.id));
      if (!dup){ bb.props.solders.push([g.from.id, to.id]); toast('🔥 Soldered!', 'ok', 'soldered'); }
    }
    renderSolder(); save();
  }
});

/* ============================ TOASTS & WARNINGS ============================ */
function toast(msg, level='info', key){
  key = key||msg;
  const now = performance.now();
  if (app.toastTimes[key] && now - app.toastTimes[key] < 6000) return;
  app.toastTimes[key] = now;
  const t = document.createElement('div');
  t.className = 'toast '+level;
  t.innerHTML = msg;
  $('#toasts').appendChild(t);
  setTimeout(()=>t.classList.add('show'), 10);
  setTimeout(()=>{ t.classList.remove('show'); setTimeout(()=>t.remove(), 400); }, level==='danger'?6500:4200);
}

/* ============================ CODE EDITOR ============================ */
const EXAMPLES = {
  'Blink': `void setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(500);\n  digitalWrite(13, LOW);\n  delay(500);\n}\n`,
  'Built-in LED': `void setup() {\n  pinMode(LED_BUILTIN, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(LED_BUILTIN, HIGH);\n  delay(200);\n  digitalWrite(LED_BUILTIN, LOW);\n  delay(200);\n}\n`,
  'Button → LED': `void setup() {\n  pinMode(13, OUTPUT);\n  pinMode(4, INPUT_PULLUP);\n}\n\nvoid loop() {\n  if (digitalRead(4) == LOW) {\n    digitalWrite(13, HIGH);\n  } else {\n    digitalWrite(13, LOW);\n  }\n}\n`,
  'Fade (PWM)': `void setup() {\n}\n\nvoid loop() {\n  for (int b = 0; b <= 255; b += 5) {\n    analogWrite(13, b);\n    delay(20);\n  }\n  for (int b = 255; b >= 0; b -= 5) {\n    analogWrite(13, b);\n    delay(20);\n  }\n}\n`,
  'Analog read': `void setup() {\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  int raw = analogRead(34);\n  Serial.print("knob: ");\n  Serial.println(raw);\n  delay(200);\n}\n`,
  'Serial counter': `int count = 0;\n\nvoid setup() {\n  Serial.begin(115200);\n  Serial.println("hello from the sim!");\n}\n\nvoid loop() {\n  count++;\n  Serial.print("count = ");\n  Serial.println(count);\n  delay(1000);\n}\n`,
  'Alarm': `void setup() {\n  pinMode(4, INPUT_PULLUP);\n  pinMode(25, OUTPUT);\n  pinMode(13, OUTPUT);\n  Serial.begin(115200);\n}\n\nvoid loop() {\n  if (digitalRead(4) == LOW) {\n    Serial.println("INTRUDER!");\n    digitalWrite(25, HIGH);\n    digitalWrite(13, HIGH);\n    delay(150);\n    digitalWrite(25, LOW);\n    digitalWrite(13, LOW);\n    delay(150);\n  }\n}\n`,
};

let editorPart = null;
function openEditor(partId){
  editorPart = partId;
  const p = app.parts.find(x=>x.id===partId);
  const d = PARTS.defs[p.type];
  $('#edTitle').textContent = d.name + ' — sketch.ino';
  $('#edCode').value = p.props.code || EXAMPLES['Blink'];
  $('#edStatus').textContent = app.runtimes[partId]?.running ? '● running' : 'ready';
  $('#edStatus').className = app.runtimes[partId]?.running ? 'st run' : 'st';
  $('#edSerial').textContent = app.serials[partId] || '';
  $('#editor').classList.add('open');
}
$('#edClose').onclick = ()=>{ saveEditorCode(); $('#editor').classList.remove('open'); };
function saveEditorCode(){
  const p = app.parts.find(x=>x.id===editorPart);
  if (p) { p.props.code = $('#edCode').value; save(); }
}
$('#edRun').onclick = ()=>{
  saveEditorCode();
  const p = app.parts.find(x=>x.id===editorPart);
  if (!p) return;
  startRuntime(p, true);
};
$('#edStop').onclick = ()=>{
  stopRuntime(editorPart);
  $('#edStatus').textContent = 'stopped'; $('#edStatus').className='st';
};
$('#edExamples').onchange = e=>{
  if (e.target.value && EXAMPLES[e.target.value]) $('#edCode').value = EXAMPLES[e.target.value];
  e.target.value = '';
};
$('#edClear').onclick = ()=>{ app.serials[editorPart]=''; $('#edSerial').textContent=''; };
$('#edRef').onclick = ()=>{
  $('#modalBody').innerHTML = `<h2>📖 Arduino-C reference</h2><div class="infotext">
  <p>Every sketch needs two functions: <code>void setup() { }</code> runs <b>once</b> at power-up, <code>void loop() { }</code> repeats <b>forever</b>. Statements end with <code>;</code></p>
  <h3>Pins</h3>
  <table class="xp">
  <tr><td>pinMode(pin, mode)</td><td>Declare a pin's job. Modes: <code>OUTPUT</code> (drive volts out), <code>INPUT</code> (just measure), <code>INPUT_PULLUP</code> (measure, with an internal resistor holding it HIGH — the standard way to read buttons wired to GND).</td></tr>
  <tr><td>digitalWrite(pin, v)</td><td>Set an OUTPUT pin to <code>HIGH</code> (3.3 V / 5 V) or <code>LOW</code> (0 V).</td></tr>
  <tr><td>digitalRead(pin)</td><td>Returns <code>HIGH</code> or <code>LOW</code> depending on the voltage currently on the pin.</td></tr>
  <tr><td>analogWrite(pin, 0–255)</td><td>PWM: pulses the pin so its <i>average</i> output is a fraction of full power — dims LEDs, slows motors. Uno: only pins 3,5,6,9,10,11.</td></tr>
  <tr><td>analogRead(pin)</td><td>Measures a voltage precisely: ESP32 returns 0–4095 (for 0–3.3 V), Uno 0–1023 (for 0–5 V).</td></tr>
  </table>
  <h3>Timing</h3>
  <table class="xp">
  <tr><td>delay(ms)</td><td>Pause the whole program for that many milliseconds (1000 ms = 1 s).</td></tr>
  <tr><td>millis()</td><td>Milliseconds since the board booted — for timing things <i>without</i> freezing the program.</td></tr>
  </table>
  <h3>Serial monitor</h3>
  <table class="xp">
  <tr><td>Serial.begin(115200)</td><td>Open the link (once, in setup) so the board can talk to the monitor below the editor.</td></tr>
  <tr><td>Serial.print(x) / Serial.println(x)</td><td>Write text or numbers to the monitor; println ends the line. Your debugging best friend.</td></tr>
  </table>
  <h3>Language bits</h3>
  <table class="xp">
  <tr><td>int x = 0;</td><td>Make a whole-number variable. Also <code>float</code> (decimals), <code>bool</code> (true/false). Variables declared outside functions keep their value between loop() runs.</td></tr>
  <tr><td>if (a == b) { } else { }</td><td>Decide. Comparisons: <code>==</code> equal, <code>!=</code> not equal, <code>&lt; &gt; &lt;= &gt;=</code>. Combine with <code>&&</code> (and), <code>||</code> (or), <code>!</code> (not).</td></tr>
  <tr><td>for (int i=0; i&lt;10; i++) { }</td><td>Repeat a block 10 times: start; keep-going condition; per-lap step. <code>while (cond) { }</code> repeats while true.</td></tr>
  <tr><td>int twice(int n) { return n*2; }</td><td>Write your own functions and call them: <code>twice(21)</code>.</td></tr>
  <tr><td>// note</td><td>Comment — ignored by the board, priceless for humans.</td></tr>
  </table>
  <h3>Helpers</h3>
  <table class="xp">
  <tr><td>map(x, a,b, c,d)</td><td>Rescale x from range a–b into range c–d, e.g. <code>map(raw, 0,4095, 0,255)</code> turns a knob reading into a PWM level.</td></tr>
  <tr><td>constrain(x, lo, hi) · min · max · abs</td><td>Clamp and basic maths.</td></tr>
  <tr><td>random(n) / random(a,b)</td><td>Random whole number (0…n-1, or a…b-1).</td></tr>
  </table></div>`;
  $('#modal').classList.add('open');
};
// tab key inserts spaces in the editor
$('#edCode').addEventListener('keydown', e=>{
  if (e.key==='Tab'){ e.preventDefault();
    const el = e.target, s = el.selectionStart;
    el.value = el.value.slice(0,s)+'  '+el.value.slice(el.selectionEnd);
    el.selectionStart = el.selectionEnd = s+2;
  }
});

function startRuntime(p, verbose){
  stopRuntime(p.id);
  const d = PARTS.defs[p.type];
  if (!p.state.powered){
    toast('⚡ The board has no power — turn on USB power or feed VIN.', 'warn', 'nopow');
    if (verbose){ $('#edStatus').textContent='✗ board has no power'; $('#edStatus').className='st err'; }
    return;
  }
  const pinKey = pin => String(pin);
  try {
    const rt = new MCU.Runtime(p.props.code||'', {
      vcc: d.vcc, adcMax: d.adcMax, builtinLed: d.builtinLed,
      pwmPins: d.pwmPins || null, inputOnly: d.inputOnly || [],
      pinMode: (pin, mode)=>{ p.state.pins = p.state.pins||{}; p.state.pins[pinKey(pin)] = {mode, duty: p.state.pins[pinKey(pin)]?.duty||0}; },
      writePin: (pin, duty)=>{ p.state.pins = p.state.pins||{}; const st = p.state.pins[pinKey(pin)] || (p.state.pins[pinKey(pin)]={mode:'OUTPUT',duty:0}); st.duty = duty; },
      readPinV: pin => Sim.termVoltage(p.id, pinKey(pin)) - Sim.termVoltage(p.id, 'GND'),
      serial: txt => {
        app.serials[p.id] = ((app.serials[p.id]||'') + txt).slice(-6000);
        if (editorPart===p.id && $('#editor').classList.contains('open')){
          const s = $('#edSerial'); s.textContent = app.serials[p.id]; s.scrollTop = s.scrollHeight;
        }
      },
    });
    p.state.pins = {};
    rt.start(performance.now());
    app.runtimes[p.id] = rt;
    p.props.autorun = true; save();
    app.serials[p.id] = (app.serials[p.id]||'') + `\n— upload OK, running —\n`;
    if (verbose){ $('#edStatus').textContent='● running'; $('#edStatus').className='st run';
      const s=$('#edSerial'); s.textContent = app.serials[p.id]; s.scrollTop = s.scrollHeight; }
  } catch(e){
    if (verbose){ $('#edStatus').textContent = '✗ '+e.message; $('#edStatus').className='st err'; }
    else toast('Code error: '+esc(e.message), 'danger');
  }
}
function stopRuntime(id){
  const rt = app.runtimes[id];
  if (rt) rt.running = false;
  delete app.runtimes[id];
  const p = app.parts.find(x=>x.id===id);
  if (p){ p.state.pins = {}; p.props.autorun = false; }
}

/* ============================ AUDIO (buzzer) ============================ */
let audio = null, osc = null, oscGain = null;
function updateAudio(anyBeep){
  if (!app.settings.sound){ if (oscGain) oscGain.gain.value = 0; return; }
  if (anyBeep && !audio){
    audio = new (window.AudioContext||window.webkitAudioContext)();
    osc = audio.createOscillator(); oscGain = audio.createGain();
    osc.type='square'; osc.frequency.value = 2300;
    oscGain.gain.value = 0; osc.connect(oscGain); oscGain.connect(audio.destination); osc.start();
  }
  if (oscGain) oscGain.gain.value = anyBeep ? 0.045 : 0;
}

/* ============================ MAIN LOOP ============================ */
let lastT = performance.now();
function tick(now){
  const dt = Math.min(0.1, (now-lastT)/1000); lastT = now;

  // 1. run microcontroller code
  for (const [id, rt] of Object.entries(app.runtimes)){
    const p = app.parts.find(x=>x.id===id);
    if (!p) { delete app.runtimes[id]; continue; }
    if (!p.state.powered){ // brown-out: board reboots when power returns
      if (rt.running){ rt.running = false; p.state.pins = {}; p.state.rebootPending = true; }
      continue;
    }
    if (rt.running) rt.step(now, 4000);
  }
  // (re)boot boards that regained power with a sketch flashed
  for (const p of app.parts){
    if (PARTS.defs[p.type].board && p.state.powered && p.state.rebootPending && p.props.code){
      p.state.rebootPending = false;
      startRuntime(p, false);
    }
  }

  // 2. solve circuit (wires + wireless links: docked legs, breadboard strips, solder traces)
  const res = Sim.solve(app.parts, app.wires, dt, app.links);
  for (const p of app.parts) p.state.reads = res.byPart[p.id];

  // 3. warnings
  let anyBeep = false;
  for (const p of app.parts) if (p.state.beeping) anyBeep = true;
  updateAudio(anyBeep);
  for (const w of res.warnings) toast(w.msg, w.level, w.part.id+w.msg.slice(0,20));

  // 4. visuals
  updateDynamic();
  refreshPanelReads();

  // 5. level checking
  checkActiveLevel();

  requestAnimationFrame(tick);
}

/* ============================ LEARN TAB ============================ */
function renderLearn(){
  const el = $('#learnList');
  let html = '';
  let unit = '';
  for (const lv of LEVELS){
    if (lv.unit!==unit){ unit = lv.unit; html += `<div class="unit">Unit ${unit}</div>`; }
    const done = app.progress[lv.id];
    html += `<button class="level ${done?'done':''}" data-level="${lv.id}">
      <span class="lstat">${done?'✅':'⬜'}</span>
      <span class="ltitle">${lv.title}</span><span class="chev">›</span></button>`;
  }
  html += `<div class="unit">Project ideas — free build</div>`;
  for (const pr of PROJECTS){
    html += `<div class="project"><div class="phead">${pr.icon} <b>${pr.title}</b> <span class="diff">${pr.diff}</span></div><p>${pr.text}</p></div>`;
  }
  el.innerHTML = html;
  el.querySelectorAll('.level').forEach(b=> b.onclick = ()=>openLevel(b.dataset.level));
}

function openLevel(id){
  const lv = LEVELS.find(l=>l.id===id);
  app.activeLevel = id;
  app.levelMem = {};
  $('#learnList').style.display='none';
  const d = $('#levelDetail');
  d.style.display='block';
  d.innerHTML = `
    <button class="btn" id="lvBack">‹ All lessons</button>
    <h2>${lv.title}</h2>
    <div class="goal" id="lvGoal"><span id="lvStat">${app.progress[id]?'✅':'🎯'}</span> <div><b>Goal:</b> ${lv.goal}</div></div>
    <div class="lbody">${lv.body}</div>
    <div class="lbtns">
      <button class="btn accent" id="lvBuild">🔧 Open builder</button>
      <button class="btn" id="lvHint">💡 Hint</button>
    </div>
    <div class="hint" id="lvHintBox" style="display:none">${lv.hint}</div>`;
  $('#lvBack').onclick = ()=>{ $('#levelDetail').style.display='none'; $('#learnList').style.display='block'; renderLearn(); };
  $('#lvBuild').onclick = ()=>switchTab('build');
  $('#lvHint').onclick = ()=>{ const h=$('#lvHintBox'); h.style.display = h.style.display==='none'?'block':'none'; };
  updateLevelChip();
}

function checkActiveLevel(){
  if (!app.activeLevel) return;
  const lv = LEVELS.find(l=>l.id===app.activeLevel);
  if (!lv || app.progress[lv.id]) return;
  let pass = false;
  try { pass = lv.check(app, app.levelMem); } catch(e){ /* level check never crashes the app */ }
  if (pass){
    app.progress[lv.id] = true;
    localStorage.setItem('cl_progress', JSON.stringify(app.progress));
    toast(`🎉 <b>Level complete:</b> ${lv.title}!`, 'ok', 'lv'+lv.id);
    const st = $('#lvStat'); if (st) st.textContent = '✅';
    updateLevelChip();
  }
}
function updateLevelChip(){
  const chip = $('#levelChip');
  if (!app.activeLevel){ chip.style.display='none'; return; }
  const lv = LEVELS.find(l=>l.id===app.activeLevel);
  chip.style.display='flex';
  chip.innerHTML = `${app.progress[lv.id]?'✅':'🎯'} ${lv.title}`;
  chip.onclick = ()=>{ switchTab('learn'); openLevel(lv.id); };
}

/* ============================ GUIDE TAB ============================ */
function renderGuide(){
  const el = $('#guideList');
  el.innerHTML = PARTS.order.map(type=>{
    const d = PARTS.defs[type];
    const fake = {id:'g'+type, type, x:0, y:0, rot:0, props:JSON.parse(JSON.stringify(d.defaults||{})), state:{}};
    return `<div class="gcard">
      <div class="gpic"><svg viewBox="-8 -8 ${d.w+16} ${d.h+16}"><defs>${PARTS.SVG_DEFS}</defs>${d.draw(fake)}</svg></div>
      <div class="gtxt"><h3>${d.info.title}</h3><div class="infotext">${d.info.body}</div>
      <button class="btn accent gadd" data-type="${type}">＋ Add to canvas</button></div></div>`;
  }).join('');
  el.querySelectorAll('.gadd').forEach(b=> b.onclick = ()=>{ switchTab('build'); addPart(b.dataset.type); });
}

/* ============================ TABS / MENU ============================ */
function switchTab(tab){
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active', b.dataset.tab===tab));
  ['build','learn','guide'].forEach(v=> $('#view-'+v).style.display = v===tab?'':'none');
  if (tab==='learn'){ renderLearn(); }
  if (tab==='guide'){ renderGuide(); }
  if (tab==='build'){ applyVB(); }
}
document.querySelectorAll('.tab').forEach(b=> b.onclick = ()=>switchTab(b.dataset.tab));

$('#menuBtn').onclick = ()=> $('#menu').classList.toggle('open');
document.addEventListener('click', e=>{
  if (!e.target.closest('#menu') && !e.target.closest('#menuBtn')) $('#menu').classList.remove('open');
});
$('#mSound').onclick = ()=>{
  app.settings.sound = !app.settings.sound;
  localStorage.setItem('cl_settings', JSON.stringify(app.settings));
  $('#mSound').textContent = app.settings.sound ? '🔊 Sound: on' : '🔇 Sound: off';
  if (app.settings.sound) updateAudio(false); // unlock audio context on user gesture
};
$('#mClear').onclick = ()=>{
  if (!confirm('Clear the whole circuit?')) return;
  Object.keys(app.runtimes).forEach(stopRuntime);
  app.parts=[]; app.wires=[]; select(null); renderAll(); save();
  $('#menu').classList.remove('open');
};
$('#mDemo').onclick = ()=>{ loadDemo(); $('#menu').classList.remove('open'); };
$('#mInstall').onclick = ()=>{
  $('#modalBody').innerHTML = `<h2>Install on your phone 📱</h2><div class="infotext">
  <p>Circuit Lab is a PWA — it installs and <b>works fully offline</b>.</p>
  <p><b>Android (Chrome):</b> menu ⋮ → <i>Add to Home screen</i> → Install.</p>
  <p><b>iPhone (Safari):</b> Share <span style="font-size:1.1em">⎋</span> → <i>Add to Home Screen</i>.</p>
  <p>It then launches full-screen from its own icon, no internet needed. Your circuits, code and level progress are saved on the device.</p></div>`;
  $('#modal').classList.add('open');
  $('#menu').classList.remove('open');
};

/* ============================ PARTS TRAY ============================ */
function renderTray(){
  const cats = ['Power','Basics','Boards'];
  $('#tray').innerHTML = cats.map(cat=>
    `<div class="traycat">${cat}</div>` +
    PARTS.order.filter(t=>PARTS.defs[t].cat===cat).map(t=>{
      const d = PARTS.defs[t];
      const fake = {id:'t'+t, type:t, x:0, y:0, rot:0, props:JSON.parse(JSON.stringify(d.defaults||{})), state:{}};
      return `<button class="traybtn" data-type="${t}" title="${d.name}">
        <svg viewBox="-6 -6 ${d.w+12} ${d.h+12}"><defs>${PARTS.SVG_DEFS}</defs>${d.draw(fake)}</svg>
        <span>${d.name}</span></button>`;
    }).join('')
  ).join('');
  document.querySelectorAll('.traybtn').forEach(b=> b.onclick = ()=>addPart(b.dataset.type));
}

/* ============================ SAVE / LOAD ============================ */
let saveTimer = null;
function save(){
  clearTimeout(saveTimer);
  saveTimer = setTimeout(()=>{
    const data = {
      v:1, nextId: app.nextId,
      parts: app.parts.map(p=>({id:p.id, type:p.type, x:p.x, y:p.y, rot:p.rot, props:p.props})),
      wires: app.wires,
    };
    try { localStorage.setItem('cl_save', JSON.stringify(data)); } catch(e){}
  }, 400);
}
function load(){
  try {
    const data = JSON.parse(localStorage.getItem('cl_save'));
    if (!data || !Array.isArray(data.parts)) return false;
    app.nextId = data.nextId||1000;
    app.parts = data.parts.filter(p=>PARTS.defs[p.type]).map(p=>({...p,
      props: Object.assign(JSON.parse(JSON.stringify(PARTS.defs[p.type].defaults||{})), p.props),
      state: { rebootPending: !!(p.props && p.props.autorun && p.props.code) }, // boards boot their sketch on power-up, like real hardware
    }));
    app.wires = (data.wires||[]).filter(w=>app.parts.find(p=>p.id===w.a.part)&&app.parts.find(p=>p.id===w.b.part));
    return app.parts.length>0;
  } catch(e){ return false; }
}
function loadDemo(){
  Object.keys(app.runtimes).forEach(stopRuntime);
  app.parts = []; app.wires = []; app.nextId = 1;
  app._quiet = true;
  try {
  const bat = addPart('battery_2aa'); bat.x=180; bat.y=280;
  const res = addPart('resistor');    res.x=400; res.y=200;
  const led = addPart('led');         led.x=560; led.y=260;
  addWire({part:bat.id, term:'+'}, {part:res.id, term:'1'});
  addWire({part:res.id, term:'2'}, {part:led.id, term:'A'});
  addWire({part:led.id, term:'K'}, {part:bat.id, term:'-'});
  } finally { app._quiet = false; }
  select(null);
  app.vb = {x:60, y:80, w:900};
  applyVB(); renderAll(); save();
}

/* ============================ BOOT ============================ */
function boot(){
  document.querySelector('#svgdefs defs').innerHTML = PARTS.SVG_DEFS;
  renderTray();
  if (!load()) loadDemo();
  renderAll();
  applyVB();
  $('#mSound').textContent = app.settings.sound ? '🔊 Sound: on' : '🔇 Sound: off';
  $('#btn3d').onclick = ()=> setView3d(!app.view3d);
  window.addEventListener('resize', applyVB);
  if (window.ResizeObserver) new ResizeObserver(applyVB).observe($('#canvasWrap'));
  switchTab('build');
  if (!localStorage.getItem('cl_welcomed')){
    localStorage.setItem('cl_welcomed','1');
    setTimeout(()=>toast('👋 Welcome! The demo circuit is live — tap parts to inspect them, or head to the <b>Learn</b> tab to start Level 1.', 'ok', 'welcome'), 600);
  }
  requestAnimationFrame(t=>{ lastT=t; tick(t); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
boot();
