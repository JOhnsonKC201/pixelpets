// Overlay renderer, part: event wiring, the contact sheet and startup.
// The overlay is a set of classic scripts loaded in order by index.html. They
// share one global scope, so a name declared in an earlier part is visible here.

// Load-time registrations moved here from state.js: these hand callbacks to
// the main process and the browser, and a callback can run between two
// script loads, so they wait until every part of the overlay exists.
window.addEventListener('resize', repinFloor);
requestAnimationFrame(repinFloor);   // self-correct once the first frame's geometry is known

if (window.cat) {
  window.cat.onCursor((d) => { cursor.x = d.x; cursor.y = d.y; resumeRaf(); });
  if (window.cat.onKey) window.cat.onKey(() => { keyPulse = true; resumeRaf(); });
  if (window.cat.onAgent) window.cat.onAgent((s) => {
    // Map any agent verb to a reaction category (Claude Code/Codex/Cursor hooks can
    // send natural words like "editing", "testing", "error", "done").
    const v = String(s || 'idle').toLowerCase();
    const cat = /(done|stop|complete|finish|success)/.test(v) ? 'done'
      : /(error|fail|denied|blocked)/.test(v) ? 'error'
      : /(edit|writ|creat|refactor|test|build|compil|run|install|search|read|tool)/.test(v) ? 'working'
      : /(think|plan|prompt|start|busy)/.test(v) ? 'thinking'
      : 'idle';
    if (cat === 'done') {
      doneHopPending = true; doneIsAgent = true; agentState = 'idle'; energy = clamp(energy + 25, 0, 100);
      queueBubble({ text: 'Task complete!', ttl: 2600, sound: false, stretch: false });   // Comnyang-style done bubble
    }
    else if (cat === 'error') { errorPending = true; agentState = 'idle'; energy = clamp(energy + 30, 0, 100); }
    else if (cat === 'working') { agentState = 'working'; energy = clamp(energy + 8, 0, 100); }
    else if (cat === 'thinking') { agentState = 'thinking'; energy = clamp(energy + 6, 0, 100); }
    else agentState = 'idle';
    resumeRaf();
  });
  if (window.cat.onScroll) window.cat.onScroll((dir) => { scrollPulses++; if (typeof dir === 'number') scrollDirRaw = dir; resumeRaf(); });
  if (window.cat.onThemes) window.cat.onThemes((list) => { applyThemes(list); if (SHEET) renderSheet(); else resumeRaf(); });
  if (window.cat.onMood) window.cat.onMood((c) => {
    if (c === 'zoomies') energy = 96;
    else energy = 30;                     // calm down
    resumeRaf();
  });
  if (window.cat.onSetArea) window.cat.onSetArea(() => { settingArea = true; areaDragStart = null; areaRect = null; resumeRaf(); });
  if (window.cat.onConfig) window.cat.onConfig((c) => {
    if (!c) return;
    const prevSide = config ? config.restSide : null;
    const prevWork = config ? !!config.workMode : false;
    config = c;
    // Rest-side toggled live -> stroll over to the newly chosen home corner.
    if (prevSide !== null && prevSide !== c.restSide && !SHOT && !grabbing) {
      clearHomeAnchor();   // reaching for the corner setting is you saying "forget where I put it"; homeX() is a corner again from here
      const now = performance.now();
      roamFrom = { x: pos.x, y: pos.y };
      roamTo = { x: homeX(), y: floorLockOn() ? restingY() : pos.y };
      roamDur = 1400; roamUntil = now + roamDur; nextRoam = now + 12000;
    }
    // Work mode toggled on live -> walk over to the rest corner and hold there.
    if (!prevWork && c.workMode && !SHOT && !grabbing) {
      const now = performance.now();
      roamFrom = { x: pos.x, y: pos.y };
      roamTo = { x: homeX(), y: restingY() };
      roamDur = 1200; roamUntil = now + roamDur; nextRoam = now + 12000;
    }
    if (master) master.gain.value = volNow();
    // reconcile the Lobby Jam audio with the new config (covers settings, tray, auto-resume)
    const lj = (c.lobbyJam && typeof c.lobbyJam === 'object') ? c.lobbyJam : { on: false, mood: 'cozy' };
    // Music is a sound. Turning Sound off silenced every meow, purr and whoosh but
    // left the jam playing at full level, which is the loudest possible way to
    // ignore the one switch a user reaches for when they want quiet.
    const jamOn = !!lj.on && !!c.soundOn;
    if (jamOn && !jamRunning) { if (window.jamStart) window.jamStart(lj.mood); jamRunning = true; jamMoodCur = lj.mood; }
    else if (!jamOn && jamRunning) { if (window.jamStop) window.jamStop(); jamRunning = false; }
    else if (jamOn && jamRunning && lj.mood !== jamMoodCur) { if (window.jamSetMood) window.jamSetMood(lj.mood); jamMoodCur = lj.mood; }
    playArea = c.playArea || null;
    pos.x = zoneClampX(pos.x); pos.y = floorLockOn() ? restingY() : zoneClampY(pos.y); persistPos();
    // Species first: it rewrites the coat tables, so the coat index below must be
    // read against the NEW species' list, not the outgoing one.
    const wantSpecies = c.species === 'dog' ? 'dog' : 'cat';
    const wantCoat = wantSpecies === 'dog' ? c.dogPattern : c.pattern;
    if (wantSpecies !== species) {
      if (purring) { stopPurr(); purring = false; }   // the new species finds its own voice next frame
      setSpecies(wantSpecies, typeof wantCoat === 'number' ? wantCoat : null);
      if (!SHOT) { wagBoost = 1.0; stretchT0 = performance.now(); }   // the new pet says hello
    } else if (typeof wantCoat === 'number') {
      patternIndex = clamp(wantCoat, 0, PATTERNS.length - 1);
      localStorage.setItem(coatKey(species), String(patternIndex));
    }
    resumeRaf();
  });
  if (window.cat.onPower) window.cat.onPower((p) => { lowPower = !!(p && p.lowPower); resumeRaf(); });
  if (window.cat.onNotify) window.cat.onNotify((d) => triggerNotify(d));
  if (window.cat.onBreak) window.cat.onBreak((d) => triggerBreak(d));
  if (window.cat.onTreat) window.cat.onTreat(() => dropTreat());
  if (window.cat.onBall) window.cat.onBall(() => throwBall());
  if (window.cat.onAction) window.cat.onAction((id) => runAction(id));
  if (window.cat.onPomo) window.cat.onPomo((d) => { pomo = d || null; resumeRaf(); });
  if (window.cat.onFocus) window.cat.onFocus((d) => { focusBusy = !!(d && d.busy); resumeRaf(); });
  if (window.cat.onGeom) window.cat.onGeom((g) => {
    if (g && Number.isFinite(g.bottomInset)) geomBottomInset = g.bottomInset;
    if (g && Number.isFinite(g.bottomWorkY)) geomBottomWorkY = g.bottomWorkY;
    resize();   // geom accompanies the overlay reaching full size; refresh viewW/viewH before re-pinning
    if (typeof pos !== 'undefined' && pos && (pos.x < EDGE_L || pos.x > viewW - EDGE_R)) pos.x = homeX();   // a resolution/display change stranded the cat off-screen -> re-home
    repinFloor();   // settle onto the now-correct floor line (+ re-home to the corner during launch)
  });
}

