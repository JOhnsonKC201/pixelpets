# Changelog

Notable changes to **pixelpets**. All art and sound are original/procedural (no asset files).

## [Unreleased]

### The drop spot
- **Put the pet down and it stays put.** Dropping the cat on the far side of the screen held for about ten seconds. The wander target is skewed toward the rest corner (`r*r` clusters at one edge), so the first stroll after a drop walked the cat straight back across the screen to the corner it came from, and every stroll after that kept it there. Nothing else knew the pet had been moved either: every system that re-homes it (the launch restore, the floor re-pin, the display-change rescue, work mode, the dog carrying its ball back) asks one function where home is, and that function only ever knew about the corner setting. Where you let go is now home. It still wanders, but around the spot you picked, and it drifts back to it.
- **It lands where the pointer is.** The drop committed the head spring's position, and that spring chases the cursor underdamped, so it lags on a fast drag and overshoots on a slow one: a quick throw across the screen put the cat tens of pixels from where you released it. It lands on the pointer now, and the springs ease the body onto it, so the squash-and-bounce settle looks the same.
- **The spot is a fraction of the screen, not a pixel column.** A resolution change, a DPI change or an unplugged monitor moves the spot with the screen instead of stranding the pet against an edge.
- **A way back to the corner.** "Send it home" in Settings and under tray > Rest corner. Picking a rest corner forgets the spot too, but that alone was not enough: re-picking the corner you already have selected changes no setting, so the pet never heard about it.

### Butterfly
- **The catch is a catch now.** A leap that reached the butterfly threw six white pixels and a heart, made no sound, changed nothing on the face, and the cat snapped straight back to idle; a leap that missed looked exactly the same. Now the bug is held: pinned between the reaching paws for the rest of the leap, then cupped in front of the chest for half a second with its wings barely moving while the cat peers down at it, wide-eyed and blushing. Then it slips out and climbs away and the cat does a quick double bounce after it with happy eyes, a fan of pink sparkles and one pleased trill (Sound on only). A whiff gets none of that: the cat lands and looks up after the bug instead.
- **The leap connects.** It never did: the pounce aimed the cat's feet at the butterfly, and the catch happens at the paws, a paw-reach higher, so the cat flew through the bug feet-first and the paws closed on air (0 catches in 316 measured pounces). The feet now aim one paw-reach under the bug and meet it at the top of the leap, the bug keeps to the part of the screen the cat is allowed to reach, and the cat no longer leaps at one hovering past the edge of its play area (that leap went straight up under nothing). To keep it a game, the bug sometimes flits aside as the cat coils, and no pounce happens in the first seconds of a visit, so the notice, the stalk and a swat or two still come first.
- **The catch really ends the visit.** The dodge reflex had no notion of a bug that was leaving, so the one climbing away after a catch passed under the head and was startled straight back into play. The visit ends when it says it does.
- **The swat has a body.** The cat rises on its haunches with the reaching paw and the whoosh scales with mood. The cadence from the sound fix below is untouched (one whoosh per swat, swats 2.6 to 4 seconds apart), and a test now pins both numbers, which nothing did before.
- **The tail joins in.** It sways quicker and wider while a butterfly is in play and for a few seconds after a catch, the way the dog's already did. The resting wag is unchanged.
- **It notices.** A small perk and a "!" over the head when the bug is first spotted.
- **A meeting sends it home.** Focus Guard blocked new visits but left a butterfly that was already flying; the same signal now sends it off mid-visit, the way work mode does.
- QA: `--bfly` forces a visit into a `--shot`, `--joy` pins the victory beat (the catch itself cannot happen in a shot), and `--state=rearup` is documented.

