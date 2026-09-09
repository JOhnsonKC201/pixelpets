# Features

Everything pixelpets does, in detail. The [README](../README.md) has the short
version; this page is the full catalogue.

- [Meet the pet](#meet-the-pet)
- [Coats and pixel art](#coats-and-pixel-art)
- [Moods and energy](#moods-and-energy)
- [Sound](#sound)
- [The overlay](#the-overlay)
- [Stay on track](#stay-on-track)

## Meet the pet

The whole point: a pet that *feels* alive on your desktop. It reacts to touch,
to your cursor, to your typing, and to its own internal mood.

| Interaction | What the cat does |
|-------------|-------------------|
| **Drag it** | Stretches like mochi (head and feet stay solid while the body thins), then squashes and bounces back. Shake it side to side and it wobbles like jello with a startled mrrp. It settles onto the bottom line right where you let go, and that spot becomes home: it still wanders, but around the spot you picked rather than back to the corner it started in. |
| **Pet its head** | Squeezes its eyes shut, wiggles, floats little hearts, and purrs. The squint holds through the whole stroke, not just when your hand stops moving. |
| **Touch its body** | Squints just as happily, leans and arches into your hand, tail up, trilling. |
| **Tap it** | A quick pet: happy eyes, hearts, a chirp. |
| **Move your cursor** | The cat watches it and blinks now and then. Flick the cursor fast and it crouches, stalks, and pounces. A sudden jolt startles it: it puffs up, freezes, then bolts or creeps back. |
| **Type in any app** | It leans onto two big keys and kneads them with its paws. Type fast enough and it overheats, turning red with steam, then cools down. |
| **Scroll anywhere** | Coats with hand-painted climb art grab a yarn rope and haul themselves up it, hand over hand, with a ball of yarn on the floor below. Every other coat, and every dog, rears up and swipes at a leaf blowing past in the direction you are scrolling, faster the harder you flick the wheel. |
| **Wait for a visitor** | Once in a while a butterfly flutters in. The cat perks up, tracks it, rises on its haunches to swat at it, and now and then pounces and catches it: it holds the bug between its paws for a moment, lets it go, and bounces after it with happy eyes and a pleased trill. Step away from the keyboard and one comes out on its own, so the pet always has something to play with. Keep a dog instead and it starts its own game of fetch rather than waiting on a butterfly. |
| **Leave it be** | Left alone it keeps itself busy: it bats a drifting leaf with a paw, washes its face, loafs, and its whiskers twitch. Lively without ever getting in your way. |
| **Come back** | Return after being away and the cat notices you: happy eyes, a little heart, and a friendly chirp hello. |
| **Give it a treat** | Pick "Give a treat" from the tray and a little fish drops in. The cat trots over and noms it with hearts and a happy chirp. |
| **Late at night** | After 23:00 the cat winds down. It settles to calm faster and loafs or dozes more, though a nudge still rouses it. |

### Cat or dog

Pick your species from the tray (**Pet > Cat / Dog**). Each one keeps its own
coat choice, so switching back and forth never loses your pick.

|  | Cat | Dog |
|---|---|---|
| Coats | 14 coats, from Orange Tabby to Russian Blue | the Black Lab |
| Resting | loafs into a "cat bread" | curls nose-to-tail into a ring |
| Excited | hunting crouch, ears back | **play bow**: chest down, rump up, tail flagged |
| Tail | slow rolling S-curve, tip flicks | fast wag from the base, shaped per breed (curl / plume / feather / stub / straight) |
| Play | bats a butterfly | **fetch**: chases the ball down, carries it home, drops it |
| Left alone | a butterfly flutters in | starts its own game of fetch |
| After exertion | grooms | pants, tongue out |
| Scroll | climbs a yarn rope, or swipes at a blowing leaf, depending on the coat | rears into a beg and swipes at the leaf |
| Reward | a fish treat | a tennis ball |

The dog is not a recoloured cat. It has its own sprite module with a muzzle that
protrudes past the skull line, floppy ears, a broader chest, and a straight
otter tail. Markings are coat *structures* rather than palette swaps, and the
build archetypes behind them (spotted, saddled, tricolour, masked, merle, and
the short-legged dwarf silhouette) are still in the sprite module for any breed
added back later.

```bash
npm run poses:dog   # previews/dog-poses.png - every breed x every ACTIVITY
npm run poses:cat   # previews/cat-poses.png - 14 coats x 11 activities
npm run sheet:dog   # previews/dog-sheet.png - the five base poses only
```

## Coats and pixel art

- 14 coat patterns: Orange, Mackerel, and Brown tabby, Siamese, Tuxedo, Black,
  Gray, White, Cream, Tortoiseshell, Calico, Slate, Chocolate (a solid warm-brown
  Havana with green eyes), and Russian Blue (cool blue-grey with green eyes). It
  ships as Mackerel Tabby; right-click the cat to cycle, and your choice is
  remembered.
- Custom coats: design your own, documented in [custom-coats.md](custom-coats.md).
- The pixel art has a white sticker outline that pops on any wallpaper, soft
  top-lit shading, whiskers, a ground shadow, and sparkly eyes.
- The cat is one role-coded sprite recolored per pattern at draw time, so a
  dozen cats come from one shape, and shading, outline, and the overheat tint
  apply to every coat for free.

## Moods and energy

The cat tracks an internal energy value (0 to 100) that decays over time and is
bumped by stimuli: typing, scrolling, fast-mouse play, petting, an AI agent
finishing. Energy maps to three mood bands that gate and scale every reaction:

| Band | Energy | Behaviour |
|------|--------|-----------|
| **Calm** | 0-50 | Mellow, with small and infrequent idle moves (loafs, grooms) |
| **Playful** | 51-80 | Full reactions (the original feel) |
| **Zoomies** | 81-100 | Frantic and fast, then a hard crash back toward calm |

Keep it busy and it gets the zoomies, then settles back down. Startle fires on
an abrupt cursor jump (no microphone, fully local). The whole system turns off
with the Mood reactions toggle (Settings or tray) for the classic always-playful
behaviour, and the tray Mood submenu has "Zoomies!" and "Calm down" to drive the
model on demand.

## Sound

The meow is a voiced sawtooth shaped by a moving mouth formant (it opens into
the "ee" and closes through the "ow"), with a breath of air on the onset and
gentle vibrato. Each meow randomly comes out as a short mew, a two-syllable
meow, or a drawn-out meeow, so it never sounds canned, and pitch and length
also vary by cat species. There is also a purr, a rolled chirrup trill (the
flutter cats greet you with), and a startled mrrp. All of it is synthesized
with Web Audio in code, so there are no audio assets to ship. Toggle it in
Settings.

## The overlay

A full-screen, transparent, click-through layer: the cat floats over everything
but only the cat itself is interactive. It stays on top of every app (it
re-asserts top-most, even over fullscreen windows), and you can confine it to a
play area by picking a tray preset or drawing one with the mouse (tray > Set
play area). It starts at login by registering itself in Windows startup.

Drag the pet anywhere along the bottom and it stays on that side: the spot you
put it down on becomes home, so wandering, work mode, a restart and a monitor
change all bring it back there instead of the corner it started in. The spot is
kept as a fraction of the screen, so it survives a resolution change. To go back
to a plain corner, pick a rest corner in Settings, or use Send it home (Settings
> make it do something, or tray > Rest corner).


## Stay on track

pixelpets doubles as a quiet productivity companion. Every alert comes through
your pet, as a meow or a bark and a speech bubble, with an optional real
desktop notification.

### Focus Guard

A desktop pet that meows into the middle of a screen-share is a desktop pet you
uninstall. Focus Guard is the pet noticing you are busy without being told.

It reads "busy" from a calendar event that is actually happening now (an all-day
block is explicitly not a meeting, so *Vacation* cannot silence it for a whole
day), from Quiet Hours, or from Work mode. While you are busy the pet parks in
its rest corner and stops chasing things, and email, reminders and agent
messages **wait** rather than interrupt.

Nothing is thrown away. Held messages still land in the tray recap as they
arrive, and when you are free the pet sums them up in one line: *"While you were
busy: 3 new emails and 1 reminder."* Calendar nudges always come through,
because being told about the meeting you are about to miss is the opposite of an
interruption, and you can name senders under **Always tell me about** so the
people who matter reach you anyway.

### Quiet hours

Set a From and To time and the pet goes silent between them: no meow, no desktop
notification. The speech bubble still appears, so a reminder that lands at 3am is
waiting for you in the morning rather than lost.

### Timers

- Break timer: pick an interval and the cat grows big to stretch with you and
  meows, on a schedule. Or "Start break now."
- Pomodoro timer: set focus and break loops, and a pixel timer floats next to the
  cat (a tomato dot for focus, green for break). At the end of each focus block
  the cat stretches with you; when the break ends it meows "Back to focus!".
  Toggle in Settings or the tray.

### Lobby Jam

Flip on Lobby Jam (Settings or the tray submenu) and the cat picks up a little
guitar and plays an endlessly improvising lo-fi loop: plucked Karplus-Strong
guitar over lazy jazz voicings, soft bass, brushed percussion, and tape warmth.
It is all Web Audio, generated live, with no audio files. Pick a mood:

| Mood | For |
|------|-----|
| **Cozy cafe** | A warm, easy background loop |
| **Dreamy** | Slow and washed out, with lots of reverb |
| **Upbeat lounge** | Brighter and a touch faster |
| **Deep focus** | Steady and minimal, almost no flourishes, so it stays out of the way while you work |
| **Rainy study** | A cozy loop over a soft, gusting rain bed |
| **Sleepy night** | Very slow, warm, and dark, for late-night wind-down |

The music mixes through the same Volume control as the meow and purr, and the
floating notes and the cat's strumming bob along in time with the beat. The same
generator also runs as a standalone page, with no Electron, in
[`tools/lobby-jam/`](../tools/lobby-jam/).

### Reminders and notes

- Reminders: set a time and a message and the cat meows and shows a speech
  bubble. Reminders can repeat (daily, weekdays, specific weekdays, or once), can
  be snoozed from the tray, and support `{name}`, `{time}`, and `{date}`
  placeholders.
- Pinned note: pin an important message and it stays in a bubble above the cat's
  head until you clear it. Reminders briefly take over, then it returns.
- It calls you by name: tell the cat your name in Settings (or use `{name}`) and
  it greets you with it.
- Desktop alerts: every reminder can also raise a real Windows notification and a
  sound, so you never miss one when you are not looking at the cat.

### Mail and calendar

- Unread-mail alerts: point the cat at your IMAP inbox (Gmail, Outlook, anything
  IMAP) and it tells you who the mail is from, as *"Alice: Budget review"*, so
  you can decide from the bubble instead of going to look. Name the senders you
  never want to miss under **Always tell me about**, and they reach you even
  while Focus Guard is holding everything else back; a bare domain like
  `@acme.com` covers everyone there. Your app password is stored encrypted at
  rest (Electron `safeStorage`, which is DPAPI on Windows), never in
  `settings.json`, and the IMAP connection runs in an isolated worker process.
- Calendar nudges: paste your calendar's secret `.ics` URL (Google and Outlook
  both provide one) and the cat nudges you a few minutes before each event. The
  feed is fetched and parsed in an isolated worker.

### Notify the pet from a script

Any script or tool can make the cat deliver an arbitrary message: a speech
bubble, a Windows toast, and a meow.

```bash
node scripts/notify.js "Build finished" --title CI --level success
node scripts/notify.js "Coffee break" --ttl 8000
echo "anything" | node scripts/notify.js "Deploy done"   # hook-safe (drains stdin)
```

Flags: `--title <T>`, `--level info|success|warn|alert`, `--ttl <ms>`,
`--no-sound`. The script appends one JSON line to `%TEMP%/pixelcat-notify.jsonl`
and the running pet tails the file. Lines written before the pet launched are
ignored (no backlog replay), and calling it while the pet is closed is harmless.