function resumeRaf() { if (rafPaused) { rafPaused = false; lastDrawn = 0; requestAnimationFrame(draw); } }
function rectOf(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }
function finishSetArea(cancel) {
  let area = null;
  if (!cancel && areaRect && areaRect.w > 40 && areaRect.h > 40) {
    area = { x: areaRect.x / viewW, y: areaRect.y / viewH, w: areaRect.w / viewW, h: areaRect.h / viewH };
  }
  settingArea = false; areaDragStart = null; areaRect = null;
  if (window.cat && window.cat.setAreaDone) window.cat.setAreaDone(area);
}
function drawSetArea() {
  ctx.save();
  ctx.fillStyle = 'rgba(10,12,18,0.30)'; ctx.fillRect(0, 0, viewW, viewH);
  if (areaRect && areaRect.w > 2 && areaRect.h > 2) {
    ctx.clearRect(areaRect.x, areaRect.y, areaRect.w, areaRect.h);
    ctx.strokeStyle = '#e8943c'; ctx.lineWidth = 2; ctx.setLineDash([8, 5]);
    ctx.strokeRect(areaRect.x, areaRect.y, areaRect.w, areaRect.h); ctx.setLineDash([]);
  }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText("Drag to set the cat's play area  -  Esc or right-click to cancel", viewW / 2, 42);
  ctx.restore();
  wantHighFps = true;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (purring) { stopPurr(); purring = false; } }  // draw() won't run to stop it
  else resumeRaf();
});
// Contact-sheet QA mode: draw the grid, then export the canvas to main (which
// writes the PNG). Re-renders after themes/config arrive so custom coats appear.
function sheetPal(P) {
  return { O: toRgb(P.outline), C: toRgb(P.coat), K: toRgb(P.mark), W: toRgb(P.white), X: toRgb(P.patch), I: toRgb(P.inner), N: toRgb(P.nose), E: toRgb(P.eye), H: toRgb(HALO) };
}
function sheetSprite(pose, i) {
  if (pose === 'typing') return typeSprites[i] || typeSprites[0];
  if (pose === 'hunt') return spriteHunt;
  if (pose === 'loaf') return loafSprites[i] || loafSprites[0];
  return sprites[i] || sprites[0];   // sit
}
function renderSheet() {
  const poses = ['sit', 'typing', 'hunt', 'loaf'];
  const coats = PATTERNS;
  const cellW = 96, cellH = 92, labelW = 66, headH = 24;
  canvas.width = labelW + coats.length * cellW;
  canvas.height = headH + poses.length * cellH + 6;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#1d1f26'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#cfd3db'; ctx.font = 'bold 10px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'center';
  coats.forEach((P, i) => ctx.fillText(P.name.slice(0, 13), labelW + i * cellW + cellW / 2, headH / 2));
  poses.forEach((pose, r) => {
    const cy = headH + r * cellH;
    ctx.fillStyle = (r % 2) ? '#23262f' : '#1d1f26'; ctx.fillRect(0, cy, canvas.width, cellH);
    ctx.fillStyle = '#9aa0ad'; ctx.font = '11px "Segoe UI", system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(pose, 8, cy + cellH / 2);
    coats.forEach((P, i) => {
      const cx = labelW + i * cellW, sp = sheetSprite(pose, i), palRGB = sheetPal(P);
      octx.clearRect(0, 0, oc.width, oc.height);
      drawCat(octx, sp, 0, palRGB, { bob: 0, blinking: false, look: { x: 0, y: 0 }, eyeMode: 'open' });
      const sc = Math.min((cellW - 16) / sp.SW, (cellH - 16) / sp.SH);
      const dw = sp.SW * sc, dh = sp.SH * sc, dx = cx + (cellW - dw) / 2, dy = cy + (cellH - dh) / 2;
      ctx.drawImage(oc, 0, 0, sp.SW, sp.SH, dx, dy, dw, dh);
    });
  });
}

