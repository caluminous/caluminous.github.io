# Cast

Where can I fish today, what does it legally cost, and what do I put on the hook.

A single-page, offline-capable web app for UK anglers. No backend, no accounts, no API
keys, no analytics. Everything runs in the browser and all personal data stays on the device.

Live at `/fishing/` on the site. The prompt it was built from is in [PROMPT.md](PROMPT.md).

## What it does

**Finds waters near you.** Geolocation or a postcode, a radius you set, and two sources of
venues: a hand-written seed list of 131 UK fisheries, reservoirs, rivers, canals, lochs and
shore marks, plus live discovery from OpenStreetMap so the app has real coverage anywhere
in the country.

**Finds waters by name.** The search box takes a postcode, a town, or the name of a water —
"Twynersh Fishery", "Bluebell Lakes", "River Wye", or just "pier". Partial names work. The
built-in list answers instantly and nationwide; one tap widens the search to every named
water in OpenStreetMap.

**Tells you what today costs.** A "Before you cast" panel per venue that adds the rod
licence you actually need to the venue's day ticket and gives you one number. It knows the
rules differ across the UK — the Environment Agency licence in England and Wales, no rod
licence but mandatory permission in Scotland, a licence *and* a permit in Northern Ireland,
and nothing at all for shore sea fishing. Save your own annual licence in the profile and
the licence line drops to zero.

**Knows when you legally can't.** The statutory 15 March – 15 June coarse close season on
rivers greys the venue out and says why.

**Works out what's biting.** A likelihood score per species from the month, air
temperature, time of day relative to sunrise and sunset, and barometric pressure, with the
reasoning shown so you can disagree with it.

**Shows you how to catch it.** Hook size, line, ranked baits, and rig diagrams — 20 of them,
all generated from a shared component vocabulary so they read the same way.

**Logs your catches** with the conditions at the time, and tells you which of your baits
is actually working.

## The map

Written from scratch — no Leaflet, no Mapbox, nothing. Drag, pinch, wheel, double-tap,
keyboard panning, distance-based clustering, a radius ring, colour-coded rating pins and a preview
sheet, all in `map.js` against raw OpenStreetMap tiles. Tiles are cached by the service
worker so a map you've already looked at still works on the bank with no signal.

## Files

| File | What's in it |
| --- | --- |
| `data.js` | Licence prices and rules, close season, 32 species, 20 rig specs, 131 seed venues |
| `store.js` | localStorage state, ratings, corrections, catch log, network cache |
| `geo.js` | Geolocation, postcodes.io, Overpass discovery and name search, Open-Meteo, distance |
| `tactics.js` | Conditions, bite score, species likelihood, cost and legality |
| `map.js` | The slippy map |
| `ui.js` | Icons, stars, score rings, the rig diagram engine |
| `app.js` | Views and routing |
| `sw.js` | Offline shell and tile cache |

## Data sources

- **Rod licence prices and rules** — published Environment Agency rates, last checked
  2026-04-01. Reviewed every April; editable in-app when they go stale.
- **Nearby waters** — [OpenStreetMap](https://www.openstreetmap.org/copyright) via Overpass.
- **Postcodes and places** — [postcodes.io](https://postcodes.io).
- **Forecast and pressure** — [Open-Meteo](https://open-meteo.com).

## Honesty rules this app follows

Day-ticket prices and star ratings on built-in venues are **indicative editorial values** —
a starting point, not quotes and not real angler reviews. Waters discovered on OpenStreetMap
are labelled unverified: being on a map is not permission to fish. Anything the app can't
stand behind renders as "not recorded" rather than a plausible-looking invented number, and
every venue can be corrected locally.

**This is not legal advice.** Licence requirements, close seasons, size limits and byelaws
change and vary by water and region. Check with the fishery, the club and the current
byelaws before you cast.
