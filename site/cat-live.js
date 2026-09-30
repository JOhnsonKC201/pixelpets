/* cat-live.js - a live, interactive pixel cat for the marketing site.
 *
 * Drives a single <canvas> with the real desktop-pet sprite geometry (from
 * cat-sprite.js, the single source of truth) and the cat's full repertoire,
 * re-creating the desktop triggers in the browser:
 *   - watch-the-cursor (eye/head follow), breathe, blink, tail flick   (always)
 *   - click  -> meow + hearts + nuzzle + cycle coat
 *   - type() -> keyboard-knead pose; fast typing overheats (red + steam)
 *   - climb(dir) -> hand-over-hand rope climb up/down
 *   - idle   -> auto-cycles a showcase reel: hunt / stretch / zoomies / groom / loaf
 * A caption callback names the live behaviour for the page to display.
 *
 * The animated paint functions are ported from src/overlay/ (pure canvas, no
 * Electron). Depends on cat-sprite.js globals: CELL, BODY, buildSprite, composeSit,
 * composeLoaf, PATTERNS, BUILDS, PATTERN_BUILD, TABBY, toRgb, rgbStr, shadeStr, HALO,
 * plus the grid primitives ellipse/triangle/setCell/G used by the composers below.
 */
(function () {
  'use strict';

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  // ---- pose composers ported from the overlay (use cat-sprite.js grid globals) --

  function composeHunt() {
    const CX = 15;
    ellipse(CX, 12, 11, 5.4, 'C');
    ellipse(CX, 8, 6.2, 5, 'C');
    triangle(9, 4, 6, 8, 13, 7, 'K'); triangle(21, 4, 17, 7, 24, 8, 'K');
    triangle(9, 5, 8, 8, 12, 7, 'I'); triangle(21, 5, 18, 7, 22, 8, 'I');
    [[26, 13], [27, 11]].forEach(([c, r]) => ellipse(c, r, 1.6, 1.6, 'C'));
    ellipse(CX, 12, 2.6, 1.7, 'W', ['C']);
    ellipse(CX, 15, 3.2, 2.4, 'W', ['C']);
    ellipse(13, 17, 1.8, 1.5, 'W', ['C']); ellipse(17, 17, 1.8, 1.5, 'W', ['C']);
    ellipse(27, 11, 1.2, 1.2, 'W', ['C']);
    ellipse(12, 8, 2.2, 2.4, 'E'); ellipse(18, 8, 2.2, 2.4, 'E');
    setCell(15, 11, 'N'); setCell(14, 11, 'N');
    [[13, 5], [14, 6], [15, 5], [16, 6], [17, 5]].forEach(([c, r]) => { if (G[r][c] === 'C') setCell(c, r, 'K'); });
    for (let r = 10; r < 16; r += 2) for (let c = 4; c < GC; c++) if (G[r][c] === 'C' && c % 2 === 0) G[r][c] = 'K';
    ellipse(9, 12, 2.4, 2.4, 'X', ['C', 'K']); ellipse(21, 13, 2.2, 2.2, 'X', ['C', 'K']);
  }

  function composeTypeFront(B) {
    B = B || {};
    const CX = 12, fluff = !!B.fluff;
    // tail sweeps low to the right (a resting tail) - NOT curled up beside the chest,
    // where its pale tip used to read as a third, raised paw.
    [[20.5, 20.4], [22.2, 20.9], [23.2, 21.8], [22.6, 22.8]].forEach(([c, r]) => ellipse(c, r, 1.5, 1.5, 'C'));
    ellipse(21.8, 23.2, 1.0, 1.0, 'W', ['C']);
    ellipse(CX, 16, 6.0, 5.4, 'C');
    ellipse(6.6, 20.2, 3.4, 3.2, 'C');
    ellipse(17.4, 20.2, 3.4, 3.2, 'C');
    ellipse(CX, 8.5, 6.3, 5.6, 'C');
    if (fluff) { ellipse(5.6, 10.8, 1.9, 2.3, 'C'); ellipse(18.4, 10.8, 1.9, 2.3, 'C'); }
    triangle(CX - 4.5, 1.2, CX - 6.4, 6.8, CX - 1.8, 5.6, 'K');
    triangle(CX + 4.5, 1.2, CX + 6.4, 6.8, CX + 1.8, 5.6, 'K');
    triangle(CX - 4.3, 3.0, CX - 5.4, 6.3, CX - 2.8, 5.6, 'I');
    triangle(CX + 4.3, 3.0, CX + 5.4, 6.3, CX + 2.8, 5.6, 'I');
    if (fluff) { ellipse(CX - 4.5, 5.6, 0.9, 1.3, 'W', ['C', 'K']); ellipse(CX + 4.5, 5.6, 0.9, 1.3, 'W', ['C', 'K']); }
    ellipse(9, 8.7, 2.0, 2.4, 'E'); ellipse(15, 8.7, 2.0, 2.4, 'E');
    ellipse(CX, 12.2, 3, 2, 'W', ['C']);
    setCell(12, 11, 'N'); setCell(11, 11, 'N');
    ellipse(CX, 17.8, 2.1, 3.2, 'W', ['C']);
    if (B.tabby) {
      [[11, 5], [12, 6], [13, 5]].forEach(([c, r]) => { if (G[r] && G[r][c] === 'C') setCell(c, r, 'K'); });
      for (let r = 13; r < 22; r += 2) for (let c = 3; c < 21; c++) if (G[r] && G[r][c] === 'C' && c % 2 === 0) setCell(c, r, 'K');
    }
    ellipse(7.5, 17.5, 2.2, 2.6, 'X', ['C', 'K']);
    ellipse(16.5, 20, 2.0, 2.0, 'X', ['C', 'K']);
  }

  // ---- ported paint functions (ctx passed explicitly as `g`) -----------------

  const HALO_ALPHA = 0.55;
  // Frame clock the live hero shares with drawCat's whiskers; the render loop sets it
  // to the frame time and the static/reduced-motion frame pins it to 0 (whiskers at rest).
  let whiskT = 0;

  function drawCat(g, sp, palRGB, o) {
    const { bob = 0, blinking = false, look = { x: 0, y: 0 }, eyeMode = 'open', blush = false, dilate = 1, eyeSquint = 0 } = o;
    const closed = blinking || eyeMode === 'happy';
    const grid = sp.grid, COLS = sp.COLS, ROWS = sp.ROWS;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c];
      if (ch === '.') continue;
      const base = ch === 'E' ? (closed ? palRGB.C : palRGB.E) : palRGB[ch];
      if (!base) continue;
      const f = BODY.has(ch) || (ch === 'E' && closed) ? Math.max(0.82, 1.12 - (r / ROWS) * 0.34)   // floor the body shade so dark coats don't sink into the outline
        : ch === 'O' ? 1.16 - (r / ROWS) * 0.30                                                      // rim-light: outline lit at the top, grounded below
        : 1;
      g.globalAlpha = ch === 'H' ? HALO_ALPHA * clamp(1.3 - (r / ROWS) * 0.7, 0.5, 1.4) : 1;          // halo glows from the top, fades along the bottom
      g.fillStyle = f === 1 ? rgbStr(base) : shadeStr(base, f);
      g.fillRect(c * CELL, r * CELL + bob, CELL, CELL);
    }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(245,245,245,0.6)'; g.lineWidth = 1; g.lineCap = 'round';
    const my = sp.muzzle.y + bob, cl = sp.muzzle.x - 4.5 * CELL, cr = sp.muzzle.x + 4.5 * CELL;
    // living whiskers: a slow waft plus a quick twitch every ~5s (whiskT==0 => at rest)
    const waft = Math.sin(whiskT / 1400) * 0.6;
    const twitch = (whiskT % 5200) < 200 ? Math.sin(whiskT / 26) * 1.5 : 0;
    for (const [sx, dir] of [[cl, -1], [cr, 1]]) for (let i = 0; i < 3; i++) {
      const tipY = my + i * 5 - 1 + waft + twitch + Math.sin(whiskT / 900 + i) * 0.5;
      g.beginPath(); g.moveTo(sx, my + i * 3 - 2); g.lineTo(sx + dir * 13, tipY); g.stroke();
    }
    if (blush) {
      g.globalAlpha = 0.52; g.fillStyle = '#ffaab8';
      for (const e of sp.eyes) {
        if (e.w <= 0) continue;
        const bx = Math.round(e.cx - 2), by = Math.round(e.cy + e.h * 0.55 + bob);
        g.fillRect(bx, by, 5, 2); g.fillRect(bx + 1, by + 2, 3, 1);
      }
      g.globalAlpha = 1;
    }
    if (eyeMode === 'happy') {
      g.strokeStyle = rgbStr(palRGB.O); g.lineWidth = 2; g.lineCap = 'round';
      for (const e of sp.eyes) {
        if (e.w <= 0) continue;
        const ay = e.cy + bob - 1 + eyeSquint * (e.h * 0.45);   // lid droops + flattens on a slow blink
        g.beginPath(); g.arc(e.cx, ay, e.w * 0.5, Math.PI * (0.15 + eyeSquint * 0.1), Math.PI * (0.85 - eyeSquint * 0.55)); g.stroke();
      }
    } else if (!blinking) {
      for (const e of sp.eyes) {
        if (e.w <= 0) continue;
        const pw = Math.max(4, Math.round(e.w * 0.46 * dilate)), ph = Math.max(5, Math.round(e.h * 0.7 * Math.min(dilate, 1.12)));
        const cx = e.cx + look.x * (e.w * 0.30), cy = e.cy + look.y * (e.h * 0.26) + bob;
        const px = Math.round(cx - pw / 2), py = Math.round(cy - ph / 2);
        g.fillStyle = '#22242b';
        g.fillRect(px, py + 1, pw, ph - 2);
        g.fillRect(px + 1, py, pw - 2, ph);
        g.fillStyle = 'rgba(255,255,255,0.95)';
        g.fillRect(px + pw - 3, py + 1, 2, 2);
        g.fillStyle = 'rgba(255,255,255,0.4)';
        g.fillRect(px + 1, py + ph - 3, 2, 2);
      }
    }
  }

  function drawTail(g, footX, footY, t, pal, flickT0, petting, SW, SH, huntAmt) {
    const baseX = footX + SW * 0.20, baseY = footY - SH * 0.22, segLen = SH * 0.052;
    const REST = [1.30, 1.10, 0.85, 0.55, 0.28, 0.08, -0.05, -0.45, -0.85, -1.20];
    let flick = 0;
    if (flickT0 >= 0 && t - flickT0 < 650) { const e = (t - flickT0) / 650; flick = Math.sin(e * Math.PI * 3) * (1 - e) * 0.45; }
    const wag = Math.sin(t / 540) * 0.12 + (petting ? Math.sin(t / 120) * 0.08 : 0);
    const pts = [[baseX, baseY]];
    let x = baseX, y = baseY, dev = 0;
    for (let i = 0; i < REST.length; i++) {
      const w = (i + 1) / REST.length;
      dev += (wag + flick) * w * w + Math.sin(t / 430 + i * 0.6) * 0.03 * w;
      if (huntAmt) dev += Math.sin(t / 52 + i) * 0.06 * huntAmt * w * w;   // tip stutters when prey is near
      const ang = REST[i] - dev;
      x += Math.cos(ang) * segLen;
      y = Math.min(y + Math.sin(ang) * segLen, footY - 2.5);
      pts.push([x, y]);
    }
    let reach = 0; for (const p of pts) reach = Math.max(reach, p[0] - baseX);
    if (reach > 56) { const f = 56 / reach; for (const p of pts) p[0] = baseX + (p[0] - baseX) * f; }
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
    const n = sm.length - 1;
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const pass of [0, 1]) {
      for (let j = 0; j < n; j++) {
        const s = (j + 0.5) / n;
        g.strokeStyle = pass === 0 ? pal.O : (s > 0.82 ? pal.W : pal.C);
        g.lineWidth = 7 - 4 * s + (pass === 0 ? 3 : 0);
        g.beginPath(); g.moveTo(sm[j][0], sm[j][1]); g.lineTo(sm[j + 1][0], sm[j + 1][1]); g.stroke();
      }
    }
  }

  function drawShadow(g, cx, cy, alpha, rx) {
    g.fillStyle = `rgba(0,0,0,${alpha})`; g.beginPath(); g.ellipse(cx, cy + 2, rx || 24, 5, 0, 0, Math.PI * 2); g.fill();
  }

  function drawGroom(g, palRGB, cx, faceY, t) {
    const O = rgbStr(palRGB.O), C = rgbStr(palRGB.C), W = rgbStr(palRGB.W);
    const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    const CYCLE = 2400;
    const c = (t % CYCLE) / CYCLE;
    let lift = c < 0.16 ? c / 0.16 : c > 0.80 ? (1 - c) / 0.20 : 1;
    lift = Math.max(0, Math.min(1, lift));
    lift = lift * lift * (3 - 2 * lift);
    const licking = c > 0.16 && c < 0.80;
    const lick = licking ? (Math.sin(t / 90) + 1) / 2 : 0;
    const shY = faceY + 32;
    const pawX = cx - 2, pawY = faceY + 12 - lift * 11 + lick * 1.2;
    const pwW = 13, pwH = 7;
    const pY = Math.round(pawY - pwH / 2);
    const aw = 10, ax = Math.round(pawX - aw / 2);
    const aTop = pY + pwH;
    const aH = Math.max(0, Math.round(shY) - aTop);
    if (aH > 0) { rect(ax, aTop, aw, aH, O); rect(ax + 2, aTop, aw - 4, aH, C); }
    rect(pawX - pwW / 2 - 2, pY - 2, pwW + 4, pwH + 4, O);
    rect(pawX - pwW / 2, pY, pwW, pwH, W);
    if (lift > 0.6) {
      rect(pawX - 3, pY + 3.5, 6, 3, '#ff8fa3');
      rect(pawX - 6.5, pY + 0.5, 3, 3, '#ff8fa3'); rect(pawX + 3.5, pY + 0.5, 3, 3, '#ff8fa3');
    } else {
      rect(pawX - 1, pY + 2, 2, pwH - 2, O);
    }
    if (licking) {
      g.globalAlpha = 0.45 + lick * 0.55;
      const th = 2 + Math.round(lick * 3);
      rect(pawX - 2, pY + pwH - 1, 4, th, '#ff9aa8');
      rect(pawX - 1, pY + pwH - 1 + th, 2, 1, '#ff8090');
      g.globalAlpha = 1;
    }
  }

  function drawSteam(g, t, headCx, earTop) {
    for (let i = 0; i < 4; i++) {
      const ph = (((t + i * 240) % 960) / 960), x = Math.round(headCx + (i - 1.5) * 9), y = Math.round(earTop - 3 - ph * 12), h = Math.max(2, Math.round(5 - ph * 2));
      g.globalAlpha = (1 - ph) * 0.95; g.fillStyle = i % 2 === 0 ? '#ffd9de' : '#f4f0f2'; g.fillRect(x, y, 2, h);
    }
    const pph = ((t % 1100) / 1100); g.globalAlpha = (1 - pph) * 0.9; g.fillStyle = '#ffe2e6';
    const psz = Math.round(3 + pph * 3); g.fillRect(Math.round(headCx - psz / 2), Math.round(earTop - 6 - pph * 10), psz, psz);
    g.globalAlpha = 1;
  }

  function drawKey(g, cx, topY, w, h, lit, label) {
    const x0 = Math.round(cx - w / 2), y = Math.round(topY);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.beginPath(); g.ellipse(cx, y + h + 4, w / 2 + 2, 4, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#565c6a'; g.fillRect(x0, y + h - 3, w, 7);
    g.fillStyle = lit ? '#f2f4f8' : '#cfd3da'; g.fillRect(x0, y, w, h - 2);
    g.fillStyle = lit ? '#ffffff' : '#e7eaef'; g.fillRect(x0 + 2, y, w - 4, 3);
    g.fillStyle = '#3a3f48';
    g.fillRect(x0 - 1, y, 1, h + 4); g.fillRect(x0 + w, y, 1, h + 4); g.fillRect(x0, y - 1, w, 1);
  }

  function drawKneadPaws(g, palRGB, lcx, rcx, keyTop, lp, rp, shY) {
    const O = rgbStr(palRGB.O), C = rgbStr(palRGB.C), W = rgbStr(palRGB.W), H = rgbStr(palRGB.H);
    const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    const paw = (kx, side, press) => {
      const lift = Math.round((1 - press) * 2) * 2.5;
      const out = lift >= 2 ? side * 2 : 0;
      const cx = kx + out;
      const capTop = keyTop + Math.round(press * 3);
      const pwW = 13, pwH = 7;
      const pY = capTop - pwH + 2 - lift;
      const pX = cx - pwW / 2;
      const ax = cx - side * 2 - 6, aw = 11;
      const top = Math.round(shY), aH = pY - top + 3;
      rect(ax - 1, top - 1, aw + 2, aH + 1, H);   // pale halo: legs read on dark coats too
      rect(ax, top, aw, aH, O);
      rect(ax + 2.5, top, aw - 5, aH, C);
      rect(pX - 3, pY - 3, pwW + 6, pwH + 6, H);   // paw halo
      rect(pX - 2, pY - 2, pwW + 4, pwH + 4, O);
      rect(pX, pY, pwW, pwH, W);
      if (lift >= 2) {
        rect(cx - 3, pY + 3.5, 6, 3, '#ff8fa3');
        rect(cx - 6.5, pY + 0.5, 3, 3, '#ff8fa3'); rect(cx - 1.5, pY, 3, 3, '#ff8fa3'); rect(cx + 3.5, pY + 0.5, 3, 3, '#ff8fa3');
      } else {
        rect(cx - 1, pY + 2, 2, pwH - 2, O);
      }
    };
    paw(lcx, -1, lp);
    paw(rcx, 1, rp);
  }

  // `s` scales the whole ball (default 1 = the climb-rope ground ball); the GIFT pose passes a
  // larger size so the "present" reads as a real prop, not a speck.
  function drawYarnBall(g, cx, cy, s) {
    s = s || 1;
    const YARN_OUT = '#c8455a', YARN_DK = '#e0556e', YARN_MID = '#f2697f', YARN_LT = '#ff8fa3', YARN_HI = '#ffd0d8';
    const R = 12 * s, bx = Math.round(cx), by = Math.round(cy);
    g.fillStyle = YARN_MID; g.beginPath(); g.ellipse(bx, by, R, R, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = YARN_DK; g.beginPath(); g.ellipse(bx, by + 4 * s, R, R - 4 * s, 0, 0, Math.PI * 2); g.fill();
    g.save();
    g.beginPath(); g.ellipse(bx, by, R, R, 0, 0, Math.PI * 2); g.clip();
    g.lineCap = 'round';
    g.strokeStyle = YARN_LT; g.lineWidth = 1.4 * s;
    g.beginPath(); g.moveTo(bx - R, by - 7 * s); g.lineTo(bx + R, by + 9 * s); g.stroke();
    g.beginPath(); g.moveTo(bx - R, by - 1 * s); g.lineTo(bx + R - 2 * s, by + 11 * s); g.stroke();
    g.strokeStyle = YARN_OUT;
    g.beginPath(); g.moveTo(bx + R, by - 9 * s); g.lineTo(bx - R + 1 * s, by + 9 * s); g.stroke();
    g.restore();
    g.fillStyle = YARN_HI; g.fillRect(bx - 8 * s, by - 9 * s, 4 * s, 3 * s);
  }

  function drawGripPaw(g, palRGB, sx, sy, px, py, splay) {
    const O = rgbStr(palRGB.O), C = rgbStr(palRGB.C), W = rgbStr(palRGB.W), H = rgbStr(palRGB.H);
    const rect = (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
    const pwW = 12, pwH = 7, pY = Math.round(py - pwH / 2);
    const adx = px - sx, ady = py - sy, aLen = Math.hypot(adx, ady) || 1, aAng = Math.atan2(ady, adx);
    g.save(); g.translate(sx, sy); g.rotate(aAng);
    g.fillStyle = H; g.fillRect(-1, -6, aLen + 5, 12);   // pale halo: the arm reads on dark coats too
    g.fillStyle = O; g.fillRect(0, -5, aLen + 3, 10);
    g.fillStyle = C; g.fillRect(0, -3, aLen + 3, 6);
    g.restore();
    const pX = px - pwW / 2;
    rect(pX - 3, pY - 3, pwW + 6, pwH + 6, H);   // paw halo
    rect(pX - 2, pY - 2, pwW + 4, pwH + 4, O);
    rect(pX, pY, pwW, pwH, W);
    if (splay) {
      rect(px - 3, pY + 3.5, 6, 3, '#ff8fa3'); rect(px - 6.5, pY + 0.5, 3, 3, '#ff8fa3'); rect(px + 3.5, pY + 0.5, 3, 3, '#ff8fa3');
    } else {
      rect(px - 1, pY + 2, 2, pwH - 2, O);
    }
  }

  function ropeGeom(pos, t, energy, SH, ballShift) {
    const ropeX = Math.round(pos.x - 26);
    const topY = Math.round(pos.y - SH - 55);
    const ballY = Math.round(pos.y - 6 + (ballShift || 0));   // climbing scrolls the ground away
    const sway = Math.sin(t / 220) * (1 + energy / 40);
    const ropeAt = (y) => ropeX + Math.sin((y - topY) / 16 + t / 240) * sway;
    return { ropeX, topY, ballY, sway, ropeAt };
  }

  function drawRope(g, pos, t, climbing, dir, energy, SH, ballShift) {
    const YARN_DK = '#e0556e', YARN_MID = '#f2697f', YARN_LT = '#ff8fa3';
    const geo = ropeGeom(pos, t, energy, SH, ballShift), dirN = clamp(dir, -1, 1);
    const texOff = climbing ? t * 0.09 * dirN : 0;   // stronger scroll so direction reads clearly
    for (let y = geo.topY; y < geo.ballY; y++) {
      const x = Math.round(geo.ropeAt(y)), k = y - geo.topY;
      g.fillStyle = YARN_MID; g.fillRect(x, y, 3, 1);
      if ((((k + texOff) % 5) + 5) % 5 < 2) { g.fillStyle = YARN_DK; g.fillRect(x + 2, y, 1, 1); }
      else { g.fillStyle = YARN_LT; g.fillRect(x, y, 1, 1); }
    }
    const ballBob = climbing ? Math.round(Math.sin(t / 120) * 1.5) : 0;
    drawYarnBall(g, geo.ropeAt(geo.ballY), geo.ballY + ballBob);
  }

  function drawRopeClimb(g, palRGB, pos, t, climbing, dir, energy, bob, sway, SH, ballShift) {
    const YARN_OUT = '#c8455a', YARN_LT = '#ff8fa3';
    const geo = ropeGeom(pos, t, energy, SH, ballShift), dirN = clamp(dir, -1, 1);
    bob = bob || 0; sway = sway || 0;
    drawRope(g, pos, t, climbing, dir, energy, SH, ballShift);
    const shX = pos.x - 6 + sway, shY = Math.round(pos.y - SH * 0.42 - bob);
    const gripBaseY = Math.round(pos.y - SH * 0.42), SPAN = 22;
    const ph = (t / (climbing ? 460 : 1100)) % 1;
    for (let i = 0; i < 2; i++) {
      const phi = (ph + i * 0.5) % 1;
      const yo = Math.cos(phi * Math.PI * 2) * (SPAN / 2);
      const reach = phi < 0.5 ? Math.sin((phi / 0.5) * Math.PI) : 0;
      const gy = gripBaseY + yo + (climbing ? reach * 6 * dirN : 0);
      drawGripPaw(g, palRGB, shX, shY, geo.ropeAt(gripBaseY + yo) + reach * 3.5, gy, climbing && reach > 0.55);
    }
    if (climbing && energy > 6) {
      const span = geo.ballY - geo.topY - 10;
      g.globalAlpha = 0.7;
      for (let i = 0; i < 3; i++) {
        const yy = ((t / 6 + i * 37) % span + span) % span;
        g.fillStyle = i === 1 ? YARN_OUT : YARN_LT;
        g.fillRect(Math.round(geo.ropeAt(geo.topY + yy) - 5 - i), Math.round(geo.topY + 8 + yy), 2, 2);
      }
      g.fillStyle = '#fff0d6';
      for (let i = 0; i < 2; i++) {
        const yy = ((-t / 5 * dirN + i * 50) % span + span) % span;
        g.fillRect(Math.round(geo.ropeAt(geo.topY + yy)), Math.round(geo.topY + 6 + yy), 2, 3);
      }
      g.globalAlpha = 1;
    }
  }

  // ---- the butterfly that annoys the cat -------------------------------------

  // Wing styles the butterfly wears; it swaps color by ducking off-screen (a "costume lap").
  var BFLY_STYLES = [
    { name: 'iridescent', halo: '#dfe9ff', main: '#5a3fa0', core: '#56cfe1', glint: '#bdecff', body: '#241f30', shimmer: true },
    { name: 'monarch',    halo: null,      main: '#e8943c', core: '#b5641d', veins: '#3a2412', dots: '#fff6e8', body: '#1c140c' },
    { name: 'pastel',     halo: '#ffe9f6', main: '#d98fc9', core: '#efb3df', core2: '#cdbcf2', glint: '#ffffff', body: '#2a2433' },
    { name: 'emerald',    halo: '#dffbe9', main: '#2f9e6b', core: '#7fe3a8', glint: '#eafff3', body: '#15241c' },
    { name: 'crimson',    halo: '#ffe0e0', main: '#c0392b', core: '#ff8a7a', dots: '#fff0ec', body: '#2a1414' },
    { name: 'azure',      halo: '#e0f0ff', main: '#2f6fd0', core: '#79b8ff', glint: '#f0f8ff', body: '#141d2a' },
  ];
  // Pick a random style index different from `exclude`, so a costume lap always looks new.
  function pickStyle(exclude) {
    if (BFLY_STYLES.length < 2) return 0;
    let i; do { i = Math.floor(Math.random() * BFLY_STYLES.length); } while (i === exclude);
    return i;
  }

  // Wing-beat speed: faster when working hard, near-frozen (a glide) on a gentle descent.
  function flapStep(sp, vy) { const glide = (vy > 0.7 && sp < 2.6) ? 0.4 : 1; return (0.18 + sp * 0.03) * glide; }

  // Draw a pixel-art butterfly centred at (bx,by), world space. `s` scales it,
  // `flap` is the wing-beat phase (wings open ↔ edge-on), `st` is a style palette,
  // `roll` banks the whole body into a turn (radians) so flight reads with weight.
  function drawButterfly(g, bx, by, s, st, flap, t, shiny, roll) {
    const open = 0.30 + 0.70 * Math.abs(Math.cos(flap));            // 1 = wings flat to viewer, ~0.3 = edge-on
    let main = st.main, core = st.core, halo = st.halo, glint = st.glint;
    if (shiny) {                                                    // rare variant: a slow rainbow shimmer
      const hue = (t / 12) % 360;
      main = `hsl(${hue}, 85%, 60%)`; core = `hsl(${(hue + 45) % 360}, 95%, 78%)`;
      halo = `hsl(${hue}, 90%, 88%)`; glint = '#ffffff';
    } else if (st.shimmer) {
      core = lerpHex(st.core, '#9a6cff', 0.5 + 0.5 * Math.sin(t / 430));   // iridescent shimmer
    }
    g.save(); g.translate(bx, by); if (roll) g.rotate(roll); g.scale(s, s);
    const E = (x, y, rx, ry, col) => { if (rx <= 0.2) return; g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); };
    for (const side of [-1, 1]) {
      const ux = side * 7 * open, lx = side * 5.5 * open;
      if (halo) { g.globalAlpha = shiny ? 0.95 : 0.85; E(ux, -3, 6.2 * open + 1, 6.6, halo); E(lx, 5, 4.6 * open + 1, 4.8, halo); g.globalAlpha = 1; }
      E(ux, -3, 6.0 * open, 6.2, main); E(ux, -3.6, 4.0 * open, 4.4, core);                // upper wing
      E(lx, 5, 4.4 * open, 4.6, main); E(lx, 5, 2.8 * open, 3.0, st.core2 || core);        // lower wing
      if (st.veins) { g.strokeStyle = st.veins; g.lineWidth = 0.7; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(0, -2); g.lineTo(side * (8 * open + k), -7 + k); g.stroke(); } }
      if (st.dots) { E(side * 9 * open, -6, 0.8, 0.8, st.dots); E(side * 6 * open, 2, 0.8, 0.8, st.dots); }
      if (glint) { g.fillStyle = glint; g.fillRect(Math.round(side * 8 * open - 0.5), -6, 1, 1); }
      if (shiny) { g.globalAlpha = 0.5 + 0.5 * Math.abs(Math.sin(t / 90 + side)); g.fillStyle = '#ffffff'; g.fillRect(Math.round(side * 6 * open), -4, 1, 1); g.globalAlpha = 1; }
    }
    // body + head + antennae
    E(0, 0, 1.4, 8, st.body); E(0, -7, 1.6, 1.9, st.body);
    g.strokeStyle = st.body; g.lineWidth = 0.8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, -8); g.lineTo(-2.6, -12.5); g.moveTo(0, -8); g.lineTo(2.6, -12.5); g.stroke();
    g.fillStyle = glint || core; g.fillRect(-3, -13, 1, 1); g.fillRect(2, -13, 1, 1);       // antenna tips
    g.restore();
  }

  // sleepy "z" glyphs + a dream thought-bubble for the SLEEP pose
  function pixZ(g, x, y, s, col) {
    g.fillStyle = col;
    g.fillRect(x, y, 4 * s, s); g.fillRect(x, y + 3 * s, 4 * s, s);
    g.fillRect(x + 2 * s, y + s, s, s); g.fillRect(x + s, y + 2 * s, s, s);
  }
  function drawSleepZ(g, x, y, t) {
    for (let i = 0; i < 3; i++) {
      const ph = ((t + i * 900) % 2700) / 2700;
      g.globalAlpha = (1 - ph) * 0.85;
      pixZ(g, Math.round(x + ph * 12), Math.round(y - ph * 24), 1 + i * 0.5, '#e2e9f6');
    }
    g.globalAlpha = 1;
  }
  function drawDream(g, x, y, t, s) {
    g.globalAlpha = 0.92; g.fillStyle = '#f5f8fd';
    g.beginPath(); g.ellipse(x - 7, y + 15, 1.8, 1.8, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(x - 3, y + 9, 2.8, 2.8, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(x + 4, y, 9, 7, 0, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1;
    if (Math.floor((t / 2200) % 2) === 0) drawButterfly(g, x + 4, y, s * 0.42, BFLY_STYLES[2], t / 80, t, false, 0);
    else { g.fillStyle = '#ff6b81'; g.fillRect(x + 1, y - 2, 6, 2); g.fillRect(x, y - 1, 8, 2); g.fillRect(x + 1, y + 1, 6, 1); g.fillRect(x + 2, y + 2, 4, 1); g.fillRect(x + 3, y + 3, 2, 1); }
  }

  // ---- the live controller ---------------------------------------------------

  function init(canvas, options) {
    options = options || {};
    if (typeof buildSprite !== 'function' || typeof composeSit !== 'function' || typeof PATTERNS === 'undefined') {
      console.error('[cat-live] cat-sprite.js globals missing - load cat-sprite.js before cat-live.js');
      return { start() {}, stop() {}, setCoat() {}, nextCoat() {}, destroy() {}, type() {}, climb() {}, setButterfly() {}, setName() {}, _debug() {} };
    }

    const ctx = canvas.getContext('2d');
    const onMeow = typeof options.onMeow === 'function' ? options.onMeow : function () {};
    const onHearts = typeof options.onHearts === 'function' ? options.onHearts : function () {};
    const onBehavior = typeof options.onBehavior === 'function' ? options.onBehavior : function () {};
    const onPurrStart = typeof options.onPurrStart === 'function' ? options.onPurrStart : function () {};
    const onPurrStop = typeof options.onPurrStop === 'function' ? options.onPurrStop : function () {};
    const onAffection = typeof options.onAffection === 'function' ? options.onAffection : function () {};
    const onUnlock = typeof options.onUnlock === 'function' ? options.onUnlock : function () {};
    let catName = typeof options.name === 'string' ? options.name : '';
    const cycleCoatOnClick = options.cycleCoatOnClick !== false;
    const autoShow = options.autoShow !== false;
    let butterflyOn = options.butterfly !== false;
    const mq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false, addEventListener() {} };
    let reducedMotion = options.reducedMotion != null ? options.reducedMotion : mq.matches;

    let coatIndex = Number(options.coatIndex);
    if (!(coatIndex >= 0 && coatIndex < PATTERNS.length)) {
      const stored = Number(localStorage.getItem('pixelcat.coat'));
      // out-of-box default matches the desktop app: Tuxedo (falls back to 0 if missing)
      const defaultCoat = Math.max(0, PATTERNS.findIndex(p => p.name === 'Tuxedo'));
      coatIndex = (stored >= 0 && stored < PATTERNS.length) ? stored : defaultCoat;
    }
    let sitSprite, loafSprite, huntSprite, typeSprite, palRGB, pal, SW, SH;
    function buildCoat(i) {
      const P = PATTERNS[i];
      const B = { ...BUILDS[PATTERN_BUILD[i]], tabby: !!TABBY[i] };
      sitSprite = buildSprite(24, 30, () => composeSit(B));
      try { loafSprite = buildSprite(24, 30, () => composeLoaf(B)); } catch (e) { loafSprite = sitSprite; }
      huntSprite = buildSprite(30, 20, () => composeHunt(B));
      typeSprite = buildSprite(24, 24, () => composeTypeFront(B));
      SW = sitSprite.SW; SH = sitSprite.SH;
      palRGB = {
        O: toRgb(P.outline), C: toRgb(P.coat), K: toRgb(P.mark),
        W: toRgb(P.white || P.coat), X: toRgb(P.patch || P.coat),
        I: toRgb(P.inner || P.mark), N: toRgb(P.nose), E: toRgb(P.eye), H: toRgb(HALO),
      };
      pal = { O: rgbStr(palRGB.O), C: rgbStr(palRGB.C), W: rgbStr(palRGB.W) };
    }
    buildCoat(coatIndex);

    // layout
    let cssW = 0, cssH = 0, scale = 1, footX = 0, footY = 0, rect = null;
    // cat travel ("the chase"): footX is the single moving anchor; restX is its home spot
    let restX = 0, travelTX = 0, travelMinX = 0, travelMaxX = 0, stalkUntil = 0, stalkGiveUp = 0, stalkCool = -1e9, didLayout = false;
    function resize() {
      rect = canvas.getBoundingClientRect();
      cssW = rect.width || canvas.clientWidth || 300;
      cssH = rect.height || canvas.clientHeight || 120;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      scale = Math.min((cssH * 0.80) / SH, (cssW * 0.42) / SW);
      footY = cssH * 0.93;
      // travel bounds: keep the whole sprite on-canvas, with extra right margin for the tail sweep
      travelMinX = (SW / 2) * scale + 4;
      travelMaxX = cssW - (SW / 2) * scale - scale * 20 - 4;
      restX = clamp(cssW / 2, travelMinX, travelMaxX);
      if (!didLayout) { footX = travelTX = restX; didLayout = true; }   // first layout: sit at home
      else { footX = clamp(footX, travelMinX, travelMaxX); travelTX = clamp(travelTX, travelMinX, travelMaxX); }   // resize: re-clamp, don't snap to center mid-visit
    }
    function relayout() { if (reducedMotion) paintStatic(); else resize(); }

    // input: page cursor + idle wander
    let curX = 0, curY = 0, lastMove = -1e9;
    const smoothLook = { x: 0, y: 0 };
    let idleTarget = { x: 0, y: 0 }, nextIdleLook = 0;
    let lookOverride = null;   // when set (butterfly nearby), the cat watches it instead of the cursor
    // gesture buffer: last GN cursor deltas, for slow-stroke vs fast-scratch vs circular rub
    const GN = 8, gdx = new Float32Array(GN), gdy = new Float32Array(GN);
    let gi = 0, gLastX = 0, gLastY = 0, gHasLast = false;
    function onMove(e) {
      const tt = now(), sdt = Math.max(1, tt - lastMove);
      if (gHasLast) { const ddx = e.clientX - gLastX, ddy = e.clientY - gLastY; gdx[gi] = ddx; gdy[gi] = ddy; gi = (gi + 1) % GN; cursorV += (Math.min(5, Math.hypot(ddx, ddy) / sdt) - cursorV) * 0.4; }
      gLastX = e.clientX; gLastY = e.clientY; gHasLast = true;
      curX = e.clientX; curY = e.clientY; lastMove = tt;
    }
    function gesture() {
      let path = 0, netx = 0, nety = 0, flips = 0, cross = 0, prevSign = 0, pdx = 0, pdy = 0;
      for (let k = 0; k < GN; k++) {
        const dx = gdx[k], dy = gdy[k];
        path += Math.hypot(dx, dy); netx += dx; nety += dy;
        const s = dx > 0.5 ? 1 : dx < -0.5 ? -1 : 0;
        if (s && prevSign && s !== prevSign) flips++;
        if (s) prevSign = s;
        cross += pdx * dy - pdy * dx; pdx = dx; pdy = dy;
      }
      if (path < 6) return 'still';
      if (flips >= 3 && path > 16) return 'scratch';
      if (path > 20 && Math.abs(cross) > path * 1.3) return 'circular';   // strong consistent curl (straight strokes ~0)
      return path < 46 ? 'slow' : 'fast';
    }
    function onScroll() { rect = canvas.getBoundingClientRect(); }
    function updateLook(t) {
      let tx, ty;
      if (lookOverride) {
        tx = lookOverride.x; ty = lookOverride.y;
      } else if (t - lastMove < 3500 && rect) {
        const fx = rect.left + footX, fy = rect.top + (footY - SH * 0.72 * scale);
        tx = clamp((curX - fx) / 220, -1, 1);
        ty = clamp((curY - fy) / 180, -0.7, 1);
      } else {
        if (t > nextIdleLook) { idleTarget = { x: (Math.random() * 2 - 1) * 0.6, y: (Math.random() * 2 - 1) * 0.3 }; nextIdleLook = t + 2200 + Math.random() * 2400; }
        tx = idleTarget.x; ty = idleTarget.y;
      }
      if (lookSnap) {
        // tracking a close, darting bug: a light spring overshoots then settles (vs. a flat lerp)
        lookVx = (lookVx + (tx - smoothLook.x) * 0.30) * 0.62;
        lookVy = (lookVy + (ty - smoothLook.y) * 0.30) * 0.62;
        smoothLook.x += lookVx; smoothLook.y += lookVy;
      } else {
        lookVx = lookVy = 0;
        smoothLook.x += (tx - smoothLook.x) * 0.16;
        smoothLook.y += (ty - smoothLook.y) * 0.16;
      }
    }
    // which body zone is the cursor over? (canvas-CSS-px) - head/ear/cheek/belly/tailbase,
    // mirroring the desktop pet box in src/overlay/
    function zoneAt(cx, cy) {
      if (!rect) return null;
      const left = footX - (SW / 2) * scale, top = footY - SH * scale, w = SW * scale, h = SH * scale;
      if (cx < left || cx > left + w || cy < top || cy > footY) return null;
      const u = (cx - left) / w, v = (cy - top) / h;            // 0..1 within the sprite box
      if (v < 0.42) {                                            // head band
        if (v < 0.20 && (u < 0.36 || u > 0.64)) return 'EAR';   // up near an ear (the scratch sweet spot)
        if (u < 0.26 || u > 0.74) return 'CHEEK';
        return 'HEAD';
      }
      if (v < 0.55) return 'HEAD';                              // neck / upper chest reads as head for petting
      if (u > 0.64 && v > 0.70) return 'TAILBASE';
      return 'BELLY';
    }
    function overHead(cx, cy) { const z = zoneAt(cx, cy); return z === 'HEAD' || z === 'EAR' || z === 'CHEEK'; }

    // behaviour timers
    let blinkUntil = 0, nextBlink = 1500;
    let flickT0 = -1, nextFlick = 4000;
    let nuzzleUntil = 0;
    let typeUntil = 0, lastKeyAt = -1e9, heat = 0;
    let climbUntil = 0, climbDir = -1, paperLen = 0, climbY = 0;   // climbY = how far up the cat has travelled
    let stretchT0 = -1;
    // sustained head-hover petting (debounced enter + grace latch + eased intensity)
    let headEnterAt = -1, petHolding = false, petHoverUntil = 0, petAmt = 0;
    let petStreakT0 = -1, lastPetHeart = 0, purring = false;   // affection streak + heart timer + purr state
    const PET_DWELL_MS = 140, PET_GRACE_MS = 300, PET_EASE_MS = 160;
    let petMelt = 0, meltSparkleAt = -1, overstimT0 = -1, overstimCool = -1e9;   // deep-pet melt + overstim withdrawal
    const PET_MELT_MS = 5200, OVERSTIM_MS = 13000, WITHDRAW_MS = 1000;
    let grabEnterAt = -1, grabUntil = 0, grabT0 = 0, grabCool = -1e9, scratchUntil = 0, cursorV = 0;   // belly trap + scratch reflex + yank speed
    const GRAB_DWELL_MS = 220, GRAB_MS = 2400, SCRATCH_MS = 700;
    let drowse = 0, asleep = false, bonkUntil = 0, lastKissAt = -1e9, lastFrameT = 0;   // cuddle arc: sleep + head-bonk + slow-blink kiss
    let giftUntil = 0;   // "the cat brings you a gift" beat (Phase C trust payoff)
    // butterfly cadence - a brief, occasional cameo (not a constant companion)
    const BFLY_VISIT_MS = [9000, 4000], BFLY_FIRST_GAP_MS = [25000, 20000], BFLY_GAP_MS = [70000, 60000];
    // auto-showcase reel
    // TYPE + CLIMB are showcased automatically too (no manual input on the site)
    const night = (() => { try { const h = new Date().getHours(); return h < 6 || h >= 22; } catch (e) { return false; } })();   // sleepier at night
    const REEL = ['TYPE', 'HUNT', 'CLIMB', 'STRETCH', 'ZOOMIES', 'GROOM', 'LOAF'];
    const REEL_MS = { HUNT: 2600, STRETCH: 1500, ZOOMIES: 3000, GROOM: 2600, LOAF: 4000, TYPE: 2200, CLIMB: 2600 };
    let reelIdx = 0, autoState = null, autoUntil = 0, nextAuto = 9000, lastAutoClimbDir = 1;
    let lastBehavior = '';
    // butterfly entity (stage CSS-px space) + swat reaction
    let bf = { x: 0, y: 0, vx: 10, vy: 4, flap: 0, mode: 'wander', wpX: 0, wpY: 0, nextWp: 0, nextDive: 0, diveUntil: 0, dodgeUntil: 0, palIdx: 0, nextLap: 0, lapEdge: -1, landUntil: 0, shiny: false, present: false, until: 0, nextVisit: -1, caught: false, bank: 0, jinkAt: -1, jinkVx: 0, jinkVy: 0, driftCx: 0, driftCy: 0, driftTX: 0, driftTY: 0, nextDrift: 0, phase: 0 };
    let swatUntil = 0, swatTX = 0, swatTY = 0, swatCool = 0, prevT = 0;
    let catchUntil = 0, catchT0 = 0, catchTX = 0, catchTY = 0, catchCool = -1e9;   // "catch the butterfly" sequence
    const CATCH_MS = 1750;
    // "air currents & the chase": the butterfly glides a drifting figure-eight; the cat travels to stalk it
    const DRIFT_PHASE_RATE = 0.012, DRIFT_EASE = 0.012, LISSA_RATIO = 2, LISSA_DELTA = Math.PI / 2;
    const DRIFT_REPICK_MS = [4200, 3000], WANDER_ACCEL = 0.022;
    const BURST_RATIO = 3.0, BURST_GATE = 0.7, BURST_LIFT = 26, FLAP_BURST_MULT = 2.2;
    const INTEREST_MIN = 70, GIVE_UP_MS = 5200, STALK_STANDOFF = 64, STALK_GAIT_MS = 150, TRAVEL_EASE = 0.045;
    // butterfly play extras: cross-eyed perch + sneeze, whiff confusion, cursor lure, lap poof, transient caption
    let landReactUntil = 0, landCool = -1e9, sneezeT0 = 0, sneezeUntil = 0, confusedUntil = 0;
    let curSpeed = 0, lastCurX = 0, lastCurY = 0, lastCurT = 0;
    let lapPoofT0 = -1, lapPoofX = 0, lapPoofY = 0;
    // newer butterfly polish: deferred groom after a whiff, proximity tail-twitch, snappy gaze, chatter
    let pendingGroomAt = -1, tailTwitch = 0, lookSnap = false, lookVx = 0, lookVy = 0, chatterUntil = 0, chatterCool = -1e9;
    let tempCap = '', tempCapUntil = 0;
    function say(s, ms) { tempCap = s; tempCapUntil = now() + (ms || 900); }
    function bflyActive() { return butterflyOn && !reducedMotion; }

    function userBusy(t) { return t < nuzzleUntil || t < climbUntil || t < typeUntil; }
    function resolveState(t) {
      if (asleep) return 'SLEEP';
      if (t < nuzzleUntil) return 'NUZZLE';
      if (t < climbUntil) return 'CLIMB';
      if (t < typeUntil) return 'TYPE';
      if (t < grabUntil) return 'GRAB';
      if (t < giftUntil) return 'GIFT';
      if (t < catchUntil) return 'CATCH';
      if (t < swatUntil) return 'SWAT';
      if (t < petHoverUntil) return 'NUZZLE';   // sustained, debounced head-hover petting
      if (autoState && t < autoUntil) return autoState;
      return 'IDLE';
    }
    function schedule(t, state) {
      if (t > nextBlink) { blinkUntil = t + 110; nextBlink = t + 2500 + Math.random() * 3500; }
      if (state === 'IDLE') {
        if (t > nextFlick) { flickT0 = t; nextFlick = t + 4000 + Math.random() * 5000; }
        // while a butterfly is visiting, the chase IS the show - pause the random reel so the cat is free to stalk
        if (autoShow && t > nextAuto && !(bflyActive() && bf.present)) {
          let pick = REEL[reelIdx % REEL.length]; reelIdx++;
          if (night && (pick === 'HUNT' || pick === 'ZOOMIES' || pick === 'CLIMB') && Math.random() < 0.6) pick = 'LOAF';   // wind down at night
          const dur = REEL_MS[pick] || 2600;
          nextAuto = t + dur + 1600 + Math.random() * 1400;
          if (pick === 'TYPE') {
            // drive the typing knead automatically, kept below the overheat threshold
            typeUntil = t + dur; lastKeyAt = t; heat = Math.min(0.5, heat + 0.3); autoState = null;
          } else if (pick === 'CLIMB') {
            // auto-climb: alternate up/down each time so it scrolls both ways
            lastAutoClimbDir = -lastAutoClimbDir; climbDir = lastAutoClimbDir;
            climbUntil = t + dur; paperLen = Math.min(60, paperLen + 40);
            climbY = clamp(climbY + (climbDir < 0 ? 22 : -22), -cssH * 0.16, cssH * 0.32); autoState = null;
          } else {
            autoState = pick; autoUntil = t + dur;
            if (pick === 'STRETCH') stretchT0 = t;
            if (pick === 'HUNT' || pick === 'ZOOMIES') flickT0 = t;
          }
        }
      }
    }

    const CAPTION = { IDLE: '', NUZZLE: 'purr ♥', CLIMB: 'climbing!', TYPE: 'typing…', CATCH: 'got it! ♥', SWAT: 'annoyed!', HUNT: 'hunting!', STRETCH: 'big stretch~', ZOOMIES: 'zoomies!', GROOM: 'washing up', LOAF: 'loafing', SLEEP: 'zzz…', GRAB: 'got your hand! >:3' };

    // body transform helper: foot anchored at (footX, footY+dy), scaled, optional squash/rotate
    function bodyXform(dyPush, rot, sx, sy) {
      ctx.translate(footX, footY - dyPush); ctx.rotate(rot || 0); ctx.scale(scale * (sx || 1), scale * (sy || 1));
    }

    function drawBfly(t) { drawButterfly(ctx, bf.x, bf.y, scale * 0.95, BFLY_STYLES[bf.palIdx], bf.flap, t, bf.shiny, bf.bank); }

    function paint(t) {
      // a whiffed swat sometimes resolves into save-face grooming a beat later (real cats do this)
      if (pendingGroomAt > 0 && t > pendingGroomAt) {
        pendingGroomAt = -1;
        if (t > nuzzleUntil && t > climbUntil && t > typeUntil && t > catchUntil && t > swatUntil && t > petHoverUntil) {
          autoState = 'GROOM'; autoUntil = t + 1500; nextAuto = t + 3100; say('hmph.', 700);
        }
      }
      const state = resolveState(t);
      schedule(t, state);
      const dt = prevT ? t - prevT : 16; prevT = t;
      petAmt += ((petHolding ? 1 : 0) - petAmt) * Math.min(1, dt / PET_EASE_MS);   // ease pet intensity in/out
      // "the chase": ease the foot anchor toward travelTX (the stalk brain sets it just below)
      footX += (travelTX - footX) * TRAVEL_EASE * Math.min(1, dt / 16);
      footX = clamp(footX, travelMinX, travelMaxX);
      updateButterfly(t, dt, state);   // sets lookOverride / may trigger swat - run before updateLook
      // stalk brain: in IDLE, travel toward a drifting butterfly; otherwise saunter home to restX
      if (state === 'HUNT' || state === 'CATCH' || state === 'SWAT' || state === 'GRAB') {
        travelTX = footX;   // freeze travel; the pounce/catch pose owns the motion
      } else if (bflyActive() && bf.present && !bf.caught && state === 'IDLE' && t > catchCool && t > stalkCool &&
                 bf.y < footY - SH * scale * 0.25 && Math.abs(bf.x - footX) > INTEREST_MIN) {
        if (!stalkUntil) { stalkGiveUp = t + GIVE_UP_MS; say('stalking…', 1000); }
        stalkUntil = t + 120;
        const side = Math.sign(bf.x - footX) || 1;
        travelTX = clamp(bf.x - side * STALK_STANDOFF, travelMinX, travelMaxX);
        if (t > stalkGiveUp) { stalkUntil = 0; stalkCool = t + 4000; travelTX = restX; }   // give up on an unreachable bug
      } else { stalkUntil = 0; travelTX = restX; }
      updateLook(t);
      // heat decays unless actively typing
      if (t - lastKeyAt > 180) heat = Math.max(0, heat - 0.012);
      if (t > climbUntil) paperLen = Math.max(0, paperLen - 0.5);

      const cap = t < tempCapUntil ? tempCap : (CAPTION[state] || '');
      if (cap !== lastBehavior) { lastBehavior = cap; onBehavior(cap); }

      const blinking = t < blinkUntil;
      // butterfly hides during the user-driven / cuddle poses
      const bflyVisible = bflyActive() && bf.present && !bf.caught && state !== 'TYPE' && state !== 'CLIMB' && state !== 'NUZZLE' && state !== 'CATCH' && state !== 'GRAB' && state !== 'SLEEP';
      ctx.clearRect(0, 0, cssW, cssH);

      // costume-lap sparkle poof at the screen edge where the butterfly ducked out
      if (lapPoofT0 >= 0 && t - lapPoofT0 < 360) catchSparkle(lapPoofX, lapPoofY, t, (t - lapPoofT0) / 360);

      // shadow (skip while climbing - feet leave the floor)
      if (state !== 'CLIMB') {
        ctx.save(); ctx.translate(footX, footY); ctx.scale(scale, scale);
        drawShadow(ctx, 0, 0, (state === 'NUZZLE' ? 0.14 + Math.sin(t / 800) * 0.05 : 0.17), SW * 0.30);
        ctx.restore();
      }

      if (state === 'TYPE') { paintType(t, blinking); return; }
      if (state === 'CLIMB') { paintClimb(t, blinking); return; }
      if (state === 'CATCH') { paintCatch(t, blinking); return; }
      if (state === 'SWAT') { paintSwat(t, blinking); if (bflyVisible) drawBfly(t); return; }
      if (state === 'HUNT') { paintHunt(t, blinking); if (bflyVisible) drawBfly(t); return; }
      if (state === 'GRAB') { paintGrab(t, blinking); return; }
      if (state === 'GIFT') { paintGift(t, blinking); return; }

      // sit/loaf family: IDLE, NUZZLE, GROOM, LOAF, STRETCH, ZOOMIES
      let petPush = 0, sqX = 1, sqY = 1, eyeMode = 'open', petting = false, lean = smoothLook.x * 0.05;
      let fx = footX, eyeSquint = 0, biscuits = false;
      const sp = (state === 'LOAF' || state === 'SLEEP') ? loafSprite : sitSprite;

      if (state === 'NUZZLE') {
        // click-pet plays at full intensity; sustained hover-pet eases in/out via petAmt
        const intensity = t < nuzzleUntil ? 1 : petAmt;
        const aff = clamp(((petStreakT0 >= 0 ? t - petStreakT0 : 0) - 300) / 2500, 0, 1);   // affection over ~2.8s
        const bunt = Math.max(0, Math.sin(t / 300));                          // head-bunt rhythm (~0.6s/beat)
        petPush = bunt * 6 * (1 + aff * 0.5) * intensity;                     // head bunts UP into the hand
        sqY = 1 - bunt * 0.06 * intensity; sqX = 1 + bunt * 0.05 * intensity;
        eyeMode = 'happy'; petting = true; lean += smoothLook.x * 0.04;
        // deep-pet "melt": a slower ramp settles the posture, then fires a one-shot milestone
        const deep = clamp(((petStreakT0 >= 0 ? t - petStreakT0 : 0) - PET_MELT_MS) / 2200, 0, 1);
        petMelt += (deep - petMelt) * Math.min(1, dt / 240);
        sqY *= 1 - petMelt * 0.05; sqX *= 1 + petMelt * 0.04; petPush *= 1 - petMelt * 0.25;
        if (deep > 0.02 && meltSparkleAt < petStreakT0) { meltSparkleAt = t; say('♥‿♥', 1200); onAffection({ type: 'melt', streak: t - petStreakT0 }); }
        // slow-blink "cat kiss": offered every ~3.6s; hold still during it and the cat blinks back + a heart
        const sb = (petStreakT0 < 0 ? 0 : t - petStreakT0) % 3600;
        eyeSquint = aff > 0.4 && sb < 420 ? Math.sin(sb / 420 * Math.PI) : 0;
        if (cursorV < 0.18 && aff > 0.4 && sb < 200 && t - lastKissAt > 3400) {
          lastKissAt = t; say('slow blink ♥', 1100);
          if (rect) onHearts(rect.left + footX, rect.top + (footY - SH * 0.78 * scale));
        }
        biscuits = deep > 0.3;   // deep contentment -> kneading "biscuits"
        // nuzzle toward the hand: lean + shift toward wherever the cursor rests on the head
        const curOnHead = rect ? clamp(((curX - rect.left) - footX) / (SW * 0.5 * scale), -1, 1) : 0;
        lean += curOnHead * 0.08 * intensity; fx += curOnHead * 3 * scale * intensity;
        fx += curOnHead * 2 * scale * intensity * bunt;                      // head leads toward the hand on the up-beat
        lean += curOnHead * 0.05 * intensity * bunt;
        if (t < bonkUntil) { const bk = Math.sin(clamp((bonkUntil - t) / 360, 0, 1) * Math.PI); petPush += bk * 7; fx += curOnHead * 4 * scale * bk; }   // greeting head-bonk
        fx += Math.sin(t / 24) * 1.6 * intensity * (0.4 + aff * 0.6) * scale; // ~21Hz purr tremble (felt, not seen)
        if (aff > 0.5) lean += Math.sin(t / 120) * 0.03 * aff;               // blissful wiggle once warmed up
        if (aff > 0.6 && t > meltSparkleAt + 1200 && t > lastKissAt + 1100) say('purrrr ♥♥', 400);   // yields to melt + kiss captions
        // a steady stream of hearts while petting - faster the longer you pet
        if (rect && t - lastPetHeart > 820 - aff * 380) {
          lastPetHeart = t;
          onHearts(rect.left + footX + (Math.random() * 2 - 1) * 14, rect.top + (footY - SH * 0.72 * scale) - 6);
        }
        // gesture-aware: a back-and-forth scratch over the ear sweet spot -> hind-leg thump; circular rub -> trance
        const gz = rect ? zoneAt(curX - rect.left, curY - rect.top) : null, gst = gesture();
        if ((gz === 'EAR' || gz === 'CHEEK') && gst === 'scratch' && t - lastMove < 250 && t > scratchUntil + 200) {
          scratchUntil = t + SCRATCH_MS; say('*thmp thmp*', 700);
          if (navigator.vibrate) { try { navigator.vibrate(18); } catch (e) {} }
        }
        if (gst === 'circular') eyeSquint = Math.max(eyeSquint, 0.7);
      } else if (state === 'STRETCH') {
        const se = clamp((t - stretchT0) / (REEL_MS.STRETCH), 0, 1);
        let k; if (se < 0.16) k = -Math.sin(se / 0.16 * Math.PI) * 0.5; else { const r = (se - 0.16) / 0.84; k = Math.sin(r * Math.PI); }
        sqY = 1 + k * 0.42; sqX = 1 - k * 0.14; eyeMode = 'happy';
      } else if (state === 'ZOOMIES') {
        fx = footX + Math.sin(t / 165) * (cssW * 0.26);
        petting = true;
      } else if (state === 'SLEEP') {
        eyeMode = 'happy'; eyeSquint = 1;   // curled up asleep (loaf sprite + Zzz + a dream)
        sqY *= 0.93; sqX *= 1.06; petPush -= 2;   // settle: flatter + sunk a touch vs. an awake loaf
      }
      // butterfly perched on the nose -> wide-eyed cross-eyed freeze; perch ends -> achoo recoil
      let dilate = 1;
      const landing = state === 'IDLE' && t < landReactUntil, sneezing = state === 'IDLE' && t < sneezeUntil;
      const chattering = state === 'IDLE' && t < chatterUntil && !landing && !sneezing;
      if (sneezing) { petPush += Math.sin((t - sneezeT0) / 600 * Math.PI) * 5; eyeMode = 'happy'; }
      else if (landing) { dilate = 1.5; }
      else if (chattering) { petPush += Math.sin(t / 46) * 1.4; dilate = 1.3; }   // jaw-chatter at unreachable prey
      let bob = (landing || sneezing || chattering) ? 0
        : state === 'SLEEP' ? Math.round(Math.sin(t / 2600) * 1.2)   // slow, deep sleeping breaths
        : Math.round(Math.sin(t / 1500) * (state === 'LOAF' ? 0.8 : 1.6));
      // stalk-and-chase: face the travel direction (also when sauntering home); creep low while stalking
      const traveling = state === 'IDLE' && Math.abs(travelTX - footX) > 1.5;
      const faceLeft = traveling ? (travelTX < footX) : (state === 'ZOOMIES' && Math.cos(t / 165) < 0);
      const stalking = state === 'IDLE' && t < stalkUntil;
      if (stalking) { bob += Math.round(Math.sin(t / STALK_GAIT_MS) * 1.0); sqY *= 0.92; sqX *= 1.04; }   // low, deliberate creep
      // overstimulated "enough!" - a brief turn-away shake after a very long pet
      if (state === 'IDLE' && overstimT0 >= 0 && t - overstimT0 < WITHDRAW_MS) {
        const w = 1 - (t - overstimT0) / WITHDRAW_MS;
        lean += Math.sin(t / 40) * 0.05 * w; fx += Math.sin(t / 70) * 6 * scale * w;
      }

      // tail behind (sit poses only; loaf has a baked wrapped tail)
      if (state !== 'LOAF' && state !== 'SLEEP') {
        ctx.save(); ctx.translate(fx, footY - petPush * scale); ctx.rotate(lean); ctx.scale(scale * (faceLeft ? -1 : 1), scale);
        drawTail(ctx, 0, 0, t, pal, flickT0, petting, SW, SH, tailTwitch); ctx.restore();
      }
      ctx.save();
      ctx.translate(fx, footY - petPush * scale); ctx.rotate(lean); ctx.scale(scale * sqX * (faceLeft ? -1 : 1), scale * sqY);
      ctx.translate(-SW / 2, -SH);
      drawCat(ctx, sp, palRGB, { bob, blinking, look: faceLeft ? { x: -smoothLook.x, y: smoothLook.y } : smoothLook, eyeMode, blush: state === 'NUZZLE', dilate, eyeSquint });
      if (state === 'GROOM') {
        // lift the LEFT front paw to the mouth: paint over its planted white mitt so the
        // cat shows one planted + one raised paw (instead of three).
        ctx.fillStyle = rgbStr(palRGB.C); ctx.fillRect(34, 104, 16, 16);
        drawGroom(ctx, palRGB, sp.muzzle.x - 6, SH * 0.30, t);
      }
      if (state === 'NUZZLE' && t < scratchUntil) {
        const th = Math.sin(t / 34) * 5;   // scratch reflex: a back leg thumps rapidly
        drawGripPaw(ctx, palRGB, SW * 0.68, SH * 0.60, SW * 0.80, SH * 0.92 + th, true);
      }
      if (biscuits) {
        // making biscuits: knead the air softly with alternating front paws
        const kn = Math.sin(t / 260), lp = Math.max(0, kn), rp = Math.max(0, -kn);
        ctx.fillStyle = rgbStr(palRGB.C); ctx.fillRect(SW * 0.5 - 9, SH * 0.6, 18, 13);   // hide the planted mitts
        drawKneadPaws(ctx, palRGB, SW * 0.5 - 5, SW * 0.5 + 5, SH * 0.64, lp, rp, SH * 0.8);
      }
      ctx.restore();

      if (state === 'SLEEP') {
        // rise from just above the curled-up head (was floating near the canvas top)
        drawSleepZ(ctx, footX + SW * 0.40 * scale, footY - SH * 0.66 * scale, t);
        drawDream(ctx, footX + SW * 0.46 * scale, footY - SH * 0.82 * scale, t, scale);
      }
      if (meltSparkleAt >= 0 && t - meltSparkleAt < 500)
        catchSparkle(footX, footY - SH * 0.72 * scale, t, (t - meltSparkleAt) / 500);   // deep-pet milestone poof

      if (bflyVisible) drawBfly(t);
    }

    function paintType(t, blinking) {
      const overheat = heat > 0.7;
      const sp = overheat ? 36 : 60, wave = Math.sin(t / sp);
      const snap = (v) => Math.pow(Math.max(0, v), 0.6);
      const cyc = t % 4500, both = cyc > 3900 ? Math.sin(((cyc - 3900) / 600) * Math.PI) : 0;
      const lp = Math.max(snap(wave), both), rp = Math.max(snap(-wave), both);
      const dip = (lp + rp) * 1.6, leanA = (rp - lp) * 0.05 * (1 - both);
      const TW = typeSprite.SW, TH = typeSprite.SH;
      ctx.save();
      ctx.translate(footX, footY); ctx.scale(scale, scale);     // foot-anchored sprite space (pos = 0,0)
      ctx.save(); ctx.rotate(leanA); ctx.translate(-TW / 2, -TH + dip);
      drawCat(ctx, typeSprite, palRGB, { bob: 0, blinking, look: { x: (rp - lp) * 0.5, y: 0.6 } });
      ctx.restore();
      const lcx = -15, rcx = 15, keyTop = -12;
      drawKey(ctx, lcx, keyTop + Math.round(lp * 3), 24, 11, lp > 0.6);
      drawKey(ctx, rcx, keyTop + Math.round(rp * 3), 24, 11, rp > 0.6);
      drawKneadPaws(ctx, palRGB, lcx, rcx, keyTop, lp, rp, -29 + dip);
      if (overheat) drawSteam(ctx, t, 0, -TH + 2 * CELL);
      ctx.restore();
    }

    function paintClimb(t, blinking) {
      const climbing = t < climbUntil, energy = Math.max(paperLen, climbing ? 20 : 0);
      const stroke = (t / (climbing ? 460 : 1100)) % 1;
      const cbob = Math.sin(stroke * Math.PI * 2) * (climbing ? 2.2 : 1.1);
      const csway = Math.cos(stroke * Math.PI * 2) * (climbing ? 1.0 : 0.6);
      if (!climbing) climbY *= 0.90;   // ground drifts back when you stop climbing
      ctx.save();
      ctx.translate(footX, footY); ctx.scale(scale, scale);     // foot-anchored sprite space (pos = 0,0)
      const pos = { x: 0, y: 0 };
      // seated body rides the heave; rope + grips drawn over it. climbY scrolls the
      // ground (yarn ball) away as the cat climbs, so the cat reads as travelling up.
      ctx.save(); ctx.translate(csway, -cbob); ctx.translate(-SW / 2, -SH);
      drawCat(ctx, sitSprite, palRGB, { bob: 0, blinking, look: { x: -0.35, y: clamp(climbDir, -1, 1) * 0.6 } });
      ctx.restore();
      drawRopeClimb(ctx, palRGB, pos, t, climbing, climbDir, energy, cbob, csway, SH, climbY);
      ctx.restore();
    }

    // "a gift for you": the cat sits up proud, holding a little present (the download payoff)
    function paintGift(t, blinking) {
      const bob = Math.sin(t / 220) * 1.5, present = Math.max(0, Math.sin(t / 700)) * 4;   // a slow "ta-da" lift
      ctx.save();
      ctx.translate(footX, footY); ctx.scale(scale, scale);
      drawTail(ctx, 0, 0, t, pal, -1, true, SW, SH, 0);
      ctx.save(); ctx.translate(-SW / 2, -SH);
      drawCat(ctx, sitSprite, palRGB, { bob: Math.round(bob), blinking, look: { x: 0, y: 0.5 }, eyeMode: 'happy', blush: true });
      ctx.restore();
      ctx.restore();
      const gx = footX, gy = footY - SH * scale * 0.44 - present * scale + bob * scale;   // the "gift" held up at the chest
      // twinkles around the present so the payoff reads as a "ta-da!"
      ctx.fillStyle = '#fff2c4';
      for (let i = 0; i < 3; i++) {
        const a = t / 320 + i * 2.094, tw = Math.sin(t / 210 + i * 1.7) * 0.5 + 0.5;
        const sx = gx + Math.cos(a) * 24 * scale, sy = gy + Math.sin(a) * 17 * scale, r = (1.1 + tw) * scale;
        ctx.globalAlpha = tw;
        ctx.fillRect(sx - r, sy - 0.6 * scale, 2 * r, 1.2 * scale); ctx.fillRect(sx - 0.6 * scale, sy - r, 1.2 * scale, 2 * r);
      }
      ctx.globalAlpha = 1;
      drawYarnBall(ctx, gx, gy, scale * 1.5);
    }
    // belly bunny-kick: the cat seizes the cursor in its paws and rabbit-kicks it
    function paintGrab(t, blinking) {
      const hx = rect ? clamp((curX - rect.left - footX) / scale, -SW * 0.7, SW * 0.7) : 0;
      // keep the clutched "prey" over the dark lower belly so the white paw pads pop (not lost on the bib)
      const hy = rect ? clamp((curY - rect.top - footY) / scale, -SH * 0.5, -SH * 0.18) : -SH * 0.4;
      const kick = Math.sin(t / 45), wrestle = Math.sin(t / 130) * 2;   // fast rabbit-kick + a side-to-side tussle
      const recline = -0.10 + Math.sin(t / 300) * 0.04;                 // tips back onto its haunches to kick
      ctx.save();
      ctx.translate(footX + wrestle * scale, footY); ctx.rotate(recline); ctx.scale(scale, scale);
      drawTail(ctx, 0, 0, t, pal, flickT0, true, SW, SH, 0.8);
      ctx.save(); ctx.translate(-SW / 2, -SH);
      drawCat(ctx, sitSprite, palRGB, { bob: Math.round(kick * 1.6), blinking, look: { x: clamp(hx / 16, -1, 1), y: clamp((hy + SH * 0.7) / 16, -1, 1) }, eyeMode: 'open', dilate: 1.45 });
      ctx.restore();
      // motion streaks behind the raking hind paws so the speed of the kick reads
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(hx - 15, hy - 9 + kick * 6); ctx.lineTo(hx - 5, hy - 9 + kick * 6);
      ctx.moveTo(hx - 15, hy + 9 - kick * 6); ctx.lineTo(hx - 5, hy + 9 - kick * 6); ctx.stroke();
      // hind paws rake hard at the held point (big alternating piston); front paws clamp the cursor still
      drawGripPaw(ctx, palRGB, -5, -SH * 0.30, hx - 6, hy + kick * 11, true);
      drawGripPaw(ctx, palRGB, 6, -SH * 0.30, hx + 6, hy - kick * 11, true);
      drawGripPaw(ctx, palRGB, -4, -SH * 0.58, hx - 3, hy - 1, false);
      drawGripPaw(ctx, palRGB, 4, -SH * 0.58, hx + 3, hy - 1, false);
      ctx.restore();
    }
    function paintHunt(t, blinking) {
      const HW = huntSprite.SW, HH = huntSprite.SH;
      const cyc = (t % 1500) / 1500;
      // aim at the live butterfly when it's around; otherwise stalk in place
      const chasing = bflyActive() && bf.present && !bf.caught;
      const dirX = chasing ? clamp((bf.x - footX) / 90, -1, 1) : smoothLook.x;
      const tgtDX = chasing ? clamp(bf.x - footX, -cssW * 0.42, cssW * 0.42) : 0;
      const tgtUp = chasing ? clamp((footY - SH * scale * 0.5) - bf.y, 0, cssH * 0.7) : 0;
      const faceL = dirX < 0 ? -1 : 1;
      // three-beat predation: WIND-UP (crouch + haunch butt-wiggle, locked stare) -> POUNCE -> RECOVER
      let dx = 0, up = 0, sqX = 1, sqY = 1, dilate = 1.12, lunge = 0;
      if (cyc < 0.50) {
        const w = cyc / 0.50;                              // coil loads 0 -> 1
        const wig = chasing ? Math.sin(t / 60) * w : 0;    // shimmy only at real prey, not empty air
        sqY = 1 - 0.12 * w; sqX = 1 + 0.06 * w + wig * 0.04;
        dx = wig * 3; dilate = 1.12 + 0.4 * w;             // pupils blow wide as it locks on
      } else if (cyc < 0.72) {
        const e = (cyc - 0.50) / 0.22; lunge = Math.sin(e * Math.PI);
        dx = tgtDX * 0.62 * lunge; up = tgtUp * 0.62 * lunge;
        sqY = 1 + 0.10 * lunge; sqX = 1 - 0.05 * lunge; dilate = 1.5;   // stretch through the leap
      } else {
        const r = (cyc - 0.72) / 0.28, settle = Math.sin(Math.min(1, r * 1.6) * Math.PI) * 0.05;
        sqY = 1 + settle; sqX = 1 - settle * 0.6; dilate = 1.3 - r * 0.18;   // land + settle
      }
      ctx.save();
      ctx.translate(footX + dx, footY - up + lunge * 4 * scale);
      ctx.scale(scale * sqX * faceL, scale * sqY);
      ctx.translate(-HW / 2, -HH);
      drawCat(ctx, huntSprite, palRGB, { bob: 0, blinking, look: { x: Math.abs(dirX), y: chasing ? clamp((bf.y - (footY - SH * 0.72 * scale)) / 90, -0.6, 0.6) : 0.2 }, dilate });
      ctx.restore();
    }

    // a single paw swipes up at the butterfly; the seated body leans toward it
    function paintSwat(t, blinking) {
      const prog = clamp((t - (swatUntil - 420)) / 420, 0, 1);
      const swing = Math.sin(prog * Math.PI);               // 0 -> 1 -> 0 swipe
      const dirX = clamp((swatTX - footX) / 90, -1, 1);
      ctx.save();
      ctx.translate(footX, footY); ctx.rotate(dirX * 0.10 * swing);
      ctx.scale(scale * (1 + swing * 0.03), scale * (1 - swing * 0.05));   // body recoils into the swipe (weight)
      ctx.save(); ctx.translate(-SW / 2, -SH);
      drawCat(ctx, sitSprite, palRGB, { bob: 0, blinking, look: lookOverride || smoothLook, eyeMode: 'open', dilate: 1.1 });
      ctx.restore();
      // reaching paw: shoulder at upper chest, paw toward the butterfly (in cat-local space)
      const bxL = clamp((swatTX - footX) / scale, -SW * 0.8, SW * 0.8);
      const byL = clamp((swatTY - footY) / scale, -SH * 1.25, -SH * 0.4);
      drawGripPaw(ctx, palRGB, dirX * 5, -SH * 0.52, bxL * 0.7, byL - swing * 6, swing > 0.35);
      ctx.restore();
    }

    // multi-phase "catch the butterfly": coil -> pounce -> impact -> success (held)
    function catchSparkle(cx, cy, t, e) {
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + t / 300, r = 6 + e * 22, s = 2 + (i % 2);
        ctx.globalAlpha = (1 - e) * 0.9; ctx.fillStyle = i % 2 ? '#fff6d6' : '#ffe2a6';
        ctx.fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.8), s, s);
      }
      ctx.globalAlpha = 1;
    }
    function paintCatch(t, blinking) {
      const prog = clamp((t - catchT0) / CATCH_MS, 0, 1);
      const dirX = clamp((catchTX - footX) / 90, -1, 1);
      const tgtDX = clamp(catchTX - footX, -cssW * 0.42, cssW * 0.42);
      const tgtUp = clamp((footY - SH * scale * 0.5) - catchTY, 0, cssH * 0.7);
      const HW = huntSprite.SW, HH = huntSprite.SH, faceL = dirX < 0 ? -1 : 1;
      if (prog < 0.40) {
        // COIL (deep crouch + butt-wiggle) -> POUNCE (leap toward the bug), hunt sprite
        let dx = 0, up = 0, sx = 1, sy = 1, lunge = 0, dil = 1.2;
        if (prog < 0.24) {
          const c = prog / 0.24, e = Math.sin(c * Math.PI * 0.5), wig = Math.sin(t / 55) * c;
          sy = 1 - e * 0.16; sx = 1 + e * 0.09 + wig * 0.04; dx = wig * 2.4; dil = 1.2 + c * 0.25;
        } else { const e = (prog - 0.24) / 0.16; lunge = Math.sin(e * Math.PI); dx = tgtDX * 0.62 * e; up = tgtUp * 0.72 * lunge; sy = 1 + lunge * 0.10; sx = 1 - lunge * 0.05; dil = 1.45; }
        ctx.save();
        ctx.translate(footX + dx, footY - up); ctx.scale(scale * sx * faceL, scale * sy); ctx.translate(-HW / 2, -HH);
        drawCat(ctx, huntSprite, palRGB, { bob: 0, blinking, look: { x: Math.abs(dirX), y: 0.2 }, dilate: dil });
        ctx.restore();
      } else if (prog < 0.56) {
        // IMPACT - at the bug: squash, eyes shut, sparkle poof
        const e = (prog - 0.40) / 0.16;
        const dx = tgtDX * 0.62, up = tgtUp * 0.72 * (1 - e * 0.7);
        ctx.save();
        ctx.translate(footX + dx, footY - up); ctx.scale(scale * (1.14 - e * 0.14) * faceL, scale * (0.88 + e * 0.12)); ctx.translate(-HW / 2, -HH);
        drawCat(ctx, huntSprite, palRGB, { bob: 0, blinking: true, look: { x: 0, y: 0.4 }, eyeMode: 'happy' });
        ctx.restore();
        catchSparkle(footX + dx, footY - up - HH * scale * 0.45, t, e);
      } else {
        // SUCCESS - settle into a sit, happy, butterfly held between the front paws
        const e = (prog - 0.56) / 0.44;
        const land = Math.sin(Math.min(1, e * 2.2) * Math.PI) * 0.06;
        ctx.save();
        ctx.translate(footX, footY); ctx.rotate(dirX * 0.03 * (1 - e)); ctx.scale(scale, scale * (1 - land));
        drawTail(ctx, 0, 0, t, pal, catchT0, true, SW, SH);
        ctx.translate(-SW / 2, -SH);
        drawCat(ctx, sitSprite, palRGB, { bob: 0, blinking, look: { x: 0, y: 0.75 }, eyeMode: 'happy', blush: true });
        ctx.restore();
        const by = footY - SH * scale * 0.12 + Math.sin(t / 120) * 1.5;
        drawButterfly(ctx, footX, by, scale * 0.78, BFLY_STYLES[bf.palIdx], t / 70, t, bf.shiny);
      }
    }

    // begin an occasional visit: the butterfly flutters in from a side near head height
    function startBflyVisit(t) {
      const hX = footX, hY = footY - SH * 0.72 * scale;
      const side = Math.random() < 0.5 ? -1 : 1;
      bf.present = true; bf.caught = false; bf.mode = 'wander';
      bf.until = t + BFLY_VISIT_MS[0] + Math.random() * BFLY_VISIT_MS[1];
      bf.x = clamp(hX + side * Math.min(cssW * 0.34, 180), 14, cssW - 14);
      bf.y = clamp(hY - 20, 20, cssH * 0.55);
      bf.vx = -side * 4; bf.vy = 0;
      bf.wpX = hX; bf.wpY = hY - 16;
      bf.nextWp = t + 1200; bf.nextDive = t + 2400;
      bf.palIdx = pickStyle(bf.palIdx); bf.shiny = Math.random() < 0.10; bf.nextLap = t + 2500 + Math.random() * 2000;
      // seed the air-current glider: a wandering figure-eight center, re-picked soon to ramble off across the canvas
      bf.driftCx = clamp(bf.x, 80, cssW - 80); bf.driftCy = clamp(hY - 24, cssH * 0.14, cssH * 0.5);
      bf.driftTX = bf.driftCx; bf.driftTY = bf.driftCy; bf.phase = Math.random() * Math.PI * 2; bf.nextDrift = t + 500;
    }

    // butterfly flight + cat-reaction logic (stage CSS-px space)
    function updateButterfly(t, dt, state) {
      const busy = state === 'TYPE' || state === 'CLIMB' || state === 'NUZZLE' || state === 'GRAB' || state === 'SLEEP';
      if (!bflyActive() || busy) { lookOverride = null; tailTwitch = 0; lookSnap = false; return; }
      // occasional-visitor lifecycle: appear, play a while, then leave for a long gap
      if (!bf.present) {
        if (bf.nextVisit < 0) bf.nextVisit = t + BFLY_FIRST_GAP_MS[0] + Math.random() * BFLY_FIRST_GAP_MS[1];   // first appearance
        if (t > bf.nextVisit) startBflyVisit(t);
        else { lookOverride = null; tailTwitch = 0; lookSnap = false; return; }
      }
      tailTwitch = 0; lookSnap = false;   // default off each frame; the watch block raises them near prey
      // caught: parked at the cat's paws during the catch sequence, then it escapes upward
      if (bf.caught) {
        if (t > catchUntil) {
          bf.caught = false; bf.mode = 'dodge'; bf.dodgeUntil = t + 750;
          bf.x = footX + (Math.random() * 2 - 1) * 20; bf.y = footY - SH * scale * 0.95;
          bf.vx = (Math.random() * 2 - 1) * 4; bf.vy = -7.5;
          bf.wpX = clamp(footX + (Math.random() * 2 - 1) * 130, 20, cssW - 20); bf.wpY = cssH * 0.22;
          bf.until = Math.min(bf.until, t + 1800);   // wriggles free, then flutters off shortly after
        } else {
          bf.x = footX; bf.y = footY - SH * scale * 0.12; lookOverride = { x: 0, y: 1 };
          return;
        }
      }
      // perched on the nose: hold a cross-eyed freeze, then sneeze it off
      if (bf.mode === 'land') {
        const nx = footX + (sitSprite.muzzle.x - SW / 2) * scale;
        const ny = footY - SH * scale + sitSprite.muzzle.y * scale;
        bf.x = nx; bf.y = ny - 2 + Math.sin(t / 160); bf.flap += 0.08;
        landReactUntil = t + 120; lookOverride = { x: 0, y: 1 };
        if (t > bf.landUntil) {
          sneezeT0 = t; sneezeUntil = t + 600; say('achoo!', 800);
          bf.mode = 'dodge'; bf.dodgeUntil = t + 700;
          bf.vx = (Math.random() * 2 - 1) * 3; bf.vy = -8;
          bf.wpX = clamp(footX + (Math.random() * 2 - 1) * 120, 20, cssW - 20); bf.wpY = cssH * 0.22;
          if (rect) onHearts(rect.left + nx, rect.top + ny - 6);
        }
        return;
      }
      const dtf = Math.min(dt, 50) / 16.67;
      if (bf.jinkAt >= 0 && t >= bf.jinkAt) { bf.vx = bf.jinkVx; bf.vy = bf.jinkVy; bf.jinkAt = -1; }   // delayed near-miss escape
      // cursor speed (px/ms), smoothed - used to tell a still cursor (lure) from a fast flick (flee)
      if (rect) { const ddt = Math.max(1, t - lastCurT); curSpeed += (Math.min(3, Math.hypot(curX - lastCurX, curY - lastCurY) / ddt) - curSpeed) * 0.3; lastCurX = curX; lastCurY = curY; lastCurT = t; }

      const headX = footX, headY = footY - SH * 0.72 * scale;
      // visit is over -> head for the nearest edge and leave
      if (bf.mode !== 'out' && t > bf.until) bf.mode = 'out';
      // mode transitions (never interrupt a departure)
      if (bf.mode !== 'out') {
        if (bf.mode === 'dodge' && t > bf.dodgeUntil) bf.mode = 'wander';
        if (bf.mode === 'wander' && t > bf.nextLap) {
          bf.mode = 'lap'; bf.lapEdge = bf.x < headX ? -1 : 1; bf.nextLap = t + 6000 + Math.random() * 3000;
        } else if (bf.mode === 'wander' && t > bf.nextDive) {
          bf.mode = 'dive'; bf.diveUntil = t + 1800; bf.nextDive = t + 1800 + Math.random() * 2200;
          if (Math.random() < 0.45 && autoState !== 'HUNT') { autoState = 'HUNT'; autoUntil = t + REEL_MS.HUNT; nextAuto = autoUntil + 1600; flickT0 = t; }   // stand-up bat
        }
        if (bf.mode === 'dive' && t > bf.diveUntil) bf.mode = 'wander';
      }

      // a still cursor (not a fast flick) on the canvas lures the butterfly to circle it
      const cxp = rect ? curX - rect.left : headX, cyp = rect ? curY - rect.top : headY;
      const lure = !!rect && t - lastMove < 2500 && curSpeed < 0.35 &&
        cxp > 0 && cxp < cssW && cyp > 0 && cyp < cssH * 0.85 && Math.hypot(cxp - headX, cyp - headY) > 40;

      // steering target
      let tx, ty, burst = false;
      if (bf.mode === 'out') { tx = bf.x < headX ? -40 : cssW + 40; ty = bf.y - 50; }
      else if (bf.mode === 'lap') { tx = bf.lapEdge < 0 ? -60 : cssW + 60; ty = bf.y - 24; }
      else if (bf.mode === 'dive') { const dvX = lure ? cxp : headX, dvY = lure ? cyp : headY; tx = dvX + Math.sin(t / 200) * 22; ty = dvY - 6 + Math.cos(t / 170) * 10; }
      else if (bf.mode === 'dodge') { tx = bf.wpX; ty = bf.wpY; }
      else {
        // air-current glider: a wandering center traces a lazy figure-eight across the canvas,
        // with periodic flap-bursts to climb then glide back down. A still cursor lures the center.
        bf.phase += DRIFT_PHASE_RATE * dtf;
        const ax = Math.min(cssW * 0.30, 220), ay = Math.min(cssH * 0.16, 100);
        if (t > bf.nextDrift) {
          const de = Math.min(ax + 24, cssW * 0.42);
          bf.driftTX = de + Math.random() * Math.max(0, cssW - 2 * de);
          bf.driftTY = cssH * 0.14 + Math.random() * Math.max(0, cssH * 0.36);
          bf.nextDrift = t + DRIFT_REPICK_MS[0] + Math.random() * DRIFT_REPICK_MS[1];
        }
        if (lure) { bf.driftTX += (cxp - bf.driftTX) * 0.5; bf.driftTY += (cyp - bf.driftTY) * 0.5; }
        bf.driftCx += (bf.driftTX - bf.driftCx) * DRIFT_EASE * dtf;
        bf.driftCy += (bf.driftTY - bf.driftCy) * DRIFT_EASE * dtf;
        tx = bf.driftCx + ax * Math.sin(bf.phase);
        ty = bf.driftCy + ay * Math.sin(bf.phase * LISSA_RATIO + LISSA_DELTA);
        burst = Math.sin(bf.phase * BURST_RATIO) > BURST_GATE;
        if (burst) ty -= BURST_LIFT;                         // flap-burst to gain height, then glide back down
        bf.wpX = tx; bf.wpY = ty;                            // keep wp synced so dodge/return targets stay sane
      }
      const accel = bf.mode === 'dodge' ? 0.02 : (bf.mode === 'dive' ? 0.045 : (bf.mode === 'out' || bf.mode === 'lap' ? 0.05 : WANDER_ACCEL));
      bf.vx += (tx - bf.x) * accel * dtf; bf.vy += (ty - bf.y) * accel * dtf;
      bf.vx += Math.sin(t / 130 + 1.3) * 0.5 * dtf; bf.vy += Math.sin(t / 90) * 0.6 * dtf;   // organic flutter

      // a fast cursor flick scares it off (a still cursor lures it instead - handled in steering)
      if (rect && t - lastMove < 1500 && curSpeed > 0.6) {
        const dx = bf.x - (curX - rect.left), dy = bf.y - (curY - rect.top), d = Math.hypot(dx, dy);
        if (d < 80 && d > 0.1) { const f = (80 - d) / 80 * 3.8; bf.vx += dx / d * f * dtf; bf.vy += dy / d * f * dtf; }
      }

      if (bf.jinkAt >= 0) { bf.vx *= 0.5; bf.vy *= 0.5; }   // quiver in place until the jink fires
      bf.vx *= 0.92; bf.vy *= 0.92;
      const sp = Math.hypot(bf.vx, bf.vy), maxv = bf.mode === 'dodge' ? 9.5 : (bf.mode === 'out' || bf.mode === 'lap' ? 9 : 5.5);
      if (sp > maxv) { bf.vx *= maxv / sp; bf.vy *= maxv / sp; }
      bf.x += bf.vx * dtf; bf.y += bf.vy * dtf;
      bf.bank += (clamp(-bf.vx * 0.05, -0.5, 0.5) - bf.bank) * 0.16;   // bank into turns for weight

      // leaving: let it fly off the edge, then despawn until the next (rare) visit
      if (bf.mode === 'out') {
        bf.flap += flapStep(sp, bf.vy) * dtf;
        if (bf.x < -30 || bf.x > cssW + 30) {
          bf.present = false; bf.nextVisit = t + BFLY_GAP_MS[0] + Math.random() * BFLY_GAP_MS[1]; lookOverride = null;
        } else {
          const dxo = bf.x - headX, dyo = bf.y - headY;   // cat's gaze follows it out
          lookOverride = { x: clamp(dxo / 120, -1, 1), y: clamp(dyo / 90, -1, 1) };
        }
        return;
      }

      // costume lap: duck off one edge, swap color (with a sparkle poof), swoop back from the other side
      if (bf.mode === 'lap') {
        bf.flap += flapStep(sp, bf.vy) * dtf;
        if (bf.x < -40 || bf.x > cssW + 40) {
          lapPoofX = clamp(bf.x, 4, cssW - 4); lapPoofY = clamp(bf.y, 4, cssH - 4); lapPoofT0 = t;
          bf.palIdx = pickStyle(bf.palIdx);
          const side = -bf.lapEdge;                                   // return from the opposite edge
          bf.x = side < 0 ? -24 : cssW + 24; bf.y = clamp(headY + (Math.random() * 2 - 1) * 40, 24, cssH * 0.5);
          bf.vx = side < 0 ? 6 : -6; bf.vy = 0;
          bf.wpX = headX; bf.wpY = headY - 16; bf.nextWp = t + 900; bf.mode = 'wander';
        } else {
          const dxo = bf.x - headX, dyo = bf.y - headY;
          lookOverride = { x: clamp(dxo / 120, -1, 1), y: clamp(dyo / 90, -1, 1) };
        }
        return;
      }

      // soft edges: steer gently inward near the margins so it banks away (no hard ricochet)
      const edge = 40, floorY = cssH * 0.82;
      if (bf.x < edge)          bf.vx += (edge - bf.x) / edge * 0.9 * dtf;
      if (bf.x > cssW - edge)   bf.vx -= (bf.x - (cssW - edge)) / edge * 0.9 * dtf;
      if (bf.y < edge)          bf.vy += (edge - bf.y) / edge * 0.9 * dtf;
      if (bf.y > floorY - edge) bf.vy -= (bf.y - (floorY - edge)) / edge * 0.9 * dtf;
      bf.x = clamp(bf.x, 8, cssW - 8); bf.y = clamp(bf.y, 8, floorY);
      bf.flap += flapStep(sp, bf.vy) * dtf * (burst ? FLAP_BURST_MULT : 1);   // wings beat harder during a climb-burst

      // cat watches the butterfly when it's in range
      const dxh = bf.x - headX, dyh = bf.y - headY, dh = Math.hypot(dxh, dyh);
      if (dh < cssW * 0.55) lookOverride = { x: clamp(dxh / 120, -1, 1), y: clamp(dyh / 90, -1, 1) };
      else lookOverride = null;
      tailTwitch = dh < 120 ? clamp((120 - dh) / 120, 0, 1) : 0;     // tail tip stutters as prey nears
      lookSnap = dh < 110;                                           // gaze springs/overshoots onto a close bug
      const flickGap = 1400 - clamp((90 - dh) / 90, 0, 1) * 850;     // flicks come faster the closer it gets
      if (dh < 90 && t - flickT0 > flickGap) flickT0 = t;            // tail/ear flick when the bug is right there
      // chatter "ekekek" at a bug hovering just out of reach overhead
      if (state === 'IDLE' && bf.mode === 'wander' && dh < cssW * 0.5 && bf.y < headY - 58 && t > chatterCool && t > swatUntil && t > catchUntil) {
        chatterUntil = t + 1200; chatterCool = t + 9000; say('ekekek!', 900);
      }
      if (t < confusedUntil) lookOverride = { x: Math.sin(t / 110) * 0.5, y: -0.1 };   // "where'd it go?" after a whiff

      // gentle perch: while diving close, the bug sometimes lands on the nose instead (never a shiny)
      if (bf.mode === 'dive' && dh < 34 && state === 'IDLE' && !bf.shiny && t > landCool && t > swatUntil && t > catchUntil) {
        bf.mode = 'land'; bf.landUntil = t + 1100 + Math.random() * 500; landCool = t + 16000; say('!', 700);
      } else if (dh < 46 && t > swatCool && t > swatUntil && t > catchUntil) {
        // close contact: catch (rare for a shiny), a whiff (near miss), or a plain swat
        const catchP = bf.shiny ? 0.18 : 0.45, missP = bf.shiny ? 0.55 : 0.30;
        if (t > catchCool && Math.random() < catchP) {
          catchUntil = t + CATCH_MS; catchT0 = t; catchTX = bf.x; catchTY = bf.y; catchCool = t + 13000;
          bf.caught = true;
          if (bf.shiny) { say('✨ rare! ✨', CATCH_MS); if (rect) for (let h = 0; h < 3; h++) onHearts(rect.left + bf.x + (Math.random() * 40 - 20), rect.top + bf.y); }
          else say('got it! ♥', CATCH_MS);
        } else {
          const miss = Math.random() < missP;
          swatUntil = t + 420; swatTX = bf.x; swatTY = bf.y; swatCool = t + 800;
          say(miss ? 'almost!' : 'annoyed!', 600);
          if (miss) { confusedUntil = t + 700; if (Math.random() < 0.5) pendingGroomAt = t + 950; }   // sometimes save face by grooming
          bf.mode = 'dodge'; bf.dodgeUntil = t + (miss ? 600 : 520);
          const aw = Math.atan2(dyh, dxh) + (Math.random() - 0.5), kick = miss ? 10.5 : 9.5;
          // hold a beat so the paw nearly connects, THEN jink away (near-miss tension)
          bf.jinkVx = Math.cos(aw) * kick; bf.jinkVy = Math.sin(aw) * kick - 2; bf.jinkAt = t + 140;
          bf.vx *= 0.2; bf.vy *= 0.2;
          bf.wpX = clamp(bf.x + Math.cos(aw) * (miss ? 90 : 70), 20, cssW - 20); bf.wpY = clamp(bf.y + Math.sin(aw) * (miss ? 55 : 45), 14, cssH * 0.7);
        }
      }
    }

    // loop
    let running = false, rafId = 0, onScreen = true, lastDraw = 0, drewStatic = false;
    function now() { return performance.now(); }
    function frame() {
      rafId = 0;
      if (!running) return;
      if (document.hidden || !onScreen) return;
      const t = now();
      whiskT = t;
      const fdt = lastFrameT ? Math.min(60, t - lastFrameT) : 16; lastFrameT = t;
      if (reducedMotion) { if (!drewStatic) { paintStatic(); drewStatic = true; } return; }
      // update the head-hover pet latch BEFORE resolveState so the 30->60fps choice and
      // paint() agree on the same value this frame
      const onHead = rect ? overHead(curX - rect.left, curY - rect.top) : false;
      const overstimming = overstimT0 >= 0 && t - overstimT0 < WITHDRAW_MS;
      if (onHead && !overstimming) {
        if (headEnterAt < 0) headEnterAt = t;
        if (t - headEnterAt >= PET_DWELL_MS) { petHolding = true; petHoverUntil = t + PET_GRACE_MS; }
      } else { headEnterAt = -1; petHolding = false; }
      // continuous-pet streak (persists through the grace window) drives escalation + purr
      const petActive = petHolding || t < petHoverUntil;
      if (petActive) {
        if (petStreakT0 < 0) { petStreakT0 = t; bonkUntil = t + 360; say('bonk!', 500); }   // greeting head-bonk on arrival
        if (!purring) { purring = true; onPurrStart(); }
        if (t - petStreakT0 > OVERSTIM_MS && t > overstimCool && drowse < 0.4) {   // overstimulated (only if not drowsing off)
          overstimT0 = t; overstimCool = t + 20000; flickT0 = t;
          petHolding = false; petHoverUntil = 0; petStreakT0 = -1; petMelt = 0;
          purring = false; onPurrStop(); say('enough!', 900);
        }
      } else { petStreakT0 = -1; petMelt = 0; if (purring) { purring = false; onPurrStop(); } }
      canvas.style.cursor = t < petHoverUntil ? 'grab' : 'default';
      // belly bunny-kick trap: dwell still over the belly -> the cat seizes the cursor and kicks
      const zone = rect ? zoneAt(curX - rect.left, curY - rect.top) : null;
      const grabbing = t < grabUntil;
      if (!grabbing && zone === 'BELLY' && !petActive && t > grabCool && cursorV < 0.8) {
        if (grabEnterAt < 0) grabEnterAt = t;
        if (t - grabEnterAt >= GRAB_DWELL_MS) {
          grabT0 = t; grabUntil = t + GRAB_MS; grabCool = t + GRAB_MS + 5000; grabEnterAt = -1; say('gotcha! >:3', 900);
          if (navigator.vibrate) { try { navigator.vibrate([20, 40, 20, 40]); } catch (e) {} }
        }
      } else if (zone !== 'BELLY') grabEnterAt = -1;
      if (grabbing && t - grabT0 > 350 && cursorV > 1.6 && t - lastMove < 140) {   // fast yank -> break free
        grabUntil = t; lapPoofX = rect ? curX - rect.left : curX; lapPoofY = rect ? curY - rect.top : curY; lapPoofT0 = t;
        autoState = 'GROOM'; autoUntil = t + 1400; nextAuto = t + 3000; say('hmph!', 700);
      }
      // cuddle arc: gentle, near-still petting -> drowse -> asleep; a fast flick startles it awake
      const gentlePet = petActive && cursorV < 0.4;
      drowse += ((gentlePet ? 1 : (petActive ? 0.2 : 0)) - drowse) * Math.min(1, fdt / (gentlePet ? 4200 : 600));
      if (!asleep && drowse > 0.9 && petActive) { asleep = true; say('zzz…', 1600); }
      if (asleep) {
        if (cursorV > 1.3 && t - lastMove < 160) {   // startled awake
          asleep = false; drowse = 0; flickT0 = t; say('!', 600);
          autoState = 'GROOM'; autoUntil = t + 1400; nextAuto = t + 3000;
          petHolding = false; petHoverUntil = 0; petStreakT0 = -1;
        } else if (!petActive && t - lastMove > 2600) { asleep = false; drowse = 0; }   // wakes calmly when left alone
      }
      const st = resolveState(t);
      // 60fps while interacting/animating; 30fps idle; 20fps when fully quiet (no recent
      // cursor activity, no butterfly) to save CPU/battery without hurting eye-follow
      // transient butterfly reactions out-live bf.present; keep 60fps while any of them animate
      const reacting = t < sneezeUntil || t < confusedUntil || t < landReactUntil || t < chatterUntil ||
        bf.jinkAt >= 0 || (lapPoofT0 >= 0 && t - lapPoofT0 < 360) ||
        (meltSparkleAt >= 0 && t - meltSparkleAt < 500) || (overstimT0 >= 0 && t - overstimT0 < WITHDRAW_MS);
      const idle = (st === 'IDLE' || st === 'LOAF') && !(bflyActive() && bf.present) && !reacting && Math.abs(footX - restX) <= 0.5;
      const minFrame = idle ? (t - lastMove > 4000 ? 50 : 33) : 16;
      if (t - lastDraw >= minFrame) { paint(t); lastDraw = t; }
      rafId = requestAnimationFrame(frame);
    }
    function paintStatic() {
      resize();
      whiskT = 0;   // static/reduced-motion frame: whiskers rest, deterministic output
      ctx.clearRect(0, 0, cssW, cssH);
      ctx.save(); ctx.translate(footX, footY); ctx.scale(scale, scale); drawShadow(ctx, 0, 0, 0.17, SW * 0.30); ctx.restore();
      ctx.save(); ctx.translate(footX, footY); ctx.scale(scale, scale); drawTail(ctx, 0, 0, 0, pal, -1, false, SW, SH); ctx.restore();
      ctx.save(); ctx.translate(footX, footY); ctx.scale(scale, scale); ctx.translate(-SW / 2, -SH);
      drawCat(ctx, sitSprite, palRGB, { bob: 0, blinking: false, look: { x: 0, y: 0 }, eyeMode: 'open', blush: false });
      ctx.restore();
    }
    function kick() { if (running && !rafId && !document.hidden && onScreen && !reducedMotion) rafId = requestAnimationFrame(frame); }
    function stopPurr() { if (purring) { purring = false; onPurrStop(); } }
    function onVis() { if (document.hidden) stopPurr(); kick(); }

    // coat control
    function setCoat(i) {
      coatIndex = ((i % PATTERNS.length) + PATTERNS.length) % PATTERNS.length;
      buildCoat(coatIndex);
      try { localStorage.setItem('pixelcat.coat', String(coatIndex)); } catch (e) {}
      resize(); drewStatic = false;
      if (reducedMotion) paintStatic();
    }
    function nextCoat() { setCoat(coatIndex + 1); }
    function setButterfly(on, soon) {
      butterflyOn = !!on;
      if (!butterflyOn) { bf.present = false; lookOverride = null; }
      else { bf.present = false; bf.nextVisit = now() + (soon ? 0 : 9000 + Math.random() * 8000); }   // don't pop in instantly (unless summoned)
      kick();
    }

    // interaction API
    function onClick(e) {
      asleep = false; drowse = 0;
      onMeow(); onHearts(e.clientX, e.clientY);
      autoState = null; nuzzleUntil = now() + 700; nextAuto = now() + 9000;
      if (cycleCoatOnClick) nextCoat();
      kick();
    }
    function type() {
      lastKeyAt = now(); typeUntil = lastKeyAt + 480; heat = Math.min(1, heat + 0.11);
      autoState = null; nextAuto = lastKeyAt + 6000; kick();
    }
    function climb(dir) {
      climbDir = dir < 0 ? -1 : 1; climbUntil = now() + 1000; paperLen = Math.min(60, paperLen + 26);
      climbY = clamp(climbY + (climbDir < 0 ? 20 : -20), -cssH * 0.16, cssH * 0.32);   // travel up/down the rope
      autoState = null; nextAuto = now() + 6000; kick();
    }

    // observers / listeners
    let ro = null, io = null;
    function bind() {
      window.addEventListener('mousemove', onMove, { passive: true });
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', relayout);
      canvas.addEventListener('pointerdown', onClick);
      document.addEventListener('visibilitychange', onVis);
      if (window.ResizeObserver) { ro = new ResizeObserver(() => { relayout(); }); ro.observe(canvas); }
      if (window.IntersectionObserver) {
        io = new IntersectionObserver((es) => { es.forEach((x) => { onScreen = x.isIntersecting; if (onScreen) kick(); }); }, { threshold: 0.01 });
        io.observe(canvas);
      }
      if (mq.addEventListener) mq.addEventListener('change', (e) => { reducedMotion = e.matches; drewStatic = false; if (reducedMotion) paintStatic(); else kick(); });
    }
    function unbind() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', relayout);
      canvas.removeEventListener('pointerdown', onClick);
      document.removeEventListener('visibilitychange', onVis);
      if (ro) ro.disconnect();
      if (io) io.disconnect();
    }

    let bound = false;
    function start() { if (!bound) { bind(); bound = true; } running = true; resize(); if (reducedMotion) { paintStatic(); drewStatic = true; } else kick(); }
    function stop() { running = false; if (rafId) cancelAnimationFrame(rafId); rafId = 0; stopPurr(); }
    function destroy() { stop(); if (bound) { unbind(); bound = false; } }

    start();
    function greet(msg) { asleep = false; drowse = 0; nuzzleUntil = now() + 1500; autoState = null; nextAuto = now() + 6000; say(msg || 'welcome back ♥', 1900); kick(); }
    function gift() {
      const t0 = now(); giftUntil = t0 + 3000; asleep = false; drowse = 0; autoState = null; nextAuto = t0 + 4500; say('a gift for you! ♥', 2800);
      if (rect) for (let h = 0; h < 4; h++) onHearts(rect.left + footX + (Math.random() * 40 - 20), rect.top + (footY - SH * 0.7 * scale));
      kick();
    }
    return { start, stop, setCoat, nextCoat, destroy, type, climb, setButterfly, greet, gift,
      setName: (n) => { catName = typeof n === 'string' ? n : ''; },
      _debug: () => ({ zone: rect ? zoneAt(curX - rect.left, curY - rect.top) : null, gesture: gesture(), name: catName,
        footX, restX, travelTX, bfx: bf.x, bfy: bf.y, present: bf.present, mode: bf.mode, stalkUntil, state: resolveState(now()) }) };
  }

  window.PixelCatLive = { init };
})();
