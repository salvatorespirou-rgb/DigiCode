# Tyre Express — concept build

A speculative site for **Tyre Express**, 60 Wellington Rd (cnr Clyde St),
South Granville NSW 2142. Built by DigiCode as a sales pitch. **Not
affiliated with or endorsed by the business.**

Open `index.html`. No build step, no dependencies.

```
index.html        the page
css/style.css     tokens, sections, the rolling headline, responsive, reduced-motion
js/motion.js      reveals, the rolling headline, nav
assets/img/       logo.png, shopfront.jpg, workshop.jpg, tyre-sidewall.jpg (+ src/, brands/, hero/)
```

## Where every fact on the page came from

This matters more than usual: a pitch that states something the owner knows
is wrong loses the room. Each claim is tagged with how it was established.

**Confirmed first-hand from the two photographs supplied** — the strongest
source available, because it is the business's own signage:

| Claim | Evidence |
|---|---|
| Wordmark "TYRE EXPRESS", orange/black/white | shopfront sign |
| Open 7 days | shopfront sign |
| Phone 9892 3587 | shopfront sign |
| **Licensed Vehicle Repairer, Licence No. 40946** | workshop wall sign |
| **Front End Specialist** | workshop wall sign |
| Orange-and-charcoal interior, hoists, alignment gear | workshop photo |

