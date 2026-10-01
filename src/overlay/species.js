// Overlay renderer, part: species tables, sprite builders and baked frames.
// The overlay is a set of classic scripts loaded in order by index.html. They
// share one global scope, so a name declared in an earlier part is visible here.

// ---- species -----------------------------------------------------------------
// The overlay hosts either a cat or a dog. Rather than branch at every draw site,
// the active species REWRITES the shared sprite/palette tables, so everything
// downstream (tray coats, settings, contact sheet, themes) keeps working unchanged.
// The cat's built-in tables are snapshotted first because applyThemes() mutates
// them in place and we need a clean copy to restore when switching back.
const CAT_BASE = { patterns: PATTERNS.slice(), build: PATTERN_BUILD.slice(), tabby: TABBY.slice() };
const forcedSpecies = qp.get('species');
let species = forcedSpecies === 'dog' || forcedSpecies === 'cat'
  ? forcedSpecies
  : (localStorage.getItem('species') === 'dog' ? 'dog' : 'cat');
const isDog = () => species === 'dog';

function speciesDefs(sp) {
  if (sp === 'dog') {
    return {
      patterns: DOG_PATTERNS, build: DOG_PATTERN_BUILD, tabby: DOG_PATTERN_BUILD.map(() => false),
      builds: DOG_BUILDS,
      sit: composeSitDog, type: composeTypeDog, loaf: composeCurlDog, rear: composeBegDog,
      pawUp: composePawUpDog,
      hunt: composeBowDog, huntCols: 30, huntRows: 22,
      typeCols: 24, typeRows: 24,
    };
  }
  return {
    patterns: CAT_BASE.patterns, build: CAT_BASE.build, tabby: CAT_BASE.tabby,
    builds: BUILDS,
    sit: composeSit, type: composeTypeFront, loaf: composeLoaf, rear: composeRearUp,
    pawUp: composePawUp,
    hunt: composeHunt, huntCols: 30, huntRows: 20,
    typeCols: 24, typeRows: 24,
  };
}

// Build descriptor for coat i under the active species. Cats carry a `tabby`
// flag; dogs carry breed geometry (ear/tail/leg length) straight off the build.
function buildFor(i, D) {
  const b = D.builds[D.build[i]] || {};
  return { ...b, tabby: !!D.tabby[i] };
}

// Rewrite the shared coat tables in place. Everything that reads PATTERNS /
// PATTERN_BUILD / TABBY (tray, settings, themes, contact sheet) then sees the
// active species without needing to know a species exists at all.
function installTables(D) {
  PATTERNS.length = 0; for (const p of D.patterns) PATTERNS.push(p);
  PATTERN_BUILD.length = 0; for (const b of D.build) PATTERN_BUILD.push(b);
  TABBY.length = 0; for (const t of D.tabby) TABBY.push(t);
}

let SPECIES_DEFS = speciesDefs(species);
installTables(SPECIES_DEFS);
// Raised-paw poses, same lazy-build deal. lift/out are QUANTISED before they reach
// here (see PAW_STEPS) so a smooth animation reuses a handful of frames instead of
// composing a new sprite every tick - pixel art wants stepped limbs anyway.
const PAW_STEPS = 8;
const pawSpriteCache = new Map();
function pawSpriteFor(i, lift, out) {
  const l = Math.round(clamp(lift, 0, 1) * PAW_STEPS), o = Math.round(clamp(out, 0, 1) * 4);
  const key = `${species}:${i}:${l}:${o}`;
  let sp = pawSpriteCache.get(key);
  if (!sp) {
    const D = SPECIES_DEFS;
    const tb = { ...(D.builds[PATTERN_BUILD[i]] || BUILDS[PATTERN_BUILD[i]] || {}), tabby: !!TABBY[i] };
    sp = buildSprite(24, 30, () => D.pawUp(tb, { lift: l / PAW_STEPS, out: o / 4 }));
    pawSpriteCache.set(key, sp);
  }
  return sp;
}

