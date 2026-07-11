/* Circuit Lab — Learn tab: levelled lessons with live auto-checked goals, and project guides.
   Each level's check(app) runs continuously against the real simulation. */
'use strict';

const LEVELS = [

/* ===== UNIT 1 · ELECTRICITY BASICS ===== */
{
  id:'first-light', unit:'1 · Basics', title:'First Light',
  goal:'Light an LED safely (between 2 mA and 25 mA).',
  body:`<p>Every circuit needs a <b>complete loop</b>: power source → components → back to the source.</p>
  <p><b>Build this:</b></p>
  <ol><li>Add a <b>2×AA holder</b> (3 V), a <b>resistor</b> (keep 220 Ω) and an <b>LED</b>.</li>
  <li>Wire: battery <b>+</b> → resistor → LED <b>anode (+)</b>, then LED <b>cathode (−)</b> → battery <b>−</b>.</li>
  <li>To wire, tap a terminal dot, then tap the terminal you want to connect it to.</li></ol>
  <p>💡 The resistor limits current so the LED doesn't fry: I = (3 − 1.8) ÷ 220 ≈ 5 mA. Cosy.</p>`,
  hint:'LEDs only conduct one way — the + (anode) leg must face the battery +. Tap the LED to check which leg is which.',
  check(app){
    return app.parts.some(p => p.type==='led' && !p.state.broken && p.state.reads &&
      p.state.reads.i > 0.002 && p.state.reads.i < 0.025);
  },
},
{
  id:'wrong-way', unit:'1 · Basics', title:'The One-Way Street',
  goal:'Prove diodes are one-way: build a lit LED circuit, then rotate the LED so it blocks (LED connected, circuit on, LED dark).',
  body:`<p>A <b>diode</b> only lets current flow from anode (+) to cathode (−). Backwards, it's a wall.</p>
  <p>Take your working LED circuit and <b>rotate the LED 180°</b> (select it → Rotate twice) or swap its two wires. The LED should go dark even though everything is connected.</p>
  <p>This isn't a broken circuit — it's the LED doing its job as a one-way valve.</p>`,
  hint:'The check passes when an unbroken LED has voltage pushed across it the WRONG way (reverse-biased) — i.e. it is in a live circuit but blocking.',
  check(app){
    return app.parts.some(p => p.type==='led' && !p.state.broken && p.state.reads &&
      p.state.reads.v < -0.5 && Math.abs(p.state.reads.i) < 0.0005);
  },
},
{
  id:'switch-it', unit:'1 · Basics', title:'Take Control',
  goal:'Add a slide switch to your LED circuit and use it: the level passes once the app has seen the LED both OFF (switch open) and ON (switch closed).',
  body:`<p>A switch just breaks the loop. Open switch = the whole series circuit stops, because current has no path.</p>
  <p><b>Build:</b> battery → switch → resistor → LED → battery. Tap the switch to flip it.</p>`,
  hint:'The switch can go anywhere in the loop — before or after the LED. Series circuits don\'t care about order.',
  track:{ needOff:true, needOn:true },
  check(app, mem){
    const sw = app.parts.find(p=>p.type==='switch');
    const led = app.parts.find(p=>p.type==='led' && !p.state.broken);
    if (!sw || !led) return false;
    if (!sw.state.on && (led.state.brightness||0) < 0.02) mem.sawOff = true;
    if (sw.state.on && (led.state.brightness||0) > 0.1) mem.sawOn = true;
    return !!(mem.sawOff && mem.sawOn);
  },
},
{
  id:'series-parallel', unit:'1 · Basics', title:'Series vs Parallel',
  goal:'Light two LEDs at the same time, each drawing at least 3 mA.',
  body:`<p>Two ways to add a second LED:</p>
  <p><b>Series</b> (in the same loop): both share the same current, but their forward voltages ADD — two red LEDs need ~3.6 V, so 3 V won't cut it. Try a 9 V battery (with a bigger resistor, ~470 Ω!).</p>
  <p><b>Parallel</b> (each with its own resistor, side by side across the battery): each LED gets the full battery voltage. Best practice: one resistor per LED.</p>
  <p>Build either — or both — until two LEDs shine at once.</p>`,
  hint:'Parallel from 3 V: battery + splits to two resistor→LED chains, both returning to battery −. You can connect several wires to one terminal.',
  check(app){
    return app.parts.filter(p => p.type==='led' && !p.state.broken && p.state.reads && p.state.reads.i > 0.003).length >= 2;
  },
},
{
  id:'dimmer', unit:'1 · Basics', title:'Dimmer Dial',
  goal:'Control an LED\'s brightness with a potentiometer — the app must see the LED current change by at least 5 mA as you turn the knob.',
  body:`<p>Wire the pot as a <b>variable resistor</b>: battery + → pot pin <b>A</b>, pot pin <b>W</b> (wiper) → LED + , LED − → battery −.</p>
  <p>Select the pot and drag the knob slider. Less resistance = more current = brighter. Keep a small fixed resistor (e.g. 100 Ω) in series too, so full-clockwise can't fry the LED.</p>`,
  hint:'Use A and W (not A and B — that\'s always the full resistance). Add the fixed resistor between wiper and LED as a safety net.',
  check(app, mem){
    const led = app.parts.find(p=>p.type==='led' && !p.state.broken && p.state.reads && p.state.reads.i>0.0005);
    const pot = app.parts.find(p=>p.type==='pot');
    if (!pot) return false;
    if (led){
      mem.minI = Math.min(mem.minI ?? 1, led.state.reads.i);
      mem.maxI = Math.max(mem.maxI ?? 0, led.state.reads.i);
    }
    return (mem.maxI??0) - (mem.minI??1) > 0.005;
  },
},
{
  id:'burn-it', unit:'1 · Basics', title:'Blow Something Up (on purpose)',
  goal:'Burn out an LED. Yes, really.',
  body:`<p>The best way to respect current limits is to break one — cheaply, in a simulator.</p>
  <p>Connect an LED <b>directly</b> across a 9 V battery, no resistor. Watch what ~600 mA does to a part rated for 20 mA.</p>
  <p>Afterwards, tap the dead LED → <b>Repair</b>, and never do this on your real desk. 😉</p>`,
  hint:'9 V straight across the LED. It will not survive. That is the lesson.',
  check(app){ return app.parts.some(p => p.type==='led' && p.state.broken); },
},

/* ===== UNIT 2 · REAL POWER ===== */
{
  id:'charge-lipo', unit:'2 · Power', title:'Charge a LiPo',
  goal:'Get a TP4056 actively charging a LiPo battery (red charge LED on).',
  body:`<p>LiPo cells must be charged carefully — that's the TP4056's whole job.</p>
  <p><b>Build:</b> USB 5V <b>+ → IN+</b>, USB <b>− → IN−</b>, then LiPo <b>+ → B+</b> and LiPo <b>− → B−</b>.</p>
  <p>Watch the module's red LED light and the battery % climb (sim time is sped up so you can see it). Select the LiPo to watch its voltage rise toward 4.2 V.</p>`,
  hint:'Charging only starts if the LiPo is below full — select the LiPo and drag its charge % down first if needed.',
  check(app){ return app.parts.some(p => p.type==='tp4056' && p.state.chargingOut); },
},
{
  id:'powerbank', unit:'2 · Power', title:'Build a Power Bank',
  goal:'Power an ESP32 from a LiPo through a boost converter — ESP32 running with its USB power OFF.',
  body:`<p>This is literally how commercial power banks work: LiPo (3.7 V) → <b>boost converter</b> → 5 V out.</p>
  <p><b>Build:</b> LiPo + → boost <b>IN+</b>, LiPo − → boost <b>IN−</b>. Then boost <b>OUT+ → ESP32 VIN</b>, boost <b>OUT− → ESP32 GND</b>.</p>
  <p>Finally select the ESP32 and turn <b>USB power OFF</b> — its red power LED should stay on, fed by your battery. You made a portable gadget!</p>`,
  hint:'The ESP32 needs ~5 V on VIN. Check the boost converter\'s green light — if it\'s off, its input wiring is wrong.',
  check(app){ return app.parts.some(p => PARTS.defs[p.type].board && p.state.powered && !p.props.usb); },
},

/* ===== UNIT 3 · CODE ===== */
{
  id:'blink', unit:'3 · Code', title:'Blink — Hello, World!',
  goal:'Make an external LED blink using real code (the app must see it turn on and off at least twice).',
  body:`<p>Time to program a microcontroller — with actual Arduino C, like flashing a real board.</p>
  <ol><li>Add an <b>ESP32</b> (leave USB power ON), a resistor (220 Ω) and an LED.</li>
  <li>Wire: ESP32 <b>D13</b> → resistor → LED <b>+</b>, LED <b>−</b> → ESP32 <b>GND</b>.</li>
  <li>Select the ESP32 → <b>&lt;/&gt; Code</b>, and write:</li></ol>
<pre>void setup() {
  pinMode(13, OUTPUT);
}
void loop() {
  digitalWrite(13, HIGH);
  delay(500);
  digitalWrite(13, LOW);
  delay(500);
}</pre>
  <p>Hit <b>▶ Upload & Run</b>. <code>setup()</code> runs once; <code>loop()</code> repeats forever — exactly like real firmware.</p>`,
  hint:'LED dark? Check: anode (+) toward the pin, resistor in series, GND wired, code uploaded with no red errors.',
  check(app, mem){
    const led = app.parts.find(p=>p.type==='led' && !p.state.broken);
    if (!led || !app.anyBoardRunning()) { return false; }
    const lit = (led.state.brightness||0) > 0.1;
    if (mem.last === undefined) mem.last = lit, mem.flips = 0;
    if (lit !== mem.last){ mem.flips++; mem.last = lit; }
    return mem.flips >= 4;
  },
},
{
  id:'button-in', unit:'3 · Code', title:'Read the World',
  goal:'Use digitalRead() so a button controls an LED — pass by holding the button so the LED lights under code control.',
  body:`<p>Outputs are half the story — now read an input.</p>
  <ol><li>Wire a <b>push button</b> between ESP32 <b>D4</b> and <b>GND</b>.</li>
  <li>Keep the LED on pin 13 from last level.</li></ol>
<pre>void setup() {
  pinMode(13, OUTPUT);
  pinMode(4, INPUT_PULLUP);
}
void loop() {
  if (digitalRead(4) == LOW) {
    digitalWrite(13, HIGH);   // pressed
  } else {
    digitalWrite(13, LOW);
  }
}</pre>
  <p><b>INPUT_PULLUP</b> = a built-in resistor gently holds the pin HIGH; pressing the button pulls it to GND, so <b>pressed reads LOW</b>. This backwards-feeling trick is used in almost every real gadget.</p>`,
  hint:'Run the code, then tap-and-hold the button (use HOLD in its panel). The LED should follow your finger.',
  check(app){
    const btn = app.parts.find(p=>p.type==='button');
    const led = app.parts.find(p=>p.type==='led' && !p.state.broken);
    return !!(btn && btn.state.pressed && led && (led.state.brightness||0) > 0.1 &&
      app.anyBoardRunning(rt => rt.usedDigitalRead));
  },
},
{
  id:'fade', unit:'3 · Code', title:'Fade — PWM Magic',
  goal:'Use analogWrite() to smoothly fade an LED (the app must see the duty cycle sweep a wide range).',
  body:`<p>Digital pins are only ON or OFF — so how do you dim? <b>PWM</b>: switch so fast (thousands of times a second) that the average is what matters. <code>analogWrite(pin, 0–255)</code> sets that average.</p>
<pre>void setup() {
}
void loop() {
  for (int b = 0; b <= 255; b += 5) {
    analogWrite(13, b);
    delay(20);
  }
  for (int b = 255; b >= 0; b -= 5) {
    analogWrite(13, b);
    delay(20);
  }
}</pre>
  <p>Fun fact: on an Arduino Uno only pins 3, 5, 6, 9, 10, 11 can PWM — try pin 13 on a Uno here and you'll get the authentic error.</p>`,
  hint:'Keep the LED + resistor on pin 13 of the ESP32. Watch it breathe.',
  check(app, mem){
    let any = false;
    for (const p of app.parts){
      if (!PARTS.defs[p.type].board || !p.state.pins) continue;
      for (const st of Object.values(p.state.pins)){
        if (st.mode!=='OUTPUT') continue;
        mem.min = Math.min(mem.min ?? 1, st.duty??0);
        mem.max = Math.max(mem.max ?? 0, st.duty??0);
      }
      any = true;
    }
    return any && app.anyBoardRunning(rt=>rt.usedAnalogWrite) && (mem.max??0)-(mem.min??1) > 0.55;
  },
},
{
  id:'analog-in', unit:'3 · Code', title:'Sense It — analogRead',
  goal:'Read a potentiometer with analogRead() and print values to the Serial monitor (values must change as you turn the knob).',
  body:`<p>Wire the pot as a <b>voltage divider</b>: pin <b>A</b> → ESP32 <b>3V3</b>, pin <b>B</b> → <b>GND</b>, wiper <b>W</b> → <b>D34</b> (an input-only analog pin).</p>
<pre>void setup() {
  Serial.begin(115200);
}
void loop() {
  int raw = analogRead(34);
  Serial.print("knob: ");
  Serial.println(raw);
  delay(200);
}</pre>
  <p>Run it, open the Serial panel in the code editor, and drag the pot's knob — the numbers (0–4095 on ESP32) follow the wiper voltage. This is how every sensor knob, joystick and light sensor works.</p>`,
  hint:'No numbers? Check Serial.begin is called and the wiper (middle pin W) goes to pin 34.',
  check(app, mem){
    for (const p of app.parts){
      const rt = app.runtimes[p.id];
      if (!rt || !rt.running || !rt.usedAnalogRead) continue;
      const v = Sim.termVoltage(p.id, '34');
      mem.min = Math.min(mem.min ?? 99, v); mem.max = Math.max(mem.max ?? -99, v);
    }
    return (mem.max ?? -99) - (mem.min ?? 99) > 0.8;
  },
},
{
  id:'alarm', unit:'3 · Code', title:'Final Boss: Burglar Alarm',
  goal:'Combine everything: button + buzzer + LED + code. Pass when the buzzer beeps under code control while the button is held.',
  body:`<p>Design brief — a door alarm:</p>
  <ul><li>Button between <b>D4</b> and <b>GND</b> (the "door sensor")</li>
  <li>Buzzer <b>+</b> on <b>D25</b>, <b>−</b> to GND</li>
  <li>LED (with resistor) on <b>D13</b></li></ul>
<pre>void setup() {
  pinMode(4, INPUT_PULLUP);
  pinMode(25, OUTPUT);
  pinMode(13, OUTPUT);
  Serial.begin(115200);
}
void loop() {
  if (digitalRead(4) == LOW) {
    Serial.println("INTRUDER!");
    digitalWrite(25, HIGH);
    digitalWrite(13, HIGH);
    delay(150);
    digitalWrite(25, LOW);
    digitalWrite(13, LOW);
    delay(150);
  }
}</pre>
  <p>Hold the button — flashing light, beeping siren, serial log. You've built a real embedded system: sensor in, decisions in code, actuators out.</p>`,
  hint:'Enable sound (☰ menu) to hear it. Any variation that beeps the buzzer from code while the button is held will pass.',
  check(app){
    const btn = app.parts.find(p=>p.type==='button');
    const bz = app.parts.find(p=>p.type==='buzzer');
    return !!(btn && btn.state.pressed && bz && bz.state.beeping && app.anyBoardRunning());
  },
},
];