### iPad terminal
- **A terminal on the iPad, pointed at the machine that has one.** `npm run ipad:lan` prints a URL; Safari on the tablet opens a real shell - `vim`, `top`, tab completion, colours - on this computer. The thing it deliberately does *not* do is control other iPad apps: iPadOS sandboxes every app and exposes no API for it, so a tool that promised that would be lying. Shortcuts is the only sanctioned cross-app path on a tablet, and only for apps publishing App Intents.
- **Switching apps no longer kills your build.** Safari suspends a backgrounded tab, so the naive version of this loses the shell the moment you check a message. The shell now outlives its connection, and the client counts the bytes it has rendered so a reconnect asks for exactly the gap - output made while you were away is replayed, output you already read is not repeated.
- **A shell nobody is watching gets reaped.** The cleanup was armed only by a client *disconnecting*, so a session created and then never attached to - a page that loaded and got closed, a probe - held a live shell open forever.
- **The keys a soft keyboard does not have.** No Esc, no Tab, no Ctrl, no arrows is most of what a shell is driven with; a key bar supplies them, with a sticky Ctrl. Tapping one uses `pointerdown` rather than click, because moving focus to a button on iPadOS dismisses the keyboard mid-command.
- **Zero dependencies to start, better with two.** It runs on plain `node`: no install, output over SSE and input over POST rather than a hand-rolled WebSocket. `npm install` inside the tool adds a real pty and vendors xterm.js locally, and it is deliberately its own package - `node-pty` is native and xterm is browser-side, so neither belongs in the Electron bundle.
- **Loopback unless you say otherwise.** `--lan` is the only thing that opens the port. Every request needs a token, ten bad ones lock the caller out for a minute, and the `Host` header is checked so a hostname resolving to this box cannot be used to probe it. The page strips the token out of the address bar on load and authenticates its own stylesheet and script with a `SameSite=Strict` cookie the API itself refuses.

### Sound
- **The pet stopped making noise nobody asked for.** A cursor merely *resting* on the sprite counted as petting on every frame: the gate rejected a fast cursor, but a stationary one has `velEMA` 0, and main only forwards the cursor when it moves, so the last resting position stood forever. A pointer parked on the pet - easy to do by accident, and where the cursor often ends up after a pounce - purred without end and trilled every 1.5 seconds indefinitely. The *pose* is deliberate and stays, because a hand resting on the pet should squint its eyes; the voice now settles after eight seconds of a still hand.
- **The butterfly stopped keeping time.** The paw-swat lasted 600ms and re-armed 100ms later, so it threw a whoosh roughly every 350ms for the whole 22-30 second visit, and visits recur every 14-24 seconds - better than half of all idle time spent audibly batting. The paw now rests between swats, jittered so it reads as a cat losing interest rather than a metronome.
- **Scrolling is one chirp, not one per leaf.** Leaves respawn the instant the last one leaves, so "once per leaf" still meant a chirp every 0.3-0.8 seconds down a long page.
- **Turning Sound off turns the music off.** The Lobby Jam was reconciled on `lobbyJam.on` alone, so the one switch a user reaches for when they want quiet silenced every meow, purr and whoosh while the music played on at full level. The vinyl crackle - about 50 clicks a second of 1.4kHz-and-up noise, running under every mood - is much quieter, and picking a mood in the tray no longer force-starts playback you had deliberately left off.
- **A floor on the voice.** `notify()`'s dedupe is per-message, so a burst of *different* messages passed straight through it and meowed once each; eight reminders catching up after a laptop wakes meant eight meows. There is now a per-source floor on the voice - every bubble still appears and every message still reaches the tray recap - and a global floor inside `audio.js`, so a stuck caller upstream cannot become a stutter.
- **The purr fades in for real.** Its modulators were summed into the gain at full depth from sample zero, swinging the parameter as hard as the steady state did, which made the documented "fade in (no click)" a no-op and started every purr at full loudness. A restart inside the 400ms release tail also stacked a second drone on the first, which is what turned a jittering cursor into a thickening wobble.
- **A calmer voice.** Softer onsets, lower peaks, a rounder mouth, and the two affectionate meow shapes - the short "mew" and the drawn-out "meeow" a cat actually uses on the person it lives with - weighted over the flat mid-length one, which is closer to a demand.

