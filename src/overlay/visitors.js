// Overlay renderer, part: the butterfly and self-play.
// The overlay is a set of classic scripts loaded in order by index.html. They
// share one global scope, so a name declared in an earlier part is visible here.

// ---- main loop --------------------------------------------------------------
// ---- butterfly visitor (periodic): flits in, pesters the cat, leaves ---------
var BFLY_STYLES = [
  { name: 'iridescent', halo: '#dfe9ff', main: '#5a3fa0', core: '#56cfe1', glint: '#bdecff', body: '#241f30', shimmer: true },
  { name: 'monarch',    halo: '#ffe6cc',  main: '#e8943c', core: '#b5641d', veins: '#3a2412', dots: '#fff6e8', body: '#1c140c' },
  { name: 'pastel',     halo: '#ffe9f6', main: '#d98fc9', core: '#efb3df', core2: '#cdbcf2', glint: '#ffffff', body: '#2a2433' },
];
function drawButterfly(g, bx, by, sc, st, flap, t, rot) {
  const open = 0.30 + 0.70 * Math.abs(Math.cos(flap));
  let core = st.core;
  if (st.shimmer) core = lerpHex(st.core, '#9a6cff', 0.5 + 0.5 * Math.sin(t / 430));
  g.save(); g.translate(Math.round(bx), Math.round(by)); g.scale(sc, sc); if (rot) g.rotate(rot);
  const E = (x, y, rx, ry, col) => { if (rx <= 0.2) return; g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
  // soft glow so it reads on dark backgrounds (every style, including monarch)
  { const glow = st.halo || st.main; g.globalAlpha = 0.14; E(0, -1, 12 * open + 4, 11, glow); g.globalAlpha = 0.10; E(0, 1, 8, 9, glow); g.globalAlpha = 1; }
  for (const side of [-1, 1]) {
    const ux = side * 7 * open, lx = side * 5.5 * open;
    if (st.halo) { g.globalAlpha = 0.85; E(ux, -3, 6.2 * open + 1, 6.6, st.halo); E(lx, 5, 4.6 * open + 1, 4.8, st.halo); g.globalAlpha = 1; }
    E(ux, -3, 6.0 * open, 6.2, st.main); E(ux, -3.6, 4.0 * open, 4.4, core);
    E(lx, 5, 4.4 * open, 4.6, st.main); E(lx, 5, 2.8 * open, 3.0, st.core2 || core);
    if (st.veins) { g.strokeStyle = st.veins; g.lineWidth = 0.7; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(0, -2); g.lineTo(side * (8 * open + k), -7 + k); g.stroke(); } }
    if (st.dots) { E(side * 9 * open, -6, 0.8, 0.8, st.dots); E(side * 6 * open, 2, 0.8, 0.8, st.dots); }
    if (st.glint) { g.fillStyle = st.glint; g.fillRect(Math.round(side * 8 * open - 0.5), -6, 1, 1); }
  }
  E(0, 0, 1.4, 8, st.body); E(0, -7, 1.6, 1.9, st.body);
  g.strokeStyle = st.body; g.lineWidth = 0.8; g.lineCap = 'round';
  g.beginPath(); g.moveTo(0, -8); g.lineTo(-2.6, -12.5); g.moveTo(0, -8); g.lineTo(2.6, -12.5); g.stroke();
  g.fillStyle = st.glint || core; g.fillRect(-3, -13, 1, 1); g.fillRect(2, -13, 1, 1);
  g.restore();
}
function startBflyVisit(t) {
  if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) pos = { x: viewW / 2, y: viewH - 80 };
  bfOn = true; bfMode = 'in'; bfUntil = t + 22000 + Math.random() * 8000; bfVisitT0 = t;
  bfPal = (bfPal + 1) % BFLY_STYLES.length; bfNextPal = t + 8000 + Math.random() * 4000;
  // enter from whichever side has more room (toward screen interior) so it never spawns
  // pinned into a corner.
  const side = pos.x < viewW / 2 ? 1 : -1;
  bfX = clamp(pos.x + side * 220, BF_EDGE, viewW - BF_EDGE); bfY = clamp(pos.y - SH - 40, BF_TOP, viewH - BF_EDGE);
  bfVx = -side * 4; bfVy = 0; bfWpX = pos.x; bfWpY = pos.y - SH * 0.8; bfNextDive = t + 3000; bfDiveUntil = 0; bfDodgeUntil = 0; bfTrail = [];
  // seed the glider CENTER on the cat so it flies in from the side and settles into the zone
  bfDriftCx = pos.x; bfDriftCy = clamp(pos.y - SH - 30, BF_TOP, viewH - BF_EDGE);
  bfDriftTX = bfDriftCx; bfDriftTY = bfDriftCy; bfPhase = Math.random() * Math.PI * 2; bfNextDrift = t + 500;
}
// --- Self-play: what the pet does with itself once you step away. A cat gets a
//     butterfly to stalk. A dog would rather have something thrown, and it already
//     knows how to fetch, so it noses its own ball out and carries it back. Both
//     species run off the same idle gates and the same tray toggle, so switching
//     play off switches all of it off.
function updateSelfPlay(t, dt, step, f) {
  if (!isDog()) { updateButterflyDesk(t, dt, step, f); return; }
  // Swapped to a dog mid-visit: the butterfly is still DRAWN for as long as bfOn is
  // set, so it has to be flown off properly rather than abandoned frozen in mid-air.
  if (bfOn) { bfMode = 'out'; updateButterflyDesk(t, dt, step, f); return; }
  updateDogFetchUrge(t, f);
}
// A dog with nothing to chase talks itself into a game of fetch, on the same
// schedule that earns a cat a butterfly visit. There is no separate "leaving"
// phase: updateBall() forgets an untouched ball after 45s, which re-arms this.
function updateDogFetchUrge(t, f) {
  if (SHOT || ball || !pos) return;                          // already something in play
  const allow = f.follow && !lowPower && !(config && config.reducedMotion)
    && !(config && config.butterflyOn === false) && !workModeOn() && !f.grabbing && !f.typing;
  if (!allow || !f.calm) return;
  if ((t - lastCursorMove) < BF_MOUSE_QUIET_MS) return;       // never while the mouse is in use
  const idleMs = t - Math.max(lastCursorMove, lastKeyAt);
  if (!(t > bfNextVisit || (idleMs > IDLE_BUTTERFLY_MS && t > bfIdleNextVisit))) return;
  throwBall();
  // Re-arm on the cadence a departing butterfly uses, so the dog does not start a
  // fresh game the instant the last ball is forgotten.
  bfNextVisit = t + 50000 + Math.random() * 50000;
  bfIdleNextVisit = t + 14000 + Math.random() * 10000;
}
// Flight + cat reaction. f = { follow, grabbing, hunting, typing, petting, startleActive, calm }.
function updateButterflyDesk(t, dt, step, f) {
  const force = SHOT && qp.get('bfly') === '1';
  const allow = f.follow && !lowPower && !(config && config.reducedMotion) && !(config && config.butterflyOn === false) && !workModeOn() && !f.grabbing && !f.typing;
  if (!bfOn) {
    // "do nothing -> the cat plays": once the cursor + keyboard have been idle a while,
    // summon a butterfly early (and keep them coming while you're away), instead of only
    // on the slow ~50-100s periodic timer.
    const idleMs = t - Math.max(lastCursorMove, lastKeyAt);
    const idleWants = idleMs > IDLE_BUTTERFLY_MS && t > bfIdleNextVisit;
    const mouseQuiet = (t - lastCursorMove) > BF_MOUSE_QUIET_MS;   // no butterfly while the mouse is in use
    if (force) startBflyVisit(t);
    else if (allow && f.calm && mouseQuiet && (t > bfNextVisit || idleWants)) startBflyVisit(t);
    if (!bfOn) return;
  }
  // honor reduced-motion if it gets toggled on mid-visit: let the butterfly leave gracefully.
  // workModeOn(), not config.workMode: `allow` above already uses it, so a Focus Guard
  // busy signal blocked NEW visits but left a butterfly that was already here flying
  // through the meeting. A visit you asked for with the button is exempt from that
  // one: work mode used to send it straight home, which made the button a dead click.
  if (config && (config.reducedMotion || config.butterflyOn === false || (workModeOn() && !bfSummoned)) && bfMode !== 'out') bfMode = 'out';   // toggled off mid-visit -> leave gracefully
  // idle-only: the instant the user uses the mouse again, the butterfly leaves
  // Idle-only, but with a grace window. Leaving on the FIRST cursor movement meant a
  // single twitch, a bumped desk, or reaching for the mouse to watch the thing ended
  // a 22-30 second visit instantly - and the next one is at least 14s away. The
  // butterfly now only gives up once the mouse has been in CONTINUOUS use for
  // BF_GRACE_MS; go still again before that and the visit carries on.
  const mouseBusy = (t - lastCursorMove) < BF_MOUSE_ACTIVE_MS;
  if (!mouseBusy) bfNudgeSince = 0;
  else if (!bfNudgeSince) bfNudgeSince = t;
  if (mouseBusy && t - bfNudgeSince > BF_GRACE_MS && bfMode !== 'out') bfMode = 'out';
  wantHighFps = true;
  const dtf = Math.min(dt, 50) / 16.67;
  if (t > bfNextPal) { bfPal = (bfPal + 1) % BFLY_STYLES.length; bfNextPal = t + 8000 + Math.random() * 4000; }
  const headX = pos.x, headY = pos.y - SH * 0.72;
  // the cat only plays with the butterfly while the cursor sits still; any cursor move
  // refreshes lastCursorMove (the cursor is always the priority).
  const cursorIdle = (t - lastCursorMove) > BF_PLAY_IDLE;
  if (t > bfUntil && bfMode !== 'out') bfMode = 'out';
  if (bfMode === 'dodge' && t > bfDodgeUntil) bfMode = 'wander';
  if (bfMode === 'held' && t > bfHeldUntil) {   // slips out of the paws and climbs away; the cat bounces after it
    bfMode = 'out'; bfVy = -11; bfVx = (bfX < pos.x ? -1 : 1) * 4; bfFlap += 3;
    bfJoyT0 = t; bfJoyUntil = t + BF_JOY_MS;
  }
  if (bfMode !== 'out') {
    if (bfMode === 'in' && (Math.hypot(bfX - headX, bfY - headY) < 160 || t > bfNextDive)) { bfMode = 'wander'; bfNoticeT0 = t; }   // spotted it
    if (bfMode === 'wander' && t > bfNextDive) {
      bfMode = 'dive'; bfDiveUntil = t + 1800; bfNextDive = t + 3500 + Math.random() * 3500;
      // The pounce borrows the hunt target and carries the pet across the screen, so
      // it obeys roamOn: that switch is "the pet wanders off on its own", and
      // launching itself at a bug is exactly that. It was ungated, so a pet set to
      // stay put still bolted after every butterfly dive - and huntOn does not cover
      // it, because huntOn is about the CURSOR.
      const mayLeaveSpot = !(config && config.roamOn === false);
      if (mayLeaveSpot && cursorIdle && Math.random() < 0.55 && t - bfVisitT0 > BF_POUNCE_AFTER_MS && bugPounceable() && !f.hunting && !SHOT) { huntUntil = t + 1400; huntTarget = { x: bfX, y: bfY }; }
    }
    // hold the dive while a hunt is in progress so the bug stays reachable for the pounce
    if (bfMode === 'dive' && t > bfDiveUntil && t >= huntUntil) bfMode = 'wander';
  }
  let tx, ty, burst = false;
  if (bfMode === 'out') { tx = bfX < headX ? -40 : viewW + 40; ty = bfY; }
  else if (bfMode === 'dive') { tx = headX + Math.sin(t / 200) * 26; ty = headY - 6 + Math.cos(t / 170) * 12; }
  else if (bfMode === 'dodge') { tx = bfWpX; ty = bfWpY; }
  else if (bfMode === 'held') { tx = bfX; ty = bfY; }   // pinned below; skips the glider (and its drift repick)
  else {
    // air-current glider CONFINED to a zone around the cat's head (the zone follows the cat),
    // so the butterfly plays near the cat instead of roaming the screen. Flap-bursts still
    // climb within the band (mirrors site/cat-live.js's figure-eight, just penned in).
    bfPhase += DRIFT_PHASE_RATE * dtf;
    const ax = BF_LISSA_AX, ay = BF_LISSA_AY;
    // ...and inside the reach of a cat that may not leave its play area: a bug hovering just
    // past that edge could only ever be swatted at (see bugPounceable), never caught. A cat
    // resting in a corner would otherwise spend half of every visit watching one it cannot have.
    const reachL = zoneClampX(0) - 20, reachR = zoneClampX(viewW) + 20;
    const zL = Math.max(BF_EDGE, headX - BF_ZONE_X, reachL), zR = Math.min(viewW - BF_EDGE, headX + BF_ZONE_X, reachR);
    const zT = Math.max(BF_TOP, headY - BF_ZONE_TOP), zB = Math.min(viewH - BF_EDGE, headY + BF_ZONE_BOT);
    if (t > bfNextDrift) {
      // pick the figure-eight CENTER inside the zone, inset by the swing so the whole
      // oscillation stays inside it (min/max guard a degenerate zone near a screen edge)
      const cxLo = Math.min(zL + ax, zR - ax), cxHi = Math.max(zL + ax, zR - ax);
      const cyLo = Math.min(zT + ay, zB - ay), cyHi = Math.max(zT + ay, zB - ay);
      bfDriftTX = cxLo + Math.random() * (cxHi - cxLo);
      bfDriftTY = cyLo + Math.random() * (cyHi - cyLo);
      bfNextDrift = t + DRIFT_REPICK_MS[0] + Math.random() * DRIFT_REPICK_MS[1];
    }
    bfDriftCx += (bfDriftTX - bfDriftCx) * DRIFT_EASE * dtf;
    bfDriftCy += (bfDriftTY - bfDriftCy) * DRIFT_EASE * dtf;
    bfWpX = clamp(bfDriftCx + ax * Math.sin(bfPhase), zL, zR);
    let gy = bfDriftCy + ay * Math.sin(bfPhase * LISSA_RATIO + LISSA_DELTA);
    burst = Math.sin(bfPhase * BURST_RATIO) > BURST_GATE;
    if (burst) gy -= BURST_LIFT;                                      // flap-burst to gain height, then glide down
    bfWpY = clamp(gy, zT, zB);
    tx = bfWpX; ty = bfWpY;
  }
  // 'out' used to accelerate HARDER and fly FASTER than wandering, so the butterfly
  // vanished off the edge rather than drifting away. It now leaves slower than it
  // wandered, which reads as departing instead of being scared off.
  let accel = bfMode === 'dodge' ? 0.02 : (bfMode === 'dive' ? 0.045 : (bfMode === 'out' ? 0.028 : WANDER_ACCEL));
  // ease-out: ease off the throttle as it nears the target so arrivals glide, not snap
  if (bfMode !== 'dodge' && bfMode !== 'out') accel *= clamp(Math.hypot(tx - bfX, ty - bfY) / 100, 0.4, 1);
  bfVx += (tx - bfX) * accel * dtf; bfVy += (ty - bfY) * accel * dtf;
  bfVx += Math.sin(t / 130 + 1.3) * 0.5 * dtf; bfVy += Math.sin(t / 90) * 0.6 * dtf;
  { const dx = bfX - cursor.x, dy = bfY - cursor.y, d = Math.hypot(dx, dy); if (d < 90 && d > 0.1) { const ff = (90 - d) / 90 * 3.6; bfVx += dx / d * ff * dtf; bfVy += dy / d * ff * dtf; } }
  bfVx *= 0.92; bfVy *= 0.92;
  const sp = Math.hypot(bfVx, bfVy), maxv = bfMode === 'dodge' ? 10 : (bfMode === 'out' ? 4.2 : 5.5);
  if (sp > maxv) { bfVx *= maxv / sp; bfVy *= maxv / sp; }
  bfX += bfVx * dtf; bfY += bfVy * dtf;
  if (bfMode === 'held') { bfVx = 0; bfVy = 0; bfX = pos.x + Math.sin(t / 70) * 1.5; bfY = pos.y - SH * 0.30 + Math.sin(t / 55); }   // cupped in the front paws
  bfFlap += (bfMode === 'held' ? 0.05 : 0.18 + sp * 0.03) * dtf * (burst ? FLAP_BURST_MULT : 1);   // wings beat harder during a climb-burst
  // despawn once it has flown off-screen - or, as a failsafe, if it has been leaving too long
  // (can't reach the edge for any reason), so it can never get trapped on-screen forever.
  if (bfMode === 'out' && (bfX < -30 || bfX > viewW + 30 || t > bfUntil + 6000)) { bfOn = false; bfSummoned = false; huntTarget = null; bfNextVisit = t + 50000 + Math.random() * 50000; bfIdleNextVisit = t + 14000 + Math.random() * 10000; return; }
  // keep the sprite on-screen - but NOT while leaving, or the clamp pins it at the edge and it
  // can never reach the off-screen despawn threshold above (it would flutter there forever).
  if (bfMode !== 'out') {
    const m = 10;
    if (bfX < m) { bfX = m; bfVx = Math.abs(bfVx); } if (bfX > viewW - m) { bfX = viewW - m; bfVx = -Math.abs(bfVx); }
    if (bfY < m) { bfY = m; bfVy = Math.abs(bfVy); } if (bfY > viewH - m) { bfY = viewH - m; bfVy = -Math.abs(bfVy); }
  }
  // anti-stick safety net: if the butterfly lingers against ANY edge it has gotten trapped
  // (regardless of mode/cat position). Boot it back toward the cat's head.
  const atEdge = bfX <= BF_EDGE || bfX >= viewW - BF_EDGE || bfY <= BF_TOP || bfY >= viewH - BF_EDGE;
  if (atEdge) { if (!bfEdgeSince) bfEdgeSince = t; } else bfEdgeSince = 0;
  if (bfEdgeSince && t - bfEdgeSince > 600 && bfMode !== 'out') {
    bfMode = 'wander'; bfDriftTX = headX; bfDriftTY = headY - 40; bfNextDrift = t + 1500; bfEdgeSince = 0;   // re-aim the glide center inward
    bfVx += (headX - bfX) * 0.04; bfVy += (headY - bfY) * 0.04;   // re-aim inward, toward the cat
  }
  // short fading sparkle trail (kept tiny; skipped in low power)
  if (!lowPower && t > bfNextTrail) { bfTrail.push({ x: bfX, y: bfY, t0: t }); bfNextTrail = t + 90; }
  if (bfTrail.length) bfTrail = bfTrail.filter((s) => t - s.t0 < 480);
  // while a hunt is winding up (not yet airborne), keep the aim on the live butterfly so
  // the pounce lands on where it actually is, not a stale snapshot
  if (cursorIdle && t < huntUntil && !pouncing) huntTarget = { x: bfX, y: bfY };
  if (cursorIdle && !f.grabbing && !f.startleActive) {
    lookTarget = { x: clamp((bfX - headX) / 200, -1, 1), y: clamp((bfY - headY) / 150, -1, 1) }; lookTargetUntil = t + 250;
    // subtle head/body lean tracking the butterfly so the cat reads as watching it play
    if (!f.hunting && t > bfSwatCool) { leanTarget = clamp((bfX - pos.x) / 280, -0.06, 0.06); leanUntil = t + 220; }
  }
  const dh = Math.hypot(bfX - headX, bfY - headY);
  // the chase pays off: once the cat has crept within range of a calmly wandering bug, pounce at it
  if (cursorIdle && bfMode === 'wander' && dh < BUG_POUNCE_TRIGGER && t - bfVisitT0 > BF_POUNCE_AFTER_MS && bugPounceable() && !f.hunting && t >= huntUntil && t > bfSwatCool && !SHOT) {
    huntUntil = t + 1400; huntTarget = { x: bfX, y: bfY }; bfSwatCool = t + 900;
  }
  // gentle paw-swat: the bug is near the head but just out of pounce range (or the pounce is
  // cooling down) -> raise a front paw and swipe at it. Shares bfSwatCool with the lean + pounce
  // so the three never stack; ordered AFTER the pounce so a real pounce always wins.
  if (cursorIdle && !f.hunting && t >= huntUntil && bfMode !== 'out' && dh > 62 && dh < BF_SWAT_RANGE && t > bfSwatCool && roamUntil < t) {
    // A 600ms swat re-arming 100ms later meant a whoosh roughly every 350ms for the
    // whole 22-30s visit - the single loudest source of "it never stops". Rest the
    // paw properly between swats, and jitter it so it reads as a cat losing interest
    // rather than a machine keeping time.
    bfSwatT0 = t; bfSwatUntil = t + BF_SWAT_MS; bfSwatCool = t + 2600 + Math.random() * 1400; tailFlickT0 = t;
  }
  // Not while it is leaving and not while it is held: a bug climbing out of the paws
  // passes right under the head, and this used to startle it straight back into a
  // dodge, so the catch that "ended the visit" never actually did.
  if (dh < 60 && t > bfDodgeUntil + 200 && !f.hunting && t >= huntUntil && bfMode !== 'out' && bfMode !== 'held') {
    if (cursorIdle && t > bfSwatCool) { bfSwatCool = t + 900; tailFlickT0 = t; leanTarget = clamp((bfX - pos.x) / 120, -0.12, 0.12); leanUntil = t + 260; }
    bfMode = 'dodge'; bfDodgeUntil = t + 460;
    const aw = Math.atan2(bfY - headY, bfX - headX) + (Math.random() - 0.5);
    bfVx = Math.cos(aw) * 10; bfVy = Math.sin(aw) * 10;
    bfWpX = clamp(bfX + Math.cos(aw) * 90, 20, viewW - 20); bfWpY = clamp(bfY + Math.sin(aw) * 60, BF_TOP, viewH - 40);
  }
}
