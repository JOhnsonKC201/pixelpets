// Builds assets/pixelpets-reel.mp4: the real pet, on a real desktop, running
// through its moves with a label over each one. Made for a social feed, where the
// video autoplays muted and has about three seconds to say what the thing is.
//
// The frames are CAPTURED FROM THE APP, not redrawn. scripts/make-demo-gif.js takes
// the other road - it reimplements the cat in pure Node - and that road ends with a
// second cat that drifts from the real one: it carries four pose composers against
// the renderer's seventeen states, so most of its scenes are the sitting pose plus
// an effect. Here `electron . --reel --state=<x>` runs the actual renderer, so a
// pose is right by construction and a new pose costs a table row instead of a port.
//
//   node scripts/make-reel.js            # backdrop -> cards -> capture -> sheet -> encode
//   node scripts/make-reel.js capture    # just re-shoot the frames
//   node scripts/make-reel.js encode     # just re-cut the titles (frames are kept)
//   node scripts/make-reel.js sheet      # contact sheet, one frame per move
//   node scripts/make-reel.js clean      # drop the ~450 MB of captured frames
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FFMPEG = require('@ffmpeg-installer/ffmpeg').path;
const ELECTRON = require('electron');            // resolves to the electron binary

const WORK = path.join(ROOT, 'previews', 'reel');
const FRAMES = path.join(WORK, 'all');
const BACKDROP = path.join(WORK, 'backdrop.jpg');
const OUT = path.join(ROOT, 'assets', 'pixelpets-reel.mp4');

// ---- composition ------------------------------------------------------------
const W = 1920, H = 1080;
const FPS = 20;
const HOLD = 2.4;                                // seconds per move
const MOVE_FRAMES = Math.round(HOLD * FPS);
const TITLE_S = 2.0, END_S = 3.0;
const TITLE_FRAMES = Math.round(TITLE_S * FPS), END_FRAMES = Math.round(END_S * FPS);

const TASKBAR_H = 56;
const FLOOR = H - TASKBAR_H;                     // top edge of the taskbar
const FEET = FLOOR - 24;                         // where the pet's feet land

// Brand: the orange the README badges and the app icon already use. Nothing new
// invented for the video.
const ORANGE = '0xE8930C';

// The label is a FIXED band. Letting it track each pose's height was worse: it
// jumped around between cuts, and a label that moves reads as an accident. Instead
// every shot is framed so the pet clears the band (see `scale` below).
const RULE_Y = 150, RULE_W = 96, RULE_H = 4;
const LABEL_Y = 178, LABEL_SIZE = 54;
const LABEL_BOTTOM = LABEL_Y + LABEL_SIZE + 8;   // ~240
const PET_CLEARANCE = 48;                        // minimum gap from label to pet

// The coat: Tuxedo. It is the pet the author actually runs, and it is one of only
// three coats with painted rope-climb art (the rest fall back to swiping at a leaf),
// which the "climbs when you scroll" beat depends on.
const COAT = 'tuxedo';

