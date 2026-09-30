// Overlay renderer, part: the rope climb.
// The overlay is a set of classic scripts loaded in order by index.html. They
// share one global scope, so a name declared in an earlier part is visible here.

// ---- painted rope climb (per-coat art) --------------------------------------
// Only the PAINTED half is here. The procedural climb pose that used to cover
// every other coat is gone for good: eyeBox() splits the grid at column 12 so the
// face has to straddle that seam, which pinned the body at 11.25 while the rope sat
// at 18.4 - leaving the arm no reach that did not cross the face. The only place it
// could grip was above the head, where a 4x3-cell mitt reads as a lump on the skull.
// Coats WITHOUT painted art swipe at the scroll leaf instead (see swatLeaf), which
// uses the bat rig, whose arm bows outward specifically to clear the skull.
//
// Note these frames are whole SCENES: the rope and the floor ball are painted into
// the art, which is why nothing here draws a strand. drawRope/ropeGeom belonged to
// the procedural climb and went with it.
// --- raster climb: painted PER-COAT sprite frames. A coat with its own set climbs
// with the painted art; a coat WITHOUT one uses the procedural climb in its colours ---
const CLIMB_SCENE_H = 2.4;      // full painted scene (cat+rope+ball) height as a multiple of the seated sprite
const CLIMB_ANCHOR_X = 0.5;     // horizontal anchor fraction of the frame (rope/cat centre over pos.x)
const CLIMB_DROP = 4;           // sink the scene a touch so the ball rests on the floor line
const coatSlug = (name) => String(name || '').toLowerCase().replace(/\s+/g, '-');
// Painted climb art is ON, and that is a deliberate trade.
//
// The painted rope-climb scenes are a different art language from the pet itself:
// the pet is a chunky ~24x30-cell sprite with flat fills and a pale sticker
// outline, while these are fine-grained and softly shaded, so the pet changes
// style and size mid-scroll. That was measured and it is real.
//
// It is still the better of two bad options today, because the PROCEDURAL climb
// does not read at this sprite size. A paw reaching overhead is about 4x3 cells of
// pale colour, which renders as a white blob on the cat's skull rather than a grip,
// and the front-facing symmetrical body reads as "cat standing next to a string" -
// exactly what composeClimb was written to avoid. A climb that looks right and
// matches nothing beats a climb that matches and looks broken.
//
// The real fix is painted art drawn IN the sprite's own chunky flat style, which
// removes the trade entirely. The prompts in ~/pixelpets-frame-pack/prompts/ now
// specify that style explicitly; they did not before, which is why this art clashes.
//
// Coverage today: tuxedo, orange-tabby, mackerel-tabby and tortoiseshell are painted
// (gray is skipped below). The other 10 coats and every dog still use the leaf swipe.
const PAINTED_CLIMB = true;
// Per-coat exclusions, applied when PAINTED_CLIMB is on. 'gray' is painted as a
// green-eyed gray+white bicolor, but the gray coat is solid gray with gold eyes.
const CLIMB_FRAME_SKIP = new Set(['gray']);
let climbImgs = {};   // { coat: { idle, up1, up2, down1, down2: Image } }
(function loadClimbFrames() {
  if (!PAINTED_CLIMB) return;
  if (typeof CLIMB_FRAMES === 'undefined') return;
  for (const coat of Object.keys(CLIMB_FRAMES)) {
    if (CLIMB_FRAME_SKIP.has(coat)) continue;   // mismatched art -> use procedural climb
    climbImgs[coat] = climbImgs[coat] || {};
    for (const frame of Object.keys(CLIMB_FRAMES[coat])) {
      const im = new Image();
      im.onload = () => { climbImgs[coat][frame] = im; if (typeof resumeRaf === 'function') resumeRaf(); };
      im.src = CLIMB_FRAMES[coat][frame];
    }
  }
})();

// True only when THIS coat has its own decoded painted set (no cross-coat fallback).
// The painted sets are cat-only art, so a dog always falls back to the procedural
// climb in its own colours - even if a breed (or an imported custom coat) happens to
// share a painted cat coat's name.
const coatHasFrames = (coat) => {
  if (isDog()) return false;
  const f = climbImgs[coat];
  return !!(f && f.idle && f.idle.complete);
};

