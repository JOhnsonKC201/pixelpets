// Overlay renderer, part: live state, positioning and one-shot actions.
// The overlay is a set of classic scripts loaded in order by index.html. They
// share one global scope, so a name declared in an earlier part is visible here.

// ---- live state -------------------------------------------------------------
let cursor = { x: 0, y: 0 }, prevCursor = { x: 0, y: 0 }, velEMA = 0;
let lastCursorMove = 0, staringT0 = -1, nextStareLook = 0;   // mouse-idle -> the cat stares at the cursor, then roams its eyes
let shakeFlips = 0, shakeDir = 0, lastFlipAt = 0, wobbleUntil = 0;   // mochi shake-wobble
let heat = 0, keyPulse = false, lastKeyAt = -9999;
let nextBlink = 1500, blinkUntil = 0, prevT = 0, labelUntil = 0;
let huntUntil = 0, pouncing = false, pounceT0 = 0, pounceFrom = null, pounceTarget = null;
let windingUp = false, windupT0 = 0;   // butterfly pounce: a brief anticipation coil before the spring
let huntTarget = null;   // hunt aims here (defaults to the cursor); the butterfly can borrow it
let bfNudgeSince = 0;     // when the mouse first stirred during a visit (grace window)
let bfOn = false, bfX = 0, bfY = 0, bfVx = 0, bfVy = 0, bfFlap = 0, bfMode = 'in', bfUntil = 0, bfNextVisit = 35000, bfPal = 0, bfNextPal = 0, bfWpX = 0, bfWpY = 0, bfNextDive = 0, bfDiveUntil = 0, bfDodgeUntil = 0, bfSwatCool = 0, bfEdgeSince = 0, bfIdleNextVisit = 0;
// paw-swat at the butterfly (a gentle reach that doesn't need a full pounce)
let bfSwatT0 = 0, bfSwatUntil = 0, bfBatHit = 0;
// the catch is a beat, not a frame: the bug is held between the paws for a moment
// (bfMode 'held'), then slips out, and a short victory window opens that the idle
// branch turns into a double bounce with happy eyes and a blush. Render-only: none
// of this moves pos.
let bfJoyT0 = -1, bfJoyUntil = 0, bfJoyAmp = 0, bfHeldUntil = 0, bfNoticeT0 = -1, bfVisitT0 = 0;
// Set by the "Send a butterfly" button. Work mode and a Focus Guard busy signal stop
// the pet wandering off and stop UNSOLICITED visits; they do not veto what you clicked,
// the same rule the treat and the ball already follow (see giveTrekOn). Cleared when
// the visit ends, so the next autonomous one is gated normally again.
let bfSummoned = false;
// a short fading sparkle trail behind the butterfly
let bfNextTrail = 0, bfTrail = [];
// "air currents" glider state (mirrors site/cat-live.js): a drifting figure-eight center + phase
let bfDriftCx = 0, bfDriftCy = 0, bfDriftTX = 0, bfDriftTY = 0, bfNextDrift = 0, bfPhase = 0;
let hearts = [], lastHeart = 0, lastBodyTrill = -9999;
// Pop one (sometimes a 2-3 burst) love particle with randomized size + drift so no
// two look alike; ~1 in 6 is a sparkle instead of a heart. `base` = typical heart scale.
function popLove(t, x, y, base, spreadX) {
  const calm = (config && config.reducedMotion) || lowPower;
  const n = calm ? 1 : (Math.random() < 0.22 ? (Math.random() < 0.4 ? 3 : 2) : 1);
  for (let i = 0; i < n; i++) {
    hearts.push({
      x: x + (Math.random() - 0.5) * spreadX,
      y: y + (Math.random() - 0.5) * 6,
      t0: t,
      s: base * (0.7 + Math.random() * 0.8),                 // 0.7x-1.5x of the context base size
      kind: (!calm && Math.random() < 0.18) ? 'spark' : 'heart',
      vy: 24 + Math.random() * 18,                           // rise distance over life (px)
      wobA: 2 + Math.random() * 5,                           // sideways wobble amplitude
      wobF: 4 + Math.random() * 4,                           // wobble frequency
      ph: Math.random() * Math.PI * 2,                       // wobble phase offset
      life: 950 + Math.random() * 500,                       // lifetime (ms)
    });
  }
}
// A fan of pink sparkles for the catch: the glyph popLove rolls 18% of the time,
// pushed into hearts[] so the existing loop draws and expires them. The spread is
// derived, not rolled: no Math.random() here, so the seeded PRNG stream that the
// self-play parity test reads is left exactly as it was.
function popSparks(t, x, y, n) {
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * Math.PI;                       // fan across the top half
    hearts.push({ x: x + Math.cos(a) * 12, y: y - Math.sin(a) * 4, t0: t, kind: 'spark',
      s: 0.8 + (i % 3) * 0.25, vy: 22 + (i % 2) * 12, wobA: 2 + (i % 3), wobF: 5 + (i % 2) * 2,
      ph: i * 1.3 + (t % 7), life: 900 + (i % 3) * 180 });
  }
}
let idleSparkles = [], nextIdleSparkle = 0;
let loafZZZ = [], nextLoafZ = 0;
let musicNotes = [], nextMusicNote = 0;        // floating notes while the Lobby Jam plays
let jamRunning = false, jamMoodCur = '';       // reconciled against config.lobbyJam (audio start/stop)
// stretch reminder (08) + AI-agent thinking/done (10/11)
let stretchT0 = -1, nextStretch = 0;
let agentState = 'idle', doneHopT0 = -1, doneHopPending = false, doneIsAgent = false, errorPending = false;
const STRETCH_INTERVAL = 1000 * 60 * 20, STRETCH_MS = 1700, DONE_MS = 760;
// Scroll reaction (09). `paperLen` is the scroll energy: it grows while the wheel
// turns and decays once it stops. `scrollDirRaw` is -1 scrolling up, +1 down, and
// `scrollRate` is the smoothed wheel speed that sets how fast the leaf travels.
let paperLen = 0, paperUntil = 0, scrollPulses = 0, scrollDirRaw = -1, scrollRate = 0;
// Painted-climb only: the eased -1..+1 heading and the frame accumulator that
// pickClimbImg() steps through idle/up1/up2/down1/down2.
let climbDir = -1, climbAnim = 0;
// Scroll swat: a leaf streaks past in the direction you are scrolling and the pet
// rears up and takes swipes at it. Same scroll energy as before, but the pose is
// the PROVEN bat rig, whose arm bows outward to stay clear of the skull.
let swatLeaf = null;      // { x, y, spin, spinV, hit } - null when nothing is flying past
let swatT0 = 0;           // swipe tempo anchor, reset when a new leaf enters
// Leaves are replaced continuously while the wheel turns, so "once per leaf" still
// meant a chirp every 0.3-0.8s down a long page. One happy noise per scroll burst.
let swatChirpUntil = 0;
let lastSwipeStroke = -1;   // which swipe of the bat cycle last played its whoosh
// The stroke index is an ANIMATION quantity, so on its own it ties the sound rate
// to a tempo constant. This is the time budget: whatever the swing clock does, the
// paw cannot whoosh more often than this. Shared by the butterfly and the leaf,
// which is also what stops the handoff between them firing an extra one.
let nextSwipeSound = 0;
// liveliness: eased gaze, idle micro-actions, animated tail + frame governor
let smoothLook = { x: 0, y: 0 };
let lookTarget = null, lookTargetUntil = 0;
let nextIdleAt = 0, leanTarget = 0, lean = 0, cursorLean = 0, leanUntil = 0, tailFlickT0 = -1, loafUntil = 0, groomUntil = 0;
let playUntil = 0, playT0 = -1, mote = null;   // idle paw-play: the cat bats a drifting leaf with a front paw
let treat = null;   // a dropped treat (tray "Give a treat"): the cat trots over and noms it
// --- dog-only state ---------------------------------------------------------
let ball = null;          // { x, y, vx, vy, phase: 'fly'|'rest'|'carry'|'drop', ... } - fetch
let wagBoost = 0;                         // transient wag speed-up (greeting, fetch, treats)
let pantUntil = 0;                        // tongue out after exertion
let yawnUntil = 0;   // occasional sleepy yawn (open mouth + squint)
let nextRoam = 0, roamUntil = 0, roamFrom = null, roamTo = null, roamDur = 1500;   // autonomous wandering
let lastDrawn = 0, wantHighFps = true, rafPaused = false;
let lowPower = false;   // main's derived low-power flag (user toggle and/or on battery)
// Comnyang-style productivity layer: settings from main + reminder/break bubble
let config = null;
let bubbleText = '', bubbleUntil = 0;
// Alerts waiting their turn. Two landing together (a reminder and a calendar nudge,
// or two reminders set for the same minute) used to overwrite each other on the spot:
// main.js only suppresses IDENTICAL messages, so the first bubble could vanish
// milliseconds after it appeared and be gone unread. See queueBubble.
let bubbleQueue = [];
const BUBBLE_QUEUE_MAX = 4;   // deeper than this and you were never going to read them
const BUBBLE_GAP = 220;       // a beat between bubbles so two in a row don't read as one flicker
let pomo = null;   // { on, phase: 'focus'|'break', endsAt } - main owns the clock
let purring = false;
// Comnyang mood/energy model: 0-100, decays over time, bumped by stimuli. Bands
// (calm/playful/zoomies) gate + scale every behavior; see bandOf()/intensity.
let energy = 68;   // start a touch more playful
let startleT0 = -1, startleUntil = 0, startleMode = 'creep', startleFrom = null, startleTo = null, startleCooldownUntil = -9999;
let startleSoundUntil = -9999;   // the growl's own, much longer gap - see the startle block
let zoomiesT0 = -1, prevBand = '', spinUntil = 0;

