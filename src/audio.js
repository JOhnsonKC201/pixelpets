// Procedural sound (WebAudio). Everything here is synthesized in code; the ONE optional
// asset is assets/meow.(ogg|mp3|wav) - drop one in and it replaces the synth meow (see
// Loaded as a classic <script> before
// the overlay parts (src/overlay/), sharing their global scope: it reads `config` (volume/soundOn)
// and `patternIndex`/`PATTERN_BUILD` (per-breed voice) and exposes audio()/playMeow()/
// startPurr()/stopPurr()/playChirp()/playMrrp() that the overlay calls. Kept out of
// the overlay so the drawing code stays about drawing.
/* exported playMeow, startPurr, stopPurr, playChirp, playMrrp, playSwipe, playPlop */
let actx = null, master = null;

// Nothing in this file used to rate-limit itself, and several callers live on
// animation clocks - so a stuck state machine upstream became a stutter down here.
// This is the floor on how often the pet may use its VOICE, whatever the caller
// does. Swipe and plop are texture rather than voice and are deliberately exempt:
// they are already tied to a physical event and are far quieter.
let lastVoiceAt = -1e9;
function nowMs() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }
function voiceReady(gapMs) {
  const t = nowMs();
  if (t - lastVoiceAt < gapMs) return false;
  lastVoiceAt = t;
  return true;
}
// Test seam. The gate is wall-clock, so a unit test that drives hundreds of calls
// in a tight loop would otherwise exercise only the first one and quietly stop
// covering the synth paths it exists to check.
/* exported resetVoiceGate */
function resetVoiceGate() { lastVoiceAt = -1e9; }
function volNow() { return (config && typeof config.volume === 'number' ? config.volume : 100) / 100; }
// Soft-clip (tanh) curve for the master safety stage: ~unity slope near zero (quiet
// sounds pass untouched) and a smooth ceiling below 1.0, so NO input - however hot the
// mix stacks - can ever exceed the range and hard-clip the speaker into crackle.
function makeMasterClip() {
  const n = 2048, c = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; c[i] = Math.tanh(x); }
  return c;
}
function audio() {
  try {
    if (!actx) {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      master = actx.createGain(); master.gain.value = volNow();
      // Output safety chain: the Lobby Jam (many plucks + bass + reverb + rain) plus any
      // meow/purr can sum past 1.0. A compressor rides the sustained level down, then a
      // tanh soft-clipper is a hard guarantee the signal can never leave [-1,1] (a
      // DynamicsCompressor alone is NOT a brickwall - measured peaks still clipped).
      const limiter = actx.createDynamicsCompressor();
      limiter.threshold.value = -6; limiter.ratio.value = 12; limiter.attack.value = 0.003; limiter.release.value = 0.25;
      const clip = actx.createWaveShaper(); clip.curve = makeMasterClip(); clip.oversample = '2x';
      master.connect(limiter); limiter.connect(clip); clip.connect(actx.destination);
    }
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { actx = null; }
  return actx;
}
// Optional REAL meow: if a recording exists at assets/meow.(ogg|mp3|wav) it REPLACES the
// synth meow. Loaded once via XHR - the overlay runs from file://, where fetch() is
// blocked but XHR can read a local file. If it's absent or won't decode, the synth plays.
// (This is the ONLY optional asset; everything else stays 100% synthesized.)
// Is the pet a dog right now? The overlay defines isDog() and loads AFTER this
// file, so this resolves at CALL time, never at load time.
function voiceIsDog() { return typeof isDog === 'function' && isDog(); }

// Body size drives a dog's voice more than anything else: a Chihuahua yips, a
// shepherd booms. `nasal` shapes the mouth, `snort` adds the brachycephalic rasp
// (a pug is high AND snorty, because the short muzzle kills the top formants),
// and `bay` gives the hound its drawn-out howl instead of a clipped bark.
const DOG_VOICE = {
  toy: { pitch: 1.62, dur: 0.72, gain: 0.80, nasal: 1.25 },
  brachy: { pitch: 1.28, dur: 0.80, gain: 0.90, nasal: 0.78, snort: 1 },
  dwarf: { pitch: 1.26, dur: 0.86, gain: 0.95 },
  longdog: { pitch: 1.18, dur: 0.92, gain: 0.95 },
  spitz: { pitch: 1.14, dur: 0.84, gain: 1.00, nasal: 1.12 },
  poodle: { pitch: 1.10, dur: 0.90, gain: 0.92 },
  collie: { pitch: 1.04, dur: 0.94, gain: 1.00 },
  merledog: { pitch: 1.00, dur: 0.96, gain: 1.00 },
  hound: { pitch: 0.94, dur: 1.22, gain: 1.05, bay: 1 },
  spotted: { pitch: 0.94, dur: 1.00, gain: 1.00 },
  retriever: { pitch: 0.88, dur: 1.05, gain: 1.05 },
  labrador: { pitch: 0.86, dur: 1.05, gain: 1.05 },
  working: { pitch: 0.82, dur: 1.08, gain: 1.10 },
  shepherd: { pitch: 0.78, dur: 1.10, gain: 1.12 },
};

function voiceFor() {
  const build = (typeof PATTERN_BUILD !== 'undefined' && PATTERN_BUILD[patternIndex]) || 'standard';
  let base;
  if (voiceIsDog()) {
    base = { ...(DOG_VOICE[build] || { pitch: 1.0, dur: 1.0, gain: 1.0 }), type: 'sawtooth' };
  } else {
    base = build === 'slender' ? { pitch: 1.22, dur: 1.25, type: 'sawtooth', gain: 0.95 }
      : build === 'stocky' ? { pitch: 0.82, dur: 0.92, type: 'triangle', gain: 1.05 }
      : build === 'fluffy' ? { pitch: 1.0, dur: 1.06, type: 'sine', gain: 0.85 }
      : { pitch: 1.0, dur: 1.0, type: 'triangle', gain: 1.0 };
  }
  base.pitch *= 1 + ((patternIndex * 37) % 7 - 3) * 0.012;   // small per-coat individuality
  return base;
}

// Looping white noise, built once. Breath, bark transients and panting are all
// noise; rebuilding the buffer per call would allocate on every single bark.
let noiseBuf = null;
function noiseSource(ac) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * 0.5)), ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  return s;
}