// Pick a frame for this coat: idle when hanging, alternating up1/up2 climbing up,
// down1/down2 climbing down. Returns null if the coat has no painted set.
function pickClimbImg(t, climbing, dir, coat) {
  const f = climbImgs[coat];
  if (!f) return null;
  if (!climbing || Math.abs(dir) < 0.25) return f.idle;
  const a = Math.floor(climbAnim) % 2;   // alternation rate scales with scroll intensity (see climbFps)
  if (dir < 0) return (a ? f.up2 : f.up1) || f.idle;
  return (a ? f.down2 : f.down1) || f.idle;
}

// Blit the painted climb scene (cat + rope + ball, one self-contained image)
// anchored so the yarn ball rests on the floor line.
function drawClimbFrame(pos, t, climbing, dir, coat, bob) {
  const img = pickClimbImg(t, climbing, dir, coat);
  if (!img || !img.naturalHeight) return;
  const h = Math.round(SH * CLIMB_SCENE_H), w = Math.round(img.naturalWidth * (h / img.naturalHeight));
  const dx = Math.round(pos.x - w * CLIMB_ANCHOR_X);
  const dy = Math.round(pos.y - h + CLIMB_DROP - (bob || 0));   // continuous heave on top of the crisp pose swap
  ctx.drawImage(img, dx, dy, w, h);
}

// Grooming: the LIFT ENVELOPE only. The raised limb itself is a composed pose now
// (composePawUp), so all that is left here is the timing that drives it plus the
// wet detail at the muzzle - drawn INTO the sprite buffer, like drawYawn, so it
// scales and leans with the cat instead of floating in screen space.
const GROOM_CYCLE = 2400;
// How far the washing paw reaches away from the chest. Named (and asserted in
// tests/paw-up.test.js) because grooming is the one pose that used 0 here, and 0 is
// exactly what put a dead-vertical forearm up the middle of the face.
const GROOM_OUT = 0.38;
function groomPhase(t) {
  const c = (t % GROOM_CYCLE) / GROOM_CYCLE;                        // 0..1 within one raise
  let lift = c < 0.16 ? c / 0.16 : c > 0.80 ? (1 - c) / 0.20 : 1;   // ease up, hold, ease down
  lift = clamp(lift, 0, 1);
  lift = lift * lift * (3 - 2 * lift);                              // smoothstep
  const licking = c > 0.16 && c < 0.80;                             // tongue works while the paw is up
  return { lift, licking, lick: licking ? (Math.sin(t / 90) + 1) / 2 : 0 };
}
// Pink tongue flicking the raised paw, plus the odd squeaky-clean sparkle.
function drawLick(g, sp, bob, ph) {
  if (!ph.licking) return;
  const mx = sp.muzzle.x - 5, my = sp.muzzle.y + bob + 1;          // the paw is held just left of the nose
  g.globalAlpha = 0.45 + ph.lick * 0.55;                            // wet flash on each reach
  g.fillStyle = '#ff9aa8';
  const th = 2 + Math.round(ph.lick * 3);
  g.fillRect(Math.round(mx - 2), Math.round(my), 4, th);
  g.fillStyle = '#ff8090';
  g.fillRect(Math.round(mx - 1), Math.round(my + th), 2, 1);        // pointed wet tip
  g.globalAlpha = 1;
}

// How far through a swipe the batting paw is, 0..1. Shared by the pose (which sets
// the limb's height/reach) and renderPlay (which knocks the leaf at the peak), so the
// strike and the contact can never drift out of sync.
const PLAY_BAT_CYCLE = 540;
function battingReach(t) {
  if (playT0 < 0) return 0;
  return Math.sin(clamp(((t - playT0) % PLAY_BAT_CYCLE) / PLAY_BAT_CYCLE, 0, 1) * Math.PI);
}

