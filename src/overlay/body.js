// Overlay renderer, part: drawing the pet body.
// The overlay is a set of classic scripts loaded in order by index.html. They
// share one global scope, so a name declared in an earlier part is visible here.

// ---- draw the cat body into context g (local origin 0,0) -------------------
// the 'H' halo renders at reduced opacity so the outline reads as a soft glow rim
// rather than a hard bright sticker ring, while the dark 'O' outline stays crisp.
const HALO_ALPHA = 0.55;
function drawCat(g, sp, t, palRGB, o) {
  const { bob = 0, blinking = false, look = { x: 0, y: 0 }, typing = false, eyeMode = 'open', blush = false, dilate = 1 } = o;
  const closed = blinking || eyeMode === 'happy';
  const grid = sp.grid, COLS = sp.COLS, ROWS = sp.ROWS;
  // Within a row, the base color + shade factor `f` (and thus the fillStyle string) depend only
  // on the char, so compute each distinct char's fill ONCE per row instead of rebuilding the
  // color string for every column cell (~720 shadeStr builds/frame -> a handful). Output is
  // byte-identical (verified via the t=0 contact sheet).
  const rowFill = new Map();
  for (let r = 0; r < ROWS; r++) {
    rowFill.clear();
    for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c];
      if (ch === '.') continue;
      let style = rowFill.get(ch);
      if (style === undefined) {
        const base = ch === 'E' ? (closed ? palRGB.C : palRGB.E) : palRGB[ch];
        if (!base) { rowFill.set(ch, null); continue; }
        const isOut = ch === 'O';
        const f = BODY.has(ch) || (ch === 'E' && closed) ? Math.max(0.82, 1.12 - (r / ROWS) * 0.34)   // floor the body shade so dark coats don't sink into the outline
          : isOut ? 1.16 - (r / ROWS) * 0.30                                                            // rim-light: outline lit at the top, darker below
          : 1;
        style = f === 1 ? rgbStr(base) : shadeStr(base, f);
        rowFill.set(ch, style);
      } else if (style === null) continue;
      g.globalAlpha = ch === 'H' ? HALO_ALPHA * clamp(1.3 - (r / ROWS) * 0.7, 0.5, 1.4) : 1;          // halo glows from the top, fades along the bottom
      g.fillStyle = style;
      g.fillRect(c * CELL, r * CELL + bob, CELL, CELL);
    }
  }
  g.globalAlpha = 1;
  // A dog with cat whiskers reads as a cat wearing a dog costume, so the whisker
  // pass is skipped entirely and a panting tongue takes its place.
  if (o.panting) drawTongue(g, sp, bob, t, palRGB);
  if (!typing && !isDog()) {
    g.strokeStyle = 'rgba(245,245,245,0.6)'; g.lineWidth = 1; g.lineCap = 'round';
    const my = sp.muzzle.y + bob, cl = sp.muzzle.x - 4.5 * CELL, cr = sp.muzzle.x + 4.5 * CELL;
    // whiskers are alive: a slow waft plus a quick twitch every ~5s (t==0 on the
    // contact sheet => no offset, so QA frames stay byte-stable).
    const waft = Math.sin(t / 1400) * 0.6;
    const twitch = (t % 5200) < 200 ? Math.sin(t / 26) * 1.5 : 0;
    for (const [sx, dir] of [[cl, -1], [cr, 1]]) for (let i = 0; i < 3; i++) {
      const tipY = my + i * 5 - 1 + waft + twitch + Math.sin(t / 900 + i) * 0.5;
      g.beginPath(); g.moveTo(sx, my + i * 3 - 2); g.lineTo(sx + dir * 13, tipY); g.stroke();
    }
  }
  if (blush) {
    g.globalAlpha = 0.52; g.fillStyle = '#ffaab8';
    for (const e of sp.eyes) {
      if (e.w <= 0) continue;
      const bx = Math.round(e.cx - 2), by = Math.round(e.cy + e.h * 0.55 + bob);
      g.fillRect(bx, by, 5, 2); g.fillRect(bx + 1, by + 2, 3, 1);  // soft oval blush cluster
    }
    g.globalAlpha = 1;
  }
  if (eyeMode === 'happy') {
    // A closed lid IS fur, so the 'E' cells being painted in coat colour above is
    // correct - but that left the whole socket a bare coat-coloured ellipse with a
    // hairline on it, and on a mid-grey coat the face simply went blank. Give the
    // lid real weight and a lash tick at the outer corner so a closed eye still
    // reads as an eye at 4px-per-cell.
    g.strokeStyle = rgbStr(palRGB.O); g.lineWidth = 3; g.lineCap = 'round';
    for (const e of sp.eyes) {
      if (e.w <= 0) continue;
      const cy = e.cy + bob - 1, r = e.w * 0.54;
      g.beginPath(); g.arc(e.cx, cy, r, Math.PI * 0.12, Math.PI * 0.88); g.stroke();
      // lash: a short tick off the outer corner, away from the muzzle
      const dir = e.cx < sp.muzzle.x ? -1 : 1;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(e.cx + dir * r * 0.92, cy + r * 0.30);
      g.lineTo(e.cx + dir * (r * 1.35), cy + r * 0.02);
      g.stroke();
      g.lineWidth = 3;
    }
  } else if (!blinking) {
    const eLook = typing ? { x: look.x * 0.3, y: 0.85 } : look;
    for (const e of sp.eyes) {
      if (e.w <= 0) continue;                         // profile sprites have eyes on one side only
      const pw = Math.max(4, Math.round(e.w * 0.46 * dilate)), ph = Math.max(5, Math.round(e.h * 0.7 * Math.min(dilate, 1.12)));
      const cx = e.cx + eLook.x * (e.w * 0.30), cy = e.cy + eLook.y * (e.h * 0.26) + bob;
      const px = Math.round(cx - pw / 2), py = Math.round(cy - ph / 2);
      g.fillStyle = '#22242b';
      g.fillRect(px, py + 1, pw, ph - 2);          // tall body
      g.fillRect(px + 1, py, pw - 2, ph);          // rounded top/bottom -> oval-ish
      g.fillStyle = 'rgba(255,255,255,0.95)';
      g.fillRect(px + pw - 3, py + 1, 2, 2);        // bright sparkle (top-right)
      g.fillStyle = 'rgba(255,255,255,0.4)';
      g.fillRect(px + 1, py + ph - 3, 2, 2);        // soft glint (bottom-left)
    }
  }
}