// ---- dog voices -------------------------------------------------------------
// A bark is not a meow with a different pitch. It is a PLOSIVE: a near-instant
// noise transient (the "w" of woof, air released past the tongue) on top of a
// voiced pulse that falls immediately, all over in well under a fifth of a
// second. The cat model's slow formant glide is exactly what a bark is not, so
// these are built from scratch rather than reusing playMeow's shape.
function barkOnce(ac, v, t0, strength) {
  const dur = (0.15 + Math.random() * 0.05) * v.dur * (v.bay ? 2.4 : 1);
  const p = v.pitch * (0.96 + Math.random() * 0.08);
  const trash = [];
  const g = ac.createGain(); g.connect(master); trash.push(g);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.19 * (v.gain || 1) * strength, t0 + 0.008);   // hard attack
  if (v.bay) g.gain.setValueAtTime(0.15 * (v.gain || 1) * strength, t0 + dur * 0.45);  // hounds hold the note
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  // voiced body: falls away fast (a bark is a downward chirp, not a held vowel)
  const o = ac.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(320 * p, t0);
  o.frequency.exponentialRampToValueAtTime(190 * p, t0 + dur * (v.bay ? 0.8 : 0.35));
  const sub = ac.createOscillator(); sub.type = 'sine';
  sub.frequency.setValueAtTime(160 * p, t0);
  sub.frequency.exponentialRampToValueAtTime(96 * p, t0 + dur * 0.4);
  const subG = ac.createGain(); subG.gain.value = 0.4; trash.push(subG);

  // the mouth: opens instantly on "w", clamps shut on "f"
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2; trash.push(lp);
  lp.frequency.setValueAtTime(2600 * (v.nasal || 1), t0);
  lp.frequency.exponentialRampToValueAtTime(620 * (v.nasal || 1), t0 + dur);
  const fmt = ac.createBiquadFilter(); fmt.type = 'peaking'; fmt.Q.value = 1.8; fmt.gain.value = 8; trash.push(fmt);
  fmt.frequency.setValueAtTime(900 * p * (v.nasal || 1), t0);
  fmt.frequency.linearRampToValueAtTime(520 * p * (v.nasal || 1), t0 + dur);

  // the transient: a burst of air, gone in 40ms. This is what makes it read as a
  // bark rather than a synth note.
  const n = noiseSource(ac);
  const nf = ac.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1500 * (v.nasal || 1); nf.Q.value = 0.7; trash.push(nf);
  const nG = ac.createGain(); trash.push(nG);
  nG.gain.setValueAtTime(0.0001, t0);
  nG.gain.exponentialRampToValueAtTime(0.13 * strength * (v.snort ? 1.7 : 1), t0 + 0.006);
  nG.gain.exponentialRampToValueAtTime(0.0001, t0 + (v.snort ? 0.09 : 0.045));

  o.connect(lp); sub.connect(subG); subG.connect(lp); lp.connect(fmt); fmt.connect(g);
  n.connect(nf); nf.connect(nG); nG.connect(g);
  o.start(t0); sub.start(t0); n.start(t0);
  const end = t0 + dur + 0.05;
  o.stop(end); sub.stop(end); n.stop(end);
  o.onended = () => { for (const x of trash) { try { x.disconnect(); } catch (e) { /* ignore */ } } };
}