// Where you last put the pet down, as a FRACTION of the window width rather than a pixel
// column: main resizes the overlay to the primary display on every resolution, DPI and
// monitor change (see refit), so an absolute x saved on one screen either strands the pet
// against an edge of the next or lands it somewhere it has never been. null = you have not
// chosen a spot, so home is restSide's corner. Lives here beside `pos` because it is pet
// state set by a gesture, not a preference set by a control.
let homeFrac = null;
try { const v = parseFloat(localStorage.getItem('homeFrac')); if (Number.isFinite(v)) homeFrac = clamp(v, 0, 1); } catch (e) { /* ignore */ }
if (SHOT || SHEET) homeFrac = null;   // previews and the contact sheet place the pet themselves

let pos;
try { pos = JSON.parse(localStorage.getItem('pos')); } catch (e) { /* ignore */ }
if (SHOT) pos = { x: 130, y: 250 };
if (SHOT && qp.get('treat') === '1') treat = { x: 210, y: 250, phase: 'nom', nomUntil: Infinity };   // preview render: npx electron . --shot --treat=1
else if (!pos || typeof pos.x !== 'number') pos = { x: homeX(), y: viewH - 80 };
// Kept below the chain above on purpose: slipping a statement between that `if` and
// its `else if` silently re-parents the position fallback onto this condition.
if (SHOT && qp.get('note')) { bubbleText = qp.get('note'); bubbleUntil = Infinity; }                 // preview render: npx electron . --shot --note="..."
if (SHOT && qp.get('joy') === '1') { bfJoyT0 = 0; bfJoyUntil = Infinity; bfJoyAmp = 14; }         // preview render: npx electron . --shot --joy --at=350
pos.x = zoneClampX(pos.x); pos.y = zoneClampY(pos.y);
// Start each launch resting on the taskbar line (keep the remembered X, snap Y to
// the baseline) so the cat always begins the day on the same line, never mid-screen.
if (!SHOT) pos.y = restingY();
// Don't let the DEFAULT home jam against the clock: with no chosen spot and no custom play
// area, pull a far-right-parked cat in from the edge on launch (only ever moves it left).
// A spot you put the pet down on yourself is honoured as-is: HOME_MARGIN_R exists to keep
// the pet off the tray clock in the corner it picked for you, and it has no business
// second-guessing a corner you picked for it.
if (!SHOT && homeAnchored()) pos.x = homeX();
else if (!SHOT && !playArea) pos.x = restSideLeft() ? Math.max(pos.x, homeX()) : Math.min(pos.x, homeX());
let head = { x: pos.x, y: pos.y - SH, vx: 0, vy: 0 };
let feet = { x: pos.x, y: pos.y, vx: 0, vy: 0 };
let grabbing = false;
let settingArea = false, areaDragStart = null, areaRect = null;   // "set play area (drag)" mode
let petBurstUntil = 0, downAt = 0, downX = 0, downY = 0;   // click-to-pet
// Warm window kept alive by a hand resting on OR stroking the pet, plus where that
// touch landed. Petting used to require an almost-still cursor, which meant the
// stroke itself broke the state and the eyes snapped open mid-pat.
let petTouchUntil = 0, petTouchHead = false;
const SETTLE_MS = 240;   // eased "settle/land" when the floor line moves (resize / DPI / display change)
let settleT0 = -1, settleFromY = 0, settleToY = 0, settleSquash = 0;

