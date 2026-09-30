# Contributing to pixelpets

Thanks for wanting to make pixelpets better. Issues, mac test reports, coat designs, and PRs are all welcome.

## Quick start

```powershell
git clone https://github.com/JOhnsonKC201/pixelpets.git
cd pixelpets
npm install
npm start        # your pet appears
```

The [development guide](docs/development.md) covers the day-to-day commands. The short version:

| Command | What it does |
|---------|--------------|
| `npm test` | Smoke tests (node --test). Must be green before a PR. |
| `npm run lint` | Lint (eslint, cached). CI runs exactly this. |
| `npm run poses:cat` | Renders every activity x coat into `previews/cat-poses.png` for visual QA. Headless: no Electron, no GPU. |
| `npm run test:boot` | Boots the app headlessly and renders one frame. |

## Before you open a PR

1. **Tests green:** `npm test` (CI runs the same thing).
2. **Visual changes need visual proof.** If you touch `src/overlay/`, `src/cat-sprite.js`, or anything that draws, run `npm run poses:cat` before and after. For pure refactors the sha256 of the sheet should not change; for intentional changes, include a before/after crop in the PR.
3. **Keep the site cat in sync.** `site/cat-sprite.js` must stay a byte-identical copy of `src/cat-sprite.js` (a test enforces this). If you change the sprite, re-copy it: `node -e "fs.copyFileSync('src/cat-sprite.js','site/cat-sprite.js')"`.
4. **Keep files small.** No file under `src/` passes 800 lines (a test enforces this). The overlay lives in `src/overlay/`, loaded in the order `src/overlay/parts.js` lists; the main process is `src/main.js` plus the modules in `src/main/`. When a file gets close to the limit, split out a piece with one job, the way `src/main/tray-menu.js` or `src/main/bridge.js` were, and give it its own test.
5. **Respect line endings.** Files in this repo are a mix of LF and CRLF for historical reasons. Do not normalize files you are not otherwise changing; keep each file's existing endings.
6. **Commit style:** conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `chore:`), imperative mood, like the existing history.

## After you open a PR

- **CI runs on every push:** the tests on Linux, and a real boot of the app on Windows and on macOS. If this is your first pull request here, GitHub holds the run until a maintainer approves it, so a "workflow awaiting approval" notice is normal.
- **A bot comments the results** (each job, plus the test totals) and edits that same comment on every push, so the thread does not fill up with status noise. First-time contributors also get a short welcome from it.
- **The maintainer is requested as a reviewer automatically** through `CODEOWNERS`.
- **`main` only takes green pull requests.** The branch is ruleset-protected: no direct pushes, and the three CI jobs must pass before the merge button works.

## Good places to start

- **Own a Mac?** The macOS port is code-complete but untested on real hardware. Running the [beta checklist](docs/development.md#macos-beta-checklist) and reporting what happened is the single most useful contribution right now.
- **Design a coat** and share it (Settings → Custom coats → Export). Great ones can become built-ins.
- Anything labeled [good first issue](https://github.com/JOhnsonKC201/pixelpets/labels/good%20first%20issue) or [help wanted](https://github.com/JOhnsonKC201/pixelpets/labels/help%20wanted).

## Ground rules for the art and sound

Everything in pixelpets is original or procedural. Please do not submit sprites, sounds, or assets copied from other desktop pets (Comnyang, Shimeji packs, etc.) or from any copyrighted source. Code that generates things is the whole point here.
