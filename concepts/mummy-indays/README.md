# Mummy Inday's Catering — cinematic pitch build

An unsolicited redesign proposal for [mummyindays.com](https://mummyindays.com),
built by DigiCode to win the account. **Not affiliated with or endorsed by the
business.**

Open `index.html` in a browser. No build step, no dependencies, no server needed.

```
index.html        the film — hero, story, menu, lechon, packages, family, gallery, reviews, booking
terms.html        terms page, structure only
css/style.css     tokens, scenes, responsive, reduced-motion
js/cinema.js      the camera — measures scroll, writes custom properties
assets/
  img/            27 photographs (Mummy Inday's own — see Photography below)
  import-photos.ps1   re-pulls them from the live site if ever needed
```

## What's in it, and what deliberately isn't

Because this is a pitch rather than a signed engagement, the build separates
what is safe to reproduce from what belongs to someone else.

**Reproduced exactly**, because it has to be accurate to be a useful proposal,
and because facts and prices aren't anyone's creative property:

- the full tray menu and every price
- the five full-service packages and their inclusions
- lechon weights and pricing, the chop-up fee, the Mang Tomas bottle
- tray dimensions, delivery and pick-up terms
- both phone numbers, the email, the pick-up address, the socials
- the two-week booking lead time and fifty-guest minimum

**Written fresh by DigiCode** — none of the existing site's prose appears here:

- every headline, the hero copy, the family/heritage section, all section intros

**Deliberately absent:**

- *The full terms.* `terms.html` maps the section structure; the wording is
  theirs and drops in on approval.

## Reviews

All seven of their published reviews run as a slow banner across the foot of
the page — stars, full text, reviewer name — with **Write a Review** and
**Read More Reviews** beneath it, pointing at their real Google review link
and Google listing.

They are quoted as published, with every reviewer credited, and shown on the
business's own site: the same words in the same place, which is what a
testimonial is. They are not paraphrased or trimmed — editing somebody's
review would misquote a real person.

The marquee holds the run **twice** and travels exactly one track width. At
the instant the animation resets, the second copy is sitting precisely where
the first began, so there is no seam and no jump. Hovering pauses it, because
reading a moving quote is annoying. Under `prefers-reduced-motion` the
animation stops, the duplicate track is hidden from the DOM, and the strip
becomes an ordinary horizontal scroller.

## Photography

**The photographs are Mummy Inday's own, used here so you can show them their
business rather than a grey mockup.** 27 images, downscaled to a 1600px long
edge and re-encoded at q82 — 11.7 MB down to 4.8 MB.

They are shown back to the owner in a private proposal. That is a normal thing
to do in a pitch, and quite different from publishing: **this build must not go
live, be hosted publicly, or be indexed** until Mummy Inday's engages DigiCode.
`noindex, nofollow` is set on both pages and `clients/` is gitignored, so it
cannot reach the live site by accident.

Every slot still degrades gracefully — delete `assets/img/` and each one falls
back to a drawn stand-in carrying the dish name, so the layout never breaks.

Dish labels were verified against a contact sheet rather than guessed from
filenames, so nothing is mislabelled in front of the client.

### The hero grade

The four header stills are graded rather than used raw — saturation 1.20,
contrast 1.14 about a 0.5 pivot, a warm bias (R x1.03, B x0.965) and gamma
0.95, re-encoded at q88 from freshly pulled originals rather than from the
already-compressed working copies. Ungraded originals are kept in
`assets/img/src/` so the look can be redialled without re-downloading.

One caveat: the spring-roll platter is only 608x610 at source — their smallest
file. It holds up in the crossfade but is the softest of the four, and is
worth reshooting.

## How the motion works

One rule: **JavaScript measures, CSS draws.** `cinema.js` never writes a
transform string. It writes normalised numbers onto custom properties and the
stylesheet decides what they mean.

| Property | Written on | Drives |
|---|---|---|
| `--scroll` | `:root` | hero parallax — slideshow, scrim, glow, leaf and steam at five depths |
| `--enter` | `.story-panel` | the story plate turning to face the reader |
| `--z` | each `.dish-card` | menu cards flying in from ~520px of depth, in waves |
| `--off` | each `.rail-card` | gallery coverflow, rotation by distance from centre |
| `--p` | each `[data-parallax]` | the lechon backdrop, both interludes, and the two family plates |
| `--mx` / `--my` | each `.pkg` | pointer tilt on the package cards |

All reads happen together and all writes happen together, once per frame behind
a single rAF, so the browser is never forced into a mid-frame layout.

The lechon act is one photograph used as the set rather than an object on it.
It is `mix-blend-mode: screen` over the near-black ground, so the dark half of
the image dissolves into the page and only the crackling glows out — and a
radial mask feathers all four sides to nothing, which is what stops it reading
as a rectangle pasted on. A right-hand scrim holds the pricing legible over
the bright part of the shot.

## Meet the Family

Sits above the gallery, mirroring the section on the live site. Their team
photograph leads it — the one from their own Meet the Family block.

That shot is 909x759 with **a person standing on each edge**, so it is cropped
to 4/3, which trims height only and never the sides. It stands alone — nothing
is laid over it — and drifts against the scroll on `--p`.

It is graded more gently than the hero set: saturation 1.16, contrast 1.12,
and a much lighter warm bias (R x1.012, B x0.99) because skin goes orange
long before wood and brass do. Blacks deepen, the floral wall separates, and
faces read more clearly with no colour cast. Original in `assets/img/src/`.

The copy is DigiCode's own, same as everywhere else on the page — same facts
(Negros Oriental, the Visayan Islands, family recipes, cooking for Sydney),
same warmth, none of their sentences. Their wording drops into this layout
on approval.

Adding a seventh nav link pushed the bar to two lines at ~1100px. There's now
a mid-range media query that pulls the tracking in between 900px and 1200px,
and `white-space: nowrap` so a label can never break mid-word.

## Accessibility

`prefers-reduced-motion` isn't a token gesture here — the entire concept is
movement, so the stylesheet collapses every scroll-driven transform to its
resting state and `cinema.js` unbinds the scroll listener entirely. The page
stays fully readable with no motion at all, and it responds if the setting is
changed mid-visit.

Tilt is bound only on `(hover: hover) and (pointer: fine)` — a touch device
gets the resting state rather than a hover it can't leave.

## Type & palette

- **Cormorant Garamond** — delicate high-contrast serif, display only
- **Jost** — geometric sans, body and UI

The live site is cool blue-grey (`#eef4f7`), which fights the food. This goes
the other way: near-black warm charcoal, lechon gold, annatto ember, banana
leaf. Dark rooms make food photography glow.

## Notes for the pitch conversation

Worth raising with them:

- The live site is WordPress.com. Contact is phone and email only — there's no
  enquiry form, no date-availability check, and no deposit collection, so every
  booking is manual. That's the obvious commercial upgrade.
- Two different phone numbers are published for different purposes; worth
  confirming which should be primary.
- "Green Been Salad" is a typo on the live menu; corrected to Green Bean here.
- Their menu photography is strong but inconsistently cropped — a single shoot
  would lift this design considerably.
