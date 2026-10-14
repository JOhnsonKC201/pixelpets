# scripts/

Everything here is a Node or Electron entry point. Nothing in this folder ships
inside the app except `notify.js`, which is bundled deliberately so an installed
copy can still be driven from a shell.

## Public surface (do not move or rename)

These paths appear in other people's config files and shortcuts.

| Script | Run via | What it does |
|---|---|---|
| `notify.js` | `node scripts/notify.js "msg"` | Pushes a message to the running pet: speech bubble, toast, meow. Hook-safe (drains stdin). |
| `install-hook.js` | `npm run hook -- <agent>` | Prints an agent hook config with the absolute path already filled in. |

## Build and release

| Script | Run via | What it does |
|---|---|---|
| `adhoc-sign.js` | electron-builder `afterPack` | Ad-hoc signs the macOS bundle. Without the seal, macOS discards the Accessibility grant and Keychain entry on every update. |
| `bootcheck.js` | `npm run test:boot` | Launches the real app and asserts it renders a frame. Runs in CI on Windows and macOS. |
| `hook-check.js` | `npm run check:hook` | Answers whether the global input hook loads on this Electron build. |

## Repository bot

Driven by `.github/workflows/pull-request-bot.yml`, never by hand. Both files run
from main's copy with a token that can write comments, which is why neither may
read anything from the pull request beyond what the API hands them.

| Script | Runs on | What it does |
|---|---|---|
| `pr-bot/welcome.js` | a contributor's first pull request | Posts one comment saying what happens next: CI approval, the results comment, the automatic review request. Skips bots and repo members. |
| `pr-bot/results.js` | every finished CI run for a pull request | Posts one comment with each job's result and the test totals, and edits that same comment on every push. Also runnable by hand from the Actions tab with a CI run id. |

## Art and media generators

Anything that shows the pet doing something is filmed from the real renderer by
`make-reel.js`. `make-demo-gif.js` draws its own copy of the cat in pure Node,
which is quick but has drifted from the app (no tail, its own outline), so it is
kept only for what the reel does not cover.

| Script | Run via | Output |
|---|---|---|
| `make-reel.js` | `npm run reel` | `assets/pixelpets-reel.mp4`, the launch reel, then `assets/hero-banner.*` and eight `assets/gallery/*` tiles cut from the same frames. Needs Electron to capture. |
| `make-reel.js clips` | `npm run reel:clips` | Just recuts the banner and tiles from frames already captured. No Electron. |
| `make-demo-gif.js` | `npm run demo:all` | `assets/coat-carousel.gif` and the two gallery tiles the reel does not film (`eat`, `sing`). The `demo` recipe is legacy and is not part of `all`. |
| `make-social-card.js` | `npm run social` | `assets/social-card.png`, the GitHub and link-preview card. |
| `make-logo-icons.js` | `npm run icon` | Every app and tray icon, from the master `assets/logo.png`. |
| `logo-source.js` | library | Loads and rescales `logo.png`, and decodes PNGs for the climb slicer. |
| `settings-glyphs.js` | `node scripts/settings-glyphs.js` | Prints the SVG paths for the settings wordmark and tab icons, to paste into `src/settings.html`. A test fails if the two disagree. |

## Sprite tooling

| Script | Run via | What it does |
|---|---|---|
| `overlay-vm.js` | library | Loads the overlay's script stack in a vm so poses can be read back headlessly. The pose tests and the contact sheets both drive this. |
| `pet-sheet.js` | `npm run poses:cat` / `poses:dog` | Renders every activity across every coat into one contact sheet for visual QA. |
| `import-frames.js` | `npm run frames:import -- <dir>` | Imports hand-painted PNGs as baked poses that win over the composer. See [docs/frame-pack.md](../docs/frame-pack.md). |
| `slice-climb-sheet.js` | `node scripts/slice-climb-sheet.js <sheet> <coat>` | Slices a 5-panel climb contact sheet into per-coat frames. See [assets/climb/](../assets/climb/). |
| `embed-climb-frames.js` | `npm run climb-frames` | Bakes those frames into `src/climb-frames.js`. |