// Re-pin to the floor (taskbar line) once the overlay reaches its true full-screen
// size. The one-shot pin above runs at module load, where viewH / window.screen
// can be briefly wrong on a multi-monitor / HiDPI launch - so the cat may pin against a
// stale height and float mid-screen. resize() (top of file) only resizes the canvas;
// this re-snaps the cat after the canvas settles. Main also calls win.setBounds() on
// display changes (see main.js refit), which fires 'resize' too.
// After boot, keep re-homing X to the rest corner for a brief window while the launch geometry
// settles: viewW/viewH can arrive stale (small) on a HiDPI/multi-monitor launch, so the first
// pins land against the wrong size. repinFloor runs on module load, every 'resize', and every
// 'geom', so re-homing here tracks the cat to the TRUE corner as the size stabilizes. After the
// window, only Y is re-pinned (so later display changes / user drags never yank X sideways).
const LAUNCH_HOME_MS = 3000;
const bootAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : 0;
function floorIdle() {
  const t = performance.now();
  const startled = startleT0 >= 0 && t < startleUntil;
  return !grabbing && !pouncing && !startled && !(paperLen > 1) && !(roamUntil > t);
}
function repinFloor() {
  if (SHOT || SHEET) return;
  if (typeof pos === 'undefined' || !pos) return;   // resize can fire before pos exists
  if (!floorLockOn()) { pos.x = zoneClampX(pos.x); restSprings(); persistPos(); resumeRaf(); return; }
  if (!floorIdle()) return;                          // never yank the cat mid-interaction
  if (performance.now() - bootAt < LAUNCH_HOME_MS) pos.x = homeX();   // launch settling: snap to the rest corner as geometry stabilizes
  pos.x = zoneClampX(pos.x);
  const target = restingY();
  if (Math.abs(target - pos.y) > 1) { settleFromY = pos.y; settleToY = target; settleT0 = performance.now(); }   // ease the drop, don't teleport
  else { pos.y = target; settleT0 = -1; restSprings(); }
  persistPos(); resumeRaf();
}

