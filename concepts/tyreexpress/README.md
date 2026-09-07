# Tyre Express — concept build

A speculative site for **Tyre Express**, 60 Wellington Rd (cnr Clyde St),
South Granville NSW 2142. Built by DigiCode as a sales pitch. **Not
affiliated with or endorsed by the business.**

Open `index.html`. No build step, no dependencies.

```
index.html        the page
css/style.css     tokens, sections, the rolling headline, responsive, reduced-motion
js/motion.js      reveals, the rolling headline, nav
assets/img/       shopfront.jpg, workshop.jpg  (+ src/ originals, local only)
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

The trade is worth stating plainly: the page lost its only scroll-driven
motion, and the hero is now typography on black above the shopfront photograph.
That is a cleaner, more confident opening and the headline reads much larger —
but there is no longer anything moving as the visitor scrolls.

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

Drawn as inline SVG rather than used as a picture. It stays sharp at any size,
the callouts are real text a screen reader can read, it recolours with the
brand, and it is DigiCode's own artwork rather than someone else's diagram.

The worked example is correct: for 195/65R15, the sidewall is 65% of 195 mm,
which is about 127 mm.

### Brands as type, not logos

The five brands are set in type. A speculative pitch has no licence to
redistribute manufacturer trademarks, and wordmarks read cleanly at any size.
If the client engages, official logo kits can be requested properly.

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