### Focus Guard
- **The pet works out when to leave you alone.** Work mode already existed, but it is a switch you have to remember to flip, and nobody flips a switch on the way into a meeting they are already late for. The pet now reads "busy" from a calendar event actually in progress, from quiet hours, or from work mode, and parks itself for the duration.
- **Held back is not thrown away.** Email, reminders and agent messages wait rather than interrupt, and arrive as one line when you are free - *"While you were busy: 3 new emails and 1 reminder."* Every held message still lands in the tray recap as it arrives, so nothing is lost.
- **Calendar nudges always come through.** Silencing the thing telling you to leave for your next meeting, during the meeting you are in, is exactly backwards.
- **An all-day block is not a meeting.** *Vacation*, *On call* and birthdays all arrive as ordinary multi-hour VEVENTs, and treating one as "in a meeting" would have silenced the pet for a whole day - the single most likely way this feature turned into a bug report.
- **Quiet hours**, a nightly do-not-disturb window. The bubble still shows, so a 3am reminder is waiting in the morning.
- **The break bubble respects all of it.** It came from a raw IPC rather than `notify()`, so every gate inside `notify()` was guarding a send that never happened, and the pet meowed through quiet hours regardless.
- **A treat handed over during a meeting gets eaten.** Parking the pet in its corner aims the same walk the trip to the fish uses, one step earlier in the frame, so it re-claimed that walk the moment the trip expired: the cat set off, was marched home just short of its food, set off again, and paced between corner and fish for as long as the treat existed - which is forever, since only eating clears it. Work mode is there to stop the pet wandering off on its own, not to veto something you clicked.

### Mail
- **The pet says who it is from.** "You have 3 new emails" still makes you go and look, which is the interruption it was meant to save you. It now reads *"Alice: Budget review"*. The envelope fetch is wrapped separately from the count, so a server that refuses it still gets you the old count-only line rather than losing the alert.
- **VIP senders.** Name the people who should reach you even while Focus Guard is holding everything else back. Matching is a case-insensitive substring of the From address - no pattern syntax to get wrong - so `@acme.com` covers a company and `boss@acme.com` one person.

### macOS
- **The overlay stopped strobing.** The 700ms always-on-top tick called `setVisibleOnAllWorkspaces`, which Electron documents as transforming the process type and hiding "the window and dock for a short time every time it is called" - roughly 1.4 times a second, forever. `app.dock.hide()` already makes this a UIElement app, so the transform was pure cost. The Windows re-raise trick in the same tick (toggle always-on-top off and on, then `moveTop`) also drops the window from screen-saver level to normal and back on every tick on macOS, and is now guarded to win32.
- **The builds were not unsigned, they were broken-signed.** electron-builder renames the executable and injects `app.asar`, which invalidates the seal Electron ships, and with `CSC_IDENTITY_AUTO_DISCOVERY=false` it has no ad-hoc fallback. macOS distinguishes the two sharply: an unsigned app offers "open anyway", an invalidly-signed one says *"pixelpets is damaged and can't be opened"* with no override. The bundle is now ad-hoc signed after packing, which also gives macOS the stable signature it keys the Accessibility grant and the Keychain entry to.
- **Cmd+C/V/X/A/Z work in Settings.** An accessory app draws no menu bar, and macOS delivers those as Edit-menu key equivalents - so they were dead on the two fields nobody can type by hand: a 16-character Gmail app-password and a long secret `.ics` URL, both masked.
- **The Accessibility permission is picked up without a restart.** The first `uIOhook.start()` raises the prompt and then fails, because the permission does not exist yet at that moment. Starting once left typing reactions and scroll-to-climb permanently dead even after the user granted it, with the only clue a console line invisible in a packaged app.
- **Autostart registers the right thing.** It passed `path` and `args`, which are documented win32-only; from source `process.execPath` is Electron's own binary, so macOS would have registered Electron.app and handed the user a bare Electron window at login. It now registers only a packaged bundle, and decides once rather than re-asserting over a choice made in System Settings.
- **A menu-bar glyph that behaves like one**, plus `fullscreenable: false` so another app going fullscreen cannot hide the pet, `LSUIElement` so the Dock icon does not flash at launch, and copy that no longer tells Mac users about their taskbar.
- **The release workflow cannot drop the mac artifacts.** Both build jobs called `action-gh-release` against the same tag in parallel; workflow-level concurrency serializes runs, not jobs. CI also boots the app on macos-latest now.

