# Tyre Express — concept build

A speculative site for **Tyre Express**, 60 Wellington Rd (cnr Clyde St),
South Granville NSW 2142. Built by DigiCode as a sales pitch. **Not
affiliated with or endorsed by the business.**

Open `index.html`. No build step, no dependencies.

```
index.html        the page
css/style.css     tokens, sections, the CSS wheel, responsive, reduced-motion
js/motion.js      reveals, the wheel's intro and scroll rotation, nav
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

### The wheel

The one piece of motion the page leans on. It is **drawn in CSS**, not an
image: tread from a repeating conic gradient, a metallic rim, five spokes cut
with a mask, and an orange hub. That means it is sharp at any size, costs no
bandwidth, and can be driven by the scroll.

It spins up on load and then turns as the page moves — the only site where a
rotating element is literally what the business sells.

Both the intro and the scroll rotation are driven from `motion.js` through
custom properties. That is deliberate: they were briefly a CSS keyframe plus a
scroll transform, which cannot work — an animation with `fill-mode: both`
holds its final transform forever, so the wheel would have spun up once and
then sat dead for the rest of the page.

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
wordmark, the wheel and the black ground rather than from a stretched image.

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
- `prefers-reduced-motion` stops the wheel, the intro and every reveal

## Before this goes to the client

1. Confirm the brands and the service list with the owner.
2. Confirm the real opening hours.
3. Get better photography, or licence what exists.
4. Ask whether the ABN, years trading, or fitting/alignment prices can be
   published — all three are strong trust content and none could be verified.
