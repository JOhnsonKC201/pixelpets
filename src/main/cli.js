// Command-line flags for preview and capture runs.
//
// A normal launch passes none of these. They exist for QA shots (--shot), the
// contact sheet (--sheet) and the demo reel (--reel), and each forces something
// the pet would otherwise decide for itself. Pure: reads an argv array, touches
// nothing, so tests/cli.test.js can pin every flag without starting Electron.

// The preview canvas the overlay sizes itself to in SHOT mode. Kept here so the
// preview WINDOW can be built to cover it; the two must not drift (see
// overlay-window creation in main.js and tests/shot-window.test.js).
const SHOT_CANVAS = { w: 260, h: 320 };

function parseCli(argv) {
  const valueOf = (name) => (argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1] || '';
  // Everything after the first '=', so a value may itself contain '='.
  const restOf = (name) => (argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=') || '';
  const numberOf = (name, dflt) => {
    const v = Number((argv.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1]);
    return Number.isFinite(v) ? v : dflt;
  };
  // startsWith, not includes: every other preview flag takes a --flag=value form,
  // so `--treat=1` (the spelling the overlay's own comment documents) used to be
  // silently ignored. Both spellings work.
  const hasFlag = (name) => argv.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));

  return {
    // Optional `--state=` / `--pattern=` force a pose/coat for --shot previews.
    stateArg: valueOf('state'),
    patternArg: valueOf('pattern'),
    dirArg: valueOf('dir'),           // force climb direction (up|down) for --shot previews
    speciesArg: valueOf('species'),   // force cat|dog for --shot previews (the overlay reads ?species=)
    // `--note=<text>` pins a speech bubble open for a --shot capture, so bubble
    // wrapping and edge clamping can be eyeballed against a real font.
    noteArg: restOf('note'),
    SHOT: argv.includes('--shot'),
    SHEET: argv.includes('--sheet'),  // contact-sheet QA capture
    REEL: argv.includes('--reel'),    // marketing reel: a run of frames of one forced pose
    // `--at=<ms>` sets how long to let the scene animate before the --shot capture,
    // so animated poses (typing kneads, paper batting) can be QA'd at any phase.
    shotAtMs: Math.max(0, Number(valueOf('at')) || 700),
    hasFlag,
    // `--reel` records a run of frames of ONE forced pose straight to PNGs, so
    // scripts/make-reel.js can string the poses together into a demo video. Every
    // knob is a flag because framing is judged by eye against a real backdrop.
    reel: {
      out: restOf('out'),                   // directory the PNG frames land in
      bg: restOf('bg'),                     // desktop backdrop jpeg, already sized to w x h
      w: numberOf('w', 1920), h: numberOf('h', 1080),
      scale: numberOf('scale', 3),          // CSS upscale of the 260x320 pet canvas
      left: numberOf('left', 1150), top: numberOf('top', 120),
      frames: numberOf('frames', 48), fps: numberOf('fps', 20),
      warmup: numberOf('warmup', 8),        // paints to discard while the pose settles
      timeout: numberOf('timeout', 60000),
      drag: argv.includes('--drag'),
      // Render at `every` x fps and keep one paint in `every`. This is not
      // smoothing: the overlay integrates its springs with
      // `step = min(2.5, dt / 16)`, so at 20 fps step pins to 2.5 and the spring
      // gain goes above 1. The sim DIVERGES and the drag stretch runs away until
      // the cat is a one-pixel line. At 60 fps step is near 1 and the same drag is
      // stable, so any spring-driven move films at `--every=3`.
      every: Math.max(1, numberOf('every', 1)),
    },
  };
}

module.exports = { parseCli, SHOT_CANVAS };
