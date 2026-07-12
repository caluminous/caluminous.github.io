/* Circuit Lab — real 3D view (three.js). Renders the live circuit as actual 3D
   models: orbit with one finger, pan with two, pinch to zoom, swing below the
   board to see the copper side and solder traces. Tap to select/toggle, drag
   parts on the bench, tap terminal knobs to wire — the same circuit data as 2D. */
'use strict';

const View3D = (() => {
  let renderer=null, scene, camera, root, ground, grid;
  let partGroups={}, dynFns=[], knobMeshes=[], selRing=null, pendKnob=null;
  let structHash='';
  const cam = { tx:450, ty:0, tz:320, theta:-0.9, phi:1.02, dist:760 };
  const texCache = {};
  const api = { active:false };

  const W2 = (x,y)=> new THREE.Vector3(x, 0, y); // 2D world → 3D bench plane

  /* ---------------- materials & helpers ---------------- */
  const MAT = {};
  function mat(key, color, rough=0.6, metal=0, emissive=0x000000){
    const k = key;
    if (!MAT[k]) MAT[k] = new THREE.MeshStandardMaterial({color, roughness:rough, metalness:metal, emissive});
    return MAT[k];
  }
  function box(g, w,h,d, m, x,y,z, ry=0){
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), m);
    mesh.position.set(x,y,z); mesh.rotation.y = ry;
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh); return mesh;
  }
  function cyl(g, rT,rB,h, m, x,y,z, axis='y', seg=20){
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rT,rB,h,seg), m);
    if (axis==='x') mesh.rotation.z = Math.PI/2;
    if (axis==='z') mesh.rotation.x = Math.PI/2;
    mesh.position.set(x,y,z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    g.add(mesh); return mesh;
  }
  function sph(g, r, m, x,y,z){
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), m);
    mesh.position.set(x,y,z); mesh.castShadow = true;
    g.add(mesh); return mesh;
  }

  const BAND_HEX = {'#000':0x111111,'#7a4a21':0x7a4a21,'#e33':0xee3333,'#f80':0xff8800,'#fd0':0xffdd00,'#2b2':0x22bb22,'#26f':0x2266ff,'#a4e':0xaa44ee,'#999':0x999999,'#fff':0xffffff};
  function bandColors(v){
    let mult=0, x=v;
    while (x>=100){ x/=10; mult++; }
    x = Math.round(x);
    const cols = ['#000','#7a4a21','#e33','#f80','#fd0','#2b2','#26f','#a4e','#999','#fff'];
    return [cols[Math.floor(x/10)], cols[x%10], cols[mult]].map(c=>BAND_HEX[c]);
  }
  const LEDHEX = { red:0xff3322, green:0x33ee55, blue:0x3388ff, yellow:0xffdd22, white:0xffffff };

  /* canvas-drawn textures for board tops/bottoms */
  function tex(key, w, h, draw){
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = w*2; c.height = h*2;
    const ctx = c.getContext('2d');
    ctx.scale(2,2);
    draw(ctx);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 4;
    texCache[key] = t;
    return t;
  }
  function breadboardTex(){
    return tex('bb', 380, 300, ctx=>{
      ctx.fillStyle='#f2eee6'; ctx.fillRect(0,0,380,300);
      ctx.strokeStyle='#e05555'; ctx.lineWidth=3;
      [14,246].forEach(y=>{ ctx.beginPath(); ctx.moveTo(14,y); ctx.lineTo(366,y); ctx.stroke(); });
      ctx.strokeStyle='#4488dd';
      [54,286].forEach(y=>{ ctx.beginPath(); ctx.moveTo(14,y); ctx.lineTo(366,y); ctx.stroke(); });
      ctx.fillStyle='#ddd8cc'; ctx.fillRect(6,166,368,8);
      ctx.fillStyle='#1c2027';
      const d = PARTS.defs.breadboard;
      for (const h of d.holes()) ctx.fillRect(h.x-3, h.y-3, 6, 6);
    });
  }
  function perfTopTex(){
    return tex('pft', 240, 160, ctx=>{
      ctx.fillStyle='#caa14e'; ctx.fillRect(0,0,240,160);
      const d = PARTS.defs.perfboard;
      for (const h of d.holes()){
        ctx.fillStyle='#caa76a'; ctx.beginPath(); ctx.arc(h.x,h.y,5,0,7); ctx.fill();
        ctx.fillStyle='#4a3618'; ctx.beginPath(); ctx.arc(h.x,h.y,2.6,0,7); ctx.fill();
      }
    });
  }
  function perfBotTex(){
    return tex('pfb', 240, 160, ctx=>{
      ctx.fillStyle='#ad8340'; ctx.fillRect(0,0,240,160);
      const d = PARTS.defs.perfboard;
      for (const h of d.holes()){
        ctx.fillStyle='#c97f3c'; ctx.beginPath(); ctx.arc(h.x,h.y,6.5,0,7); ctx.fill();
        ctx.fillStyle='#8a5a24'; ctx.beginPath(); ctx.arc(h.x,h.y,2.4,0,7); ctx.fill();
      }
    });
  }

  /* ---------------- part builders (local coords = 2D part coords) ---------------- */
  function elevationOf(p){
    // parts sitting on a board base stand on top of it
    const d = PARTS.defs[p.type];
    if (d.boardBase) return 0;
    const cx = p.x + d.w/2, cy = p.y + d.h/2;
    for (const q of app.parts){
      const qd = PARTS.defs[q.type];
      if (!qd.boardBase) continue;
      if (cx >= q.x-6 && cx <= q.x+qd.w+6 && cy >= q.y-6 && cy <= q.y+qd.h+6)
        return q.type==='breadboard' ? 9 : 5;
    }
    return 0;
  }

  function buildPart(p){
    const d = PARTS.defs[p.type];
    const g = new THREE.Group();
    const inner = new THREE.Group();          // local coords, origin = part top-left
    inner.position.set(-d.w/2, 0, -d.h/2);
    g.add(inner);
    const y0 = elevationOf(p);
    g.position.set(p.x + d.w/2, y0, p.y + d.h/2);
    g.rotation.y = -(p.rot||0) * Math.PI/180;
    g.userData.partId = p.id;
    const dyn = {};

    const metal = mat('metal', 0xb8c0cc, 0.35, 0.9);
    const gold = mat('gold', 0xd4a017, 0.4, 0.8);
    const dark = mat('dark', 0x22262e, 0.7);
    const pcbG = mat('pcbG', 0x0d6a3c, 0.75);
    const pcbB = mat('pcbB', 0x1a5e8a, 0.75);

    switch(p.type){
      case 'battery_aa': {
        cyl(inner, 16,16,100, mat('batt', 0x353b46, 0.5), 56,16,22, 'x');
        cyl(inner, 15.5,15.5,26, metal, 19,16,22, 'x');
        cyl(inner, 5,5,8, metal, 110,16,22, 'x');
        break;
      }
      case 'battery_2aa': {
        box(inner, 124, 22, 64, dark, 65, 9, 35);
        cyl(inner, 12,12,92, mat('batt', 0x353b46, 0.5), 62,24,20, 'x');
        cyl(inner, 12,12,92, mat('batt', 0x353b46, 0.5), 62,24,50, 'x');
        break;
      }
      case 'battery_9v': {
        box(inner, 54, 32, 82, dark, 35, 16, 52);
        cyl(inner, 7,7,8, metal, 22, 34, 8);
        box(inner, 12, 8, 10, metal, 48, 34, 7);
        break;
      }
      case 'lipo': {
        box(inner, 96, 13, 58, mat('lipo', 0xaab4c8, 0.4, 0.6), 50, 6.5, 36);
        box(inner, 14, 4, 6, mat('wred', 0xdd2222, 0.5), 101, 5, 22);
        box(inner, 14, 4, 6, dark, 101, 5, 50);
        dyn.strip = box(inner, 58, 2, 11, new THREE.MeshStandardMaterial({color:0x33cc55, emissive:0x114411}), 43, 14, 36);
        break;
      }
      case 'usb5v': {
        box(inner, 72, 26, 48, mat('white', 0xe8ebf2, 0.5), 40, 13, 32);
        box(inner, 18, 14, 26, metal, 83, 13, 32);
        break;
      }
      case 'tp4056': {
        box(inner, 94, 4, 68, pcbB, 55, 2, 38);
        box(inner, 30, 4, 22, dark, 55, 6, 37);
        box(inner, 12, 6, 14, metal, 8, 5, 38);
        dyn.chg = box(inner, 5, 2, 5, new THREE.MeshStandardMaterial({color:0x551111, emissive:0x000000}), 26, 4.5, 36);
        dyn.ok = box(inner, 5, 2, 5, new THREE.MeshStandardMaterial({color:0x113355, emissive:0x000000}), 26, 4.5, 50);
        break;
      }
      case 'boost': {
        box(inner, 92, 4, 56, pcbG, 52, 2, 32);
        cyl(inner, 12,12,9, mat('coil', 0x1c1f26, 0.6), 38, 8.5, 32);
        cyl(inner, 6,6,10, mat('copper', 0xb4642a, 0.4, 0.7), 38, 9, 32);
        box(inner, 24, 5, 14, dark, 70, 6.5, 26);
        dyn.pwr = sph(inner, 2.5, new THREE.MeshStandardMaterial({color:0x226633, emissive:0x000000}), 90, 5, 10);
        break;
      }
      case 'resistor': {
        cyl(inner, 1.4,1.4,100, metal, 50, 3, 14, 'x');
        cyl(inner, 9,9,46, mat('resbody', 0xd8bd8e, 0.55), 50, 7, 14, 'x');
        const bands = bandColors(p.props.value||220);
        [-11,-1,9].forEach((dx,i)=>{
          cyl(inner, 9.5,9.5,4.5, new THREE.MeshStandardMaterial({color:bands[i], roughness:0.5}), 50+dx, 7, 14, 'x');
        });
        cyl(inner, 9.5,9.5,4, gold, 50+19, 7, 14, 'x');
        break;
      }
      case 'led': {
        const c = LEDHEX[p.props.color||'red'];
        cyl(inner, 1.3,1.3,14, metal, 12, 7, 60);
        cyl(inner, 1.3,1.3,14, metal, 32, 7, 60);
        const bodyM = new THREE.MeshStandardMaterial({color:c, roughness:0.25, transparent:true, opacity:0.85, emissive:0x000000});
        cyl(inner, 13,14,4, bodyM, 22, 14, 58);
        cyl(inner, 12,12,14, bodyM, 22, 22, 58);
        sph(inner, 12, bodyM, 22, 29, 58);
        dyn.ledM = bodyM; dyn.ledC = c;
        break;
      }
      case 'button': {
        box(inner, 40, 14, 40, dark, 28, 7, 28);
        dyn.cap = cyl(inner, 13,13,9, mat('btncap', 0xe84545, 0.4), 28, 18, 28);
        break;
      }
      case 'switch': {
        cyl(inner, 2,2,76, metal, 38, 4, 20, 'x');
        box(inner, 52, 15, 24, dark, 38, 8, 20);
        dyn.knob = box(inner, 13, 9, 16, metal, 24, 19, 20);
        break;
      }
      case 'pot': {
        box(inner, 60, 14, 44, mat('potbody', 0x2a5db0, 0.6), 36, 7, 32);
        cyl(inner, 15,16,11, metal, 36, 19, 32);
        dyn.knob = new THREE.Group();
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.5, 11), mat('wred', 0xdd2222, 0.5));
        stripe.position.set(0, 0, -6.5);
        dyn.knob.add(stripe);
        dyn.knob.position.set(36, 25.5, 32);
        inner.add(dyn.knob);
        break;
      }
      case 'capacitor': {
        cyl(inner, 1.2,1.2,14, metal, 14, 5, 60);
        cyl(inner, 1.2,1.2,14, metal, 30, 5, 60);
        const capM = mat('capbody', 0x1d3f66, 0.5);
        cyl(inner, 15,15,36, capM, 22, 28, 28);
        box(inner, 7, 36, 0.8, mat('capstripe', 0xc8d2e0, 0.5), 12.5, 28, 43);
        break;
      }
      case 'buzzer': {
        cyl(inner, 23,24,15, mat('buzz', 0x15181f, 0.55), 30, 7.5, 26);
        cyl(inner, 4,4,2, mat('black', 0x05070a, 0.6), 30, 15.5, 26);
        break;
      }
      case 'motor': {
        cyl(inner, 16,16,52, metal, 32, 16, 32, 'x');
        cyl(inner, 3,3,16, mat('shaft', 0x8a929d, 0.35, 0.8), 66, 16, 32, 'x');
        dyn.rotor = new THREE.Group();
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(3, 36, 5), mat('white', 0xe8ebf2, 0.5));
        const b2 = new THREE.Mesh(new THREE.BoxGeometry(3, 5, 36), mat('white', 0xe8ebf2, 0.5));
        b1.castShadow = b2.castShadow = true;
        dyn.rotor.add(b1); dyn.rotor.add(b2);
        dyn.rotor.position.set(76, 16, 32);
        inner.add(dyn.rotor);
        break;
      }
      case 'breadboard': {
        const topM = new THREE.MeshStandardMaterial({map:breadboardTex(), roughness:0.6});
        const sideM = mat('bbside', 0xd9d4c8, 0.6);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(380, 9, 300), [sideM,sideM,topM,sideM,sideM,sideM]);
        mesh.position.set(190, 4.5, 150);
        mesh.castShadow = mesh.receiveShadow = true;
        inner.add(mesh);
        break;
      }
      case 'perfboard': {
        const topM = new THREE.MeshStandardMaterial({map:perfTopTex(), roughness:0.65});
        const botM = new THREE.MeshStandardMaterial({map:perfBotTex(), roughness:0.5, metalness:0.25});
        const sideM = mat('pfside', 0x9c7433, 0.65);
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(240, 5, 160), [sideM,sideM,topM,botM,sideM,sideM]);
        mesh.position.set(120, 2.5, 80);
        mesh.castShadow = mesh.receiveShadow = true;
        inner.add(mesh);
        // solder traces on the copper side — visible when you orbit underneath
        const hs = {}; PARTS.defs.perfboard.holes().forEach(h=>hs[h.id]=h);
        for (const s of (p.props.solders||[])){
          const a = hs[s[0]], b = hs[s[1]];
          if (!a||!b) continue;
          const va = new THREE.Vector3(a.x, -1.2, a.y), vb = new THREE.Vector3(b.x, -1.2, b.y);
          const curve = new THREE.LineCurve3(va, vb);
          const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 1, 2, 8), mat('solder', 0xd8dde6, 0.3, 0.85));
          inner.add(tube);
          [va,vb].forEach(v=>{ const blob = sph(inner, 3.1, mat('solder', 0xd8dde6, 0.3, 0.85), v.x, v.y, v.z); blob.castShadow=false; });
        }
        break;
      }
      case 'esp32': {
        box(inner, 194, 4, 106, mat('pcbBlack', 0x14161c, 0.7), 105, 2, 55);
        box(inner, 62, 8, 40, metal, 105, 8, 37);
        box(inner, 26, 8, 16, metal, 105, 6, 96);
        box(inner, 14, 6, 12, dark, 53, 7, 92);
        box(inner, 14, 6, 12, dark, 157, 7, 92);
        dyn.pwr = box(inner, 4, 2, 4, new THREE.MeshStandardMaterial({color:0x441111, emissive:0x000000}), 66, 4.5, 70);
        dyn.bin = box(inner, 4, 2, 4, new THREE.MeshStandardMaterial({color:0x112233, emissive:0x000000}), 145, 4.5, 70);
        break;
      }
      case 'uno': {
        box(inner, 194, 4, 146, mat('pcbTeal', 0x0e7a8f, 0.7), 105, 2, 75);
        box(inner, 90, 7, 26, dark, 105, 5.5, 73);
        box(inner, 34, 12, 20, metal, 105, 8, 132);
        cyl(inner, 9,9,6, dark, 48, 5, 120);
        dyn.pwr = box(inner, 4, 2, 4, new THREE.MeshStandardMaterial({color:0x114422, emissive:0x000000}), 160, 4.5, 112);
        dyn.bin = box(inner, 4, 2, 4, new THREE.MeshStandardMaterial({color:0x443311, emissive:0x000000}), 160, 4.5, 94);
        break;
      }
    }

    // per-frame dynamic behaviour
    g.userData.dyn = ()=>{
      if (dyn.ledM){
        const b = p.state.broken ? 0 : (p.state.brightness||0);
        dyn.ledM.emissive.setHex(dyn.ledC);
        dyn.ledM.emissiveIntensity = b*1.8;
        dyn.ledM.opacity = 0.72 + b*0.28;
      }
      if (dyn.cap) dyn.cap.position.y = p.state.pressed ? 15 : 18;
      if (dyn.knob && p.type==='switch') dyn.knob.position.x = p.state.on ? 52 : 24;
      if (dyn.knob && p.type==='pot') dyn.knob.rotation.y = -((-135 + (p.props.t??0.5)*270) * Math.PI/180);
      if (dyn.rotor) dyn.rotor.rotation.x = -(p.state.rotAngle||0) * Math.PI/180;
      if (dyn.chg){ dyn.chg.material.emissive.setHex(p.state.chargingOut ? 0xff2222 : 0x000000); dyn.chg.material.emissiveIntensity = 1.6; }
      if (dyn.ok) dyn.ok.material.emissive.setHex(p.state.powered && !p.state.chargingOut ? 0x2288ff : 0x000000);
      if (dyn.pwr && p.type==='boost') dyn.pwr.material.emissive.setHex(p.state.powered ? 0x33ff66 : 0x000000);
      if (dyn.pwr && p.type==='esp32') dyn.pwr.material.emissive.setHex(p.state.powered ? 0xff3333 : 0x000000);
      if (dyn.pwr && p.type==='uno') dyn.pwr.material.emissive.setHex(p.state.powered ? 0x33ff66 : 0x000000);
      if (dyn.bin){
        const bl = (p.state.pins?.[PARTS.defs[p.type].builtinLed]?.duty)||0;
        dyn.bin.material.emissive.setHex(p.type==='esp32' ? 0x3399ff : 0xffaa00);
        dyn.bin.material.emissiveIntensity = bl*2;
      }
      if (dyn.strip){
        const soc = (p.props.charge??65)/100;
        dyn.strip.scale.x = Math.max(0.05, soc);
        dyn.strip.material.color.setHex(soc<0.2 ? 0xee3333 : (p.state.charging ? 0x33aaff : 0x33cc55));
        dyn.strip.material.emissive.setHex(p.state.charging ? 0x113355 : 0x113311);
      }
    };
    return g;
  }

  /* ---------------- scene (re)build ---------------- */
  function hashStruct(){
    return JSON.stringify([
      app.parts.map(p=>[p.id,p.type,p.x,p.y,p.rot,p.props.value,p.props.color,(p.props.solders||[]).length, elevationOf(p)]),
      app.wires.map(w=>[w.id,w.a,w.b,w.color,(w.pts||[]).map(pt=>[pt.x,pt.y])]),
      app.links.map(l=>[l.a,l.b]),
      app.sel && app.sel.kind==='part' ? app.sel.id : null,
      app.pendingWire ? app.pendingWire.part+app.pendingWire.term : null,
    ]);
  }

  function rebuild(){
    for (const k of Object.keys(partGroups)){ root.remove(partGroups[k]); }
    partGroups = {}; knobMeshes = []; pendKnob = null;
    while (root.children.length) root.remove(root.children[0]);

    for (const p of app.parts){
      const g = buildPart(p);
      partGroups[p.id] = g;
      root.add(g);
    }
    // wires as sagging tubes
    for (const w of app.wires){
      const route = wireRoute(w);
      if (!route) continue;
      const elevA = elevationOf(app.parts.find(x=>x.id===w.a.part)) + 6;
      const elevB = elevationOf(app.parts.find(x=>x.id===w.b.part)) + 6;
      const pts3 = route.map((pt,i)=>{
        const t = i/(route.length-1);
        const lift = route.length===2 ? 18 : 13;
        const y = (i===0?elevA : i===route.length-1?elevB : Math.max(elevA,elevB) + lift);
        return new THREE.Vector3(pt.x, y, pt.y);
      });
      const curve = new THREE.CatmullRomCurve3(pts3);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(12, route.length*8), 2.1, 8),
        new THREE.MeshStandardMaterial({color:new THREE.Color(w.color||'#e84545'), roughness:0.5}));
      tube.castShadow = true;
      tube.userData.wireId = w.id;
      root.add(tube);
    }
    // terminal knobs (tap targets for wiring)
    for (const p of app.parts){
      const y0 = elevationOf(p);
      for (const t of PARTS.termPos(p)){
        const knob = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 10),
          new THREE.MeshStandardMaterial({color:0xd4a017, roughness:0.4, metalness:0.7, emissive:0x000000}));
        knob.position.set(t.x, y0+4, t.y);
        knob.userData.termRef = {part:p.id, term:t.id};
        const hit = new THREE.Mesh(new THREE.SphereGeometry(12, 8, 6),
          new THREE.MeshBasicMaterial({visible:false}));
        hit.position.copy(knob.position);
        hit.userData.termRef = knob.userData.termRef;
        root.add(knob); root.add(hit);
        knobMeshes.push(knob);
        if (app.pendingWire && app.pendingWire.part===p.id && app.pendingWire.term===t.id) pendKnob = knob;
      }
    }
    // wireless link glows
    for (const l of app.links){
      const pa = app.parts.find(x=>x.id===l.a.part);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(6, 1.1, 8, 20),
        new THREE.MeshStandardMaterial({color:0x3ecf72, emissive:0x1a6636}));
      ring.rotation.x = Math.PI/2;
      ring.position.set(l.x, elevationOf(pa)+2.5, l.y);
      root.add(ring);
    }
    // selection ring
    if (app.sel?.kind==='part'){
      const p = app.parts.find(x=>x.id===app.sel.id);
      if (p){
        const d = PARTS.defs[p.type];
        const r = Math.hypot(d.w, d.h)/2 + 10;
        selRing = new THREE.Mesh(new THREE.RingGeometry(r, r+3.5, 40),
          new THREE.MeshBasicMaterial({color:0x4da3ff, side:THREE.DoubleSide, transparent:true, opacity:0.85}));
        selRing.rotation.x = -Math.PI/2;
        selRing.position.set(p.x + d.w/2, elevationOf(p)+0.6, p.y + d.h/2);
        root.add(selRing);
      }
    } else selRing = null;
  }

  /* ---------------- camera & controls ---------------- */
  function updateCamera(){
    const { theta, phi, dist } = cam;
    camera.position.set(
      cam.tx + dist*Math.sin(phi)*Math.sin(theta),
      cam.ty + dist*Math.cos(phi),
      cam.tz + dist*Math.sin(phi)*Math.cos(theta));
    camera.lookAt(cam.tx, cam.ty, cam.tz);
  }

  const ptrs = new Map();
  let g3 = null; // {mode:'orbit'|'pan'|'pinch'|'part', ...}
  function ndc(ev){
    const r = renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((ev.clientX-r.left)/r.width)*2-1, -((ev.clientY-r.top)/r.height)*2+1);
  }
  const raycaster = new THREE.Raycaster();
  function pick(ev){
    raycaster.setFromCamera(ndc(ev), camera);
    const hits = raycaster.intersectObjects(root.children, true);
    for (const h of hits){
      let o = h.object;
      while (o && o !== root){
        if (o.userData.termRef) return {kind:'term', ref:o.userData.termRef};
        if (o.userData.partId) return {kind:'part', id:o.userData.partId, point:h.point};
        if (o.userData.wireId) return {kind:'wire', id:o.userData.wireId};
        o = o.parent;
      }
    }
    return null;
  }
  function groundPoint(ev, y=0){
    raycaster.setFromCamera(ndc(ev), camera);
    const t = (y - raycaster.ray.origin.y) / raycaster.ray.direction.y;
    if (!isFinite(t) || t < 0) return null;
    return raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, t);
  }

  function onDown(ev){
    ev.preventDefault();
    renderer.domElement.setPointerCapture(ev.pointerId);
    ptrs.set(ev.pointerId, {x:ev.clientX, y:ev.clientY});
    if (ptrs.size === 2){
      const [a,b] = [...ptrs.values()];
      g3 = {mode:'pinch', d0:Math.hypot(a.x-b.x,a.y-b.y), dist0:cam.dist,
        mx:(a.x+b.x)/2, my:(a.y+b.y)/2, tx0:cam.tx, ty0:cam.ty, tz0:cam.tz};
      return;
    }
    const hit = pick(ev);
    if (hit?.kind==='term'){
      g3 = {mode:'tapterm', ref:hit.ref, sx:ev.clientX, sy:ev.clientY};
    } else if (hit?.kind==='part'){
      const p = app.parts.find(x=>x.id===hit.id);
      const gp = groundPoint(ev, elevationOf(p));
      g3 = {mode:'part', part:p, ox:p.x, oy:p.y, g0:gp, sx:ev.clientX, sy:ev.clientY, moved:false};
    } else if (hit?.kind==='wire'){
      g3 = {mode:'tapwire', id:hit.id, sx:ev.clientX, sy:ev.clientY};
    } else {
      g3 = {mode:'orbit', sx:ev.clientX, sy:ev.clientY, th0:cam.theta, ph0:cam.phi, moved:false};
    }
  }
  function onMove(ev){
    if (ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, {x:ev.clientX, y:ev.clientY});
    if (!g3) return;
    if (g3.mode==='pinch' && ptrs.size >= 2){
      const [a,b] = [...ptrs.values()];
      const d = Math.hypot(a.x-b.x, a.y-b.y);
      cam.dist = Math.min(2600, Math.max(160, g3.dist0 * g3.d0/Math.max(30,d)));
      // two-finger drag pans on the bench plane
      const mx = (a.x+b.x)/2, my = (a.y+b.y)/2;
      const scale = cam.dist * 0.0016;
      const dx = (mx-g3.mx)*scale, dz = (my-g3.my)*scale;
      const s = Math.sin(cam.theta), c = Math.cos(cam.theta);
      cam.tx = g3.tx0 - (dx*c - dz*s);
      cam.tz = g3.tz0 - (-dx*s - dz*c);
      updateCamera();
      return;
    }
    const dx = ev.clientX - g3.sx, dy = ev.clientY - g3.sy;
    if (Math.hypot(dx,dy) > 7) g3.moved = true;
    if (g3.mode==='orbit' && g3.moved){
      cam.theta = g3.th0 - dx*0.006;
      cam.phi = Math.min(2.85, Math.max(0.12, g3.ph0 - dy*0.006)); // > π/2 = under the bench
      updateCamera();
    } else if (g3.mode==='part' && g3.moved && g3.g0){
      const gp = groundPoint(ev, elevationOf(g3.part));
      if (gp){
        g3.part.x = Math.round((g3.ox + gp.x - g3.g0.x)/10)*10;
        g3.part.y = Math.round((g3.oy + gp.z - g3.g0.z)/10)*10;
        const grp = partGroups[g3.part.id];
        const d = PARTS.defs[g3.part.type];
        if (grp) grp.position.set(g3.part.x + d.w/2, elevationOf(g3.part), g3.part.y + d.h/2);
      }
    }
  }
  function onUp(ev){
    ptrs.delete(ev.pointerId);
    const g = g3; g3 = null;
    if (!g || g.mode==='pinch' || g.mode==='orbit') return;
    const tap = Math.hypot(ev.clientX-g.sx, ev.clientY-g.sy) <= 7;
    if (g.mode==='tapterm' && tap){
      if (app.pendingWire){
        const from = {part:app.pendingWire.part, term:app.pendingWire.term};
        if (!(from.part===g.ref.part && from.term===g.ref.term)) addWire(from, g.ref);
        app.pendingWire = null;
      } else {
        app.pendingWire = {...g.ref, sticky:true};
        toast('Now tap another gold knob to finish the wire (tap empty space to cancel)', 'info', 'wire3d');
      }
      renderAll(); structHash=''; return;
    }
    if (g.mode==='part'){
      if (g.moved){
        dockPart(g.part);
        renderAll(); save(); structHash='';
      } else { // tap
        if (app.pendingWire){ app.pendingWire = null; }
        if (g.part.type==='switch') g.part.state.on = !g.part.state.on;
        else if (g.part.type==='button'){ g.part.state.pressed = true; setTimeout(()=>{g.part.state.pressed=false;}, 650); }
        select({kind:'part', id:g.part.id});
        structHash='';
      }
      return;
    }
    if (g.mode==='tapwire' && tap){ select({kind:'wire', id:g.id}); structHash=''; return; }
    if (tap){ // empty tap
      if (app.pendingWire){ app.pendingWire = null; renderAll(); }
      select(null); structHash='';
    }
  }
  function onWheel(ev){
    ev.preventDefault();
    cam.dist = Math.min(2600, Math.max(160, cam.dist * (ev.deltaY>0 ? 1.1 : 0.9)));
    updateCamera();
  }

  /* ---------------- lifecycle ---------------- */
  function init(){
    const el = document.getElementById('gl');
    renderer = new THREE.WebGLRenderer({canvas:el, antialias:true, alpha:false});
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio||1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1017);
    scene.fog = new THREE.Fog(0x0d1017, 2200, 4200);
    camera = new THREE.PerspectiveCamera(46, 1, 5, 8000);

    scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x2a2419, 0.75));
    const sun = new THREE.DirectionalLight(0xfff2dd, 1.5);
    sun.position.set(500, 900, 300);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -1200; sun.shadow.camera.right = 1900;
    sun.shadow.camera.top = 1400; sun.shadow.camera.bottom = -1200;
    sun.shadow.camera.far = 3200;
    scene.add(sun);

    ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000),
      new THREE.MeshStandardMaterial({color:0x151a24, roughness:0.95}));
    ground.rotation.x = -Math.PI/2;
    ground.position.y = -0.4;
    ground.receiveShadow = true;
    scene.add(ground); // front-face only: invisible from below, so you can see the copper side
    grid = new THREE.GridHelper(4000, 100, 0x2a3247, 0x1c2333);
    grid.position.y = -0.2;
    scene.add(grid);

    root = new THREE.Group();
    scene.add(root);

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', ev=>{ ptrs.delete(ev.pointerId); g3=null; });
    el.addEventListener('wheel', onWheel, {passive:false});
    window.addEventListener('resize', resize);
  }
  function resize(){
    if (!renderer || !api.active) return;
    const wrap = document.getElementById('canvasWrap');
    const w = wrap.clientWidth, h = wrap.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w/Math.max(1,h);
    camera.updateProjectionMatrix();
  }

  function start(){
    if (!renderer) init();
    api.active = true;
    // aim the camera at the middle of the circuit
    if (app.parts.length){
      let sx=0, sy=0;
      for (const p of app.parts){ const d=PARTS.defs[p.type]; sx += p.x+d.w/2; sy += p.y+d.h/2; }
      cam.tx = sx/app.parts.length; cam.tz = sy/app.parts.length; cam.ty = 0;
    }
    structHash = '';
    resize();
    updateCamera();
  }
  function stop(){ api.active = false; }

  let pulse = 0;
  function frame(dt){
    if (!api.active || !renderer) return;
    const h = hashStruct();
    if (h !== structHash){ structHash = h; rebuild(); }
    for (const p of app.parts){
      const g = partGroups[p.id];
      if (g && g.userData.dyn) g.userData.dyn();
    }
    pulse += dt*6;
    if (pendKnob){ const s = 1.6 + Math.sin(pulse)*0.5; pendKnob.scale.set(s,s,s); pendKnob.material.emissive.setHex(0x4da3ff); }
    updateCamera();
    renderer.render(scene, camera);
  }

  api.start = start; api.stop = stop; api.frame = frame; api.resize = resize;
  api._cam = cam; api._pick = pick; // exposed for tests
  api.project = (wx, wy, wz=0) => { // world → client px (for tests)
    const v = new THREE.Vector3(wx, wz, wy).project(camera);
    const r = renderer.domElement.getBoundingClientRect();
    return { x: r.left + (v.x+1)/2*r.width, y: r.top + (1-v.y)/2*r.height };
  };
  return api;
})();