// A lolling tongue under the muzzle. Dogs pant after exertion and when hot, and
// it is the single cheapest way to make the sprite read as happy rather than blank.
function drawTongue(g, sp, bob, t, palRGB) {
  const mx = sp.muzzle.x, my = sp.muzzle.y + bob;
  const lol = 3 + Math.sin(t / 260) * 1.6;             // the tongue bobs with the breath
  const w = 5, h = 4 + lol;
  g.fillStyle = 'rgb(90,32,40)';                        // dark rim so it reads on any coat
  g.fillRect(Math.round(mx - w / 2) - 1, Math.round(my + 2), w + 2, Math.round(h) + 1);
  g.fillStyle = (palRGB && palRGB.T) ? rgbStr(palRGB.T) : '#e8747f';
  g.fillRect(Math.round(mx - w / 2), Math.round(my + 2), w, Math.round(h));
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(Math.round(mx - 1), Math.round(my + 4), 1, Math.round(h) - 3);   // centre crease
}

// A dog's tail is a different instrument from a cat's: shorter, thicker, carried
// HIGH, and it wags from the base in a wide fast arc instead of the cat's slow
// rolling S. Shape varies by breed (curl / stub / plume / feather / straight),
// which is a big part of telling the breeds apart at this size.
const TAIL_SHAPE = {
  straight: { n: 8, len: 0.055, rest: [-0.55, -0.45, -0.36, -0.28, -0.22, -0.16, -0.10, -0.05], thick: 7, taper: 3.2 },
  feather:  { n: 9, len: 0.052, rest: [-0.70, -0.62, -0.55, -0.48, -0.42, -0.36, -0.30, -0.24, -0.18], thick: 9, taper: 4.6 },
  plume:    { n: 9, len: 0.050, rest: [-0.95, -0.88, -0.80, -0.72, -0.64, -0.56, -0.48, -0.40, -0.32], thick: 8.5, taper: 4.2 },
  curl:     { n: 9, len: 0.048, rest: [-1.30, -1.55, -1.85, -2.20, -2.60, -3.00, -3.40, -3.80, -4.15], thick: 7.5, taper: 3.4 },
  stub:     { n: 4, len: 0.045, rest: [-0.85, -0.70, -0.55, -0.42], thick: 8, taper: 3.0 },
};
function dogTailShape() { return TAIL_SHAPE[DOG_TAILS[patternIndex] || 'straight'] || TAIL_SHAPE.straight; }