**Supplied by the client (DigiCode's own brief):** address, `(02) 9892 3587`,
opens 7am.

**Read off a third-party directory listing — needs the owner's confirmation
before this goes live:**

- The five brands: Bridgestone, Pirelli, Goodyear, Falken, Maxxis
- The fifteen services listed on the page

Source: <https://www.autohero.com.au/tyres/southgranville/tyre-express-south-granville/>

**Deliberately not stated anywhere on the page: a day-by-day opening table.**
Three sources disagree — their own sign says open 7 days, the directory above
says Sunday closed, and Google says it opens 7am. The page says "Open 7 days,
from 7am", which follows their own signage, and stops there. Confirm the real
hours before publishing.

**Their domain is not live.** `tyreexpress.com.au` currently resolves to an
unlaunched Shopify "opening soon" placeholder — verified directly. That is the
pitch: they have paid for a domain and have nothing on it.

## Design

Black, white and orange, lifted from the shopfront. Barlow Condensed in caps
for headings, Barlow for body — a workshop should read as competent rather
than delicate, so nothing here is soft-cornered or pastel.

### The wheel — removed

The hero used to be a two-column split: copy on the left, a CSS-drawn wheel on
the right that spun up on load and turned with the scroll. It was taken out at
the client's request and the headline expanded to fill the hero on its own.

Its markup, CSS and JavaScript were deleted rather than left in place. If it is
ever wanted back, it is in the history at `99ebd4c`, the last commit that
still carries it.

The hero is now typography on black above the shopfront photograph, which is
a cleaner and more confident opening, and the headline reads much larger. The
scroll-driven motion the wheel used to provide has since come back on the
photographs themselves — see below.

### The rolling headline

"We do **tyres** / seven days a week" — the middle word rolls over every two
seconds through tyres, alignment, brakes, suspension, log books and rego
checks. It does the job a paragraph would otherwise have to: says *we are not
only a tyre shop* in the first three seconds, without asking anyone to read.

Adapted from a React/framer-motion component. It is **not** React here — the
whole build is dependency-free static HTML and this page is 436 KB, so adding
React, framer-motion and a build step to move one word would have cost more
than everything else on the page combined. The state model is the same as the
original: the live word rests at zero, words already shown are held above,
words still to come wait below. A `cubic-bezier` that overshoots slightly
stands in for framer's spring.

Three things worth knowing before touching it:

- **The words are `aria-hidden`, with the full sentence beside them in an
  `.sr-only` span.** A screen reader gets one sentence instead of a word
  looping forever.
- **The rise animation on the other two hero lines had to be scoped off this
  one** (`.line:not(.line--cycle)`). It is `animation: rise ... forwards`, and
  a `forwards` fill outranks a class-driven `transform` permanently — so all
  six words pinned on top of each other and nothing ever moved. The same trap
  caught the reduced-motion block, which had its own blanket
  `transform: none` on those spans.
- **The slot is 1em tall with a padding-bottom of 0.14em and a matching
  negative margin.** This is insurance, not a fix for anything visible: the
  headline is uppercase and caps descend about 1px on this face, so a bare 1em
  slot clips nothing as it stands. Drop the `text-transform`, or add a
  lowercase word to the list, and the tails of y, g and p would need the room.
  It is `content-box` on purpose, against the global `border-box`, which would
  otherwise eat the padding out of the 1em rather than add to it.

  Worth recording how that was nearly got wrong: `measureText` does not apply
  CSS `text-transform`, so measuring the raw lowercase strings reports a 22px
  descent for a word that renders as caps and descends 1px. Measure what is
  drawn, not what is in the markup.

Measured at 1100px and 375px: no glyph clipped, exactly one word inside the
slot in all six states, nothing wraps (widest word 247px in a 345px slot on
mobile), no horizontal overflow. It pauses in a background tab and holds still
under `prefers-reduced-motion`.

### The tyre-size diagram

Was a hand-drawn half tyre in inline SVG. It is now a supplied photograph of a
real sidewall, marked P 215/65 R 15 95H with an arrow already painted onto
each part of the code, at `assets/img/tyre-sidewall.jpg` — the untouched
original is kept at `assets/img/src/tyre-sidewall-original.png` (1.7 MB,
gitignored; only the flattened, compressed JPG at 1200px wide, 139 KB, is
tracked). The earlier SVG's markup and every rule under `.tyre`, `.t-*` and
`.sw-*` were removed rather than left dead in the stylesheet.

The trade worth being honest about: the photograph is not DigiCode's own
artwork and does not recolour with the brand the way the drawn version did.
What it gains is a real tyre rather than an illustration of one, and arrows
already burned into the image rather than leader lines built by hand.

**The six callouts sit on top of the photograph's own arrows, not beside
them.** Six labels — `Type`, `Width`, `Aspect`, `Construction`, `Rim`,
`Load & Speed` — are absolutely positioned at `--x`/`--y` percentages of the
photo. Those percentages are not estimated: the source file was scanned pixel
by pixel for its red arrow paint, the hits were clustered by angle about the
wheel's centre, and each label was placed at its cluster's outer tip. The
brake caliper in the photo is red too and turned up as a seventh cluster on
the first pass, so anything inside the tyre itself is discarded before
clustering — worth knowing if this is ever redone from a different photo.
Checked afterwards: every label's rendered centre lands within a pixel of its
computed anchor.

**Two of the six arrow tips sit only 52px apart on a 375px screen** — Aspect
and Construction — while nowrap labels centred on them measure 60px and 97px.
The anchors cannot move; they are pinned to real ink in the photograph. Below
620px the labels instead wrap to two lines inside a 66px cap, which is what
buys the room back — "Construction" drops from 97px to about 55px this way.
One pixel of box overlap remains between that pair even after tightening the
padding; imperceptible in practice, but worth knowing if it is ever revisited.

The worked example in the list below is correct: for 215/65R15, the sidewall
is 65% of 215 mm, about 140 mm — P 215/65 R 15 95H is what this particular
photograph actually shows, not the 195/65R15 91V used in the original SVG, so
every number in the definitions list was updated to match, including a sixth
entry for the `P` type marking that the earlier diagram did not have at all.

## Layout width

There is one `--gutter` for the page, `clamp(1.1rem, 4vw, 2.6rem)`, used by the
nav and the hero alike so the two cannot drift apart. Before it, `--shell` was
capped at 1200px and centred: on a 2200px monitor the logo sat 42px from the
edge while the hero text started at 493px, throwing away 450px of room on each
side and leaving everything looking marooned in the middle.

The hero now runs from the gutter, so the headline begins exactly where the
logo does and the reel takes the rest of the width. `--shell` still centres the
content sections but caps at 1560px rather than 1200. The hero copy is capped
at `min(1100px, 74%)`, or on a very wide monitor the sub-heading would run to
an unreadable measure.

**The four hero stats sit outside `.hero-copy`, as a sibling rather than a
child, for exactly this reason.** Centred inside the narrow column they were
centred on the *column's* midpoint, which trails the true centre of the page
by a growing amount as the screen widens — about 190px at 1440px, since
`.hero-copy` is capped at 74% but still starts at the left gutter rather than
being centred itself. Moved out to be a direct child of `.hero-grid`, which is
inset from the page edges by the same `--gutter` on both sides, the stats'
own centring lands within about 20px of the page's true centre at every width
tested (375 to 2200px) — close enough that the boundary between the second and
third stat reads as sitting on the page's centre line, without a hand-tuned
offset that would need revisiting at every breakpoint.

The residual few pixels are simply because "Major Brands" and "Tyre Change"
are not exactly as wide as "Days A Week" and "Doors Open" — a symmetric row
of unequal-width items is never perfectly centred on its middle boundary,
only close to it.

**`--shell` is built from `100%`, not `100vw`.** `vw` is the device viewport
with the scrollbar included, so on any page tall enough to scroll it measures
wider than what is actually visible — every `.shell` was running about 15-18px
past the real right edge. `%` resolves against the containing block at the
point `--shell` is used, which for a full-width section is the content area
the scrollbar has already been subtracted from.

**A second, unrelated cause of the same symptom was found while chasing that
one down.** The workshop photo's scroll-driven tilt (`rotateX`/`rotateY`, see
"The shop photographs" below) very slightly overshoots its box at some scroll
positions. `transform` does not affect layout, but it does count toward
scrollable overflow, and nothing was clipping it at the document level — the
page could genuinely scroll about 25px sideways with no visible cause. `body`
already carried `overflow-x: hidden`, which per spec should propagate to the
viewport when `html` is left at its default `visible`, but that propagation
was not fully suppressing it here. `html` now carries `overflow-x: hidden`
directly rather than relying on the propagation. Anywhere a `transform` is
animated close to a section edge, this is the class of bug to check for —
`document.documentElement.scrollWidth > document.documentElement.clientWidth`
is the real test; an element-by-element scan of `getBoundingClientRect` can
report nothing out of bounds and still miss it.

