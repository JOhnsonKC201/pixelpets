# Development

Run from source, build an installer, and check visual changes on a project whose
output is GPU-composited and cannot be screenshotted.

Requires git and Node 20 or newer.

```powershell
git clone https://github.com/JOhnsonKC201/pixelpets.git
cd pixelpets
npm install
npm start
```

## Commands

```powershell
npm start                 # run the app
npm test                  # 400+ tests: config and data migration, poses, interactions,
                          #  audio, focus and quiet hours, mail and calendar, IPC and
                          #  security wiring, site drift
npm run lint              # eslint over src, tests and scripts (what CI runs)
npm run test:boot         # launch the real app and assert it renders a frame
npm run soak              # run for an hour and report memory and CPU (see below)
npm run check:hook        # does the global input hook load on this Electron?
npm run poses:cat         # previews/cat-poses.png (every activity x every coat)
npm run poses:dog         # the same for the Black Lab
npm run frames:import -- <dir>   # import painted PNGs as baked poses
npm run demo:all          # regenerate the README media (hero, gallery, carousel)
npm run hook -- cursor    # print a path-filled agent hook config
npm run icon              # regenerate the tray + app-tile icons
```

CI runs `npm run lint`, `npm test`, and the boot check on Windows and macOS for
every push and pull request.

> [!TIP]
> **Windows:** `npm start` leaves a console window open behind the pet.
> `launch-pixelpets.vbs` starts the same thing silently, so it works as a desktop
> shortcut (point one at `wscript.exe "<path>\launch-pixelpets.vbs"`). It locates
> the project from its own path, so moving the folder does not break it.

> [!NOTE]
> **macOS:** same commands. On first run, grant Accessibility permission (System
> Settings > Privacy & Security > Accessibility) so your pet can react to your
> typing and cursor. Input is only detected, never logged or sent anywhere.

## Build a standalone app

```powershell
npm run pack    # portable build -> dist/win-unpacked/pixelpets.exe (no installer)
npm run dist    # Windows installer -> dist/pixelpets-Setup-<version>.exe (+ latest.yml)
```

`pack` works out of the box. `dist` (the NSIS installer) needs permission to
create symlinks while electron-builder unpacks its bundled signing tools: enable
Windows Developer Mode (Settings > Privacy & security > For developers) or run
the build once from an Administrator terminal. The native `uiohook-napi` module
ships N-API prebuilds, so `npmRebuild` is disabled in the build config and no
Visual Studio is needed.

**macOS:** `npm run dist:mac` (on a Mac) builds a dmg and zip for Apple Silicon
and Intel; the release workflow also builds them in CI on every version tag.
Builds are ad-hoc signed rather than notarized, so Gatekeeper still asks before
the first launch: open it once, then **System Settings > Privacy & Security >
Open Anyway**. The ad-hoc seal matters for more than the warning: macOS keys the
Accessibility grant and the Keychain entry to a code signature, so without it both
would be thrown away on every update.

### macOS beta checklist

The mac port is code-complete but has not been smoke-tested on real hardware. If
you own a Mac, running this and opening an issue with whatever you see is the
single most useful contribution to the project right now.

- [ ] The overlay shows over all apps and Spaces, including fullscreen.
- [ ] Clicks pass through everywhere except on the pet.
- [ ] The typing reaction works after granting Accessibility.
- [ ] The pet rests on the Dock edge, not the menu bar.
- [ ] The tray menu works in the menu bar.
- [ ] Login launch works.

## Visual QA

The overlay is GPU-composited, so ordinary screenshots cannot capture it. Poses
are reviewed with a one-command contact sheet instead:

```powershell
npm run poses:cat
```

That renders **every activity across every coat** into one image, bottom-aligned
on a shared floor line so silhouettes can be compared down a column. It runs
headlessly, with no Electron and no GPU, by loading the overlay's script stack in
a vm (`scripts/overlay-vm.js`) and reading the pose grids back out. That is also
what the pose tests drive, so the sheet and the suite are looking at exactly the
same sprites.

Single poses preview via:

```powershell
npx electron . --shot --state=<sit|typing|hunt|loaf|groom|paper|overheat|pet|startle|work|rearup> --pattern=<coat>
```

Add `--at=<ms>` to capture an animated pose at a chosen phase (a typing key-press,
say): `npx electron . --shot --state=typing --at=760`. Add `--note="<text>"` to
pin a speech bubble open in the capture, which is how bubble wrapping and
screen-edge clamping get checked against a real font rather than only in unit
tests: `npx electron . --shot --note="a long reminder that has to wrap"`.