## [0.4.0] - 2026-08-25

### Scroll reaction
- **Scrolling no longer makes every pet climb a rope.** Coats that ship hand-painted climb art still climb it. Every other coat, and every dog, now rears up and swipes at a leaf blowing past in the direction you are scrolling, faster the harder you flick the wheel. The procedural climb pose those coats used to fall back on could not be made to read at sprite size and has been removed: `eyeBox()` splits the grid at column 12 so the face has to straddle that seam, which pinned the body at column 11.25 while the rope sat at 18.4, leaving the arm no reach that did not cross the face. The only place it could grip was above the head, where a 4x3-cell mitt renders as a pale lump growing out of the skull rather than a paw. The swipe reuses the butterfly's bat rig, whose arm bows outward specifically to clear the skull, which is why the same overhead reach is legible there.
- **The two reactions are mutually exclusive at the source**, so no leaf is ever in flight for a coat that is climbing.

### Pets
- **One dog breed.** The Black Lab is the only breed now. No migration is needed: `dogPattern` is clamped to the breed list, so a saved index simply collapses onto it.
- **Mackerel Tabby is the out-of-box coat**, replacing Tuxedo. It ships painted climb art, so a new install gets the rope climb on its first scroll. Existing installs keep whatever coat they were on.
- **First-run hints.** Nothing in the running app said that double-clicking opens Settings, right-clicking cycles the coat, or that scrolling does anything at all, so all of it was discoverable only by reading this repository first. Two short speech bubbles now appear once, ever, six and eighteen seconds after the pet arrives. They mark themselves seen before showing, so the automatic reload after a renderer crash cannot replay them.

### Sound
- **The swipe has a sound.** The rear-up bat was silent, and that pose drives both the butterfly and the scroll leaf, so the pet's most physical animation made no noise. It is filtered noise whose band sweeps up as the paw accelerates and falls away past the top of the arc. It fires once per stroke rather than once per frame, which is the difference between texture and a hiss.
- **Dropping the pet lands.** Tapping it chirped and shaking it mrrped, but picking it up and dropping it was silent, on the one interaction that is entirely about physical feel. A low thud with a paw-pat on top, scaled by how far it fell, so setting it down gently is nearly inaudible. Gated on fall distance, because the same easing also runs when the floor line shifts under a pet already sitting on it, which is not a landing.
- **Removed the optional meow sample.** The app documented dropping in an `assets/meow.*` recording to replace the synth meow. The page's own Content Security Policy has no `connect-src`, so it falls back to `default-src 'none'` and blocks the XHR that loaded it: the feature could never work, and logged three CSP violations on every launch while failing. Every sound is now genuinely synthesized.

### Fixes
- **The give slot stayed in its own lane.** Switching species mid-meal left the cat's fish behind for the dog to inherit and eat, because `setSpecies()` cleared the dog's ball but never the cat's treat while both update every frame. Separately, a dropped treat and a thrown ball clamped to the raw screen edge while the pet's approach point is clamped to the play area, so with a constrained play area the food landed outside the zone the pet is allowed into and sat there forever.
- **The renderer crash handler cannot loop.** `render-process-gone` reloaded unconditionally after 400ms with no cap. A transparent always-on-top compositor meets every consumer GPU driver in the wild, and a driver that crashes the renderer on load would have reloaded forever: sustained CPU, log spam, and a flickering overlay with no way to see why. It now backs off exponentially to a 15s ceiling, gives up after five consecutive crashes and says so.
- **Notification history is written atomically**, matching `settings.json` and `themes.json`. It was the one persisted file that could be left truncated by a crash mid-write.
- **`--treat=1` works.** The preview flag was matched with an exact `includes('--treat')`, so the `=1` form the code's own comment documented was silently ignored. Added `--ball=1` alongside it, since the dog's fetch has the most complex state machine in the give slot and had no way to eyeball a frame of it.