function drawDogTail(footX, footY, t, pal, flickT0, petting, mood) {
  const S = dogTailShape();
  const baseX = footX + SW * 0.19, baseY = footY - SH * 0.30;
  const segLen = SH * S.len;
  const calm = !!(config && config.reducedMotion);
  // Wag rate and amplitude both ride the mood: a calm dog sways, an excited one
  // whips. `wagBoost` spikes on greetings, treats and a caught ball.
  const excite = clamp((mood || 0) + wagBoost + (petting ? 0.55 : 0), 0, 1.6);
  const rate = calm ? 620 : 260 - excite * 130;
  const amp = (calm ? 0.10 : 0.20 + excite * 0.34) * (petting ? 1.25 : 1);
  let flick = 0;
  if (flickT0 >= 0 && t - flickT0 < 650) { const e = (t - flickT0) / 650; flick = Math.sin(e * Math.PI * 4) * (1 - e) * 0.5; }
  const wag = Math.sin(t / rate) * amp + flick;
  const pts = [[baseX, baseY]];
  let x = baseX, y = baseY, dev = 0;
  for (let i = 0; i < S.n; i++) {
    const w = (i + 1) / S.n;
    dev += wag * w * w * 0.9;                       // the whole tail swings from the base
    const ang = S.rest[i] + dev;
    x += Math.cos(ang) * segLen;
    y = Math.min(y + Math.sin(ang) * segLen, footY - 2);
    pts.push([x, y]);
  }
  let reach = 0; for (const p of pts) reach = Math.max(reach, Math.abs(p[0] - baseX));
  if (reach > 52) { const f = 52 / reach; for (const p of pts) p[0] = baseX + (p[0] - baseX) * f; }
  const sm = [pts[0]]; let px = pts[0][0], py = pts[0][1];
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    for (let k = 1; k <= 4; k++) {
      const u = k / 4, v = 1 - u;
      sm.push([v * v * px + 2 * v * u * pts[i][0] + u * u * mx, v * v * py + 2 * v * u * pts[i][1] + u * u * my]);
    }
    px = mx; py = my;
  }
  sm.push(pts[pts.length - 1]);
  const n = sm.length - 1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const pass of [0, 1]) {
    for (let j = 0; j < n; j++) {
      const f = (j + 0.5) / n;
      ctx.strokeStyle = pass === 0 ? pal.O : (f > 0.80 ? pal.W : pal.C);
      ctx.lineWidth = S.thick - S.taper * f + (pass === 0 ? 3 : 0);
      ctx.beginPath(); ctx.moveTo(sm[j][0], sm[j][1]); ctx.lineTo(sm[j + 1][0], sm[j + 1][1]); ctx.stroke();
    }
  }
}