const batSpriteCache = new Map();
function batSpriteFor(i, up, ph) {
  const p = Math.round(clamp(ph, 0, 1) * 6);
  const key = `${species}:${i}:${up}:${p}`;
  let sp = batSpriteCache.get(key);
  if (!sp) {
    const D = SPECIES_DEFS;
    const tb = { ...(D.builds[PATTERN_BUILD[i]] || BUILDS[PATTERN_BUILD[i]] || {}), tabby: !!TABBY[i] };
    sp = buildSprite(24, BAT_ROWS, () => composeBat(tb, { up, ph: p / 6 }));
    batSpriteCache.set(key, sp);
  }
  return sp;
}

// Cats share ONE crouch across every coat, so its baked override is looked up at
// index 0: name a coat and only that coat's key can ever match, so key it '*'.
let spriteHunt = posed('hunt', 0, SPECIES_DEFS.huntCols, SPECIES_DEFS.huntRows, () => SPECIES_DEFS.hunt(buildFor(0, SPECIES_DEFS)));
let huntSprites = null;   // dogs vary the bow by breed (markings); cats share one crouch
function huntSpriteFor(i) { return (huntSprites && huntSprites[i]) || spriteHunt; }
function buildHuntSprites(D) {
  return D === null || !isDog() ? null
    : D.build.map((b, i) => posed('hunt', i, D.huntCols, D.huntRows, () => D.hunt(buildFor(i, D))));
}
const TW = 24 * CELL, TH = 24 * CELL;            // front-facing kneading-cat dims (per-coat sprites built below)
// Sit grid is always 24x30, so SW/SH and the mochi bands stay constant across the
// per-coat body builds (different shapes, same canvas). The sit sprites themselves
// are built per coat below, once PATTERNS + their builds are defined.
const SW = 24 * CELL, SH = 30 * CELL;            // sit dims (mochi uses these)
const HW = spriteHunt.SW, HH = spriteHunt.SH;    // hunt dims
let playArea = null;   // { x,y,w,h } fractions of the screen; the cat stays inside it
let geomBottomInset = null;   // taskbar height (DIP) from main; legacy floor inset
let geomBottomWorkY = null;   // work-area bottom (taskbar/Dock top) measured from the window's top edge; authoritative floor line (DPI-correct, clamp-agnostic)
// X margins from the cat's CENTER: the body is SW/2 wide each side, and the sit
// tail sweeps a further ~55px to the RIGHT (see drawTail) - so the right margin
// is bigger, ensuring a hard throw at the screen edge never clips the tail.
const EDGE_L = SW / 2 + 8, EDGE_R = SW / 2 + 60;
const HOME_MARGIN_R = SW / 2 + 80;   // right home sits this far in from the right edge (clears the system tray/clock)
const HOME_MARGIN_L = SW / 2 + 20;   // left home sits this far in from the left edge
const FLOOR_GAP = 0;                 // px the feet rest ABOVE the taskbar line (tunable in one place; 0 = flush)
const SMALL_MARGIN = 4;              // resting margin from the very screen bottom when there's NO bottom taskbar (top/side/auto-hide)
const HOME_ROAM_FRAC = 0.18;         // a stroll from a chosen drop spot reaches this fraction of the span the pet is allowed
const HOME_ROAM_MIN = 120;           // ...but never less than about a body and a quarter, or the pet reads as frozen
// Home corner: which bottom side the cat spawns at and drifts back to. Defaults to
// the right (clears the tray/clock); set restSide:'left' to keep it bottom-left.
function restSideLeft() { return !!(config && config.restSide === 'left'); }
// ...unless you have put the pet down somewhere yourself, which outranks the corner.
// `homeFrac` (read next to `pos` further down) is the whole point of this change: every
// system that re-homes the pet - the launch restore, the floor re-pin, the display-change
// rescue, work mode, the dog carrying its ball back - already asks homeX() where home is,
// so teaching this one function about the drop spot moves all of them at once.
function homeAnchored() { return homeFrac !== null; }
function setHomeAnchor(x) { homeFrac = clamp(x / Math.max(1, viewW), 0, 1); localStorage.setItem('homeFrac', String(homeFrac)); }
function clearHomeAnchor() { homeFrac = null; localStorage.removeItem('homeFrac'); }
function homeX() { return zoneClampX(homeAnchored() ? homeFrac * viewW : (restSideLeft() ? HOME_MARGIN_L : viewW - HOME_MARGIN_R)); }
function zoneClampX(v) {
  if (!playArea) return clamp(v, EDGE_L, viewW - EDGE_R);
  const a = playArea.x * viewW + EDGE_L, b = (playArea.x + playArea.w) * viewW - EDGE_R;
  return clamp(v, Math.min(a, b), Math.max(a, b));
}
function zoneClampY(v) {
  if (!playArea) return clamp(v, SH + 10, viewH - 10);
  const a = playArea.y * viewH + SH, b = (playArea.y + playArea.h) * viewH - 10;
  return clamp(v, Math.min(a, b), Math.max(a, b));
}
// The cat's resting foot line = the top edge of the taskbar/Dock. Derived from
// the BOTTOM work-area inset only - on macOS the menu bar is a TOP inset
// (availTop > 0) and must not raise the cat; the Dock (if at the bottom) is the
// remainder. Falls back to a small margin when there's no bottom inset.
function groundBaselineY() {
  // Preferred: main's absolute floor line = the work-area bottom (taskbar/Dock top)
  // measured from the window top. Clamp to viewH so the cat never lands below the
  // visible window: on Windows the overlay is clamped to the work area (viewH already
  // excludes the taskbar), so the floor is simply the window bottom; on macOS the
  // overlay covers the full display and the floor is the Dock line. When the floor is
  // the very window bottom (no bottom taskbar), lift a hair off the edge.
  if (geomBottomWorkY != null) {
    // Sit right ON the work-area bottom (taskbar/Dock top) - the shadow is drawn at
    // pos.y, so this lands the cat's ground contact flush on the line. restingY() clamps
    // it into the window (viewH - 2) when the OS kept the overlay off the taskbar.
    return Math.min(geomBottomWorkY, viewH) - FLOOR_GAP;
  }
  // Legacy inset path (older main without bottomWorkY): only correct when the overlay
  // actually covers the taskbar region.
  if (geomBottomInset != null) return viewH - (geomBottomInset > 0 ? geomBottomInset + FLOOR_GAP : SMALL_MARGIN);
  const s = window.screen;
  const topInset = Math.max(0, s.availTop || 0);
  const bottomInset = Math.max(0, (s.height || 0) - (s.availHeight || 0) - topInset);
  return viewH - (bottomInset > 0 ? bottomInset + FLOOR_GAP : 48);
}
// Floor-lock: when on (the default), the cat rests on the ground line and only
// strolls horizontally - it never autonomously wanders up the screen. Orthogonal
// to the play area, which still bounds left/right. config is null until the first
// onConfig, so an unset flag reads as "on".
function floorLockOn() { return !(config && config.floorLock === false); }
// Work mode: while "working", the cat parks in its rest corner on the taskbar and
// stays calm - no roaming, cursor-chase, startle-bolt, leaf-play, or butterfly.
// Non-destructive: it overrides behavior while on; the underlying settings return
// when it's off. config is null until the first onConfig, so unset reads as "off".
// Focus Guard (main.js) has decided we are busy: in a meeting, inside quiet hours,
// or work mode. The pet behaves exactly as it does in work mode - parks in its rest
// corner, no butterfly, no cursor chase, no startle-bolt, no leaf play - WITHOUT
// touching config.workMode, so switching it on for a meeting can never silently
// rewrite the user's own setting.
let focusBusy = false;
function workModeOn() { return focusBusy || !!(config && config.workMode); }
function restingY() {
  return floorLockOn() ? clamp(groundBaselineY(), SH + 10, viewH - 2) : zoneClampY(groundBaselineY());
}

