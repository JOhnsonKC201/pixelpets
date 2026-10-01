# How it works

Why one `sit` pose covers fifteen coats and two species, and why the repo ships
no sprite sheets and no audio files.

## One sprite, recolored

The cat is one role-coded sprite (outline, coat, markings, white, patch, eye,
nose, inner ear) built procedurally, then recolored per pattern at draw time, so
a dozen cats come from one shape.

Every pose is composed into that same grid, including the limbs. A raised paw is
made of the same cells as the rest of the pet, so it picks up the coat's shading,
outline halo, markings and breathing scale for free. Nothing is painted on top
afterwards. That is why washing, pondering, batting a leaf, boxing at the
butterfly and swiping at the scroll leaf all work in all 15 coats and both
species without a single extra sprite asset.

Poses that vary continuously (how high a paw is raised, how far it reaches, which
paw is mid-swipe) are quantised to a handful of steps and memoised, and built
only for the coat currently on screen. Pixel art wants stepped limbs anyway, so
the cheap thing and the right-looking thing are the same thing.

## Rendering

Rendering happens on an HTML canvas in a full-screen transparent Electron window.
Ordinary screenshots cannot capture it (it is GPU-composited), so previews use a
self-capture:

```powershell
electron . --shot --pattern=<name> [--species=cat|dog] [--state=<pose>] [--at=<ms>]
```

The mochi drag is a spring system (a pinned handle plus a trailing body point)
with a three-band stretch that keeps the head and feet rigid.

## Scheduling and sound

Break timers and reminders are scheduled in the main process (the renderer
throttles and pauses when idle), which pushes fire events to the cat over IPC.

Sound is synthesized with Web Audio in the renderer, so there are no audio assets
to ship: every meow, bark, purr, pant, swipe and thud is generated live, and so
is the lo-fi jam.

## Project layout

```
pixelpets/
  src/
    main.js                # overlay window, global input hooks, tray + menu,
                           #  scheduler (breaks, reminders, Pomodoro), config IPC
    overlay/               # the pet itself: classic scripts sharing one scope,
                           #  loaded in the order overlay/parts.js lists
      poses.js             #  canvas setup and the pose sprite tables
      species.js           #  species tables, sprite builders, baked frames
      body.js              #  drawing the pet body
      state.js             #  live state, positioning, one-shot actions
      play.js              #  fetch, treats, sound hooks
      climb.js             #  the rope climb
      visitors.js          #  the butterfly and self-play
      frame.js             #  the per-frame update and draw
      input.js             #  event wiring, the contact sheet, startup
    preload.js             # safe IPC bridge for the overlay
    cat-sprite.js          # the role-coded cat, mirrored to site/ for the browser demo
    dog-sprite.js          # the Black Lab, and the poses composed from it
    pets.js                # per-species registry: menu labels, IPC channels, copy
    patterns.js            # shared coat list, recolored at draw time
    art-frames.js          # baked hand-painted poses that win over the composer
    climb-frames.js        # the yarn-rope climb, per coat
    audio.js               # synthesized voice: meow, purr, bark, pant, chirp
    jam.js                 # the live lo-fi jam, generated bar by bar
    effects.js / bubble.js # hearts and leaves, and the speech bubble
    focus.js               # when to leave you alone: meetings, work mode, quiet hours
    quiet-hours.js         # the nightly do-not-disturb window
    mail.js / mail-worker.js   # IMAP unread-mail checks (isolated worker)
    cal.js  / cal-worker.js    # .ics calendar feed (isolated worker)
    config.js              # settings.json load/save/normalize (per-user app data)
    datadir.js             # one-time rescue of that folder after the rename
    themes.js              # custom-coat load/validate
    template.js            # message placeholders: {name}, {time}, {date}, {count}
    index.html             # the overlay page
    settings*.{html,js}    # settings window + its IPC bridge

  tests/          # node:test suites, no Electron and no GPU required
  scripts/        # the vm harness, icon and demo generators, notify.js,
                  #  install-hook.js, the boot check  (see scripts/README.md)
  tools/          # standalone extras: the iPad terminal, the Lobby Jam page
  integrations/   # ready-made agent hook configs (5 agents)
  assets/         # generated icons, showcase, hero + gallery clips
  site/           # the browser demo deployed to Vercel
  docs/           # this folder: features, architecture, development, frame pack
  .github/        # CI and release workflows, issue and PR templates
```

## Entry points that are part of the public surface

These paths appear in other people's config files, so they do not move:

| Path | Who depends on it |
|---|---|
| `agent-hook.js` | every user's agent hook config (see [`integrations/`](../integrations/)) |
| `scripts/notify.js` | scripts, CI jobs and cron entries that push a message to the pet |
| `launch-pixelpets.vbs` | Windows desktop shortcuts that start the pet without a console |