### The hero reel

Three photographs cross-fading in the space beside the headline, held 3.8
seconds each with a 1.1s fade. Files in `assets/img/hero/`, originals in
`assets/img/hero/src/`.

It sits on the right, clear from its left edge and dissolving away toward the
right, so the picture lets go of the page rather than stopping at a border.

**The box takes the photograph's shape, not the other way round.** It is 1.43:1
— the same aspect as all three files — and rests its bottom edge on the rule
above the three facts. Because box aspect and image aspect match, `cover` crops
nothing: the whole frame is shown, sized to reach the rule. An earlier version
ran the panel the full height of the section, which meant cropping hard into
each photograph and magnifying it about 2.5x.

Where that rule falls depends on how the headline and copy wrap, so `motion.js`
measures it and writes `--reel-bottom`; the stylesheet anchors the reel by its
bottom edge. Without the script the reel simply sits at the foot of the section.
It is re-measured on resize and after `document.fonts.ready`, since web fonts
land after first paint and change how the headline wraps.

**Fitting rather than filling also fixed the resolution problem.** The supplied
files are small — 756x550 and 536x360 — and the earlier full-height panel was
magnifying them roughly 2.5x. Shown whole at 900x629, they render at about
0.68x on a 1100px screen: downscaled, not upscaled, which is why they now look
sharp rather than soft. Reaching that shared 1.43:1 costs about ten pixels off
each of the two small files, so they are effectively the full frame. Only the
Pirelli takes a real crop, and at 1920x823 it has the pixels to spare.

The two daylight shots are graded to saturation 0.92, brightness 0.82,
contrast 1.12. An earlier pass at brightness 0.58 was too heavy and read as
dull. The Pirelli frame arrived near-black already and is barely touched — it
is the strongest of the three here, because it was shot to dissolve into black
in the first place.