// offscreen buffer big enough for either sprite
const oc = document.createElement('canvas');
oc.width = Math.max(SW, HW, TW); oc.height = Math.max(SH, HH, TH, BAT_H);
const octx = oc.getContext('2d'); octx.imageSmoothingEnabled = false;
const HEAD_SRC = 14 * CELL, FEET_SRC = 7 * CELL, MID_SRC = SH - HEAD_SRC - FEET_SRC;


// --- baked frames (src/art-frames.js) ---------------------------------------
// A painted frame beats the composer for the pose and the coat it names, and
// everything else keeps composing, so a half finished art pack still runs. Only
// the five HELD poses can be baked: the raised-limb activities are parameterised
// rigs (pawSpriteFor / batSpriteFor quantise a limb angle into a
// handful of frames) and one still would freeze them mid swing. A grid that does
// not match the pose's canvas is ignored rather than trusted, because the layout
// maths around it is built on those constants.
function artGrid(pose, i, cols, rows) {
  const all = typeof ART_FRAMES !== 'undefined' ? ART_FRAMES : null;
  const byPose = all && all[species] && all[species][pose];
  if (!byPose) return null;
  const name = (PATTERNS[i] && PATTERNS[i].name) || '';
  const g = byPose[name] || byPose[PATTERN_BUILD[i]] || byPose['*'] || null;
  if (!g || g.COLS !== cols || g.ROWS !== rows || !Array.isArray(g.rows) || g.rows.length !== rows) return null;
  return g;
}

