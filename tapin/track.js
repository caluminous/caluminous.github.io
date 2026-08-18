/* Tap In — measuring the work when there is no machine to read it off.

   Two independent sensors, either of which is useful on its own:

   GPS gives distance and pace outdoors. Raw fixes are far too noisy to
   simply add up — standing still on a bad fix will happily invent a
   kilometre — so every fix is filtered on accuracy, on implied speed, and
   against a movement floor scaled to the reported accuracy.

   The accelerometer gives steps and cadence, indoors as well as out, by
   peak-picking the vertical bounce of a stride. Where both are running at
   once the GPS distance calibrates the stride length, so the step counter
   keeps measuring distance honestly once you go indoors or lose signal.

   Neither runs in the background. A web page cannot count your steps all
   day; this counts them during a session, while the app is open and the
   screen is awake. The app says so rather than pretending otherwise. */
(function (G) {
  'use strict';

  const EARTH_R = 6371008.8;

  /* ---------------- shared state ----------------
     Read by the app's one-second ticker rather than pushed through events,
     which keeps sensor updates from triggering renders. */

  const state = {
    running: false,
    paused: false,
    gps: {
      on: false, status: 'off', error: null,
      accuracy: null, distanceM: 0, speedMps: 0,
      fixes: 0, used: 0, points: [], startedAt: null
    },
    steps: {
      on: false, status: 'off', error: null,
      count: 0, cadence: 0, rate: 0
    }
  };

  function snapshot() { return state; }

  /* ---------------- geometry ---------------- */

  function haversine(lat1, lon1, lat2, lon2) {
    const toRad = Math.PI / 180;
    const dLat = (lat2 - lat1) * toRad;
    const dLon = (lon2 - lon1) * toRad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /* ---------------- GPS ---------------- */

  let watchId = null;
  let ref = null;           /* last fix we accepted distance from */
  let speedEma = 0;

  /* Anything faster than this on the given activity is a bad fix, not a
     personal best. */
  function maxSpeedFor(typeId) {
    if (typeId === 'ride') return 30;      /* 108 km/h — downhill on a bike */
    if (typeId === 'swim') return 4;
    return 9;                              /* 32 km/h — faster than a sprint */
  }

  const gpsSupported = () => 'geolocation' in navigator;

  function startGps(typeId) {
    if (!gpsSupported()) { state.gps.status = 'unsupported'; state.gps.error = 'This browser has no location access.'; return false; }
    if (state.gps.on) return true;
    state.gps.on = true;
    state.gps.status = 'acquiring';
    state.gps.error = null;
    state.gps.startedAt = Date.now();
    ref = null;
    speedEma = 0;
    const maxSpeed = maxSpeedFor(typeId);

    watchId = navigator.geolocation.watchPosition(
      pos => onFix(pos, maxSpeed),
      err => {
        state.gps.status = err.code === 1 ? 'denied' : 'error';
        state.gps.error = err.code === 1
          ? 'Location permission was refused. Allow it in the site settings to measure distance.'
          : err.code === 3
            ? 'No GPS fix yet — this can take a minute outdoors, and will not happen indoors.'
            : 'Location is unavailable.';
      },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 20000 }
    );
    return true;
  }

  function onFix(pos, maxSpeed) {
    const c = pos.coords;
    state.gps.fixes++;
    state.gps.accuracy = c.accuracy;

    /* A fix this vague tells us nothing worth adding up. */
    if (!(c.accuracy <= 40)) {
      state.gps.status = 'poor';
      return;
    }

    const now = pos.timestamp || Date.now();
    if (!ref) {
      ref = { lat: c.latitude, lon: c.longitude, t: now, acc: c.accuracy };
      state.gps.status = 'good';
      pushPoint(c.latitude, c.longitude, now, true);
      return;
    }

    const d = haversine(ref.lat, ref.lon, c.latitude, c.longitude);
    const dt = (now - ref.t) / 1000;
    if (dt <= 0) return;

    /* Teleports are dropped outright, and the reference is left alone so
       the next good fix is measured from somewhere real. */
    if (d / dt > maxSpeed) { state.gps.status = 'poor'; return; }

    /* Below the noise floor we are standing still, however much the dot
       wanders. Keeping the old reference means genuine slow movement still
       accumulates over the next few fixes instead of being lost. */
    const floor = Math.max(3, c.accuracy * 0.5);
    if (d < floor) { state.gps.status = 'good'; return; }

    if (!state.paused) {
      state.gps.distanceM += d;
      state.gps.used++;
      const inst = d / dt;
      speedEma = speedEma > 0 ? speedEma * 0.7 + inst * 0.3 : inst;
      state.gps.speedMps = speedEma;
      pushPoint(c.latitude, c.longitude, now, false);
    }
    ref = { lat: c.latitude, lon: c.longitude, t: now, acc: c.accuracy };
    state.gps.status = 'good';
  }

  /* The route is kept only densely enough to draw its shape, and halved
     whenever it gets long, so a two-hour ride cannot fill up storage. */
  const MAX_POINTS = 600;
  function pushPoint(lat, lon, t, force) {
    const pts = state.gps.points;
    const last = pts[pts.length - 1];
    if (!force && last && haversine(last[0], last[1], lat, lon) < 8) return;
    pts.push([Math.round(lat * 1e5) / 1e5, Math.round(lon * 1e5) / 1e5, t]);
    if (pts.length > MAX_POINTS) {
      state.gps.points = pts.filter((p, i) => i % 2 === 0 || i === pts.length - 1);
    }
  }

  function stopGps() {
    if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) { /* already gone */ } }
    watchId = null;
    state.gps.on = false;
    if (state.gps.status === 'acquiring' || state.gps.status === 'good' || state.gps.status === 'poor') state.gps.status = 'off';
  }

  /* ---------------- steps ----------------

     Stride detection on the acceleration magnitude: strip gravity with a
     slow average, smooth what is left, and count the peaks that clear a
     threshold set from the recent swing of the signal. The refractory
     window rejects the double-taps that come from arm swing and phone
     rattle without losing genuine fast cadence. */

  let sensor = null;
  let motionHandler = null;
  let grav = 0, smooth = 0;
  let envHi = 0, envLo = 0;
  let above = false, peak = 0, peakT = 0, lastStepT = 0;
  let recentSteps = [];

  const MIN_STEP_MS = 240;    /* 250 steps a minute is faster than anyone runs */
  const MAX_GAP_MS = 2500;    /* longer than this and you stopped, so restart cadence */

  const motionSupported = () =>
    typeof window.Accelerometer === 'function' || 'ondevicemotion' in window;

  /* iOS hands out motion data only after an explicit request made from a
     user gesture, so the app has a button for it. */
  const motionNeedsPermission = () =>
    typeof window.DeviceMotionEvent !== 'undefined' &&
    typeof window.DeviceMotionEvent.requestPermission === 'function';

  async function requestMotionPermission() {
    if (!motionNeedsPermission()) return true;
    try {
      const res = await window.DeviceMotionEvent.requestPermission();
      return res === 'granted';
    } catch (e) {
      return false;
    }
  }

  function startSteps() {
    if (!motionSupported()) { state.steps.status = 'unsupported'; state.steps.error = 'This device has no motion sensor the browser can read.'; return false; }
    if (state.steps.on) return true;
    resetStepDetector();
    state.steps.on = true;
    state.steps.status = 'waiting';
    state.steps.error = null;

    if (typeof window.Accelerometer === 'function') {
      try {
        sensor = new window.Accelerometer({ frequency: 50 });
        sensor.addEventListener('reading', () => onSample(sensor.x, sensor.y, sensor.z, sensor.timestamp || performance.now()));
        sensor.addEventListener('error', ev => {
          sensor = null;
          /* A blocked sensor still leaves the older motion event to try. */
          attachMotionEvent(ev && ev.error && ev.error.name);
        });
        sensor.start();
        return true;
      } catch (e) {
        sensor = null;
      }
    }
    attachMotionEvent();
    return true;
  }

  function attachMotionEvent(sensorError) {
    if (!('ondevicemotion' in window)) {
      state.steps.status = 'blocked';
      state.steps.error = sensorError === 'NotAllowedError'
        ? 'Motion access was refused.'
        : 'The motion sensor is not available here.';
      return;
    }
    motionHandler = e => {
      const a = e.accelerationIncludingGravity || e.acceleration;
      if (!a || a.x == null) return;
      onSample(a.x, a.y, a.z, e.timeStamp || performance.now());
    };
    window.addEventListener('devicemotion', motionHandler);
  }

  function resetStepDetector() {
    grav = 0; smooth = 0; envHi = 0; envLo = 0;
    above = false; peak = 0; peakT = 0; lastStepT = 0;
    recentSteps = [];
  }

  function onSample(x, y, z, t) {
    if (state.paused || !state.steps.on) return;
    const mag = Math.sqrt(x * x + y * y + z * z);
    if (!(mag > 0)) return;

    grav = grav > 0 ? grav * 0.9 + mag * 0.1 : mag;
    const v = mag - grav;
    smooth = smooth * 0.7 + v * 0.3;

    /* A decaying envelope, so the threshold follows how hard you are
       actually moving rather than a fixed guess. */
    envHi = Math.max(smooth, envHi * 0.995);
    envLo = Math.min(smooth, envLo * 0.995);
    const thr = Math.min(3, Math.max(0.35, (envHi - envLo) * 0.35));

    if (state.steps.status === 'waiting') state.steps.status = 'on';

    if (!above) {
      if (smooth > thr) { above = true; peak = smooth; peakT = t; }
      return;
    }
    if (smooth > peak) { peak = smooth; peakT = t; }
    if (smooth > thr * 0.5) return;

    above = false;
    const gap = peakT - lastStepT;
    if (!lastStepT || gap >= MAX_GAP_MS) { lastStepT = peakT; recentSteps = [peakT]; return; }
    if (gap < MIN_STEP_MS) return;

    state.steps.count++;
    lastStepT = peakT;
    recentSteps.push(peakT);
    if (recentSteps.length > 12) recentSteps.shift();
    if (recentSteps.length > 2) {
      const span = recentSteps[recentSteps.length - 1] - recentSteps[0];
      state.steps.cadence = span > 0 ? Math.round(60000 * (recentSteps.length - 1) / span) : 0;
    }
  }

  function stopSteps() {
    if (sensor) { try { sensor.stop(); } catch (e) { /* already stopped */ } sensor = null; }
    if (motionHandler) { window.removeEventListener('devicemotion', motionHandler); motionHandler = null; }
    state.steps.on = false;
    if (state.steps.status === 'on' || state.steps.status === 'waiting') state.steps.status = 'off';
  }

  /* Cadence goes stale the moment you stop, so let it decay rather than
     leaving 170 spm on screen while you stand at a crossing. */
  function tick() {
    if (!recentSteps.length) return;
    const since = performance.now() - recentSteps[recentSteps.length - 1];
    if (since > MAX_GAP_MS) state.steps.cadence = 0;
  }

  /* ---------------- stride ----------------

     Height gives a usable first guess; a session with both GPS and steps
     replaces it with a measured one. */

  function defaultStride(heightCm, typeId) {
    const h = (heightCm || 175) / 100;
    return typeId === 'run' || typeId === 'treadmill' ? h * 0.62 : h * 0.42;
  }

  function strideKey(typeId) {
    return (typeId === 'run' || typeId === 'treadmill') ? 'run' : 'walk';
  }

  function strideFor(profile, typeId) {
    const cal = (profile && profile.strideCal) || {};
    const measured = cal[strideKey(typeId)];
    return measured > 0 ? measured : defaultStride(profile && profile.heightCm, typeId);
  }

  /* Only calibrate off a decent sample, and move slowly, so one bad GPS
     day cannot wreck a stride length built up over months. */
  function calibrate(profile, typeId, gpsDistanceM, steps) {
    if (!(gpsDistanceM >= 400) || !(steps >= 300)) return null;
    const measured = gpsDistanceM / steps;
    if (!(measured > 0.3 && measured < 2.2)) return null;
    const key = strideKey(typeId);
    const cal = Object.assign({}, profile.strideCal || {});
    cal[key] = cal[key] > 0 ? cal[key] * 0.7 + measured * 0.3 : measured;
    cal[key] = Math.round(cal[key] * 1000) / 1000;
    return cal;
  }

  /* ---------------- lifecycle ---------------- */

  function start(opts) {
    const o = opts || {};
    reset();
    state.running = true;
    state.paused = false;
    if (o.gps) startGps(o.type);
    if (o.steps) startSteps();
  }

  function reset() {
    state.gps.distanceM = 0;
    state.gps.speedMps = 0;
    state.gps.points = [];
    state.gps.fixes = 0;
    state.gps.used = 0;
    state.gps.accuracy = null;
    state.gps.error = null;
    state.gps.status = state.gps.on ? state.gps.status : 'off';
    state.steps.count = 0;
    state.steps.cadence = 0;
    state.steps.error = null;
    resetStepDetector();
  }

  function pause() { state.paused = true; state.gps.speedMps = 0; state.steps.cadence = 0; }
  function resume() { state.paused = false; ref = null; speedEma = 0; resetStepDetector(); }

  function stop() {
    stopGps();
    stopSteps();
    state.running = false;
    return collect();
  }

  function collect() {
    return {
      gpsDistanceM: Math.round(state.gps.distanceM),
      steps: state.steps.count,
      cadence: state.steps.cadence,
      route: state.gps.points.slice(),
      fixes: state.gps.fixes
    };
  }

  /* Whichever sensor has something to say. GPS wins when it has actually
     measured a distance; otherwise steps stand in, at whatever stride
     length we have learnt. */
  function bestDistance(profile, typeId) {
    if (state.gps.distanceM > 0) return { metres: state.gps.distanceM, source: 'gps' };
    if (state.steps.count > 0) {
      return { metres: state.steps.count * strideFor(profile, typeId), source: 'steps' };
    }
    return { metres: 0, source: 'none' };
  }

  G.Track = {
    snapshot, start, stop, reset, pause, resume, collect, tick,
    gpsSupported, motionSupported, motionNeedsPermission, requestMotionPermission,
    startGps, stopGps, startSteps, stopSteps,
    strideFor, defaultStride, calibrate, bestDistance, haversine
  };

})(window.TapIn = window.TapIn || {});