// Dogs rarely bark once. Small dogs rattle off three, big dogs give one or two.
function playBark() {
  const ac = audio(); if (!ac) return;
  const v = voiceFor(), t0 = ac.currentTime;
  const small = v.pitch > 1.15;
  const n = v.bay ? 1 : small ? (Math.random() < 0.5 ? 3 : 2) : (Math.random() < 0.65 ? 1 : 2);
  for (let i = 0; i < n; i++) barkOnce(ac, v, t0 + i * (0.15 + Math.random() * 0.05) * v.dur, i === 0 ? 1 : 0.82);
}

// The dog answer to the purr: contented panting. Rhythmic breath, not a rumble,
// so it is noise shaped by an open-then-closed mouth rather than a low carrier.
let pantNodes = null;
function startPant() {
  const ac = audio(); if (!ac || pantNodes) return;
  const v = voiceFor();
  const n = noiseSource(ac);
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1150 * (v.nasal || 1); bp.Q.value = 0.55;
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0.0001, ac.currentTime);
  amp.gain.setTargetAtTime(0.03 * (v.gain || 1), ac.currentTime, 0.3);
  // the pant rhythm: ~2.6 breaths/sec for a small dog, slower for a big one
  const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 3.1 / v.dur;
  const lfoGain = ac.createGain();          // depth ramps in with the carrier - see startPurr
  lfoGain.gain.setValueAtTime(0.0001, ac.currentTime);
  lfoGain.gain.setTargetAtTime(0.026, ac.currentTime, 0.3);
  lfo.connect(lfoGain); lfoGain.connect(amp.gain);
  // a soft voiced hum under the breath so it is a dog panting, not just hiss
  const hum = ac.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 150 * v.pitch;
  const humG = ac.createGain(); humG.gain.value = 0.012;
  n.connect(bp); bp.connect(amp); hum.connect(humG); humG.connect(amp); amp.connect(master);
  n.start(); lfo.start(); hum.start();
  pantNodes = { n, bp, amp, lfo, lfoGain, hum, humG };
}
function stopPant() {
  if (!pantNodes) return;
  const p = pantNodes; pantNodes = null;
  try {
    const now = actx ? actx.currentTime : 0;
    p.amp.gain.cancelScheduledValues(now);
    p.amp.gain.setTargetAtTime(0.0001, now, 0.12);
    const stopAt = now + 0.4;
    p.n.stop(stopAt); p.lfo.stop(stopAt); p.hum.stop(stopAt);
    p.n.onended = () => {
      for (const x of [p.n, p.bp, p.amp, p.lfo, p.lfoGain, p.hum, p.humG]) {
        try { x.disconnect(); } catch (e) { /* ignore */ }
      }
    };
  } catch (e) { /* ignore */ }
}

