# Build spec — "Cast"

This is the prompt this app was built from.

---

Build a mobile-first web app called **Cast** that helps an angler in the UK decide
where to fish today, what it will legally cost, and what to put on the end of the line.

## Core user story

> "I have a free afternoon and a car. Show me somewhere I can legally fish within
> 30 minutes, tell me what I need to buy first, what's likely to be biting, and the
> rig and bait to catch it."

## Features, in priority order — 1–3 are the product, 4 is extra

### 1. Nearby venues, on a proper interactive map

- Request geolocation, with a manual postcode / place-name fallback for when it's
  denied or unavailable.
- **Search by name, not just by location.** One box takes a postcode, a town, or the name
  of a water — "Twynersh Fishery", "Bluebell Lakes", "River Wye". A postcode moves the
  search area; anything else searches waters by name across the whole UK, built-in list
  first and then OpenStreetMap on request. Partial names and single words must work.
- List fishable waters within a user-set radius (default 25 miles), sorted by distance
  or by rating. Each row shows: name, water type (stillwater / river / canal /
  reservoir / coastal), star rating, distance, day-ticket price, the headline species,
  and whether it's fishable right now.
- **The map is the centrepiece, and it must be genuinely interactive** — not a static
  image with dots on it:
  - Drag to pan, pinch and wheel to zoom, double-tap to zoom in, with a "recentre on
    me" control and a ring showing the current search radius.
  - Pins are colour-coded by water type and carry their star rating, so the map is
    scannable at a glance. Pins that overlap at low zoom collapse into a count bubble
    that expands as you zoom in.
  - Tapping a pin raises a **preview sheet** over the map: name, rating and review
    count, distance and drive estimate, today's total cost, top three species with
    their likelihood right now, facility icons, and buttons for full details and
    directions. Tapping the map dismisses it.
  - The selected pin and its list row stay in sync in both directions.
  - Do not depend on a third-party mapping library — draw the OpenStreetMap tiles and
    the whole interaction layer directly.
- **Ratings and venue character.** Each venue carries a star rating out of 5 and the
  detail behind it: stock quality, access, facilities and value, plus how busy it
  typically is and how hard the fishing is. Anglers can rate a venue themselves and
  their own rating is shown alongside — and clearly distinguished from — the seeded
  one. Once they've logged catches, show their personal hit rate at that water too.
  Seeded ratings are editorial and indicative, and the UI must say so.
- Facilities, shown as icons and filterable: parking, toilets, on-site tackle and bait,
  café, disabled-accessible pegs, night fishing, dogs allowed, and whether a bailiff
  is on the bank.
- Filters: water type, maximum day-ticket price, minimum rating, facilities, and
  "hide venues I can't fish today".
- **Ask what kind of session they want, not just where they are.** "Where do I go to catch
  a lot" and "where do I go for a big one" are different questions and a star rating answers
  neither. Every water carries a character — bags of fish, big-fish water, mixed, wild and
  quiet, or stocked game — shown as a badge on the list and explained on the venue page, with
  a one-tap chooser that reorders the results around what the angler is actually after.
  Derive it from what's known (type, stock, species) rather than inventing it, and leave it
  blank for waters nothing is known about instead of guessing.

### 1a. When the data source fails, say so

Nearby discovery leans on a free, shared, heavily rate-limited service. Treat that as the
normal case, not the exception:

- Split the lookup so the cheap "explicitly tagged as fished" query is separate from the
  expensive "every named water" one, and paint results as soon as the first lands. A slow
  second query must never take the fisheries down with it.
- Give the client a longer timeout than the server-side query timeout — aborting first means
  the server was never allowed the time its own query asked for.
- Try several mirrors before giving up.
- Never present a failed lookup as an empty map. Say which part failed, offer a retry, and
  keep a plain-English diagnostics panel showing what the last search actually did.

### 2. Licences and cost