const PROJECTS = [
{ icon:'🔦', title:'Pocket Torch', diff:'Easy',
  text:'2×AA → switch → 100 Ω resistor → white LED. The simplest useful gadget. Try adding a second LED in parallel (with its own resistor) for double brightness.' },
{ icon:'🔋', title:'DIY Power Bank', diff:'Medium',
  text:'LiPo → TP4056 (for recharging via USB) with the TP4056 OUT pins → boost converter → 5 V rail. Exactly the circuit inside a cheap power bank. Charge it, then run an ESP32 or motor from it.' },
{ icon:'🌬️', title:'Desk Fan', diff:'Easy',
  text:'2×AA → switch → DC motor. Add a potentiometer (A+W) in series for a crude speed control, and watch how much current the motor eats compared to an LED. Reverse the wires to reverse the spin.' },
{ icon:'🚨', title:'Reaction Timer', diff:'Hard',
  text:'ESP32 + button + LED + Serial. Code: light the LED after random(1000,4000) ms, record millis() until the button is pressed, print the reaction time. Uses variables, random(), millis() and inputs together.' },
{ icon:'🌙', title:'Night Light Logic', diff:'Medium',
  text:'Use the potentiometer as a pretend light sensor (voltage divider into pin 34). Code: if analogRead(34) < 1500, fade an LED up with analogWrite; otherwise fade it down. A real product in 15 lines.' },
{ icon:'🎹', title:'Morse Beeper', diff:'Medium',
  text:'Buzzer on D25. Write dot() and dash() as your own functions (the interpreter supports them!), then spell your name in Morse. Great practice for writing and calling functions.' },
];

if (typeof module!=='undefined') module.exports = { LEVELS, PROJECTS };
