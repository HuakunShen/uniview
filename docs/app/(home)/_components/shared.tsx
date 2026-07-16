/**
 * Shared building blocks for the docs landing sections.
 *
 * Everything here is used by two or more section modules under
 * `app/(home)/_components/`: the button class strings, the `DocLink` wrapper
 * around `next/link` (so the `/uniview` basePath is applied automatically), the
 * centered `SectionHead` block, and the GitHub brand mark (an inline SVG so it
 * follows `currentColor` and the theme).
 *
 * NOTE: this is the docs *marketing* site, not a renderer. The Prime Directive's
 * brand-agnostic rule constrains `UniviewAppKit` / `host-*` / the protocol — it
 * does not constrain this page. Gradients and an accent color are fine here.
 */

import Link from "next/link";
import type { ReactNode } from "react";

export const GITHUB_URL = "https://github.com/HuakunShen/uniview";

export const btnPrimary =
  "inline-flex items-center gap-2 rounded-lg bg-fd-primary px-5 py-2.5 text-sm font-semibold text-fd-primary-foreground shadow-sm transition-transform hover:scale-[1.02] active:scale-100";
export const btnSecondary =
  "inline-flex items-center gap-2 rounded-lg border border-fd-border bg-fd-card/60 px-5 py-2.5 text-sm font-semibold text-fd-foreground backdrop-blur transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground";

/** A link into the docs. `path` is relative to `/docs/` (no leading slash). */
export function DocLink({
  path,
  className,
  children,
}: {
  path: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={`/docs/${path}`} className={className}>
      {children}
    </Link>
  );
}

/** Shared eyebrow + heading + lede block, centered. */
export function SectionHead({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-sm font-semibold uppercase tracking-wide text-fd-primary">
        {eyebrow}
      </span>
      <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {children && <p className="mt-3 text-fd-muted-foreground">{children}</p>}
    </div>
  );
}

export function GithubMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      role="img"
      aria-label="GitHub"
    >
      <title>GitHub</title>
      <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58v-2.03c-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.2.08 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5.99.11-.78.42-1.3.76-1.6-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.11-3.18 0 0 1.01-.32 3.3 1.23a11.5 11.5 0 0 1 6.01 0c2.29-1.55 3.3-1.23 3.3-1.23.65 1.66.24 2.88.12 3.18.77.84 1.23 1.91 1.23 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.81 1.1.81 2.22v3.29c0 .32.22.7.83.58A12.01 12.01 0 0 0 24 12.5C24 5.87 18.63.5 12 .5Z" />
    </svg>
  );
}