// Stamp a baked grid THROUGH buildSprite so it picks up outlineHalo(), the eye
// boxes and the muzzle anchor exactly as a composed pose does - the halo is never
// painted by hand, and a patchy outline gets its gaps filled for free.
function posed(pose, i, cols, rows, compose) {
  const g = artGrid(pose, i, cols, rows);
  if (!g) return buildSprite(cols, rows, compose);
  return buildSprite(cols, rows, () => {
    for (let r = 0; r < rows; r++) {
      const row = g.rows[r];
      for (let c = 0; c < cols && c < row.length; c++) if (row[c] !== '.') setCell(c, r, row[c]);
    }
  });
}

const sprites = PATTERN_BUILD.map((b, i) => posed('sit', i, 24, 30, () => SPECIES_DEFS.sit(buildFor(i, SPECIES_DEFS))));
// each coat also gets its own typing (kneading) body, so every breed types differently
// one shared front "kneading cat" shape, recoloured per coat (+ tabby stripes / fluffy tufts)
const typeSprites = PATTERN_BUILD.map((b, i) => posed('type', i, 24, 24, () => SPECIES_DEFS.type(buildFor(i, SPECIES_DEFS))));
// and a dedicated loaf (resting) body per coat - same 24x30 size as the sit sprite
const loafSprites = PATTERN_BUILD.map((b, i) => posed('loaf', i, 24, 30, () => SPECIES_DEFS.loaf(buildFor(i, SPECIES_DEFS))));
// and a rear-up "bat the butterfly" body per coat - same 24x30 size as the sit sprite
const rearSprites = PATTERN_BUILD.map((b, i) => posed('rear', i, 24, 30, () => SPECIES_DEFS.rear(buildFor(i, SPECIES_DEFS))));
huntSprites = buildHuntSprites(SPECIES_DEFS);
// The out-of-box coat for whichever species is live NOW. This was a const resolved
// once at load, so every fallback after a species swap still named the LAUNCH
// species' index: a dog falling back landed on coat 4 of the breed list (a husky),
// because 4 is where the cat's Tuxedo sits.
function defaultPatternIndex() {
  return Math.max(0, PATTERNS.findIndex((p) => p.name === (isDog() ? 'Black Lab' : 'Mackerel Tabby')));
}
const coatKey = (sp) => (sp === 'dog' ? 'dogPattern' : 'pattern');
const storedPattern = localStorage.getItem(coatKey(species));
let patternIndex = storedPattern != null ? Number(storedPattern) : defaultPatternIndex();
if (!(patternIndex >= 0 && patternIndex < PATTERNS.length)) patternIndex = defaultPatternIndex();
const forcedPattern = qp.get('pattern');
if (forcedPattern) { const i = PATTERNS.findIndex((p) => p.name.toLowerCase().includes(forcedPattern.toLowerCase())); if (i >= 0) patternIndex = i; }

