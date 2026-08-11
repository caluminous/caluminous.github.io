/* Cast — the thinking part: conditions, bite score, species likelihood, cost and legality.

   Every number this file produces is explainable. Nothing returns a bare score without
   the reasons behind it, because an angler should be able to disagree with the app. */
(function (G) {
  'use strict';

  const D = () => G.data;

  /* ------------------------------------------------------------- conditions */

  function nearestHourIndex(times, when) {
    const target = when.getTime();
    let best = 0, bestGap = Infinity;
    for (let i = 0; i < times.length; i++) {
      const gap = Math.abs(new Date(times[i]).getTime() - target);
      if (gap < bestGap) { bestGap = gap; best = i; }
    }
    return best;
  }

  function dayPhase(when, sunriseIso, sunsetIso) {
    if (!sunriseIso || !sunsetIso) {
      const h = when.getHours();
      if (h < 5 || h >= 21) return 'night';
      if (h < 8) return 'dawn';
      if (h >= 18) return 'dusk';
      return 'day';
    }
    const t = when.getTime();
    const rise = new Date(sunriseIso).getTime();
    const set = new Date(sunsetIso).getTime();
    const M = 60000;
    if (t >= rise - 45 * M && t <= rise + 90 * M) return 'dawn';
    if (t >= set - 90 * M && t <= set + 45 * M) return 'dusk';
    if (t > rise + 90 * M && t < set - 90 * M) return 'day';
    return 'night';
  }

  /* Pulls the numbers that actually matter to fish out of an Open-Meteo response. */
  function readConditions(forecast, when = new Date()) {
    if (!forecast || !forecast.hourly) {
      return { known: false, phase: dayPhase(when, null, null) };
    }
    const h = forecast.hourly;
    const i = nearestHourIndex(h.time, when);
    const at = (arr, idx) => (arr && arr[idx] != null ? arr[idx] : null);

    const pressure = at(h.surface_pressure, i);
    const pressure3hAgo = at(h.surface_pressure, Math.max(0, i - 3));
    const trend = (pressure != null && pressure3hAgo != null) ? pressure - pressure3hAgo : null;

    let rain24 = 0;
    for (let k = Math.max(0, i - 24); k < i; k++) rain24 += at(h.precipitation, k) || 0;

    /* Pick today's sunrise/sunset out of the daily arrays. */
    let sunrise = null, sunset = null;
    if (forecast.daily && forecast.daily.time) {
      const day = when.toISOString().slice(0, 10);
      const di = forecast.daily.time.indexOf(day);
      if (di >= 0) {
        sunrise = forecast.daily.sunrise[di];
        sunset = forecast.daily.sunset[di];
      }
    }

    return {
      known: true,
      when,
      index: i,
      tempC: at(h.temperature_2m, i),
      pressure,
      pressureTrend: trend,
      cloud: at(h.cloud_cover, i),
      rain: at(h.precipitation, i),
      rain24,
      wind: at(h.wind_speed_10m, i),
      windDir: at(h.wind_direction_10m, i),
      sunrise, sunset,
      phase: dayPhase(when, sunrise, sunset),
      /* No water thermometer here — air temperature stands in for it, and the UI says so. */
      waterProxy: true,
      /* A rough read on clarity from recent rain, used to steer bait choice. */
      clarity: rain24 > 12 ? 'coloured' : rain24 > 3 ? 'tinged' : 'clear'
    };
  }

  /* ------------------------------------------------------------- bite score */

  const PHASE_LABEL = { dawn: 'First light', day: 'Middle of the day', dusk: 'Last light', night: 'After dark' };

  function biteScore(c) {
    if (!c || !c.known) {
      return { score: null, band: 'No forecast', reasons: [{ sign: 0, text: 'No forecast available — this is a guess at best.' }] };
    }
    let score = 50;
    const reasons = [];
    const add = (n, text) => { score += n; reasons.push({ sign: Math.sign(n), weight: Math.abs(n), text }); };

    if (c.pressureTrend != null) {
      const t = c.pressureTrend;
      if (t <= -2) add(14, `Pressure falling ${Math.abs(t).toFixed(1)} mb in 3 hours — fish usually switch on ahead of weather.`);
      else if (t <= -0.5) add(8, 'Pressure easing gently — a good sign.');
      else if (t < 0.5) add(2, 'Pressure steady.');
      else if (t < 2) add(-4, 'Pressure creeping up.');
      else add(-10, `Pressure climbing ${t.toFixed(1)} mb in 3 hours — often kills sport for a day.`);
    }
    if (c.pressure != null) {
      if (c.pressure > 1026) add(-6, 'High pressure and bright — expect fish to sit deep and sulk.');
      else if (c.pressure >= 1000 && c.pressure <= 1016) add(6, 'Pressure in the settled band fish like.');
      else if (c.pressure < 995) add(-3, 'Very low pressure — unsettled, could go either way.');
    }
    if (c.cloud != null) {
      if (c.cloud >= 60) add(8, 'Good cloud cover keeping the light down.');
      else if (c.cloud < 20) add(-6, 'Clear skies — fish will be spooky and deep.');
    }
    if (c.wind != null) {
      if (c.wind < 4) add(-6, 'Flat calm. Everything can see you coming.');
      else if (c.wind <= 22) add(6, 'A useful ripple on the water.');
      else if (c.wind > 38) add(-8, 'Too windy to present a bait properly.');
    }
    if (c.rain != null) {
      if (c.rain > 0.1 && c.rain <= 2) add(5, 'Light rain — often the best hour of the day.');
      else if (c.rain > 5) add(-6, 'Heavy rain. Miserable, and the water will be rising.');
    }
    if (c.tempC != null) {
      if (c.tempC < 3) add(-8, `${Math.round(c.tempC)} °C — cold enough that most fish will barely move.`);
      else if (c.tempC <= 8) add(-2, `${Math.round(c.tempC)} °C — cold, so scale down and slow down.`);
      else if (c.tempC <= 21) add(6, `${Math.round(c.tempC)} °C — comfortable feeding temperature.`);
      else if (c.tempC > 27) add(-4, `${Math.round(c.tempC)} °C — hot. Fish early, late, or in the shade.`);
    }
    if (c.phase === 'dawn' || c.phase === 'dusk') add(10, `${PHASE_LABEL[c.phase]} — the best window of the day.`);
    else if (c.phase === 'night') add(4, 'After dark suits the bigger fish.');
    else add(-2, 'Middle of the day is usually the quietest spell.');

    score = Math.max(5, Math.min(95, Math.round(score)));
    reasons.sort((a, b) => b.weight - a.weight);
    return {
      score,
      band: score >= 72 ? 'Drop everything' : score >= 58 ? 'Worth a go' : score >= 42 ? 'Steady' : 'Hard work',
      reasons
    };
  }

  /* ------------------------------------------------- species likelihood */

  const SEASON_SCORE = [0, 28, 62, 88];
  const TIME_FACTOR = [0.45, 0.72, 0.92, 1.12];

  function tempFactor(species, tempC) {
    if (tempC == null) return { f: 1, note: null };
    const [cold, lo, hi, hot] = species.temp;
    if (tempC < cold) return { f: 0.22, note: 'Too cold for them to feed properly.' };
    if (tempC < lo) return { f: 0.4 + 0.6 * ((tempC - cold) / Math.max(0.1, lo - cold)), note: 'On the cold side — expect slow, cautious bites.' };
    if (tempC <= hi) return { f: 1, note: 'Temperature is right in their comfortable band.' };
    if (tempC <= hot) return { f: 1 - 0.5 * ((tempC - hi) / Math.max(0.1, hot - hi)), note: 'Warm — they will feed early and late rather than all day.' };
    return { f: 0.3, note: 'Too warm. Fish at first light or not at all.' };
  }

  /* Is this species even here? Seeded venues carry a stock list; OSM-discovered waters
     do not, so fall back to what the water type could plausibly hold and say so. */
  function presence(species, venue) {
    if (!species.waters.includes(venue.type)) return { present: false, confident: true };
    if (venue.species && venue.species.length) {
      return { present: venue.species.includes(species.id), confident: true };
    }
    return { present: true, confident: false };
  }

  function likelihood(species, venue, conditions, when = new Date()) {
    const pres = presence(species, venue);
    if (!pres.present) return null;

    const month = when.getMonth();
    const seasonDigit = Number(species.season[month]);
    const reasons = [];

    let score = SEASON_SCORE[seasonDigit];
    if (seasonDigit === 0) {
      return {
        species, score: 0, band: 'Out of season',
        confident: pres.confident,
        reasons: [{ text: 'Wrong time of year for this fish.', sign: -1 }]
      };
    }
    reasons.push({
      sign: seasonDigit >= 2 ? 1 : 0,
      text: seasonDigit === 3 ? 'Prime month for them.'
        : seasonDigit === 2 ? 'A good month for them.'
        : 'Not their month, but catchable.'
    });

    const tf = tempFactor(species, conditions && conditions.tempC);
    score *= tf.f;
    if (tf.note) reasons.push({ sign: tf.f >= 1 ? 1 : -1, text: tf.note });

    const phase = (conditions && conditions.phase) || 'day';
    const timeWeight = species.times[phase] != null ? species.times[phase] : 1;
    score *= TIME_FACTOR[timeWeight];
    if (timeWeight >= 3) reasons.push({ sign: 1, text: `${PHASE_LABEL[phase]} is their best feeding window.` });
    else if (timeWeight === 0) reasons.push({ sign: -1, text: `They do not feed much ${phase === 'night' ? 'after dark' : 'at this time of day'}.` });

    const bite = biteScore(conditions);
    if (bite.score != null) score *= 0.78 + (bite.score / 100) * 0.44;

    score = Math.max(0, Math.min(100, Math.round(score)));
    return {
      species, score,
      band: score >= 68 ? 'Good bet' : score >= 44 ? 'Worth a go' : score >= 20 ? 'Long shot' : 'Unlikely',
      confident: pres.confident,
      reasons
    };
  }

  function rankSpecies(venue, conditions, when = new Date()) {
    return D().SPECIES
      .map((s) => likelihood(s, venue, conditions, when))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
  }

  /* ------------------------------------------------- tactics for right now */

  function tacticsFor(species, conditions) {
    const rigs = species.rigs.map((id) => D().rig(id)).filter(Boolean);
    const notes = [];
    const t = conditions && conditions.tempC;

    if (t != null && t < species.temp[1] && species.cold) notes.push({ tag: 'Cold water', text: species.cold });
    else if (t != null && t > species.temp[2] && species.warm) notes.push({ tag: 'Warm water', text: species.warm });

    if (conditions && conditions.clarity === 'coloured') {
      notes.push({
        tag: 'Coloured water',
        text: 'The water will be carrying colour after recent rain. Go bigger and smellier, and fish close in — ' +
              'fish hug the margins and slacks when a water is up.'
      });
    } else if (conditions && conditions.clarity === 'clear' && conditions.cloud != null && conditions.cloud < 25) {
      notes.push({
        tag: 'Clear and bright',
        text: 'Clear water and hard light. Drop a hook size, lengthen the hooklength, and stay off the skyline.'
      });
    }
    if (conditions && conditions.phase === 'night') {
      notes.push({ tag: 'After dark', text: 'Set the swim up in daylight so you are not fumbling in the dark. Isotope or bite alarm on the rod.' });
    }
    if (species.warning) notes.push({ tag: 'Important', text: species.warning, warn: true });

    return { primary: rigs[0] || null, rigs, notes };
  }

  /* --------------------------------------------------------------- legality */

  function closeSeason(venue, country, when = new Date()) {
    const cs = D().CLOSE_SEASON;
    const region = D().REGIONS[country] || D().REGIONS.England;
    if (!region.riverCloseSeason) return { closed: false };
    if (!cs.appliesTo.includes(venue.type)) return { closed: false };

    const m = when.getMonth() + 1, d = when.getDate();
    const after = (m > cs.startMonth) || (m === cs.startMonth && d >= cs.startDay);
    const before = (m < cs.endMonth) || (m === cs.endMonth && d <= cs.endDay);
    if (after && before) {
      return {
        closed: true,
        scope: 'coarse',
        label: cs.label,
        reason: `Coarse close season (${cs.label}) — no coarse fishing on rivers, streams or drains in England and Wales.`,
        note: 'Game fishing may still be open here if you hold the right licence and permission.'
      };
    }
    return { closed: false };
  }

  function prices() {
    return (G.store.state.licencePrices) || D().LICENCE;
  }

  /* What the law requires at this venue, and what today costs. */
  function licenceFor(venue, country) {
    const region = D().REGIONS[country] || D().REGIONS.England;
    if (venue.type === 'coastal') {
      return {
        kind: 'none', body: null,
        headline: 'No rod licence needed',
        detail: 'Sea fishing from the shore needs no rod licence anywhere in Great Britain. ' +
                'Size limits and bag limits still apply to what you keep.'
      };
    }
    if (region.licence === 'none') {
      return {
        kind: 'permission', body: region.body,
        headline: 'No rod licence — but you still need permission',
        detail: region.note
      };
    }
    if (region.licence === 'ni') {
      return {
        kind: 'ni', body: region.body,
        headline: 'Rod licence and permit both required',
        detail: region.note
      };
    }
    return {
      kind: 'ea', body: region.body,
      headline: 'Environment Agency rod licence required',
      detail: region.note
    };
  }

  function hasValidLicence(profile, when = new Date()) {
    if (profile.under13) return { covered: true, why: 'Under 13 — no licence needed.' };
    if (profile.licenceType === 'none') return { covered: false };
    if (!profile.licenceExpiry) return { covered: false };
    const exp = new Date(profile.licenceExpiry + 'T23:59:59');
    if (exp >= when) {
      return { covered: true, why: `Your ${profile.licenceType === 'salmon' ? 'salmon and sea trout' : 'trout and coarse'} licence runs to ${exp.toLocaleDateString('en-GB')}.` };
    }
    return { covered: false, why: `Your saved licence expired on ${exp.toLocaleDateString('en-GB')}.` };
  }

  /* One honest number for "what does fishing here today cost me". */
  function costToday(venue, country, when = new Date()) {
    const profile = G.store.state.profile;
    const P = prices();
    const licence = licenceFor(venue, country);
    const override = G.store.state.overrides[venue.id] || {};
    const ticket = override.ticket != null ? override.ticket : venue.ticket;

    const lines = [];
    let total = 0;
    let unknown = false;

    if (licence.kind === 'ea') {
      const held = hasValidLicence(profile, when);
      const type = P.types.find((t) => t.id === (profile.licenceType !== 'none' ? profile.licenceType : 'coarse2')) || P.types[0];
      if (held.covered) {
        lines.push({ label: 'Rod licence', amount: 0, note: held.why || 'Already covered.' });
      } else if (profile.junior) {
        lines.push({ label: 'Rod licence (13–16)', amount: 0, note: 'Free, but you must still register for a £0 junior licence before you fish.' });
      } else {
        const day = type.day != null ? type.day : P.types[0].day;
        lines.push({
          label: '1-day rod licence',
          amount: day,
          note: `${type.label}. 8-day ${money(type.week)}, annual ${money(profile.concession && type.concession ? type.concession : type.year)}.`
        });
        total += day || 0;
        if (day == null) unknown = true;
      }
    } else if (licence.kind === 'ni') {
      lines.push({ label: 'Rod licence + permit', amount: null, note: 'Set by DAERA / the Loughs Agency — check current prices.' });
      unknown = true;
    } else if (licence.kind === 'permission') {
      lines.push({ label: 'Rod licence', amount: 0, note: 'None exists in Scotland — but you must have the owner’s permission.' });
    } else {
      lines.push({ label: 'Rod licence', amount: 0, note: 'Not required for shore sea fishing.' });
    }

    if (ticket == null) {
      lines.push({ label: 'Venue permission', amount: null, note: 'Not recorded — check with the fishery or club before you travel.' });
      unknown = true;
    } else if (ticket === 0) {
      lines.push({ label: 'Venue permission', amount: 0, note: venue.type === 'coastal' ? 'Free shore mark.' : 'Free or club-controlled water — confirm which before you fish.' });
    } else {
      lines.push({ label: 'Day ticket', amount: ticket, note: 'Indicative price — always confirm with the fishery.' });
      total += ticket;
    }

    return { lines, total, unknown, licence };
  }

  function money(n) {
    if (n == null) return '—';
    return '£' + (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '');
  }

  /* ---------------------------------------------------------------- ratings */

  /* Three separate things, never blended into one dishonest number:
     the seeded editorial rating, this angler's own stars, and their real hit rate here. */
  function ratingFor(venue) {
    const mine = G.store.state.ratings[venue.id] || null;
    const logged = G.store.catchesAt(venue.id);
    const sessions = new Set(logged.map((c) => c.date)).size;
    return {
      seed: venue.rating,
      seedIsEditorial: venue.source === 'seed',
      mine,
      display: mine != null ? mine : venue.rating,
      displayIsMine: mine != null,
      breakdown: venue.breakdown || null,
      myCatches: logged.length,
      mySessions: sessions,
      myBest: logged.reduce((best, c) => (c.weightLb && (!best || c.weightLb > best.weightLb) ? c : best), null)
    };
  }

  G.tactics = {
    readConditions, biteScore, likelihood, rankSpecies, tacticsFor,
    closeSeason, licenceFor, hasValidLicence, costToday, ratingFor, prices,
    money, dayPhase, PHASE_LABEL
  };
})(window.Cast = window.Cast || {});
