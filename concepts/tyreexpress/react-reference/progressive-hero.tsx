/* ---------------------------------------------------------------------------
 * REFERENCE ONLY — this file is not built, imported or served.
 *
 * The live Tyre Express hero is plain HTML/CSS/JS: see ../index.html,
 * ../css/style.css (.line--cycle / .cyc) and ../js/motion.js
 * (wireRollingHeadline). That is the version to edit.
 *
 * This is the supplied React/framer-motion component adjusted to Tyre Express,
 * kept so the effect can be carried straight into a React codebase later
 * without re-deriving it. Setup instructions are at the bottom.
 * ------------------------------------------------------------------------- */

"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/** The six trades. Order matters: tyres first, because that is what they are
 *  searched for, and the rest of the list is the actual pitch. */
const TRADES = [
  "tyres",
  "alignment",
  "brakes",
  "suspension",
  "log books",
  "rego checks",
] as const;

const ROTATE_MS = 2000;

export interface ProgressiveHeroProps
  extends React.HTMLAttributes<HTMLElement> {
  /** Words to cycle through. Defaults to the six trades above. */
  trades?: readonly string[];
  /** Milliseconds each word holds before the next rolls up. */
  intervalMs?: number;
  phone?: string;
  phoneHref?: string;
}

export function ProgressiveHero({
  trades = TRADES,
  intervalMs = ROTATE_MS,
  phone = "(02) 9892 3587",
  phoneHref = "tel:+61298923587",
  className,
  ...props
}: ProgressiveHeroProps) {
  const [index, setIndex] = React.useState(0);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (reduced || trades.length < 2) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      timer = setInterval(
        () => setIndex((i) => (i + 1) % trades.length),
        intervalMs,
      );
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    // A rolling word in a background tab is wasted work, and it drifts out of
    // step with its own transitions.
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    start();

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [trades.length, intervalMs, reduced]);

  return (
    <section
      className={cn("relative overflow-hidden bg-[#0C0D0F] text-white", className)}
      {...props}
    >
      <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-6 py-24 md:grid-cols-2 md:gap-16">
        <div>
          <p className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#F26B21]">
            <span aria-hidden className="h-2 w-2 rounded-full bg-[#F26B21]" />
            South Granville &middot; Open 7 Days
          </p>

          <h1 className="font-[family-name:var(--font-barlow-condensed)] text-6xl font-extrabold uppercase leading-[0.95] md:text-8xl">
            {/* The rolling slot repeats what this sentence already says, so a
                screen reader gets the sentence once and skips the carousel. */}
            <span className="sr-only">
              We do {trades.slice(0, -1).join(", ")} and {trades.at(-1)} &mdash;
              seven days a week.
            </span>

            <span aria-hidden>
              <span className="block">We do</span>

              {/* pb/-mb: a bare 1em box cuts the tails off y, g and p. The
                  padding gives descenders room, the negative margin takes the
                  space back so the three lines stay evenly set. */}
              <span className="relative block h-[1em] overflow-hidden pb-[0.14em] -mb-[0.14em] [box-sizing:content-box]">
                <AnimatePresence initial={false}>
                  <motion.span
                    key={trades[index]}
                    className="absolute inset-x-0 top-0 block text-[#F26B21]"
                    initial={{ y: "140%", opacity: 0 }}
                    animate={{ y: "0%", opacity: 1 }}
                    exit={{ y: "-140%", opacity: 0 }}
                    transition={
                      reduced
                        ? { duration: 0 }
                        : { type: "spring", stiffness: 220, damping: 26, mass: 0.9 }
                    }
                  >
                    {trades[index]}
                  </motion.span>
                </AnimatePresence>
              </span>

              <span className="block">seven days a week.</span>
            </span>
          </h1>

          <p className="mt-6 max-w-[46ch] text-lg text-white/70">
            Tyres on, wheels straight, same day &mdash; plus the mechanical work
            most tyre shops send somewhere else. All of it on the corner of
            Wellington Road and Clyde Street.
          </p>

          <div className="mt-8 flex flex-wrap gap-4">
            <Button asChild size="lg" className="bg-[#F26B21] hover:bg-[#d95c17]">
              <a href={phoneHref}>Call {phone}</a>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href="#sizes">Find your tyre size</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ProgressiveHero;

/* ---------------------------------------------------------------------------
 * Setup, if this is ever moved into a React project
 *
 * The concept build has no package.json, no tsconfig, no Tailwind and no Node
 * on this machine, so none of the below has been run here.
 *
 *   npx create-next-app@latest tyreexpress --typescript --tailwind --app
 *   cd tyreexpress
 *   npx shadcn@latest init
 *   npx shadcn@latest add button
 *   npm i framer-motion
 *
 * shadcn's init writes components.json, the cn() helper in @/lib/utils, and
 * the Tailwind theme tokens. Then drop this file at components/progressive-hero
 * .tsx and render <ProgressiveHero /> from app/page.tsx.
 *
 * Load Barlow Condensed through next/font and expose it as
 * --font-barlow-condensed for the font-[family-name:...] class above.
 *
 * Two things worth carrying over, both found by measuring the vanilla build:
 *
 *  - The descender fix (pb-[0.14em] / -mb-[0.14em] / content-box) is not
 *    cosmetic. Tailwind's preflight sets border-box globally, under which the
 *    padding is taken out of the 1em and clips harder rather than less.
 *
 *  - AnimatePresence needs initial={false} or every word animates in on first
 *    paint, including the one that should already be sitting there.
 * ------------------------------------------------------------------------- */