// The dog answer to the chirrup: a soft rising whine, the "please" noise. Nasal
// and voiced, with none of the cat trill's rolled flutter.
function playWhine() {
  const ac = audio(); if (!ac) return;
  const t0 = ac.currentTime, v = voiceFor();
  const trash = [];
  const g = ac.createGain(); g.connect(master); trash.push(g);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.10 * (v.gain || 1), t0 + 0.06);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42 * v.dur);
  const o = ac.createOscillator(); o.type = 'triangle';
  const p = v.pitch;
  o.frequency.setValueAtTime(430 * p, t0);
  o.frequency.linearRampToValueAtTime(720 * p, t0 + 0.20 * v.dur);   // the rise: asking
  o.frequency.linearRampToValueAtTime(610 * p, t0 + 0.42 * v.dur);   // and a small fall off the top
  const nasal = ac.createBiquadFilter(); nasal.type = 'peaking'; nasal.Q.value = 4.5; nasal.gain.value = 11; trash.push(nasal);
  nasal.frequency.value = 1900 * (v.nasal || 1);                     // the pinched nasal ring
  o.connect(nasal); nasal.connect(g);
  o.start(t0); o.stop(t0 + 0.45 * v.dur + 0.05);
  o.onended = () => { for (const x of trash) { try { x.disconnect(); } catch (e) { /* ignore */ } } };
}

