// Overlay renderer, part: the per-frame update and draw.
// The overlay is a set of classic scripts loaded in order by index.html. They
// share one global scope, so a name declared in an earlier part is visible here.

function draw(t) {
  // self-schedule; fully pause when the page is hidden (resumes on visibility)
  if (!document.hidden) requestAnimationFrame(draw); else { rafPaused = true; return; }
  // idle throttle: when nothing interactive is happening, render at a low fps to
  // spare the GPU (it composites the whole transparent overlay every drawn frame).
  // ~20fps normally, ~12fps in low power; active animation stays 60fps via wantHighFps.
  if (!wantHighFps && t - lastDrawn < (lowPower ? 80 : 48)) return;
  lastDrawn = t;

  const dt = Math.min(64, t - prevT); prevT = t;
  const step = Math.min(2.5, dt / 16);
  // Hand the next queued alert the screen as soon as the current one has had its
  // time. Up here at the top of the loop (rather than beside the bubble draw) so it
  // keeps running through a hunt or a startle, which live in their own pose branch.
  drainBubbleQueue(t);
  // eased settle onto the floor line (armed by repinFloor on resize / DPI / display change)
  if (settleT0 >= 0) {
    const se = clamp((t - settleT0) / SETTLE_MS, 0, 1);
    const k = 1 - Math.pow(1 - se, 3);                 // easeOutCubic
    pos.y = settleFromY + (settleToY - settleFromY) * k;
    settleSquash = (1 - k) * 0.03;                     // a whisper of squash that resolves on landing
    if (se >= 1) {
      // Landed. Scale the thud by how far it actually fell, and stay silent for the
      // tiny settles that happen when the floor line shifts under a pet that is
      // already sitting on it - those are not a landing, and a sound there would
      // fire at random while nobody is touching anything.
      const fall = Math.abs(settleToY - settleFromY);
      if (fall > 14 && config && config.soundOn) playPlop(clamp(fall / 220, 0, 1));
      pos.y = settleToY; settleT0 = -1; settleSquash = 0; restSprings(); persistPos();
    }
    wantHighFps = true;
  }
  ctx.clearRect(0, 0, viewW, viewH);
  wantHighFps = true; // default high; the fully-idle calm path lowers it below

  // cursor velocity (px/ms, smoothed) + raw single-tick displacement (for startle)
  const moved = Math.hypot(cursor.x - prevCursor.x, cursor.y - prevCursor.y);
  const inst = moved / Math.max(1, dt);
  const cursorDx = cursor.x - prevCursor.x;
  velEMA = velEMA * 0.5 + inst * 0.5; prevCursor.x = cursor.x; prevCursor.y = cursor.y;   // mutate in place (no per-frame allocation)
  // any real cursor movement refreshes the idle timer and drops a stare instantly
  if (moved > 0.5) {
    const away = t - lastCursorMove;
    lastCursorMove = t;
    if (staringT0 >= 0) { staringT0 = -1; lookTarget = null; }
    // welcome back: you were away a good while -> the cat perks up and greets you
    // (happy eyes + hearts via petBurst, plus a friendly chirp). Same recipe as a tap.
    if (away > GREET_IDLE_MS && !SHOT && !grabbing && t >= petBurstUntil && !(startleT0 >= 0 && t < startleUntil)) {
      petBurstUntil = t + 1400; addEnergy(18);
      if (config && config.soundOn) playChirp();
    }
  }

  // shake-wobble: while held, fast side-to-side shaking (direction flips) makes
  // the stretched body wobble like jello. Flips expire quickly so a slow waggle
  // doesn't count; reduced motion skips the whole reaction.
  if (grabbing && !((config && config.reducedMotion) || lowPower)) {
    const dir = cursorDx > 6 ? 1 : cursorDx < -6 ? -1 : 0;
    if (dir && shakeDir && dir !== shakeDir) {
      shakeFlips = (t - lastFlipAt < 220) ? shakeFlips + 1 : 1;
      lastFlipAt = t;
      if (shakeFlips >= 4) {
        if (t > wobbleUntil && config && config.soundOn) playMrrp();   // one startled mrrp per wobble
        wobbleUntil = t + 850; shakeFlips = 0;
      }
    }
    if (dir) shakeDir = dir;
  } else { shakeFlips = 0; shakeDir = 0; }

  // mood/energy: decay toward calm, derive the active band + an intensity scalar
  // that scales existing behaviours (calm = mellow, zoomies = frantic). When mood
  // is off, behave exactly like before (band 'playful', intensity 1).
  const moodOn = !(config && config.moodOn === false);
  const startleOn = !(config && config.startleOn === false);   // flinch when the cursor lunges at it
  if (moodOn) energy = clamp(energy - dt * ENERGY_DECAY * (isNight(t) ? NIGHT_DECAY_MULT : 1), 0, 100);
  const band = moodOn ? bandOf(energy) : 'playful';
  const intensity = !moodOn ? 1 : band === 'calm' ? 0.6 : band === 'zoomies' ? 1.5 : 1;
  if (moodOn) {
    if (band === 'zoomies') { if (zoomiesT0 < 0) zoomiesT0 = t; if (t - zoomiesT0 > ZOOMIES_MS) { energy = 8; zoomiesT0 = -1; } }
    else zoomiesT0 = -1;
    if (band !== prevBand) { tailFlickT0 = t; prevBand = band; }   // ear/tail beat on a mood shift
  }

  if (keyPulse) { lastKeyAt = t; heat = Math.min(1, heat + 0.12); keyPulse = false; addEnergy(6); }
  heat = Math.max(0, heat - dt * 0.0009);

  // STARTLE: an abrupt cursor jump / velocity spike (the "sudden big change") makes
  // the cat flinch, freeze, then bolt or creep back. Cooldown stops re-fires.
  const startleNear = Math.hypot(cursor.x - pos.x, cursor.y - (pos.y - SH * 0.5)) < STARTLE_RANGE;
  if (moodOn && startleOn && !SHOT && !grabbing && !workModeOn() && t >= huntUntil && !pouncing && t > startleCooldownUntil && startleNear && (inst > STARTLE_VEL || moved > STARTLE_JUMP)) {
    startleT0 = t; startleUntil = t + STARTLE_MS; startleCooldownUntil = t + 1500;
    startleMode = Math.random() < 0.5 ? 'bolt' : 'creep';
    startleFrom = { x: pos.x, y: pos.y };
    const left = pos.x < viewW / 2;
    startleTo = { x: left ? zoneClampX(60) : zoneClampX(viewW - 60), y: zoneClampY(pos.y) };
    huntUntil = 0; pouncing = false; addEnergy(35);
    // The pose may re-fire every 1.5s while you sweep the mouse around; the GROWL
    // should not. Flinching repeatedly is character, growling repeatedly is noise.
    if (config && config.soundOn && t > startleSoundUntil) { startleSoundUntil = t + 6000; playMrrp(); }
  }
  // finalize a finished startle: commit position, reset springs
  if (startleT0 >= 0 && t >= startleUntil) {
    pos.x = zoneClampX(pos.x); pos.y = zoneClampY(pos.y);
    persistPos(); restSprings(); startleT0 = -1;
  }
  if (errorPending) {   // an agent error makes the cat flinch in place (no bolt)
    startleT0 = t; startleUntil = t + STARTLE_MS; startleCooldownUntil = t + 1500;
    startleMode = 'creep'; startleFrom = { x: pos.x, y: pos.y }; startleTo = { x: pos.x, y: pos.y };
    errorPending = false;
    if (config && config.soundOn) playMrrp();
  }
  const startleActive = FORCED_STATE === 'startle' || (startleT0 >= 0 && t < startleUntil);

  // Scroll energy: the wheel builds it, it bleeds off once the wheel stops.
  const pulses = scrollPulses;   // how many wheel ticks since last frame (= instantaneous scroll speed)
  if (scrollPulses > 0) {
    paperUntil = t + 700; paperLen = Math.min(70, paperLen + scrollPulses * 7); addEnergy(scrollPulses * 4); scrollPulses = 0;
  }
  if (FORCED_STATE === 'paper') { paperLen = 50; scrollDirRaw = qp.get('dir') === 'down' ? 1 : -1; }   // --dir=up|down for shots
  else if (t > paperUntil) paperLen = Math.max(0, paperLen - dt * 0.06);
  const paperActive = FORCED_STATE === 'paper' || paperLen > 1;
  // Which scroll reaction this coat gets. Coats WITH painted climb art climb the
  // rope; every other coat and every dog swipes at a leaf instead, because the
  // procedural climb pose they used to fall back on could not be made legible.
  const paintedClimb = paperActive && coatHasFrames(coatSlug(PATTERNS[patternIndex] ? PATTERNS[patternIndex].name : ''));
  const climbing = paperActive && (t < paperUntil || FORCED_STATE === 'paper');   // wheel turning vs coasting
  climbDir += (scrollDirRaw - climbDir) * Math.min(1, dt * 0.012);                 // eased -1 (up) .. +1 (down)
  const instRate = dt > 0 ? pulses / (dt / 1000) : 0;                              // wheel ticks/sec this frame (spiky)
  scrollRate += (instRate - scrollRate) * Math.min(1, dt * 0.005);                 // heavily smoothed scroll speed
  // Leaf physics. It enters from the edge you are scrolling FROM and streaks past,
  // so the direction of travel matches the direction of the page. Speed follows the
  // smoothed wheel rate: a gentle scroll drifts it, a hard flick whips it past.
  const swatDir = scrollDirRaw < 0 ? -1 : 1;                       // -1 up, +1 down
  const swatTop = pos.y - SH - 86, swatBot = pos.y + 8;
  if (paperActive && !paintedClimb) {
    if (!swatLeaf) {
      swatT0 = t;
      swatLeaf = {
        // Out to one side, clear of the torso, but still inside the paw's reach at
        // full stretch (~28px from centre). Closer than this and the leaf sails
        // through the cat's chest instead of past it.
        lane: (Math.random() < 0.5 ? -1 : 1) * (24 + Math.random() * 14),
        x: pos.x,
        y: swatDir > 0 ? swatTop : swatBot,
        spin: Math.random() * 6.28, spinV: 0.05 + Math.random() * 0.06, hit: false,
      };
    }
    const step = (2.4 + scrollRate * 0.42) * (dt / 16);
    swatLeaf.y += swatDir * step;
    swatLeaf.spin += swatLeaf.spinV * (dt / 16);
    // Wobble AROUND its lane rather than accumulating a drift each frame: adding
    // the offset every tick is a random walk, and the leaf wandered across the
    // cat's chest instead of falling past it.
    swatLeaf.x = pos.x + swatLeaf.lane + Math.sin(t / 260 + swatLeaf.spin) * 5;
    if (swatDir > 0 ? swatLeaf.y > swatBot : swatLeaf.y < swatTop) swatLeaf = null;   // gone; another follows while the wheel turns
  } else if (swatLeaf) {
    swatLeaf = null;
  }
  // Painted climb cadence: the frames beat at the scroll's pace, and the scene
  // heaves with each hand-over-hand pull so it does not hang frozen.
  const climbFps = climbing ? clamp(1 + scrollRate * 0.09, 1, 6) : 0;             // gentle scroll ~1fps .. hard flick ~6fps
  climbAnim += (dt / 1000) * climbFps;
  const climbStroke = (t / (climbing ? 460 : 1100)) % 1;
  const climbBob = paperActive ? Math.sin(climbStroke * Math.PI * 2) * (climbing ? 2.2 + Math.min(scrollRate, 45) * 0.045 : 1.1) : 0;

  // Mouse-hunt: when enabled in settings, a fast cursor flick (far enough away)
  // makes the cat crouch, stalk, and pounce. Off by config (or when the cat is set
  // to ignore the cursor) -> the cat stays put.
  const follow = !(config && config.followCursor === false);
  const huntOn = follow && !!(config && config.huntOn);
  const dCur = Math.hypot(cursor.x - pos.x, cursor.y - (pos.y - SH * 0.5));
  if (huntOn && !grabbing && !SHOT && !workModeOn() && velEMA > HUNT_TRIGGER && dCur > 70) { huntUntil = t + 1400; huntTarget = null; addEnergy(0.6 * step); }
  const hunting = !startleActive && (FORCED_STATE === 'hunt' || (huntOn && t < huntUntil) || (t < huntUntil && huntTarget && bfOn));

  // Pet detection. Patting is a MOVING hand, so this deliberately does NOT ask for
  // a still cursor: any speed short of flicking straight past counts while the
  // pointer is on the pet, and each touch stays warm briefly afterwards so a
  // back-and-forth stroke reads as one continuous pat instead of flickering off
  // every time the hand picks up speed or overshoots the sprite for a frame.
  // (A cursor this close can never trigger a hunt - that needs dCur > 70 - so a
  // generous ceiling here costs nothing.)
  const headBox = { x: pos.x - SW / 2, y: pos.y - SH, w: SW, h: SH * 0.42 };
  const inHead = cursor.x >= headBox.x && cursor.x <= headBox.x + headBox.w && cursor.y >= headBox.y && cursor.y <= headBox.y + headBox.h;
  const bodyBox = { x: pos.x - SW / 2, y: pos.y - SH * 0.58, w: SW, h: SH * 0.58 };
  const inBody = cursor.x >= bodyBox.x && cursor.x <= bodyBox.x + bodyBox.w && cursor.y >= bodyBox.y && cursor.y <= bodyBox.y + bodyBox.h;
  if ((inHead || inBody) && !grabbing && !hunting && !startleActive && velEMA < PET_STROKE_MAX) {
    petTouchUntil = t + PET_GRACE_MS;
    petTouchHead = inHead;                  // the head wins when the boxes overlap
  }
  const touching = t < petTouchUntil;
  const petting = FORCED_STATE === 'pet' || t < petBurstUntil || (!grabbing && !hunting && !startleActive && touching && petTouchHead);
  if (petting) addEnergy(0.6 * step);   // affection nudges mood up toward calm/playful
  if (petting && inHead && !grabbing) { leanTarget = clamp((cursor.x - pos.x) / 90, -0.10, 0.10); leanUntil = t + 200; }   // tilt the head into your hand

  // body touch (not the head): the cat leans/arches into your hand, tail up, and
  // trills now and then - a different reaction than the head-pet purr.
  const bodyPet = !FORCED_STATE && !petting && !grabbing && !hunting && !startleActive && touching && !petTouchHead;
  if (bodyPet) {
    addEnergy(0.5 * step);
    leanTarget = clamp((cursor.x - pos.x) / 70, -0.13, 0.13); leanUntil = t + 200;   // arch toward the hand
    // Every 1.5s was a metronome once anything held `touching` on. A trill is a
    // reaction, not a heartbeat: it wants to feel like the pet answering a stroke.
    if (t - lastBodyTrill > 9000 && velEMA > 0.02) { lastBodyTrill = t; tailFlickT0 = t; if (config && config.soundOn) playChirp(); }
  }

  // purr while petted (only when sound is on); start/stop once on the edge
  const wantPurr = petting && !SHOT && (t - lastCursorMove) < PURR_HAND_MS && !!(config && config.soundOn);
  if (wantPurr && !purring) { startPurr(); purring = true; }
  else if (!wantPurr && purring) { stopPurr(); purring = false; }

  let typing, overheat, heatT;
  if (FORCED_STATE === 'overheat') { typing = true; overheat = true; heatT = 1; }
  else if (FORCED_STATE === 'typing') { typing = true; overheat = false; heatT = 0; }
  else { typing = !grabbing && !hunting && !startleActive && (t - lastKeyAt) < 350; overheat = heat > 0.7; heatT = overheat ? (heat - 0.7) / 0.3 : 0; }
  // rear-up bat: reach a butterfly overhead - its own top-level pose (like typing)
  const batting = FORCED_STATE === 'rearup' || (bfOn && bfMode !== 'out' && t < bfSwatUntil && !hunting && !typing && !petting && !bodyPet && !grabbing && !startleActive && !paperActive && roamUntil < t);
  // Scrolling rears the pet up at the leaf. Note batting excludes paperActive, so
  // the butterfly stands down while you scroll and these two can never fight over
  // the same pose in one frame.
  const swatting = !!swatLeaf && paperActive && !paintedClimb && !hunting && !typing && !petting && !bodyPet && !grabbing && !startleActive;

  // A real cat abandons its stroll the instant you interact. Cancel any active roam
  // so it never slides while petted/typing, and never resumes from a stale path
  // anchor after a hunt/startle/grab interrupts it (which would snap it back).
  if (roamUntil > t && (grabbing || hunting || startleActive || typing || petting || bodyPet)) {
    roamUntil = 0; roamFrom = null; roamTo = null;
  }

  const P = PATTERNS[patternIndex];
  const catSprite = sprites[patternIndex];   // this coat's body build (slender/stocky/fluffy/standard)
  const loafSprite = loafSprites[patternIndex] || catSprite;   // compact resting (loaf) body for the same coat
  let palRGB, pal;
  if (heatT) {                              // overheat tint is transient - rebuild fresh while it lasts
    palRGB = {
      O: toRgb(lerpHex(P.outline, HOT_OUTLINE, heatT)),
      C: toRgb(lerpHex(P.coat, HOT_BODY, heatT)),
      K: toRgb(lerpHex(P.mark, HOT_BODY, heatT)),
      W: toRgb(lerpHex(P.white, HOT_BODY, heatT * 0.5)),
      X: toRgb(lerpHex(P.patch, HOT_BODY, heatT)),
      I: toRgb(P.inner), N: toRgb(P.nose), E: toRgb(P.eye), H: toRgb(HALO),
      T: toRgb(P.tongue || '#e8747f'),
    };
    pal = { O: rgbStr(palRGB.O), C: rgbStr(palRGB.C), W: rgbStr(palRGB.W), N: rgbStr(palRGB.N) };
  } else {                                  // common case: reuse the cached cold palette for this coat
    if (_palKey !== patternIndex) {
      _coldPalRGB = {
        O: toRgb(P.outline), C: toRgb(P.coat), K: toRgb(P.mark), W: toRgb(P.white), X: toRgb(P.patch),
        I: toRgb(P.inner), N: toRgb(P.nose), E: toRgb(P.eye), H: toRgb(HALO),
        T: toRgb(P.tongue || '#e8747f'),
      };
      _coldPal = { O: rgbStr(_coldPalRGB.O), C: rgbStr(_coldPalRGB.C), W: rgbStr(_coldPalRGB.W), N: rgbStr(_coldPalRGB.N) };
      _palKey = patternIndex;
    }
    palRGB = _coldPalRGB; pal = _coldPal;
  }

  // gaze: track the cursor, unless "Follow cursor" is off (then rest forward and
  // let the random idle look-arounds carry the life instead).
  const look = follow
    ? (() => { const fx = pos.x, fy = pos.y - SH * 0.72, vx = cursor.x - fx, vy = cursor.y - fy, l = Math.hypot(vx, vy) || 1; return { x: vx / l, y: vy / l }; })()
    : { x: 0, y: 0.12 };
  const blinking = t < blinkUntil;

  if (startleActive) {
    // ---- STARTLE: flinch + puff, freeze, then bolt to an edge or creep back -
    const se = FORCED_STATE === 'startle' ? ((t % STARTLE_MS) / STARTLE_MS) : clamp((t - startleT0) / STARTLE_MS, 0, 1);
    let puff = 1, jit = 0;
    if (se < 0.18) { puff = 1 + 0.20 * Math.sin((se / 0.18) * Math.PI); jit = Math.sin(t / 26) * 2.5; }   // flinch
    else if (se >= 0.42) {                                                                                 // move phase
      const m = (se - 0.42) / 0.58;
      if (startleMode === 'bolt' && startleFrom && startleTo) {
        const ease = 1 - Math.pow(1 - m, 2);
        pos.x = startleFrom.x + (startleTo.x - startleFrom.x) * ease;
        pos.y = startleFrom.y + (startleTo.y - startleFrom.y) * ease;
      } else { jit = Math.sin(t / 60) * (1 - m) * 3; }                                                     // creep wobble
    }
    pos.x = zoneClampX(pos.x); pos.y = zoneClampY(pos.y);
    restSprings();
    const oy = Math.round(pos.y - SH);
    drawShadow(pos.x, pos.y, 0.16);
    octx.clearRect(0, 0, oc.width, oc.height);
    drawCat(octx, catSprite, t, palRGB, { bob: 0, blinking, look: { x: 0, y: -0.25 }, eyeMode: 'open', dilate: 1.5 - Math.min(se, 1) * 0.25 });   // fright blows the pupils wide, easing as it recovers
    ctx.save();
    ctx.translate(pos.x + jit, pos.y);
    ctx.scale(puff, puff);
    ctx.drawImage(oc, 0, 0, SW, SH, -SW / 2, -SH, SW, SH);
    ctx.restore();
    drawDoneSpark(pos.x + 2, oy - 4, t);   // a startled "!" pops over the head
    sendHot(pos.x - SW / 2 - 6, oy - 6, SW + 12, SH + 12, false);
  } else if (hunting) {
    // ---- MOUSE HUNT: stalk toward the cursor, then pounce -------------------
    // A butterfly hunt targets the BUG, but the catch happens at the paws, POUNCE_REACH above
    // the feet at the apex of the leap: aim the feet that far under it, or the cat flies
    // through the bug feet-first and the paws close on air (0 catches in 316 measured
    // pounces before this). The cursor hunt keeps aiming at the cursor itself.
    const _raw = huntTarget ? { x: huntTarget.x, y: huntTarget.y + POUNCE_REACH } : cursor; const _ht = { x: zoneClampX(_raw.x), y: zoneClampY(_raw.y) }; const dx = _ht.x - pos.x, dy = _ht.y - pos.y, d = Math.hypot(dx, dy) || 1;   // aim ONLY inside the play area, so a pounce (incl. chasing a butterfly) never leaps to screen center
    let leap = 0, stretchY = 1, coil = 0, wiggle = 0;
    // the wind-up coil completes -> spring into the pounce
    if (windingUp && t - windupT0 >= POUNCE_WINDUP_MS) { windingUp = false; pouncing = true; pounceT0 = t; pounceTarget = { x: _ht.x, y: _ht.y }; }
    if (pouncing) {
      const e = clamp((t - pounceT0) / POUNCE_MS, 0, 1);
      const ease = 1 - Math.pow(1 - e, 2);
      const tgt = pounceTarget || cursor;
      pos.x = pounceFrom.x + (tgt.x - pounceFrom.x) * ease;
      pos.y = pounceFrom.y + (tgt.y - pounceFrom.y) * ease;
      leap = Math.sin(e * Math.PI) * POUNCE_LEAP; stretchY = 1 + Math.sin(e * Math.PI) * 0.26;   // a big, paws-up leap
      // the catch: if the leap reaches a real butterfly, the cat bats it between its paws.
      // A fan of pink sparkles and a heart at the paws and one pleased trill; the bug is
      // held there for a moment ('held' in updateButterflyDesk), then slips out and climbs
      // away, and the victory window opens as it goes. The 'held' guard is load-bearing:
      // without it this block re-enters on every remaining frame of the leap.
      if (bfOn && huntTarget && bfMode !== 'out' && bfMode !== 'held' && e > 0.4 && Math.hypot(bfX - pos.x, bfY - (pos.y - leap - HH * 0.55)) < 44) {
        const cx = pos.x, cy = pos.y - leap - HH * 0.6;
        // runAction('companion') skips the low-power gate, so a low-power visit is reachable
        // from the settings button: calm the beat down here rather than assume it cannot happen.
        const motionOK = !((config && config.reducedMotion) || lowPower);
        popSparks(t, cx, cy - 4, motionOK ? Math.round(3 + 2 * intensity) : 1);   // 4 / 5 / 6 by mood band; 1 when calm
        popLove(t, cx, cy - 6, 1.4, 10);
        bfMode = 'held'; bfHeldUntil = t + BF_HELD_MS; bfJoyAmp = motionOK ? 14 * intensity : 0;
        bfVx = 0; bfVy = 0; bfX = cx; bfY = cy + 6;
        addEnergy(22); tailFlickT0 = t; wagBoost = 1;
        if (config && config.soundOn) playChirp();   // "gotcha": once per catch; the guard above makes it unrepeatable
      }
      if (bfMode === 'held') { bfX = pos.x; bfY = pos.y - leap - HH * 0.6 + 6; }   // ride the rest of the leap in the paws (the flight integrator is paused while hunting)
      if (e >= 1) {
        // Landing. A cursor pounce and a real catch get the "got it!" sparkle; a whiff at
        // the butterfly gets none, and the cat watches it get away instead.
        const bfPounce = bfOn && !!huntTarget, caught = bfMode === 'held';
        pouncing = false; huntUntil = 0; huntTarget = null; persistPos(); tailFlickT0 = t;
        if (!bfPounce || caught) idleSparkles.push({ x: pos.x, y: pos.y - HH * 0.7, t0: t });
        else { lookTarget = { x: clamp((bfX - pos.x) / 200, -1, 1), y: -0.8 }; lookTargetUntil = t + 400; leanTarget = clamp((bfX - pos.x) / 200, -0.08, 0.08); leanUntil = t + 400; }
      }
    } else if (windingUp) {
      // anticipation: hold position, crouch + butt-wiggle to telegraph the pounce ("it's about to do it")
      const wu = clamp((t - windupT0) / POUNCE_WINDUP_MS, 0, 1);
      coil = Math.sin(wu * Math.PI * 0.5);     // ease into the crouch
      stretchY = 1 - coil * 0.14;              // squash down (feet stay planted; see the ox/oy render below)
      wiggle = Math.sin(t / 55) * 2.4 * coil;  // side-to-side butt-wiggle (render-only offset)
    } else if (FORCED_STATE !== 'hunt' && d < POUNCE_RANGE) {
      // the butterfly pounce telegraphs with a wind-up coil first; the cursor hunt stays snappy
      if (bfOn && huntTarget) {
        windingUp = true; windupT0 = t; pounceFrom = { x: pos.x, y: pos.y }; wagBoost = Math.max(wagBoost, 0.4);
        // the jink: the bug flits aside while the cat is coiling. huntTarget is deliberately
        // NOT re-aimed, so the leap goes where the bug was and the cat watches it get away.
        if (Math.random() < BF_JINK_P) { const s = bfX < pos.x ? -1 : 1; bfX = clamp(bfX + s * 64, BF_EDGE, viewW - BF_EDGE); bfY = Math.max(BF_TOP, bfY - 26); }
      }
      else { pouncing = true; pounceT0 = t; pounceFrom = { x: pos.x, y: pos.y }; pounceTarget = { x: _ht.x, y: _ht.y }; }   // leap toward the zone-clamped target (stays in the play area)
    } else if (FORCED_STATE !== 'hunt') {
      const mv = Math.min(Math.max(0, d - STANDOFF), HUNT_SPEED * step);
      pos.x += dx / d * mv; pos.y += dy / d * mv;
    }
    pos.x = zoneClampX(pos.x); pos.y = zoneClampY(pos.y);
    restSprings();
    const creep = Math.round(Math.sin(t / 90) * 1.5);
    const ox = Math.round(pos.x - HW / 2 + wiggle), oy = Math.round(pos.y - (windingUp ? HH * stretchY : HH)) - Math.round(leap);
    const facingLeft = FORCED_STATE !== 'hunt' && (huntTarget || cursor).x < pos.x;
    if (pouncing && pounceFrom && pounceTarget) {
      const pe = clamp((t - pounceT0) / POUNCE_MS, 0, 1);
      const pdx = pounceTarget.x - pounceFrom.x, pdy = pounceTarget.y - pounceFrom.y, plen = Math.hypot(pdx, pdy) || 1;
      for (let i = 1; i <= 3; i++) {
        ctx.globalAlpha = (0.28 - i * 0.07) * Math.sin(pe * Math.PI);
        ctx.fillStyle = pal.C;
        ctx.fillRect(Math.round(pos.x - pdx / plen * i * 7 - 2), Math.round(pos.y - leap - HH * 0.5 - pdy / plen * i * 7 - 3), 4, 6);
      }
      // two front paws reaching out toward the butterfly at the apex of the leap
      const reach = Math.sin(pe * Math.PI) * 17, ux = pdx / plen, uy = pdy / plen;
      const hx = pos.x + ux * reach, hy = pos.y - leap - HH * 0.5 + uy * reach, pa = Math.atan2(uy, ux);
      ctx.globalAlpha = Math.sin(pe * Math.PI);
      ctx.fillStyle = pal.C;
      for (const so of [-4.5, 4.5]) { ctx.beginPath(); ctx.ellipse(hx + so, hy, 3.4, 2.5, pa, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#f3d2e2';
      for (const so of [-4.5, 4.5]) ctx.fillRect(Math.round(hx + so - 1), Math.round(hy - 1), 2, 2);   // toe beans
      ctx.globalAlpha = 1;
    }
    drawShadow(pos.x, pos.y, 0.18, 26);
    octx.clearRect(0, 0, oc.width, oc.height);
    drawCat(octx, huntSpriteFor(patternIndex), t, palRGB, { bob: creep, blinking, look, eyeMode: 'open', dilate: pouncing ? 1.5 : (windingUp ? 1.32 + coil * 0.2 : 1.32) });
    ctx.save();
    if (facingLeft) { ctx.translate(ox + HW, oy); ctx.scale(-1, stretchY); ctx.drawImage(oc, 0, 0, HW, HH, 0, 0, HW, HH); }
    else { ctx.translate(ox, oy); ctx.scale(1, stretchY); ctx.drawImage(oc, 0, 0, HW, HH, 0, 0, HW, HH); }
    ctx.restore();
    sendHot(0, 0, 0, 0, false); // non-interactive while hunting -> clicks pass through
  } else {
    if (windingUp) windingUp = false;   // hunt ended mid-wind-up -> drop the stale coil
    // ---- not hunting: keep mochi springs settling toward pos ---------------
    const restTop = { x: pos.x, y: pos.y - SH };
    if (FORCED_STATE === 'mochi') {
      head.x = pos.x; head.y = pos.y - SH * 1.7; head.vx = head.vy = 0; feet.x = pos.x; feet.y = pos.y; feet.vx = feet.vy = 0;
    } else {
      const ht = grabbing ? { x: clamp(cursor.x, EDGE_L, viewW - EDGE_R), y: clamp(cursor.y, 8, viewH - 8) } : restTop;   // keep body/tail on-screen while dragged to an edge
      const HK = grabbing ? 0.45 : 0.14, HD = grabbing ? 0.45 : 0.16;
      head.vx += ((ht.x - head.x) * HK - head.vx * HD) * step; head.vy += ((ht.y - head.y) * HK - head.vy * HD) * step;
      head.x += head.vx * step; head.y += head.vy * step;
      const ftx = grabbing ? head.x : pos.x, fty = grabbing ? head.y + SH : pos.y, FK = 0.07, FD = 0.12;
      feet.vx += ((ftx - feet.x) * FK - feet.vx * FD) * step; feet.vy += ((fty - feet.y) * FK - feet.vy * FD) * step;
      if (grabbing) feet.vy += 2.2 * step;
      feet.x += feet.vx * step; feet.y += feet.vy * step;
    }
    // --- autonomous roaming: a real cat wanders. When calm (not busy), now
    // and then stroll to a random spot inside the play area with a little hop-walk.
    if (nextRoam === 0) nextRoam = t + 8000 + Math.random() * 9000;
    const roamIdle = !grabbing && !hunting && !startleActive && !typing && !petting && !bodyPet && !FORCED_STATE && t > groomUntil && t >= playUntil && agentState === 'idle' && !(config && config.roamOn === false) && !((config && config.reducedMotion) || lowPower) && !workModeOn();
    // the chase: when a butterfly is drifting far off (and the cursor is idle), creep toward it
    const cursorIdleNow = (t - lastCursorMove) > BF_PLAY_IDLE;
    const bugStalkOn = roamIdle && follow && cursorIdleNow && bfOn && bfMode !== 'out' &&
      Math.hypot(bfX - pos.x, bfY - (pos.y - SH * 0.5)) > BUG_INTEREST_MIN;
    if (workModeOn()) {
      // Work mode: hold in the rest corner on the taskbar; walk back if nudged away.
      // Reuses the eased roam interpolation below by aiming a short roam at the corner.
      // giveTrekOn(): a treat or a ball the user handed the pet outranks the park.
      // This aimer and the give errand write the same roam slot, and this one runs
      // first every frame, so it used to re-claim the slot the moment the walk to the
      // fish expired: the cat set off, got marched back to its corner just short of
      // eating, set off again, and paced between corner and fish for as long as the
      // treat existed (which is forever, since only eating clears it). Work mode is
      // there to stop the pet wandering off on its own, not to veto what you clicked.
      const parkIdle = !grabbing && !hunting && !startleActive && !typing && !petting && !bodyPet && !FORCED_STATE && agentState === 'idle' && !giveTrekOn();
      if (parkIdle && roamUntil < t) {
        const tx = homeX(), ty = restingY();
        if (Math.hypot(tx - pos.x, ty - pos.y) > 2) { roamFrom = { x: pos.x, y: pos.y }; roamTo = { x: tx, y: ty }; roamDur = 900; roamUntil = t + roamDur; }
      }
    } else if (bugStalkOn) {
      const side = Math.sign(bfX - pos.x) || 1;
      const tgX = zoneClampX(bfX - side * BUG_STANDOFF);
      if (roamUntil < t || !roamTo || Math.abs(roamTo.x - tgX) > BUG_RETARGET_DIST) {   // (re)aim as the bug drifts
        roamFrom = { x: pos.x, y: pos.y }; roamTo = { x: tgX, y: pos.y };               // walk horizontally toward it
        roamDur = BUG_CREEP_MS; roamUntil = t + roamDur; nextRoam = t + 20000;          // pause random roam during the chase
      }
    } else if (roamIdle && roamUntil < t && t > nextRoam) {
      roamFrom = { x: pos.x, y: pos.y };
      const rx = roamTargetX();
      // Floor-lock keeps strolls on the ground line (left/right only); otherwise pick
      // a vertical target inside the play area / lower screen.
      const ry = floorLockOn() ? restingY() : (playArea ? (playArea.y + Math.random() * playArea.h) * viewH : viewH * 0.45 + Math.random() * viewH * 0.5);
      roamTo = { x: zoneClampX(rx), y: floorLockOn() ? ry : zoneClampY(ry) };
      roamDur = 1500; roamUntil = t + roamDur; nextRoam = t + 11000 + Math.random() * 13000; tailFlickT0 = t; loafUntil = 0;
    }
    if (roamUntil > t && roamFrom && roamTo) {
      const e = clamp((t - (roamUntil - roamDur)) / roamDur, 0, 1);
      const ease = e < 0.5 ? 2 * e * e : 1 - Math.pow(-2 * e + 2, 2) / 2;   // easeInOut
      pos.x = roamFrom.x + (roamTo.x - roamFrom.x) * ease;
      pos.y = roamFrom.y + (roamTo.y - roamFrom.y) * ease - Math.abs(Math.sin(e * Math.PI * 5)) * (bugStalkOn ? 1 : 3);   // low creep while stalking, hop-walk otherwise
      restSprings();
      if (e >= 1) persistPos();
      wantHighFps = true;
    }
    const axX = feet.x - head.x, axY = feet.y - head.y, len = Math.hypot(axX, axY) || 1, ang = Math.atan2(axY, axX), ratio = len / SH;
    const speed = Math.hypot(head.vx, head.vy) + Math.hypot(feet.vx, feet.vy);
    const calm = !grabbing && FORCED_STATE !== 'mochi' && Math.abs(ratio - 1) < 0.02 && speed < 0.45 && Math.abs(ang - Math.PI / 2) < 0.03;
    const jamming = !!(config && config.lobbyJam && config.lobbyJam.on) || FORCED_STATE === 'jam';
    const jamMotion = jamming && !((config && config.reducedMotion) || lowPower);
    const jamPhase = (jamMotion && window.jamBeatPhase) ? window.jamBeatPhase() : 0;
    const bob = Math.round(Math.sin(t / (typing ? 220 : 700)) * 3) + (jamMotion ? Math.round(Math.sin(jamPhase * Math.PI * 2) * 2) : 0);

    // --- mouse-idle stare: after 10s of a still cursor the cat fixates on it, then
    // roams its eyes (mostly small wanders near the cursor, some glances around).
    // Only while following + seated/idle; any cursor move drops it (handled above).
    const canStare = follow && !hunting && !startleActive && !grabbing && !typing && !petting && !bodyPet && !paperActive && !FORCED_STATE && agentState === 'idle';
    const staring = canStare && (t - lastCursorMove > 10000);
    if (staring) {
      if (staringT0 < 0) { staringT0 = t; nextStareLook = 0; lookTarget = null; }   // engage: fixate on the cursor
      if (t - staringT0 >= 1800 && t > nextStareLook) {                              // after the fixate hold, roam
        nextStareLook = t + 700 + Math.random() * 900;
        if (Math.random() < 0.6) {                                                   // wander near the cursor
          lookTarget = { x: clamp(look.x + (Math.random() * 2 - 1) * 0.35, -1, 1), y: clamp(look.y + (Math.random() * 2 - 1) * 0.3, -1, 1) };
        } else {                                                                     // glance around the screen
          lookTarget = { x: Math.random() * 2 - 1, y: (Math.random() * 2 - 1) * 0.5 };
        }
        lookTargetUntil = nextStareLook + 250;
      }
    } else { staringT0 = -1; }

    // --- liveliness: eased gaze + periodic idle micro-actions ---------------
    const restIdle = calm && !petting && !bodyPet && !typing && !grabbing && !FORCED_STATE && roamUntil < t && agentState === 'idle';
    if (restIdle && !staring) {
      const idleScale = (2 - intensity) * (config && config.reducedMotion ? 2 : 1);   // zoomies -> frequent darts; calm -> rarer; Calm mode -> rarer still
      if (nextIdleAt === 0) nextIdleAt = t + (1600 + Math.random() * 2600) * idleScale;
      if (t > nextIdleAt && t >= playUntil && t >= yawnUntil) {   // don't start a new idle action mid-play/yawn
        nextIdleAt = t + (2000 + Math.random() * 3600) * idleScale;
        const roll = Math.random();
        const motionOK = !((config && config.reducedMotion) || lowPower);
        if (roll < 0.26) { lookTarget = { x: Math.random() * 2 - 1, y: (Math.random() * 2 - 1) * 0.5 }; lookTargetUntil = t + 800 + Math.random() * 1100; }
        else if (roll < 0.42 && !(config && config.reducedMotion)) { tailFlickT0 = t; }   // skip frequent tail-flicks in Calm mode (falls through to a gentle loaf/blink)
        else if (roll < 0.54 && !(config && config.reducedMotion)) { leanTarget = (Math.random() < 0.5 ? -1 : 1) * 0.045; leanUntil = t + 700; }   // weight shift (skipped in Calm mode)
        else if (roll < 0.70 && band !== 'calm' && motionOK && !workModeOn()) { startPlay(t); }   // bat a drifting leaf with a paw (self-play; never grabs the cursor)
        else if (roll < 0.80) { loafUntil = t + 4000 + Math.random() * 4000; }   // settle into a content loaf
        else if (roll < 0.90 && band !== 'zoomies') { groomUntil = t + 2600 + Math.random() * 1400; }   // wash its face (paw to muzzle)
        else if (roll < 0.95 && band !== 'calm' && motionOK) { doneHopPending = true; tailFlickT0 = t; }   // an occasional perk-up bounce (rare now)
        else if (band === 'calm' && Math.random() < 0.5) { yawnUntil = t + 1000; }   // a big sleepy yawn
        else { blinkUntil = t + 230; nextBlink = t + 380; }   // sleepy double-blink
        if (band === 'zoomies' && Math.random() < 0.45 && motionOK && !workModeOn()) startPlay(t);   // hyper: more likely to break into play
        if (band === 'zoomies' && Math.random() < 0.22 && motionOK) spinUntil = t + 650;   // tail-chase pirouette
      }
    } else { nextIdleAt = 0; }
    if (lookTarget && t > lookTargetUntil) lookTarget = null;
    if (t > leanUntil) leanTarget = 0;
    lean += (leanTarget - lean) * 0.09 * step;
    updateSelfPlay(t, dt, step, { follow, grabbing, hunting, typing, petting, startleActive, calm });
    updateTreat(t, { grabbing, hunting, typing, startleActive });
    updateBall(t, dt, { grabbing, hunting, typing, startleActive });
    updateDogVitals(t, dt);
    const gaze = lookTarget || look;
    smoothLook.x += (gaze.x - smoothLook.x) * 0.18 * step;   // snappier cursor tracking
    smoothLook.y += (gaze.y - smoothLook.y) * 0.18 * step;
    // continuous subtle body-lean toward the cursor (the cat "watches" it), only
    // when following and idle-ish - never fights a grab/throw/typing pose.
    const leanWant = (follow && !grabbing && !typing && !startleActive) ? clamp((cursor.x - pos.x) / 200, -0.08, 0.08) : 0;
    cursorLean += (leanWant - cursorLean) * 0.06 * step;

    // --- idle reactions: periodic stretch + AI-agent thinking/done ----------
    if (nextStretch === 0) nextStretch = t + STRETCH_INTERVAL;
    const idleNow = calm && !petting && !typing && agentState === 'idle';
    if (FORCED_STATE !== 'stretch' && idleNow && t > nextStretch) { stretchT0 = t; nextStretch = t + STRETCH_INTERVAL; }
    const stretching = FORCED_STATE === 'stretch' || (stretchT0 >= 0 && t - stretchT0 < STRETCH_MS);
    const thinking = FORCED_STATE === 'think' || agentState === 'thinking';
    const working = FORCED_STATE === 'work' || agentState === 'working';
    if (doneHopPending) {
      doneHopT0 = t; doneHopPending = false;
      if (config && config.soundOn) { if (doneIsAgent) playMeow(); else playChirp(); }   // agent done meows; playful bounce chirps
      doneIsAgent = false;
    }
    let hop = 0, hopActive = false;
    if (FORCED_STATE === 'done') { hop = Math.sin(((t % DONE_MS) / DONE_MS) * Math.PI) * 22 * intensity; hopActive = true; }
    else if (doneHopT0 >= 0 && t - doneHopT0 < DONE_MS) { hop = Math.sin(((t - doneHopT0) / DONE_MS) * Math.PI) * 22 * intensity; hopActive = true; }
    // the victory beat after a butterfly catch rides the same hop: hopActive buys the
    // happy eyes, the idle exclusions and the branch below, and the offset stays
    // render-only, so a stay-put pet stays exactly put
    const joyOn = bfJoyT0 >= 0 && t < bfJoyUntil && !grabbing;
    const bfHeld = bfOn && bfMode === 'held';   // peering at the bug cupped in its paws
    if (joyOn && !hopActive) { hop = bfJoyHop(t); hopActive = true; }
    // "oh! a butterfly": a small perk when the bug is first spotted. hopActive stays
    // false on purpose, so the eyes stay open and nothing else treats it as a bounce.
    else if (!hopActive && bfNoticeT0 >= 0 && t - bfNoticeT0 < BF_NOTICE_MS && !((config && config.reducedMotion) || lowPower)) hop = Math.sin((t - bfNoticeT0) / BF_NOTICE_MS * Math.PI) * 6;

    // The painted scene is a whole picture (cat + rope + ball) and replaces the
    // sprite rather than drawing over it, so it gets its own branch. Computed here
    // rather than with paintedClimb because `stretching` only exists in this scope.
    const climbRaster = paintedClimb && !petting && !stretching;
    if (typing || FORCED_STATE === 'typing' || FORCED_STATE === 'overheat') {
      // Front-facing "keyboard kneading": the cat leans forward over two big
      // keycaps and kneads them with alternating paws (Comnyang-style).
      renderTypeFront(t, palRGB, pal, overheat, blinking, look);
      sendHot(pos.x - TW / 2 - 16, pos.y - TH - 8, TW + 32, TH + 16, false);
    } else if (climbRaster) {
      // Painterly climb: the frame carries its own rope and floor ball, so this
      // replaces the seated sprite entirely for the length of the scroll.
      drawShadow(pos.x, pos.y, 0.16, 30);
      drawClimbFrame(pos, t, climbing, climbDir, coatSlug(P.name), climbBob);
      sendHot(pos.x - SW / 2 - 12, pos.y - SH * 2.4, SW + 24, SH * 2.4 + 20, false);
    } else if (batting || swatting) {
      // Rear up on the haunches and swipe overhead with both paws: at the butterfly
      // when it visits, at the streaking leaf while you scroll.
      // The butterfly swat gets a haunch lift and a whoosh scaled by mood (calm 0.73,
      // playful 0.85, zoomies 1.0); both were fixed before. Only the cadence is sacred.
      const motionOK = !((config && config.reducedMotion) || lowPower);
      const aim = swatting ? { tgtX: swatLeaf.x, tgtY: swatLeaf.y, swingT0: swatT0 }
        : { lift: motionOK ? 4 * intensity : 0, strength: clamp(0.55 + 0.3 * intensity, 0, 1) };
      const ph = renderRearBat(t, palRGB, blinking, aim);
      if (swatting) {
        // Connect: a paw at full stretch near the leaf sends it spinning off. Once
        // per leaf, so one swipe cannot keep re-hitting the same one every frame.
        if (!swatLeaf.hit && ph > 0.72 && Math.abs(swatLeaf.y - (pos.y - SH - 6)) < 40 && Math.abs(swatLeaf.x - pos.x) < 46) {
          swatLeaf.hit = true;
          swatLeaf.spinV = (swatLeaf.x < pos.x ? -1 : 1) * 0.34;
          addEnergy(3);
          if (!lowPower) idleSparkles.push({ x: swatLeaf.x, y: swatLeaf.y, t0: t });
          if (config && config.soundOn && t > swatChirpUntil) { swatChirpUntil = t + 4000; playChirp(); }
        }
        drawMote(swatLeaf.x, swatLeaf.y, swatLeaf.spin);
      }
      sendHot(pos.x - SW / 2 - 12, pos.y - SH - 46, SW + 24, SH + 46, false);
    } else if (!grabbing && (calm || petting || stretching || thinking || working || hopActive || FORCED_STATE === 'loaf' || FORCED_STATE === 'groom' || FORCED_STATE === 'play' || FORCED_STATE === 'yawn')) {
      const idleSway = Math.round(Math.sin(t / 2600));                 // slow weight shift ±1
      const grooming = FORCED_STATE === 'groom' || (calm && !petting && !bodyPet && !typing && !stretching && !thinking && !working && !hopActive && !paperActive && roamUntil < t && t < groomUntil);
      const playing = !grooming && (FORCED_STATE === 'play' || (calm && !petting && !bodyPet && !typing && !stretching && !thinking && !working && !hopActive && !paperActive && roamUntil < t && t < playUntil));
      const loafing = !grooming && !playing && (FORCED_STATE === 'loaf' || (calm && !petting && !typing && !stretching && !thinking && !working && !hopActive && !paperActive && t < loafUntil));
      const yawning = FORCED_STATE === 'yawn' || (calm && !petting && !bodyPet && !typing && !stretching && !thinking && !working && !hopActive && !paperActive && !grooming && !playing && !loafing && t < yawnUntil);
      const wig = idleSway;   // calm "normal" patting - no fast side-to-side jitter while petted
      // Eyes squeeze shut for a pat ANYWHERE on the pet, not just on the head - a
      // cat being stroked along its back squints just as happily as one having its
      // ears scratched. Also on the done/playful hop, and on a yawn.
      const emode = (petting || bodyPet || stretching || loafing || grooming || hopActive || yawning) ? 'happy' : 'open';
      const eLook = (thinking || working) ? { x: 0, y: -0.5 }
        : (playing && mote) ? { x: clamp((mote.x - pos.x) / 70, -1, 1), y: clamp((mote.y - (pos.y - SH * 0.72)) / 70, -1, 1) }   // watch the leaf
        : smoothLook;
      const breath = Math.sin(t / 2200);                              // gentle, slow breathing (calmer cadence)
      let sx = 1 - breath * 0.012, sy = 1 + breath * 0.020;
      if (settleSquash) { sy *= 1 - settleSquash; sx *= 1 + settleSquash * 0.5; }   // tiny squash as it lands on the floor
      if (stretching) {
        const se = FORCED_STATE === 'stretch' ? ((t % STRETCH_MS) / STRETCH_MS) : clamp((t - stretchT0) / STRETCH_MS, 0, 1);
        // squash-and-stretch: a brief anticipation crouch, then a TALL + NARROW reach
        // (it pinches in as it rises, instead of just inflating bigger), then settles.
        let k;   // -ve = crouched/wider, +ve = tall/narrow
        if (se < 0.16) k = -Math.sin(se / 0.16 * Math.PI) * 0.5;
        else { const r = (se - 0.16) / 0.84; k = Math.sin(r * Math.PI); }
        sy = 1 + k * 0.42; sx = 1 - k * 0.14;
      }
      // head-pet "nuzzle": the cat rises to meet your hand each stroke - a soft push-up
      // with a tiny squash at the peak, as if pressing its head up into the palm.
      const petPress = petting ? Math.max(0, Math.sin(t / 320)) : 0;
      const petPush = petPress * 4;
      if (petPress) { sy *= 1 - petPress * 0.05; sx *= 1 + petPress * 0.04; }
      const ox = Math.round(pos.x - SW / 2) + wig, oy = Math.round(pos.y - SH) - Math.round(hop) - Math.round(petPush);
      const shadowA = (petting || bodyPet) ? 0.14 + Math.sin(t / 800) * 0.05 : 0.18;
      drawShadow(pos.x + wig, pos.y, shadowA);
      if (!stretching && !thinking && !working && !loafing) {
        // loaf/curl has a baked, wrapped tail of its own
        if (isDog()) drawDogTail(pos.x + wig, pos.y, t, pal, tailFlickT0, petting, energy / 100 + (ball && ball.phase === 'carry' ? 0.5 : 0));
        else drawTail(pos.x + wig, pos.y, t, pal, tailFlickT0, petting, clamp(wagBoost + (bfOn && bfMode !== 'out' && cursorIdleNow ? 0.5 : 0), 0, 1));
      }
      if (!lowPower && restIdle && band === 'calm' && !paperActive && t > nextIdleSparkle) {   // ambient sparkles off in low power (they pin the loop at 60fps)
        idleSparkles.push({ x: pos.x + (Math.random() - 0.5) * 8, y: oy, t0: t });
        nextIdleSparkle = t + 5000 + Math.random() * 4000;
      }
      if (!lowPower && loafing && calm && t > nextLoafZ) {   // sleep Z's off in low power
        loafZZZ.push({ x: pos.x + 10 + Math.random() * 8, y: oy + 8, t0: t, sz: Math.random() < 0.4 ? 2 : 1 });
        nextLoafZ = t + 1800 + Math.random() * 1600;
      }
      octx.clearRect(0, 0, oc.width, oc.height);
      const stareDilate = bfHeld ? 1.4 : (staring && t - staringT0 < 1800) ? 1.12 : 1;   // subtle wide-eyed fixate
      // Washing, pondering, tapping and batting all raise one front paw. They share
      // one composed pose and differ only in how high it goes and how far it reaches,
      // which replaces four separate limbs-drawn-as-rectangles over the sprite.
      const groom = grooming ? groomPhase(t) : null;
      const pawPose = loafing ? null
        // out, not 0: grooming was the ONLY pose asking for max lift with zero reach,
        // which put a dead-vertical forearm up the middle of the chest and parked the
        // mitt on the bottom of the skull. A little reach walks it off the bib and
        // leaves the tongue somewhere to go.
        : groom ? { lift: groom.lift, out: GROOM_OUT }
        : playing ? { lift: 0.34 + battingReach(t) * 0.5, out: 0.45 + battingReach(t) * 0.5 }
        : thinking ? { lift: 0.74 + Math.sin(t / 700) * 0.05, out: 0.06 }
        : working ? { lift: 0.52 + Math.abs(Math.sin(t / 150)) * 0.26, out: 0.16 }
        : null;
      const bodySprite = (pawPose ? pawSpriteFor(patternIndex, pawPose.lift, pawPose.out) : (loafing ? loafSprite : catSprite));
      drawCat(octx, bodySprite, t, palRGB, { bob, blinking, look: eLook, eyeMode: emode, blush: petting || bodyPet || joyOn || bfHeld, dilate: stareDilate, panting: isDog() && t < pantUntil && !loafing });
      if (groom) drawLick(octx, bodySprite, bob, groom);   // tongue rides the sprite buffer, so it scales with the cat
      if (yawning || stretching) {   // open mouth + tongue, drawn into the sprite buffer so it scales/leans with the cat (cats yawn as they stretch)
        const sprog = FORCED_STATE === 'stretch' ? (t % STRETCH_MS) / STRETCH_MS : clamp((t - stretchT0) / STRETCH_MS, 0, 1);
        const yp = stretching ? Math.sin(clamp((sprog - 0.08) / 0.84, 0, 1) * Math.PI) * 0.85
          : FORCED_STATE === 'yawn' ? Math.sin((t % 1600) / 1600 * Math.PI) : Math.sin((1 - clamp((yawnUntil - t) / 1000, 0, 1)) * Math.PI);
        drawYawn(octx, catSprite, bob, yp);
      }
      // rope + floor ball go down FIRST so the body occludes the strand it grips
      // Hand the rope the same horizontal offset the sprite is about to be drawn
      // at, so the strand tracks the body it is being gripped by.
      ctx.save();
      const purrJit = purring ? Math.sin(t / 46) * 0.7 : 0;   // faint purr buzz while petted
      ctx.translate(Math.round(pos.x + wig + purrJit), Math.round(pos.y - hop - petPush));   // round to whole CSS px for crisp pixels; nuzzle push + purr buzz ride on the rest pose
      if (lean || cursorLean) ctx.rotate(lean + cursorLean);   // idle lean + watch-the-cursor tilt
      if (spinUntil > t) ctx.rotate((1 - (spinUntil - t) / 650) * Math.PI * 2);   // tail-chase spin
      const faceLeft = faceLeftAt(t);   // face where it walks
      ctx.scale(faceLeft ? -sx : sx, sy);
      ctx.drawImage(oc, 0, 0, SW, SH, -SW / 2, -SH, SW, SH);
      ctx.restore();
      if (jamming) drawGuitar(pos.x + wig + 2, oy + SH * 0.62, jamPhase);   // the cat plays a tiny guitar while the Lobby Jam loops
      if (overheat) drawSteam(t, ox + SW / 2, oy + CELL);   // red+steam cooldown after typing
      if (petting && t - lastHeart > 520) { popLove(t, pos.x, oy - 4, 2.1, 14); lastHeart = t; }   // big love hearts rising from the head
      else if (bodyPet && t - lastHeart > 950) { popLove(t, pos.x, oy + 6, 1.5, 22); lastHeart = t; }
      // The raised paw for both of these is baked into the pose above; only the
      // status bubble is drawn here.
      if (thinking) drawThinkBubble(pos.x + SW * 0.32, oy + 4, t);
      else if (working) drawWorkBubble(pos.x + SW * 0.32, oy + 2, t);
      if (hopActive && !joyOn) drawDoneSpark(pos.x, oy - 4, t);
      if (playing && !paperActive) renderPlay(palRGB, oy, t, step);                       // bat the drifting leaf with a paw
      else if (mote && t > playUntil) mote = null;                                        // play over -> drop the leaf
      if (t < labelUntil) {
        ctx.globalAlpha = Math.min(1, (labelUntil - t) / 300); ctx.font = 'bold 10px "Courier New", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        const name = P.name, w = ctx.measureText(name).width + 10, bx = pos.x, by = oy + SH + 14;
        ctx.fillStyle = 'rgba(20,20,24,0.82)'; ctx.fillRect(bx - w / 2, by - 13, w, 13); ctx.fillStyle = '#fff'; ctx.fillText(name, bx, by); ctx.globalAlpha = 1;
      }
      // fully idle (only breathing/tail)? let the governor drop to ~33fps
      if (calm && !petting && !stretching && !thinking && !working && !hopActive && !paperActive && !grooming && !playing && !yawning && !blinking
          && !lookTarget && t > lookTargetUntil && hearts.length === 0 && idleSparkles.length === 0 && loafZZZ.length === 0 && musicNotes.length === 0 && !jamMotion && t >= bubbleUntil
          && (tailFlickT0 < 0 || t - tailFlickT0 > 700) && Math.abs(lean) < 0.004) wantHighFps = false;
      // +TAIL_HOT on the right: drawTail sweeps well past the sprite box, so the last
      // stretch of tail could not be hovered or petted at all.
      sendHot(ox - 6, oy - 6, SW + 12 + TAIL_HOT, SH + 12, false);
    } else if (grabbing || FORCED_STATE === 'mochi' || ratio > 1.06) {
      drawShadow(feet.x, feet.y, 0.10);
      octx.clearRect(0, 0, oc.width, oc.height); drawCat(octx, catSprite, t, palRGB, { bob: 0, blinking, look });
      const midDestH = Math.max(2, len - HEAD_SRC - FEET_SRC), midSX = clamp(Math.sqrt(MID_SRC / midDestH), 0.28, 1);
      // shake-wobble: a fast decaying side-to-side sway around the grip point
      const wob = t < wobbleUntil ? Math.sin(t / 60) * 0.22 * ((wobbleUntil - t) / 850) : 0;
      ctx.save(); ctx.translate(head.x, head.y); ctx.rotate(ang - Math.PI / 2 + wob);
      ctx.drawImage(oc, 0, 0, SW, HEAD_SRC, -SW / 2, 0, SW, HEAD_SRC);
      ctx.drawImage(oc, 0, HEAD_SRC, SW, MID_SRC, -SW * midSX / 2, HEAD_SRC, SW * midSX, midDestH);
      ctx.drawImage(oc, 0, HEAD_SRC + MID_SRC, SW, FEET_SRC, -SW / 2, HEAD_SRC + midDestH, SW, FEET_SRC);
      ctx.restore();
      const minX = Math.min(head.x, feet.x) - SW / 2, maxX = Math.max(head.x, feet.x) + SW / 2, minY = Math.min(head.y, feet.y) - 12, maxY = Math.max(head.y, feet.y) + 12;
      sendHot(minX, minY, maxX - minX, maxY - minY, grabbing);
    } else {
      drawShadow(pos.x, pos.y, 0.16);
      octx.clearRect(0, 0, oc.width, oc.height); drawCat(octx, catSprite, t, palRGB, { bob: 0, blinking, look });
      const sq = clamp(ratio, 0.65, 1.06), sy = sq, sx = 1 / Math.sqrt(sq);
      ctx.save(); ctx.translate(pos.x, pos.y); ctx.scale(sx, sy); ctx.drawImage(oc, 0, 0, SW, SH, -SW / 2, -SH, SW, SH); ctx.restore();
      sendHot(pos.x - SW / 2 - 6, pos.y - SH - 6, SW + 12, SH + 12, false);
    }
  }

  if (bfOn && !lowPower) {
    for (const s of bfTrail) { const a = 1 - (t - s.t0) / 480; if (a > 0) { ctx.globalAlpha = a * 0.45; ctx.fillStyle = '#fff'; ctx.fillRect(Math.round(s.x), Math.round(s.y), 2, 2); } }
    ctx.globalAlpha = 1;
    drawButterfly(ctx, bfX, bfY, BF_SCALE, BFLY_STYLES[bfPal], bfFlap, t, clamp(bfVx / 44, -0.22, 0.22));
  }
  // the "!" over the head for half a second when the bug is first spotted (outside the
  // pose branches so it shows whatever the cat was doing; silent by construction)
  // Above whichever body is drawn: the bug arrives inside swat range often enough that
  // the cat can already be reared up, and the bat sprite is a head taller than the sit.
  if (bfOn && bfNoticeT0 >= 0 && t - bfNoticeT0 < BF_NOTICE_MS && !grabbing && !typing) drawDoneSpark(pos.x + 2, pos.y - (batting ? BAT_H : SH) - 4, t);
  drawTreat();   // the fish sits on the floor line, under the hearts
  drawBall(t);   // the tennis ball rides above the floor line (and the muzzle when carried)
  // floating hearts (update + draw; persist after petting ends)
  if (hearts.length) hearts = hearts.filter((h) => t - h.t0 < (h.life || 1100));
  for (const h of hearts) {
    const life = h.life || 1100, a = (t - h.t0) / life;
    const dx = Math.round(h.x + Math.sin(a * (h.wobF || 6) + (h.ph || 0)) * (h.wobA != null ? h.wobA : 4));
    const dy = Math.round(h.y - a * (h.vy || 30));
    const alpha = (1 - a) * 0.95;
    if (h.kind === 'spark') drawSparkle(dx, dy, alpha, h.s || 1);
    else drawHeart(dx, dy, a < 0.5 ? '#ff5a6e' : '#ff8a98', alpha, h.s || 1);
  }
  if (idleSparkles.length) idleSparkles = idleSparkles.filter((s) => t - s.t0 < 400);
  for (const s of idleSparkles) { const a = (t - s.t0) / 400; ctx.globalAlpha = (1 - a) * 0.9; ctx.fillStyle = '#fff6d6'; ctx.fillRect(Math.round(s.x), Math.round(s.y - a * 12), 2, 2); ctx.fillRect(Math.round(s.x + 3), Math.round(s.y - a * 12 - 3), 1, 1); ctx.globalAlpha = 1; }
  if (loafZZZ.length) loafZZZ = loafZZZ.filter((z) => t - z.t0 < 1100);
  for (const z of loafZZZ) { const a = (t - z.t0) / 1100, yOff = a * 14, fade = a < 0.15 ? a / 0.15 : a > 0.75 ? (1 - a) / 0.25 : 1; ctx.globalAlpha = fade * 0.65; ctx.fillStyle = '#8ab4cc'; const zx = Math.round(z.x), zy = Math.round(z.y - yOff), s = z.sz; ctx.fillRect(zx, zy, s * 4, s); ctx.fillRect(zx + s * 2, zy + s, s * 2, s); ctx.fillRect(zx + s, zy + s * 2, s * 2, s); ctx.fillRect(zx, zy + s * 3, s * 4, s); ctx.globalAlpha = 1; }
  // floating music notes while the Lobby Jam plays (outside the pose branches so they show in any pose)
  const jamNotesOn = !!(config && config.lobbyJam && config.lobbyJam.on) && !((config && config.reducedMotion) || lowPower);
  if (jamNotesOn && t > nextMusicNote) { musicNotes.push({ x: pos.x + (Math.random() - 0.5) * 24, y: pos.y - SH * 0.45, t0: t, vx: (Math.random() - 0.5) * 1.6, k: Math.random() < 0.4 ? 1 : 0 }); nextMusicNote = t + 320 + Math.random() * 220; }
  if (musicNotes.length) musicNotes = musicNotes.filter((m) => t - m.t0 < 1300);
  for (const m of musicNotes) { const a = (t - m.t0) / 1300, fade = a < 0.12 ? a / 0.12 : a > 0.8 ? (1 - a) / 0.2 : 1; drawNote(m.x + m.vx * a * 34, m.y - a * 30 + Math.sin(a * 8) * 3, fade * 0.85, m.k); }

  // reminder/break speech bubble - drawn here (outside the pose branches) so it's
  // visible even if a reminder fires mid-hunt or mid-type. A transient bubble
  // outranks the pinned note so reminders never get masked.
  if (t < bubbleUntil && bubbleText) drawBubble(pos.x, pos.y - SH - 6, bubbleText, Math.min(1, (bubbleUntil - t) / 400));
  else if (config && config.pinnedNote) drawBubble(pos.x, pos.y - SH - 6, '📌 ' + template(config.pinnedNote), 0.95);

  // pomodoro pixel timer - floats beside the cat in every pose; main owns the
  // clock (phase + endsAt), we just count it down locally.
  if (pomo && pomo.on) drawPomoTimer(pos.x + SW / 2 + 10, pos.y - SH + 6, t);

  // natural blinking: varied timing with occasional slow/sleepy + double blinks
  if (t > nextBlink && t > blinkUntil) {
    const calmB = !!(config && config.reducedMotion);
    const sleepy = Math.random() < (calmB ? 0.5 : 0.22);   // slower, lingering "slow blink" in Calm mode
    blinkUntil = t + (sleepy ? 230 : 120);
    nextBlink = (Math.random() < 0.18) ? t + 360 : t + (calmB ? 2600 : 2000) + Math.random() * (calmB ? 3400 : 2800);
  }
  if (settingArea) drawSetArea();
}
