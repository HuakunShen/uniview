/**
 * Docs homepage landing (rendered inside fumadocs `HomeLayout`).
 *
 * Thin composition root — each section lives in its own module under
 * `app/(home)/_components/`:
 *   hero (+ the static mockup triptych) → core idea → render targets →
 *   runtime isolation → the Prime Directive → quickstart → features → CTA →
 *   footer.
 *
 * Everything is theme-aware via `fd-*` tokens and rendered as server
 * components (no client islands), so the static export stays clean. The
 * `.uv-landing` scope on <main> carries `overflow-x-clip` so decorative glows
 * never cause horizontal scroll, and disables animations under
 * `prefers-reduced-motion` (see `app/global.css`).
 */

import { FinalCTA, Footer } from "./_components/closing";
import { CoreIdea } from "./_components/core-idea";
import { Directive } from "./_components/directive";
import { Features } from "./_components/features";
import { Hero } from "./_components/hero";
import { Quickstart } from "./_components/quickstart";
import { Runtime } from "./_components/runtime";
import { Targets } from "./_components/targets";

export default function HomePage() {
  return (
    <main className="uv-landing flex flex-1 flex-col overflow-x-clip">
      <Hero />
      <CoreIdea />
      <Targets />
      <Runtime />
      <Directive />
      <Quickstart />
      <Features />
      <FinalCTA />
      <Footer />
    </main>
  );
}