// Idle paw-play: a small leaf drifts in front of the seated cat and it bats at it with
// a front paw. Self-contained (it plays by itself, never grabs the cursor) so it reads
// as "alive and playful" without getting in the user's way.
function startPlay(t) {
  const side = Math.random() < 0.5 ? -1 : 1;
  playT0 = t; playUntil = t + 2600 + Math.random() * 1600;
  mote = { x: pos.x + side * 16, y: pos.y - SH * 0.95, vx: side * 0.5, vy: 0.5, spin: Math.random() * 6.28, side, batCyc: -1 };
  tailFlickT0 = t;
}
// A little tumbling leaf the cat bats around (drawn in screen coords).
function drawMote(x, y, spin) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(spin);
  // dark rim first: the overlay sits on whatever wallpaper you have, and a small
  // mid-green leaf disappears against a light or busy desktop without one
  ctx.fillStyle = '#2f5f28'; ctx.beginPath(); ctx.ellipse(0, 0, 6.4, 3.9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5fae4e'; ctx.beginPath(); ctx.ellipse(0, 0, 5, 2.6, 0, 0, Math.PI * 2); ctx.fill();      // leaf body
  ctx.fillStyle = '#7ccb62'; ctx.beginPath(); ctx.ellipse(-1, -0.7, 3.2, 1.5, 0, 0, Math.PI * 2); ctx.fill(); // lit top
  ctx.strokeStyle = '#3c7a32'; ctx.lineWidth = 0.8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-4.5, 0); ctx.lineTo(5, 0); ctx.stroke();                                       // center vein
  ctx.strokeStyle = '#4e8f40'; ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(7.6, 1.3); ctx.stroke();         // stem
  ctx.restore();
}
// A sleepy yawn drawn INTO the offscreen sprite buffer (so it scales/leans with the
// cat): a dark open mouth below the nose with a little pink tongue. `open` is 0..1.
function drawYawn(g, sp, bob, open) {
  const mx = sp.muzzle.x, my = sp.muzzle.y + bob + 6;
  g.fillStyle = '#3a2230';
  g.beginPath(); g.ellipse(mx, my, 2.8, 1.2 + 4.6 * open, 0, 0, Math.PI * 2); g.fill();   // open mouth
  g.fillStyle = '#ff8fa3';
  g.beginPath(); g.ellipse(mx, my + 1.8 * open, 1.5, 0.9 + 2.0 * open, 0, 0, Math.PI * 2); g.fill();   // tongue
}
// Update the leaf physics + draw the batting paw. Called from the seated render once
// per frame while `playing` (oy = sprite top). The paw itself lives in the pose.
function renderPlay(palRGB, oy, t, step) {
  if (!mote) { mote = { x: pos.x - 20, y: oy + SH * 0.06, vx: 0, vy: 0.5, spin: 0.6, side: -1, batCyc: -1 }; if (playT0 < 0) playT0 = t; }   // QA --state=play
  // The leaf springs back toward a hover point, with a little gravity so it keeps
  // sinking and the cat keeps batting it up. That point sits just OUTSIDE the
  // silhouette, on the SAME side as the batting paw: hovering it over the cat's own
  // body (as it used to) hid a 5px leaf against the coat, and parked it on the
  // opposite side from the paw that was supposedly hitting it.
  const hoverX = pos.x + mote.side * (SW * 0.46), hoverY = oy + SH * 0.34;
  mote.vx += (hoverX - mote.x) * 0.010 * step;
  mote.vy += ((hoverY - mote.y) * 0.010 + 0.06) * step;
  mote.vx *= 0.93; mote.vy *= 0.93;
  mote.x += mote.vx * step; mote.y += mote.vy * step;
  mote.spin += 0.05 * step;
  // The striking paw is part of the composed pose now (see battingReach + pawSpriteFor),
  // so this only owns the leaf: its physics, the knock, and the sparkle on contact.
  const CYC = PLAY_BAT_CYCLE, cyc = Math.floor((t - playT0) / CYC), phase = ((t - playT0) % CYC) / CYC;
  const shX = pos.x - 8, shY = oy + SH * 0.60;
  if (cyc !== mote.batCyc && phase > 0.42 && phase < 0.72) {   // connect once per cycle near the strike peak
    mote.batCyc = cyc;
    const aw = Math.atan2(mote.y - shY, mote.x - shX) + (Math.random() - 0.5) * 0.8;
    mote.vx += Math.cos(aw) * 2.8; mote.vy += Math.sin(aw) * 1.4 - 2.0;   // knock it up and away
    idleSparkles.push({ x: mote.x, y: mote.y, t0: t });
    tailFlickT0 = t;
  }
  drawMote(mote.x, mote.y, mote.spin);
}