// The dog answer to the startled mrrp: a short chesty huff. Mostly air, a little
// voice, no pitch content to speak of.
function playHuff() {
  const ac = audio(); if (!ac) return;
  const t0 = ac.currentTime, v = voiceFor();
  const trash = [];
  const g = ac.createGain(); g.connect(master); trash.push(g);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.15 * (v.gain || 1), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.20);
  const n = noiseSource(ac);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 * (v.nasal || 1); lp.Q.value = 0.8; trash.push(lp);
  const o = ac.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(150 * v.pitch, t0);
  o.frequency.exponentialRampToValueAtTime(96 * v.pitch, t0 + 0.18);
  const oG = ac.createGain(); oG.gain.value = 0.5; trash.push(oG);
  n.connect(lp); o.connect(oG); oG.connect(lp); lp.connect(g);
  n.start(t0); o.start(t0); n.stop(t0 + 0.24); o.stop(t0 + 0.24);
  o.onended = () => { for (const x of trash) { try { x.disconnect(); } catch (e) { /* ignore */ } } };
}
function playMeow() {
  // A real cat's "meow" = a voiced source (rich in harmonics) shaped by the mouth
  // opening and closing on a vowel. We model that: a sawtooth "voice" + a soft
  // sub-octave for body, a moving formant filter (the mouth) sweeping up into the
  // open "ee" and back down through the closing "ow", a fixed vocal peak so it reads
  // as a voice (not a bleep), gentle vibrato, and a breath of air on the onset.
  // Each call randomly picks a short "mew", a two-syllable "meow", or a drawn-out
  // "meeow" - and detunes a hair - so repeated meows vary like a real cat.
  // Still 100% synthesized; voiceFor() keeps each breed's own pitch/length.
  if (!voiceReady(700)) return;                  // gated before the species fork so it covers the bark too
  const ac = audio(); if (!ac) return;
  if (voiceIsDog()) { playBark(); return; }      // a dog does not meow
  const v = voiceFor();
  const t0 = ac.currentTime;
  const r = Math.random();
  // Weighted toward the two AFFECTIONATE shapes. The short "mew" and the drawn-out
  // "meeow" are what a cat actually uses on the person it lives with; the flat
  // mid-length meow is closer to a demand, so it is no longer the default.
  const variant = r < 0.42 ? 'mew' : r < 0.80 ? 'meow' : 'long';
  const dur = (variant === 'mew' ? 0.34 : variant === 'long' ? 0.78 : 0.52) * v.dur;
  const f = (hz) => hz * v.pitch * (0.97 + Math.random() * 0.06);   // tiny per-call detune
  const trash = [];

  // ---- voice: harmonic-rich sawtooth + soft sine sub-octave for warmth ----
  const o = ac.createOscillator(); o.type = 'sawtooth';
  const sub = ac.createOscillator(); sub.type = 'sine';
  const p0 = f(variant === 'mew' ? 470 : 360), pPk = f(variant === 'mew' ? 700 : 600), pEnd = f(variant === 'long' ? 300 : 350);
  o.frequency.setValueAtTime(p0, t0);
  o.frequency.linearRampToValueAtTime(pPk, t0 + dur * 0.30);            // rise into the open "ee"
  if (variant === 'long') o.frequency.linearRampToValueAtTime(pPk * 0.95, t0 + dur * 0.62);   // a held wobble plateau
  o.frequency.linearRampToValueAtTime(pEnd, t0 + dur);                  // fall through the closing "ow"
  sub.frequency.setValueAtTime(p0 / 2, t0);
  sub.frequency.linearRampToValueAtTime(pPk / 2, t0 + dur * 0.30);
  sub.frequency.linearRampToValueAtTime(pEnd / 2, t0 + dur);
  const subG = ac.createGain(); subG.gain.value = 0.32; trash.push(subG);

  // ---- vibrato (a touch faster on the drawn-out meow) ----
  const vib = ac.createOscillator(); vib.type = 'sine'; vib.frequency.value = variant === 'long' ? 11 : 7;
  const vibGain = ac.createGain(); vibGain.gain.value = f(variant === 'long' ? 11 : 6); trash.push(vibGain);
  vib.connect(vibGain); vibGain.connect(o.frequency); vibGain.connect(sub.frequency);

  // ---- the "mouth": a lowpass that opens then closes + a fixed vocal formant peak ----
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.0; trash.push(lp);
  lp.frequency.setValueAtTime(f(700), t0);
  lp.frequency.linearRampToValueAtTime(f(2350), t0 + dur * 0.30);   // rounder, less piercing at the peak
  lp.frequency.linearRampToValueAtTime(f(900), t0 + dur);
  // Two vocal formants that GLIDE - this is what makes it read as "me-ow" rather than a
  // bleep: the mouth opens on a bright vowel (F2 high) then rounds/closes on the "ow" (F2
  // sweeps way down). F1 rises into the open "a" then settles. Modelled on real cat-meow
  // formant motion; the glide, not just fixed peaks, is the difference.
  const fmt = ac.createBiquadFilter(); fmt.type = 'peaking'; fmt.Q.value = 2.6; fmt.gain.value = 7; trash.push(fmt);
  fmt.frequency.setValueAtTime(f(650), t0);
  fmt.frequency.linearRampToValueAtTime(f(1050), t0 + dur * 0.30);   // open "a"
  fmt.frequency.linearRampToValueAtTime(f(600), t0 + dur);           // round down on "ow"
  const fmt2 = ac.createBiquadFilter(); fmt2.type = 'peaking'; fmt2.Q.value = 2.6; fmt2.gain.value = 6; trash.push(fmt2);
  fmt2.frequency.setValueAtTime(f(2450), t0);
  fmt2.frequency.linearRampToValueAtTime(f(2450), t0 + dur * 0.28);  // bright open vowel, softened
  fmt2.frequency.linearRampToValueAtTime(f(950), t0 + dur);          // sweep down into the closing "ow"

  // ---- amp envelope: quick attack, a tiny mid dip (the "me|ow" break), then release ----
  const amp = ac.createGain(); trash.push(amp);
  // Gentler than it was: a 40ms attack at 0.22 reads as a demand, and this pet
  // lives on someone's desktop all day. A slower onset at a lower peak is the
  // difference between the cat asking for something and the cat saying hello.
  amp.gain.setValueAtTime(0.0001, t0);
  amp.gain.exponentialRampToValueAtTime(0.17, t0 + 0.065);
  if (variant !== 'mew') {
    amp.gain.linearRampToValueAtTime(0.10, t0 + dur * 0.46);            // dip between syllables
    amp.gain.linearRampToValueAtTime(0.155, t0 + dur * 0.62);           // swell back up on the "ow"
  }
  amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur + 0.10);        // longer tail: it trails off rather than stopping

  o.connect(fmt); subG.connect(fmt); sub.connect(subG);
  fmt.connect(fmt2); fmt2.connect(lp); lp.connect(amp); amp.connect(master);

  // ---- a soft breath of air on the onset (the inhale before the cry) ----
  const blen = Math.max(1, (ac.sampleRate * 0.05) | 0), bbuf = ac.createBuffer(1, blen, ac.sampleRate), bd = bbuf.getChannelData(0);
  for (let i = 0; i < blen; i++) bd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / blen, 1.5);
  const bs = ac.createBufferSource(); bs.buffer = bbuf;
  const bbp = ac.createBiquadFilter(); bbp.type = 'bandpass'; bbp.frequency.value = f(1800); bbp.Q.value = 0.8; trash.push(bbp);
  const bg = ac.createGain(); bg.gain.value = 0.05; trash.push(bg);
  bs.connect(bbp).connect(bg).connect(master); bs.start(t0);

  const stopAt = t0 + dur + 0.12;
  o.start(t0); sub.start(t0); vib.start(t0);
  o.stop(stopAt); sub.stop(stopAt); vib.stop(stopAt);
  o.onended = () => { for (const n of trash) { try { n.disconnect(); } catch (e) { /* ignore */ } } };
}
let purrNodes = null;
// stopPurr clears purrNodes at once but lets the old oscillators run out a 400ms
// release. A restart inside that tail stacks a second drone on the first, which is
// what turned a jittering cursor into a thickening wobble instead of one purr.
let purrFreeAt = 0;
// A purr = a low carrier you can actually hear on a laptop speaker, amplitude-fluttered
// at the ~25 Hz purr rate (that flutter IS the purr, not the pitch). We layer a sawtooth
// fundamental + a soft detuned overtone for warmth, the flutter tremolo, and a slow
// "breathing" swell so it never sits static - then fade in/out so it doesn't click.
function startPurr() {
  if (voiceIsDog()) { startPant(); return; }     // dogs do not purr, they pant
  const ac = audio(); if (!ac || purrNodes || ac.currentTime < purrFreeAt) return;   // still releasing
  const v = voiceFor();
  const purrHz = 48 * v.pitch;                                 // carrier: an audible low rumble (26 Hz was subsonic and buzzed on small speakers)
  const carrier = ac.createOscillator(); carrier.type = 'sawtooth'; carrier.frequency.value = purrHz;
  const over = ac.createOscillator(); over.type = 'triangle'; over.frequency.value = purrHz * 2;   // warm overtone
  const overG = ac.createGain(); overG.gain.value = 0.35;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
  const amp = ac.createGain(); amp.gain.setValueAtTime(0.0001, ac.currentTime);
  amp.gain.setTargetAtTime(0.045, ac.currentTime, 0.35);      // fade in (no click)
  const lfo = ac.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 25;   // the ~25 Hz purr flutter (amplitude tremolo)
  // The modulators sum straight into amp.gain, so at full depth from sample zero
  // they swing the param by as much as the steady state does - which made the
  // "fade in (no click)" above a no-op and started every purr at full loudness.
  // Ramp the DEPTH in alongside the carrier and the onset is genuinely soft.
  const lfoGain = ac.createGain();
  lfoGain.gain.setValueAtTime(0.0001, ac.currentTime);
  lfoGain.gain.setTargetAtTime(0.03, ac.currentTime, 0.35);
  lfo.connect(lfoGain); lfoGain.connect(amp.gain);
  const breath = ac.createOscillator(); breath.type = 'sine'; breath.frequency.value = 0.5;   // slow inhale/exhale swell
  const breathGain = ac.createGain();
  breathGain.gain.setValueAtTime(0.0001, ac.currentTime);
  breathGain.gain.setTargetAtTime(0.012, ac.currentTime, 0.35);
  breath.connect(breathGain); breathGain.connect(amp.gain);
  carrier.connect(lp); over.connect(overG); overG.connect(lp); lp.connect(amp); amp.connect(master);
  carrier.start(); over.start(); lfo.start(); breath.start();
  purrNodes = { carrier, over, overG, lp, amp, lfo, lfoGain, breath, breathGain };
}
function stopPurr() {
  // Always stop BOTH: a species swap mid-purr must not strand the old voice
  // looping forever, and only one of them is ever running.
  stopPant();
  if (!purrNodes) return;
  const p = purrNodes; purrNodes = null;
  try {
    const now = actx ? actx.currentTime : 0;
    p.amp.gain.cancelScheduledValues(now);
    p.amp.gain.setTargetAtTime(0.0001, now, 0.12);            // short release
    const stopAt = now + 0.4; purrFreeAt = stopAt;
    p.carrier.stop(stopAt); p.over.stop(stopAt); p.lfo.stop(stopAt); p.breath.stop(stopAt);
    p.carrier.onended = () => {
      for (const n of [p.carrier, p.over, p.overG, p.lp, p.amp, p.lfo, p.lfoGain, p.breath, p.breathGain]) {
        try { n.disconnect(); } catch (e) { /* ignore */ }
      }
    };
  } catch (e) { /* ignore */ }
}
// A happy cat "chirrup"/trill (tap, body-pet, playful beat, agent done): a short
// rising note with the fast rolled "r" flutter cats make - friendlier than a meow.
function playChirp() {
  if (!voiceReady(700)) return;
  if (voiceIsDog()) { playWhine(); return; }   // the dog equivalent: a soft asking whine
  const ac = audio(); if (!ac) return;
  const t0 = ac.currentTime, v = voiceFor();
  const g = ac.createGain(); g.connect(master);
  // The trill is the pet being pleased to see you, so it gets the softest onset
  // of the three and the longest tail.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.10, t0 + 0.035);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
  const o = ac.createOscillator(); o.type = 'triangle';
  o.frequency.setValueAtTime(760 * v.pitch, t0);
  o.frequency.linearRampToValueAtTime(1120 * v.pitch, t0 + 0.10);
  o.frequency.linearRampToValueAtTime(1260 * v.pitch, t0 + 0.26);   // rises at the end (questioning chirrup)
  // the rolled "r": a fast tremolo flutter riding the amplitude envelope
  const roll = ac.createOscillator(); roll.type = 'sine'; roll.frequency.value = 33;
  const rollAmt = ac.createGain(); rollAmt.gain.value = 0.05;
  roll.connect(rollAmt); rollAmt.connect(g.gain);
  o.connect(g); o.start(t0); roll.start(t0); o.stop(t0 + 0.32); roll.stop(t0 + 0.32);
  o.onended = () => { try { g.disconnect(); rollAmt.disconnect(); } catch (e) { /* ignore */ } };
}
// Startled "mrrp" - a short falling growl (sudden jolt / agent error).
function playMrrp() {
  if (!voiceReady(700)) return;
  if (voiceIsDog()) { playHuff(); return; }    // the dog equivalent: a chesty huff
  const ac = audio(); if (!ac) return;
  const t0 = ac.currentTime, g = ac.createGain(); g.connect(master);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.115, t0 + 0.032);   // still a jolt, no longer a slap
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.20);
  const v = voiceFor();
  const o = ac.createOscillator(); o.type = 'sawtooth';
  o.frequency.setValueAtTime(520 * v.pitch, t0);
  o.frequency.linearRampToValueAtTime(300 * v.pitch, t0 + 0.16);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300;
  o.connect(lp); lp.connect(g); o.start(t0); o.stop(t0 + 0.2);
  o.onended = () => { try { g.disconnect(); lp.disconnect(); } catch (e) { /* ignore */ } };
}

