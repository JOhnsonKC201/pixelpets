<div align="center">

<a name="top"></a>

<img src="assets/logo-mark.png" alt="pixelpets logo" width="104" />

# pixelpets

**A pixel cat or dog that lives on your desktop.**

It reacts to your typing, your cursor and your coding agent.<br />
Nearly every frame is drawn in code, and every sound is synthesized live.

<br />

[![stars](https://img.shields.io/github/stars/JOhnsonKC201/pixelpets?style=flat-square&labelColor=15161d&color=E8930C)](https://github.com/JOhnsonKC201/pixelpets/stargazers)
&nbsp;[![CI](https://img.shields.io/github/actions/workflow/status/JOhnsonKC201/pixelpets/ci.yml?style=flat-square&labelColor=15161d&label=CI)](https://github.com/JOhnsonKC201/pixelpets/actions/workflows/ci.yml)
&nbsp;[![release](https://img.shields.io/github/v/release/JOhnsonKC201/pixelpets?style=flat-square&labelColor=15161d&color=E8930C)](https://github.com/JOhnsonKC201/pixelpets/releases/latest)
&nbsp;[![downloads](https://img.shields.io/github/downloads/JOhnsonKC201/pixelpets/total?style=flat-square&labelColor=15161d&color=4C566A)](https://github.com/JOhnsonKC201/pixelpets/releases)
&nbsp;[![license](https://img.shields.io/github/license/JOhnsonKC201/pixelpets?style=flat-square&labelColor=15161d&color=22C55E)](LICENSE)

<br />

<img src="assets/hero-banner.gif" alt="pixelpets on your desktop: a tuxedo cat sits and watches your cursor, kneads the keyboard when you type, and purrs when you pet it" width="880" />

<sub>Rendered from the same sprite the app draws with, not screen-captured · <a href="assets/hero-banner.mp4">MP4</a> · shown in the <b>Tuxedo</b> coat</sub>

<br /><br />

[![Download for Windows](https://img.shields.io/badge/Download_for_Windows-E8930C?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/JOhnsonKC201/pixelpets/releases/latest)
&nbsp;
[![Download for macOS (beta)](https://img.shields.io/badge/macOS_(beta)-2a2d36?style=for-the-badge&logo=apple&logoColor=white)](https://github.com/JOhnsonKC201/pixelpets/releases/latest)
&nbsp;
[![Play in your browser](https://img.shields.io/badge/Play_in_your_browser-15161d?style=for-the-badge&logo=googlechrome&logoColor=white)](https://pixelcat-jet.vercel.app)

<sub>The browser demo runs the real renderer. Pet it, type at it, scroll, and wait for the butterfly.</sub>

<br />

<a href="#install"><b>Install</b></a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="#what-it-does"><b>Features</b></a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="#see-it-in-action"><b>In action</b></a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="#controls"><b>Controls</b></a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="#ai-agent-reactions"><b>AI agents</b></a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="#privacy"><b>Privacy</b></a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="#documentation"><b>Docs</b></a>

</div>

<br />

## Install

<table>
<tr>
<td width="33%" valign="top">

**Windows 10 / 11**

Download the installer from the [latest release](https://github.com/JOhnsonKC201/pixelpets/releases/latest) and run it. Uninstall from **Settings > Apps** like any other program.

</td>
<td width="33%" valign="top">

**macOS 12+** &nbsp;<sub><code>beta</code></sub>

Apple Silicon and Intel builds are in the [latest release](https://github.com/JOhnsonKC201/pixelpets/releases/latest). Code-complete and ad-hoc signed, but not yet run on real Apple hardware.

</td>
<td width="33%" valign="top">

**From source**

Any of the above, plus git and Node 20+.

```bash
git clone https://github.com/JOhnsonKC201/pixelpets.git
cd pixelpets && npm install
npm start
```

</td>
</tr>
</table>

Your pet appears in the corner and starts with your computer from then on (`npm run autostart:off` turns that off). Linux is not supported: Electron would run, but the overlay and the global input hooks are Windows and macOS only.

<details>
<summary><b>Your OS will warn you the first time. Here is why, and what to click.</b></summary>

<br />

The builds are not code-signed, because a certificate costs real money for a free app.

- **Windows:** SmartScreen shows a blue *"Windows protected your PC"* screen. Click **More info**, then **Run anyway**.
- **macOS:** Gatekeeper refuses a double-click. Try to open it once, then go to **System Settings > Privacy & Security** and click **Open Anyway**. (On macOS 14 and earlier, right-clicking the app and choosing **Open** also works; macOS 15 removed that shortcut.)

Rather not? The [browser demo](https://pixelcat-jet.vercel.app) is the real renderer with nothing to install, and running from source skips the installer entirely. What the app does on your machine is in [Privacy](#privacy) and [SECURITY.md](SECURITY.md): the keyboard hook forwards a single "a key was pressed" signal, never what you typed.

Running from source has two platform notes, a silent Windows launcher and the macOS Accessibility grant, both in the [development guide](docs/development.md).

</details>

<br />

## What it does

<table>
<tr>
<td width="50%" valign="top">

### It reacts to you
Petting, dragging, typing, scrolling and cursor play each get their own response, shaped by a mood model that runs from calm up to zoomies and back.

</td>
<td width="50%" valign="top">

### It watches your agent
It ponders while your coding agent thinks, taps along while it works, and hops when it is done. Hook configs ship for five agents.

</td>
</tr>
<tr>
<td valign="top">

### It keeps you on track
Break and Pomodoro timers, repeating reminders, a pinned note, unread-mail alerts and calendar nudges, all delivered by your pet.

</td>
<td valign="top">

### It knows when to be quiet
Focus Guard notices a live meeting, Quiet Hours or Work mode, parks the pet and holds messages back. Nothing is dropped: you get one summary when you are free.

</td>
</tr>
<tr>
<td valign="top">

### 15 coats, one shape
14 cat coats and a Black Lab, all recoloured at draw time from one role-coded sprite. Design, import and share your own.

</td>
<td valign="top">

### Zero audio files
The meow, the bark, the purr, the pant and an endlessly improvising lo-fi jam are all synthesized live with Web Audio.

</td>
</tr>
</table>

<p align="center"><sub>And it stays out of the way: a transparent, click-through overlay above every window, where only your pet is clickable.</sub></p>

## See it in action

<table align="center">
<tr>
<td align="center"><img src="assets/gallery/type.gif" width="190" alt="a tuxedo cat kneads the keyboard while you type" /><br /><sub><b>Kneads as you type</b></sub></td>
<td align="center"><img src="assets/gallery/pet.gif" width="190" alt="a tuxedo cat purrs with hearts when petted" /><br /><sub><b>Purrs when petted</b></sub></td>
<td align="center"><img src="assets/gallery/climb.gif" width="190" alt="a tuxedo cat climbs a yarn rope when you scroll" /><br /><sub><b>Climbs when you scroll</b></sub></td>
<td align="center"><img src="assets/gallery/mochi.gif" width="190" alt="a tuxedo cat stretches like mochi when you drag it" /><br /><sub><b>Stretches like mochi</b></sub></td>
</tr>
<tr>
<td align="center"><img src="assets/gallery/butterfly.gif" width="190" alt="a tuxedo cat tracks and plays with a butterfly" /><br /><sub><b>Plays with a butterfly</b></sub></td>
<td align="center"><img src="assets/gallery/hunt.gif" width="190" alt="a tuxedo cat crouches and pounces to hunt the cursor" /><br /><sub><b>Pounces on the cursor</b></sub></td>
<td align="center"><img src="assets/gallery/eat.gif" width="190" alt="a tuxedo cat noms a fish treat with hearts" /><br /><sub><b>Noms a treat</b></sub></td>
<td align="center"><img src="assets/gallery/sing.gif" width="190" alt="a tuxedo cat sings, with floating music notes" /><br /><sub><b>Sings and meows</b></sub></td>
</tr>
</table>

<div align="center">

<br />

<img src="assets/showcase.png" alt="all 14 cat coats across the sit, typing, hunt, and loaf poses" width="100%" />

<sub><b>Fourteen coats, every pose.</b> Each one recoloured from a single sprite at draw time, so every coat and both species get every animation without a single extra image. <a href="assets/coat-carousel.gif">Watch them cycle</a>.</sub>

</div>

### Cat or dog

Pick your species from the tray (**Pet > Cat / Dog**); each keeps its own coat. The dog is not a recoloured cat: it has its own sprite, a muzzle that protrudes past the skull line, floppy ears, a broader chest and a straight otter tail. Where the cat does a hunting crouch it does a play bow, where the cat grooms it pants, and where the cat gets a fish it gets a tennis ball it will actually chase down and bring back. [Every difference, in the feature guide.](docs/features.md#cat-or-dog)

## Controls

| Do this | And your pet |
|---|---|
| <kbd>Drag</kbd> it | Stretches like mochi, settles where you let go, and makes that spot its new home |
| <kbd>Right-click</kbd> it | Cycles to the next coat |
| <kbd>Tap</kbd> it | Gets a quick pet: happy eyes, hearts, a chirp |
| Rest the cursor on its **head** | Happy eyes, floating hearts and a purr |
| Rest the cursor on its **body** | Leans and arches into your hand, tail up, trilling |
| <kbd>Type</kbd> in any app | Kneads with its front paws; fast typing overheats it |
| <kbd>Scroll</kbd> in any app | Swipes at a blowing leaf, or climbs a yarn rope on the four coats with painted climb art |
| <kbd>Double-click</kbd> it | Opens Settings: name, timers, reminders, coat |
| The **tray icon** | Settings, Start break now, coat picker, play area, sound, hunt and mood toggles, Quit |

<sub>Settings live in `settings.json` in your app-data folder (`%APPDATA%/pixelpets/` on Windows, `~/Library/Application Support/pixelpets/` on macOS); an install from before the rename is migrated on first launch. Timers and reminders fire while pixelpets is running, on your local clock.</sub>

## AI agent reactions

Your pet follows your coding agent with its paws. It raises a paw to its chin while Claude Code, Codex or Cursor thinks, taps along with a spinner while it works, and does a happy hop and meow when it finishes. Any tool can signal it through the bundled helper, which writes a tiny status file the pet watches (`%TEMP%/pixelcat-agent.state`):

```bash
node agent-hook.js thinking   # ponders, paw to chin + "…" bubble
node agent-hook.js editing    # taps a paw + "working" spinner
node agent-hook.js error      # startles (flinch)
node agent-hook.js done       # happy hop + meow
node agent-hook.js idle       # back to normal
```

Ready-made configs for **Claude Code, Codex CLI, Cursor, Antigravity and Kiro** are in [`integrations/`](integrations/), and `npm run hook -- <agent>` prints yours with the absolute path filled in. The helper drains stdin and replies `{"continue": true}`, so it never blocks or changes what your agent does.

<sub>The richer status reactions were inspired by the open-source desktop pets <a href="https://github.com/alvinunreal/openpets">openpets</a> (MIT) and <a href="https://github.com/rullerzhou-afk/clawd-on-desk">clawd-on-desk</a> (AGPL-3.0). Ideas only; all code here is original to pixelpets.</sub>

## Privacy

Your pet reacts to typing and scrolling, so it listens to global input events. Here is exactly what that means:

- **Keystrokes are never logged, stored or sent.** Input only triggers an animation, in the moment, on your machine.
- **No telemetry and no auto-update.** The app makes no network connections at all unless you turn on mail or calendar alerts.
- **Those alerts talk only to the servers you choose**, from isolated worker processes.
- **Your mail app password is encrypted at rest** (Electron `safeStorage`) and never written to `settings.json`.

## Documentation

| Guide | What is in it |
|---|---|
| [Features](docs/features.md) | Every interaction, coat, mood, sound and productivity feature |
| [Custom coats](docs/custom-coats.md) | Designing, hand-editing and sharing your own coat |
| [How it works](docs/architecture.md) | One sprite covering 15 coats, and the project layout |
| [Development](docs/development.md) | Running from source, building installers, visual QA |
| [Frame pack](docs/frame-pack.md) | Painting a pose by hand and importing it |
| [Agent hooks](integrations/) | Wiring the pet to Claude Code, Codex, Cursor, Antigravity and Kiro |
| [iPad terminal](tools/ipad-terminal/) | A real terminal for *this* machine, driven from an iPad |

<details>
<summary><b>Development</b></summary>

<br />

```bash
npm start          # run the app
npm test           # the full suite: no Electron window and no GPU required
npm run lint       # what CI runs, alongside the tests and a real boot check
npm run poses:cat  # contact sheet: every activity x every coat, for visual QA
npm run demo:all   # regenerate the README's hero, gallery and coat carousel
```

The overlay is GPU-composited, so ordinary screenshots cannot capture it; visual changes are reviewed with those contact sheets instead. The full command list, build instructions and the macOS beta checklist are in the [development guide](docs/development.md).

</details>

## Contributing

Bug reports, ideas and PRs are all welcome. Start with the [contributing guide](CONTRIBUTING.md); the [security policy](SECURITY.md) covers reporting a vulnerability privately.

> **Own a Mac?** Running the [beta checklist](docs/development.md#macos-beta-checklist) and opening an issue with whatever you see is the single most useful contribution right now.

Custom coats and desk setups belong in [Discussions](https://github.com/JOhnsonKC201/pixelpets/discussions), and release history lives in the [changelog](CHANGELOG.md).

<br />

<div align="center">

<img src="assets/logo-mark.png" alt="" width="40" />

<sub>Built with Electron, Canvas 2D and Web Audio. All art, code and sound are original; pixelpets is inspired by, not copied from, Comnyang, and uses none of its assets, sprites, audio or branding.</sub>

[**MIT**](LICENSE) © [JOhnsonKC201](https://github.com/JOhnsonKC201) &nbsp;·&nbsp; <a href="#top">Back to top ↑</a>

</div>