**On a narrow screen it moves rather than hides.** Beside the headline there is
no space on a phone, and the band ran behind the buttons and read as clutter.
It sits after the copy in the markup for exactly this reason: wide screens lift
it out and position it absolutely, narrow screens leave it in the flow as a
full-width band under the facts. Hiding it on mobile was the other option and
the worse one — that is the device the pitch will most often be shown on.

**The headline carries a text-shadow because of this.** Its last line runs
across the reel, and the Tacoma frame puts a silver bonnet directly beneath
white caps — measured, the brightest pixels there drop white text to a
contrast ratio of 1.8. A soft dark spread on the type fixes that without
laying a scrim over the photograph, and on the black either side of the reel
it cannot be seen at all. Mean contrast across the overlap measures 6.4, 10.1
and 13.7 for the three slides.

The first slide carries `is-on` from the markup, so there is no first paint to
schedule and no empty band without JavaScript. It stops in a background tab and
does not run at all under `prefers-reduced-motion`.

### The shop photographs

Both sit borderless on the near-black ground, masked so their edges dissolve
into the page, and each leans a little as it passes up the screen.

**The mask is two crossed linear gradients, not one radial.** That was arrived
at the hard way. A radial big enough to soften the corners drags a vignette
through the middle of the picture; a radial small enough to leave the middle
alone barely touches the edges. Crossing a vertical fade with a horizontal one
and intersecting them feathers all four sides evenly and leaves the centre
completely untouched.

Worth knowing if the mask is ever retuned: **the radii are a share of the box,
so they are easy to get backwards.** The first attempt used `125%`, which puts
the box edge only 40% of the way along the gradient — inside the opaque stop,
so nothing faded at all and the photograph still had hard edges.

Where `mask-composite` is unsupported the two masks add instead of intersect,
which yields a nearly opaque mask: the photograph appears unblended rather than
disappearing.

**The tilt** is a few degrees of `rotateX`/`rotateY` plus a little vertical
drift, driven from `--p` — the figure's progress up the viewport, `-1` low,
`0` centred, `1` high, written by `motion.js`. The two photographs lean
opposite ways so they do not move in step.

`--p` is set on the `figure` and inherited by the `img` inside it, so the
element being measured is never the element being transformed.
`getBoundingClientRect` reports the *projected* box of a rotated element, so
measuring the thing we transform would feed each frame's rotation into the
next.

This also gives the page back the scroll-driven motion it lost when the wheel
came out, but attached to the photography rather than to an ornament.

Under `prefers-reduced-motion` the transform is dropped and the scroll listener
is never attached.

### Their logo

`assets/img/logo.png` is the business's own logo, supplied by the client. It
sits top left in the nav and replaced a tyre mark and type wordmark that were
standing in until the real artwork arrived. The untouched original is kept at
`assets/img/src/logo-original.png`.

Two things were done to it, neither of them a redraw:

- **Trimmed.** The supplied file is 2170x725, but the artwork only occupies
  2133x363 of that — half the canvas is empty. Left untrimmed, the padding
  becomes part of the layout and the logo has to be shrunk to fit a nav bar.
- **Exported at 2x.** 517x88 for a 44px display height, downscaled from the
  original so nothing is invented. 58 KB.

**44px is a floor, not a preference.** The "OPEN 7 DAYS / 9892 3587" badge is
just over half the logo's height, which puts each of its two lines at about
11px at this size. Take the logo much smaller and that text stops being
readable and starts being texture.

Worth raising with the owner: the badge repeats the phone number that already
sits in the nav button beside it, and "OPEN 7 DAYS" repeats the hero eyebrow.
That is fine on a shopfront sign, where the logo is alone. In a nav bar it is
the same information three times within about 700px. A version of the logo
without the badge would sit better on the web, and is worth asking for.

### Brand logos

