/* Circuit Lab — parts catalog: geometry, pseudo-3D SVG art, electrical models, edu info */
'use strict';

const PARTS = (() => {

  const E_VALUES = [10,22,47,68,100,150,220,330,470,680,1000,1500,2200,3300,4700,6800,10000,22000,47000,100000,220000,470000,1000000];

  const BAND_COLORS = ['#000','#7a4a21','#e33','#f80','#fd0','#2b2','#26f','#a4e','#999','#fff'];
  function resistorBands(v){
    // 4-band: two significant digits + multiplier
    let mult = 0, x = v;
    while (x >= 100) { x /= 10; mult++; }
    x = Math.round(x);
    if (x >= 100) { x = Math.round(x/10); mult++; }
    const d1 = Math.floor(x/10), d2 = x%10;
    return [BAND_COLORS[d1], BAND_COLORS[d2], BAND_COLORS[mult]];
  }
  function fmtOhm(v){
    if (v >= 1e6) return (v/1e6).toFixed(v%1e6?1:0)+'MΩ';
    if (v >= 1e3) return (v/1e3).toFixed(v%1e3?1:0)+'kΩ';
    return v+'Ω';
  }
  function fmt(n, unit){
    const a = Math.abs(n);
    if (a >= 1) return n.toFixed(2)+' '+unit;
    if (a >= 1e-3) return (n*1e3).toFixed(1)+' m'+unit;
    if (a >= 1e-6) return (n*1e6).toFixed(0)+' µ'+unit;
    return '0 '+unit;
  }

  const LED_COLORS = {
    red:    { vf:1.8, glow:'#ff4433', body:'#ff8877' },
    green:  { vf:2.1, glow:'#33ff55', body:'#88ffa0' },
    blue:   { vf:2.9, glow:'#3388ff', body:'#88bbff' },
    yellow: { vf:2.0, glow:'#ffdd22', body:'#ffee88' },
    white:  { vf:3.0, glow:'#ffffff', body:'#eeeeff' },
  };

  // shared svg defs (gradients for pseudo-3D shading)
  const SVG_DEFS = `
  <linearGradient id="gMetal" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f2f4f8"/><stop offset=".45" stop-color="#aab2bd"/>
    <stop offset=".55" stop-color="#8a929d"/><stop offset="1" stop-color="#dfe4ea"/>
  </linearGradient>
  <linearGradient id="gGold" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#ffe9a8"/><stop offset=".5" stop-color="#d4a017"/><stop offset="1" stop-color="#f7d774"/>
  </linearGradient>
  <linearGradient id="gBattBody" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#5a6270"/><stop offset=".4" stop-color="#2d323c"/><stop offset="1" stop-color="#454c58"/>
  </linearGradient>
  <linearGradient id="gCopper" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#f6b27a"/><stop offset=".5" stop-color="#b4642a"/><stop offset="1" stop-color="#e59a55"/>
  </linearGradient>
  <linearGradient id="gPCB" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#0f6a3d"/><stop offset="1" stop-color="#0a4d2c"/>
  </linearGradient>
  <linearGradient id="gPCBblue" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#1a5e8a"/><stop offset="1" stop-color="#123f5e"/>
  </linearGradient>
  <linearGradient id="gPCBred" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#8a1a2a"/><stop offset="1" stop-color="#5e1220"/>
  </linearGradient>
  <linearGradient id="gResBody" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#efe0c8"/><stop offset=".45" stop-color="#c9ab7c"/>
    <stop offset=".55" stop-color="#b3925f"/><stop offset="1" stop-color="#e5d3b3"/>
  </linearGradient>
  <linearGradient id="gChip" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#3a3f4a"/><stop offset="1" stop-color="#14161c"/>
  </linearGradient>
  <radialGradient id="gDome" cx=".35" cy=".3" r=".9">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".9"/><stop offset=".35" stop-color="#ffffff" stop-opacity=".25"/>
    <stop offset="1" stop-color="#000000" stop-opacity=".15"/>
  </radialGradient>
  <radialGradient id="gGlow">
    <stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".4" stop-color="#fff" stop-opacity=".5"/>
    <stop offset="1" stop-color="#fff" stop-opacity="0"/>
  </radialGradient>
  <linearGradient id="gLipo" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#cfd6e4"/><stop offset=".5" stop-color="#9aa4b8"/><stop offset="1" stop-color="#c3cad9"/>
  </linearGradient>
  <filter id="fSmoke"><feGaussianBlur stdDeviation="2"/></filter>
  `;

  function pinRow(x0, y, n, dx){ // little gold pins
    let s = '';
    for (let i=0;i<n;i++) s += `<rect x="${x0+i*dx-2}" y="${y-2}" width="4" height="4" rx="1" fill="url(#gGold)"/>`;
    return s;
  }
  function smoke(x,y){
    return `<g class="smoke" opacity="0.9">
      <circle cx="${x}" cy="${y}" r="7" fill="#777" filter="url(#fSmoke)"/>
      <circle cx="${x+6}" cy="${y-9}" r="5" fill="#888" filter="url(#fSmoke)"/>
      <circle cx="${x-4}" cy="${y-16}" r="4" fill="#999" filter="url(#fSmoke)"/>
      <text x="${x+10}" y="${y-18}" font-size="11" fill="#f66">✗</text></g>`;
  }
  function label(x,y,t,size=9,fill='#c8d2e0'){ return `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="middle" font-family="system-ui" pointer-events="none">${t}</text>`; }

  const defs = {

  /* ============ POWER ============ */
  battery_aa: {
    name:'AA Battery', cat:'Power', w:120, h:44,
    terms:[{id:'+',x:120,y:22},{id:'-',x:0,y:22}],
    defaults:{},
    elements(p){ return [{kind:'v', a:'+', b:'-', v:1.5, r:0.4, tag:'main', maxI:3}]; },
    draw(p){
      return `<rect x="6" y="6" width="106" height="32" rx="6" fill="url(#gBattBody)" stroke="#1a1d24"/>
      <rect x="6" y="6" width="30" height="32" rx="6" fill="url(#gMetal)"/>
      <rect x="112" y="16" width="8" height="12" rx="2" fill="url(#gMetal)"/>
      <rect x="0" y="12" width="7" height="20" rx="2" fill="url(#gMetal)"/>
      ${label(74,27,'AA 1.5V',11,'#dfe6f2')}<text x="104" y="20" font-size="12" fill="#eee">+</text>
      ${p.state.broken ? smoke(60,10):''}`;
    },
    info:{ title:'AA Battery (1.5 V)', body:
`A single-use alkaline cell. Gives about <b>1.5 V</b> when fresh, dropping as it drains. Its <b>internal resistance</b> (~0.4 Ω here) means the voltage sags when you draw lots of current — that's why a short circuit makes batteries hot instead of giving infinite current.
<br><br><b>Key facts:</b> 1.5 V nominal · ~2000 mAh capacity · not rechargeable.
<br><b>Tip:</b> One AA (1.5 V) is <i>below</i> the forward voltage of most LEDs (1.8–3 V), so a single AA usually can't light an LED — stack cells in series to add voltages.`},
  },

  battery_2aa: {
    name:'2×AA Holder', cat:'Power', w:130, h:70,
    terms:[{id:'+',x:130,y:35},{id:'-',x:0,y:35}],
    defaults:{},
    elements(p){ return [{kind:'v', a:'+', b:'-', v:3.0, r:0.8, tag:'main', maxI:3}]; },
    draw(p){
      const cell = (y)=>`<rect x="14" y="${y}" width="96" height="24" rx="5" fill="url(#gBattBody)" stroke="#1a1d24"/>
        <rect x="14" y="${y}" width="24" height="24" rx="5" fill="url(#gMetal)"/>`;
      return `<rect x="4" y="4" width="122" height="62" rx="6" fill="#20242e" stroke="#12141a"/>
      ${cell(8)}${cell(38)}${label(66,24,'AA',9)}${label(66,54,'AA',9)}
      <text x="118" y="26" font-size="11" fill="#eee">+</text><text x="10" y="60" font-size="12" fill="#eee">−</text>
      ${p.state.broken ? smoke(60,8):''}`;
    },
    info:{ title:'2×AA Battery Holder (3 V)', body:
`Two AA cells <b>in series</b>: their voltages add, so you get <b>3 V</b>. Series cells share the same current but sum voltage — the basis of every battery pack.
<br><br><b>Use it for:</b> lighting red/green/yellow LEDs (with a resistor!), small motors, powering simple circuits.
<br><b>Note:</b> 3 V is still below a blue/white LED's ~3 V forward voltage — those may barely glow.`},
  },

  battery_9v: {
    name:'9V Battery', cat:'Power', w:70, h:96,
    terms:[{id:'+',x:22,y:0},{id:'-',x:48,y:0}],
    defaults:{},
    elements(p){ return [{kind:'v', a:'+', b:'-', v:9, r:1.7, tag:'main', maxI:1.5}]; },
    draw(p){
      return `<rect x="8" y="10" width="54" height="82" rx="6" fill="url(#gBattBody)" stroke="#1a1d24"/>
      <rect x="8" y="10" width="54" height="26" rx="6" fill="#b8860b"/>
      <circle cx="22" cy="8" r="7" fill="url(#gMetal)"/><rect x="42" y="2" width="12" height="10" rx="3" fill="url(#gMetal)"/>
      ${label(35,60,'9V',16,'#f2e6c8')}${label(35,76,'PP3',8,'#d8cba6')}
      <text x="18" y="26" font-size="10" fill="#111">+</text><text x="45" y="26" font-size="10" fill="#111">−</text>
      ${p.state.broken ? smoke(35,14):''}`;
    },
    info:{ title:'9 V Battery (PP3)', body:
`Six tiny 1.5 V cells stacked in series inside one case = <b>9 V</b>. Handy for higher-voltage circuits, but it has high internal resistance (~1.7 Ω) and low capacity (~550 mAh), so it's poor at powering motors or anything hungry.
<br><br><b>Watch out:</b> 9 V straight into an LED will <b>blow it instantly</b> — always calculate a series resistor: R = (9 − V<sub>f</sub>) / 0.015 A ≈ 470 Ω for a red LED.`},
  },

  lipo: {
    name:'LiPo Battery', cat:'Power', w:110, h:72,
    terms:[{id:'+',x:110,y:22},{id:'-',x:110,y:50}],
    defaults:{charge:65},
    elements(p){
      const soc = (p.props.charge??65)/100;
      const v = 3.0 + soc*1.2; // 3.0–4.2V curve (simplified linear)
      return [{kind:'v', a:'+', b:'-', v, r:0.15, tag:'main', maxI:5, lipo:true}];
    },
    draw(p){
      const soc = Math.round(p.props.charge??65);
      const chg = p.state.charging;
      return `<rect x="4" y="8" width="92" height="56" rx="7" fill="url(#gLipo)" stroke="#6b7486"/>
      <rect x="4" y="8" width="92" height="12" rx="6" fill="#7f899c"/>
      <rect x="94" y="16" width="14" height="8" fill="#e33"/><rect x="94" y="44" width="14" height="8" fill="#222"/>
      <rect x="12" y="30" width="60" height="12" rx="3" fill="#39404e"/>
      <rect class="socbar" x="13" y="31" width="${58*soc/100}" height="10" rx="2" fill="${soc<20?'#e33': chg?'#3af':'#3c5'}"/>
      <text class="soctext" x="80" y="40" font-size="9" fill="#222">${soc}%</text>
      ${label(50,56,'LiPo 3.7V 500mAh',7.5,'#2b303b')}
      ${chg?`<text class="chgicon" x="8" y="42" font-size="12" fill="#0af">⚡</text>`:''}
      ${p.state.broken ? smoke(50,6):''}`;
    },
    info:{ title:'LiPo Battery (3.7 V, rechargeable)', body:
`Lithium-polymer cell — the battery in phones, drones and DIY projects. Voltage ranges from <b>4.2 V full</b> to <b>3.0 V empty</b> (nominal 3.7 V). Very low internal resistance = can deliver big currents.
<br><br><b>⚠️ Safety (real world!):</b> never short one, never charge above 4.2 V, never discharge below 3.0 V, and always charge with a proper charger like the <b>TP4056</b>. Damaged LiPos can catch fire.
<br><b>Tip:</b> 3.7 V is not enough for 5 V electronics — pair it with a <b>step-up (boost) converter</b>.`},
  },

  usb5v: {
    name:'USB 5V Supply', cat:'Power', w:96, h:64,
    terms:[{id:'+',x:96,y:20},{id:'-',x:96,y:44}],
    defaults:{},
    elements(p){ return [{kind:'v', a:'+', b:'-', v:5, r:0.25, tag:'main', maxI:2.4}]; },
    draw(p){
      return `<rect x="4" y="8" width="72" height="48" rx="8" fill="#e8ebf2" stroke="#aeb6c4"/>
      <rect x="74" y="16" width="16" height="32" rx="2" fill="url(#gMetal)"/>
      <rect x="78" y="24" width="10" height="16" fill="#0a5"/>
      ${label(40,30,'USB',12,'#39404e')}${label(40,44,'5V ⎓ 2.4A',8,'#6a7386')}
      ${p.state.broken ? smoke(40,8):''}`;
    },
    info:{ title:'USB 5 V Supply', body:
`A phone charger / USB port: regulated <b>5 V DC</b>, up to ~2.4 A. The standard power source for Arduino, ESP32 and charger modules.
<br><br><b>Use it to:</b> power boards directly, or feed a <b>TP4056</b> to charge a LiPo.
<br><b>Note:</b> 5 V into a bare LED still needs a resistor (~330 Ω).`},
  },

  tp4056: {
    name:'TP4056 Charger', cat:'Power', w:110, h:76,
    terms:[{id:'IN+',x:0,y:18},{id:'IN-',x:0,y:58},{id:'B+',x:110,y:18},{id:'B-',x:110,y:58},{id:'OUT+',x:66,y:76},{id:'OUT-',x:36,y:76}],
    defaults:{},
    elements(p){
      const els = [
        {kind:'r', a:'IN-', b:'B-', r:0.02},
        {kind:'r', a:'B-', b:'OUT-', r:0.02},
        {kind:'r', a:'B+', b:'OUT+', r:0.05},
      ];
      if (p.state.powered) els.push({kind:'v', a:'B+', b:'IN-', v:4.35, r:2.2, tag:'chg', maxI:1.2});
      return els;
    },
    draw(p){
      const chg = p.state.chargingOut, pw = p.state.powered;
      return `<rect x="8" y="4" width="94" height="68" rx="4" fill="url(#gPCBblue)" stroke="#0c2a3e"/>
      <rect x="2" y="12" width="12" height="12" fill="url(#gMetal)"/><rect x="2" y="52" width="12" height="12" fill="url(#gMetal)"/>
      <rect x="40" y="26" width="30" height="22" rx="2" fill="url(#gChip)"/><text x="44" y="40" font-size="6" fill="#9ab">TP4056</text>
      <circle class="ledchg" cx="26" cy="36" r="4" fill="${chg?'#f33':'#511'}"/>${chg?`<circle cx="26" cy="36" r="9" fill="url(#gGlow)" opacity=".8" style="color:#f33"/>`:''}
      <circle class="ledok" cx="26" cy="50" r="4" fill="${pw&&!chg?'#3af':'#134'}"/>
      ${label(20,16,'IN',7,'#bfe')}${label(90,16,'BAT',7,'#bfe')}${label(52,68,'OUT',7,'#bfe')}
      <text x="12" y="24" font-size="8" fill="#f88">+</text><text x="12" y="60" font-size="8" fill="#8cf">−</text>
      <text x="96" y="24" font-size="8" fill="#f88">+</text><text x="96" y="60" font-size="8" fill="#8cf">−</text>
      ${p.state.broken ? smoke(55,8):''}`;
    },
    info:{ title:'TP4056 LiPo Charger Module', body:
`The classic £1 LiPo charging board. Feed <b>5 V into IN</b> (USB), connect a LiPo to <b>B+/B−</b>, and it charges the cell safely to 4.2 V at up to 1 A. The red LED = charging, blue = done. <b>OUT</b> pins pass the battery through protection circuitry (over-discharge / short protection) — power your project from OUT, not straight off the cell.
<br><br><b>Wiring:</b> USB + → IN+, USB − → IN−, LiPo → B+/B−, your circuit → OUT+/OUT−.`},
  },

  boost: {
    name:'Boost Converter', cat:'Power', w:104, h:64,
    terms:[{id:'IN+',x:0,y:16},{id:'IN-',x:0,y:48},{id:'OUT+',x:104,y:16},{id:'OUT-',x:104,y:48}],
    defaults:{vout:5},
    elements(p){
      const els = [{kind:'r', a:'IN-', b:'OUT-', r:0.02}, {kind:'r', a:'IN+', b:'IN-', r:60}];
      if (p.state.powered) els.push({kind:'v', a:'OUT+', b:'OUT-', v:p.props.vout??5, r:0.4, tag:'out', maxI:1.5});
      return els;
    },
    draw(p){
      return `<rect x="6" y="4" width="92" height="56" rx="4" fill="url(#gPCB)" stroke="#06301b"/>
      <circle cx="38" cy="32" r="13" fill="#1c1f26" stroke="#3a3f4a" stroke-width="3"/><circle cx="38" cy="32" r="6" fill="url(#gCopper)"/>
      <rect x="58" y="20" width="24" height="14" rx="2" fill="url(#gChip)"/>
      <rect x="58" y="40" width="16" height="10" rx="2" fill="#2a5db0"/><circle cx="80" cy="45" r="4" fill="url(#gGold)"/>
      ${label(52,14,'STEP-UP ↑'+(p.props.vout??5)+'V',7,'#bfe8cf')}
      <text x="10" y="20" font-size="8" fill="#f88">IN+</text><text x="10" y="52" font-size="8" fill="#8cf">IN−</text>
      <text x="76" y="14" font-size="8" fill="#f88">OUT+</text><text x="74" y="60" font-size="8" fill="#8cf">OUT−</text>
      ${p.state.powered?`<circle class="pwr" cx="90" cy="10" r="3" fill="#3c5"/>`:''}
      ${p.state.broken ? smoke(50,8):''}`;
    },
    info:{ title:'Boost (Step-Up) Converter', body:
`A switching regulator that turns a <b>lower voltage into a higher one</b> (e.g. LiPo 3.7 V → 5 V). It rapidly switches current through an inductor (the copper coil you can see) and "pumps" the voltage up.
<br><br><b>Physics catch:</b> power in ≈ power out, so stepping 3.7 V up to 5 V means it draws <i>more current</i> from the battery than it delivers. Nothing is free!
<br><b>Use it for:</b> running 5 V boards/USB gadgets from a single LiPo — the heart of every DIY power bank.`},
  },

  /* ============ BASICS ============ */
  resistor: {
    name:'Resistor', cat:'Basics', w:100, h:28,
    terms:[{id:'1',x:0,y:14},{id:'2',x:100,y:14}],
    defaults:{value:220},
    elements(p){ return [{kind:'r', a:'1', b:'2', r:p.state.broken?1e9:(p.props.value||220), tag:'main', maxP:0.6}]; },
    draw(p){
      const b = resistorBands(p.props.value||220);
      return `<rect x="0" y="12" width="100" height="4" fill="url(#gMetal)"/>
      <rect x="22" y="3" width="56" height="22" rx="10" fill="url(#gResBody)" stroke="#8a7350"/>
      <rect x="32" y="3" width="6" height="22" fill="${b[0]}"/><rect x="44" y="3" width="6" height="22" fill="${b[1]}"/>
      <rect x="56" y="3" width="6" height="22" fill="${b[2]}"/><rect x="68" y="3" width="5" height="22" fill="#d4a017"/>
      ${label(50,40,fmtOhm(p.props.value||220),10,'#9fb4d4')}
      ${p.state.broken ? smoke(50,0):''}`;
    },
    info:{ title:'Resistor', body:
`Resists the flow of current: <b>V = I × R</b> (Ohm's law). Its main job in beginner circuits is <b>limiting current</b> so parts like LEDs don't burn out.
<br><br><b>Colour bands</b> encode the value (2 digits + multiplier + tolerance). This app draws real band colours for the value you pick.
<br><b>LED maths:</b> R = (V<sub>supply</sub> − V<sub>LED</sub>) ÷ I. For 5 V, red LED (1.8 V), 10 mA: R = 3.2/0.01 = 320 → use 330 Ω.
<br><b>Power:</b> resistors here are ¼ W — exceed that (P = I²R) and they smoke, just like real ones.`},
  },

  led: {
    name:'LED', cat:'Basics', w:44, h:64,
    terms:[{id:'A',x:12,y:64},{id:'K',x:32,y:64}],
    defaults:{color:'red'},
    elements(p){
      const c = LED_COLORS[p.props.color||'red'];
      return [{kind:'led', a:'A', b:'K', vf:c.vf, rd:12, tag:'main', maxI:0.035}];
    },
    draw(p){
      const c = LED_COLORS[p.props.color||'red'];
      const br = p.state.broken?0:(p.state.brightness||0);
      return `${br>0.02?`<circle class="glow" cx="22" cy="22" r="${16+br*22}" fill="${c.glow}" opacity="${0.15+br*0.5}" filter="url(#fSmoke)"/>`:''}
      <rect x="11" y="36" width="2.5" height="28" fill="url(#gMetal)"/><rect x="31" y="42" width="2.5" height="22" fill="url(#gMetal)"/>
      <path d="M8 36 v-16 a14 14 0 0 1 28 0 v16 z" fill="${p.state.broken?'#555':c.body}" opacity="${0.55+br*0.45}"/>
      <path d="M8 36 v-16 a14 14 0 0 1 28 0 v16 z" fill="url(#gDome)"/>
      <rect x="6" y="34" width="32" height="4" rx="2" fill="${p.state.broken?'#444':c.body}" opacity=".8"/>
      ${br>0.02?`<circle cx="22" cy="21" r="7" fill="#fff" opacity="${br*0.9}"/>`:''}
      ${label(12,60,'+',9,'#e8b')}${label(33,60,'−',9,'#8bd')}
      ${p.state.broken ? `<path d="M14 16 l16 14 M30 16 l-16 14" stroke="#222" stroke-width="2"/>`+smoke(22,6):''}`;
    },
    info:{ title:'LED (Light-Emitting Diode)', body:
`A diode that lights up — but <b>only when current flows the right way</b>: from anode (+, long leg) to cathode (−, flat side). Reversed, it simply stays dark.
<br><br><b>Forward voltage</b> depends on colour: red ≈1.8 V, green/yellow ≈2 V, blue/white ≈3 V. Below that it's off; above it, current rises very steeply — which is why you <b>always need a series resistor</b>.
<br><b>Limits:</b> happy at 5–20 mA. In this sim (like real life) more than ~35 mA burns it out permanently.`},
  },

  button: {
    name:'Push Button', cat:'Basics', w:56, h:56,
    terms:[{id:'1',x:0,y:28},{id:'2',x:56,y:28}],
    defaults:{},
    elements(p){ return [{kind:'r', a:'1', b:'2', r:p.state.pressed?0.05:1e9, tag:'main'}]; },
    draw(p){
      const d = p.state.pressed?3:0;
      return `<rect x="0" y="26" width="56" height="4" fill="url(#gMetal)"/>
      <rect x="8" y="8" width="40" height="40" rx="6" fill="#2b303b" stroke="#12141a"/>
      <circle cx="28" cy="28" r="${14-d}" fill="${p.state.pressed?'#c22':'#e84545'}" stroke="#7a1414" stroke-width="2"/>
      <circle cx="24" cy="24" r="${5-d}" fill="#fff" opacity=".25"/>
      ${label(28,54,p.state.pressed?'PRESSED':'tap me',7,'#9fb4d4')}`;
    },
    info:{ title:'Push Button (momentary)', body:
`A switch that only conducts <b>while pressed</b> — release it and the circuit breaks again. Inside, a spring pushes a metal contact apart.
<br><br><b>With microcontrollers:</b> wire one side to a GPIO pin and the other to GND, set the pin to <code>INPUT_PULLUP</code>, and <code>digitalRead()</code> returns <b>LOW when pressed</b> (the pull-up holds it HIGH otherwise).
<br><b>In the app:</b> tap the button to press it briefly, or use HOLD in the part panel.`},
  },

  switch: {
    name:'Slide Switch', cat:'Basics', w:76, h:40,
    terms:[{id:'1',x:0,y:20},{id:'2',x:76,y:20}],
    defaults:{},
    elements(p){ return [{kind:'r', a:'1', b:'2', r:p.state.on?0.05:1e9, tag:'main'}]; },
    draw(p){
      const on = p.state.on;
      return `<rect x="0" y="18" width="76" height="4" fill="url(#gMetal)"/>
      <rect x="10" y="8" width="56" height="24" rx="12" fill="${on?'#1e6a3c':'#39404e'}" stroke="#12141a"/>
      <circle cx="${on?52:24}" cy="20" r="10" fill="url(#gMetal)"/>
      ${label(38,38,on?'ON':'OFF',8,on?'#5fd08a':'#8a94a8')}`;
    },
    info:{ title:'Slide Switch (latching)', body:
`Stays on or off until you flip it — unlike a push button. It physically bridges (or breaks) the metal path between its two legs.
<br><br><b>An open switch = infinite resistance</b> (no current anywhere in a series loop). A closed one ≈ 0 Ω.
<br><b>In the app:</b> tap the switch to toggle it.`},
  },

  pot: {
    name:'Potentiometer', cat:'Basics', w:72, h:76,
    terms:[{id:'A',x:8,y:76},{id:'W',x:36,y:76},{id:'B',x:64,y:76}],
    defaults:{value:10000, t:0.5},
    elements(p){
      const v = p.props.value||10000, t = Math.min(0.99, Math.max(0.01, p.props.t??0.5));
      return [{kind:'r', a:'A', b:'W', r:v*t+1, tag:'aw'}, {kind:'r', a:'W', b:'B', r:v*(1-t)+1, tag:'wb'}];
    },
    draw(p){
      const t = p.props.t??0.5, ang = -135 + t*270;
      return `<rect x="6" y="52" width="4" height="24" fill="url(#gMetal)"/><rect x="34" y="52" width="4" height="24" fill="url(#gMetal)"/><rect x="62" y="52" width="4" height="24" fill="url(#gMetal)"/>
      <rect x="4" y="10" width="64" height="46" rx="6" fill="#2a5db0" stroke="#173a70"/>
      <circle cx="36" cy="32" r="17" fill="url(#gMetal)"/>
      <g transform="rotate(${ang},36,32)"><rect x="34.5" y="17" width="3" height="13" rx="1" fill="#e33"/></g>
      ${label(36,72,fmtOhm(p.props.value||10000),8,'#9fb4d4')}
      ${label(10,50,'A',7)}${label(36,50,'W',7)}${label(62,50,'B',7)}`;
    },
    info:{ title:'Potentiometer (variable resistor)', body:
`A resistor with a third pin — the <b>wiper (W)</b> — that slides along the resistive track between <b>A</b> and <b>B</b>. Turning the knob changes how the total resistance splits between A–W and W–B.
<br><br><b>Two ways to use it:</b>
<br>1. <b>Variable resistor:</b> use A + W only → dimmer/volume control.
<br>2. <b>Voltage divider:</b> A to +V, B to GND, read W → gives 0…V<sub>supply</sub>, perfect for <code>analogRead()</code>.
<br><b>In the app:</b> select it and drag the knob slider.`},
  },

  capacitor: {
    name:'Capacitor', cat:'Basics', w:44, h:68,
    terms:[{id:'+',x:14,y:68},{id:'-',x:30,y:68}],
    defaults:{value:100},
    elements(p){ return [{kind:'r', a:'+', b:'-', r:1e9, tag:'main'}]; },
    draw(p){
      return `<rect x="13" y="44" width="2.5" height="24" fill="url(#gMetal)"/><rect x="29" y="44" width="2.5" height="24" fill="url(#gMetal)"/>
      <rect x="6" y="6" width="32" height="40" rx="5" fill="#1d3f66" stroke="#0e2438"/>
      <rect x="8" y="6" width="7" height="40" rx="3" fill="#c8d2e0" opacity=".85"/>
      <text x="9" y="30" font-size="9" fill="#334">−</text>
      ${label(26,22,(p.props.value||100)+'µF',7,'#cfe0f4')}${label(26,32,'16V',6,'#8fa8c8')}`;
    },
    info:{ title:'Capacitor (electrolytic)', body:
`Stores charge like a tiny rechargeable bucket. It <b>blocks steady DC</b> (in this DC sim it acts as an open circuit) but passes changes — so it smooths bumpy power rails and filters signals.
<br><br><b>Real uses:</b> a 100–470 µF cap across a motor's or ESP32's power pins stops voltage dips from resetting your board.
<br><b>⚠️ Polarity matters:</b> the stripe is negative. Reverse a real electrolytic at high voltage and it can pop.`},
  },

  buzzer: {
    name:'Buzzer', cat:'Basics', w:60, h:66,
    terms:[{id:'+',x:20,y:66},{id:'-',x:40,y:66}],
    defaults:{},
    elements(p){ return [{kind:'r', a:'+', b:'-', r:110, tag:'main', polar:true}]; },
    draw(p){
      const on = p.state.beeping;
      return `<rect x="19" y="48" width="2.5" height="18" fill="url(#gMetal)"/><rect x="39" y="48" width="2.5" height="18" fill="url(#gMetal)"/>
      <circle cx="30" cy="26" r="24" fill="url(#gChip)" stroke="#000"/>
      <circle cx="30" cy="26" r="6" fill="#0b0d11"/>
      ${on?`<g class="waves" stroke="#5fd08a" fill="none" stroke-width="2" opacity=".9">
        <path d="M52 14 a20 20 0 0 1 0 24"/><path d="M58 8 a30 30 0 0 1 0 36"/></g>`:''}
      ${label(16,62,'+',9,'#e8b')}
      ${p.state.broken ? smoke(30,4):''}`;
    },
    info:{ title:'Active Buzzer', body:
`Contains a tiny oscillator + piezo disc: give it DC (3–5 V, right polarity) and it beeps by itself. (A <i>passive</i> buzzer needs you to supply the tone with <code>tone()</code>.)
<br><br><b>With code:</b> wire + to a GPIO pin, − to GND, then <code>digitalWrite(pin, HIGH)</code> to beep. Great for alarms and feedback.
<br><b>In the app:</b> enable sound in the menu to actually hear it.`},
  },

  motor: {
    name:'DC Motor', cat:'Basics', w:80, h:64,
    terms:[{id:'+',x:0,y:20},{id:'-',x:0,y:44}],
    defaults:{},
    elements(p){ return [{kind:'r', a:'+', b:'-', r:14, tag:'main', maxP:6}]; },
    draw(p){
      return `<rect x="6" y="10" width="52" height="44" rx="10" fill="url(#gMetal)" stroke="#6b7486"/>
      <rect x="12" y="10" width="8" height="44" fill="#8a929d"/>
      <rect x="56" y="28" width="12" height="8" fill="#c8ccd4"/>
      <g class="rotor" transform="rotate(${p.state.rotAngle||0},72,32)">
        <rect x="70" y="14" width="4" height="36" rx="2" fill="#e8ebf2"/>
        <rect x="54" y="30" width="36" height="4" rx="2" fill="#e8ebf2" opacity=".85"/>
      </g>
      ${label(34,36,'DC',9,'#39404e')}
      ${p.state.broken ? smoke(30,6):''}`;
    },
    info:{ title:'DC Motor', body:
`Spins when current flows through its coils inside a magnetic field. Speed rises with voltage; <b>swap + and − and it spins the other way</b>.
<br><br><b>Current hungry:</b> motors draw far more than LEDs (hundreds of mA). Don't drive one straight from a GPIO pin (max ~40 mA!) — real projects use a transistor or driver chip.
<br><b>Tip:</b> put a capacitor across the terminals to tame electrical noise.`},
  },

  perfboard: {
    name:'Perfboard', cat:'Basics', w:220, h:150, deco:true,
    terms:[],
    defaults:{},
    elements(){ return []; },
    draw(p){
      let holes='';
      for(let y=14;y<150;y+=13) for(let x=14;x<220;x+=13)
        holes += `<circle cx="${x}" cy="${y}" r="2.2" fill="#4a3618" stroke="#caa76a" stroke-width="1.4"/>`;
      return `<rect x="0" y="0" width="220" height="150" rx="6" fill="#b98a3e" stroke="#8a6526"/>
      <rect x="2" y="2" width="216" height="146" rx="5" fill="#caa14e"/>
      ${holes}`;
    },
    info:{ title:'Perfboard (prototyping board)', body:
`A grid of copper-ringed holes on 2.54 mm spacing. In real life you push component legs through and <b>solder</b> them, then join points with wire — the step between breadboard prototype and a custom PCB.
<br><br><b>In the app:</b> it's a work surface — drop it down and arrange parts on top to lay out a project like you would before soldering.`},
  },

  /* ============ MICROCONTROLLERS ============ */
  esp32: {
    name:'ESP32 DevKit', cat:'Boards', w:210, h:110, board:true, vcc:3.3, adcMax:4095,
    builtinLed:2, inputOnly:[34,35,36,39],
    pinsLeft:['3V3','GND','D2','D4','D13','D25'],
    pinsRight:['VIN','GND','D26','D32','D33','D34'],
    terms:[
      {id:'3V3',x:0,y:15},{id:'GND',x:0,y:31},{id:'2',x:0,y:47},{id:'4',x:0,y:63},{id:'13',x:0,y:79},{id:'25',x:0,y:95},
      {id:'VIN',x:210,y:15},{id:'GND2',x:210,y:31},{id:'26',x:210,y:47},{id:'32',x:210,y:63},{id:'33',x:210,y:79},{id:'34',x:210,y:95},
    ],
    defaults:{usb:true, code:''},
    elements(p){
      const els = [{kind:'r', a:'GND', b:'GND2', r:0.001}];
      if (p.props.usb) els.push({kind:'v', a:'VIN', b:'GND', v:5, r:0.4, tag:'usb', maxI:1.5});
      if (p.state.powered){
        els.push({kind:'v', a:'3V3', b:'GND', v:3.3, r:0.9, tag:'3v3', maxI:0.6});
        const pins = p.state.pins||{};
        for (const [pin, st] of Object.entries(pins)){
          const t = String(pin)==='2' ? '2' : String(pin);
          if (!this.terms.find(x=>x.id===t)) continue;
          if (st.mode==='OUTPUT') els.push({kind:'v', a:t, b:'GND', v:3.3*(st.duty??0), r:40, tag:'pin'+t, maxI:0.04, gpio:true});
          else if (st.mode==='INPUT_PULLUP') els.push({kind:'v', a:t, b:'GND', v:3.3, r:45000, tag:'pu'+t});
        }
      }
      return els;
    },
    draw(p){
      const pw = p.state.powered, bl = (p.state.pins?.[this.builtinLed]?.mode==='OUTPUT') ? (p.state.pins[this.builtinLed].duty||0) : 0;
      let pins='';
      this.terms.forEach(t=>{ const lx = t.x===0? 22 : 188;
        pins += `<rect x="${t.x===0?4:196}" y="${t.y-3}" width="10" height="6" rx="1" fill="url(#gGold)"/>` +
        label(lx, t.y+3, t.id==='GND2'?'GND':t.id, 7.5, '#cfe0f4');
      });
      return `<rect x="8" y="2" width="194" height="106" rx="6" fill="#14161c" stroke="#000"/>
      <rect x="14" y="8" width="182" height="94" rx="4" fill="url(#gChip)"/>
      <rect x="70" y="14" width="70" height="46" rx="3" fill="#2b303b" stroke="#454c58"/>
      <rect x="74" y="18" width="62" height="38" rx="2" fill="url(#gMetal)" opacity=".9"/>
      ${label(105,40,'ESP32-WROOM',7,'#39404e')}
      <path d="M78 22 h8 m-8 5 h8 m-8 5 h8" stroke="#39404e" stroke-width="1.5"/>
      <rect x="92" y="88" width="26" height="16" rx="2" fill="url(#gMetal)"/>${label(105,99,'USB',6,'#39404e')}
      <rect x="46" y="86" width="14" height="12" rx="2" fill="#333"/><rect x="150" y="86" width="14" height="12" rx="2" fill="#333"/>
      ${label(53,106,'EN',5.5)}${label(157,106,'BOOT',5.5)}
      <circle class="pwrled" cx="66" cy="70" r="3.5" fill="${pw?'#f33':'#411'}"/>${label(66,80,'PWR',5.5)}
      <circle class="binled" cx="145" cy="70" r="3.5" fill="${bl>0.05?'#3af':'#123'}"/>
      ${bl>0.05?`<circle cx="145" cy="70" r="9" fill="#3af" opacity="${bl*0.5}" filter="url(#fSmoke)"/>`:''}${label(145,80,'IO2',5.5)}
      ${pins}
      ${p.props.usb?`<rect x="94" y="100" width="22" height="8" rx="2" fill="#8a929d"/>${label(105,2,'',1)}`:''}
      ${p.state.broken ? smoke(105,10):''}`;
    },
    info:{ title:'ESP32 DevKit (32-bit MCU + WiFi/BT)', body:
`A powerful microcontroller board: dual-core 240 MHz, WiFi + Bluetooth, and lots of GPIO. Runs <b>3.3 V logic</b> — its pins output 3.3 V, and its ADC reads 0–3.3 V as 0–4095.
<br><br><b>Powering it:</b> USB, or 5 V into <b>VIN</b> (an onboard regulator makes 3.3 V). The <b>3V3 pin</b> can power small sensors (&lt;600 mA total).
<br><b>Pins to know:</b> GPIO 2 = built-in LED (<code>LED_BUILTIN</code>). GPIO 34–39 are <b>input-only</b>. Any pin can do PWM via <code>analogWrite()</code>.
<br><b>⚠️ GPIO limit:</b> ~40 mA per pin max — enough for an LED, never a motor.
<br><br>Select the board and hit <b>&lt;/&gt; Code</b> to program it in real Arduino-style C.`},
  },

  uno: {
    name:'Arduino Uno', cat:'Boards', w:210, h:150, board:true, vcc:5, adcMax:1023,
    builtinLed:13, pwmPins:[3,5,6,9,10,11], inputOnly:[],
    terms:[
      {id:'13',x:0,y:15},{id:'11',x:0,y:35},{id:'9',x:0,y:55},{id:'6',x:0,y:75},{id:'3',x:0,y:95},{id:'2',x:0,y:115},{id:'GND',x:0,y:135},
      {id:'5V',x:210,y:15},{id:'3V3',x:210,y:35},{id:'GND2',x:210,y:55},{id:'VIN',x:210,y:75},{id:'A0',x:210,y:95},{id:'A1',x:210,y:115},{id:'A2',x:210,y:135},
    ],
    defaults:{usb:true, code:''},
    elements(p){
      const els = [{kind:'r', a:'GND', b:'GND2', r:0.001}];
      if (p.props.usb) els.push({kind:'v', a:'5V', b:'GND', v:5, r:0.5, tag:'usb', maxI:0.5});
      if (p.state.powered){
        if (!p.props.usb) els.push({kind:'v', a:'5V', b:'GND', v:5, r:0.6, tag:'reg', maxI:0.5});
        els.push({kind:'v', a:'3V3', b:'GND', v:3.3, r:2, tag:'3v3', maxI:0.15});
        const pins = p.state.pins||{};
        for (const [pin, st] of Object.entries(pins)){
          const t = String(pin);
          if (!this.terms.find(x=>x.id===t)) continue;
          if (st.mode==='OUTPUT') els.push({kind:'v', a:t, b:'GND', v:5*(st.duty??0), r:35, tag:'pin'+t, maxI:0.045, gpio:true});
          else if (st.mode==='INPUT_PULLUP') els.push({kind:'v', a:t, b:'GND', v:5, r:32000, tag:'pu'+t});
        }
      }
      return els;
    },
    draw(p){
      const pw = p.state.powered, bl = (p.state.pins?.[13]?.mode==='OUTPUT') ? (p.state.pins[13].duty||0) : 0;
      let pins='';
      this.terms.forEach(t=>{ const lx = t.x===0? 24 : 184;
        pins += `<rect x="${t.x===0?4:196}" y="${t.y-3}" width="10" height="6" rx="1" fill="url(#gGold)"/>` +
        label(lx, t.y+3, t.id==='GND2'?'GND':(t.x===0&&/^\d+$/.test(t.id)?'D'+t.id:t.id), 7.5, '#cfe0f4');
      });
      return `<rect x="8" y="2" width="194" height="146" rx="8" fill="#0e7a8f" stroke="#08505e"/>
      <rect x="14" y="8" width="182" height="134" rx="6" fill="#12889f"/>
      <rect x="60" y="60" width="90" height="26" rx="3" fill="url(#gChip)"/>
      ${label(105,76,'ATMEGA328P',7,'#9ab')}
      <rect x="88" y="122" width="34" height="20" rx="2" fill="url(#gMetal)"/>${label(105,135,'USB',7,'#39404e')}
      <circle cx="48" cy="120" r="9" fill="#333" stroke="#111"/>${label(48,140,'RESET',5.5)}
      <circle class="pwrled" cx="160" cy="112" r="3.5" fill="${pw?'#3c5':'#143'}"/>${label(160,122,'ON',5.5)}
      <circle class="binled" cx="160" cy="94" r="3.5" fill="${bl>0.05?'#fa0':'#431'}"/>
      ${bl>0.05?`<circle cx="160" cy="94" r="9" fill="#fa0" opacity="${bl*0.5}" filter="url(#fSmoke)"/>`:''}${label(172,97,'L13',5.5)}
      ${label(105,26,'ARDUINO UNO',9,'#d6f4fa')}
      ${pins}
      ${p.state.broken ? smoke(105,12):''}`;
    },
    info:{ title:'Arduino Uno (ATmega328P)', body:
`The classic beginner board: 16 MHz 8-bit chip, <b>5 V logic</b>, 14 digital pins, 6 analog inputs (0–5 V read as 0–1023).
<br><br><b>Pins to know:</b> D13 = built-in LED (<code>LED_BUILTIN</code>). Only pins <b>3, 5, 6, 9, 10, 11</b> support PWM (<code>analogWrite</code>) — try it on another pin here and you'll get the same surprise as on real hardware.
<br><b>Powering it:</b> USB, or 7–12 V into VIN. The 5 V pin can supply small loads.
<br><br>Select the board and hit <b>&lt;/&gt; Code</b> to write real Arduino C for it.`},
  },

  };

  const order = ['battery_aa','battery_2aa','battery_9v','lipo','usb5v','tp4056','boost',
                 'resistor','led','button','switch','pot','capacitor','buzzer','motor','perfboard',
                 'esp32','uno'];

  return { defs, order, E_VALUES, fmtOhm, fmt, LED_COLORS, SVG_DEFS,
    termPos(part){
      const d = defs[part.type], cx = d.w/2, cy = d.h/2;
      const rad = (part.rot||0)*Math.PI/180, cos=Math.cos(rad), sin=Math.sin(rad);
      return d.terms.map(t=>{
        const dx = t.x-cx, dy = t.y-cy;
        return { id:t.id, x: part.x+cx + dx*cos - dy*sin, y: part.y+cy + dx*sin + dy*cos };
      });
    }
  };
})();
if (typeof module!=='undefined') module.exports = PARTS;
