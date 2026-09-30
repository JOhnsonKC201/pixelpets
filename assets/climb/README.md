# Scroll rope-climb sprite frames (per coat)

> **Status: ON, for the coats that have art.**
>
> `PAINTED_CLIMB = true` in `src/overlay/climb.js`. A coat with its own folder here
> climbs the rope. Every coat WITHOUT one, and every dog, rears up and swipes at a
> leaf blowing past instead (`swatLeaf` in the overlay).
>
> Painted, so climbing: `mackerel-tabby` (the shipped default), `orange-tabby`,
> `tuxedo`, and `tortoiseshell`.
>
> `tortoiseshell` is DERIVED, not drawn: it is the tuxedo frames re-tinted, since
> the two share a base coat and differ only in bib colour and eye colour. See
> `~/pixelpets-frame-pack/tools/recolour-climb.py`. That trick only works between
> coats that are a palette apart, and it recolours regions rather than repainting
> markings, so a real tortie's mottling is not reproduced.
>
> `gray` ships frames but is on `CLIMB_FRAME_SKIP`, because its art is a green-eyed
> gray-and-white bicolor while the coat is solid gray with gold eyes; repaint it and
> drop it from that set to enable it.
>
> There is no longer a procedural climb to fall back on, and that is deliberate.
> `eyeBox()` splits the grid at column 12 so the face must straddle that seam,
> which pinned the body at column 11.25 while the rope sat at 18.4, leaving the arm
> no reach that did not cross the face. The only place it could grip was above the
> head, where a 4x3-cell mitt reads as a lump on the skull rather than a paw. The
> leaf swipe reuses the butterfly's bat rig, whose arm bows outward specifically to
> clear the skull, which is why the same overhead reach is legible there.
>
> So adding a sheet here is now purely additive: that coat gains a climb, and
> nothing regresses if you never add one. Prompts for every remaining coat live in
> `~/pixelpets-frame-pack/prompts/`, carrying the palette and the style rules.

## Layout

```
assets/climb/
├── _sheets/            # original contact sheets (not embedded), for reproducibility
├── tuxedo/             # the DEFAULT set every other coat falls back to
│   ├── idle.png  up1.png  up2.png  down1.png  down2.png
├── orange-tabby/       # optional per-coat override (same 5 files)
└── …                   # one folder per coat slug you want to customise
```

Coat slug = the `PATTERNS` name (in `src/cat-sprite.js`) lowercased with spaces →
hyphens: `Orange Tabby` → `orange-tabby`, `Tuxedo` → `tuxedo`, `Calico` → `calico`.

| File | Pose |
|------|------|
| `idle.png` | hanging on the rope, relaxed |
| `up1.png` / `up2.png` | climbing up (alternate) |
| `down1.png` / `down2.png` | descending (alternate) |

## Add / replace a coat

1. **From a 5-panel contact sheet** (idle \| up \| up \| down \| down on a *dark*
   background - darker than the fur):
   ```
   node scripts/slice-climb-sheet.js path/to/sheet.png <coat-slug> [bgThreshold]
   npm run climb-frames
   ```
   It slices the 5 panels and keys out the dark background into
   `assets/climb/<coat-slug>/`. Tune `bgThreshold` if the body gets eaten (lower) or
   halos appear (raise).
2. **Already have 5 transparent PNGs?** Put them in `assets/climb/<coat-slug>/` with
   the names above and run `npm run climb-frames`.

Each frame is a full painted scene (cat + rope + ball) on a transparent background.
Alignment/scale is controlled by `CLIMB_SCENE_H` / `CLIMB_ANCHOR_X` / `CLIMB_DROP`
in `src/overlay/climb.js`.

## QA after embedding

```
npm run climb-frames
npx electron . --shot --state=paper --dir=up   --at=900   # writes _render.png (default coat -> tuxedo fallback)
npx electron . --shot --state=paper --dir=down --pattern=tuxedo --at=900
```