// ---- the moves --------------------------------------------------------------
// `reach` is the topmost canvas row the pose actually paints, measured by reading
// the canvas alpha channel rather than eyeballed. It is the number the framing is
// built from, because the poses differ enormously: a loaf starts at row 125 and the
// rope climb fills the canvas from row 0. Framing every shot at ONE scale is what
// made the first cut look like a screenshot with a caption on it, because the
// compact poses ended up small under a label 400 px away from them.
//
// `scale` is then picked per move so each pose fills the frame and still clears the
// label band. tests/reel-spec.test.js recomputes that clearance and fails if a
// change to either number puts the pet under the text.
const MOVES = [
  { id: 'typing', state: 'typing', reach: 158, scale: 7, label: 'KNEADS THE KEYBOARD WHEN YOU TYPE' },
  // `reach` is the CAT here, not the rope. The alpha scan returns 0 for this pose
  // because the strand runs the full height of the painted scene, and framing to keep
  // a one-pixel rope clear of the label made this shot half the size of every other
  // one. The rope can pass behind the text; the cat cannot. The cat climbs, so this is
  // its reach at the TOP of the up-cycle, with the scale left deliberately short of
  // the computed maximum because that reach moves.
  { id: 'climb', state: 'paper', dir: 'up', reach: 19, scale: 2.9, label: 'CLIMBS WHEN YOU SCROLL', warmup: 30 },
  { id: 'hunt', state: 'hunt', reach: 173, scale: 7, label: 'STALKS YOUR CURSOR' },
  // No `state` on purpose, and the only move that films at `every: 3`.
  // `--state=mochi` is a HELD pose (the overlay pins the head and feet springs), so
  // filming it gives a frozen cat in the middle of nine moving ones. `--drag` runs a
  // real drag instead, and a real drag is a spring sim, which is unstable if the page
  // is stepped at 20 fps. Render at 60 and keep every third frame. See DRAG_DRIVER
  // and the `every` note in src/main.js.
  { id: 'mochi', drag: true, reach: 98, scale: 4.6, label: 'STRETCHES LIKE MOCHI WHEN YOU DRAG IT', warmup: 60, every: 3 },
  { id: 'pet', state: 'pet', reach: 85, scale: 4.3, label: 'PURRS WHEN YOU PET IT' },
  // `reach` here is the CAT, not the butterfly. The butterfly climbs to canvas row
  // 13 at the top of its arc, and framing to keep it in shot would push this wider
  // than the other nine for the sake of an accent. It is allowed to fly up past the
  // label instead.
  { id: 'butterfly', state: 'rearup', bfly: true, reach: 100, scale: 4.7, label: 'SWATS AT THE BUTTERFLY', warmup: 24 },
  { id: 'groom', state: 'groom', reach: 129, scale: 5.8, label: 'WASHES UP' },
  { id: 'stretch', state: 'stretch', reach: 83, scale: 4.2, label: 'BIG STRETCH' },
  { id: 'loaf', state: 'loaf', reach: 125, scale: 5.7, label: 'LOAFS WHEN YOU GO QUIET' },
  { id: 'work', state: 'work', reach: 124, scale: 5.6, label: 'WATCHES YOUR CODING AGENT WORK' },
];

// The canvas is a fixed 260x320 under `shot=1`, pet anchored at (130, 250) inside
// it. So placing a shot is just: feet on the floor, pet centred, and the pose's own
// `reach` says where its top edge lands.
function frameFor(m) {
  const top = Math.round(FEET - 250 * m.scale);
  const left = Math.round((W - 260 * m.scale) / 2);
  return { top, left, petTop: Math.round(top + m.reach * m.scale) };
}

