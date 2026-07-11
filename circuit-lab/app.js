/* Circuit Lab — main app: canvas, touch interactions, panels, code editor, learn UI, main loop */
'use strict';

const app = {
  parts: [], wires: [], nextId: 1,
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
function svgPt(cx, cy){
  const r = canvas.getBoundingClientRect();
  return { x: app.vb.x + (cx-r.left)/r.width*app.vb.w,
           y: app.vb.y + (cy-r.top)/r.width*app.vb.w };
}

function termAbs(part, termId){
  return PARTS.termPos(part).find(t=>t.id===termId);
}

/* nearest terminal to a canvas point — board pins sit close together, so
   picking by distance beats trusting whichever overlapping hit-circle is on top */
function nearestTerm(pt, maxDist, exclude){
  let best = null, bd = maxDist;
  for (const p of app.parts){
    for (const t of PARTS.termPos(p)){
      if (exclude && exclude.part===p.id && exclude.term===t.id) continue;
      const d = Math.hypot(t.x-pt.x, t.y-pt.y);
      if (d < bd){ bd = d; best = {part:p.id, term:t.id}; }
    }
  }
  return best;
}

function renderAll(){
  const deco=[], wiresS=[], partsS=[], termsS=[];
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
    const pa = app.parts.find(p=>p.id===w.a.part), pb = app.parts.find(p=>p.id===w.b.part);
    if (!pa||!pb) continue;
    const a = termAbs(pa, w.a.term), b = termAbs(pb, w.b.term);
    if (!a||!b) continue;
    const mx=(a.x+b.x)/2, my=(a.y+b.y)/2 + Math.min(40, Math.hypot(b.x-a.x,b.y-a.y)*0.15+8);
    const sel = app.sel?.kind==='wire' && app.sel.id===w.id;
    wiresS.push(`<g class="wire${sel?' sel':''}" data-wire="${w.id}">
      <path d="M${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}" class="whit"/>
      <path d="M${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}" class="wvis" style="stroke:${sel?'#4da3ff':w.color}"/></g>`);
  }
  $('#scene').innerHTML = `<g>${deco.join('')}</g><g>${wiresS.join('')}</g><g>${partsS.join('')}</g><g>${termsS.join('')}</g><path id="rubber" class="rubber" d="" visibility="hidden"/>`;
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
  const termEl = ev.target.closest('.term');
  const partEl = ev.target.closest('.part');
  const wireEl = ev.target.closest('.wire');
  if (termEl){
    const from = nearestTerm(svgPt(ev.clientX, ev.clientY), 40) ||
      {part:termEl.dataset.part, term:termEl.dataset.term};
    gesture = {mode:'wire', from, sx:ev.clientX, sy:ev.clientY, moved:false};
    app.pendingWire = {...from};
    renderAll();
  } else if (partEl){
    const p = app.parts.find(x=>x.id===partEl.dataset.part);
    gesture = {mode:'drag', part:p, ox:p.x, oy:p.y, sx:ev.clientX, sy:ev.clientY, moved:false};
  } else if (wireEl){
    gesture = {mode:'tapwire', id:wireEl.dataset.wire};
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
  if (gesture.mode==='drag' && gesture.moved){
    gesture.part.x = snap(gesture.ox + dx*scale);
    gesture.part.y = snap(gesture.oy + dy*scale);
    renderAll();
  } else if (gesture.mode==='pan' && gesture.moved){
    app.vb.x = gesture.vx - dx*scale; app.vb.y = gesture.vy - dy*scale;
    applyVB();
  } else if (gesture.mode==='wire'){
    const p = app.parts.find(x=>x.id===gesture.from.part);
    const a = termAbs(p, gesture.from.term);
    const m = svgPt(ev.clientX, ev.clientY);
    const rb = $('#rubber');
    if (rb){ rb.setAttribute('d', `M${a.x} ${a.y} L${m.x} ${m.y}`); rb.setAttribute('visibility','visible'); }
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
      toast('Now tap another ● terminal to finish the wire (tap empty space to cancel)', 'info', 'wire2');
    } else {
      const scale = app.vb.w / canvas.getBoundingClientRect().width;
      const to = nearestTerm(svgPt(ev.clientX, ev.clientY), 40*Math.max(1,scale), g.from);
      if (to) addWire(g.from, to);
      app.pendingWire = null;
    }
    renderAll(); return;
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
  if (g.mode==='drag'){ save(); return; }
  if (g.mode==='tapwire'){
    if (app.pendingWire?.sticky){ app.pendingWire=null; }
    select({kind:'wire', id:g.id}); renderAll(); return;
  }
  if (g.mode==='pan' && !g.moved){
    // tap empty: complete sticky wire? cancel things
    if (app.pendingWire){ app.pendingWire=null; renderAll(); }
    select(null); renderAll();
  }
});
canvas.addEventListener('pointercancel', ev=>{ activePtrs.delete(ev.pointerId); gesture=null; });

// second tap completes sticky wire (handled via pointerdown on term when pendingWire.sticky)
canvas.addEventListener('pointerdown', ev=>{
  if (ev.target.closest('.term') && app.pendingWire?.sticky){
    const from = {part:app.pendingWire.part, term:app.pendingWire.term};
    const to = nearestTerm(svgPt(ev.clientX, ev.clientY), 40, from);
    if (to) addWire(from, to);
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
    el.innerHTML = `<div class="prow"><b>Wire</b><span class="spacer"></span>
      <button class="btn danger" id="pDelW">🗑 Delete wire</button></div>`;
    $('#pDelW').onclick = ()=>{ app.wires = app.wires.filter(w=>w.id!==app.sel.id); select(null); renderAll(); save(); };
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

  // 2. solve circuit
  const res = Sim.solve(app.parts, app.wires, dt);
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
  window.addEventListener('resize', applyVB);
  switchTab('build');
  if (!localStorage.getItem('cl_welcomed')){
    localStorage.setItem('cl_welcomed','1');
    setTimeout(()=>toast('👋 Welcome! The demo circuit is live — tap parts to inspect them, or head to the <b>Learn</b> tab to start Level 1.', 'ok', 'welcome'), 600);
  }
  requestAnimationFrame(t=>{ lastT=t; tick(t); });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
}
boot();