// A paw cutting the air: a short filtered-noise whoosh under each swipe of the
// rear-up bat. Both things that use that pose (the butterfly overhead, and the
// leaf that blows past while you scroll) were completely silent before, so the
// pet's most physical animation made no sound at all.
//
// Species-neutral on purpose: a paw moving through air sounds the same whoever it
// is attached to, so unlike the voices this one does not fork on voiceIsDog().
//
// Deliberately quiet. It fires once per stroke and strokes come every ~200ms while
// batting, so anything louder turns into a hiss you notice instead of texture you
// only miss when it is gone. `strength` 0..1 scales it with how hard the swipe is.
function playSwipe(strength) {
  const ac = audio(); if (!ac) return;
  const s = Math.max(0, Math.min(1, strength == null ? 1 : strength));
  const t0 = ac.currentTime;
  const g = ac.createGain(); g.connect(master);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.030 + 0.026 * s, t0 + 0.022);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
  // The band sweeps UP as the paw accelerates and falls away past the top of the
  // arc, which is what makes it read as movement rather than a burst of static.
  const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(820, t0);
  bp.frequency.exponentialRampToValueAtTime(2400 + 900 * s, t0 + 0.085);
  bp.frequency.exponentialRampToValueAtTime(1100, t0 + 0.15);
  const n = noiseSource(ac);
  n.connect(bp); bp.connect(g);
  n.start(t0); n.stop(t0 + 0.16);
  n.onended = () => { try { g.disconnect(); bp.disconnect(); } catch (e) { /* ignore */ } };
}

