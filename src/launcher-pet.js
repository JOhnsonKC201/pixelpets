// What the pet in the launcher header is doing. Pure rules, no DOM: the launcher
// page asks for a mood, puts it on <body data-pet="...">, and CSS poses the
// picture. Nothing here reads a row's wording, only whether it can be run.
//
// Loaded as a classic <script> by launcher.html and required as a CommonJS
// module by the tests.

const PET_DOZE_MS = 8000;   // an empty box left alone this long
const PET_MOODS = ['idle', 'listen', 'curious', 'doze'];
const PET_REACTIONS = ['tap', 'hop'];

// idle:    nothing typed.
// doze:    nothing typed for a while.
// listen:  something typed, and there is a row to run.
// curious: something typed, and nothing to run yet (a hint, or no match).
function petMood(state) {
  const s = state || {};
  if (!String(s.query == null ? '' : s.query).trim()) return (s.idleMs || 0) >= PET_DOZE_MS ? 'doze' : 'idle';
  return (s.items || []).some((item) => item && item.enabled) ? 'listen' : 'curious';
}

// A one-off movement on top of the mood, or null. A keystroke is a small tap,
// like kneading. Going from nothing to run to something to run is a hop, and so
// is running a row.
function petReaction(event, before, after) {
  if (event === 'run') return 'hop';
  if (event !== 'type' || after === 'idle' || after === 'doze') return null;
  return before === 'curious' && after === 'listen' ? 'hop' : 'tap';
}

const launcherPet = { petMood, petReaction, PET_DOZE_MS, PET_MOODS, PET_REACTIONS };
if (typeof module !== 'undefined' && module.exports) module.exports = launcherPet;
else globalThis.LauncherPet = launcherPet;
