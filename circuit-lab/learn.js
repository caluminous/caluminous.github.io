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

/* ===== UNIT 2 · BOARDS ===== */
{
  id:'breadboard-basics', unit:'2 · Boards', title:'Breadboard: No Wires Needed',
  goal:'Light an LED on a breadboard using the internal strips — at least 2 legs plugged into holes.',
  body:`<p>Time to build like the pros prototype. Add a <b>breadboard</b> and remember its secret wiring:</p>
  <ul><li>each <b>column of 5 holes</b> is one connected strip (above/below the channel)</li>
  <li>the long <b>+ / − rails</b> are continuous — power highways</li></ul>
  <p><b>Build:</b></p>
  <ol><li>Wire a 2×AA holder: <b>+</b> to a hole in the red rail, <b>−</b> to the blue rail.</li>
  <li>Drop a resistor so one leg is in the + rail and the other lands in a column.</li>
  <li>Drop the LED so its <b>+ leg shares that same column</b> and its − leg lands in another column.</li>
  <li>Wire that last column (or leg) back to the − rail… or just bridge with the LED leg into the blue rail directly!</li></ol>
  <p>Watch for the little <b>green rings</b> — they show legs clicking into holes. Parts snap to the grid when you drop them close.</p>`,
  hint:'Legs in the SAME column are connected; different columns are not. If the LED is dark, check both shared columns and the LED polarity.',
  check(app){
    const bb = app.parts.find(p=>p.type==='breadboard');
    if (!bb) return false;
    const plugged = app.links.filter(l=>[l.a,l.b].some(e=>e.part===bb.id && e.term.startsWith('H:'))).length;
    return plugged >= 2 && app.parts.some(p=>p.type==='led' && !p.state.broken && (p.state.brightness||0) > 0.1);
  },
},
{
  id:'solder-it', unit:'2 · Boards', title:'Flip It & Solder It',
  goal:'Light an LED through a perfboard: legs in holes, at least 2 solder traces on the back doing real work.',
  body:`<p>Perfboard is the permanent version — and unlike a breadboard, <b>the holes connect to nothing</b> until you solder.</p>
  <ol><li>Add a <b>perfboard</b> and place a resistor and LED so their legs snap into holes.</li>
  <li>Wire battery <b>+</b> to the hole next to the resistor's first leg, and battery <b>−</b> to a hole near the LED's − leg (wires can plug straight into holes).</li>
  <li>Nothing lights yet — the pads are isolated! Select the board → <b>🔁 Flip &amp; solder</b>.</li>
  <li>On the copper side, drag solder traces: battery pad → resistor leg pad, resistor other leg → LED + pad, LED − pad → battery − pad (skip any hop where two legs already share a hole).</li></ol>
  <p>Hit ✓ Done and admire the front: the LED lights only through the joints you soldered. That's a real, permanent circuit.</p>`,
  hint:'In the flip view, silver pins show where legs poke through. Each trace connects exactly two pads — chain them to route power through the board.',
  check(app){
    const pb = app.parts.find(p=>p.type==='perfboard');
    return !!(pb && (pb.props.solders||[]).length >= 2 &&
      app.parts.some(p=>p.type==='led' && !p.state.broken && (p.state.brightness||0) > 0.1));
  },
},