// ---- helpers ----------------------------------------------------------------
const rel = (p) => path.relative(ROOT, p);
function ff(args, label) {
  const r = spawnSync(FFMPEG, ['-y', '-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { console.error(`ffmpeg failed (${label}), exit ${r.status}`); process.exit(1); }
}
// ffmpeg filter syntax eats ':' and '\', so a Windows font path has to be escaped
// before it goes anywhere near a filtergraph.
const filterPath = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:');
// Same for a drawtext VALUE. An unescaped ':' ends the option instead of printing,
// which does not error, it just truncates. A clock reading "12:29 AM" shipped as
// "12" before this existed, and the frame looked plausible enough to miss.
const filterText = (t) => String(t)
  .replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/%/g, '\\%');

const FONTS = { bold: 'C:/Windows/Fonts/segoeuib.ttf', semi: 'C:/Windows/Fonts/seguisb.ttf', reg: 'C:/Windows/Fonts/segoeui.ttf' };
const font = (k) => filterPath(fs.existsSync(FONTS[k]) ? FONTS[k] : FONTS.bold);

// Text with a soft shadow rather than a filled plate. The backdrop is dimmed enough
// (see buildBackdrop) that a plate is no longer needed to stay legible, and a hard
// black rectangle behind every caption was the single thing that made the first cut
// read as burned-in subtitles instead of as design.
function text(t, opts) {
  const o = Object.assign({ size: 54, y: 0, colour: 'white', f: 'bold', x: '(w-text_w)/2' }, opts);
  return `drawtext=fontfile='${font(o.f)}':text='${filterText(t)}'`
    + `:x=${o.x}:y=${o.y}:fontsize=${o.size}:fontcolor=${o.colour}`
    + ':shadowx=0:shadowy=3:shadowcolor=black@0.55'
    + (o.enable ? `:enable='${o.enable}'` : '')
    + (o.alpha ? `:alpha='${o.alpha}'` : '');
}

// ---- 1. backdrop ------------------------------------------------------------
// The desktop is built from the WALLPAPER FILE plus a drawn-in taskbar, never from a
// screenshot of the live desktop. A real screengrab can carry open windows,
// notifications, filenames and tab titles into a video that is about to be
// published, and nobody reviews 500 frames for that.
//
// It is then deliberately pushed back: dimmed, desaturated, softened, vignetted. The
// wallpaper is a high-detail landscape photo with the sun dead centre, which is the
// worst possible ground for a pixel sprite. Treated, it reads as a set the pet
// stands on rather than as something competing with it.
function wallpaperPath() {
  const appData = process.env.APPDATA || path.join(require('os').homedir(), 'AppData', 'Roaming');
  const wp = path.join(appData, 'Microsoft', 'Windows', 'Themes', 'TranscodedWallpaper');
  return fs.existsSync(wp) ? wp : null;
}

function buildBackdrop() {
  fs.mkdirSync(WORK, { recursive: true });
  const wp = wallpaperPath();
  if (!wp) { console.error('no wallpaper found; drop a 1920x1080 jpeg at ' + rel(BACKDROP)); process.exit(1); }

  const src = path.join(WORK, 'wall-src.jpg');
  fs.copyFileSync(wp, src);   // TranscodedWallpaper has no extension; ffmpeg sniffs it

  const clock = new Date();
  const hh = ((clock.getHours() + 11) % 12) + 1;
  const time = `${hh}:${String(clock.getMinutes()).padStart(2, '0')} ${clock.getHours() < 12 ? 'AM' : 'PM'}`;
  const date = `${clock.getMonth() + 1}/${clock.getDate()}/${clock.getFullYear()}`;

  ff(['-i', src, '-vf', [
    `scale=${W}:${H}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${W}:${H}`,
    'eq=brightness=-0.17:saturation=0.42:contrast=0.94',   // push it back
    'gblur=sigma=5',                                       // and out of focus
    'vignette=PI/4.2',
    `drawbox=x=0:y=${FLOOR}:w=${W}:h=${TASKBAR_H}:color=0x0E1017@0.88:t=fill`,
    `drawbox=x=0:y=${FLOOR}:w=${W}:h=1:color=white@0.09:t=fill`,
    text(time, { size: 16, y: FLOOR + 10, x: W - 132, f: 'semi', colour: 'white@0.9' }),
    text(date, { size: 16, y: FLOOR + 30, x: W - 132, f: 'semi', colour: 'white@0.9' }),
  ].join(','), '-q:v', '2', BACKDROP], 'backdrop');
  console.log(`backdrop  ${rel(BACKDROP)}  ${W}x${H}  dimmed, softened, vignetted`);
}

// ---- 2. title and end cards -------------------------------------------------
// Written straight into the frame sequence rather than encoded separately, so the
// whole reel stays one `%05d` run and there is no concat step to get wrong.
function buildCards() {
  fs.mkdirSync(FRAMES, { recursive: true });
  const logo = path.join(ROOT, 'assets', 'logo-mark.png');

  ff(['-loop', '1', '-i', BACKDROP, '-i', logo,
    '-filter_complex', '[1:v]scale=176:176[l];[0:v][l]overlay=x=(W-176)/2:y=286[b];'
      + `[b]${text('pixelpets', { size: 92, y: 492 })},`
      + `drawbox=x=(iw-${RULE_W})/2:y=616:w=${RULE_W}:h=${RULE_H}:color=${ORANGE}:t=fill,`
      + `${text('A PIXEL CAT THAT LIVES ON YOUR DESKTOP', { size: 30, y: 648, f: 'semi', colour: 'white@0.82' })}[v]`,
    '-map', '[v]', '-frames:v', String(TITLE_FRAMES), '-start_number', '0',
    path.join(FRAMES, 'f%05d.png')], 'title card');

  const endStart = TITLE_FRAMES + MOVES.length * MOVE_FRAMES;
  ff(['-loop', '1', '-i', BACKDROP, '-vf', [
    text('EVERY POSE IS DRAWN FROM CODE', { size: 34, y: 392, f: 'semi', colour: 'white@0.78' }),
    `drawbox=x=(iw-${RULE_W})/2:y=458:w=${RULE_W}:h=${RULE_H}:color=${ORANGE}:t=fill`,
    text('github.com/JOhnsonKC201/pixelpets', { size: 54, y: 504 }),
    text('MIT LICENSED    WINDOWS AND MACOS BETA', { size: 26, y: 606, f: 'semi', colour: 'white@0.62' }),
  ].join(','), '-frames:v', String(END_FRAMES), '-start_number', String(endStart),
  path.join(FRAMES, 'f%05d.png')], 'end card');

  console.log(`cards     title ${TITLE_FRAMES}f, end ${END_FRAMES}f`);
}

// ---- 3. capture -------------------------------------------------------------
// One Electron run per move, each framed by its own scale. Frames are MOVED (not
// copied) into the single flat sequence as each move finishes, so ffmpeg reads one
// `%05d` pattern and half a gigabyte of PNG is never duplicated on disk.
function capture() {
  if (!fs.existsSync(BACKDROP)) buildBackdrop();
  fs.rmSync(FRAMES, { recursive: true, force: true });
  buildCards();

  let n = TITLE_FRAMES;
  for (const m of MOVES) {
    const dir = path.join(WORK, 'shots', m.id);
    const fr = frameFor(m);
    fs.rmSync(dir, { recursive: true, force: true });

    const args = ['.', '--reel', `--pattern=${COAT}`,
      `--out=${dir}`, `--bg=${BACKDROP}`,
      `--w=${W}`, `--h=${H}`, `--scale=${m.scale}`, `--left=${fr.left}`, `--top=${fr.top}`,
      `--frames=${MOVE_FRAMES}`, `--fps=${FPS}`, `--warmup=${m.warmup || 10}`, `--every=${m.every || 1}`,
      // Software rendering and a device scale of 1 are what make the capture
      // deterministic AND exactly W x H; without the scale override the frames come
      // back at the monitor's DPI. srgb pins the colour profile, otherwise Chromium
      // renders into the laptop's wide-gamut one and the encode is oversaturated.
      '--disable-gpu', '--force-device-scale-factor=1', '--force-color-profile=srgb'];
    if (m.state) args.push(`--state=${m.state}`);
    if (m.dir) args.push(`--dir=${m.dir}`);
    if (m.drag) args.push('--drag');
    if (m.bfly) args.push('--bfly');

    const r = spawnSync(ELECTRON, args, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], timeout: 180000 });
    const got = fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => x.endsWith('.png')).sort() : [];
    if (r.status !== 0 || got.length < MOVE_FRAMES) {
      console.error(`capture failed for ${m.id}: ${got.length}/${MOVE_FRAMES} frames (exit ${r.status})`);
      process.exit(1);
    }
    for (const g of got) fs.renameSync(path.join(dir, g), path.join(FRAMES, `f${String(n++).padStart(5, '0')}.png`));
    fs.rmSync(dir, { recursive: true, force: true });
    console.log(`captured  ${m.id.padEnd(10)} x${String(m.scale).padEnd(4)} petTop ${String(fr.petTop).padStart(4)}  "${m.label}"`);
  }
  fs.rmSync(path.join(WORK, 'shots'), { recursive: true, force: true });
  console.log(`captured  ${MOVES.length * MOVE_FRAMES} move frames -> ${rel(FRAMES)}`);
}

