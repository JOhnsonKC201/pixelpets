// The --reel capture window: films one forced pose to a run of PNG frames for
// scripts/make-reel.js. Never part of a normal launch.
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const { hardenNav } = require('./harden-nav');

// `--drag`: play a real drag on a loop, instead of forcing a pose.
//
// `--state=mochi` looks like the right way to film the stretch, and it is not.
// That branch PINS head and feet to fixed offsets with zero velocity on every
// frame, so it is a held pose for eyeballing proportions in a still. Filmed, it is
// a frozen cat sitting in the middle of nine animated clips, which reads as a bug
// rather than as a pose. The stretch is a spring simulation, and it only runs when
// the cat is genuinely being dragged.
//
// So: no forced state, and drive the two variables a real drag drives. Both are
// top-level `let`s in the overlay, which classic scripts put in the global lexical
// environment, so later global code reaches them by name. tests/overlay-vm-backed
// tests already lean on this, and tests/reel-spec.test.js pins the names.
// Timings are deliberate. While `grabbing`, the feet spring chases the head slowly
// (FK 0.07) AND takes gravity every frame, so the head-to-feet distance grows for
// as long as you hold on. A long hold stretches the body past the point where the
// middle band has any width left and the cat renders as a black hairline. The
// app's own held pose puts the head at 1.7 x SH above the feet, so that is the
// shape to aim at: lift fast, waggle briefly, let go, and spend most of the loop
// on the bounce back, which is the good part anyway.
// LEAD phase-locks the loop to the capture. The driver starts when the page
// finishes loading, the recorder starts after `--warmup` paints, and if those two
// clocks are not lined up the clip opens somewhere random in the cycle - which in
// practice meant a full second of a cat just sitting under a label that promises a
// stretch. Hold still for LEAD ms, set `--warmup` to the same span, and frame 0 is
// the moment the hand comes down.
const DRAG_DRIVER = `(() => {
  const T = 2400, LEAD = 1000, t0 = performance.now();
  setInterval(() => {
    const since = performance.now() - t0 - LEAD;
    if (since < 0) { grabbing = false; cursor.x = 24; cursor.y = 300; return; }
    const u = (since % T) / T;
    // Park the pointer well clear of the pet whenever it is not being held. Left
    // resting on the head, a released pointer is indistinguishable from a pat: the
    // cat purrs, hearts come up, and petBurstUntil LATCHES that for a while, so the
    // clip labelled "drag it" fills up with hearts instead of a stretch.
    if (u >= 0.55) {
      grabbing = false;
      cursor.x = 24; cursor.y = 300;
      petBurstUntil = 0; petTouchUntil = 0;
      return;
    }
    // Snap the lift, do not ease it. The head spring is fast (HK 0.45) and the feet
    // spring is slow (FK 0.07), so it is the SPEED of the lift that opens the gap
    // between them, and that gap IS the stretch. Lift gently and the whole cat just
    // travels upward in one piece, which is a different and much duller gag.
    if (u < 0.08) {
      grabbing = true;
      cursor.x = 130;
      cursor.y = 250 - (u / 0.08) * 145;
      return;
    }
    grabbing = true;                                                  // dangled and waggled
    cursor.x = 130 + Math.sin((u - 0.08) * 150) * 12;
    cursor.y = 105;
  }, 16);
})();`;

// `--reel`: record a run of frames of ONE forced pose, for the demo video.
//
// Three deliberate choices, each of which took a failure to arrive at:
//   - OFFSCREEN rather than a visible window. The frames have to be 1920x1080 and a
//     real window cannot exceed the physical display, so a visible window silently
//     caps the capture at whatever the monitor is.
//   - The backdrop is injected with insertCSS and captured WITH the pet, instead of
//     compositing a transparent capture afterwards. capturePage() on a transparent
//     window is unreliable about the alpha channel on Windows, and a lost alpha
//     looks like a black box behind the cat rather than an error.
//   - The wallpaper goes in as a data: URI. index.html's CSP is
//     `img-src 'self' data:`, so a file:// url is blocked outright.
// It keeps `shot=1`: that is what pins the canvas at a fixed 260x320 regardless of
// window size (the overlay sizes it there and skips the resize listener), fixes the
// pet's position, and gates every prop flag including --bfly.
function createReelWindow(cli) {
  const { reel, stateArg, patternArg, dirArg, speciesArg, noteArg, hasFlag } = cli;
  if (!reel.out || !reel.bg) { console.error('[reel] --out=<dir> and --bg=<jpeg> are both required'); return app.quit(); }
  const win = new BrowserWindow({
    show: false, frame: false, useContentSize: true, width: reel.w, height: reel.h,
    webPreferences: {
      offscreen: true, preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  hardenNav(win);
  fs.mkdirSync(reel.out, { recursive: true });

  let saved = 0, seen = 0, done = false;
  const finish = (why) => {
    if (done) return;
    done = true;
    console.log(`[reel] ${saved}/${reel.frames} frames -> ${reel.out}${why ? ' (' + why + ')' : ''}`);
    app.quit();
  };

  win.webContents.on('paint', (_e, _dirty, image) => {
    if (done) return;
    seen += 1;
    if (seen <= reel.warmup) return;   // discard the first paints: the pose is still settling
    if ((seen - reel.warmup - 1) % reel.every !== 0) return;   // keep 1 paint in `every`
    fs.writeFileSync(path.join(reel.out, `f${String(saved).padStart(5, '0')}.png`), image.toPNG());
    saved += 1;
    if (saved >= reel.frames) finish();
  });
  win.webContents.on('console-message', (_e, _l, message) => console.log('[r]', message));

  win.webContents.once('did-finish-load', async () => {
    const bg = fs.readFileSync(reel.bg).toString('base64');
    await win.webContents.insertCSS(`
      html, body { background: #0b0d12 url("data:image/jpeg;base64,${bg}") center/cover no-repeat !important; }
      #cat { position: fixed !important; left: ${reel.left}px !important; top: ${reel.top}px !important;
             transform: scale(${reel.scale}) !important; transform-origin: top left !important; }
    `);
    if (reel.drag) await win.webContents.executeJavaScript(DRAG_DRIVER);
    win.webContents.setFrameRate(Math.min(60, reel.fps * reel.every));
    win.webContents.invalidate();
  });

  const params = ['shot=1'];
  if (stateArg) params.push(`state=${stateArg}`);
  if (patternArg) params.push(`pattern=${patternArg}`);
  if (dirArg) params.push(`dir=${dirArg}`);
  if (speciesArg) params.push(`species=${speciesArg}`);
  if (hasFlag('bfly')) params.push('bfly=1');
  if (hasFlag('treat')) params.push('treat=1');
  if (noteArg) params.push(`note=${encodeURIComponent(noteArg)}`);
  win.loadFile(path.join(__dirname, '..', 'index.html'), { search: params.join('&') });

  // Hard stop. A pose that stops producing paints (or a backdrop that fails to
  // decode) must not hang the batch that is looping over every move.
  setTimeout(() => finish('timed out'), reel.timeout);
}

module.exports = { createReelWindow, DRAG_DRIVER };