// One-shot actions the settings window can ask for ("make it do something").
//
// Each one nudges the SAME state the pet reaches on its own, rather than forcing a
// pose. Forcing would have been less code and wrong twice over: FORCED_STATE is a
// load-time preview switch that cannot be set on a running pet, and a pinned pose
// never ends, so the pet would freeze in it instead of playing the behaviour out
// and going back to its own routine.
//
// The clears matter as much as the sets. Grooming, loafing and playing are all
// gated on the pet being calm and not already busy, so asking for a wash while it
// is mid-wander does nothing at all - a button that silently no-ops. Standing the
// other timers down first makes the request land every time.
function runAction(id) {
  const t = performance.now();
  const clearBusy = () => { roamUntil = 0; huntUntil = 0; playUntil = 0; loafUntil = 0; groomUntil = 0; yawnUntil = 0; };
  switch (id) {
    case 'companion': clearBusy(); if (isDog()) throwBall(); else { bfSummoned = true; startBflyVisit(t); } break;
    case 'give': if (isDog()) throwBall(); else dropTreat(); break;
    case 'play': clearBusy(); startPlay(t); break;
    case 'stretch': clearBusy(); stretchT0 = t; nextStretch = t + STRETCH_INTERVAL; break;
    case 'groom': clearBusy(); groomUntil = t + 2600 + Math.random() * 1400; break;
    case 'loaf': clearBusy(); loafUntil = t + 4000 + Math.random() * 4000; break;
    // The only way back to a plain corner once you have put the pet down somewhere. Re-picking
    // the corner you are already on cannot do it: a <select> fires no change event when the
    // value does not move, and the tray radio's broadcast is ignored because restSide did not
    // change. Clear BEFORE aiming, so homeX() below reads the corner and not the old spot.
    case 'home': clearBusy(); clearHomeAnchor(); roamFrom = { x: pos.x, y: pos.y }; roamTo = { x: homeX(), y: floorLockOn() ? restingY() : pos.y }; roamDur = 1400; roamUntil = t + roamDur; nextRoam = t + 12000; break;
    default: return;   // unknown id: do nothing rather than guess
  }
  resumeRaf();
}