// ---- 4. contact sheet -------------------------------------------------------
// Every move has to be EYEBALLED before it ships. A wrong or renamed state renders a
// perfectly plausible sitting cat, so "it encoded without an error" proves nothing
// about whether the pet is doing what the label claims.
function sheet() {
  const out = path.join(WORK, 'sheet.png');
  const picks = MOVES.map((m, i) => path.join(FRAMES,
    `f${String(TITLE_FRAMES + i * MOVE_FRAMES + Math.floor(MOVE_FRAMES * 0.55)).padStart(5, '0')}.png`));
  if (picks.some((p) => !fs.existsSync(p))) { console.error('no frames yet; run `capture` first'); process.exit(1); }

  const chain = picks.map((_, i) =>
    `[${i}:v]scale=384:216,${text(MOVES[i].id, { size: 22, y: 8, x: 10 })}[c${i}]`).join(';');
  const tile = picks.map((_, i) => `[c${i}]`).join('') + `xstack=inputs=${picks.length}:layout=`
    + picks.map((_, i) => `${(i % 5) * 384}_${Math.floor(i / 5) * 216}`).join('|') + '[out]';

  ff([...picks.flatMap((p) => ['-i', p]), '-filter_complex', `${chain};${tile}`, '-map', '[out]', '-frames:v', '1', out], 'sheet');
  console.log(`sheet     ${rel(out)}  (check every pose against its label)`);
}

