/* Cast — static reference data: licences, species, rigs, baits and the seed venue list.

   Provenance rules for everything in this file:
   - Licence prices are the published Environment Agency rates and carry the date they
     were last checked. They change every April; the app lets the angler override them.
   - Venue day-ticket prices and ratings are INDICATIVE editorial values, not quotes and
     not review scores. The UI must label them as such. `checked` is when the entry was
     last looked at, not a guarantee the fishery hasn't changed its prices since.
   - Anything the app cannot stand behind is `null`, which renders as "not recorded",
     rather than a plausible-looking made-up number. */
(function (G) {
  'use strict';

  /* ------------------------------------------------------------------ licences */

  /* Environment Agency rod licence, England and Wales. Prices reviewed each April. */
  const LICENCE = {
    checked: '2026-04-01',
    source: 'https://www.gov.uk/fishing-licences',
    buyUrl: 'https://www.gov.uk/fishing-licences/buy-a-fishing-licence',
    freeDayUrl: 'https://takeafriendfishing.co.uk/',
    /* id: [label, 1-day, 8-day, annual, concession annual (66+ / disabled), junior 13-16] */
    types: [
      { id: 'coarse2', label: 'Trout, coarse and eel — 2 rods',
        day: 7.30, week: 14.70, year: 36.80, concession: 24.50, junior: 0 },
      { id: 'coarse3', label: 'Trout, coarse and eel — 3 rods',
        day: null, week: null, year: 55.30, concession: null, junior: 0 },
      { id: 'salmon', label: 'Salmon and sea trout',
        day: 7.30, week: 14.70, year: 90.40, concession: null, junior: 0 }
    ],
    notes: [
      'A licence is needed from age 13. Under-13s do not need one.',
      'Anglers aged 13 to 16 fish free but must still register for a £0 licence.',
      'One licence covers England and Wales, and the Border Esk in Scotland.',
      'A rod licence is only permission to fish — you still need the owner’s permission for the water itself.'
    ]
  };

  /* What the law asks for, by country. Sea fishing needs no rod licence anywhere in GB. */
  const REGIONS = {
    England: {
      licence: 'ea',
      body: 'Environment Agency',
      riverCloseSeason: true,
      note: 'EA rod licence required for freshwater fishing from age 13.'
    },
    Wales: {
      licence: 'ea',
      body: 'Natural Resources Wales / Environment Agency',
      riverCloseSeason: true,
      note: 'The EA rod licence covers Wales. Some Welsh rivers carry extra byelaws for salmon and sea trout.'
    },
    Scotland: {
      licence: 'none',
      body: 'District Salmon Fishery Boards',
      riverCloseSeason: false,
      note: 'No rod licence exists in Scotland for coarse fish or trout — but you always need the owner’s permission, ' +
            'and fishing for salmon or sea trout without written permission is a criminal offence.'
    },
    'Northern Ireland': {
      licence: 'ni',
      body: 'DAERA / Loughs Agency',
      riverCloseSeason: false,
      note: 'Northern Ireland needs both a rod licence (DAERA or Loughs Agency, depending on the water) ' +
            'and a separate fishing permit. Prices are set separately from the EA — check before you travel.'
    }
  };

  /* Statutory coarse close season, England and Wales: 15 March to 15 June inclusive,
     on rivers, streams and drains. Most stillwaters and many canals are exempt. */
  const CLOSE_SEASON = {
    startMonth: 3, startDay: 15,
    endMonth: 6, endDay: 15,
    appliesTo: ['river'],
    label: '15 March – 15 June',
    note: 'Statutory coarse close season on rivers, streams and drains in England and Wales. ' +
          'Stillwaters and most canals stay open, but individual fisheries can set their own closures.'
  };

  /* ---------------------------------------------------------------------- rigs */

  /* Rigs are described as components on a line, not drawn by hand. `p` is the position
     along the line from rod (0) to hook (1); the renderer in ui.js turns this into SVG.
     Keeping one vocabulary means every diagram in the app reads the same way. */
  const RIG_PARTS = ['line', 'float', 'shot', 'stop', 'bead', 'swivel', 'lead', 'feeder',
                     'sleeve', 'hook', 'bait', 'boom', 'blade', 'fly', 'clip'];

  const rig = (id, name, style, use, parts, tips) => ({ id, name, style, use, parts, tips });

  const RIGS = [
    rig('hair-bolt', 'Hair rig on a running lead', 'ledger',
      'The default carp presentation: the fish takes the bait, feels the lead, and hooks itself.',
      [
        { t: 'lead', p: 0.58, label: '2–3 oz running lead' },
        { t: 'bead', p: 0.66, label: 'Rubber shock bead' },
        { t: 'swivel', p: 0.70, label: 'Quick-change swivel' },
        { t: 'sleeve', p: 0.76, label: '20 cm coated braid hooklink' },
        { t: 'hook', p: 0.93, label: 'Size 8–4 wide gape' },
        { t: 'bait', p: 1.0, label: 'Boilie on a hair' }
      ],
      ['Leave the hair long enough that the bait sits a few millimetres clear of the hook bend.',
       'The lead must run free — if a carp snaps you off, the fish has to be able to shed it.']),

    rig('method', 'Method feeder', 'ledger',
      'Bait and feed land as one parcel. Hard to beat on commercial stillwaters.',
      [
        { t: 'feeder', p: 0.62, label: 'Flatbed method feeder, 30–45 g' },
        { t: 'swivel', p: 0.72, label: 'Quick-change bead' },
        { t: 'sleeve', p: 0.78, label: '10–15 cm hooklength' },
        { t: 'hook', p: 0.94, label: 'Size 14–10 barbless' },
        { t: 'bait', p: 1.0, label: 'Banded pellet or corn' }
      ],
      ['Short hooklink is the whole point — 10 cm hooks fish, 30 cm does not.',
       'Mould the groundbait damp enough to survive the cast and no damper.']),

    rig('maggot-feeder', 'Groundbait or maggot feeder', 'ledger',
      'Puts a steady trickle of feed exactly where the hookbait is. Bream and skimmers.',
      [
        { t: 'feeder', p: 0.60, label: 'Cage or open-end feeder' },
        { t: 'swivel', p: 0.70, label: 'Link swivel' },
        { t: 'sleeve', p: 0.78, label: '60–90 cm hooklength' },
        { t: 'hook', p: 0.94, label: 'Size 16–12' },
        { t: 'bait', p: 1.0, label: 'Double maggot or worm tip' }
      ],
      ['Cast to the same spot every time — clip up on the reel and pick a far-bank marker.',
       'Lengthen the hooklink when bites dry up; shorten it when they come fast.']),

    rig('helicopter', 'Helicopter feeder rig', 'ledger',
      'Hooklink spins clear of the feeder in flight, so it tangles far less at range.',
      [
        { t: 'feeder', p: 0.55, label: 'Inline feeder' },
        { t: 'bead', p: 0.63, label: 'Top stop bead' },
        { t: 'swivel', p: 0.67, label: 'Hooklink swivel on the leader' },
        { t: 'bead', p: 0.71, label: 'Bottom stop bead' },
        { t: 'sleeve', p: 0.80, label: 'Hooklength' },
        { t: 'hook', p: 0.94, label: 'Size 14–10' },
        { t: 'bait', p: 1.0, label: 'Pellet, corn or worm' }
      ],
      ['Set the stop beads so the hooklink can rotate freely between them.',
       'The go-to when a straight feeder rig keeps coming back in a birds nest.']),

    rig('running-ledger', 'Running ledger', 'ledger',
      'Simple, sensitive, and the right answer on rivers. Chub, barbel, flounder.',
      [
        { t: 'lead', p: 0.55, label: 'Running lead or feeder on a link' },
        { t: 'bead', p: 0.64, label: 'Buffer bead' },
        { t: 'swivel', p: 0.68, label: 'Swivel' },
        { t: 'sleeve', p: 0.78, label: '45–90 cm hooklength' },
        { t: 'hook', p: 0.94, label: 'Size 12–6' },
        { t: 'bait', p: 1.0, label: 'Meat, bread, pellet or worm' }
      ],
      ['Use just enough lead to hold bottom and no more — feel the rig settle, then set the rod down.',
       'In coloured water, fish it tight to the near bank rather than casting across.']),

    rig('paternoster', 'Running paternoster', 'ledger',
      'Holds a live or dead bait just off the bottom. Perch, zander and estuary fish.',
      [
        { t: 'swivel', p: 0.52, label: 'Three-way swivel' },
        { t: 'lead', p: 0.72, label: 'Lead on a weak dropper link' },
        { t: 'boom', p: 0.62, label: '30 cm hook link off the swivel' },
        { t: 'hook', p: 0.88, label: 'Size 8–4 or a small treble' },
        { t: 'bait', p: 0.96, label: 'Small deadbait or lobworm' }
      ],
      ['Make the lead link the weakest part of the rig so a snag costs you a lead, not the fish.',
       'For zander, fish it at dusk and give slack line before striking.']),

    rig('zig', 'Zig rig', 'ledger',
      'Presents a tiny buoyant bait in mid-water, where carp actually sit in warm weather.',
      [
        { t: 'lead', p: 0.30, label: 'Lead on the deck' },
        { t: 'swivel', p: 0.34, label: 'Swivel' },
        { t: 'sleeve', p: 0.60, label: 'Long zig hooklink, set to depth' },
        { t: 'hook', p: 0.92, label: 'Size 12–10 wide gape' },
        { t: 'bait', p: 1.0, label: 'Foam or a zig bug' }
      ],
      ['Start at two-thirds of the way up the water column and adjust from there.',
       'Best from late spring through summer, and useless in cold water.']),

    rig('surface-controller', 'Surface controller', 'float',
      'Floating bait at range for carp and rudd feeding on top.',
      [
        { t: 'float', p: 0.30, label: 'Controller float' },
        { t: 'swivel', p: 0.40, label: 'Swivel' },
        { t: 'sleeve', p: 0.60, label: '1–1.5 m clear mono hooklink' },
        { t: 'hook', p: 0.92, label: 'Size 10–8' },
        { t: 'bait', p: 1.0, label: 'Floating pellet, crust or dog biscuit' }
      ],
      ['Sink the line between float and rod tip or the fish will spook off it.',
       'Feed a dozen free offerings and wait for confident takes before you cast.']),

    rig('waggler', 'Waggler float', 'float',
      'The all-rounder for stillwaters and slow rivers, fished at range.',
      [
        { t: 'float', p: 0.12, label: 'Insert waggler, locked with shot' },
        { t: 'shot', p: 0.14, label: 'Bulk locking shot' },
        { t: 'shot', p: 0.58, label: 'No.8 dropper shot' },
        { t: 'shot', p: 0.76, label: 'No.10 tell-tale shot' },
        { t: 'hook', p: 0.93, label: 'Size 20–14' },
        { t: 'bait', p: 1.0, label: 'Maggot, caster or corn' }
      ],
      ['Set it dead depth first, then shallow up until you find the fish.',
       'Two thirds of the shot goes round the float — the rest is for presentation.']),

    rig('stick', 'Stick float / trotting', 'float',
      'Running water, bait moving at the pace of the current. Roach, dace, chub, grayling.',
      [
        { t: 'float', p: 0.10, label: 'Stick float, double rubber' },
        { t: 'shot', p: 0.36, label: 'Shirt-button No.6s' },
        { t: 'shot', p: 0.56, label: 'No.8' },
        { t: 'shot', p: 0.74, label: 'No.10' },
        { t: 'hook', p: 0.93, label: 'Size 20–16' },
        { t: 'bait', p: 1.0, label: 'Single or double maggot' }
      ],
      ['Hold the float back hard every few yards — the bait lifts and that is when it goes under.',
       'Feed a small pinch of maggots every single cast to hold the shoal in the swim.']),

    rig('pole-rig', 'Pole rig', 'float',
      'Total control over a short line. Unbeatable for small fish and canal work.',
      [
        { t: 'float', p: 0.14, label: '0.2–0.5 g pole float' },
        { t: 'shot', p: 0.44, label: 'Bulk olivette' },
        { t: 'shot', p: 0.70, label: 'Two No.10 droppers' },
        { t: 'hook', p: 0.93, label: 'Size 22–16' },
        { t: 'bait', p: 1.0, label: 'Pinkie, maggot or punch' }
      ],
      ['Match the elastic to the fish, not the float — too stiff and you bump them off.',
       'Ship out, lower the rig in, and only then start feeding.']),

    rig('lift', 'Lift method', 'float',
      'Bite indication by the float rising. Deadly for tench and crucians in the margins.',
      [
        { t: 'float', p: 0.14, label: 'Peacock quill, bottom-end only' },
        { t: 'shot', p: 0.80, label: 'Single AAA shot 5 cm from the hook' },
        { t: 'hook', p: 0.93, label: 'Size 16–12' },
        { t: 'bait', p: 1.0, label: 'Worm, corn or bread' }
      ],
      ['Over-depth by a few centimetres and tighten until the float cocks.',
       'If the float lifts and lies flat, strike — that fish already has the bait.']),

    rig('pike-float-deadbait', 'Float-legered deadbait', 'float',
      'The safest, most effective way to present a deadbait for pike.',
      [
        { t: 'float', p: 0.14, label: 'Sliding pike float' },
        { t: 'bead', p: 0.34, label: 'Bead' },
        { t: 'lead', p: 0.42, label: '20–30 g running lead' },
        { t: 'swivel', p: 0.50, label: 'Swivel' },
        { t: 'sleeve', p: 0.66, label: '45 cm, 28 lb wire trace' },
        { t: 'hook', p: 0.88, label: 'Two size 6 semi-barbless trebles' },
        { t: 'bait', p: 1.0, label: 'Smelt, sardine or mackerel tail' }
      ],
      ['Wire trace every single time. Mono is how pike get left with hooks in them.',
       'Strike as soon as the float goes — never let a pike run and swallow the bait.',
       'On the bank before you cast: unhooking mat, long forceps, wire cutters. No kit, no fishing.']),

    rig('pike-lure', 'Lure on a wire trace', 'lure',
      'Cover water and find the active fish. Pike, perch and pollack.',
      [
        { t: 'clip', p: 0.40, label: 'Snap link' },
        { t: 'sleeve', p: 0.56, label: '30 cm, 20–28 lb wire or fluoro trace' },
        { t: 'swivel', p: 0.70, label: 'Swivel to kill line twist' },
        { t: 'blade', p: 0.92, label: 'Spinner, spoon or shallow crank' }
      ],
      ['Vary the retrieve until something takes — steady, then twitch, then pause.',
       'Barbless or crushed-barb trebles come out in seconds and save fish.']),

    rig('dropshot', 'Drop shot', 'lure',
      'Bait hovers above the weight and stays in the strike zone with no movement at all.',
      [
        { t: 'hook', p: 0.62, label: 'Size 4–1 drop shot hook, palomar knot' },
        { t: 'bait', p: 0.68, label: 'Small soft plastic, nose-hooked' },
        { t: 'lead', p: 1.0, label: '5–15 g drop shot weight' }
      ],
      ['Set the tag 20–40 cm long: that is how high off the bottom the lure sits.',
       'Shake the rod tip while the weight stays put — that quiver is what triggers perch.']),

    rig('fly-dry', 'Dry fly leader', 'lure',
      'Floating line, tapered leader, fly on the surface. Trout and grayling.',
      [
        { t: 'line', p: 0.30, label: 'Floating fly line' },
        { t: 'sleeve', p: 0.60, label: '9 ft tapered leader' },
        { t: 'sleeve', p: 0.80, label: '2–3 ft tippet, 3–5 lb' },
        { t: 'fly', p: 1.0, label: 'Dry fly matched to the hatch' }
      ],
      ['Degrease the tippet so it sinks and stops leaving a wake.',
       'Cast above the fish and let the fly come to it — never line a rising trout.']),

    rig('fly-nymph', 'Nymph / duo', 'lure',
      'A dry fly as the indicator with a nymph hung below it. Covers both layers at once.',
      [
        { t: 'line', p: 0.26, label: 'Floating fly line' },
        { t: 'sleeve', p: 0.52, label: '9 ft tapered leader' },
        { t: 'fly', p: 0.68, label: 'Buoyant dry as the indicator' },
        { t: 'sleeve', p: 0.84, label: '60–120 cm dropper' },
        { t: 'fly', p: 1.0, label: 'Weighted nymph' }
      ],
      ['Set the dropper to roughly one and a half times the water depth in fast runs.',
       'Any hesitation of the dry is a take — lift, do not strike hard.']),

    rig('pulley', 'Pulley rig', 'ledger',
      'Sea rig for rough ground: the lead lifts on the retrieve and rides clear of snags.',
      [
        { t: 'clip', p: 0.40, label: 'Rig body with pulley bead' },
        { t: 'lead', p: 0.62, label: 'Grip lead on a weak link' },
        { t: 'sleeve', p: 0.72, label: '60 cm 60 lb rig body' },
        { t: 'hook', p: 0.92, label: 'Size 4/0–6/0 pennell' },
        { t: 'bait', p: 1.0, label: 'Lugworm and squid wrap' }
      ],
      ['Use a rotten-bottom link on the lead so a snagged weight breaks free, not your rig.',
       'Cod and conger over broken ground — the rig that stops you losing everything.']),

    rig('flapper', 'Two-hook flapper', 'ledger',
      'Two baits, two chances. The standard beach rig for whiting, dabs and dogfish.',
      [
        { t: 'clip', p: 0.36, label: 'Rig body' },
        { t: 'boom', p: 0.52, label: 'Upper snood, 25 cm' },
        { t: 'boom', p: 0.68, label: 'Lower snood, 25 cm' },
        { t: 'lead', p: 0.82, label: '4–6 oz grip lead' },
        { t: 'hook', p: 0.94, label: 'Two size 1–2/0 Aberdeens' },
        { t: 'bait', p: 1.0, label: 'Ragworm, squid or mackerel strip' }
      ],
      ['Short casts only — flappers fly badly. Clip down if you need distance.',
       'Leave it 10 minutes between casts; whiting find bait fast, dabs do not.']),

    rig('sea-float', 'Sliding sea float', 'float',
      'Mackerel, garfish and mullet off piers, rocks and harbour walls.',
      [
        { t: 'stop', p: 0.10, label: 'Sliding stop knot, set to depth' },
        { t: 'float', p: 0.22, label: 'Sliding float' },
        { t: 'bead', p: 0.32, label: 'Bead' },
        { t: 'shot', p: 0.44, label: 'Drilled bullet to cock the float' },
        { t: 'swivel', p: 0.56, label: 'Swivel' },
        { t: 'hook', p: 0.92, label: 'Size 4–1 for mackerel, 8–10 for mullet' },
        { t: 'bait', p: 1.0, label: 'Mackerel strip, ragworm or bread' }
      ],
      ['Set shallow for mackerel — 4 to 6 feet is usually plenty.',
       'For mullet, scale everything down and expect to be ignored for an hour first.'])
  ];

  /* --------------------------------------------------------------------- knots */

  /* Knots are drawn, not photographed. Each stage is a list of primitives in a 200×108
     space that ui.js renders as SVG: `line` paths are stroked with a casing first, so a
     path drawn later reads as passing OVER the one beneath it — which is the whole trick
     to making a knot legible as a picture. */
  const knot = (id, name, use, strength, stages, notes) => ({ id, name, use, strength, stages, notes });

  const KNOTS = [
    knot('palomar', 'Palomar knot', 'Hook or swivel. The strongest simple knot there is.', 'about 95%',
      [
        { cap: 'Double 15 cm of line and pass the loop through the eye.',
          art: [{ t: 'eye', x: 152, y: 54 }, { t: 'double', d: 'M14 54 H140' }, { t: 'arrow', d: 'M108 28 H154' }] },
        { cap: 'Tie a loose overhand knot with the doubled line. Do not pull it up yet.',
          art: [{ t: 'eye', x: 152, y: 54 }, { t: 'double', d: 'M14 54 H88' },
                { t: 'double', d: 'M88 54 C52 22 52 86 92 62 C112 52 130 54 140 54' },
                { t: 'label', x: 62, y: 96, text: 'keep it loose' }] },
        { cap: 'Pass the loop right over the hook, then wet it and pull both ends together.',
          art: [{ t: 'hook', x: 148, y: 44 }, { t: 'double', d: 'M14 54 H80' },
                { t: 'double', d: 'M80 54 C60 26 60 84 96 74' },
                { t: 'line', d: 'M96 74 C124 84 156 78 156 62' },
                { t: 'arrow', d: 'M112 96 C136 100 158 92 160 74' }] }
      ],
      'Never let the loop wrap the hook point as you seat it — check it sits above the eye before you pull.'),

    knot('grinner', 'Grinner (uni) knot', 'Hook, swivel or lead clip. The all-rounder.', 'about 90%',
      [
        { cap: 'Through the eye, then lay the tag back alongside the standing line.',
          art: [{ t: 'eye', x: 152, y: 54 }, { t: 'line', d: 'M14 54 H140' },
                { t: 'line', d: 'M152 62 C120 78 90 74 66 70', tag: true }] },
        { cap: 'Turn the tag back to make a loop, and take five turns through it around both lines.',
          art: [{ t: 'eye', x: 152, y: 54 }, { t: 'line', d: 'M14 54 H140' },
                { t: 'line', d: 'M152 62 C126 84 74 86 62 66', tag: true },
                { t: 'coil', x: 76, y: 54, n: 5, step: 13 }] },
        { cap: 'Wet it, pull the tag to close the coils, then slide the whole knot down to the eye.',
          art: [{ t: 'eye', x: 152, y: 54 }, { t: 'line', d: 'M14 54 H108' },
                { t: 'coil', x: 112, y: 54, n: 5, step: 7 },
                { t: 'line', d: 'M148 54 H152' },
                { t: 'arrow', d: 'M100 84 H146' }] }
      ],
      'Five turns for mono up to 10 lb, four for anything heavier — more turns will not seat properly.'),

    knot('clinch', 'Improved clinch', 'Hook or swivel in mono. Quick, and everyone knows it.', 'about 85%',
      [
        { cap: 'Through the eye, then twist the tag six times around the standing line.',
          art: [{ t: 'eye', x: 152, y: 54 }, { t: 'line', d: 'M14 54 H140' },
                { t: 'coil', x: 70, y: 54, n: 6, step: 11 },
                { t: 'line', d: 'M152 62 C132 74 76 72 64 62', tag: true }] },
        { cap: 'Pass the tag back through the small loop right by the eye.',
          art: [{ t: 'eye', x: 152, y: 54 }, { t: 'line', d: 'M14 54 H140' },
                { t: 'coil', x: 70, y: 54, n: 6, step: 11 },
                { t: 'line', d: 'M64 62 C90 82 130 82 138 62', tag: true },
                { t: 'arrow', d: 'M150 86 C146 74 142 68 138 62' }] },
        { cap: 'Then back through the big loop you just made. Wet it and pull tight.',
          art: [{ t: 'eye', x: 152, y: 54 }, { t: 'line', d: 'M14 54 H140' },
                { t: 'coil', x: 70, y: 54, n: 6, step: 11 },
                { t: 'line', d: 'M138 62 C120 92 74 88 58 70', tag: true },
                { t: 'label', x: 62, y: 100, text: 'wet before tightening' }] }
      ],
      'Do not use it in braid — it slips. Braid wants a palomar.'),

    knot('knotless', 'Knotless knot (the hair rig)', 'Hair rigs. The one carp knot worth learning properly.', 'about 90%',
      [
        { cap: 'Tie a small loop in the end of the hooklink. That loop carries the bait.',
          art: [{ t: 'line', d: 'M14 54 H120' },
                { t: 'line', d: 'M120 54 C142 40 162 48 158 58 C154 68 132 66 120 54' },
                { t: 'label', x: 132, y: 88, text: 'bait loop' }] },
        { cap: 'Thread the other end through the BACK of the hook eye, and slide it to set the hair length.',
          art: [{ t: 'hook', x: 120, y: 40, big: true },
                { t: 'line', d: 'M14 34 H112' },
                { t: 'line', d: 'M120 40 C140 52 154 62 156 76' },
                { t: 'line', d: 'M156 76 C168 70 172 82 160 88 C150 92 146 84 156 76' },
                { t: 'arrow', d: 'M92 16 H118' }] },
        { cap: 'Whip seven or eight tight turns down the shank, trapping the hair against it.',
          art: [{ t: 'hook', x: 120, y: 40, big: true },
                { t: 'line', d: 'M14 34 H100' },
                { t: 'coil', x: 104, y: 40, n: 7, step: 6, vertical: true },
                { t: 'line', d: 'M120 76 C138 82 150 84 156 82' }] },
        { cap: 'Pass the end back out through the FRONT of the eye and pull it down tight.',
          art: [{ t: 'hook', x: 120, y: 40, big: true },
                { t: 'coil', x: 104, y: 40, n: 7, step: 6, vertical: true },
                { t: 'line', d: 'M14 34 H112' },
                { t: 'arrow', d: 'M150 20 C136 24 126 30 120 38' },
                { t: 'label', x: 34, y: 100, text: 'front, not back' }] }
      ],
      'The hair must leave the shank level with the hook point. Too high and it will not turn in the fish’s mouth.'),

    knot('loop-loop', 'Loop to loop', 'Joining a hooklink to a leader, with no tools.', 'about 80%',
      [
        { cap: 'Pass loop A through loop B.',
          art: [{ t: 'line', d: 'M14 40 H62 C88 40 88 68 62 68 H14' },
                { t: 'line', d: 'M186 40 H132 C106 40 106 68 132 68 H186' },
                { t: 'arrow', d: 'M78 92 H118' }] },
        { cap: 'Take the far end of A back through itself.',
          art: [{ t: 'line', d: 'M14 40 H70 C96 40 96 68 70 68 H14' },
                { t: 'line', d: 'M186 54 C150 54 120 40 84 54 C120 68 150 54 186 54' }] },
        { cap: 'Pull steadily. It should seat as a neat square, not a lark’s head.',
          art: [{ t: 'line', d: 'M14 54 H78 C96 44 96 64 78 54' },
                { t: 'line', d: 'M186 54 H108 C90 44 90 64 108 54' },
                { t: 'label', x: 56, y: 92, text: 'square = right' }] }
      ],
      'A neat, quick join — but it is the weakest link in any rig, so check it after every fish.'),

    knot('fig8', 'Figure-of-eight loop', 'A loop in the end of a hooklink or lead link.', 'about 80%',
      [
        { cap: 'Double the line back on itself to make a loop.',
          art: [{ t: 'double', d: 'M14 54 H110' }, { t: 'line', d: 'M110 54 C150 34 172 74 128 66' }] },
        { cap: 'Give the doubled line one extra twist, then pass the loop through.',
          art: [{ t: 'double', d: 'M14 54 H86' },
                { t: 'line', d: 'M86 54 C118 28 156 44 146 62 C138 78 100 76 92 62' },
                { t: 'arrow', d: 'M112 96 C128 88 138 76 142 66' }] },
        { cap: 'Wet it and pull. A neat, quick loop that does not slip.',
          art: [{ t: 'double', d: 'M14 54 H96' }, { t: 'line', d: 'M96 54 C118 40 150 48 150 54 C150 60 118 68 96 54' }] }
      ],
      'Quicker than a surgeon’s loop and easier to see when it has gone wrong.'),

    knot('double-grinner', 'Double grinner', 'Joining two lines of similar diameter.', 'about 85%',
      [
        { cap: 'Overlap the two lines, facing opposite ways.',
          art: [{ t: 'line', d: 'M14 48 H150' }, { t: 'line', d: 'M186 60 H50', tag: true }] },
        { cap: 'Tie a grinner with each tag around the other line — four turns each.',
          art: [{ t: 'line', d: 'M14 48 H150' }, { t: 'line', d: 'M186 60 H50', tag: true },
                { t: 'coil', x: 56, y: 54, n: 4, step: 11 }, { t: 'coil', x: 118, y: 54, n: 4, step: 11 }] },
        { cap: 'Pull the two standing lines apart so the knots slide together.',
          art: [{ t: 'line', d: 'M14 54 H76' }, { t: 'coil', x: 80, y: 54, n: 4, step: 7 },
                { t: 'coil', x: 110, y: 54, n: 4, step: 7 }, { t: 'line', d: 'M140 54 H186' },
                { t: 'arrow', d: 'M60 86 H14' }, { t: 'arrow', d: 'M140 86 H186' }] }
      ],
      'For very different diameters use an albright instead — a double grinner will bite into the thinner line.'),

    knot('water-knot', 'Four-turn water knot', 'Making a dropper on a leader — fly casts and paternosters.', 'about 80%',
      [
        { cap: 'Overlap the two line ends by about 15 cm.',
          art: [{ t: 'line', d: 'M14 48 H150' }, { t: 'line', d: 'M186 60 H50' }] },
        { cap: 'Form a loop with both, and pass both ends through it four times.',
          art: [{ t: 'line', d: 'M14 48 H104' }, { t: 'line', d: 'M186 60 H104' },
                { t: 'line', d: 'M104 48 C64 30 60 84 104 66' },
                { t: 'coil', x: 76, y: 54, n: 4, step: 11 }] },
        { cap: 'Wet and pull all four ends. The dropper is the tag pointing back down the leader.',
          art: [{ t: 'line', d: 'M14 54 H84' }, { t: 'coil', x: 88, y: 54, n: 4, step: 8 },
                { t: 'line', d: 'M122 54 H186' },
                { t: 'line', d: 'M110 60 C118 82 128 92 140 98', tag: true },
                { t: 'label', x: 118, y: 26, text: 'dropper' }] }
      ],
      'Take the dropper from the tag that points back towards the fly line, or it will tangle every cast.'),

    knot('albright', 'Albright knot', 'Braid to a mono shockleader. Slim enough to go through the rings.', 'about 85%',
      [
        { cap: 'Make a loop in the thicker mono leader.',
          art: [{ t: 'line', d: 'M186 54 H110 C80 54 80 34 110 34' }] },
        { cap: 'Pass the braid through the loop and wrap ten turns back along it.',
          art: [{ t: 'line', d: 'M186 54 H110 C80 54 80 34 110 34' },
                { t: 'line', d: 'M14 70 C60 70 80 60 96 44', tag: true },
                { t: 'coil', x: 96, y: 44, n: 8, step: 9 }] },
        { cap: 'Feed the braid back out of the loop the same side it went in, and tighten slowly.',
          art: [{ t: 'line', d: 'M186 54 H120 C96 54 96 40 120 40' },
                { t: 'coil', x: 104, y: 47, n: 8, step: 8 },
                { t: 'line', d: 'M14 70 C60 70 84 62 100 52', tag: true },
                { t: 'arrow', d: 'M150 88 C140 76 132 66 124 58' }] }
      ],
      'Tighten it slowly and wet it well. Braid pulled fast against mono will cut straight through it.'),

    knot('stop-knot', 'Sliding stop knot', 'Setting the depth on a sliding float.', 'grips but slides',
      [
        { cap: 'Lay a 15 cm length of power gum alongside the mainline.',
          art: [{ t: 'line', d: 'M14 48 H186' }, { t: 'line', d: 'M52 66 H140', tag: true }] },
        { cap: 'Form a loop with the gum and take five turns through it, around the mainline.',
          art: [{ t: 'line', d: 'M14 48 H186' },
                { t: 'line', d: 'M60 66 C60 88 130 88 130 66', tag: true },
                { t: 'coil', x: 74, y: 48, n: 5, step: 11 }] },
        { cap: 'Pull tight and leave 1 cm tags. It holds, but still slides when you push it.',
          art: [{ t: 'line', d: 'M14 48 H186' }, { t: 'coil', x: 86, y: 48, n: 5, step: 6 },
                { t: 'line', d: 'M104 56 V72', tag: true }, { t: 'line', d: 'M112 56 V72', tag: true },
                { t: 'arrow', d: 'M150 76 H120' }] }
      ],
      'Leave the tags long enough to grip. Trimmed flush, a stop knot will pull through the float eye.')
  ];

  /* Tying instructions per rig. `upTo` is how many components (in order down the line)
     the step diagram should show, so the picture builds up as the instructions go. */
  const RIG_STEPS = {
    'hair-bolt': [
      { do: 'Thread the lead onto the mainline, then a rubber shock bead behind it.', upTo: 2 },
      { do: 'Tie a quick-change swivel to the end of the mainline.', upTo: 3, knot: 'palomar' },
      { do: 'Cut 20 cm of coated braid and strip 3 cm of the coating off one end.', upTo: 3 },
      { do: 'Tie a small bait loop in the stripped end — that loop is the hair.', upTo: 4, knot: 'fig8' },
      { do: 'Fit the hook with a knotless knot, setting the hair so the bait will sit just under the bend.', upTo: 5, knot: 'knotless' },
      { do: 'Mount the boilie on the hair and lock it with a bait stop.', upTo: 6 },
      { do: 'Clip the hooklink to the swivel. Check the lead runs freely — if a carp snaps you off, it has to be able to shed it.', upTo: 6 }
    ],
    method: [
      { do: 'Thread the mainline through the inline feeder and out of the other end.', upTo: 1 },
      { do: 'Tie the quick-change bead onto the mainline below the feeder.', upTo: 2, knot: 'palomar' },
      { do: 'Make up a 10–15 cm hooklength with a loop at one end and the hook at the other.', upTo: 4, knot: 'grinner' },
      { do: 'Clip the hooklength onto the bead, and band the pellet onto the hook.', upTo: 5 },
      { do: 'Mould groundbait round the feeder and press the hookbait into it.', upTo: 5 }
    ],
    'maggot-feeder': [
      { do: 'Thread the feeder link onto the mainline so it runs free.', upTo: 1 },
      { do: 'Tie a link swivel to the end of the mainline to stop the feeder.', upTo: 2, knot: 'palomar' },
      { do: 'Tie a 60–90 cm hooklength with a loop one end, hook the other.', upTo: 4, knot: 'grinner' },
      { do: 'Join hooklength to swivel loop to loop.', upTo: 4, knot: 'loop-loop' },
      { do: 'Bait up, fill the feeder, and clip up so every cast lands on the same spot.', upTo: 5 }
    ],
    helicopter: [
      { do: 'Thread the inline feeder onto the mainline.', upTo: 1 },
      { do: 'Slide on the top stop bead, then the hooklink swivel, then the bottom bead.', upTo: 4 },
      { do: 'Set the two beads a couple of centimetres apart so the swivel spins freely between them.', upTo: 4 },
      { do: 'Tie the mainline to the feeder or a lead clip below.', upTo: 4, knot: 'palomar' },
      { do: 'Make up the hooklength and clip it to the swivel.', upTo: 7, knot: 'knotless' }
    ],
    'running-ledger': [
      { do: 'Thread the lead or feeder link onto the mainline.', upTo: 1 },
      { do: 'Add a buffer bead below it to protect the knot.', upTo: 2 },
      { do: 'Tie a swivel on the end of the mainline.', upTo: 3, knot: 'palomar' },
      { do: 'Tie a 45–90 cm hooklength to the other eye of the swivel.', upTo: 4, knot: 'grinner' },
      { do: 'Add the hook and bait. Check the lead slides freely.', upTo: 6, knot: 'grinner' }
    ],
    paternoster: [
      { do: 'Tie the mainline to the top eye of a three-way swivel.', upTo: 1, knot: 'palomar' },
      { do: 'Tie a 30 cm hook link to the side eye.', upTo: 2, knot: 'grinner' },
      { do: 'Tie a short dropper of weaker line to the bottom eye, and the lead to that.', upTo: 3, knot: 'grinner' },
      { do: 'Make the dropper the weakest part of the rig, so a snag costs a lead and not a fish.', upTo: 3 },
      { do: 'Add the hook and bait it. Adjust the hook link so the bait sits just off bottom.', upTo: 5 }
    ],
    zig: [
      { do: 'Work out the depth first, then set the zig at roughly two thirds of it.', upTo: 0 },
      { do: 'Set up a lead on the mainline so it sits on the bottom.', upTo: 2 },
      { do: 'Tie the long zig hooklink to the swivel.', upTo: 3, knot: 'grinner' },
      { do: 'Fit a wide gape hook and a small piece of foam.', upTo: 5, knot: 'knotless' },
      { do: 'Cast and let it settle. The rig only fishes once the lead is down and the foam has risen.', upTo: 5 }
    ],
    'surface-controller': [
      { do: 'Thread the controller float onto the mainline.', upTo: 1 },
      { do: 'Tie a swivel below it to stop the float.', upTo: 2, knot: 'palomar' },
      { do: 'Tie 1–1.5 m of clear mono to the other end of the swivel.', upTo: 3, knot: 'grinner' },
      { do: 'Add the hook and mount a floating bait.', upTo: 5, knot: 'grinner' },
      { do: 'Sink the line between float and rod tip, or the carp will spook off it.', upTo: 5 }
    ],
    waggler: [
      { do: 'Plumb the depth before you set anything up. Guessing costs you the session.', upTo: 0 },
      { do: 'Thread the waggler on and lock it with shot either side.', upTo: 2 },
      { do: 'Put roughly two thirds of the total shot round the float.', upTo: 2 },
      { do: 'Spread a dropper and a tell-tale shot down the line below it.', upTo: 4 },
      { do: 'Add the hooklength and hook, set dead depth, then shallow up until you find fish.', upTo: 6, knot: 'loop-loop' }
    ],
    stick: [
      { do: 'Fix the stick float top and bottom with float rubbers.', upTo: 1 },
      { do: 'Spread the shot shirt-button style down the line, biggest nearest the float.', upTo: 4 },
      { do: 'Set the depth so the bait just trips the bottom.', upTo: 4 },
      { do: 'Add hooklength, hook and bait.', upTo: 6, knot: 'grinner' },
      { do: 'Hold the float back hard every few yards — the bait lifts, and that is when it goes under.', upTo: 6 }
    ],
    'pole-rig': [
      { do: 'Pick a float weight to suit the depth and flow, and thread it onto the line.', upTo: 1 },
      { do: 'Set the bulk olivette about two thirds of the way down.', upTo: 2 },
      { do: 'Add two No.10 droppers below it.', upTo: 3 },
      { do: 'Tie on a short hooklength and the hook.', upTo: 5, knot: 'loop-loop' },
      { do: 'Match the elastic to the fish, not the float. Too stiff and you bump them off.', upTo: 5 }
    ],
    lift: [
      { do: 'Fix a peacock quill bottom-end only, with a float rubber.', upTo: 1 },
      { do: 'Pinch a single AAA shot about 5 cm from the hook.', upTo: 2 },
      { do: 'Set the rig slightly over depth so the shot rests on the bottom.', upTo: 2 },
      { do: 'Add the hook and bait.', upTo: 4, knot: 'grinner' },
      { do: 'Tighten until the float cocks. If it lifts and lies flat, strike.', upTo: 4 }
    ],
    'pike-float-deadbait': [
      { do: 'Get the unhooking kit out FIRST: mat, 12" forceps, wire cutters. No kit, no fishing.', upTo: 0 },
      { do: 'Thread the sliding float onto the mainline, then a bead, then the running lead.', upTo: 3 },
      { do: 'Tie a swivel below the lead.', upTo: 4, knot: 'palomar' },
      { do: 'Clip on a 45 cm, 28 lb wire trace. Always wire — never mono.', upTo: 5 },
      { do: 'Mount the deadbait on the two trebles, one in the tail root, one in the flank.', upTo: 7 },
      { do: 'Set the stop knot to fish the bait just off bottom, and strike the moment the float goes.', upTo: 7, knot: 'stop-knot' }
    ],
    'pike-lure': [
      { do: 'Tie the mainline to the snap link at the top of the trace.', upTo: 1, knot: 'palomar' },
      { do: 'Use a 30 cm wire or heavy fluorocarbon trace. Pike go through anything less.', upTo: 2 },
      { do: 'A swivel in the trace kills the line twist a spinner puts in.', upTo: 3 },
      { do: 'Clip the lure on so you can swap it in seconds.', upTo: 4 },
      { do: 'Crush the barbs before you start. They come out in seconds and save fish.', upTo: 4 }
    ],
    dropshot: [
      { do: 'Tie the hook onto the line with a palomar, leaving a long tag end.', upTo: 1, knot: 'palomar' },
      { do: 'Pass that tag back down through the hook eye so the hook stands out at right angles.', upTo: 1 },
      { do: 'Nose-hook a small soft plastic.', upTo: 2 },
      { do: 'Pinch the drop shot weight onto the tag, 20–40 cm below the hook.', upTo: 3 },
      { do: 'Shake the rod tip while the weight stays put. That quiver is what triggers perch.', upTo: 3 }
    ],
    pulley: [
      { do: 'Build the rig body from 60 lb mono with a pulley bead running on it.', upTo: 1 },
      { do: 'Attach the grip lead on a weak rotten-bottom link.', upTo: 2 },
      { do: 'Add the 60 cm snood and a pennell hook set.', upTo: 4, knot: 'grinner' },
      { do: 'Bait with lug and wrap it in squid to hold it together on the cast.', upTo: 5 },
      { do: 'On the retrieve the lead rides up and the rig comes back clear of the rough ground.', upTo: 5 }
    ],
    flapper: [
      { do: 'Cut a rig body from 60 lb mono and add two crimped snood swivels.', upTo: 1 },
      { do: 'Tie 25 cm snoods to each swivel.', upTo: 3, knot: 'grinner' },
      { do: 'Add a lead link at the bottom.', upTo: 4 },
      { do: 'Tie an Aberdeen hook to each snood.', upTo: 5, knot: 'grinner' },
      { do: 'Bait both, and keep the cast smooth — flappers fly badly, so do not try to belt it.', upTo: 6 }
    ],
    'sea-float': [
      { do: 'Slide a stop knot onto the mainline, then a small bead.', upTo: 1, knot: 'stop-knot' },
      { do: 'Thread the sliding float on, then the bead below it.', upTo: 3 },
      { do: 'Add a drilled bullet to cock the float.', upTo: 4 },
      { do: 'Tie on a swivel to stop the weight.', upTo: 5, knot: 'palomar' },
      { do: 'Add a 60 cm hooklength and the hook.', upTo: 7, knot: 'grinner' },
      { do: 'Move the stop knot to change depth — that is the whole point of fishing it sliding.', upTo: 7 }
    ],
    'fly-dry': [
      { do: 'Loop the tapered leader to the fly line loop.', upTo: 2, knot: 'loop-loop' },
      { do: 'Add 2–3 ft of tippet to the leader point.', upTo: 3, knot: 'double-grinner' },
      { do: 'Tie the fly on.', upTo: 4, knot: 'grinner' },
      { do: 'Degrease the tippet so it sinks and stops leaving a wake.', upTo: 4 }
    ],
    'fly-nymph': [
      { do: 'Loop the tapered leader to the fly line.', upTo: 2, knot: 'loop-loop' },
      { do: 'Tie on the buoyant dry fly that will act as your indicator.', upTo: 3, knot: 'grinner' },
      { do: 'Tie 60–120 cm of tippet to the BEND of the dry fly hook.', upTo: 4, knot: 'grinner' },
      { do: 'Add the weighted nymph on the end.', upTo: 5, knot: 'grinner' },
      { do: 'Set the dropper to about one and a half times the water depth in fast runs.', upTo: 5 }
    ]
  };

  RIGS.forEach((r) => { r.steps = RIG_STEPS[r.id] || []; });

  /* ------------------------------------------------------------------- species */

  /* season: 12 characters, Jan → Dec. 0 off, 1 possible, 2 good, 3 prime.
     temp:   [too cold below, comfortable from, comfortable to, too warm above] in °C.
     times:  {dawn, day, dusk, night} each 0–3.
     Water temperature is not measured — air temperature is used as a proxy and the
     engine says so rather than pretending to know what the water is doing. */
  const sp = (o) => o;

  const SPECIES = [
    sp({ id: 'carp', name: 'Carp', latin: 'Cyprinus carpio', group: 'coarse',
      waters: ['stillwater', 'canal', 'river', 'reservoir'],
      season: '112233333211', temp: [5, 14, 24, 30],
      times: { dawn: 3, day: 2, dusk: 3, night: 3 },
      rigs: ['hair-bolt', 'method', 'zig', 'surface-controller'],
      hook: 'Size 10–4', mainline: '12–15 lb', hooklength: '10–15 lb coated braid',
      baits: [
        ['Boilies, 15–18 mm', 'Selective and they survive nuisance fish all night.'],
        ['Sweetcorn', 'Cheap, visible and carp of every size eat it.'],
        ['Pellets in a bait band', 'The banker on any commercial water.']
      ],
      depth: 'Find the features — margins, overhanging trees, gravel bars, the back of an island.',
      how: 'Bait a tight spot and stay off it. Carp settle far faster than most anglers wait.',
      cold: 'Below about 8 °C drop to a single bright bait and one small handful of feed.',
      warm: 'In a warm spell go up in the water — zigs or floaters beat anything on the bottom.' }),

    sp({ id: 'crucian', name: 'Crucian carp', latin: 'Carassius carassius', group: 'coarse',
      waters: ['stillwater'],
      season: '001233332100', temp: [8, 15, 24, 28],
      times: { dawn: 3, day: 2, dusk: 3, night: 1 },
      rigs: ['lift', 'pole-rig', 'waggler'],
      hook: 'Size 18–14', mainline: '4 lb', hooklength: '2.5–3 lb',
      baits: [
        ['Sweetcorn', 'Single grain on a size 14 — the classic crucian bait.'],
        ['Paste over a maggot', 'Soft enough for their fussy, lip-only bites.'],
        ['Double red maggot', 'When they will not touch anything bigger.']
      ],
      depth: 'Shallow silty margins, 2–4 ft, tight to reeds or lilies.',
      how: 'Bites are maddening. Wait for the float to lift and lie flat, not for it to go under.',
      cold: 'Barely feed at all under 10 °C — a genuinely warm-weather fish.',
      warm: 'First and last light in high summer are the two windows worth having.' }),

    sp({ id: 'tench', name: 'Tench', latin: 'Tinca tinca', group: 'coarse',
      waters: ['stillwater', 'canal', 'reservoir'],
      season: '001233332100', temp: [8, 14, 22, 27],
      times: { dawn: 3, day: 1, dusk: 2, night: 2 },
      rigs: ['lift', 'method', 'maggot-feeder'],
      hook: 'Size 14–10', mainline: '6–8 lb', hooklength: '5–6 lb',
      baits: [
        ['Lobworm', 'Tench will move a long way for a big worm.'],
        ['Sweetcorn', 'Three grains on a size 12, over a bed of the same.'],
        ['Casters over hemp', 'The classic estate-lake approach.']
      ],
      depth: 'Silty margins and the edge of weedbeds, 3–6 ft.',
      how: 'Look for pin-prick bubbles at dawn — that is feeding tench, and it is a short window.',
      cold: 'Effectively a May-to-July fish. Out of that band, expect nothing.',
      warm: 'Be set up before it is light. By 9 am on a bright day it is usually over.' }),

    sp({ id: 'bream', name: 'Bream', latin: 'Abramis brama', group: 'coarse',
      waters: ['stillwater', 'river', 'canal', 'reservoir'],
      season: '112333332211', temp: [6, 13, 23, 28],
      times: { dawn: 3, day: 1, dusk: 3, night: 3 },
      rigs: ['maggot-feeder', 'helicopter', 'method'],
      hook: 'Size 16–10', mainline: '6 lb', hooklength: '4–5 lb',
      baits: [
        ['Worm and caster cocktail', 'Nothing sorts out big bream faster.'],
        ['Maggots over groundbait', 'Reliable when a shoal has moved in.'],
        ['Sweetcorn', 'Beats the small fish when maggots get shredded.']
      ],
      depth: 'Deepest flat area you can find, often well out.',
      how: 'Bream come in shoals and leave together. Feed heavily once you get the first bite.',
      cold: 'Slow to feed cold, but a mild grey winter day can still produce a net of them.',
      warm: 'Overnight and dawn. Rolling fish at first light tells you exactly where to cast.' }),

    sp({ id: 'roach', name: 'Roach', latin: 'Rutilus rutilus', group: 'coarse',
      waters: ['river', 'canal', 'stillwater', 'reservoir'],
      season: '222222223333', temp: [2, 8, 20, 26],
      times: { dawn: 2, day: 2, dusk: 3, night: 1 },
      rigs: ['stick', 'waggler', 'pole-rig'],
      hook: 'Size 22–16', mainline: '3 lb', hooklength: '1.5–2 lb',
      baits: [
        ['Bread punch', 'Devastating on cold, clear canals and rivers.'],
        ['Single maggot', 'The default, and it catches everywhere.'],
        ['Casters over hemp', 'Sorts the better fish out of a shoal of tiddlers.']
      ],
      depth: 'Mid-water to just off bottom — they rarely sit hard on the deck.',
      how: 'Little and often. A pinch of feed every cast keeps the shoal competing.',
      cold: 'One of the few that genuinely feed all winter — often best in the cold.',
      warm: 'Last hour of light in summer, when the small stuff finally backs off.' }),

    sp({ id: 'rudd', name: 'Rudd', latin: 'Scardinius erythrophthalmus', group: 'coarse',
      waters: ['stillwater', 'canal', 'reservoir'],
      season: '001223332100', temp: [8, 14, 24, 29],
      times: { dawn: 2, day: 2, dusk: 3, night: 0 },
      rigs: ['waggler', 'pole-rig', 'surface-controller'],
      hook: 'Size 18–14', mainline: '3 lb', hooklength: '2 lb',
      baits: [
        ['Floating bread', 'Rudd feed up — fish on top and you will find them.'],
        ['Maggot fished shallow', 'Set 30 cm deep and expect instant bites.'],
        ['Casters', 'For the better fish once small ones take over.']
      ],
      depth: 'Top 60 cm of the water. Fishing on the bottom for rudd is a wasted day.',
      how: 'Catapult a few floaters out and watch for the swirls before you cast.',
      cold: 'Almost dormant in cold water — leave them until May.',
      warm: 'Hot, still evenings are prime.' }),

    sp({ id: 'perch', name: 'Perch', latin: 'Perca fluviatilis', group: 'predator',
      waters: ['river', 'canal', 'stillwater', 'reservoir'],
      season: '332211123333', temp: [3, 8, 20, 25],
      times: { dawn: 3, day: 2, dusk: 3, night: 0 },
      rigs: ['dropshot', 'paternoster', 'waggler', 'pike-lure'],
      hook: 'Size 12–4', mainline: '6–8 lb', hooklength: '5–6 lb fluorocarbon',
      baits: [
        ['Lobworm', 'Still the best perch bait there has ever been.'],
        ['Small soft plastic on a drop shot', 'Covers water and picks off the aggressive ones.'],
        ['Prawn', 'Underrated, and big perch love it.']
      ],
      depth: 'Structure: bridges, moored boats, lock gates, overhanging trees, marina corners.',
      how: 'Perch hunt in packs. Catch one, cast straight back — there are usually more.',
      cold: 'Winter is prime. Cold, clear water and a bright day suits them fine.',
      warm: 'Dawn and dusk in summer; through the day they go deep and sulk.' }),

    sp({ id: 'pike', name: 'Pike', latin: 'Esox lucius', group: 'predator',
      waters: ['river', 'canal', 'stillwater', 'reservoir'],
      season: '333211112333', temp: [1, 4, 16, 22],
      times: { dawn: 3, day: 2, dusk: 3, night: 0 },
      rigs: ['pike-float-deadbait', 'pike-lure', 'paternoster'],
      hook: 'Two size 6 semi-barbless trebles', mainline: '15–20 lb', hooklength: '28 lb wire trace',
      baits: [
        ['Smelt or sardine deadbait', 'Oily, smelly and pike home in on them.'],
        ['Mackerel tail', 'Tough enough to stay on and cast a long way.'],
        ['Big soft plastic or spoon', 'When you want to walk and find fish.']
      ],
      depth: 'Ambush points — weedbed edges, drop-offs, slack water beside a main flow.',
      how: 'Two rods if the rules allow: one deadbait sitting still, one working lures.',
      cold: 'Cold water is pike weather. October to March is the season that matters.',
      warm: 'Do not fish for pike in warm water — they fight to exhaustion and die. Leave them.',
      warning: 'Wire trace, unhooking mat, 12" forceps and wire cutters are mandatory, not optional. ' +
               'If you are not equipped to unhook a pike, do not fish for one.' }),

    sp({ id: 'zander', name: 'Zander', latin: 'Sander lucioperca', group: 'predator',
      waters: ['river', 'canal'],
      season: '332111112233', temp: [2, 6, 18, 24],
      times: { dawn: 2, day: 0, dusk: 3, night: 3 },
      rigs: ['paternoster', 'dropshot', 'pike-lure'],
      hook: 'Size 6 treble or 2/0 single', mainline: '12 lb', hooklength: '20 lb wire or 15 lb fluoro',
      baits: [
        ['Small roach or smelt deadbait', 'Match the size — zander want a small mouthful.'],
        ['Soft plastic shad on a jig head', 'Bounced along the bottom at last light.'],
        ['Lamprey section', 'Blood in the water and they find it in the dark.']
      ],
      depth: 'Deep water and low light. Boat channels, lock approaches, bridge shadows.',
      how: 'Bites are gentle. Drop the rod tip, let them turn, then lift into it steadily.',
      cold: 'Feed hard through winter, especially in coloured water.',
      warm: 'A dusk-and-after fish in summer — daylight sessions are largely wasted.',
      warning: 'Non-native in most of the UK. Check the fishery rules on returning them before you go.' }),

    sp({ id: 'chub', name: 'Chub', latin: 'Squalius cephalus', group: 'coarse',
      waters: ['river'],
      season: '332000223333', temp: [2, 8, 20, 25],
      times: { dawn: 2, day: 2, dusk: 3, night: 2 },
      rigs: ['running-ledger', 'stick', 'surface-controller'],
      hook: 'Size 10–6', mainline: '6–8 lb', hooklength: '5–6 lb',
      baits: [
        ['Bread flake', 'A big lump of it, on a size 6, is a proper chub bait.'],
        ['Cheesepaste', 'The winter classic in cold, coloured water.'],
        ['Lobworm', 'After rain, when the river is carrying colour.']
      ],
      depth: 'Under cover. Overhanging trees, undercut banks, rafts of rubbish.',
      how: 'Move every 20 minutes. Chub are where the cover is, not where you are comfortable.',
      cold: 'Winter floodwater is the best chub fishing of the year. Fish the slacks.',
      warm: 'Try floating crust in summer — they are suckers for it.' }),

    sp({ id: 'barbel', name: 'Barbel', latin: 'Barbus barbus', group: 'coarse',
      waters: ['river'],
      season: '110000333332', temp: [7, 12, 22, 26],
      times: { dawn: 2, day: 1, dusk: 3, night: 3 },
      rigs: ['running-ledger', 'hair-bolt', 'maggot-feeder'],
      hook: 'Size 12–6', mainline: '10–12 lb', hooklength: '8–10 lb',
      baits: [
        ['Halibut pellet on a hair', 'The bait that changed barbel fishing.'],
        ['Luncheon meat', 'Cheap, tough, and big fish still fall for it.'],
        ['Boilie over hemp', 'Keeps the small stuff off overnight.']
      ],
      depth: 'Fast, oxygenated water over gravel. Weir pools and streamy runs.',
      how: 'Bait a swim, rest it, come back. Rod tip round and hold on.',
      cold: 'Hard going below 8 °C. Late summer through autumn is the real season.',
      warm: 'Dusk and into dark. In hot weather fish the well-oxygenated water below weirs.',
      warning: 'Rest a barbel upright in the flow until it kicks off strongly. They die from bad returns.' }),

    sp({ id: 'dace', name: 'Dace', latin: 'Leuciscus leuciscus', group: 'coarse',
      waters: ['river'],
      season: '332000112333', temp: [2, 7, 18, 23],
      times: { dawn: 1, day: 3, dusk: 2, night: 0 },
      rigs: ['stick', 'waggler'],
      hook: 'Size 22–18', mainline: '2.5 lb', hooklength: '1.5 lb',
      baits: [
        ['Single maggot', 'Nothing else needed.'],
        ['Caster', 'For the better stamp of fish.'],
        ['Bread punch', 'On clear, cold winter days.']
      ],
      depth: 'Shallow, fast, gravelly runs — often only 18 inches deep.',
      how: 'The fastest bite in freshwater. Strike as the float dips, not after.',
      cold: 'Feed happily in cold water and save many a blank winter day.',
      warm: 'Everywhere in summer, but the small ones dominate.' }),

    sp({ id: 'gudgeon', name: 'Gudgeon', latin: 'Gobio gobio', group: 'coarse',
      waters: ['river', 'canal'],
      season: '112233333221', temp: [4, 10, 22, 27],
      times: { dawn: 1, day: 3, dusk: 1, night: 0 },
      rigs: ['pole-rig', 'stick'],
      hook: 'Size 22–18', mainline: '2 lb', hooklength: '1 lb',
      baits: [
        ['Single red maggot', 'On the bottom, and they will find it.'],
        ['Pinkie', 'For a fast bite-a-chuck session.'],
        ['Squatt', 'Traditional gudgeon bait, still works.']
      ],
      depth: 'Hard on the bottom, in shallow gravelly water.',
      how: 'Stir the bottom up with the pole tip — gudgeon come to the disturbance.',
      cold: 'Feed all year, and they save blanks.',
      warm: 'Reliable — the fish to put a beginner on.' }),

    sp({ id: 'eel', name: 'Eel', latin: 'Anguilla anguilla', group: 'coarse',
      waters: ['stillwater', 'river', 'canal'],
      season: '000112332100', temp: [10, 15, 24, 28],
      times: { dawn: 1, day: 0, dusk: 3, night: 3 },
      rigs: ['running-ledger', 'paternoster'],
      hook: 'Size 6–2 wide gape', mainline: '12 lb', hooklength: '15 lb braid',
      baits: [
        ['Lobworm bunch', 'Classic and it out-fishes everything else.'],
        ['Small roach deadbait', 'Selects the bigger eels.'],
        ['Dead prawn', 'A good alternative on hot, still nights.']
      ],
      depth: 'Bottom, in silt, near cover. Warm still nights after rain.',
      how: 'Fish a slack line and a bobbin. Strike early — a deep-hooked eel rarely survives.',
      cold: 'Nothing doing below about 12 °C.',
      warm: 'Muggy, thundery summer nights are the whole season.',
      warning: 'The European eel is critically endangered. Barbless, strike early, return every one, ' +
               'and never keep one in a net.' }),

    sp({ id: 'catfish', name: 'Wels catfish', latin: 'Silurus glanis', group: 'predator',
      waters: ['stillwater'],
      season: '000123332100', temp: [12, 18, 27, 32],
      times: { dawn: 1, day: 1, dusk: 3, night: 3 },
      rigs: ['hair-bolt', 'paternoster'],
      hook: 'Size 2–6/0', mainline: '50–80 lb braid', hooklength: '80 lb',
      baits: [
        ['Halibut pellet or squid', 'Oily and it carries a long way in the dark.'],
        ['Large deadbait', 'Fished on the bottom near snags.'],
        ['Worm bunch', 'Surprisingly good for smaller cats.']
      ],
      depth: 'Snags, deep margins, and anywhere with cover. They patrol at night.',
      how: 'Heavy gear and a strong landing mat. Nothing about catfish is light tackle.',
      cold: 'Only fish for them once the water is properly warm.',
      warm: 'Hot summer nights, and be ready for a fight that lasts.',
      warning: 'Specialist waters only, with the right kit. A big cat will break normal carp tackle.' }),

    sp({ id: 'grayling', name: 'Grayling', latin: 'Thymallus thymallus', group: 'game',
      waters: ['river'],
      season: '332000001233', temp: [1, 4, 14, 19],
      times: { dawn: 1, day: 3, dusk: 2, night: 0 },
      rigs: ['stick', 'fly-nymph'],
      hook: 'Size 18–14', mainline: '3 lb', hooklength: '2–3 lb',
      baits: [
        ['Double maggot trotted', 'Down a clean gravel run, over loose feed.'],
        ['Heavy tungsten nymph', 'Czech-nymphed through the deeper glides.'],
        ['Red worm', 'When the river is carrying extra water.']
      ],
      depth: 'Fast, clean gravel runs, 2–4 ft deep.',
      how: 'Trot the same line repeatedly and feed steadily — grayling shoal tightly.',
      cold: 'A genuine winter fish and at their best on frosty, bright days.',
      warm: 'Leave them alone in warm water — they are fragile and stress badly.',
      warning: 'Grayling are a game fish: check the local season and byelaws before fishing.' }),

    sp({ id: 'brown-trout', name: 'Brown trout', latin: 'Salmo trutta', group: 'game',
      waters: ['river', 'stillwater', 'reservoir'],
      season: '000233333100', temp: [4, 8, 17, 21],
      times: { dawn: 3, day: 2, dusk: 3, night: 0 },
      rigs: ['fly-dry', 'fly-nymph'],
      hook: 'Size 18–12 fly', mainline: 'AFTM 4–6 floating', hooklength: '3–5 lb tippet',
      baits: [
        ['Dry fly to match the hatch', 'Watch the water for five minutes before you tie anything on.'],
        ['Weighted nymph', 'Covers fish that are not showing.'],
        ['Klinkhamer', 'The compromise when you cannot work out what is hatching.']
      ],
      depth: 'Feeding lies — seams, the crease beside fast water, under trees.',
      how: 'Approach from downstream, keep low, and make the first cast count.',
      cold: 'Season is generally closed in winter. Check local dates.',
      warm: 'Evening rise on a warm day is the best hour of the year.',
      warning: 'River trout seasons vary by region — confirm before you fish.' }),

    sp({ id: 'rainbow-trout', name: 'Rainbow trout', latin: 'Oncorhynchus mykiss', group: 'game',
      waters: ['stillwater', 'reservoir'],
      season: '223333322333', temp: [3, 7, 17, 21],
      times: { dawn: 3, day: 2, dusk: 3, night: 0 },
      rigs: ['fly-nymph', 'fly-dry'],
      hook: 'Size 14–8 fly', mainline: 'AFTM 6–7', hooklength: '6–8 lb fluorocarbon',
      baits: [
        ['Buzzers under an indicator', 'The stillwater banker most of the year.'],
        ['Damsel nymph', 'Summer, retrieved slowly near weed.'],
        ['Bright lure (Cats Whisker)', 'For recently stocked fish and coloured water.']
      ],
      depth: 'Count the line down and note what depth produced the take — then repeat it.',
      how: 'Vary the retrieve until something works, then do exactly that again.',
      cold: 'Fish deep and slow. Stocked waters fish all winter.',
      warm: 'Early and late — they go deep in the heat of the day.' }),

    sp({ id: 'salmon', name: 'Atlantic salmon', latin: 'Salmo salar', group: 'game',
      waters: ['river'],
      season: '011223333210', temp: [4, 7, 16, 19],
      times: { dawn: 3, day: 2, dusk: 3, night: 0 },
      rigs: ['fly-dry', 'pike-lure'],
      hook: 'Size 10–4 double or tube', mainline: 'AFTM 8–10 / 15 lb', hooklength: '12–20 lb',
      baits: [
        ['Small tube fly', 'Fished across and down on a floating line.'],
        ['Cascade or Willie Gunn', 'Two patterns that have earned their place.'],
        ['Flying C spinner', 'Where the beat rules allow it.']
      ],
      depth: 'Known lies — the head and tail of pools. A ghillie will save you a season of guessing.',
      how: 'Cast across, let it swing, take a step down. Repeat until something grabs it.',
      cold: 'Spring fish are few and hard-won.',
      warm: 'A rising river after rain is the moment to be on the bank.',
      warning: 'Needs a salmon and sea trout licence AND a beat permit. Mandatory catch and release ' +
               'applies on many rivers — check the byelaws for the specific river.' }),

    sp({ id: 'sea-trout', name: 'Sea trout', latin: 'Salmo trutta trutta', group: 'game',
      waters: ['river'],
      season: '000112333210', temp: [6, 10, 18, 22],
      times: { dawn: 1, day: 0, dusk: 3, night: 3 },
      rigs: ['fly-dry', 'fly-nymph'],
      hook: 'Size 10–6', mainline: 'AFTM 7 floating', hooklength: '8–10 lb',
      baits: [
        ['Surface wake fly at night', 'The whole point of sea trout fishing.'],
        ['Small silver tube', 'For the first hour of darkness.'],
        ['Snake fly', 'Late, when it is properly black.']
      ],
      depth: 'Tails of pools after dark.',
      how: 'Walk the pool in daylight so you know it blind. Then fish it in the dark.',
      cold: 'Out of season most of the year — a summer night fishery.',
      warm: 'Warm, still July and August nights.',
      warning: 'Salmon and sea trout licence required. Night fishing needs permission on most beats.' }),

    /* ------ sea species ------ */

    sp({ id: 'bass', name: 'Bass', latin: 'Dicentrarchus labrax', group: 'sea',
      waters: ['coastal'],
      season: '001123333210', temp: [8, 12, 20, 24],
      times: { dawn: 3, day: 1, dusk: 3, night: 2 },
      rigs: ['pike-lure', 'running-ledger', 'sea-float'],
      hook: 'Size 2/0–4/0', mainline: '15–20 lb', hooklength: '20 lb fluorocarbon',
      baits: [
        ['Surface or shallow-diving lure', 'Over rough ground on a rising tide.'],
        ['Live or fresh peeler crab', 'The bait that beats lures when it is rough.'],
        ['Whole squid or mackerel head', 'For the bigger fish at night.']
      ],
      depth: 'Tide races, gullies, surf tables and estuary mouths. Fish the moving water.',
      how: 'Two hours either side of high water, and a bit of chop on the surface.',
      cold: 'Most bass move off in winter — target them May to October.',
      warm: 'Dawn on a summer tide with a lure is the best of it.',
      warning: 'Bass are tightly regulated: minimum size, bag limits and closed periods change ' +
               'year to year. Check the current rules before you keep anything.' }),

    sp({ id: 'mackerel', name: 'Mackerel', latin: 'Scomber scombrus', group: 'sea',
      waters: ['coastal'],
      season: '000012333100', temp: [11, 14, 20, 24],
      times: { dawn: 3, day: 2, dusk: 3, night: 0 },
      rigs: ['sea-float', 'pike-lure'],
      hook: 'Size 1–1/0 or feathers', mainline: '15 lb', hooklength: '15 lb',
      baits: [
        ['String of feathers', 'Fastest way to fill a bucket when they are in.'],
        ['Small metal spinner', 'More sporting and just as effective.'],
        ['Mackerel strip under a float', 'For a steady session off a pier.']
      ],
      depth: 'Upper few metres. If they are not in the top, they are not there.',
      how: 'Watch for diving birds and surface swirls — that is the shoal.',
      cold: 'Gone by late autumn.',
      warm: 'June to September off almost any pier or rock mark.',
      warning: 'Take only what you will eat. Dispatch them immediately.' }),

    sp({ id: 'cod', name: 'Cod', latin: 'Gadus morhua', group: 'sea',
      waters: ['coastal'],
      season: '221000001233', temp: [2, 5, 13, 17],
      times: { dawn: 2, day: 1, dusk: 3, night: 3 },
      rigs: ['pulley', 'flapper'],
      hook: 'Size 4/0–6/0 pennell', mainline: '18 lb + shockleader', hooklength: '60 lb',
      baits: [
        ['Lugworm and squid wrap', 'The winter cod bait, and nothing beats it.'],
        ['Peeler crab', 'Early season, over rough ground.'],
        ['Whole squid', 'For the bigger fish at range.']
      ],
      depth: 'Rough ground and gullies, especially in a coloured, storm-stirred sea.',
      how: 'Big smelly baits, fished after a blow. Cod come in with the coloured water.',
      cold: 'October to February is the season.',
      warm: 'Largely absent inshore in summer.' }),

    sp({ id: 'whiting', name: 'Whiting', latin: 'Merlangius merlangus', group: 'sea',
      waters: ['coastal'],
      season: '221000001233', temp: [2, 5, 14, 18],
      times: { dawn: 1, day: 1, dusk: 3, night: 3 },
      rigs: ['flapper', 'pulley'],
      hook: 'Size 1–2/0', mainline: '15 lb', hooklength: '20 lb',
      baits: [
        ['Mackerel strip', 'Tough and they cannot leave it alone.'],
        ['Ragworm', 'When you want quality rather than quantity.'],
        ['Squid strip', 'Stays on through repeated bites.']
      ],
      depth: 'Clean sand at range, after dark.',
      how: 'They find bait fast. If nothing in ten minutes, reel in and recast.',
      cold: 'Autumn and winter, and they will keep you busy all night.',
      warm: 'Mostly offshore in summer.' }),

    sp({ id: 'flounder', name: 'Flounder', latin: 'Platichthys flesus', group: 'sea',
      waters: ['coastal'],
      season: '221100012333', temp: [2, 6, 16, 21],
      times: { dawn: 2, day: 2, dusk: 2, night: 1 },
      rigs: ['running-ledger', 'flapper'],
      hook: 'Size 4–1 long shank', mainline: '12 lb', hooklength: '15 lb',
      baits: [
        ['Ragworm', 'With a couple of beads above the hook.'],
        ['Peeler crab', 'The best flounder bait of the lot.'],
        ['Lugworm tipped with squid', 'Adds scent on a coloured tide.']
      ],
      depth: 'Estuary mud and sand, in surprisingly shallow water.',
      how: 'Slowly drag the bait back a foot at a time — the movement and beads pull them in.',
      cold: 'Autumn into winter, before they head out to spawn.',
      warm: 'Thin on the ground in high summer.' }),

    sp({ id: 'plaice', name: 'Plaice', latin: 'Pleuronectes platessa', group: 'sea',
      waters: ['coastal'],
      season: '012333210001', temp: [5, 8, 17, 21],
      times: { dawn: 2, day: 3, dusk: 2, night: 0 },
      rigs: ['flapper', 'running-ledger'],
      hook: 'Size 2–1 long shank', mainline: '12 lb', hooklength: '15 lb',
      baits: [
        ['Ragworm and razorfish', 'The spring plaice cocktail.'],
        ['Lugworm', 'Simple and reliable.'],
        ['Peeler crab', 'On the mussel beds.']
      ],
      depth: 'Clean sand and mussel beds, daylight, on a moving tide.',
      how: 'Bright beads and a sequin above the hook genuinely help.',
      cold: 'Inshore from March, best April and May.',
      warm: 'Move off into deeper water by midsummer.' }),

    sp({ id: 'pollack', name: 'Pollack', latin: 'Pollachius pollachius', group: 'sea',
      waters: ['coastal'],
      season: '112223333221', temp: [6, 9, 17, 21],
      times: { dawn: 3, day: 2, dusk: 3, night: 0 },
      rigs: ['pike-lure', 'sea-float'],
      hook: 'Size 2/0–4/0', mainline: '20 lb braid', hooklength: '20 lb fluorocarbon',
      baits: [
        ['Soft plastic sandeel', 'Sink and draw over rough ground.'],
        ['Metal jig', 'From a deep rock mark.'],
        ['Live sandeel', 'If you can get them.']
      ],
      depth: 'Deep water hard against rock. They sit below and hit upwards.',
      how: 'Let it sink, then a slow steady retrieve. The take is a savage downward run.',
      cold: 'Available all year but best from spring through autumn.',
      warm: 'Dawn and dusk over reefs.' }),

    sp({ id: 'wrasse', name: 'Ballan wrasse', latin: 'Labrus bergylta', group: 'sea',
      waters: ['coastal'],
      season: '001133332100', temp: [10, 13, 19, 23],
      times: { dawn: 2, day: 3, dusk: 2, night: 0 },
      rigs: ['running-ledger', 'sea-float'],
      hook: 'Size 1/0–3/0', mainline: '20–30 lb', hooklength: '25 lb',
      baits: [
        ['Hardback crab', 'The wrasse bait, and they will smash it.'],
        ['Ragworm', 'Easier to get and still works.'],
        ['Weedless soft plastic', 'Great sport over heavy kelp.']
      ],
      depth: 'Kelp and rock, often only a rod length out.',
      how: 'Strong tackle and lock the drag — a wrasse will bury itself in kelp instantly.',
      cold: 'They shut down over winter.',
      warm: 'A summer species, and superb sport on light lure gear.',
      warning: 'Wrasse are slow-growing and easily depleted. Return them, and do it quickly.' }),

    sp({ id: 'smoothhound', name: 'Smoothhound', latin: 'Mustelus mustelus', group: 'sea',
      waters: ['coastal'],
      season: '000123332000', temp: [11, 14, 20, 23],
      times: { dawn: 2, day: 2, dusk: 3, night: 2 },
      rigs: ['pulley', 'running-ledger'],
      hook: 'Size 3/0–5/0', mainline: '18 lb + shockleader', hooklength: '60 lb',
      baits: [
        ['Peeler crab', 'They eat almost nothing else. Do not bother without it.'],
        ['Hermit crab', 'Excellent alternative where you can get them.'],
        ['Squid', 'Distant third, but it has caught them.']
      ],
      depth: 'Sand and shingle over mixed ground, on a strong tide.',
      how: 'A big run that empties the spool. Let it go, then lean into it.',
      cold: 'Absent inshore in winter.',
      warm: 'May to August, and pound for pound the best fight on the beach.' }),

    sp({ id: 'mullet', name: 'Thick-lipped mullet', latin: 'Chelon labrosus', group: 'sea',
      waters: ['coastal'],
      season: '000123333100', temp: [11, 14, 21, 25],
      times: { dawn: 2, day: 3, dusk: 2, night: 0 },
      rigs: ['sea-float', 'waggler'],
      hook: 'Size 10–6', mainline: '6 lb', hooklength: '4–5 lb fluorocarbon',
      baits: [
        ['Bread flake', 'Over a slick of mashed bread groundbait.'],
        ['Harbour ragworm', 'In estuaries and marinas.'],
        ['Small pieces of fish', 'Where they are used to scraps from boats.']
      ],
      depth: 'Just under the surface, in harbours, marinas and estuary creeks.',
      how: 'Freshwater tactics on saltwater fish. Feed for an hour before you even cast.',
      cold: 'They leave inshore water by late autumn.',
      warm: 'Summer, and they are the hardest, most rewarding fish on this list.' }),

    sp({ id: 'garfish', name: 'Garfish', latin: 'Belone belone', group: 'sea',
      waters: ['coastal'],
      season: '000012333100', temp: [11, 14, 21, 25],
      times: { dawn: 2, day: 3, dusk: 2, night: 0 },
      rigs: ['sea-float', 'pike-lure'],
      hook: 'Size 6–4 long shank', mainline: '8–10 lb', hooklength: '8 lb',
      baits: [
        ['Thin strip of mackerel', 'Under a float, set shallow. Nothing else needed.'],
        ['Small silver spinner', 'They will chase it right to your feet.'],
        ['Sandeel strip', 'When the mackerel have not turned up yet.']
      ],
      depth: 'Top two or three feet. Garfish are a surface fish, always.',
      how: 'Long beak full of bone, so they are hard to hook — give them a second before you strike.',
      cold: 'Gone from inshore water by late autumn.',
      warm: 'Summer, alongside the mackerel, and far better sport on light tackle.' }),

    sp({ id: 'dogfish', name: 'Lesser-spotted dogfish', latin: 'Scyliorhinus canicula', group: 'sea',
      waters: ['coastal'],
      season: '332211123333', temp: [3, 7, 17, 21],
      times: { dawn: 1, day: 1, dusk: 2, night: 3 },
      rigs: ['flapper', 'pulley'],
      hook: 'Size 1/0–3/0', mainline: '15 lb + shockleader', hooklength: '30 lb',
      baits: [
        ['Squid', 'Tough, smelly, and stays on through everything.'],
        ['Mackerel strip', 'Oily and they home straight in on it.'],
        ['Lugworm tipped with squid', 'When you want other species too.']
      ],
      depth: 'Clean ground at range, and they feed hard after dark.',
      how: 'They will find any bait eventually. Often the thing that saves a blank night.',
      cold: 'Around all year and unbothered by cold water.',
      warm: 'Still there in summer, mostly after dark.',
      warning: 'Hold them firmly behind the head — their skin is like sandpaper and they curl round your wrist.' })
  ];

  /* -------------------------------------------------------------------- venues */

  /* Seed list of well-known UK waters. Prices and ratings are INDICATIVE editorial
     values — a starting point, not quotes and not real review scores.

     v(id, name, type, lat, lon, ticket, rating, breakdown, species, facilities, notes, url)
       type      stillwater | reservoir | river | canal | coastal
       ticket    indicative day ticket in £, or null when not recorded / not applicable
       rating    editorial 0–5, one decimal
       breakdown {stock, access, facilities, value} each 0–5
       facilities subset of FACILITIES ids */
  const FACILITIES = [
    { id: 'parking', label: 'Parking', icon: 'car' },
    { id: 'toilets', label: 'Toilets', icon: 'toilet' },
    { id: 'tackle', label: 'Tackle & bait on site', icon: 'tackle' },
    { id: 'cafe', label: 'Café', icon: 'cafe' },
    { id: 'accessible', label: 'Accessible pegs', icon: 'accessible' },
    { id: 'night', label: 'Night fishing', icon: 'moon' },
    { id: 'dogs', label: 'Dogs allowed', icon: 'dog' },
    { id: 'bailiff', label: 'Bailiff on site', icon: 'badge' }
  ];

  const v = (id, name, type, lat, lon, ticket, rating, breakdown, species, facilities, notes, url) =>
    ({ id, name, type, lat, lon, ticket, rating, breakdown, species, facilities, notes, url,
       source: 'seed', country: null, checked: '2026-08-01' });

  const VENUES = [
    /* ---- trout reservoirs ---- */
    v('grafham', 'Grafham Water', 'reservoir', 52.2937, -0.3266, 35, 4.5,
      { stock: 5, access: 4, facilities: 5, value: 4 },
      ['rainbow-trout', 'brown-trout', 'pike', 'perch'],
      ['parking', 'toilets', 'tackle', 'cafe', 'accessible', 'bailiff'],
      'Major stocked trout fishery. Bank and boat. Pike fishing by separate permit in winter.',
      'https://www.anglianwaterparks.co.uk/grafham-water'),
    v('rutland', 'Rutland Water', 'reservoir', 52.6539, -0.6580, 38, 4.6,
      { stock: 5, access: 4, facilities: 5, value: 4 },
      ['rainbow-trout', 'brown-trout', 'pike', 'zander'],
      ['parking', 'toilets', 'tackle', 'cafe', 'accessible', 'bailiff'],
      'One of the best-known stillwater trout fisheries in Europe. Boats book up fast.',
      'https://www.anglianwaterparks.co.uk/rutland-water'),
    v('chew', 'Chew Valley Lake', 'reservoir', 51.3378, -2.6222, 34, 4.6,
      { stock: 5, access: 4, facilities: 4, value: 4 },
      ['rainbow-trout', 'brown-trout', 'pike'],
      ['parking', 'toilets', 'cafe', 'bailiff'],
      'Famous for both big trout and enormous pike. Pike fishing is a limited, balloted season.',
      'https://www.bristolwater.co.uk/recreation/fishing'),
    v('bewl', 'Bewl Water', 'reservoir', 51.0403, 0.4108, 32, 4.2,
      { stock: 4, access: 4, facilities: 4, value: 4 },
      ['rainbow-trout', 'brown-trout', 'pike'],
      ['parking', 'toilets', 'cafe', 'accessible'],
      'The largest area of open water in the south east. Bank and boat trout fishing.', null),
    v('draycote', 'Draycote Water', 'reservoir', 52.3327, -1.3486, 30, 4.2,
      { stock: 4, access: 5, facilities: 4, value: 4 },
      ['rainbow-trout', 'brown-trout', 'perch'],
      ['parking', 'toilets', 'cafe', 'accessible', 'bailiff'],
      'Consistent Midlands trout water with easy bank access all the way round.', null),
    v('pitsford', 'Pitsford Water', 'reservoir', 52.3183, -0.8639, 30, 4.3,
      { stock: 4, access: 4, facilities: 4, value: 4 },
      ['rainbow-trout', 'brown-trout', 'pike'],
      ['parking', 'toilets', 'cafe', 'bailiff'],
      'Well-regarded fly water, strong buzzer fishing from spring.', null),
    v('carsington', 'Carsington Water', 'reservoir', 53.0570, -1.6320, 28, 4.1,
      { stock: 4, access: 4, facilities: 4, value: 4 },
      ['rainbow-trout', 'brown-trout'],
      ['parking', 'toilets', 'cafe', 'accessible'],
      'Peak District fringe reservoir, fly only. Exposed in a wind.', null),
    v('blithfield', 'Blithfield Reservoir', 'reservoir', 52.8060, -1.9060, 30, 4.3,
      { stock: 4, access: 3, facilities: 3, value: 4 },
      ['rainbow-trout', 'brown-trout', 'pike'],
      ['parking', 'toilets', 'bailiff'],
      'Staffordshire trout water with a serious reputation for big pike in winter.', null),
    v('wimbleball', 'Wimbleball Lake', 'reservoir', 51.0490, -3.4680, 28, 4.2,
      { stock: 4, access: 3, facilities: 3, value: 4 },
      ['rainbow-trout', 'brown-trout'],
      ['parking', 'toilets', 'cafe'],
      'Exmoor reservoir. Beautiful, and hard when the wind gets up.', null),
    v('farmoor', 'Farmoor Reservoir', 'reservoir', 51.7580, -1.3520, 28, 4.0,
      { stock: 4, access: 5, facilities: 3, value: 4 },
      ['rainbow-trout', 'brown-trout'],
      ['parking', 'toilets', 'accessible'],
      'Two concrete-banked basins near Oxford. Easy walking, no shelter.', null),
    v('llyn-brenig', 'Llyn Brenig', 'reservoir', 53.0700, -3.5100, 28, 4.3,
      { stock: 4, access: 3, facilities: 4, value: 4 },
      ['rainbow-trout', 'brown-trout'],
      ['parking', 'toilets', 'cafe'],
      'Large upland Welsh trout fishery with a wild brown trout catch-and-release area.', null),
    v('llandegfedd', 'Llandegfedd Reservoir', 'reservoir', 51.6800, -2.9800, 28, 4.2,
      { stock: 4, access: 4, facilities: 4, value: 4 },
      ['rainbow-trout', 'brown-trout', 'pike'],
      ['parking', 'toilets', 'cafe', 'accessible'],
      'South Wales trout water, also known for very large pike.', null),
    v('menteith', 'Lake of Menteith', 'stillwater', 56.1700, -4.2900, 40, 4.4,
      { stock: 5, access: 4, facilities: 4, value: 3 },
      ['rainbow-trout', 'brown-trout', 'pike'],
      ['parking', 'toilets', 'cafe'],
      'Scotland’s best-known stillwater trout fishery. Boat fishing dominates.', null),

    /* ---- commercial coarse fisheries ---- */
    v('linear', 'Linear Fisheries', 'stillwater', 51.7660, -1.3300, 15, 4.5,
      { stock: 5, access: 4, facilities: 4, value: 4 },
      ['carp', 'tench', 'bream', 'roach', 'perch', 'catfish'],
      ['parking', 'toilets', 'tackle', 'night', 'bailiff'],
      'Large Oxfordshire complex of specimen carp lakes plus easier match waters.',
      'https://www.linear-fisheries.co.uk/'),
    v('bury-hill', 'Bury Hill Fisheries', 'stillwater', 51.2210, -0.3480, 14, 4.3,
      { stock: 4, access: 5, facilities: 5, value: 4 },
      ['carp', 'bream', 'roach', 'perch', 'zander', 'tench'],
      ['parking', 'toilets', 'tackle', 'cafe', 'accessible', 'bailiff'],
      'Surrey day-ticket complex, well known for big perch and the "zander" lake.', null),
    v('willow-park', 'Willow Park Fisheries', 'stillwater', 51.2740, -0.7580, 13, 4.1,
      { stock: 4, access: 4, facilities: 4, value: 4 },
      ['carp', 'tench', 'bream', 'roach', 'perch', 'catfish'],
      ['parking', 'toilets', 'tackle', 'cafe', 'night'],
      'Long-established Aldershot fishery with several lakes and a canal-style water.', null),
    v('makins', 'Makins Fishery', 'stillwater', 52.4790, -1.4270, 12, 4.2,
      { stock: 4, access: 5, facilities: 4, value: 4 },
      ['carp', 'bream', 'roach', 'tench', 'perch'],
      ['parking', 'toilets', 'cafe', 'accessible', 'night', 'bailiff'],
      'Big Warwickshire match complex. Easy pegs, lots of fish.', null),
    v('barston', 'Barston Lakes', 'stillwater', 52.4030, -1.7180, 14, 4.4,
      { stock: 5, access: 5, facilities: 5, value: 4 },
      ['carp', 'bream', 'tench', 'roach'],
      ['parking', 'toilets', 'tackle', 'cafe', 'accessible', 'bailiff'],
      'Solihull match venue with a strong reputation for large bream and F1 nets.', null),
    v('packington', 'Packington Somers Fishery', 'stillwater', 52.4200, -1.6800, 12, 4.1,
      { stock: 4, access: 4, facilities: 3, value: 4 },
      ['carp', 'bream', 'tench', 'roach', 'perch', 'pike'],
      ['parking', 'toilets', 'night', 'bailiff'],
      'Several pools plus a stretch of the River Blythe, near Meriden.', null),
    v('tunnel-barn', 'Tunnel Barn Farm', 'stillwater', 52.3200, -1.7100, 12, 4.2,
      { stock: 5, access: 5, facilities: 4, value: 4 },
      ['carp', 'bream', 'roach', 'tench'],
      ['parking', 'toilets', 'cafe', 'accessible'],
      'Warwickshire match fishery, famous for a bite-a-chuck reputation.', null),
    v('todber', 'Todber Manor Fisheries', 'stillwater', 50.9500, -2.3200, 12, 4.3,
      { stock: 5, access: 5, facilities: 5, value: 4 },
      ['carp', 'bream', 'tench', 'roach', 'perch'],
      ['parking', 'toilets', 'tackle', 'cafe', 'accessible', 'bailiff'],
      'Dorset complex with on-site tackle shop and a wide range of lakes.', null),
    v('white-acres', 'White Acres', 'stillwater', 50.3800, -4.9600, 14, 4.4,
      { stock: 5, access: 5, facilities: 5, value: 3 },
      ['carp', 'bream', 'tench', 'roach', 'perch'],
      ['parking', 'toilets', 'tackle', 'cafe', 'accessible', 'bailiff'],
      'Cornwall holiday park and match complex — one of the best-known in the country.', null),
    v('anglers-paradise', 'Anglers Paradise', 'stillwater', 50.8700, -4.2300, 15, 4.3,
      { stock: 5, access: 4, facilities: 4, value: 4 },
      ['carp', 'catfish', 'tench', 'bream', 'perch'],
      ['parking', 'toilets', 'night', 'bailiff'],
      'Devon complex with an unusual range of species including catfish and golden orfe.', null),
    v('partridge', 'Partridge Lakes', 'stillwater', 53.4300, -2.5300, 13, 4.3,
      { stock: 5, access: 5, facilities: 4, value: 4 },
      ['carp', 'bream', 'roach', 'tench'],
      ['parking', 'toilets', 'cafe', 'accessible', 'bailiff'],
      'Major north-west match venue near Warrington.', null),
    v('lindholme', 'Lindholme Lakes', 'stillwater', 53.5600, -1.0000, 13, 4.2,
      { stock: 5, access: 5, facilities: 4, value: 4 },
      ['carp', 'bream', 'roach', 'tench', 'perch'],
      ['parking', 'toilets', 'cafe', 'accessible', 'bailiff'],
      'Large Doncaster complex, heavily used for matches.', null),
    v('cudmore', 'Cudmore Fisheries', 'stillwater', 52.9200, -2.2500, 12, 4.1,
      { stock: 4, access: 4, facilities: 4, value: 4 },
      ['carp', 'bream', 'roach', 'tench'],
      ['parking', 'toilets', 'cafe', 'night'],
      'Staffordshire fishery with a mix of match and specimen lakes.', null),
    v('boddington', 'Boddington Reservoir', 'reservoir', 52.1500, -1.3000, 8, 3.9,
      { stock: 4, access: 3, facilities: 2, value: 5 },
      ['carp', 'bream', 'roach', 'perch', 'pike'],
      ['parking'],
      'Canal feeder reservoir in Northamptonshire. Day tickets, big bream and pike.', null),
    v('napton', 'Napton Reservoir', 'reservoir', 52.2500, -1.3200, 8, 3.8,
      { stock: 3, access: 3, facilities: 2, value: 5 },
      ['carp', 'bream', 'roach', 'tench', 'pike'],
      ['parking'],
      'Quiet Warwickshire feeder reservoir. Old-fashioned, weedy and rewarding.', null),

    /* ---- rivers ---- */
    v('trent-newark', 'River Trent at Newark', 'river', 53.0770, -0.8090, 6, 4.2,
      { stock: 4, access: 4, facilities: 2, value: 5 },
      ['barbel', 'chub', 'bream', 'roach', 'perch', 'zander', 'pike'],
      ['parking'],
      'Big-river fishing through the town. Barbel and bream in numbers; club or day tickets on most stretches.', null),
    v('severn-bewdley', 'River Severn at Bewdley', 'river', 52.3760, -2.3170, 6, 4.3,
      { stock: 4, access: 4, facilities: 2, value: 5 },
      ['barbel', 'chub', 'bream', 'roach', 'dace', 'pike'],
      ['parking', 'toilets'],
      'Classic middle Severn barbel and chub water, with town-centre access.', null),
    v('wye-hereford', 'River Wye at Hereford', 'river', 52.0530, -2.7150, 8, 4.4,
      { stock: 4, access: 4, facilities: 2, value: 4 },
      ['barbel', 'chub', 'salmon', 'pike', 'dace'],
      ['parking'],
      'Superb barbel and chub river. Salmon fishing is separate and permit-controlled.', null),
    v('avon-royalty', 'Royalty Fishery, River Avon', 'river', 50.7380, -1.7810, 20, 4.5,
      { stock: 5, access: 4, facilities: 3, value: 3 },
      ['barbel', 'chub', 'roach', 'perch', 'pike', 'salmon'],
      ['parking', 'toilets', 'bailiff'],
      'One of the most famous day-ticket fisheries in the country, at Christchurch.', null),
    v('nene-peterborough', 'River Nene, Peterborough Embankment', 'river', 52.5730, -0.2470, 0, 3.8,
      { stock: 3, access: 5, facilities: 3, value: 5 },
      ['bream', 'roach', 'perch', 'pike', 'zander', 'chub'],
      ['parking', 'toilets', 'accessible'],
      'Free town-centre fishing on the Embankment stretch. Easy access, decent bream and zander.', null),
    v('ouse-york', 'River Ouse at York', 'river', 53.9560, -1.0870, 5, 3.9,
      { stock: 3, access: 4, facilities: 3, value: 5 },
      ['chub', 'barbel', 'bream', 'roach', 'dace', 'pike'],
      ['parking', 'toilets'],
      'City-centre river fishing on club-controlled stretches. Best when carrying some colour.', null),
    v('ribble-preston', 'River Ribble at Preston', 'river', 53.7600, -2.7100, 5, 3.9,
      { stock: 3, access: 3, facilities: 2, value: 5 },
      ['chub', 'dace', 'roach', 'barbel', 'salmon', 'sea-trout'],
      ['parking'],
      'Mixed coarse and game river. Club permits needed on most of it.', null),
    v('kennet-newbury', 'River Kennet at Newbury', 'river', 51.3980, -1.3230, 6, 4.0,
      { stock: 3, access: 4, facilities: 3, value: 4 },
      ['chub', 'barbel', 'roach', 'perch', 'pike', 'brown-trout'],
      ['parking', 'toilets'],
      'Clear chalk-influenced river with town-centre club water.', null),
    v('thames-reading', 'River Thames at Reading', 'river', 51.4600, -0.9700, 0, 3.7,
      { stock: 3, access: 4, facilities: 3, value: 5 },
      ['bream', 'roach', 'perch', 'pike', 'chub', 'barbel', 'zander'],
      ['parking', 'toilets'],
      'Long stretches of free and club water through town. Perch around the moorings.', null),
    v('tweed-kelso', 'River Tweed at Kelso', 'river', 55.5980, -2.4340, null, 4.6,
      { stock: 5, access: 3, facilities: 3, value: 2 },
      ['salmon', 'sea-trout', 'brown-trout', 'grayling'],
      ['parking'],
      'World-famous salmon river. Beats are let individually and prices vary enormously by season.', null),
    v('wye-builth', 'River Wye at Builth Wells', 'river', 52.1500, -3.4000, 12, 4.2,
      { stock: 4, access: 3, facilities: 2, value: 4 },
      ['barbel', 'chub', 'grayling', 'salmon', 'brown-trout'],
      ['parking'],
      'Upper Wye. Grayling in winter, barbel and chub through the season.', null),

    /* ---- canals ---- */
    v('gu-milton-keynes', 'Grand Union Canal, Milton Keynes', 'canal', 52.0400, -0.7600, 0, 3.6,
      { stock: 3, access: 5, facilities: 2, value: 5 },
      ['roach', 'perch', 'bream', 'carp', 'pike', 'zander', 'gudgeon'],
      ['parking'],
      'Miles of towpath fishing. Most of it is club or Canal & River Trust controlled — a Waterway Wanderers permit covers a lot of it.', null),
    v('trent-mersey-stone', 'Trent & Mersey Canal, Stone', 'canal', 52.9000, -2.1500, 0, 3.5,
      { stock: 3, access: 5, facilities: 2, value: 5 },
      ['roach', 'perch', 'bream', 'gudgeon', 'carp', 'pike'],
      ['parking', 'toilets'],
      'Steady canal fishing with easy access. Club permit needed on most lengths.', null),
    v('leeds-liverpool-burnley', 'Leeds & Liverpool Canal, Burnley', 'canal', 53.7900, -2.2400, 0, 3.5,
      { stock: 3, access: 5, facilities: 2, value: 5 },
      ['roach', 'perch', 'bream', 'carp', 'pike', 'gudgeon'],
      ['parking'],
      'Long urban and semi-rural canal. Good winter roach on bread punch.', null),
    v('bridgewater-sale', 'Bridgewater Canal, Sale', 'canal', 53.4200, -2.3300, 0, 3.6,
      { stock: 3, access: 5, facilities: 2, value: 5 },
      ['roach', 'perch', 'bream', 'carp', 'pike', 'gudgeon'],
      ['parking', 'toilets'],
      'Wide, deep canal with a good head of perch around the boat moorings.', null),
    v('kennet-avon-bath', 'Kennet & Avon Canal, Bath', 'canal', 51.3800, -2.3400, 0, 3.7,
      { stock: 3, access: 4, facilities: 3, value: 5 },
      ['roach', 'perch', 'bream', 'tench', 'carp', 'pike'],
      ['parking', 'toilets', 'cafe'],
      'Scenic canal fishing. Club or CRT permit required on most stretches.', null),

    /* ---- Scotland ---- */
    v('loch-lomond', 'Loch Lomond', 'stillwater', 56.0800, -4.6200, 15, 4.4,
      { stock: 4, access: 3, facilities: 3, value: 4 },
      ['pike', 'perch', 'brown-trout', 'salmon', 'sea-trout', 'roach'],
      ['parking', 'toilets'],
      'Huge, wild loch. Permits from the Loch Lomond Angling Improvement Association. No rod licence in Scotland, but permission is essential.', null),
    v('loch-awe', 'Loch Awe', 'stillwater', 56.3800, -5.1500, 12, 4.3,
      { stock: 4, access: 3, facilities: 2, value: 4 },
      ['pike', 'brown-trout', 'perch', 'salmon'],
      ['parking'],
      'Long Argyll loch with a reputation for very big pike and wild brown trout.', null),

    /* ---- coastal ---- */
    v('chesil', 'Chesil Beach', 'coastal', 50.6000, -2.5000, 0, 4.5,
      { stock: 5, access: 2, facilities: 2, value: 5 },
      ['cod', 'bass', 'mackerel', 'plaice', 'whiting', 'smoothhound', 'pollack'],
      ['parking'],
      'Legendary Dorset shingle bank. Deep water close in, and hard walking on the pebbles.', null),
    v('brighton-marina', 'Brighton Marina', 'coastal', 50.8100, -0.1000, 0, 4.0,
      { stock: 4, access: 5, facilities: 4, value: 5 },
      ['bass', 'mackerel', 'whiting', 'cod', 'mullet', 'flounder'],
      ['parking', 'toilets', 'cafe', 'accessible'],
      'Accessible wall and arm fishing with parking right behind you. A permit is needed for the western arm.', null),
    v('southend-pier', 'Southend Pier', 'coastal', 51.5200, 0.7200, 0, 3.8,
      { stock: 3, access: 4, facilities: 4, value: 4 },
      ['bass', 'flounder', 'whiting', 'smoothhound', 'mullet'],
      ['parking', 'toilets', 'cafe', 'accessible'],
      'The longest pleasure pier in the world. Pier fishing is ticketed and has set hours.', null),
    v('whitby-piers', 'Whitby Piers', 'coastal', 54.4900, -0.6100, 0, 4.1,
      { stock: 4, access: 4, facilities: 4, value: 5 },
      ['cod', 'mackerel', 'whiting', 'pollack', 'wrasse', 'bass'],
      ['parking', 'toilets', 'cafe'],
      'Productive North Yorkshire piers, with cod through the winter.', null),
    v('dover-admiralty', 'Dover, Admiralty Pier', 'coastal', 51.1200, 1.3200, 0, 4.2,
      { stock: 4, access: 4, facilities: 3, value: 4 },
      ['cod', 'bass', 'whiting', 'mackerel', 'pollack', 'plaice'],
      ['parking', 'toilets'],
      'Deep water off the end and a long history of big fish. A permit and set opening times apply.', null),
    v('aberystwyth', 'Aberystwyth Seafront', 'coastal', 52.4150, -4.0900, 0, 3.8,
      { stock: 3, access: 5, facilities: 4, value: 5 },
      ['bass', 'mackerel', 'whiting', 'flounder', 'pollack', 'wrasse'],
      ['parking', 'toilets', 'cafe'],
      'Easy access from the promenade and the stone jetty. Good summer mackerel.', null),
    v('newhaven-west', 'Newhaven West Beach', 'coastal', 50.7800, 0.0500, 0, 3.9,
      { stock: 4, access: 4, facilities: 2, value: 5 },
      ['bass', 'cod', 'whiting', 'smoothhound', 'flounder', 'plaice'],
      ['parking'],
      'Shingle beach beside the harbour arm. Fishes well on a coloured tide.', null),

    /* ---------------- south east ---------------- */
    v('twynersh', 'Twynersh Fishery', 'stillwater', 51.3940, -0.5180, 12, 4.0,
      { stock: 4, access: 4, facilities: 3, value: 4 },
      ['carp', 'tench', 'bream', 'roach', 'perch', 'rudd'],
      ['parking', 'night'],
      'Chertsey day-ticket complex of gravel-pit lakes with a good head of carp and silvers.', null),
    v('farlows', 'Farlows Lake', 'stillwater', 51.5050, -0.5000, 15, 4.1,
      { stock: 4, access: 4, facilities: 4, value: 3 },
      ['carp', 'tench', 'bream', 'perch', 'roach'],
      ['parking', 'toilets', 'tackle', 'cafe', 'night'],
      'Well-known Iver gravel pit with on-site tackle and café.', null),
    v('marsh-farm', 'Marsh Farm Fishery', 'stillwater', 51.1800, -0.6100, 12, 4.1,
      { stock: 4, access: 4, facilities: 3, value: 4 },
      ['carp', 'tench', 'bream', 'roach', 'perch', 'crucian'],
      ['parking', 'toilets', 'bailiff'],
      'Surrey fishery near Godalming, known for crucians and tench.', null),
    v('monk-lakes', 'Monk Lakes', 'stillwater', 51.1500, 0.5500, 14, 4.2,
      { stock: 5, access: 5, facilities: 4, value: 4 },
      ['carp', 'bream', 'tench', 'roach', 'perch'],
      ['parking', 'toilets', 'cafe', 'accessible', 'bailiff'],
      'Large Kent match and pleasure complex near Staplehurst.', null),
    v('cottington', 'Cottington Lakes', 'stillwater', 51.2100, 1.3600, 13, 4.0,
      { stock: 4, access: 4, facilities: 4, value: 4 },
      ['carp', 'catfish', 'tench', 'bream', 'roach'],
      ['parking', 'toilets', 'night'],
      'East Kent complex near Deal, with carp and catfish waters.', null),
    v('elphicks', 'Elphicks Fishery', 'stillwater', 51.1200, 0.4500, 13, 4.0,
      { stock: 4, access: 4, facilities: 3, value: 4 },
      ['carp', 'tench', 'bream', 'roach', 'perch'],
      ['parking', 'toilets', 'night'],
      'Kent day-ticket lakes near Horsmonden.', null),
    v('chalk-springs', 'Chalk Springs Fishery', 'stillwater', 50.8600, -0.5600, 35, 4.3,
      { stock: 5, access: 4, facilities: 3, value: 3 },
      ['rainbow-trout', 'brown-trout'],
      ['parking', 'toilets'],
      'Gin-clear spring-fed trout lakes at Arundel. You can see the fish, which makes it harder.', null),
    v('walthamstow', 'Walthamstow Reservoirs', 'reservoir', 51.5850, -0.0550, 12, 4.1,
      { stock: 4, access: 4, facilities: 3, value: 4 },
      ['carp', 'pike', 'perch', 'bream', 'roach', 'rainbow-trout'],
      ['parking', 'toilets', 'cafe', 'bailiff'],
      'A chain of London reservoirs with genuinely big carp and pike. Permit and set hours.', null),
    v('weir-wood', 'Weir Wood Reservoir', 'reservoir', 51.0800, -0.0500, 12, 3.9,
      { stock: 4, access: 3, facilities: 2, value: 4 },
      ['pike', 'perch', 'bream', 'roach', 'carp'],
      ['parking', 'toilets'],
      'Sussex reservoir near East Grinstead with a good coarse and pike head.', null),
    v('ardingly', 'Ardingly Reservoir', 'reservoir', 51.0450, -0.0800, 12, 4.0,
      { stock: 4, access: 3, facilities: 2, value: 4 },
      ['pike', 'perch', 'bream', 'roach', 'carp'],
      ['parking', 'toilets'],
      'Sussex reservoir known for pike and big bream.', null),
    v('arlington', 'Arlington Reservoir', 'reservoir', 50.8400, 0.2200, 26, 4.0,
      { stock: 4, access: 4, facilities: 3, value: 4 },
      ['rainbow-trout', 'brown-trout'],
      ['parking', 'toilets', 'cafe'],
      'East Sussex stocked trout fishery.', null),
    v('thames-chertsey', 'River Thames at Chertsey', 'river', 51.3850, -0.4900, 0, 3.7,
      { stock: 3, access: 4, facilities: 2, value: 5 },
      ['barbel', 'chub', 'bream', 'roach', 'perch', 'pike', 'zander', 'carp'],
      ['parking'],
      'Free and club stretches through the meads. Barbel below the weirs, perch round the moorings.', null),
    v('thames-kingston', 'River Thames at Kingston', 'river', 51.4100, -0.3000, 0, 3.6,
      { stock: 3, access: 5, facilities: 3, value: 5 },
      ['bream', 'roach', 'perch', 'pike', 'chub', 'carp', 'barbel'],
      ['parking', 'toilets', 'cafe'],
      'Urban Thames fishing with easy access. Much of it is free.', null),
    v('lea-broxbourne', 'River Lea at Broxbourne', 'river', 51.7450, -0.0200, 6, 3.8,
      { stock: 3, access: 4, facilities: 2, value: 5 },
      ['chub', 'barbel', 'roach', 'perch', 'pike', 'bream'],
      ['parking'],
      'Lee Valley river fishing on club and day-ticket stretches.', null),
    v('chichester-canal', 'Chichester Canal', 'canal', 50.8300, -0.7800, 0, 3.5,
      { stock: 3, access: 5, facilities: 3, value: 5 },
      ['carp', 'tench', 'bream', 'roach', 'perch', 'pike'],
      ['parking', 'cafe'],
      'Short, deep and weedy canal with a surprising head of carp and tench.', null),

    /* ---------------- south west ---------------- */
    v('viaduct', 'Viaduct Fishery', 'stillwater', 51.0400, -2.7400, 13, 4.3,
      { stock: 5, access: 5, facilities: 5, value: 4 },
      ['carp', 'bream', 'tench', 'roach', 'perch'],
      ['parking', 'toilets', 'tackle', 'cafe', 'accessible', 'bailiff'],
      'Somerset match complex at Somerton with an excellent reputation.', null),
    v('stafford-moor', 'Stafford Moor Fishery', 'stillwater', 50.8800, -4.0200, 14, 4.4,
      { stock: 5, access: 4, facilities: 5, value: 4 },
      ['carp', 'bream', 'tench', 'roach', 'perch'],
      ['parking', 'toilets', 'tackle', 'cafe', 'night', 'bailiff'],
      'Devon complex with both specimen carp lakes and match pools.', null),
    v('summerhayes', 'Summerhayes Fishery', 'stillwater', 50.8100, -3.1800, 12, 4.0,
      { stock: 4, access: 4, facilities: 3, value: 4 },
      ['carp', 'bream', 'roach', 'tench'],
      ['parking', 'toilets', 'cafe'],
      'East Devon match fishery near Honiton.', null),
    v('milemead', 'Milemead Fisheries', 'stillwater', 50.5600, -4.1500, 12, 4.0,
      { stock: 4, access: 4, facilities: 3, value: 4 },
      ['carp', 'tench', 'bream', 'roach', 'perch'],
      ['parking', 'toilets', 'tackle'],
      'Tavistock lakes with a mix of match and specimen water.', null),
    v('blagdon', 'Blagdon Lake', 'reservoir', 51.3250, -2.7100, 34, 4.6,
      { stock: 5, access: 4, facilities: 4, value: 4 },
      ['brown-trout', 'rainbow-trout'],
      ['parking', 'toilets', 'bailiff'],
      'The original English stillwater trout fishery, and still one of the very best.', null),
    v('roadford', 'Roadford Lake', 'reservoir', 50.6800, -4.2200, 26, 4.1,
      { stock: 4, access: 3, facilities: 3, value: 4 },
      ['brown-trout', 'rainbow-trout'],
      ['parking', 'toilets', 'cafe'],
      'Large Devon reservoir stocked with hard-fighting browns.', null),
    v('siblyback', 'Siblyback Lake', 'reservoir', 50.5200, -4.4700, 26, 4.1,
      { stock: 4, access: 4, facilities: 3, value: 4 },
      ['rainbow-trout', 'brown-trout'],
      ['parking', 'toilets', 'cafe'],
      'Bodmin Moor trout reservoir.', null),
    v('colliford', 'Colliford Lake', 'reservoir', 50.5200, -4.6100, 20, 4.0,
      { stock: 3, access: 3, facilities: 2, value: 5 },
      ['brown-trout'],
      ['parking'],
      'Cornwall’s largest lake, with wild-feeling brown trout fishing.', null),
    v('kennick', 'Kennick Reservoir', 'reservoir', 50.6100, -3.7000, 26, 4.1,
      { stock: 4, access: 3, facilities: 2, value: 4 },
      ['rainbow-trout', 'brown-trout'],
      ['parking', 'toilets'],
      'Dartmoor-edge trout water near Bovey Tracey.', null),
    v('exe-exeter', 'River Exe at Exeter', 'river', 50.7200, -3.5300, 5, 3.7,
      { stock: 3, access: 4, facilities: 3, value: 5 },
      ['chub', 'dace', 'roach', 'brown-trout', 'salmon', 'sea-trout'],
      ['parking', 'toilets'],
      'City river with club-controlled coarse and game stretches.', null),

    /* ---------------- midlands ---------------- */
    v('drayton-res', 'Drayton Reservoir', 'reservoir', 52.2600, -1.1700, 10, 4.1,
      { stock: 4, access: 4, facilities: 2, value: 5 },
      ['carp', 'bream', 'tench', 'roach', 'perch', 'pike'],
      ['parking'],
      'Daventry canal feeder reservoir, well known for big carp and bream.', null),
    v('bluebell-lakes', 'Bluebell Lakes', 'stillwater', 52.5200, -0.4200, 20, 4.5,
      { stock: 5, access: 4, facilities: 4, value: 3 },
      ['carp', 'catfish', 'tench', 'bream', 'perch', 'pike'],
      ['parking', 'toilets', 'night', 'bailiff'],
      'Northamptonshire specimen complex at Tansor with a serious big-fish reputation.', null),
    v('larford', 'Larford Lakes', 'stillwater', 52.3500, -2.2900, 13, 4.3,
      { stock: 5, access: 5, facilities: 4, value: 4 },
      ['carp', 'bream', 'tench', 'roach', 'perch'],
      ['parking', 'toilets', 'cafe', 'accessible', 'bailiff'],
      'Major Worcestershire match venue near Stourport.', null),
    v('docklow', 'Docklow Pools', 'stillwater', 52.2200, -2.6500, 12, 4.0,
      { stock: 4, access: 4, facilities: 3, value: 4 },
      ['carp', 'tench', 'bream', 'roach'],
      ['parking', 'toilets', 'night'],
      'Herefordshire pools in quiet countryside near Leominster.', null),
    v('sywell', 'Sywell Reservoir', 'reservoir', 52.2900, -0.7700, 8, 3.8,
      { stock: 3, access: 4, facilities: 3, value: 5 },
      ['carp', 'bream', 'roach', 'tench', 'pike', 'perch'],
      ['parking', 'toilets', 'cafe'],
      'Northamptonshire country park reservoir with day-ticket coarse fishing.', null),
    v('ravensthorpe', 'Ravensthorpe Reservoir', 'reservoir', 52.3300, -0.9800, 28, 4.1,
      { stock: 4, access: 3, facilities: 3, value: 4 },
      ['rainbow-trout', 'brown-trout'],
      ['parking', 'toilets'],
      'Small, intimate Northamptonshire trout reservoir.', null),
    v('earlswood', 'Earlswood Lakes', 'stillwater', 52.3600, -1.8500, 6, 3.6,
      { stock: 3, access: 4, facilities: 2, value: 5 },
      ['carp', 'bream', 'roach', 'perch', 'pike', 'tench'],
      ['parking', 'cafe'],
      'Three canal feeder pools south of Solihull. Cheap, busy and full of fish.', null),
    v('coombe-abbey', 'Coombe Abbey Lake', 'stillwater', 52.4200, -1.4000, 8, 3.8,
      { stock: 3, access: 4, facilities: 4, value: 4 },
      ['carp', 'bream', 'roach', 'tench', 'pike', 'perch'],
      ['parking', 'toilets', 'cafe'],
      'Big, old country-park lake near Coventry. Weedy, snaggy and full of character.', null),
    v('chasewater', 'Chasewater', 'reservoir', 52.6600, -1.9300, 8, 3.7,
      { stock: 3, access: 4, facilities: 3, value: 5 },
      ['pike', 'perch', 'roach', 'bream', 'carp'],
      ['parking', 'toilets', 'cafe'],
      'Large Staffordshire reservoir and country park.', null),
    v('shustoke', 'Shustoke Reservoir', 'reservoir', 52.5100, -1.6300, 26, 4.0,
      { stock: 4, access: 4, facilities: 2, value: 4 },
      ['rainbow-trout', 'brown-trout'],
      ['parking', 'toilets'],
      'North Warwickshire fly-only trout reservoir.', null),
    v('trent-burton', 'River Trent at Burton', 'river', 52.8000, -1.6300, 5, 4.0,
      { stock: 4, access: 4, facilities: 2, value: 5 },
      ['barbel', 'chub', 'roach', 'dace', 'bream', 'pike', 'perch'],
      ['parking'],
      'Upper-middle Trent, strong barbel and chub water on club stretches.', null),
    v('soar-leicester', 'River Soar, Leicester', 'river', 52.6400, -1.1400, 0, 3.5,
      { stock: 3, access: 5, facilities: 3, value: 5 },
      ['roach', 'bream', 'perch', 'pike', 'chub', 'carp', 'zander'],
      ['parking', 'toilets'],
      'Urban river and navigation with free and club water through the city.', null),
    v('gu-braunston', 'Grand Union Canal, Braunston', 'canal', 52.2800, -1.2000, 0, 3.6,
      { stock: 3, access: 4, facilities: 3, value: 5 },
      ['roach', 'perch', 'bream', 'carp', 'pike', 'zander', 'gudgeon', 'tench'],
      ['parking', 'cafe'],
      'Busy boating length with good perch and zander round the marina and locks.', null),

    /* ---------------- north ---------------- */
    v('rudyard', 'Rudyard Lake', 'reservoir', 53.1400, -2.0500, 8, 3.8,
      { stock: 3, access: 4, facilities: 3, value: 5 },
      ['pike', 'perch', 'bream', 'roach', 'carp'],
      ['parking', 'toilets', 'cafe'],
      'Staffordshire Moorlands lake with a long pike-fishing history.', null),
    v('tittesworth', 'Tittesworth Reservoir', 'reservoir', 53.1300, -1.9900, 26, 4.0,
      { stock: 4, access: 4, facilities: 4, value: 4 },
      ['rainbow-trout', 'brown-trout'],
      ['parking', 'toilets', 'cafe', 'accessible'],
      'Peak District trout reservoir with good visitor facilities.', null),
    v('redesmere', 'Redesmere', 'stillwater', 53.2500, -2.2200, 8, 3.7,
      { stock: 3, access: 4, facilities: 2, value: 5 },
      ['bream', 'roach', 'perch', 'pike', 'carp', 'tench'],
      ['parking'],
      'Cheshire mere near Siddington, club-controlled.', null),
    v('pennington-flash', 'Pennington Flash', 'stillwater', 53.4700, -2.5100, 6, 3.7,
      { stock: 3, access: 5, facilities: 4, value: 5 },
      ['bream', 'roach', 'perch', 'pike', 'carp', 'tench'],
      ['parking', 'toilets', 'cafe', 'accessible'],
      'Large subsidence flash near Leigh, in a country park.', null),
    v('esthwaite', 'Esthwaite Water', 'stillwater', 54.3600, -3.0000, 30, 4.4,
      { stock: 5, access: 4, facilities: 4, value: 3 },
      ['rainbow-trout', 'brown-trout', 'pike', 'perch'],
      ['parking', 'toilets', 'cafe', 'bailiff'],
      'Lake District day-ticket water famous for both stocked trout and very big pike.', null),
    v('windermere', 'Windermere', 'stillwater', 54.3700, -2.9300, null, 4.2,
      { stock: 4, access: 4, facilities: 4, value: 4 },
      ['pike', 'perch', 'brown-trout', 'roach'],
      ['parking', 'toilets', 'cafe'],
      'England’s largest lake. Pike and perch fishing, with permits from local associations.', null),
    v('coniston', 'Coniston Water', 'stillwater', 54.3400, -3.0700, null, 4.1,
      { stock: 4, access: 3, facilities: 3, value: 4 },
      ['pike', 'perch', 'brown-trout'],
      ['parking', 'toilets'],
      'Deep, clear Lakeland water with pike, perch and wild trout.', null),
    v('ullswater', 'Ullswater', 'stillwater', 54.5800, -2.8700, null, 4.2,
      { stock: 4, access: 3, facilities: 3, value: 4 },
      ['pike', 'perch', 'brown-trout'],
      ['parking', 'toilets'],
      'Long Lakeland lake. Permits are needed and vary by shoreline owner.', null),
    v('kielder', 'Kielder Water', 'reservoir', 55.1900, -2.5300, 26, 4.2,
      { stock: 4, access: 3, facilities: 4, value: 4 },
      ['brown-trout', 'rainbow-trout', 'pike'],
      ['parking', 'toilets', 'cafe'],
      'Northern Europe’s largest man-made lake, in Northumberland forest.', null),
    v('fewston', 'Fewston & Swinsty Reservoirs', 'reservoir', 53.9700, -1.6400, 26, 4.0,
      { stock: 4, access: 4, facilities: 3, value: 4 },
      ['rainbow-trout', 'brown-trout'],
      ['parking', 'toilets', 'cafe'],
      'Washburn Valley trout reservoirs near Harrogate.', null),
    v('hornsea-mere', 'Hornsea Mere', 'stillwater', 53.9100, -0.1900, 10, 3.8,
      { stock: 3, access: 4, facilities: 3, value: 4 },
      ['pike', 'perch', 'bream', 'roach'],
      ['parking', 'toilets', 'cafe'],
      'The largest freshwater lake in Yorkshire. Boat fishing for pike.', null),
    v('aire-leeds', 'River Aire, Leeds', 'river', 53.7900, -1.5500, 5, 3.6,
      { stock: 3, access: 4, facilities: 3, value: 5 },
      ['chub', 'barbel', 'roach', 'dace', 'perch', 'pike'],
      ['parking'],
      'Much-improved urban river with a genuine barbel and chub head now.', null),
    v('tyne-hexham', 'River Tyne at Hexham', 'river', 54.9700, -2.1000, null, 4.3,
      { stock: 5, access: 3, facilities: 3, value: 3 },
      ['salmon', 'sea-trout', 'brown-trout', 'grayling', 'chub'],
      ['parking'],
      'One of England’s best salmon rivers. Beats are permit-controlled and priced separately.', null),
    v('tees-yarm', 'River Tees at Yarm', 'river', 54.5100, -1.3500, 5, 3.6,
      { stock: 3, access: 4, facilities: 3, value: 5 },
      ['chub', 'barbel', 'dace', 'roach', 'grayling', 'brown-trout'],
      ['parking', 'toilets'],
      'Club water through the town, with barbel and chub.', null),

    /* ---------------- wales ---------------- */
    v('llyn-tegid', 'Llyn Tegid (Bala Lake)', 'stillwater', 52.8900, -3.6300, 10, 4.1,
      { stock: 3, access: 4, facilities: 3, value: 5 },
      ['pike', 'perch', 'roach', 'brown-trout'],
      ['parking', 'toilets', 'cafe'],
      'The largest natural lake in Wales. Pike, perch and the rare gwyniad (protected).', null),
    v('llyn-trawsfynydd', 'Llyn Trawsfynydd', 'reservoir', 52.9200, -3.9400, 20, 4.0,
      { stock: 4, access: 3, facilities: 2, value: 4 },
      ['rainbow-trout', 'brown-trout', 'perch'],
      ['parking', 'toilets'],
      'Snowdonia reservoir with a long trout-fishing history.', null),
    v('llyn-clywedog', 'Llyn Clywedog', 'reservoir', 52.4800, -3.5700, 18, 4.0,
      { stock: 4, access: 3, facilities: 2, value: 4 },
      ['rainbow-trout', 'brown-trout'],
      ['parking', 'toilets'],
      'Deep mid-Wales reservoir in steep valley scenery.', null),
    v('llangorse', 'Llangorse Lake', 'stillwater', 51.9300, -3.2700, 10, 3.9,
      { stock: 3, access: 4, facilities: 3, value: 4 },
      ['pike', 'perch', 'roach', 'bream', 'tench', 'eel'],
      ['parking', 'toilets', 'cafe'],
      'Natural Brecon Beacons lake, shallow and weedy, with a big pike reputation.', null),
    v('usk-abergavenny', 'River Usk at Abergavenny', 'river', 51.8200, -3.0200, 15, 4.2,
      { stock: 4, access: 3, facilities: 2, value: 4 },
      ['brown-trout', 'grayling', 'salmon', 'chub'],
      ['parking'],
      'Classic Welsh freestone trout river. Wild browns and superb dry-fly water.', null),
    v('taff-cardiff', 'River Taff, Cardiff', 'river', 51.4900, -3.1900, 5, 3.7,
      { stock: 3, access: 5, facilities: 3, value: 5 },
      ['brown-trout', 'chub', 'dace', 'grayling', 'salmon', 'sea-trout'],
      ['parking', 'toilets'],
      'A recovered industrial river running right through the city.', null),
    v('cardiff-bay', 'Cardiff Bay', 'stillwater', 51.4500, -3.1700, 0, 3.6,
      { stock: 3, access: 5, facilities: 4, value: 5 },
      ['bass', 'mullet', 'roach', 'perch', 'pike', 'eel'],
      ['parking', 'toilets', 'cafe', 'accessible'],
      'Impounded freshwater bay with easy access. A free permit scheme applies to much of it.', null),

    /* ---------------- scotland ---------------- */
    v('loch-ken', 'Loch Ken', 'stillwater', 55.0000, -4.0500, 10, 4.2,
      { stock: 4, access: 3, facilities: 2, value: 5 },
      ['pike', 'perch', 'roach', 'brown-trout'],
      ['parking'],
      'Galloway loch with a long-standing reputation for very big pike.', null),
    v('loch-leven', 'Loch Leven', 'stillwater', 56.2000, -3.3800, 40, 4.4,
      { stock: 5, access: 4, facilities: 4, value: 3 },
      ['brown-trout', 'rainbow-trout'],
      ['parking', 'toilets', 'cafe'],
      'Historic Kinross trout loch, fished from boats. A famous name in fly fishing.', null),
    v('loch-tay', 'Loch Tay', 'stillwater', 56.5200, -4.1500, null, 4.1,
      { stock: 4, access: 3, facilities: 3, value: 4 },
      ['brown-trout', 'pike', 'perch', 'salmon'],
      ['parking', 'toilets'],
      'Big Perthshire loch. Salmon and ferox trout, mostly fished from boats.', null),
    v('loch-ness', 'Loch Ness', 'stillwater', 57.3200, -4.4300, null, 3.9,
      { stock: 3, access: 3, facilities: 3, value: 4 },
      ['brown-trout', 'pike', 'perch', 'salmon'],
      ['parking', 'toilets', 'cafe'],
      'Enormous and very deep. Hard fishing, and permits vary by stretch.', null),
    v('tay-perth', 'River Tay at Perth', 'river', 56.3900, -3.4300, null, 4.5,
      { stock: 5, access: 3, facilities: 3, value: 2 },
      ['salmon', 'sea-trout', 'brown-trout', 'grayling', 'pike'],
      ['parking'],
      'Britain’s biggest salmon river by volume. Beats are let individually.', null),
    v('spey-aberlour', 'River Spey at Aberlour', 'river', 57.4700, -3.2200, null, 4.6,
      { stock: 5, access: 3, facilities: 3, value: 2 },
      ['salmon', 'sea-trout', 'brown-trout'],
      ['parking'],
      'Fast, clean and world-famous for salmon. Association and estate beats.', null),
    v('clyde-glasgow', 'River Clyde, Glasgow', 'river', 55.8600, -4.2500, 8, 3.6,
      { stock: 3, access: 5, facilities: 3, value: 5 },
      ['brown-trout', 'grayling', 'chub', 'roach', 'dace', 'salmon'],
      ['parking', 'toilets'],
      'Much-improved city river with grayling and wild brown trout on association water.', null),

    /* ---------------- more coastal ---------------- */
    v('portland-bill', 'Portland Bill', 'coastal', 50.5150, -2.4560, 0, 4.3,
      { stock: 5, access: 2, facilities: 2, value: 5 },
      ['pollack', 'wrasse', 'mackerel', 'bass', 'cod'],
      ['parking', 'cafe'],
      'Deep water and fierce tides off the rocks. Big pollack and wrasse — and a serious mark, so take care.', null),
    v('weymouth-stone-pier', 'Weymouth Stone Pier', 'coastal', 50.6080, -2.4460, 0, 4.0,
      { stock: 4, access: 4, facilities: 4, value: 5 },
      ['mackerel', 'bass', 'pollack', 'wrasse', 'garfish', 'flounder'],
      ['parking', 'toilets', 'cafe'],
      'Popular and productive harbour-mouth mark.', null),
    v('swanage-pier', 'Swanage Pier', 'coastal', 50.6070, -1.9500, 0, 3.9,
      { stock: 3, access: 4, facilities: 4, value: 4 },
      ['bass', 'mackerel', 'wrasse', 'pollack', 'garfish', 'mullet'],
      ['parking', 'toilets', 'cafe'],
      'Sheltered Dorset pier. Ticketed, with set hours.', null),
    v('plymouth-mount-batten', 'Mount Batten Pier, Plymouth', 'coastal', 50.3600, -4.1280, 0, 4.0,
      { stock: 4, access: 5, facilities: 3, value: 5 },
      ['bass', 'mackerel', 'pollack', 'wrasse', 'garfish', 'mullet'],
      ['parking', 'toilets', 'cafe'],
      'Easy deep-water access in Plymouth Sound.', null),
    v('newquay-harbour', 'Newquay Harbour', 'coastal', 50.4180, -5.0870, 0, 3.7,
      { stock: 3, access: 4, facilities: 4, value: 5 },
      ['mackerel', 'bass', 'pollack', 'wrasse', 'mullet', 'garfish'],
      ['parking', 'toilets', 'cafe'],
      'Sheltered Cornish harbour marks and nearby rock ledges.', null),
    v('blackpool-north-pier', 'Blackpool North Pier', 'coastal', 53.8200, -3.0560, 0, 3.6,
      { stock: 3, access: 5, facilities: 4, value: 4 },
      ['cod', 'whiting', 'flounder', 'bass', 'dogfish'],
      ['parking', 'toilets', 'cafe', 'accessible'],
      'Classic Lancashire pier fishing, best after dark in winter.', null),
    v('llandudno-pier', 'Llandudno Pier', 'coastal', 53.3280, -3.8250, 0, 3.8,
      { stock: 3, access: 5, facilities: 4, value: 4 },
      ['mackerel', 'whiting', 'bass', 'flounder', 'pollack'],
      ['parking', 'toilets', 'cafe', 'accessible'],
      'North Wales pier with easy access and good summer mackerel.', null),
    v('cromer-pier', 'Cromer Pier', 'coastal', 52.9330, 1.3020, 0, 3.9,
      { stock: 4, access: 4, facilities: 4, value: 4 },
      ['cod', 'whiting', 'bass', 'mackerel', 'flounder', 'smoothhound'],
      ['parking', 'toilets', 'cafe'],
      'North Norfolk pier, strong autumn and winter cod and whiting.', null),
    v('skegness-pier', 'Skegness Pier', 'coastal', 53.1420, 0.3450, 0, 3.5,
      { stock: 3, access: 5, facilities: 4, value: 4 },
      ['whiting', 'cod', 'flounder', 'bass', 'plaice'],
      ['parking', 'toilets', 'cafe'],
      'Lincolnshire beach and pier marks over clean sand.', null),
    v('tynemouth-pier', 'Tynemouth Pier', 'coastal', 55.0170, -1.4100, 0, 4.0,
      { stock: 4, access: 3, facilities: 3, value: 5 },
      ['cod', 'whiting', 'mackerel', 'pollack', 'bass', 'wrasse'],
      ['parking', 'toilets'],
      'North East pier with deep water. Closed in heavy weather.', null),
    v('deal-pier', 'Deal Pier', 'coastal', 51.2230, 1.4050, 0, 4.1,
      { stock: 4, access: 5, facilities: 4, value: 5 },
      ['cod', 'whiting', 'bass', 'smoothhound', 'plaice', 'dogfish'],
      ['parking', 'toilets', 'cafe', 'accessible'],
      'Purpose-built for anglers, with deep water and a tackle shop and café on the pier.', null),
    v('aberdeen-beach', 'Aberdeen Beach', 'coastal', 57.1600, -2.0800, 0, 3.8,
      { stock: 3, access: 5, facilities: 4, value: 5 },
      ['cod', 'whiting', 'flounder', 'mackerel', 'bass'],
      ['parking', 'toilets', 'cafe'],
      'Long, clean sand beach with easy access from the city.', null)
  ];

  /* ----------------------------------------------------------- venue character */

  /* What a water is actually FOR. "Where do I go to catch a lot" and "where do I go for a
     big one" are different questions with different answers, and a star rating answers
     neither. Each venue gets one of these. */
  const CHARACTER = {
    numbers: {
      label: 'Bags of fish', short: 'Numbers',
      blurb: 'Come here to catch plenty. Steady bites, mostly modest fish, and hard to blank.',
      colour: '#4cc38a'
    },
    specimen: {
      label: 'Big fish water', short: 'Specimen',
      blurb: 'Come here for one big one. Long waits, few bites, and a real fish when it happens.',
      colour: '#d98a5b'
    },
    mixed: {
      label: 'Mixed', short: 'Mixed',
      blurb: 'A bit of everything — enough bites to stay interested, with the odd better fish.',
      colour: '#3fa7d6'
    },
    wild: {
      label: 'Wild and quiet', short: 'Wild',
      blurb: 'Natural, unstocked and moody. Harder fishing, better surroundings, nothing guaranteed.',
      colour: '#8e9fd6'
    },
    game: {
      label: 'Stocked game', short: 'Game',
      blurb: 'Stocked trout on fly gear. Reliable sport, and the stock level sets the standard.',
      colour: '#c9a227'
    }
  };

  /* Explicit where the water has a clear reputation. Everything else is derived below
     from what we do know — type, stock rating and species — rather than guessed at. */
  const CHARACTER_OF = {
    /* famous big-fish waters */
    linear: 'specimen', 'bluebell-lakes': 'specimen', 'anglers-paradise': 'specimen',
    walthamstow: 'specimen', chew: 'specimen', blithfield: 'specimen', 'loch-ken': 'specimen',
    'loch-awe': 'specimen', esthwaite: 'specimen', llandegfedd: 'specimen', 'avon-royalty': 'specimen',
    'wye-hereford': 'specimen', 'trent-newark': 'specimen', 'severn-bewdley': 'specimen',
    'drayton-res': 'specimen', 'llangorse': 'specimen', 'hornsea-mere': 'specimen',
    /* bite-a-chuck commercials and match complexes */
    'tunnel-barn': 'numbers', makins: 'numbers', partridge: 'numbers', lindholme: 'numbers',
    barston: 'numbers', viaduct: 'numbers', larford: 'numbers', 'white-acres': 'numbers',
    todber: 'numbers', 'monk-lakes': 'numbers', summerhayes: 'numbers', earlswood: 'numbers',
    cudmore: 'numbers', 'marsh-farm': 'numbers', twynersh: 'numbers',
    /* wild, natural or unstocked */
    'loch-lomond': 'wild', 'loch-ness': 'wild', 'loch-tay': 'wild', windermere: 'wild',
    coniston: 'wild', ullswater: 'wild', colliford: 'wild', 'llyn-tegid': 'wild',
    'usk-abergavenny': 'wild', 'tweed-kelso': 'wild', 'spey-aberlour': 'wild',
    'tay-perth': 'wild', 'tyne-hexham': 'wild', kielder: 'wild'
  };

  function characterOf(venue) {
    if (venue.character) return venue.character;
    if (CHARACTER_OF[venue.id]) return CHARACTER_OF[venue.id];
    if (venue.type === 'coastal') return 'wild';

    /* Predominantly a trout water is a game fishery, even where it also holds coarse fish.
       A big stocked reservoir is not a "bags of fish" commercial, whatever its stock score. */
    const GAME = ['rainbow-trout', 'brown-trout', 'grayling', 'salmon', 'sea-trout'];
    const sp = venue.species || [];
    if (sp.length && sp.filter((s) => GAME.includes(s)).length / sp.length >= 0.5) return 'game';

    if (venue.type === 'river' || venue.type === 'canal') return 'mixed';

    const stock = venue.breakdown && venue.breakdown.stock;
    /* "Numbers" means a heavily stocked commercial pool, so it is reserved for stillwaters. */
    if (venue.type === 'stillwater' && stock >= 5) return 'numbers';
    if (stock >= 4) return 'mixed';
    if (stock != null) return 'wild';
    return null;   /* unknown — an OSM water we know nothing about */
  }

  /* Water-type presentation. Colours are also used for the map pins. */
  const WATER_TYPES = {
    stillwater: { label: 'Stillwater', colour: '#3fa7d6', short: 'Lake' },
    reservoir:  { label: 'Reservoir',  colour: '#5c6bc0', short: 'Res' },
    river:      { label: 'River',      colour: '#43b581', short: 'River' },
    canal:      { label: 'Canal',      colour: '#c9a227', short: 'Canal' },
    coastal:    { label: 'Sea',        colour: '#ef7d57', short: 'Sea' }
  };

  G.data = {
    LICENCE, REGIONS, CLOSE_SEASON, RIGS, RIG_PARTS, KNOTS, SPECIES, VENUES, FACILITIES,
    WATER_TYPES, CHARACTER, characterOf,
    species: (id) => SPECIES.find((s) => s.id === id) || null,
    rig: (id) => RIGS.find((r) => r.id === id) || null,
    knot: (id) => KNOTS.find((k) => k.id === id) || null,
    facility: (id) => FACILITIES.find((f) => f.id === id) || null
  };
})(window.Cast = window.Cast || {});