The butterfly has two flags of its own. `--bfly` forces a visit from the first
frame, so `npx electron . --shot --bfly --state=rearup --at=1021` frames the
rear-up swat with the bug in shot. The catch itself cannot happen in a shot (both
pounce triggers stand down under `--shot`), so `--joy` pins the victory beat that
follows one: happy eyes and a blush the whole time, and the double bounce looping
every two seconds (1.4 s of bounce, 0.6 s still), the way `--state=done` loops its
hop. It loops because `--at` counts from page load while the renderer's clock
started earlier, so no single `--at` lands on a known phase: take two or three
captures a few hundred milliseconds apart and one of them is mid-bounce. The
"oh!" beat when the bug is first spotted opens on the very first frame, before
the capture timer starts, so it is covered by a test rather than a shot.

## Painting a pose by hand

Every pose is composed in code, which is why one `sit` covers 15 coats and a new
coat costs nine hex values instead of an art pass. The trade is that changing how
the pet looks means editing geometry.

`npm run frames:import` is the escape hatch: paint a pose against a placeholder
palette, import it, and it wins over the composer for exactly the coats you name
while everything else keeps composing. Five held poses can be baked (`sit`,
`type`, `loaf`, `rear`, `hunt`); the six raised-limb activities are parameterised
rigs whose limbs sweep through quantised frames, so a still would freeze them.

Palette, naming and the checks the importer runs are in
[frame-pack.md](frame-pack.md).

## README media

The hero banner, the gallery, and the coat carousel are all rendered from the
same sprite geometry by `scripts/make-demo-gif.js`, in pure Node with no browser
or GPU. Regenerate any one with
`node scripts/make-demo-gif.js <hero|gallery|carousel> [mp4]`, or all three with
`npm run demo:all`.

## Releasing

1. Bump `version` in `package.json` and add a section to `CHANGELOG.md`.
2. Optional but cheap: **Actions > Release > Run workflow** on the branch. That
   is a dry run: it builds, boots and checksums both platforms and keeps the
   files as a workflow artifact, without publishing anything.
3. Tag and push: `git tag v0.5.0 && git push origin v0.5.0`. A suffix such as
   `v0.5.0-beta.1` publishes a pre-release.

The workflow refuses a tag that does not match `package.json`, then runs lint and
the tests before building anything. Each platform's build is booted as packed
before it is uploaded. Every release carries the installers, the update
manifests `latest.yml` and `latest-mac.yml` (what an updater reads; the file
names in them must match the uploads, which `tests/release-scripts.test.js`
guards), and a `SHA256SUMS-<platform>.txt` per platform.

## Release hardening

Release builds switch off the parts of Electron an attacker on the same machine
could use to run code as pixelpets. `build.electronFuses` in `package.json` stops
the binary from being run as plain Node (`ELECTRON_RUN_AS_NODE`), reading
`NODE_OPTIONS` or opening a debugger from the command line, and makes it load
only from its own `app.asar`, checked against a hash built into the executable.
`tests/security-pins.test.js` fails if any of that is loosened, and the
`packaged-boot` CI job packs the app and boots the result on Windows and macOS
(`node scripts/bootcheck.js --packaged` after `npx electron-builder --dir`).

Because of that, nothing may start the app binary as Node. The mail and calendar
checks run as Electron utility processes through `src/worker-host.js`; new
background work should do the same.

At runtime every web permission request is refused (and logged), and navigation,
pop-ups and `<webview>` are blocked for every page (`src/main/app-guards.js`).

## Checking for leaks

A desktop pet runs for days, so a slow leak matters more than a slow start.
`--soak=<minutes>` runs the pet normally, samples every process's memory and CPU
every 30 seconds, prints a summary and quits:

```
[soak] 6 min, 13 samples
[soak] Browser    memory 96.9 -> 100.4 MB (peak 102.4)  cpu avg 0.1% peak 0.2%
[soak] GPU        memory 100.9 -> 101.9 MB (peak 101.9)  cpu avg 0.9% peak 1.8%
[soak] Utility    memory 47.5 -> 47.7 MB (peak 47.7)  cpu avg 0% peak 0%
[soak] Tab        memory 118 -> 137.1 MB (peak 137.7)  cpu avg 0.5% peak 0.9%
```

(A real 6-minute run on Windows. Six minutes cannot tell warm-up from a leak; the
overlay tab's climb here is the thing an hour-long run should confirm flattens.)

Memory is compared first quarter to last quarter, so one garbage collection does
not read as a leak. A pet that is already running holds the single-instance
lock, so give a soak run its own profile:

```powershell
npx electron . --soak=60 --user-data-dir="$env:TEMP\pixelpets-soak"
```

## Tech

Electron, HTML canvas, Web Audio,
[`uiohook-napi`](https://github.com/SnosMe/uiohook-napi) (system-wide keyboard
hook), [`imapflow`](https://github.com/postalsys/imapflow), and
[`node-ical`](https://github.com/jens-maus/node-ical).