- For every venue show a "Before you cast" panel that answers *what do I legally need,
  and what does today cost me*:
  - **Rod licence** — the Environment Agency licence needed for freshwater fishing in
    England and Wales, with real 1-day / 8-day / annual prices, concession and junior
    rates, and a link to the GOV.UK purchase page. Handle the other cases properly
    rather than pretending the whole UK is one rule: Scotland needs no rod licence for
    coarse and trout but does need the owner's written permission for salmon and sea
    trout; Northern Ireland needs both a DAERA/Loughs Agency licence and a permit; sea
    fishing needs no rod licence anywhere in GB.
  - **Venue permission** — day ticket, club book, or syndicate/private, with the price
    and where to buy it (bailiff on the bank, online in advance, tackle shop).
  - **Total for today** — one summed figure, e.g. "£12.80 to fish here today: £7.30
    1-day rod licence + £5.50 day ticket". If the angler has saved an in-date annual
    licence in their profile, the licence line drops to £0 and the total follows.
- Show the statutory **close season** (15 March – 15 June inclusive on rivers, streams
  and drains in England and Wales) and grey out venues where fishing is prohibited today,
  with the reason.
- Licence prices change every April. Keep them in one clearly-dated place in the data
  layer, and let the angler override them in-app if they've gone stale.

### 3. Species and tactics — the part that earns the app

- Per venue, list the species present with a *likelihood today* rating, computed from
  month, water type, air/water temperature, time of day and recent conditions. Never
  show a static list.
- Tapping a species opens a tactics card:
  - **Rig** — a labelled diagram, drawn as SVG, not a photo. Diagrams should be
    generated from a shared component vocabulary (line, swivel, bead, lead, feeder,
    float, hooklength, hook, bait) so every rig is drawn in one consistent visual language.
  - **How to tie it** — numbered steps for building the rig, each with its own picture:
    the same diagram drawn with only the components fitted so far, the newest ones picked
    out, so the illustration builds up as you work down the instructions. Steps must never
    show fewer components than the step before.
  - **The knots** — a step-by-step drawn guide to every knot the rigs call for, tappable
    from the step that needs it. Draw them as staged SVG illustrations with proper
    over/under crossings, not photographs, and give each one its rough breaking strain.
  - **Terminal tackle** — hook size, line and hooklength breaking strain.
  - **Baits** — top three, ranked, with a one-line "why this, now".
  - **Where and how** — depth, swim choice, and how to fish it.
- Tactics adapt to conditions. Cold clear water, coloured floodwater and a warm summer
  dawn should not produce the same advice for the same fish.

### 4. Extras, only once 1–3 genuinely work

- Weather and barometric-pressure panel for the next 48 hours, with a transparent
  **bite score** — always show the reasoning ("pressure falling 4 mb, overcast, mild:
  good"), never a bare number.
- Personal catch log: species, weight, bait, rig, notes, auto-stamped with venue,
  date and the conditions at the time. Show what's actually working for this angler.
- Full offline use — riverbanks have no signal. Cache the app shell and the last set
  of results; degrade to cached data with a visible "offline" state rather than failing.

## Data

- No paid APIs, no API keys, no backend. Everything runs client-side and can be hosted
  on GitHub Pages as a static site.
- Use these keyless sources: **postcodes.io** for postcode and reverse geocoding,
  **Overpass / OpenStreetMap** to discover real waters near the angler, and
  **Open-Meteo** for forecast and pressure.
- Ship a curated seed list of well-known UK venues carrying the things OSM can't tell
  you — day-ticket price, species, facilities, rules and a starting rating.
- **Be honest about provenance.** Curated prices and ratings are indicative and must be
  labelled as such — a seeded rating is an editorial starting point, not a review score
  from real anglers, and must never be dressed up as one. OSM-discovered waters must be
  labelled as unverified for access and permission.
  Never state a price or a legal permission as certain when it isn't. Let the angler
  correct any venue locally and add their own.

## Non-negotiables

- Nothing invented and presented as fact — especially prices, licence rules and close
  seasons. Where a value is an estimate, the UI says so.
- Legal information is advisory: show a standing reminder to check local byelaws.
- All data stays on the device. No accounts, no analytics, no third-party requests
  beyond the three data sources above.
- Mobile-first, dark theme, one-handed reachable, large tap targets — this is used
  outdoors in the cold.
- Accessible: real semantic HTML, keyboard-navigable, screen-reader labels on icon
  buttons, and readable in bright sunlight.