// hunt/pet tuning
const HUNT_TRIGGER = 0.4, HUNT_SPEED = 6, STANDOFF = 28, POUNCE_RANGE = 46, POUNCE_MS = 300, POUNCE_WINDUP_MS = 300;
// The catch happens at the paws, POUNCE_REACH above the feet at the apex of the leap.
const POUNCE_LEAP = 32, POUNCE_REACH = HH * 0.55 + POUNCE_LEAP;
// The bug is frozen for the whole hunt (the flight integrator is paused while hunting), so a
// correctly aimed leap always connects and a visit would end at the first pounce, a couple
// of seconds after arrival. Two things keep it a game: no pounce in the first
// BF_POUNCE_AFTER_MS of a visit (the notice, the stalk and a first swat come first), and a
// BF_JINK_P chance the bug flits aside as the cat coils, so the cat, committed, whiffs.
const BF_JINK_P = 0.3, BF_POUNCE_AFTER_MS = 4000;
// The hunt target is clamped to the play area (a pounce must never leave it), but the bug
// flies on screen-margin clamps of its own, so it can hover past an edge the cat may not
// cross. A leap at it goes straight up under nothing: a miss with no story. This says
// whether the clamped target still puts the paws within the catch radius of the bug.
function bugPounceable() {
  const ty = bfY + POUNCE_REACH;
  return Math.abs(zoneClampX(bfX) - bfX) <= 24 && Math.abs(zoneClampY(ty) - ty) <= 44;
}
// Patting: how fast the hand may move and still count as a stroke (px/ms - above
// this you are flicking past, not petting), and how long a touch stays warm after
// the pointer moves on, so one stroke does not read as a dozen separate taps.
const PET_STROKE_MAX = 0.9, PET_GRACE_MS = 280;
// A hand resting on the pet still PETS it - the eyes squint and the head leans
// into your palm, which is deliberate and worth keeping. What it must not do is
// go on making NOISE forever: the pointer parked on the sprite (easy to do by
// accident, and where the cursor often ends up after a pounce) purred without end
// and trilled every 1.5s with nobody touching the mouse. So the pose is unbounded
// and the voice is not - if the hand has not moved in this long, the pet settles
// and goes quiet while still enjoying the company.
const PURR_HAND_MS = 8000;
// butterfly play: the cat only engages the butterfly once the cursor has been still this
// long (the cursor always wins). BF_TOP keeps the butterfly's targets off the top edge;
// BF_EDGE is the screen-edge keep-out for the whole sprite (covers the wingspan).
const BF_PLAY_IDLE = 1800, BF_TOP = 46, BF_EDGE = 18, BF_SCALE = 1.25;
// If you leave the machine alone (no cursor/keys) this long, a butterfly comes out so
// the cat has something to play with - then keeps dropping by every so often while idle.
const IDLE_BUTTERFLY_MS = 7500;
// The butterfly is idle-only: it won't appear until the mouse has been still this long,
// and it leaves the moment the mouse starts moving again (the cursor always wins).
const BF_MOUSE_QUIET_MS = 6000;    // mouse must be still this long before a butterfly may spawn
const BF_MOUSE_ACTIVE_MS = 500;    // mouse counts as 'in use' if it moved within this window
const BF_GRACE_MS = 1100;          // ...and must STAY in use this long before the butterfly gives up
// Come back after being away this long and the cat notices you: happy eyes, hearts, a chirp.
const GREET_IDLE_MS = 90000;
// "air currents & the chase" (mirrors site/cat-live.js): the butterfly glides a drifting
// figure-eight across the screen; the cat creeps after it via the existing roam machinery.
const DRIFT_PHASE_RATE = 0.012, DRIFT_EASE = 0.012, LISSA_RATIO = 2, LISSA_DELTA = Math.PI / 2;
const DRIFT_REPICK_MS = [4200, 3000], WANDER_ACCEL = 0.022;
const BURST_RATIO = 3.0, BURST_GATE = 0.7, BURST_LIFT = 26, FLAP_BURST_MULT = 2.2;
const BUG_INTEREST_MIN = 90, BUG_STANDOFF = 70, BUG_RETARGET_DIST = 60, BUG_CREEP_MS = 1400, BUG_POUNCE_TRIGGER = POUNCE_RANGE * 1.9;
// Keep the butterfly playing in a zone AROUND the cat's head (the zone follows the cat)
// instead of roaming the whole screen. The figure-eight swing stays < the zone half-extents.
// All tunable: widen BF_ZONE_X for more room, shrink for a cozier play space.
const BF_ZONE_X = 150, BF_ZONE_TOP = 130, BF_ZONE_BOT = 40;
const BF_LISSA_AX = 70, BF_LISSA_AY = 44;
// Gentle paw-swat at a butterfly that's near the head but just out of full-pounce range.
const BF_SWAT_RANGE = 150, BF_SWAT_MS = 600;
const BF_JOY_MS = 1400, BF_HELD_MS = 550, BF_NOTICE_MS = 500;   // the victory beat after a catch, how long the bug is held first, the "oh!" when it arrives

