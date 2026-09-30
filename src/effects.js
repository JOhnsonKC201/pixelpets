// Small status indicators + hearts drawn over the cat (thinking dots, working
// spinner, "done!" burst, love heart). Classic <script> loaded before the overlay,
// sharing its global scope; draws on the shared canvas context `ctx`.
// Kept out of the overlay so the main loop stays about the main loop.
/* exported drawThinkBubble, drawWorkBubble, drawDoneSpark, drawHeart, drawSparkle, drawGuitar, drawNote */

// Thinking indicator: three dots that pulse near the head (AI agent working).
function drawThinkBubble(x, y, t) {
  // a little thought puff: two rising tail bubbles + three dots that fill in a wave.
  // Each dot has a light fill AND a dark rim so it reads on any desktop background.
  const dot = (dx, dy, r, alpha) => {
    ctx.globalAlpha = alpha; ctx.fillStyle = '#f3f6fb';
    ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha * 0.45; ctx.strokeStyle = '#3a3f4b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2); ctx.stroke();
  };
  dot(-3, 7, 1.3, 0.5);                                  // tail bubbles trailing to the head
  dot(0, 4, 1.8, 0.7);
  for (let i = 0; i < 3; i++) {
    const a = (Math.sin(t / 240 - i * 0.9) + 1) / 2;     // brighten left-to-right
    dot(i * 6, -a * 1.5, 2.4, 0.35 + a * 0.6);
  }
  ctx.globalAlpha = 1;
}
// "Working" spinner near the head while an AI agent is editing/testing/building.
function drawWorkBubble(x, y, t) {
  const cx = x + 4, cy = y - 1, R = 5.2, a = t / 220;
  ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.globalAlpha = 0.18; ctx.strokeStyle = '#5a8f5a';   // faint full track
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  ctx.globalAlpha = 0.95; ctx.strokeStyle = '#7bc47b';   // bright sweeping arc reads as "loading"
  ctx.beginPath(); ctx.arc(cx, cy, R, a, a + Math.PI * 1.15); ctx.stroke();
  ctx.globalAlpha = 1;
}
// Little "!" + sparkles above the head when an AI agent finishes a task.
function drawDoneSpark(x, y, t) {
  ctx.fillStyle = '#ffd54a';
  ctx.fillRect(x - 1, y - 7, 2, 5); ctx.fillRect(x - 1, y - 1, 2, 2);   // exclamation
  ctx.fillStyle = '#fff3b0';
  // a few twinkling 4-point stars pulsing out of phase -> a celebratory little burst
  const star = (dx, dy, sp) => {
    const tw = (Math.sin(t / sp) + 1) / 2;
    const r = Math.round(1 + tw * 1.5);
    ctx.globalAlpha = 0.35 + tw * 0.65;
    const sx = Math.round(x + dx), sy = Math.round(y + dy);
    ctx.fillRect(sx, sy - r, 1, r * 2 + 1);                             // vertical spoke
    ctx.fillRect(sx - r, sy, r * 2 + 1, 1);                             // horizontal spoke
  };
  star(10, -5, 100); star(-11, -2, 135); star(6, -12, 168);
  ctx.globalAlpha = 1;
}
function drawHeart(x, y, color, alpha, s) {
  s = s || 1;
  ctx.globalAlpha = alpha; ctx.fillStyle = color;
  const r = (dx, dy, w, h) => ctx.fillRect(Math.round(x + dx * s), Math.round(y + dy * s), Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)));
  r(-5, -4, 3, 3); r(2, -4, 3, 3);                          // two top bumps
  r(-5, -1, 10, 3);                                         // wide middle
  r(-4, 2, 8, 2); r(-2, 4, 4, 2); r(-1, 6, 2, 1);           // taper to a point
  ctx.globalAlpha = 1;
}
// A soft-pink 4-point sparkle/twinkle that scales with `s` - mixed in among the love
// hearts now and then. Same pixel-spoke idea as the stars in drawDoneSpark.
function drawSparkle(x, y, alpha, s) {
  s = s || 1;
  ctx.globalAlpha = alpha; ctx.fillStyle = '#ffd1e0';            // soft pink, matches the love theme
  const r = Math.max(1, Math.round(3 * s));
  ctx.fillRect(Math.round(x), Math.round(y - r), 1, r * 2 + 1);  // vertical spoke
  ctx.fillRect(Math.round(x - r), Math.round(y), r * 2 + 1, 1);  // horizontal spoke
  const d = Math.max(1, Math.round(r * 0.6));                    // four diagonal glints
  ctx.fillRect(Math.round(x - d), Math.round(y - d), 1, 1); ctx.fillRect(Math.round(x + d), Math.round(y - d), 1, 1);
  ctx.fillRect(Math.round(x - d), Math.round(y + d), 1, 1); ctx.fillRect(Math.round(x + d), Math.round(y + d), 1, 1);
  ctx.globalAlpha = 1;
}
// A small acoustic guitar held across the cat's lap while the Lobby Jam plays; the
// strumming paw bobs with `phase` (0..1 within the beat). Drawn in screen coords.
function drawGuitar(x, y, phase) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(-0.5);
  const e = (cx, cy, rx, ry, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); };
  ctx.fillStyle = '#5a3a1c'; ctx.fillRect(-31, -4, 21, 4.5);                                // neck
  ctx.fillStyle = '#3a2410'; ctx.fillRect(-35, -5.5, 5, 7);                                 // headstock
  ctx.fillStyle = '#e6d199'; ctx.fillRect(-34, -4.5, 2, 1); ctx.fillRect(-34, -1.5, 2, 1);  // tuning pegs
  e(-2, 0, 13, 10, '#6e4220'); e(-13, -2, 9, 7, '#6e4220');                                 // body outline (two bouts)
  e(-2, 0, 11.4, 8.6, '#bb7831'); e(-13, -2, 7.6, 5.8, '#bb7831');                          // wood
  e(-6, -3, 5, 3.4, '#db944b');                                                             // top-left sheen
  e(-3, 0, 3, 2.5, '#21130a');                                                              // soundhole
  ctx.strokeStyle = '#efe2c0'; ctx.globalAlpha = 0.7; ctx.lineWidth = 0.6;
  for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(-31, -3 + i * 1.1); ctx.lineTo(6, 1 + i * 1.5); ctx.stroke(); }   // strings
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#3a2410'; ctx.fillRect(4, -1, 3, 3);                                      // bridge
  const sp = Math.sin(phase * Math.PI * 2) * 2.4;                                            // strumming paw
  e(2, 2 + sp, 3.2, 2.6, '#2c2230'); e(2, 2 + sp, 2.4, 1.9, '#3b3046');
  ctx.fillStyle = '#d2a6cf'; ctx.fillRect(0, 1 + sp, 1, 1); ctx.fillRect(3, 1 + sp, 1, 1);   // toe beans
  ctx.restore();
}
// A floating music note (♪, or ♫ when `kind`). Soft purple, like the thinking dots.
function drawNote(x, y, alpha, kind) {
  ctx.save();
  ctx.globalAlpha = alpha; ctx.fillStyle = '#c6a6e4';
  x = Math.round(x); y = Math.round(y);
  ctx.fillRect(x + 3, y - 7, 1.4, 8);                                                        // stem
  ctx.beginPath(); ctx.ellipse(x + 2, y + 1, 2.3, 1.7, -0.3, 0, Math.PI * 2); ctx.fill();    // note head
  if (kind) {
    ctx.fillRect(x + 7, y - 8, 1.4, 8);
    ctx.beginPath(); ctx.ellipse(x + 6, y, 2.3, 1.7, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(x + 4, y - 8, 4, 1.4);                                                      // beam (♫)
  } else {
    ctx.fillRect(x + 4, y - 7, 3, 1.3);                                                      // flag (♪)
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