// Custom coats: layer user-defined palettes (from themes.json, sent by main over
// IPC) on top of the built-in coats, building each one's sit + type sprites at
// runtime. Re-applied wholesale on every update so add/delete just work.
// Cached "cold" (non-overheat) palette, rebuilt only when the coat changes - avoids
// recomputing ~12 colour conversions every single frame. Invalidated in applyThemes().
let _palKey = -1, _coldPalRGB = null, _coldPal = null;
let BASE_PATTERNS = PATTERNS.length;
// The last coat list main sent. Kept because a species swap rebuilds the coat
// tables from the built-ins alone, and main only broadcasts themes when they
// CHANGE - so without replaying them here, going cat -> dog -> cat dropped every
// custom coat until the next restart (and a pet wearing one fell back to Tuxedo).
let themeList = [];
function applyThemes(list) {
  themeList = Array.isArray(list) ? list : [];
  _palKey = -1;   // coat palettes changed -> force a cold-palette rebuild next frame
  // Custom coats shift what each index means, so every lazily-built, index-keyed
  // sprite cache has to go. batSpriteCache was missed here, which left the rear-up
  // batting pose painted in the coat that used to hold the index.
  pawSpriteCache.clear(); batSpriteCache.clear();
  PATTERNS.length = BASE_PATTERNS; PATTERN_BUILD.length = BASE_PATTERNS; TABBY.length = BASE_PATTERNS;
  sprites.length = BASE_PATTERNS; typeSprites.length = BASE_PATTERNS; loafSprites.length = BASE_PATTERNS; rearSprites.length = BASE_PATTERNS;
  // Custom coats are built from the CAT's geometry, and every other surface already
  // treats them as cat-only: the tray lists breeds alone for a dog, the settings
  // dropdown says so out loud, and config.js clamps dogPattern to the built-in
  // breeds. Building them onto a dog only minted indices nothing else could reach,
  // which is what let a right-click cycle walk a dog off the end of its own list.
  for (const th of (isDog() ? [] : themeList)) {
    if (!th || !th.name || !th.coat) continue;
    const build = BUILDS[th.build] ? th.build : 'standard';   // cat geometry, so SPECIES_DEFS.builds IS BUILDS here
    PATTERNS.push({ name: th.name, coat: th.coat, mark: th.mark || th.coat, white: th.white || th.coat,
      patch: th.patch || th.coat, eye: th.eye || '#8bbf5a', nose: th.nose || '#e0888f',
      inner: th.inner || '#f0b6a0', outline: th.outline || '#222831' });
    PATTERN_BUILD.push(build);
    TABBY.push(!!th.tabby);
    const D = SPECIES_DEFS, tb = { ...(D.builds[build] || BUILDS[build] || {}), tabby: !!th.tabby };
    const at = PATTERNS.length - 1;   // this custom coat's index, for the baked-frame lookup
    sprites.push(posed('sit', at, 24, 30, () => D.sit(tb)));
    typeSprites.push(posed('type', at, 24, 24, () => D.type(tb)));
    loafSprites.push(posed('loaf', at, 24, 30, () => D.loaf(tb)));
    rearSprites.push(posed('rear', at, 24, 30, () => D.rear(tb)));
    // No hunt sprite: huntSprites is per-BREED and dog-only, and cats share one
    // crouch (huntSpriteFor falls through to spriteHunt for any index past it).
  }
  // A custom coat's index is only IN RANGE once its theme has been built here, so
  // re-read the coat the config asked for. A config that arrived before its themes
  // was clamped down to a built-in coat and then stayed there, which looked exactly
  // like picking a custom coat doing nothing.
  if (config) {
    const want = isDog() ? config.dogPattern : config.pattern;
    if (Number.isFinite(want) && want >= 0 && want < PATTERNS.length) patternIndex = want;
  }
  if (!(patternIndex >= 0 && patternIndex < PATTERNS.length)) patternIndex = defaultPatternIndex();
  if (forcedPattern) { const i = PATTERNS.findIndex((p) => p.name.toLowerCase().includes(forcedPattern.toLowerCase())); if (i >= 0) patternIndex = i; }
}