if (SHEET) {
  renderSheet();
  setTimeout(() => { renderSheet(); if (window.cat && window.cat.sheetImage) window.cat.sheetImage(canvas.toDataURL('image/png')); }, 700);
} else {
  requestAnimationFrame(draw);
}

// ---- input ------------------------------------------------------------------
window.addEventListener('mousemove', (e) => {
  cursor.x = e.clientX; cursor.y = e.clientY;
  if (settingArea && areaDragStart) areaRect = rectOf(areaDragStart, { x: e.clientX, y: e.clientY });
});
window.addEventListener('mousedown', (e) => {
  if (settingArea) { if (e.button !== 0) { finishSetArea(true); return; } areaDragStart = { x: e.clientX, y: e.clientY }; areaRect = null; resumeRaf(); return; }
  if (e.button !== 0) return;
  cursor.x = e.clientX; cursor.y = e.clientY;
  audio();                                // real gesture: unlock WebAudio for later meows
  huntUntil = 0; pouncing = false;        // grabbing cancels a hunt
  grabbing = true;
  downAt = performance.now(); downX = cursor.x; downY = cursor.y;
  sendHot(cursor.x - SW, cursor.y - SH, SW * 2, SH * 2, true);
});
window.addEventListener('mouseup', (e) => {
  if (settingArea) { if (areaDragStart) finishSetArea(false); return; }
  if (!grabbing) return;
  // Take the release point off the event, the way mousedown already does. `cursor` is also
  // written by main's polling loop, so it can be a tick stale, and a tick at the end of a
  // fast drag is a long way; this also sharpens the tap test on the next line.
  if (e && Number.isFinite(e.clientX)) { cursor.x = e.clientX; cursor.y = e.clientY; }
  grabbing = false;
  const tap = performance.now() - downAt < 220 && Math.hypot(cursor.x - downX, cursor.y - downY) < 6;
  if (tap) {
    petBurstUntil = performance.now() + 1200;   // happy eyes + hearts + chirp, stay put
    addEnergy(15);
    if (config && config.soundOn) playChirp();
    restSprings();
  } else {
    // Land on the pointer, not on head.x. head.x is an underdamped spring chasing the cursor
    // (HK/HD 0.45, damping ratio about 0.33), so it lags tens of pixels behind on a fast drag
    // across the screen and overshoots on a slow one: the cat used to land visibly short of
    // where you let go. The springs then ease the body onto the new pos over about half a
    // second, so the squash-and-bounce settle looks exactly as it always did.
    dropAt(cursor.x);
  }
  resumeRaf();
});
// Double-click opens Settings (Quit lives in the tray now).
window.addEventListener('dblclick', () => { audio(); if (window.cat && window.cat.openSettings) window.cat.openSettings(); });
window.addEventListener('keydown', (e) => { if (settingArea && e.key === 'Escape') finishSetArea(true); });
// Right-click cycles the coat. PATTERNS holds exactly the coats the ACTIVE species
// can wear (built-in breeds for a dog; built-in coats plus the custom ones for a
// cat), which is the same list main will accept back.
function cycleCoat() {
  patternIndex = (patternIndex + 1) % Math.max(1, PATTERNS.length);
  // Per-species key. This wrote to 'pattern' regardless of species, so cycling a
  // DOG's breed both lost the choice on the next launch (nothing updated
  // 'dogPattern') and stamped a breed index over the cat's stored coat, so
  // switching back to the cat brought back a coat the user never picked.
  localStorage.setItem(coatKey(species), String(patternIndex));   // fast local fallback
  if (window.cat && window.cat.setPattern) window.cat.setPattern(patternIndex); // sync tray + settings.json
  labelUntil = performance.now() + 1500;
}
// Right-click opens Quick Tools (the launcher window). Shift+right-click keeps the
// old coat cycle, and the tray's coat menu always works, so nothing is lost.
window.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const launcherOnRightClick = !(config && config.tools && config.tools.rightClick === false);
  if (launcherOnRightClick && !e.shiftKey && window.cat && window.cat.openLauncher) { window.cat.openLauncher(); return; }
  audio();
  cycleCoat();
});