The five brands are shown in the manufacturers' own marks, in
`assets/img/brands/`. They were set in type before, on the reasoning that a
speculative pitch has no licence to redistribute trademarks; the client asked
for the real logos and confirmed that was fine. Naming the brands a shop
stocks, in their own marks, is ordinary nominative use.

Where each file came from, because this should not have to be re-derived:

| Brand | Source | Licence |
|---|---|---|
| Bridgestone | Wikimedia Commons, `Bridgestone logo.svg` | Public domain |
| Pirelli | Wikimedia Commons, `Pirelli - logo black (Italy, 1970).svg` | Public domain |
| Goodyear | `goodyear.com`, their own site asset | Trademark, used nominatively |
| Falken | Wikimedia Commons, `Falken Tire logo.svg` | Public domain |
| Maxxis | Wikimedia Commons, `MAXXIS logo.svg` | Public domain |

The Commons files are public domain as simple text logos — not copyrightable,
though still trademarks. Goodyear's current winged-foot mark is not on Commons
at all, because it is excluded as non-free; the Wikipedia copy is fair-use
only, which is not a basis for a commercial page, so it came from Goodyear's
own site instead.

**They are rendered white, which is a legibility decision rather than a
stylistic one.** The section is near-black and two of the five are unreadable
on it in full colour: Bridgestone's wordmark is `#231815` and Falken's is
`#00458d`. A row where three brands sing and two disappear is worse than a row
that is consistent. `brightness(0)` flattens each mark to black whatever colour
it started as, and `invert(1)` turns it white, which holds regardless of what
any individual file contains.

Two things that bit while building this row, both worth knowing before
swapping a logo in:

- **Pirelli first came in as a solid block.** The obvious Commons file,
  `Pirelli - logo full`, is the logo sitting on a filled background plate, and
  the white filter turns that plate into a white rectangle. The plain wordmark
  file has no background and behaves.
- **Falken collapsed to 0x0 and vanished.** Its file carries a `viewBox` but no
  `width` or `height`, so it has no intrinsic size for `max-width`/`max-height`
  to constrain. The row therefore gives each `li` a fixed box and fits the
  image inside it with `object-fit`, which does not depend on what any file
  declares. Sizing logos by max-width alone will keep hitting this.

If the client engages, ask for official brand kits — the manufacturers all
publish them, and a kit resolves both the sourcing and the permission question
properly.

## The photography problem

**The supplied shopfront is 474x328** — a thumbnail. Run full-bleed across a
desktop header it would be upscaled three times over and look worse than no
photo at all.

So it is framed instead: sat in an orange-bordered card at about 620px, where
it is barely enlarged and stays sharp. The hero's presence comes from the
wordmark, the headline and the black ground rather than from a stretched image.

Both files were interpolated up and graded (saturation, contrast, a slight
gamma pull) from the originals in `assets/img/src/`.

**This is the single biggest upgrade available to this build.** A dozen decent
photographs — the shopfront in good light, the alignment rack, a wheel coming
off, the team — would lift it more than any further code. Worth quoting as a
line item.

## Accessibility and verification

Checked across the page at 1100px and 375px:

- no failed requests, no console errors
- no duplicate ids, no dead in-page anchors
- every link has an accessible name; every image has alt text
- 33/33 reveals fire; no horizontal overflow at either width
- smallest visible tap target 46px, above the 44px minimum
- 436 KB total page weight
- `prefers-reduced-motion` holds the headline still and stops every reveal

## Before this goes to the client

1. Confirm the brands and the service list with the owner.
2. Confirm the real opening hours.
3. Get better photography, or licence what exists.
4. Ask whether the ABN, years trading, or fitting/alignment prices can be
   published — all three are strong trust content and none could be verified.
5. **Confirm "30 Min Tyre Change" in the hero stats before this goes live.**
   Unlike the days-a-week and doors-open figures, which come off the shop's
   own signage, this is an operational performance claim with no source at
   all — nobody timed a change. It reads as a promise, and a customer who
   times theirs against it and comes in over will notice. Either get a real
   number from the owner or soften the word "min" out of it.