// The pet landing after you drop it: a soft, low thud with a paw-pat on top.
//
// Tapping the pet chirped, and shaking it mrrped, but PICKING IT UP AND DROPPING
// IT made no sound at all - on the one interaction that is entirely about physical
// feel. The landing already squashes and eases; this is the sound of that.
//
// `strength` 0..1 comes from how far it fell, so setting the pet down gently is
// nearly silent and dropping it from the top of the screen actually lands.
function playPlop(strength) {
  const ac = audio(); if (!ac) return;
  const s = Math.max(0, Math.min(1, strength == null ? 0.5 : strength));
  const t0 = ac.currentTime;

  // body: a low sine dropping away fast. Short enough to read as a thud rather
  // than a note, which is the difference between landing and beeping.
  const g = ac.createGain(); g.connect(master);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.055 + 0.075 * s, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.13 + 0.05 * s);
  const o = ac.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(155 - 25 * s, t0);
  o.frequency.exponentialRampToValueAtTime(62, t0 + 0.11);
  o.connect(g); o.start(t0); o.stop(t0 + 0.2);

  // paws: a very short lowpassed noise tick, so it reads as feet meeting a
  // surface instead of a bass drum on its own.
  const ng = ac.createGain(); ng.connect(master);
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.020 + 0.020 * s, t0 + 0.006);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.055);
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
  const n = noiseSource(ac);
  n.connect(lp); lp.connect(ng); n.start(t0); n.stop(t0 + 0.06);

  o.onended = () => { try { g.disconnect(); ng.disconnect(); lp.disconnect(); } catch (e) { /* ignore */ } };
}