// Swap species live (tray or settings). Rebuilds every sprite table in place so
// the running overlay never needs a restart.
function setSpecies(next, coatIdx) {
  const want = next === 'dog' ? 'dog' : 'cat';
  if (want === species && coatIdx == null) return false;
  const changed = want !== species;
  if (changed) {
    species = want;
    localStorage.setItem('species', species);
    SPECIES_DEFS = speciesDefs(species);
    installTables(SPECIES_DEFS);
    BASE_PATTERNS = PATTERNS.length;
    const D = SPECIES_DEFS;
    const rebuild = (pose, arr, cols, rows, fn) => {
      arr.length = 0;
      for (let i = 0; i < D.build.length; i++) arr.push(posed(pose, i, cols, rows, () => fn(buildFor(i, D))));
    };
    rebuild('sit', sprites, 24, 30, D.sit);
    rebuild('type', typeSprites, 24, 24, D.type);
    rebuild('loaf', loafSprites, 24, 30, D.loaf);
    rebuild('rear', rearSprites, 24, 30, D.rear);
    spriteHunt = posed('hunt', 0, D.huntCols, D.huntRows, () => D.hunt(buildFor(0, D)));
    huntSprites = buildHuntSprites(D);
    _palKey = -1;                        // force a cold-palette rebuild for the new coats
    // Drop any in-flight give-slot state. Both directions matter: updateTreat()
    // and drawTreat() run every frame regardless of species, so a fish left over
    // from the cat would otherwise be inherited by the dog, which walks to it and
    // starts eating it.
    ball = null; pantUntil = 0; wagBoost = 0;   // dog-only state
    treat = null;                               // cat-only state
    applyThemes(themeList);   // replay the custom coats onto the new tables (main won't re-send them)
  }
  const stored = coatIdx != null ? coatIdx : Number(localStorage.getItem(coatKey(species)));
  patternIndex = Number.isFinite(stored) && stored >= 0 && stored < PATTERNS.length
    ? stored
    : defaultPatternIndex();
  localStorage.setItem(coatKey(species), String(patternIndex));
  _palKey = -1;
  return changed;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// Excitement bleeds off after a fetch/greeting rather than snapping back, so the
// tail eases down instead of cutting from a whip to a sway in one frame.
function decayWag(dt) { if (wagBoost > 0) wagBoost = Math.max(0, wagBoost - dt * 0.00035); }
// The victory bounce after a butterfly catch: two quick hops, the second smaller,
// "yes!" rather than the done-hop's single arc. Amplitude is fixed when the window
// opens because the mood scalar it comes from is local to draw().
function bfJoyHop(t) {
  if (bfJoyT0 < 0 || t >= bfJoyUntil) return 0;
  // Only the --joy preview flag leaves the window open forever; loop the bounce for
  // it (1.4s on, 0.6s still) the way --state=done loops its hop, because a shot's
  // --at counts from page load while this clock started earlier, so no single
  // --at lands on a known phase of a one-shot beat.
  const je = bfJoyUntil === Infinity ? (t % (BF_JOY_MS + 600)) / BF_JOY_MS : clamp((t - bfJoyT0) / BF_JOY_MS, 0, 1);
  if (je >= 1) return 0;
  return Math.abs(Math.sin(je * Math.PI * 2)) * bfJoyAmp * (1 - je * 0.5);
}
const HOT_BODY = '#d9534f', HOT_OUTLINE = '#7a1f1a';
