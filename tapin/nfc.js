/* Tap In — the NFC layer.

   Two routes get a tap from a machine into the app, and the app uses both:

   1. Web NFC (`NDEFReader`, Chrome on Android). The app holds the reader
      open while you are on the tap screen, so touching the phone to a tag
      fires straight into a workout with no button press at all. It reads
      the tag's serial number, which every NFC tag has, so gym kit that
      already carries a tag works without anything being written to it.

   2. A URL record we write to a blank sticker. Phones that cannot run Web
      NFC — every iPhone — still read URL tags from the lock screen, so a
      tag written by this app opens it straight into the right machine.
      That is what `write()` builds, and what `readDeepLink()` picks up.

   Everything degrades: no NFC at all still leaves a perfectly good manual
   tracker underneath. */
(function (G) {
  'use strict';

  const BASE = location.origin + location.pathname.replace(/[^/]*$/, '');

  let reader = null;
  let controller = null;
  let armed = false;
  const handlers = { tag: [], state: [] };

  /* ---------------- capability ---------------- */

  const supported = () => typeof window.NDEFReader === 'function';
  const canWrite = () => supported();

  /* Chrome exposes an 'nfc' permission; other browsers do not, and a
     rejected query must not be treated as a refusal. */
  async function permission() {
    if (!supported()) return 'unsupported';
    if (!navigator.permissions || !navigator.permissions.query) return 'unknown';
    try {
      const st = await navigator.permissions.query({ name: 'nfc' });
      return st.state;
    } catch (e) {
      return 'unknown';
    }
  }

  function on(evt, fn) { (handlers[evt] || (handlers[evt] = [])).push(fn); }
  function fire(evt, arg) { (handlers[evt] || []).forEach(fn => { try { fn(arg); } catch (e) { console.error(e); } }); }

  /* ---------------- reading ---------------- */

  /* Pull anything useful out of an NDEF message: our own deep links first,
     then plain text, then any other URL. */
  function parseMessage(message) {
    const out = { machineId: null, text: null, url: null, records: 0 };
    if (!message || !message.records) return out;
    out.records = message.records.length;

    for (const rec of message.records) {
      try {
        if (rec.recordType === 'url' || rec.recordType === 'absolute-url') {
          const url = new TextDecoder().decode(rec.data);
          out.url = out.url || url;
          const id = machineIdFromUrl(url);
          if (id) out.machineId = id;
        } else if (rec.recordType === 'text') {
          const dec = new TextDecoder(rec.encoding || 'utf-8');
          const txt = dec.decode(rec.data);
          out.text = out.text || txt;
          const id = machineIdFromUrl(txt);
          if (id) out.machineId = id;
        } else if (rec.recordType === 'mime' && /json/.test(rec.mediaType || '')) {
          const body = JSON.parse(new TextDecoder().decode(rec.data));
          if (body && body.m) out.machineId = body.m;
          if (body && body.name) out.text = out.text || body.name;
        }
      } catch (e) { /* an unreadable record is not worth failing the whole tap over */ }
    }
    return out;
  }

  function machineIdFromUrl(str) {
    if (!str) return null;
    const m = String(str).match(/[#?&]m=([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
  }

  /* Start listening. Must be called from a user gesture the first time,
     because that is when Chrome asks for permission. */
  async function arm() {
    if (!supported()) throw errorFor('unsupported');
    if (armed) return true;
    reader = new window.NDEFReader();
    controller = new AbortController();

    reader.onreading = e => {
      const parsed = parseMessage(e.message);
      buzz([18, 40, 18]);
      fire('tag', {
        serial: normaliseSerial(e.serialNumber),
        machineId: parsed.machineId,
        text: parsed.text,
        url: parsed.url,
        records: parsed.records,
        at: Date.now()
      });
    };

    reader.onreadingerror = () => {
      fire('state', { armed: true, warning: 'That tag could not be read — try holding the phone still against it.' });
    };

    try {
      await reader.scan({ signal: controller.signal });
      armed = true;
      fire('state', { armed: true });
      return true;
    } catch (e) {
      armed = false;
      controller = null;
      reader = null;
      fire('state', { armed: false, error: describe(e) });
      throw e;
    }
  }

  function disarm() {
    if (controller) { try { controller.abort(); } catch (e) { /* already gone */ } }
    controller = null;
    reader = null;
    armed = false;
    fire('state', { armed: false });
  }

  const isArmed = () => armed;

  /* Serial numbers come through as colon-separated hex. Normalising means a
     tag read on two different days always matches the same machine. */
  function normaliseSerial(s) {
    if (!s) return null;
    return String(s).toLowerCase().replace(/[^0-9a-f]/g, '');
  }

  /* ---------------- writing ----------------

     Writes a URL record so the sticker works on any phone, plus a text
     record naming the machine so a generic NFC tool shows something
     human-readable. */

  async function write(machineId, name) {
    if (!canWrite()) throw errorFor('unsupported');
    const url = linkFor(machineId);
    const writer = new window.NDEFReader();
    const ctl = new AbortController();
    /* Don't leave the phone waiting on a tag forever if the user walks off. */
    const timeout = setTimeout(() => ctl.abort(), 30000);
    try {
      await writer.write(
        { records: [
          { recordType: 'url', data: url },
          { recordType: 'text', data: 'Tap In — ' + (name || 'machine') }
        ] },
        { signal: ctl.signal }
      );
      buzz([25, 60, 25, 60, 25]);
      return url;
    } finally {
      clearTimeout(timeout);
    }
  }

  /* Make a tag read-only. Irreversible, which is why it is opt-in and
     confirmed in the UI before it gets here. */
  async function lockTag() {
    if (!canWrite()) throw errorFor('unsupported');
    const writer = new window.NDEFReader();
    if (typeof writer.makeReadOnly !== 'function') throw errorFor('nolock');
    const ctl = new AbortController();
    const timeout = setTimeout(() => ctl.abort(), 30000);
    try {
      await writer.makeReadOnly({ signal: ctl.signal });
      return true;
    } finally {
      clearTimeout(timeout);
    }
  }

  function linkFor(machineId) {
    return BASE + '#m=' + machineId;
  }

  /* ---------------- deep links ----------------
     A tag tapped on the lock screen opens the app at #m=<id>. Read it once,
     then strip it so a refresh does not start the same session twice. */

  function readDeepLink() {
    const hash = location.hash || '';
    const search = location.search || '';
    const id = machineIdFromUrl(hash) || machineIdFromUrl(search);
    if (!id) return null;
    try {
      history.replaceState(null, '', location.pathname);
    } catch (e) { location.hash = ''; }
    return id;
  }

  /* ---------------- feedback ---------------- */

  function buzz(pattern) {
    try {
      if (G.Store && G.Store.profile && G.Store.profile().haptics === false) return;
      if (navigator.vibrate) navigator.vibrate(pattern);
    } catch (e) { /* vibration is a nicety, never a requirement */ }
  }

  /* ---------------- error wording ----------------
     Browser NFC errors are terse and unhelpful; these are what the user sees. */

  const MESSAGES = {
    unsupported: 'This browser cannot read NFC. Chrome on Android can — everything else in the app still works, and tags written here open on any phone.',
    nolock: 'This browser cannot lock tags.',
    NotAllowedError: 'NFC permission was refused. Allow it in the site settings, then try again.',
    NotSupportedError: 'No NFC hardware found on this device.',
    NotReadableError: 'NFC is switched off. Turn it on in your phone settings and try again.',
    AbortError: 'Cancelled.',
    NetworkError: 'The tag moved away too soon — hold the phone still against it.',
    InvalidStateError: 'A tap is already in progress.'
  };

  function errorFor(code) {
    const e = new Error(MESSAGES[code] || 'NFC is not available.');
    e.tapinCode = code;
    return e;
  }

  function describe(e) {
    if (!e) return 'NFC failed.';
    if (e.tapinCode) return e.message;
    return MESSAGES[e.name] || e.message || 'NFC failed.';
  }

  G.NFC = {
    supported, canWrite, permission, arm, disarm, isArmed,
    write, lockTag, linkFor, readDeepLink, on, describe, buzz, normaliseSerial
  };

})(window.TapIn = window.TapIn || {});