### Security
- **Patched three high-severity advisories** reachable through the mail dependency (`ip-address` SSRF and trust-boundary bypasses via `socks`, and `nodemailer`'s raw-message option bypassing `disableFileAccess`). Neither was reachable from this app's own code paths, but electron-builder bundles `node_modules` into every release, so they shipped regardless. Production dependencies now audit clean.

### Docs
- **The download page says what your OS will do.** The builds are unsigned, so Windows SmartScreen shows a full-screen warning and macOS Gatekeeper refuses a double-click. Both the README and the release notes now say so up front, with the steps, rather than letting people meet it cold.

### Settings window
- **Sections instead of one long scroll.** Everything lived in a single column: eleven cards, about 3400px of it, inside a window fixed at 560px. Reaching the pomodoro or the calendar meant scrolling past ten cards you were not looking for, with nothing to aim at and no sense of how much was left. The window is now five tabs - Pet, Play, Sound, Focus, Feeds - and the tallest of them is 1130px, with Sound fitting on screen whole. The rail is keyboard-drivable (arrows, Home/End) and carries the ARIA a tablist is supposed to.
- **The window stopped calling itself pixelcat.** 0.3.0 renamed the app, the repo and the docs, but the settings header still read "pixelcat" - at people who had just chosen a dog.
- **A dog owner is no longer told about a cat.** The window hard-coded the cat's nouns, so a dog owner read "your cat", "the cat calls you by it", "Butterfly visits - a butterfly drops by and the cat plays with it" and "Test meow", while the tray - reading the species registry - already called that same toggle "Ball to chase". Those strings now live in `pets.js` beside the tray's, so the two windows cannot describe one toggle differently, and a test fails if any dog-facing string mentions a cat.
- **Settings can be made taller.** Width stays pinned to the one-column layout, but the height is draggable now (420 minimum, 640 default) rather than frozen at 560.
- **Keyboard focus is visible again.** The toggle switches are `appearance:none`, which had taken their focus ring with them, so tabbing through the window gave no clue which switch was about to be flipped.

### Fixes
- **Custom coats never actually applied.** A coat is stored as an index into a list that runs the built-in coats first and the user's custom coats after, which is exactly how the tray submenu and the settings dropdown both build it. `config.js` clamped that index at the last *built-in* coat, so every pick of a custom coat, from either menu, was silently rewritten to Russian Blue. You could design a coat or import a coat pack, watch it appear in both pickers, choose it, and see the cat stay precisely as it was: the coat editor, the import and the export were decoration on a feature nothing could reach. The index range now covers the custom coats, bounded by a cap on how many `themes.json` may hold, because the overlay builds a full set of sprites per coat and an imported list is arbitrary user data.
- **Deleting a custom coat repainted the cat as a different one.** Custom coats are addressed by position, so removing one shifts every coat below it up a slot. Deleting the first of two handed the cat the second; deleting the coat it was actually wearing left the index pointing past the end of the list, which the settings dropdown shows as a blank selection.
- **A custom coat could lose a race against its own theme list.** A custom coat's index is only in range once the theme behind it has been built, so a config that arrived before the themes was clamped down to a built-in coat and stayed there, which looks identical to the bug above.
- **Right-clicking a dog cycled the cat's coat.** The right-click coat cycle wrote to the cat's `pattern` slot whatever the pet happened to be, so a breed chosen that way was gone by the next launch (nothing ever updated `dogPattern`) and the cat came back wearing an index it never chose. The cycle also ran over the cat's custom coats, which the tray and `config.js` both refuse for a dog, so the last breed could never wrap round to the first.
- **Custom coats vanished when the pet changed species.** A species swap rebuilds the coat tables from the built-ins, and main only broadcasts the theme list when it changes, so cat to dog and back dropped every custom coat until the next restart. The swap replays them now, and builds them for the cat alone, which is what the tray, the settings window and `config.js` have said all along.
- **The rear-up batting pose could wear the wrong coat.** Raised-limb poses are built lazily and memoised by coat index, and an index means a different coat once the coat list changes. The climb and raised-paw caches were cleared on a theme change; the batting one was missed.
- **A coat fallback named the launch species' list.** The out-of-box coat was resolved once at load, so a dog falling back to it landed on coat 4 of the breed list, a Siberian Husky, because 4 is where the cat's Tuxedo sits.
- **The dog coat preview drew a cat.** Picking a breed relabelled everything correctly and then went on showing the previously drawn cat, because the preview read its palettes off `window.DOG_PATTERNS` - and `dog-sprite.js` is a classic script whose top-level `const`s are global *lexical* bindings that never become window properties. The lookup came back undefined and the draw bailed out early and silently, so the preview had never once rendered a dog.
- **The coat list could belong to the wrong species.** The first config and the first custom-coat list arrive as two independent IPC replies, and only the themes reply rebuilt the dropdown, so whenever it won the race a dog owner was offered the cat's coats.
- **Speech bubbles hold their text.** The panel was capped at 260px but the whole message was drawn anyway, so anything past roughly 44 characters spilled white text onto the wallpaper either side of the box, where it is unreadable. Reminders and the pinned note are allowed 80 characters and calendar event titles had no cap at all, so this was the normal case rather than an edge case. Messages now wrap, an over-long word is broken instead of left hanging, a message too long to show at all is ellipsised rather than silently cut, and the panel is clamped onto the screen with its tail still pointing at the pet - which matters because the pet's default resting spot is a screen corner.
- **Alerts no longer overwrite each other.** Two arriving together - two reminders set for the same minute, or a reminder landing during a calendar nudge - meant the second replaced the first on the spot, so the first could be gone milliseconds after it appeared. Only identical messages were ever suppressed, so two different alerts always collided. They now queue, and each gets its full time on screen, including while the pet is hunting or startled.
- **Calendar event titles are length-capped** before they become a bubble and a Windows toast. They come from someone else's calendar and, unlike reminders and the pinned note, arrived with no bound at all.
- **`--shot` previews stopped cropping their own canvas.** The preview window was 20px narrower than the canvas the renderer sizes itself to, so every capture quietly lost the right-hand edge and the missing pixels read as a rendering bug in whatever was being previewed. The two sizes are now tied together and pinned by a test.

### Rebrand loose ends
- **The hero banner and the social card still said PIXELCAT in pixels.** Both wordmarks are baked into generated art rather than written in markup, so the 0.3.0 rename could not reach them and no text search for the new name would ever have found them. `hero-banner.gif` is the first thing on the README, which made it the most-seen stale branding left anywhere. Both generators now render `PIXELPETS`, and the committed assets have been regenerated. The taglines went species-neutral with them: the banner reads "a cat or a dog that lives on your desktop" (matching the site), the card reads "a pet that lives on your desktop".
- **The agent integrations still called the app pixelcat** in every README title, in the setup prose, and in the `/ABSOLUTE/PATH/TO/pixelcat` checkout placeholders. Those pages are the first thing anyone wiring up a Claude Code, Codex, Cursor, Kiro or Antigravity hook reads. The placeholders moved in lockstep with the substitution in `scripts/install-hook.js` that fills them in, which a test already covers.
- **A fresh install created a shortcut called "pixelcat"** (`nsis.shortcutName`). It is cosmetic and separate from the app identity, so it was safe to correct.
- **The calendar worker introduced itself to other people's servers as `pixelcat-cal`** in its User-Agent.
- The standalone Lobby Jam page under `extras/` still carried the old name in its title and header.
- Deliberately left alone, and pinned by `tests/bridge-paths.test.js` so a future sweep has to read the reasoning first: the `appId`, the `%TEMP%/pixelcat-*` bridge paths that installed hooks already write to, the `%APPDATA%/pixelcat` legacy directory that the migration exists to find, the `PixelcatPreview` global, and the site's `pixelcat.coat` localStorage key. The `pixelcat-jet.vercel.app` URLs stay until the Vercel project itself is renamed.

### Added
- **`--shot --note="<text>"`** pins a speech bubble open in a preview capture, so wrapping and edge clamping can be checked against a real font.
- **`launch-pixelpets.vbs`**, a silent Windows launcher for running from source, is now part of the repo instead of a local-only file. `npm start` leaves a console window sitting behind the pet, which is why a shortcut wants this instead. It resolves the project from its own location rather than a hard-coded path, so moving or renaming the folder cannot leave the shortcut pointing at nothing, and it says what is wrong if dependencies were never installed rather than failing silently.

## [0.3.0] - 2026-08-03

### Dogs, and a new name
- **The dog is a first-class pet** - pick Cat or Dog and the whole app follows: sprite, voice, tray wording, and the companion it plays with. 14 breeds (Golden Retriever, Shiba Inu, Corgi, Beagle, Siberian Husky, Dalmatian, German Shepherd, Border Collie, Dachshund, Pug, Black Lab, Poodle, Australian Shepherd, Chihuahua) alongside the 14 cat coats.
- **pixelcat is now pixelpets** - the old name stopped being true the moment it could be a dog. Existing installs keep everything; see the upgrade note under Fixes.
- **A dog sounds like a dog** - its own synthesized voice with bark, pant, whine and huff, switched with the species. A bark is modelled as a plosive rather than a re-pitched meow, and a hound bays instead of yapping.
- **Species picker and breed list** in the settings window, with the coat dropdown relabelled Breed for a dog.
- **Fetch on its own** - step away and a dog starts its own game rather than waiting on a butterfly: it noses a ball out, chases it down and carries it home. Cats still get the butterfly. One toggle governs both, and work mode, reduced motion and low power suppress both.

### Art & poses
- **Every activity is a composed pose** - climbing, paw-up and batting compose real limbs into the sprite grid instead of reusing the sit pose, so an activity finally looks like the thing it is.
- **Painted frames override a composed pose** - hand-paint a frame, import it, and it takes precedence over the procedural one, with a guide covering how to paint and import.
- **Contact sheets for every activity** - `npm run poses:cat` and `npm run poses:dog` render each activity, not just the sit pose.
- **1280x640 social preview card** and a generator for it (`npm run social`).

### Fixes
- **The dog stops re-fetching the ball it just delivered.** It dropped the ball at its own feet, was back inside the grab radius on the next frame, and looped pickup/deliver at frame rate: 254 heart-and-chirp bursts in 72 seconds and a pant timer that never expired. Only the first throw ever looked right.
- **Tray wording matches what the tray actually does.** A dog was offered "Give a treat 🦴" and then thrown a tennis ball; it now reads "Throw the ball 🎾", alongside "Ball to chase" and "Work mode (stay put, no ball)".
- **Upgrading from 0.2.0 keeps your pet, your coats and your mailbox.** Electron derives the per-user data folder from the product name, so renaming pixelcat to pixelpets pointed the app at an empty directory: the next release would have greeted every existing user with an unnamed, default-coat pet, no custom coats, no notification recap, and a silently disconnected inbox, since `email.cred` holds an encrypted app-password that cannot be retyped from memory. First launch under the new name now carries the old files across. It never overwrites a file already saved under the new name, never touches the old folder, and only runs once, so deleting a file on purpose keeps it deleted.
- **`npm run lint` works on a real working copy again** - it was walking local-only paths that `.gitignore` already excludes and reporting ~1.5k errors from code this repo does not own.

### Community
- **Contributing guide, security policy, code of conduct, issue forms and a pull-request template**, so the repo is actually set up to take a contribution.

## [0.2.0] - 2026-07-25

### Stay on track
- **Pomodoro focus timer** - focus/break loops with a pixel timer floating next to the cat, plus a **pinned note** that stays in a bubble above its head.
- **IMAP unread-mail alerts** - point the cat at any IMAP inbox; the app-password is stored encrypted at rest and the connection runs in an isolated worker.
- **Calendar nudges** - paste a secret `.ics` URL and the cat nudges you a few minutes before each event.
- **Notify the cat** - `scripts/notify.js` pushes any message from a script, CI, or cron job as a speech bubble + Windows toast + meow, with a tray **recap of recent notifications**.
- **Work mode** - park the cat in its corner and hide the butterfly while you focus.

### Cat & behavior
- **Butterfly overhaul** - it comes out on its own when you step away, plays near the cat, and the cat winds up, leaps, and bats it out of the air; toggle via **Butterfly visits**.
- **Welcome-back greeting** - return after being away and the cat perks up with happy eyes, a heart, and a friendly chirp.
- **Give a treat** - tray → **Give a treat 🐟** drops a little fish; the cat trots over and noms it with hearts.
- **Rest corner** - choose bottom-left or bottom-right as home; the cat drifts back to that side.
- **Night-time sleepiness** - after 23:00 the cat winds down faster, so it loafs and dozes more.
- **Cursor gaze** - the cat stares at a still cursor and roams its eyes after a while.

### Sound
- **Lobby Jam** - live-synthesized lo-fi study music the cat plays on a little guitar, in six moods (Cozy café, Dreamy, Upbeat lounge, Deep focus, Rainy study, Sleepy night). No audio files.
- **More lifelike meow** - a gliding two-formant "me-ow" with per-species voices and a rolled chirrup/trill; drop `assets/meow.(ogg|mp3|wav)` to use a real recording instead (still 100% synth by default).
- **Warmer purr** and an **output safety limiter** (compressor + tanh soft-clip) so the mix can never clip or distort.

### Art & coats
- **Chocolate** (solid warm-brown Havana, green eyes) and **Russian Blue** (cool blue-grey, green eyes) - 14 built-in coats total.
- **3D glossy app + tray icons** on a high-contrast tile.

### Security
- **IPC sender validation** on all main-process handlers.
- **Calendar fetch pinned to a vetted IP** (DNS-rebinding guard), SSRF guard, and Electron/CSP hardening.
- **STARTTLS hardening** on the mail worker.

### Fixes & performance
- The cat now sits flush on the taskbar line (DPI-correct floor, HiDPI-crisp rendering).
- The butterfly no longer gets stuck at the screen edge, and stays away while you use the mouse.
- Fixed a double-meow, scroll waking the cat from sleep, and a `drawCat` render hot path.

### Site & docs
- **Live demo site** - a landing page with a playable cat and a footage gallery at [pixelcat-jet.vercel.app](https://pixelcat-jet.vercel.app).
- **README v2** - animated hero banner, interaction gallery, and coat carousel, all rendered from the app's own sprite code.

## [0.1.0] - 2026-06-08

### Cat & behavior
- **Mood/energy model** - sleepy → calm → playful → zoomies (with a hard crash from zoomies), tunable; off via tray/Settings.
- **Autonomous roaming** - the cat wanders to new spots inside its play area (toggle: tray → **Wander**).
- **Distinct touch reactions** - **tap** = a quick pet; **head**-pet = purr + hearts; **body**-touch = lean/arch into your hand, tail up, trills.
- **Startle** - a sudden cursor jolt makes it flinch/puff, freeze, then bolt or creep back.
- **Idle life** - blink, look-around, tail flicks, content loaf, and a curled sleep with `z z z` + snore puff.
- **Liveliness** - typing (screen glow, faster paw taps), sleeping (belly breathing, tail wag), scrolling (a paw bats the paper).

### Poses & art
- Redesigned **sleep** (curled ball, tail wrapped over the face) and **typing** (sprawled "keyboard cat" on a laptop).
- **Unique pixel-art logo** - the sit-cat sprite as crisp blocks on an indigo tile.
- **12 built-in coats** + **custom coats** (color / build / tabby) with **import/export** and a **live preview** in Settings.

### Sound
- **Synthesized meow, purr, chirp, and startled mrrp** - all Web Audio generated in code, no audio assets to ship.

### Overlay & windows
- **Always on top** - re-asserts top-most (over fullscreen apps too).
- **Play area** - confine the cat to a region via tray **presets** or **drag-to-draw** ("Set play area (drag)…").
- Stretch break timer, timed reminders, calls you by name.

### AI agent reactions
- Work-status reactions (thinking / working / error / done) for **Claude Code, Codex, Cursor, Antigravity, Kiro** - ready configs in `integrations/`, or `npm run hook -- <agent>`.

### Developer
- Contact-sheet QA harness (`npm run sheet`), smoke tests (`npm test`), and electron-builder packaging (`npm run pack` / `npm run dist`).