// mood/energy tuning (all tunable). Decay is per-ms; ~1.8/s gives a gentle drift
// back to calm when nothing is happening.
const ENERGY_DECAY = 0.0007;   // slower drift back to calm -> the cat stays lively/playful longer
const CALM_MAX = 50, PLAYFUL_MAX = 80;
const STARTLE_VEL = 3.5, STARTLE_JUMP = 320, STARTLE_MS = 820, ZOOMIES_MS = 2500;
// Night-time sleepiness: late at night the cat winds down toward calm faster, so it
// loafs and dozes more (a big stimulus can still rouse it). Cached to once a minute
// so we're not allocating a Date every frame.
const NIGHT_DECAY_MULT = 2.4;
let _nightAt = 0, _nightCached = false;
function isNight(t) {
  if (t - _nightAt > 60000) { const h = new Date().getHours(); _nightCached = h >= 23 || h < 6; _nightAt = t; }
  return _nightCached;
}
const STARTLE_RANGE = 160;   // only flinch when the cursor lunges NEAR the cat - not on every fast move across the screen
function bandOf(e) { return e <= CALM_MAX ? 'calm' : e <= PLAYFUL_MAX ? 'playful' : 'zoomies'; }
function addEnergy(n) { energy = clamp(energy + n, 0, 100); }
// A dog that has just been sprinting pants. Tied to the zoomies band so it shows
// up exactly when the sprite is already visibly worked up.
function updateDogVitals(t, dt) {
  if (!isDog()) { pantUntil = 0; decayWag(dt); return; }   // a cat's wagBoost decays like a dog's now: the cat tail reads it
  decayWag(dt);
  if (energy > PLAYFUL_MAX && t > pantUntil) pantUntil = t + 3000;
}

function restSprings() { head = { x: pos.x, y: pos.y - SH, vx: 0, vy: 0 }; feet = { x: pos.x, y: pos.y, vx: 0, vy: 0 }; }
function persistPos() { localStorage.setItem('pos', JSON.stringify({ x: pos.x, y: pos.y })); }
// Letting go of the pet. Putting it down MOVES ITS HOME, which is the fix for a drop that
// looked like it was being ignored: the drop used to write pos and nothing else, so the
// corner the pet was born in still owned every system that re-homes it. The wander picker
// aimed back at that corner about ten seconds later, work mode marched it there, and a
// restart put it back. Split out of the mouseup listener because the listener is
// unreachable from the vm test harness (scripts/overlay-vm.js stubs addEventListener), so
// the drop was only ever "tested" by hand-writing pos.x, which pins nothing at all.
function dropAt(x) { pos.x = zoneClampX(x); pos.y = restingY(); setHomeAnchor(pos.x); persistPos(); }
// How far a stroll may take the pet from a spot you chose. A share of the span it is
// allowed rather than a flat pixel count, so a narrow play area gets short strolls and
// the whole screen gets long ones, with a floor so it never reads as frozen.
function homeRoamRadius() { const span = playArea ? playArea.w * viewW : viewW; return Math.max(HOME_ROAM_MIN, span * HOME_ROAM_FRAC); }
// Where the next wander aims. Split out of the roam block so the distribution can be
// sampled directly in a test, rather than driving frames for five minutes and hoping.
function roamTargetX() {
  if (homeAnchored()) {
    // The same r*r spread, but mirrored SYMMETRICALLY around the spot you chose rather than
    // pushed against one edge. The edge skew is exactly what walked the pet back across the
    // screen about ten seconds after every drop. Mirroring keeps the short-stroll feel
    // (E[r*r] is 0.25, so it drifts about a cat's width on average and only rarely reaches
    // the full radius) while leaving no net pull either way, so the pet mooches around its
    // patch and drifts back instead of creeping steadily off in one direction.
    const r = Math.random() * Math.random();
    return homeX() + (Math.random() < 0.5 ? -r : r) * homeRoamRadius();
  }
  // No chosen spot: the original corner skew, untouched. r*r clusters near 0, so the pet
  // hangs out on its preferred side while still roaming the whole width now and then.
  const skew = Math.random() * Math.random();
  const frac = restSideLeft() ? skew : 1 - skew;
  return playArea ? (playArea.x + frac * playArea.w) * viewW : frac * viewW;
}
