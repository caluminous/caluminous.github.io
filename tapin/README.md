# Tap In

Tap the machine. That's the whole interaction.

A workout tracker built around NFC, for the gym. Hold your phone against a machine's tag
and the session starts. Hold it there again and the session ends. Hold it against a
*different* machine and the app closes one station and opens the next — which is circuit
training, logged by the act of walking to the next machine.

Live at `/tapin/`. No backend, no accounts, no API keys, no analytics. Everything runs in
the browser and every byte of data stays on the device.

## Why this instead of the gym's own system

Chain gyms already put NFC tags on their kit, and the vendor app that reads them is
usually tied to that chain, that account, and that gym. Tap In takes the opposite line:

**Any tag, any gym.** It binds to a tag's serial number, so the tag already stuck to the
machine works as-is — no vendor, no login, no cooperation from the gym required. Blank NFC
stickers cost pennies, so kit that has no tag can have one.

**Tags that work on every phone.** Live tag reading needs Web NFC, which today means
Chrome on Android. When the app writes a sticker it writes a *URL* record pointing back at
itself, and URL tags are read from the lock screen by every modern phone, iPhones
included. Tap a sticker written here on an iPhone and the app opens on that machine.

**It remembers the machine, not just the workout.** The moment you tap in, it tells you
what you did on that exact bike last time — distance, time, pace — and a weights station
opens pre-filled with last week's sets. That is the number you actually want at the moment
you want it.

**It works in a basement with no signal.** Fully offline, service worker and all.

**Your data stays yours.** One JSON file out, one JSON file back in.

## The tap rules

Four rules, deliberately boring, because you read them out of the corner of your eye with
a heart rate of 160:

| You tap | The app |
|---|---|
| a machine, nothing running | starts a workout there |
| the machine you're on | closes that station |
| a different machine | closes this station, opens that one |
| any machine, between stations | opens the next station |

An unrecognised tag asks what it is — once. After that it is yours forever.

## Without a machine

Off the tags there is no console to read, so the phone measures it itself.

**Distance by GPS** on runs, rides and walks, with live pace. Raw fixes are far too noisy
to add up — standing still on a bad fix will happily invent a kilometre — so every fix is
filtered three ways: anything vaguer than 40 m accuracy is dropped, anything implying an
impossible speed for that activity is dropped, and movement below a floor scaled to the
reported accuracy is treated as the dot wandering rather than you moving. The route is
kept densely enough to draw its shape and no denser.

**Steps by accelerometer**, indoors as well as out, by peak-picking the bounce of your
stride against a threshold that follows how hard you are actually moving. Cadence comes
with it, and decays when you stop rather than leaving 170 spm on screen at a crossing.

**The two calibrate each other.** A session with both running measures your real stride
length — GPS distance divided by steps — and the step counter uses it afterwards, so
distance keeps being measured on a treadmill or anywhere the signal goes. Until that
happens the stride is estimated from your height.

Whatever the sensors say, the distance box stays editable, and typing in it hands the
number to you permanently — with one tap to hand it back.

**What it does not do:** count your steps all day. A web page cannot run in your pocket.
Steps are counted during a session, while the app is open and the screen is awake, and
the app says so rather than presenting a session count as a daily one.

## What it tracks

**Cardio** — a live clock, live pace in whatever unit the machine is spoken in (min/km on a
treadmill, a 500 m split on a rower, km/h on a bike), lap splits on a button, and fields
for reading the console's numbers straight across.

**Strength** — sets of weight × reps with two-thumb steppers, a rest timer that starts
itself and buzzes when it's up, estimated 1RM per set, and last week's sets shown as the
target.

**Energy** — from the work actually measured where a machine measures it: Concept2's own
watts-to-calories relationship on an erg, kilojoules on a power meter. Everywhere else,
METs against the ACSM walking and running equations and your body mass.

**Personal bests** — furthest, longest, fastest, heaviest, best estimated 1RM, best session
volume. Tracked per machine where there is one and per exercise where there isn't, so "my
best 5 k" means the same thing on any treadmill while "my best leg press" doesn't get mixed
up with someone else's machine. Anything you beat is flagged on the finish screen.

**Everything else** — twelve-week load trend, a four-week-on-four-week comparison, sets per
muscle group with the neglected ones showing a dash, streaks, and a weekly session target.

## Routines

A routine is an ordered list of stations. Start one and the live screen knows what's next;
tap your way through it. Build one by hand, or from a workout you have already done.

## Files

| | |
|---|---|
| `index.html` | shell: header, nav, mount point |
| `data.js` | machine types, effort and pace maths, exercise catalogue, icons |
| `store.js` | state, persistence, personal bests, streaks, derived totals |
| `nfc.js` | Web NFC: reading, writing stickers, deep links, error wording |
| `track.js` | GPS distance, step detection, stride calibration |
| `session.js` | the live workout engine — stations, sets, splits, rest, tap rules |
| `ui.js` | sheets, toasts, fields, charts |
| `app.js` | views and routing |
| `sw.js` | offline cache |

## Browser support

Live tag reading: Chrome for Android 89+. GPS: everywhere, over HTTPS. Steps: any browser
with a motion sensor — on iOS you have to grant motion access from a button, which the app
puts in front of you. Everything else — logging, history, records, plans, and opening the
app from a written sticker — works in any modern browser. The app says which of those
you're in rather than pretending otherwise.
