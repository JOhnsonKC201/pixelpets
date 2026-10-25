// Static coat thumbnail draw for the website's coat gallery. Geometry + palettes
// come from the shared cat-sprite.js (loaded first); this only adds the static
// single-frame sit-sprite draw. Ported verbatim from src/cat-preview.js so the
// gallery cats match the desktop sprite exactly. Exposes
// window.PixelcatPreview = { PATTERNS, PATTERN_BUILD, TABBY, BUILDS, draw, drawDog }.
// drawDog is a no-op on the site: it guards on composeSitDog, which the site's
// cat-sprite.js bundle does not define.
(function () {
  function drawCatStatic(g, sp, palRGB, opts) {
    const noWhiskers = !!(opts && opts.noWhiskers);
    const grid = sp.grid, COLS = sp.COLS, ROWS = sp.ROWS;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const ch = grid[r][c]; if (ch === '.') continue;
      const base = ch === 'E' ? palRGB.E : palRGB[ch]; if (!base) continue;
      const f = BODY.has(ch) ? 1.12 - (r / ROWS) * 0.34 : 1;
      g.fillStyle = f === 1 ? rgbStr(base) : shadeStr(base, f);
      g.fillRect(c * CELL, r * CELL, CELL, CELL);
    }
    if (!noWhiskers) drawWhiskers(g, sp, 0, null);   // at rest, whole pixels (cat-sprite.js)
    for (const e of sp.eyes) {
      if (!isFinite(e.cx) || e.w <= 0) continue;
      const pw = Math.max(4, Math.round(e.w * 0.46)), ph = Math.max(5, Math.round(e.h * 0.7));
      const px = Math.round(e.cx - pw / 2), py = Math.round(e.cy - ph / 2);
      g.fillStyle = '#22242b'; g.fillRect(px, py + 1, pw, ph - 2); g.fillRect(px + 1, py, pw - 2, ph);
      g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(px + pw - 3, py + 1, 2, 2);
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(px + 1, py + ph - 3, 2, 2);
    }
  }
  function draw(canvas, pal, build, tabby) {
    if (!canvas || !pal) return;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const B = Object.assign({}, BUILDS[build] || BUILDS.standard, { tabby: !!tabby });
    const sp = buildSprite(24, 30, () => composeSit(B));
    const palRGB = { O: toRgb(pal.outline), C: toRgb(pal.coat), K: toRgb(pal.mark), W: toRgb(pal.white), X: toRgb(pal.patch), I: toRgb(pal.inner), N: toRgb(pal.nose), E: toRgb(pal.eye), H: toRgb(HALO) };
    const oc = document.createElement('canvas'); oc.width = sp.SW; oc.height = sp.SH;
    const octx = oc.getContext('2d'); octx.imageSmoothingEnabled = false;
    drawCatStatic(octx, sp, palRGB);
    const scale = Math.min((canvas.width - 8) / sp.SW, (canvas.height - 8) / sp.SH);
    const dw = sp.SW * scale, dh = sp.SH * scale;
    ctx.drawImage(oc, 0, 0, sp.SW, sp.SH, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  }
  // Same preview for the dog, using the canine composer and no whiskers.
  function drawDog(canvas, pal, build) {
    if (!canvas || !pal || typeof composeSitDog !== 'function') return;
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const B = Object.assign({}, DOG_BUILDS[build] || DOG_BUILDS[DOG_PATTERN_BUILD[0]]);
    const sp = buildSprite(24, 30, () => composeSitDog(B));
    const palRGB = { O: toRgb(pal.outline), C: toRgb(pal.coat), K: toRgb(pal.mark), W: toRgb(pal.white), X: toRgb(pal.patch), I: toRgb(pal.inner), N: toRgb(pal.nose), E: toRgb(pal.eye), H: toRgb(HALO), T: toRgb(pal.tongue || '#e8747f') };
    const oc = document.createElement('canvas'); oc.width = sp.SW; oc.height = sp.SH;
    const octx = oc.getContext('2d'); octx.imageSmoothingEnabled = false;
    drawCatStatic(octx, sp, palRGB, { noWhiskers: true });
    const scale = Math.min((canvas.width - 8) / sp.SW, (canvas.height - 8) / sp.SH);
    const dw = sp.SW * scale, dh = sp.SH * scale;
    ctx.drawImage(oc, 0, 0, sp.SW, sp.SH, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  }
  window.PixelcatPreview = { PATTERNS, PATTERN_BUILD, TABBY, BUILDS, draw, drawDog };
})();