/* ===== UNIT 3 · REAL POWER ===== */
{
  id:'charge-lipo', unit:'3 · Power', title:'Charge a LiPo',
  goal:'Get a TP4056 actively charging a LiPo battery (red charge LED on).',
  body:`<p>LiPo cells must be charged carefully — that's the TP4056's whole job.</p>
  <p><b>Build:</b> USB 5V <b>+ → IN+</b>, USB <b>− → IN−</b>, then LiPo <b>+ → B+</b> and LiPo <b>− → B−</b>.</p>
  <p>Watch the module's red LED light and the battery % climb (sim time is sped up so you can see it). Select the LiPo to watch its voltage rise toward 4.2 V.</p>`,
  hint:'Charging only starts if the LiPo is below full — select the LiPo and drag its charge % down first if needed.',
  check(app){ return app.parts.some(p => p.type==='tp4056' && p.state.chargingOut); },
},
{
  id:'powerbank', unit:'3 · Power', title:'Build a Power Bank',
  goal:'Power an ESP32 from a LiPo through a boost converter — ESP32 running with its USB power OFF.',
  body:`<p>This is literally how commercial power banks work: LiPo (3.7 V) → <b>boost converter</b> → 5 V out.</p>
  <p><b>Build:</b> LiPo + → boost <b>IN+</b>, LiPo − → boost <b>IN−</b>. Then boost <b>OUT+ → ESP32 VIN</b>, boost <b>OUT− → ESP32 GND</b>.</p>
  <p>Finally select the ESP32 and turn <b>USB power OFF</b> — its red power LED should stay on, fed by your battery. You made a portable gadget!</p>`,
  hint:'The ESP32 needs ~5 V on VIN. Check the boost converter\'s green light — if it\'s off, its input wiring is wrong.',
  check(app){ return app.parts.some(p => PARTS.defs[p.type].board && p.state.powered && !p.props.usb); },
},