// ---- 5. encode --------------------------------------------------------------
function encode() {
  const total = TITLE_FRAMES + MOVES.length * MOVE_FRAMES + END_FRAMES;
  const have = fs.existsSync(FRAMES) ? fs.readdirSync(FRAMES).filter((x) => x.endsWith('.png')).length : 0;
  if (have < total) { console.error(`only ${have}/${total} frames; run capture first`); process.exit(1); }
  const dur = total / FPS;

  // One label per move, gated to its slice and cross-fading at the edges so the cuts
  // do not snap. `between` is inclusive at both ends, so each window stops a frame
  // short of the next start.
  const layers = [];
  MOVES.forEach((m, i) => {
    const t0 = (TITLE_FRAMES + i * MOVE_FRAMES) / FPS;
    const t1 = t0 + HOLD - 1 / FPS;
    const on = `between(t,${t0.toFixed(3)},${t1.toFixed(3)})`;
    const a = `max(0,min(1,min((t-${t0.toFixed(3)})/0.20,(${t1.toFixed(3)}-t)/0.20)))`;
    layers.push(`drawbox=x=(iw-${RULE_W})/2:y=${RULE_Y}:w=${RULE_W}:h=${RULE_H}:color=${ORANGE}:t=fill:enable='${on}'`);
    layers.push(text(m.label, { size: LABEL_SIZE, y: LABEL_Y, enable: on, alpha: a }));
  });

  // A thin progress rule along the very top. Cheapest way to tell a feed viewer how
  // much is left, and it makes the cut read as composed rather than as a clip that
  // happens to stop.
  layers.push(`drawbox=x=0:y=0:w='iw*t/${dur.toFixed(3)}':h=4:color=${ORANGE}@0.85:t=fill`);
  layers.push('fade=t=in:st=0:d=0.4', `fade=t=out:st=${(dur - 0.5).toFixed(2)}:d=0.5`);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  ff([
    '-framerate', String(FPS), '-i', path.join(FRAMES, 'f%05d.png'),
    // A silent track. The video is video-only otherwise, and muted-autoplay feeds are
    // the one place a missing audio stream reliably causes trouble.
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-vf', layers.join(','),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-shortest', '-movflags', '+faststart', OUT,
  ], 'encode');

  console.log(`encoded   ${rel(OUT)}  ${W}x${H}  ${dur.toFixed(1)}s  ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
}

// ---- dispatch ---------------------------------------------------------------
// The captured frames are kept after encoding on purpose: re-cutting titles is an
// `encode` away, re-shooting ten Electron runs is not. They are also ~450 MB of
// 1920x1080 PNG, so make them easy to drop.
function clean() {
  const bytes = fs.existsSync(FRAMES)
    ? fs.readdirSync(FRAMES).reduce((n, f) => n + fs.statSync(path.join(FRAMES, f)).size, 0) : 0;
  fs.rmSync(FRAMES, { recursive: true, force: true });
  console.log(`cleaned   ${rel(FRAMES)}  freed ${(bytes / 1024 / 1024).toFixed(0)} MB (run "capture" to rebuild)`);
}

const STEPS = { backdrop: buildBackdrop, cards: buildCards, capture, sheet, encode, clean,
  all: () => { buildBackdrop(); capture(); sheet(); encode(); } };

// Exported so tests/reel-spec.test.js can check the move table against the overlay
// without running ffmpeg or Electron. Guarded so a require() does not start a build.
module.exports = { MOVES, COAT, W, H, FPS, HOLD, MOVE_FRAMES, TITLE_FRAMES, END_FRAMES,
  FEET, FLOOR, LABEL_BOTTOM, PET_CLEARANCE, frameFor };

if (require.main === module) {
  const step = process.argv[2] || 'all';
  if (!STEPS[step]) { console.error(`unknown step: ${step} (expected ${Object.keys(STEPS).join('|')})`); process.exit(1); }
  STEPS[step]();
}