function drawSteam(t, headCx, earTop) {
  for (let i = 0; i < 4; i++) {
    const ph = (((t + i * 240) % 960) / 960), x = Math.round(headCx + (i - 1.5) * 9), y = Math.round(earTop - 3 - ph * 12), h = Math.max(2, Math.round(5 - ph * 2));
    ctx.globalAlpha = (1 - ph) * 0.95; ctx.fillStyle = i % 2 === 0 ? '#ffd9de' : '#f4f0f2'; ctx.fillRect(x, y, 2, h);
  }
  const pph = ((t % 1100) / 1100); ctx.globalAlpha = (1 - pph) * 0.9; ctx.fillStyle = '#ffe2e6';
  const psz = Math.round(3 + pph * 3); ctx.fillRect(Math.round(headCx - psz / 2), Math.round(earTop - 6 - pph * 10), psz, psz);
  ctx.globalAlpha = 1;
}
function drawShadow(cx, cy, alpha, rx) {
  ctx.fillStyle = `rgba(0,0,0,${alpha})`; ctx.beginPath(); ctx.ellipse(cx, cy + 2, rx || 24, 5, 0, 0, Math.PI * 2); ctx.fill();
}
// A big keyboard key the cat presses; `lit` = currently pressed (lights up, glows,
// sinks); `label` is the letter on the cap (home-row F / J). Reads on any backdrop.
function drawKey(cx, topY, w, h, lit, label) {
  const x0 = Math.round(cx - w / 2), y = Math.round(topY);
  ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(cx, y + h + 4, w / 2 + 2, 4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#565c6a'; ctx.fillRect(x0, y + h - 3, w, 7);                      // front/side
  ctx.fillStyle = lit ? '#f2f4f8' : '#cfd3da'; ctx.fillRect(x0, y, w, h - 2);        // top face (brightens a touch on press)
  ctx.fillStyle = lit ? '#ffffff' : '#e7eaef'; ctx.fillRect(x0 + 2, y, w - 4, 3);    // highlight
  ctx.fillStyle = '#3a3f48';                                                         // dark edges
  ctx.fillRect(x0 - 1, y, 1, h + 4); ctx.fillRect(x0 + w, y, 1, h + 4); ctx.fillRect(x0, y - 1, w, 1);
  if (label) {                                                                       // letter on the keycap
    ctx.fillStyle = lit ? '#1b6cff' : '#6b7280';
    ctx.font = `bold ${Math.round(h * 0.78)}px "Consolas", "SF Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, y + (h - 2) / 2 + 0.5);
    ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic';
  }
}
// The two forelegs the profile cat taps with - drawn live (NOT baked into the
// sprite) so the paws lift and strike. They reach forward-right from the chest
// (shX, shY) onto the two keys; two-tone (outline + coat) so they read on any coat.
// The cat's forelegs in true PIXEL-SPRITE style (like the Comnyang reference):
// chunky grid-aligned columns with the same dark outline as the body - no smooth
// vector curves. Each leg hops on/off its key in whole-pixel steps like real
// sprite animation; the paw is a white pixel mitt with a toe split, and square
// pink toe beans flash on the underside while a paw is lifted.
function drawKneadPaws(palRGB, lcx, rcx, keyTop, lp, rp, shY) {
  const O = rgbStr(palRGB.O), C = rgbStr(palRGB.C), W = rgbStr(palRGB.W);
  const rect = (x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  const paw = (kx, side, press) => {
    const lift = Math.round((1 - press) * 2) * 2.5;   // stepped 0 / 2.5 / 5 px sprite-style lift
    const out = lift >= 2 ? side * 2 : 0;             // lifted paw steps a hair outward (off the bib)
    const cx = kx + out;
    const capTop = keyTop + Math.round(press * 3);    // the key sinks as it's pressed
    const pwW = 13, pwH = 7;                          // paw block
    const pY = capTop - pwH + 2 - lift;               // paw rides the cap, hops up on the lift
    const pX = cx - pwW / 2;
    const ax = cx - side * 2 - 6, aw = 11;            // leg column, a touch inboard of its key
    const top = Math.round(shY), aH = pY - top + 3;
    // leg: outline slab + flat fur core - same blocky look as the body sprite
    rect(ax, top, aw, aH, O);
    rect(ax + 2.5, top, aw - 5, aH, C);
    // paw: outlined white pixel mitt
    rect(pX - 2, pY - 2, pwW + 4, pwH + 4, O);
    rect(pX, pY, pwW, pwH, W);
    if (lift >= 2) {                                  // lifted: underside shows square toe beans
      rect(cx - 3, pY + 3.5, 6, 3, '#ff8fa3');        // big pad
      rect(cx - 6.5, pY + 0.5, 3, 3, '#ff8fa3'); rect(cx - 1.5, pY, 3, 3, '#ff8fa3'); rect(cx + 3.5, pY + 0.5, 3, 3, '#ff8fa3');  // three toes
    } else {
      rect(cx - 1, pY + 2, 2, pwH - 2, O);            // planted: toe split down the mitt
    }
  };
  paw(lcx, -1, lp);   // left leg onto the left key
  paw(rcx, 1, rp);    // right leg onto the right key
}
// Front-facing "keyboard kneading" (Comnyang-style): the cat faces the viewer,
// leaning over two big keycaps, typing with its own arms. The animation is
// designed, not just oscillated: a snappy strike (eased), the body DIPS into
// each press and LEANS toward the striking paw, the eyes track the active paw,
// and every ~4.5s it plants BOTH paws for a happy double-press beat.
function renderTypeFront(t, palRGB, pal, overheat, blinking, look) {
  const sp = overheat ? 36 : 60;                                   // knead tempo
  const wave = Math.sin(t / sp);
  const snap = (v) => Math.pow(Math.max(0, v), 0.6);               // fast strike, soft lift
  const cyc = t % 4500, both = cyc > 3900 ? Math.sin(((cyc - 3900) / 600) * Math.PI) : 0;
  const lp = Math.max(snap(wave), both), rp = Math.max(snap(-wave), both);
  const dip = (lp + rp) * 1.6;                                     // body sinks into each press
  const leanA = (rp - lp) * 0.05 * (1 - both);                     // ...and tilts toward the striking paw
  const oy = Math.round(pos.y - TH);
  drawShadow(pos.x, pos.y, 0.18, 36);
  // ---- the cat: motion lives in ONE transform (pivot at the feet) so the body
  // weight-shifts smoothly instead of jittering by rounded pixel offsets.
  const typeSp = typeSprites[patternIndex];
  octx.clearRect(0, 0, oc.width, oc.height);
  drawCat(octx, typeSp, t, palRGB, { bob: 0, blinking, look: { x: (rp - lp) * 0.5, y: 0.6 } });
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(leanA);
  ctx.drawImage(oc, 0, 0, TW, TH, -TW / 2, -TH + dip, TW, TH);
  ctx.restore();
  // ---- two big blank keycaps, each pressed by its own arm ----
  const lcx = pos.x - 15, rcx = pos.x + 15, keyTop = pos.y - 12;
  drawKey(lcx, keyTop + Math.round(lp * 3), 24, 11, lp > 0.6);
  drawKey(rcx, keyTop + Math.round(rp * 3), 24, 11, rp > 0.6);
  drawKneadPaws(palRGB, lcx, rcx, keyTop, lp, rp, pos.y - 29 + dip);
  if (overheat) drawSteam(t, pos.x, oy + 2 * CELL);
}
// Rear up on the haunches and BAT at the butterfly overhead with both front paws.
// The reared body brings the chest up near the bug, so the live paws only reach a
// short, natural distance (no rubber-arm). A near-miss sends the butterfly darting.
// Rear up on the haunches and swipe overhead with alternating paws.
//
// Two things drive this now: the butterfly, and the leaf that streaks past while
// you scroll. Pass o.tgtX / o.tgtY to aim it at something other than the bug, and
// o.swingT0 to run the swipe on your own clock. Returns how far through the strike
// this frame is, so a caller driving its own target can do its own hit test.
function renderRearBat(t, palRGB, blinking, o) {
  o = o || {};
  const aimed = o.tgtX != null;
  const oy = Math.round(pos.y - SH);
  const hasBug = bfOn && bfMode !== 'out';
  const tgtX = aimed ? o.tgtX : (hasBug ? bfX : pos.x);   // horizontal aim (or straight up in a --shot)
  // Which paw is mid-swipe. Both the pose and the near-miss check below read this,
  // so the strike and the hit can never land on different beats.
  const swing = (t - (o.swingT0 != null ? o.swingT0 : bfSwatT0)) / 130;                // quick swipe tempo
  const left = Math.max(0, Math.sin(swing)), right = Math.max(0, Math.sin(swing + Math.PI));
  const topPh = Math.max(left, right);
  // One whoosh per swipe, not per frame. Each half-period of the swing is one
  // stroke, so the stroke index changing IS a new swipe starting - and the start
  // is the right moment for it, because that is when the paw is accelerating.
  const stroke = Math.floor(swing / Math.PI);
  if (stroke !== lastSwipeStroke) {
    lastSwipeStroke = stroke;
    if (config && config.soundOn && t > nextSwipeSound) { nextSwipeSound = t + 900; playSwipe(o.strength == null ? 1 : o.strength); }
  }
  const sp = batSpriteFor(patternIndex, left >= right ? -1 : 1, topPh);
  // The body rises on its haunches with the reaching paw. Render-only: pos, the
  // near-miss test below and the hot region all stay where they were.
  const lift = o.lift ? Math.round(topPh * o.lift) : 0;
  drawShadow(pos.x, pos.y, 0.2, 34);
  octx.clearRect(0, 0, oc.width, oc.height);
  drawCat(octx, sp, t, palRGB, { bob: 0, blinking, look: { x: clamp((tgtX - pos.x) / 160, -1, 1),
    y: aimed ? clamp((o.tgtY - (pos.y - SH)) / 110, -1, 1) : -0.75 } });   // eyes follow the target (the bug tips them up)
  ctx.save();
  ctx.translate(pos.x, pos.y - lift);
  ctx.rotate(clamp((tgtX - pos.x) / 520, -0.08, 0.08));         // lean toward the bug
  ctx.drawImage(oc, 0, 0, SW, BAT_H, -SW / 2, -BAT_H, SW, BAT_H);
  ctx.restore();
  // near-miss: when a paw strikes up near the bug it startles and darts off (hit-cooldown)
  if (!aimed && hasBug && topPh > 0.7 && Math.hypot(bfX - pos.x, bfY - (oy - 2)) < 50 && t > bfBatHit && bfMode !== 'dodge' && bfMode !== 'held') {
    bfBatHit = t + 220; bfMode = 'dodge'; bfDodgeUntil = t + 360; wagBoost = Math.max(wagBoost, 0.5);
    const aw = Math.atan2(bfY - pos.y, bfX - pos.x) + (Math.random() - 0.5); bfVx = Math.cos(aw) * 9; bfVy = Math.sin(aw) * 9;
    if (!lowPower) idleSparkles.push({ x: bfX, y: bfY, t0: t });
  }
  return topPh;
}
// Animated tail: rests low behind the haunch, lies along the ground sweeping
// right, then the last segments curl gently up. Tapers from a thick base to a
// pale rounded tip; flicks on idle actions and wags faster while petted.
// Drawn behind the body so its root tucks under.
function drawTail(footX, footY, t, pal, flickT0, petting, excite) {
  const baseX = footX + SW * 0.20, baseY = footY - SH * 0.22, segLen = SH * 0.052;
  // Rest pose per segment (rad): dive down behind the haunch, level out along
  // the ground, then curl the tip up. (+y is down on canvas.)
  const REST = [1.30, 1.10, 0.85, 0.55, 0.28, 0.08, -0.05, -0.45, -0.85, -1.20];
  let flick = 0;
  if (flickT0 >= 0 && t - flickT0 < 650) { const e = (t - flickT0) / 650; flick = Math.sin(e * Math.PI * 3) * (1 - e) * 0.45; }
  // Excitement (0..1: wagBoost, plus a butterfly in play) is an ADDED quicker sway, the
  // way the petting term is, never a change to the base rate: sin(t / rate) with a rate
  // that decays frame by frame jumps phase at large t and reads as a twitch.
  const calm = !!(config && config.reducedMotion);   // gentler resting sway in Calm mode, and no excitement on top
  const ex = calm ? 0 : clamp(excite || 0, 0, 1);
  const wag = Math.sin(t / 540) * (calm ? 0.07 : 0.12 + ex * 0.06) + (petting ? Math.sin(t / 120) * 0.08 : 0) + ex * Math.sin(t / 170) * 0.10;
  const pts = [[baseX, baseY]];
  let x = baseX, y = baseY, dev = 0;
  for (let i = 0; i < REST.length; i++) {
    const w = (i + 1) / REST.length;                       // tip sways most; base barely moves
    dev += (wag + flick) * w * w + Math.sin(t / 430 + i * 0.6) * 0.03 * w;
    const ang = REST[i] - dev;
    x += Math.cos(ang) * segLen;
    y = Math.min(y + Math.sin(ang) * segLen, footY - 2.5); // the ground stops the tail
    pts.push([x, y]);
  }
  // Screen-edge budget: never sweep further right than EDGE_R allows for.
  let reach = 0; for (const p of pts) reach = Math.max(reach, p[0] - baseX);
  if (reach > 56) { const f = 56 / reach; for (const p of pts) p[0] = baseX + (p[0] - baseX) * f; }
  // Densify with quadratics through segment midpoints so the tapered
  // per-piece strokes show no corners.
  const sm = [pts[0]]; let px = pts[0][0], py = pts[0][1];
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2;
    for (let k = 1; k <= 4; k++) {
      const u = k / 4, v = 1 - u;
      sm.push([v * v * px + 2 * v * u * pts[i][0] + u * u * mx,
               v * v * py + 2 * v * u * pts[i][1] + u * u * my]);
    }
    px = mx; py = my;
  }
  sm.push(pts[pts.length - 1]);
  // Two tapered passes: outline stays ~3px proud of the coat at every piece so
  // the sticker halo survives; the last stretch of coat is pale (dipped tip).
  const n = sm.length - 1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const pass of [0, 1]) {
    for (let j = 0; j < n; j++) {
      const s = (j + 0.5) / n;                             // 0 at base -> 1 at tip
      ctx.strokeStyle = pass === 0 ? pal.O : (s > 0.82 ? pal.W : pal.C);
      ctx.lineWidth = 7 - 4 * s + (pass === 0 ? 3 : 0);    // coat 7 -> 3, outline +3
      ctx.beginPath(); ctx.moveTo(sm[j][0], sm[j][1]); ctx.lineTo(sm[j + 1][0], sm[j + 1][1]); ctx.stroke();
    }
  }
}
// Head status indicators + heart live in effects.js (loaded before this script):
// drawThinkBubble / drawWorkBubble / drawDoneSpark / drawHeart.
let lastHot = null;
function sendHot(x, y, w, h, dragging) {
  if (SHOT || !window.cat) return;
  const o = { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), dragging };
  if (lastHot && lastHot.dragging === o.dragging && Math.abs(lastHot.x - o.x) < 4 && Math.abs(lastHot.y - o.y) < 4 && Math.abs(lastHot.w - o.w) < 4 && Math.abs(lastHot.h - o.h) < 4) return;
  lastHot = o; window.cat.setHot(o);
}