/* ===== UNIT 3 · CODE ===== */
{
  id:'blink', unit:'4 · Code', title:'Blink — Hello, World!',
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
  <p>Hit <b>▶ Upload & Run</b>. Here's what every single line does:</p>
  <table class="xp">
  <tr><td>void setup() { }</td><td>A function that runs <b>once</b> when the board powers up. "void" = it returns nothing. All your one-time preparation goes between its { }.</td></tr>
  <tr><td>pinMode(13, OUTPUT);</td><td>Tells the chip pin 13 will be an <b>output</b> (a controllable 3.3 V tap) rather than an input. Do this once per pin, in setup.</td></tr>
  <tr><td>void loop() { }</td><td>Runs top-to-bottom, then instantly starts again, forever — the heartbeat of every Arduino program.</td></tr>
  <tr><td>digitalWrite(13, HIGH);</td><td>Switches pin 13 ON — it now outputs 3.3 V, pushing current through your resistor + LED. <code>HIGH</code> is just the number 1.</td></tr>
  <tr><td>delay(500);</td><td>Pause everything for 500 milliseconds (half a second). Without delays the blink would be too fast to see!</td></tr>
  <tr><td>digitalWrite(13, LOW);</td><td>Switches pin 13 OFF — 0 V, no current, LED dark. <code>LOW</code> = 0.</td></tr>
  <tr><td>; and { }</td><td>Every statement ends with a semicolon; curly braces group statements into a block. Miss one and you'll get an error with the line number — read it, fix it, re-upload.</td></tr>
  </table>
  <p><b>Why pin 13 → GND?</b> Current flows out of pin 13 (3.3 V) → resistor (limits it to ~6 mA) → LED (lights) → back into <b>GND</b>, completing the loop through the board.</p>`,
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
  id:'button-in', unit:'4 · Code', title:'Read the World',
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
  <p><b>INPUT_PULLUP</b> = a built-in resistor gently holds the pin HIGH; pressing the button pulls it to GND, so <b>pressed reads LOW</b>. This backwards-feeling trick is used in almost every real gadget.</p>
  <p>Line by line:</p>
  <table class="xp">
  <tr><td>pinMode(4, INPUT_PULLUP);</td><td>Pin 4 becomes an input, with the chip's internal ~45 kΩ resistor tied to 3.3 V. Unpressed, the pin idles at 3.3 V (HIGH) instead of floating randomly.</td></tr>
  <tr><td>digitalRead(4)</td><td>Measures the voltage on pin 4 <i>right now</i>: above ~1.65 V → returns HIGH (1), below → LOW (0).</td></tr>
  <tr><td>if (... == LOW) { } else { }</td><td>A decision: run the first block when the comparison is true, otherwise the else block. <code>==</code> compares (a single <code>=</code> would assign — classic bug!).</td></tr>
  <tr><td>// pressed</td><td>A comment — everything after // is ignored by the compiler, it's a note for humans.</td></tr>
  </table>
  <p><b>Why does pressing read LOW?</b> The button connects pin 4 to GND. GND (0 V) easily "wins" against the weak 45 kΩ pull-up, so the pin voltage collapses to 0 V. Release, and the pull-up drags it back to 3.3 V.</p>`,
  hint:'Run the code, then tap-and-hold the button (use HOLD in its panel). The LED should follow your finger.',
  check(app){
    const btn = app.parts.find(p=>p.type==='button');
    const led = app.parts.find(p=>p.type==='led' && !p.state.broken);
    return !!(btn && btn.state.pressed && led && (led.state.brightness||0) > 0.1 &&
      app.anyBoardRunning(rt => rt.usedDigitalRead));
  },
},
{
  id:'fade', unit:'4 · Code', title:'Fade — PWM Magic',
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
  <p>Line by line:</p>
  <table class="xp">
  <tr><td>for (int b = 0; b <= 255; b += 5)</td><td>A counting loop, three parts: <b>start</b> (make a variable b = 0), <b>keep going while</b> b ≤ 255, <b>after each lap</b> add 5 to b. So b goes 0, 5, 10 … 255.</td></tr>
  <tr><td>int b</td><td>Declares a whole-number variable named b. It only exists inside this loop.</td></tr>
  <tr><td>analogWrite(13, b);</td><td>Sets pin 13's PWM duty to b out of 255. b=0 → always off, b=128 → on half the time (half brightness), b=255 → fully on.</td></tr>
  <tr><td>delay(20);</td><td>20 ms per step × 52 steps ≈ 1 second per fade direction.</td></tr>
  <tr><td>b -= 5</td><td>Shorthand for b = b − 5 — the second loop counts back down, fading out.</td></tr>
  </table>
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
  id:'analog-in', unit:'4 · Code', title:'Sense It — analogRead',
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
  <p>Run it, open the Serial panel in the code editor, and drag the pot's knob — the numbers (0–4095 on ESP32) follow the wiper voltage. This is how every sensor knob, joystick and light sensor works.</p>
  <table class="xp">
  <tr><td>Serial.begin(115200);</td><td>Opens the serial link between board and computer at 115200 bits/second — needed once before any printing.</td></tr>
  <tr><td>int raw = analogRead(34);</td><td>Measures the voltage on pin 34 and stores it in a new variable: 0 V → 0, 3.3 V → 4095, halfway → ~2048.</td></tr>
  <tr><td>Serial.print("knob: ");</td><td>Sends text to the serial monitor <i>without</i> ending the line — so the number lands on the same line.</td></tr>
  <tr><td>Serial.println(raw);</td><td>Prints the variable's current value, then a newline. print vs println is just "stay on line" vs "end the line".</td></tr>
  <tr><td>delay(200);</td><td>5 readings a second — without this the monitor would be a blur of thousands of lines.</td></tr>
  </table>
  <p><b>Why pin 34 and why the divider?</b> Pin 34 is input-only, ideal for measuring. The pot's two ends sit at 3.3 V and 0 V; the wiper (W) taps a point in between, so turning the knob sweeps its voltage smoothly from 0 → 3.3 V.</p>`,
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
  id:'alarm', unit:'4 · Code', title:'Final Boss: Burglar Alarm',
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
  <p>Hold the button — flashing light, beeping siren, serial log. You've built a real embedded system: sensor in, decisions in code, actuators out.</p>
  <table class="xp">
  <tr><td>three pinMode calls</td><td>Declare every pin's job up front: pin 4 senses (input with pull-up), pins 25 and 13 act (outputs). Boards don't guess — you must tell them.</td></tr>
  <tr><td>if (digitalRead(4) == LOW)</td><td>The whole alarm hinges on this: is the "door" (button) triggered right now? loop() re-asks hundreds of times a second.</td></tr>
  <tr><td>digitalWrite(25, HIGH);</td><td>3.3 V onto the buzzer's + leg → the buzzer's internal oscillator screams. Its − leg must be on GND to complete the loop.</td></tr>
  <tr><td>delay(150); … LOW … delay(150);</td><td>ON 150 ms, OFF 150 ms — this half-and-half rhythm is what turns a constant beep into a pulsing siren.</td></tr>
  <tr><td>Serial.println("INTRUDER!");</td><td>Your event log — real alarms do exactly this to a server instead of a serial port.</td></tr>
  </table>`,
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