// Replace {name} (and provide clean fallbacks when no name is set).
function catName() { return config && config.name ? config.name : ''; }
function template(msg) {
  return fillPlaceholders(msg, { name: catName() });
}
// Put a bubble on screen now, or line it up behind the one already showing so each
// alert gets its full time to be read instead of being clobbered by the next.
// `b` is { text, ttl, sound, stretch }.
function presentBubble(b, now) {
  bubbleText = b.text;
  bubbleUntil = now + (b.ttl || 5000);
  if (b.stretch !== false) stretchT0 = now;
  if (config && config.soundOn && b.sound) playMeow();
}
function queueBubble(b) {
  const now = performance.now();
  if (now < bubbleUntil) {
    if (bubbleQueue.length < BUBBLE_QUEUE_MAX) bubbleQueue.push(b);   // otherwise drop it; it is already logged in the tray recap
  } else {
    presentBubble(b, now);
  }
  resumeRaf();
}
// Hand the next queued alert the screen once the current one has had its time.
function drainBubbleQueue(t) {
  if (bubbleQueue.length && t >= bubbleUntil + BUBBLE_GAP) presentBubble(bubbleQueue.shift(), t);
}

// A generic notification from main: speech bubble + optional meow.
// (Any Windows toast is raised in main; here we just draw + chirp.)
function triggerNotify(d) {
  if (!d) return;
  queueBubble({ text: template(d.message) || 'Meow!', ttl: d.ttl || 5000, sound: d.sound !== false });
}
function triggerBreak(d) {
  const n = catName();
  queueBubble({
    text: n ? `Break time, ${n}! Stretch with me~` : 'Break time! Stretch with me~',
    // main decides: silent through quiet hours and while you are busy, but the
    // bubble still shows, so a break you took anyway is not a break you missed.
    ttl: 6000, sound: !(d && d.sound === false),
  });
}
