/* Circuit Lab — DC circuit solver (modified nodal analysis, Norton companion models).
   Circuits only work if they'd work in real life: polarity, forward voltages,
   internal resistance, current limits, damage. DOM-free (testable in node). */
'use strict';

const Sim = (() => {

  function buildNets(parts, wires){
    const parent = {};
    const find = k => { while (parent[k] !== k) { parent[k] = parent[parent[k]]; k = parent[k]; } return k; };
    const uni = (a,b) => { a=find(a); b=find(b); if (a!==b) parent[b]=a; };
    for (const p of parts){
      const d = PARTS.defs[p.type];
      for (const t of d.terms){ const k = p.id+':'+t.id; parent[k]=k; }
    }
    for (const w of wires){
      const ka = w.a.part+':'+w.a.term, kb = w.b.part+':'+w.b.term;
      if (parent[ka]!==undefined && parent[kb]!==undefined) uni(ka,kb);
    }
    return { find, keys:Object.keys(parent) };
  }

  function gauss(A, b){
    const n = b.length;
    for (let c=0;c<n;c++){
      let piv=c, best=Math.abs(A[c][c]);
      for (let r=c+1;r<n;r++) if (Math.abs(A[r][c])>best){best=Math.abs(A[r][c]);piv=r;}
      if (best<1e-14) continue;
      if (piv!==c){ [A[c],A[piv]]=[A[piv],A[c]]; [b[c],b[piv]]=[b[piv],b[c]]; }
      for (let r=c+1;r<n;r++){
        const f = A[r][c]/A[c][c]; if (!f) continue;
        for (let k=c;k<n;k++) A[r][k]-=f*A[c][k];
        b[r]-=f*b[c];
      }
    }
    const x = new Array(n).fill(0);
    for (let r=n-1;r>=0;r--){
      if (Math.abs(A[r][r])<1e-14) continue;
      let s=b[r];
      for (let k=r+1;k<n;k++) s-=A[r][k]*x[k];
      x[r]=s/A[r][r];
    }
    return x;
  }

  /* One full solve pass: returns {netV: key→volts, elResults: [{part, el, i, v}]} */
  function solvePass(parts, wires, nets){
    // collect elements
    const els = [];
    for (const p of parts){
      if (p.state.broken && (p.type==='led'||p.type==='resistor')) continue; // open when burnt
      const d = PARTS.defs[p.type];
      for (const el of d.elements(p)) els.push({part:p, el});
    }
    // index nets that are actually used
    const idx = new Map();
    const netOf = (p, term) => nets.find(p.id+':'+term);
    for (const {part, el} of els){
      for (const t of [el.a, el.b]){
        const n = netOf(part, t);
        if (!idx.has(n)) idx.set(n, idx.size);
      }
    }
    const n = idx.size;
    if (!n) return { netV:{}, elResults:[], netOf };
    const G = Array.from({length:n},()=>new Array(n).fill(0));
    const I = new Array(n).fill(0);
    for (let i=0;i<n;i++) G[i][i] += 1e-9; // gmin to reference keeps floating nets defined
    // anchor the first source's negative terminal near 0 V so absolute node voltages are meaningful
    const ref = els.find(x=>x.el.kind==='v');
    if (ref) G[idx.get(netOf(ref.part, ref.el.b))][idx.get(netOf(ref.part, ref.el.b))] += 1;

    for (const {part, el} of els){
      const ia = idx.get(netOf(part, el.a)), ib = idx.get(netOf(part, el.b));
      let g = 0, j = 0;
      if (el.kind==='r'){ g = 1/Math.max(el.r,1e-6); }
      else if (el.kind==='v'){ g = 1/Math.max(el.r,1e-6); j = el.v*g; }
      else if (el.kind==='led'){
        // Conducting LED companion model: rd in series with an opposing vf EMF
        // (same nodal stamp as a v-source of vf: i into anode = (Vab - vf)/rd).
        if (part.state.ledOn){ g = 1/el.rd; j = el.vf/el.rd; }
        else { g = 1e-9; j = 0; }
      }
      G[ia][ia]+=g; G[ib][ib]+=g; G[ia][ib]-=g; G[ib][ia]-=g;
      if (j){ I[ia]+=j; I[ib]-=j; }
    }
    const x = gauss(G.map(r=>r.slice()), I.slice());
    const netV = {};
    for (const [k,i] of idx) netV[k]=x[i];

    const elResults = els.map(({part, el})=>{
      const va = netV[netOf(part, el.a)]??0, vb = netV[netOf(part, el.b)]??0;
      const v = va-vb;
      let i = 0;
      if (el.kind==='r') i = v/Math.max(el.r,1e-6);
      else if (el.kind==='v') i = (el.v - v)/Math.max(el.r,1e-6); // current OUT of + terminal
      else if (el.kind==='led') i = part.state.ledOn ? (v-el.vf)/el.rd : 0;
      return { part, el, v, i };
    });
    return { netV, elResults, netOf };
  }

  /* Iterate: LED on/off states + module/board power flags until stable. */
  function solve(parts, wires, dt){
    const nets = buildNets(parts, wires);
    let res = null;
    const vAt = (p,t)=> res? (res.netV[nets.find(p.id+':'+t)]??0) : 0;

    for (let iter=0; iter<18; iter++){
      res = solvePass(parts, wires, nets);
      let changed = false;
      for (const p of parts){
        const d = PARTS.defs[p.type];
        if (p.type==='led' && !p.state.broken){
          const el = d.elements(p)[0];
          const v = vAt(p,'A') - vAt(p,'K');
          const want = p.state.ledOn ? ((v-el.vf)/el.rd > 1e-6) : (v > el.vf);
          if (want !== !!p.state.ledOn){ p.state.ledOn = want; changed = true; }
        }
        if (p.type==='tp4056'){
          const pin = vAt(p,'IN+') - vAt(p,'IN-');
          const want = pin > 4.2 && !p.state.broken;
          if (want !== !!p.state.powered){ p.state.powered = want; changed = true; }
        }
        if (p.type==='boost'){
          const vin = vAt(p,'IN+') - vAt(p,'IN-');
          const want = vin > 1.9 && vin < 5.6 && !p.state.broken;
          if (want !== !!p.state.powered){ p.state.powered = want; changed = true; }
        }
        if (d.board){
          const vin = vAt(p,'VIN') - vAt(p,'GND');
          const v33 = vAt(p,'3V3') - vAt(p,'GND');
          const v5  = p.type==='uno' ? vAt(p,'5V') - vAt(p,'GND') : 0;
          const want = !p.state.broken && (!!p.props.usb || vin > 4.2 || v33 > 3.05 || v5 > 4.4);
          if (want !== !!p.state.powered){ p.state.powered = want; changed = true; }
        }
      }
      if (!changed) break;
    }

    /* ---- post-process: read-outs, behaviours, damage, warnings ---- */
    const warnings = [];
    const byPart = {};
    for (const p of parts) byPart[p.id] = { i:0, v:0, p:0, notes:[] };

    for (const {part, el, v, i} of res.elResults){
      const r = byPart[part.id];
      if (el.tag==='main' || el.tag==='chg' || el.tag==='out'){ r.i = i; r.v = v; r.p = Math.abs(v*i); }

      // damage & warnings
      const aI = Math.abs(i);
      if (el.kind==='v' && el.maxI && aI > el.maxI){
        if (el.lipo){
          warnings.push({part, msg:`⚠️ LiPo overloaded (${(aI).toFixed(1)} A)! Real LiPos can catch fire when shorted — add resistance or fix the short.`, level:'danger'});
        } else if (el.gpio){
          warnings.push({part, msg:`⚠️ GPIO pin over 40 mA (${(aI*1000).toFixed(0)} mA) — a real pin would burn out. Add a resistor or use a transistor.`, level:'warn'});
        } else {
          warnings.push({part, msg:`⚠️ ${PARTS.defs[part.type].name} over current limit (${aI.toFixed(2)} A) — short circuit? It's getting hot.`, level:'warn'});
        }
        part.state.hot = true;
      } else if (el.kind==='v') part.state.hot = false;

      if (part.type==='led' && !part.state.broken){
        part.state.brightness = Math.max(0, Math.min(1, i/0.015));
        if (i > el.maxI){
          part.state.broken = true; part.state.brightness = 0; part.state.ledOn = false;
          warnings.push({part, msg:`💥 LED blew! ${(i*1000).toFixed(0)} mA is way over its ~20 mA limit. Use a bigger series resistor. (Tap the LED → Repair)`, level:'danger'});
        }
      }
      if (part.type==='resistor' && el.maxP && Math.abs(v*i) > el.maxP && !part.state.broken){
        part.state.broken = true;
        warnings.push({part, msg:`🔥 Resistor smoked! ${ (Math.abs(v*i)).toFixed(1) } W through a ¼ W part. Use a higher value or higher-rated resistor.`, level:'danger'});
      }
      if (part.type==='buzzer'){ part.state.beeping = !part.state.broken && v > 1.6 && i > 0.005; }
      if (part.type==='motor'){
        part.state.speed = part.state.broken?0:Math.max(-1,Math.min(1, i/0.25));
        part.state.rotAngle = ((part.state.rotAngle||0) + (part.state.speed||0)*dt*900) % 360;
      }
      if (part.type==='tp4056' && el.tag==='chg'){
        // current out of the 4.35V source into battery = charging
        part.state.chargingOut = i > 0.08; // below that ≈ termination current → "done" LED
      }
    }

    // LiPo charge bookkeeping (sped up ~200x so you can watch it)
    for (const p of parts){
      if (p.type!=='lipo') continue;
      const r = byPart[p.id];
      const capAh = 0.5;
      let soc = p.props.charge ?? 65;
      // r.i = current OUT of battery + terminal. Negative = being charged.
      soc -= (r.i * dt * 200) / (capAh*3600) * 100;
      p.props.charge = Math.max(0, Math.min(100, soc));
      p.state.charging = r.i < -0.08;
      if (soc <= 0.5 && r.i > 0.01) warnings.push({part:p, msg:'🪫 LiPo is empty — recharge it with a TP4056.', level:'warn'});
    }

    Sim.last = { netV: res.netV, nets, byPart, warnings };
    return Sim.last;
  }

  /* voltage at a specific part terminal (for digitalRead/analogRead) */
  function termVoltage(partId, term){
    if (!Sim.last) return 0;
    return Sim.last.netV[Sim.last.nets.find(partId+':'+term)] ?? 0;
  }

  return { solve, termVoltage, last:null };
})();
if (typeof module!=='undefined') module.exports = Sim;
