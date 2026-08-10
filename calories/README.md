# Fuel — calorie & training tracker

An installable, offline-first web app for tracking food, training and bodyweight.
Live at **https://caluminous.github.io/calories/**

## Install on your phone

- **iPhone** — open the link in Safari, tap Share, then *Add to Home Screen*.
- **Android** — open in Chrome, tap the ⋮ menu, then *Install app* / *Add to Home screen*.

It then launches full-screen like a normal app and works with no signal.

## What it does

**Targets.** Works out BMR from the Mifflin-St Jeor equation, scales it by your
day-to-day activity to get maintenance calories (TDEE), then applies a surplus or
deficit from your goal and chosen rate of change. 1 kg of body tissue is treated as
7,700 kcal. You can override the daily number by hand instead. A safety floor stops
it recommending under 1,500 kcal (1,200 for women).

**Macros.** Protein set per kg of bodyweight, as a percentage of calories, or as a
flat number of grams. Fat comes from a percentage of calories, carbs take the
remainder.

**Food.** 133 built-in foods with per-100g macros and sensible serving sizes, plus
your own custom foods and multi-ingredient recipes. Log by serving or by grams,
with a live macro preview. Search that finds nothing offers to create the food
there and then, or to log it as a name and a number. Recent and saved lists, and
a one-tap copy of an earlier day's food.

**Your own meals.** The four starting meals are only a starting point — rename,
reorder, add or delete them in Settings → Name my meals. Deleting one moves its
food elsewhere rather than losing the calories.

**Reminders.** Optional nudges to log meals, drink water and weigh in, each with
its own time. A reminder stays quiet if you have already done the thing. See the
honesty note below on what the web can actually deliver.

**Training.** Cardio and activity logged against MET values, so calories burned come
from your actual bodyweight and the duration — editable if your watch disagrees.
Strength sessions log sets, reps and weight, with session volume and an estimated
one-rep max (Epley).

**Body.** Weigh-ins with a 7-day moving average, BMI, waist and body-fat fields, a
least-squares trend in kg/week, and a projected date for hitting your goal weight.

**Also.** Water, steps, daily notes, logging streak, weekly averages and adherence,
macro split, and 7- and 30-day charts.

## What reminders can and cannot do

A web app has no way to hand a list of future alarms to the phone's OS the way a
native app can, and there is no push server behind this one. So reminders are
checked on a timer while the app is running, and again the moment you reopen it.

- **Android, installed to the home screen** — the app generally stays alive in the
  background, so reminders arrive close to their time.
- **iPhone** — needs iOS 16.4+ and the app added to the home screen. If you swipe
  it away it sleeps, and nothing fires until you open it again.
- **Either way** — anything missed is shown as a catch-up on next open, and a
  reminder more than three hours stale is dropped rather than shown late.

The Reminders screen says all of this in the app too.

## Your data

Everything is stored in `localStorage` on the device — nothing is uploaded and there
is no account. That also means clearing site data wipes it, so use
**Stats → Export backup** before switching phone, and *Import backup* on the new one.

## Files

| File | Purpose |
| --- | --- |
| `index.html` | App shell, header and bottom navigation |
| `style.css` | All styling; dark and light themes via `[data-theme]` |
| `data.js` | Food, activity (MET) and lift databases |
| `calc.js` | BMR, TDEE, macro, MET, e1RM, BMI and trend maths — pure functions |
| `store.js` | State, `localStorage` persistence, migrations, meals, derived totals |
| `notify.js` | Reminder scheduling and notification delivery |
| `ui.js` | Sheets, rings, bars, SVG charts, toasts, form controls |
| `app.js` | Views, routing and interaction |
| `sw.js` | Service worker — precaches the shell for offline use |

No build step and no dependencies. Edit a file and reload.

When changing any cached asset, bump `CACHE` in `sw.js` so existing installs pick
up the new version.
