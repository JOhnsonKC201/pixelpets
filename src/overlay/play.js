// Overlay renderer, part: fetch, treats and sound hooks.
// The overlay is a set of classic scripts loaded in order by index.html. They
// share one global scope, so a name declared in an earlier part is visible here.

// --- Fetch (dogs only): the tray throws a tennis ball. The ball arcs out under
//     gravity, bounces, and settles; the dog bolts after it, picks it up, carries
//     it back to its home corner, drops it, then wags and pants. This is the whole
//     reason a dog is worth having as a desktop pet rather than a recoloured cat.
const FETCH_GRAB = 22;        // how close the dog must get to pick the ball up
const BALL_R = 5;
// Preview render: npx electron . --shot --species=dog --ball=1
// The counterpart to --treat=1 for the cat. Fetch has by far the most complex
// state machine in the give slot and had no way to eyeball a frame of it without
// waiting on the physics loop. Parked at 'rest' on the floor line, which is the
// pose worth checking; throwBall() itself is a no-op under SHOT.
// Placed here rather than beside the --treat hook because BALL_R is declared
// above this line and would be in the temporal dead zone up there.
if (SHOT && qp.get('ball') === '1') ball = { x: 210, y: restingY() - BALL_R, vx: 0, vy: 0, phase: 'rest', spin: 0, restAt: 0 };
function throwBall() {
  if (SHOT || !pos || !isDog()) return;
  const side = pos.x < viewW / 2 ? 1 : -1;
  ball = {
    x: pos.x, y: pos.y - SH * 0.55,
    vx: side * (5.2 + Math.random() * 2.2), vy: -6.4 - Math.random() * 1.6,
    phase: 'fly', spin: 0, restAt: 0,
  };
  addEnergy(16);                                  // a thrown ball is the best thing that has ever happened
  wagBoost = 0.9;
  if (config && config.soundOn) playChirp();
  resumeRaf();
}
function ballApproachX() { return zoneClampX(ball.x); }
function updateBall(t, dt, f) {
  if (!ball) return;
  const floor = restingY();
  ball.spin += (ball.phase === 'fly' ? 0.4 : 0.08) * (dt / 16);

  if (ball.phase === 'fly') {                     // ballistic arc + a couple of bounces
    const k = dt / 16;
    ball.vy += 0.62 * k;
    ball.x += ball.vx * k; ball.y += ball.vy * k;
    if (ball.y >= floor - BALL_R) {
      ball.y = floor - BALL_R;
      if (Math.abs(ball.vy) > 1.6) { ball.vy = -ball.vy * 0.46; ball.vx *= 0.72; }
      else { ball.vy = 0; ball.vx = 0; ball.phase = 'rest'; ball.restAt = t; }
    }
    // Bounce off the PLAY AREA edge, not the raw screen edge: the dog's approach
    // point is zone-clamped, so a ball that flew past the zone left the dog
    // stopped at the boundary unable to reach it. If the clamp moved the ball,
    // it hit a wall. zoneClampX is the screen clamp when no play area is set.
    const bx = zoneClampX(ball.x);
    if (bx !== ball.x) { ball.vx = -ball.vx * 0.5; ball.x = bx; }
    return;
  }
  if (ball.phase === 'carry') {                   // held in the mouth, tracks the muzzle
    ball.x = pos.x + (ball.side || 1) * 6;
    ball.y = pos.y - SH * 0.52;
    const home = homeX();
    if (roamUntil <= t) {
      if (Math.abs(pos.x - home) > 14) {
        roamFrom = { x: pos.x, y: pos.y };
        roamTo = { x: home, y: floorLockOn() ? restingY() : pos.y };
        roamDur = clamp(Math.abs(pos.x - home) * 2.4, 400, 1700); roamUntil = t + roamDur; nextRoam = t + 20000;
      } else {                                    // delivered: drop it, wag, pant, ask for another
        ball.phase = 'rest'; ball.delivered = true; ball.restAt = t; ball.y = floor - BALL_R;
        wagBoost = 1.2; pantUntil = t + 4200; addEnergy(10);
        popLove(t, pos.x, pos.y - SH * 0.8, 2, 16);
        if (config && config.soundOn) playChirp();
      }
    }
    return;
  }
  // 'rest': lying on the floor. The dog goes and gets it.
  if (f.grabbing || f.hunting || f.startleActive || f.typing || paperLen > 1) return;
  if (t - ball.restAt > 45000) { ball = null; return; }        // forgotten after a while
  // A ball the dog has already carried home stays where it was dropped, waiting for
  // you to throw it again. Without this the dog drops it at its own feet, is back
  // inside FETCH_GRAB on the very next frame, picks it up, walks nowhere, "delivers"
  // again... looping pickup/deliver every frame and spraying hearts, chirps and a
  // permanently refreshed pant. The first throw looks perfect, which is why it shipped.
  if (ball.delivered) return;
  const dist = Math.abs(pos.x - ballApproachX());
  if (dist <= FETCH_GRAB) {
    ball.phase = 'carry'; ball.side = Math.sign(ball.x - pos.x) || 1;
    wagBoost = 1.0; roamUntil = 0;
    lookTarget = { x: ball.x, y: ball.y }; lookTargetUntil = t + 600;
    return;
  }
  if (roamUntil <= t) {                                        // sprint after it
    roamFrom = { x: pos.x, y: pos.y };
    roamTo = { x: ballApproachX(), y: floorLockOn() ? restingY() : pos.y };
    roamDur = clamp(dist * 1.9, 350, 1500); roamUntil = t + roamDur; nextRoam = t + 20000;
    lookTarget = { x: ball.x, y: ball.y }; lookTargetUntil = t + roamDur;
  }
}
function drawBall(t) {
  if (!ball) return;
  const x = Math.round(ball.x), y = Math.round(ball.y);
  if (ball.phase !== 'carry') drawShadow(x, restingY(), 0.18, 7);
  ctx.fillStyle = '#3f4a1e';                                   // dark rim keeps it readable on any wallpaper
  ctx.beginPath(); ctx.arc(x, y, BALL_R + 1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d8e84a';                                   // tennis yellow-green
  ctx.beginPath(); ctx.arc(x, y, BALL_R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#f4f7dd'; ctx.lineWidth = 1.4;            // the seam, rotating with the spin
  ctx.beginPath(); ctx.arc(x - Math.cos(ball.spin) * 3, y, BALL_R - 0.6, -1.1, 1.1); ctx.stroke();
  ctx.beginPath(); ctx.arc(x + Math.cos(ball.spin) * 3, y, BALL_R - 0.6, Math.PI - 1.1, Math.PI + 1.1); ctx.stroke();
}

// --- Treat: tray "Give a treat" drops a little fish nearby; the cat trots over and
//     noms it (look down, hearts, a happy chirp, an energy bump). Uses the roam
//     machinery to walk, re-aiming each time the walk expires until it arrives.
const TREAT_STANDOFF = 26;   // how far beside the treat the cat stands to eat
const TREAT_REACH = 10;      // close enough to the standoff point to start eating
function treatApproachX() { return zoneClampX(treat.x - Math.sign(treat.x - pos.x || 1) * TREAT_STANDOFF); }

// True while the pet is on an errand the user actually asked for (tray/settings
// "give"): walking to a fish, or chasing a ball it has not brought back yet.
// Aimers that would otherwise steer the pet somewhere else check this first.
function giveTrekOn() { return !!treat || !!(ball && !ball.delivered); }
function dropTreat() {
  if (SHOT || typeof pos === 'undefined' || !pos) return;
  const side = pos.x < viewW / 2 ? 1 : -1;                    // drop toward the roomier side
  // zoneClampX, not the raw screen clamp: the cat's approach point is already
  // zone-clamped, so dropping the fish outside a constrained play area left the
  // cat stopped at the zone edge with its treat stranded beyond it. zoneClampX
  // degrades to exactly this screen clamp when no play area is set.
  const tx = zoneClampX(pos.x + side * (130 + Math.random() * 90));
  treat = { x: tx, y: restingY(), phase: 'walk', nomUntil: 0 };
  addEnergy(8);                                               // a treat is exciting
  resumeRaf();
}
function updateTreat(t, f) {
  if (!treat) return;
  if (f.grabbing || f.hunting || f.startleActive || f.typing || paperLen > 1) return;   // interactions pause the trek
  if (treat.phase === 'nom') { if (t > treat.nomUntil) { addEnergy(12); treat = null; } return; }
  const approach = treatApproachX();
  const dist = Math.abs(pos.x - approach);
  // Arrival is checked BEFORE the roam gate, the way the dog's fetch checks
  // FETCH_GRAB. The walk lands the cat exactly on its approach point, but the roam
  // that carried it there has expired by the time it gets there, so any other aimer
  // running earlier in the frame could grab the roam slot first and walk the cat off
  // a fish it was standing on top of, and this function would never get to notice it
  // had arrived. Dropping the in-flight roam on the way into the meal is the other
  // half of that: nothing gets to drag the cat away mid-nom.
  if (dist <= TREAT_REACH) {                                  // arrived -> nom it
    treat.phase = 'nom'; treat.nomUntil = t + 1100;
    roamUntil = 0;
    lookTarget = { x: treat.x, y: treat.y }; lookTargetUntil = t + 1100;
    popLove(t, pos.x, (pos.y - SH) - 4, 1.6, 12);
    if (config && config.soundOn) playChirp();
    return;
  }
  if (roamUntil <= t) {                                       // still walking -> (re)aim at the treat
    roamFrom = { x: pos.x, y: pos.y };
    roamTo = { x: approach, y: floorLockOn() ? restingY() : pos.y };
    roamDur = clamp(dist * 3, 400, 1800); roamUntil = t + roamDur; nextRoam = t + 20000;
  }
}
function drawTreat() {
  if (!treat) return;
  const x = treat.x, y = treat.y - 5;                         // rest on the floor line, beside the feet
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#5a3514'; ctx.lineWidth = 2; ctx.fillStyle = '#e8943c';
  ctx.beginPath(); ctx.ellipse(x, y, 10, 5.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // body
  ctx.beginPath(); ctx.moveTo(x + 8, y); ctx.lineTo(x + 16, y - 6); ctx.lineTo(x + 16, y + 6); ctx.closePath(); ctx.fill(); ctx.stroke();   // tail
  ctx.fillStyle = '#f7f1e6'; ctx.beginPath(); ctx.arc(x - 4, y - 1.5, 1.6, 0, Math.PI * 2); ctx.fill();   // eye white
  ctx.fillStyle = '#3a2f26'; ctx.beginPath(); ctx.arc(x - 4, y - 1.5, 0.8, 0, Math.PI * 2); ctx.fill();   // pupil
  ctx.restore();
}

// ---- procedural sound lives in audio.js (loaded before this script) --------
// audio() / playMeow() / startPurr() / stopPurr() / playChirp() / playMrrp() are
// defined there and shared via the overlay's global script scope.

// Speech bubble above the head - same dark-rounded style as the coat label.
// Wrapping and edge-clamping live in bubble.js (pure, unit-tested); this only
// paints what that hands back. It used to size the panel to at most 260px and
// then fillText the whole string regardless, so any message past ~44 characters
// wrote itself onto the wallpaper either side of the box - and reminders and
// pinned notes are allowed 80 characters, with calendar summaries uncapped.
// One-entry wrap cache. A pinned note is re-drawn every frame for as long as it is
// pinned, and wrapping costs a measureText per word; the result only depends on the
// text and the screen width, neither of which changes between frames. The box
// POSITION still recomputes each frame, so the bubble keeps riding the pet's breathing.
let wrapCache = null;
function wrapFor(text, measure, innerW) {
  if (wrapCache && wrapCache.text === text && wrapCache.innerW === innerW) return wrapCache;
  const lines = wrapBubbleText(text, measure, innerW, undefined);
  let widest = 0;
  for (const l of lines) widest = Math.max(widest, measure(l));
  wrapCache = { text, innerW, lines, widest };
  return wrapCache;
}
function drawBubble(cx, topY, text, alpha) {
  ctx.globalAlpha = alpha;
  ctx.font = 'bold 11px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const measure = (s) => ctx.measureText(s).width;
  const wrapped = wrapFor(text, measure, bubbleInnerW(viewW));
  const box = layoutBubble({ text, cx, topY, measure, viewW, viewH, lines: wrapped.lines, widest: wrapped.widest });
  const { x, y, w, h } = box;
  ctx.fillStyle = 'rgba(20,20,24,0.88)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 6); else ctx.rect(x, y, w, h);
  ctx.fill();
  // The tail stays on the pet even when the panel has been slid off a screen edge,
  // so a corner-resting pet's bubble still reads as coming from it.
  ctx.beginPath(); ctx.moveTo(box.tailX - 4, y + h); ctx.lineTo(box.tailX + 4, y + h); ctx.lineTo(box.tailX, y + h + 5); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fff';
  const midX = x + w / 2;
  for (let i = 0; i < box.lines.length; i++) ctx.fillText(box.lines[i], midX, y + box.padY + box.lineH * (i + 0.5) + 1);
  ctx.globalAlpha = 1;
}

// Pomodoro pixel timer - a tiny dark panel with a phase dot (tomato = focus,
// green = break) and an mm:ss countdown, floating beside the cat.
function drawPomoTimer(x, y, t) {
  const remain = Math.max(0, (pomo.endsAt || 0) - Date.now());
  const mm = String(Math.floor(remain / 60000)).padStart(2, '0');
  const ss = String(Math.floor((remain % 60000) / 1000)).padStart(2, '0');
  const focus = pomo.phase !== 'break';
  const w = 56, h = 20;
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = 'rgba(20,20,24,0.88)';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, 5); else ctx.rect(x, y, w, h);
  ctx.fill();
  ctx.strokeStyle = focus ? 'rgba(232,90,70,0.9)' : 'rgba(139,191,90,0.9)';
  ctx.lineWidth = 1; ctx.stroke();
  // phase dot pulses gently so the timer reads as alive
  const pulse = 0.7 + Math.sin(t / 500) * 0.3;
  ctx.globalAlpha = pulse; ctx.fillStyle = focus ? '#e85a46' : '#8bbf5a';
  ctx.fillRect(x + 5, y + h / 2 - 3, 6, 6);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#f2f4f8'; ctx.font = 'bold 12px "Courier New", monospace';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(`${mm}:${ss}`, x + 15, y + h / 2 + 1);
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
}

// Should the sprite be mirrored right now? Only while walking left.
const faceLeftAt = (t) => roamUntil > t && !!roamFrom && !!roamTo && roamTo.x < roamFrom.x;
