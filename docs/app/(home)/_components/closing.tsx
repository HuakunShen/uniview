/**
 * Closing sections: the final CTA card and the site footer with docs/community
 * link columns.
 */
import { ArrowRight } from "lucide-react";
import {
  btnPrimary,
  btnSecondary,
  DocLink,
  GITHUB_URL,
  GithubMark,
} from "./shared";

export function FinalCTA() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <div className="relative overflow-hidden rounded-3xl border border-fd-border bg-fd-card px-6 py-14 text-center">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-0 h-64 w-[600px] -translate-x-1/2 rounded-full bg-violet-500/15 blur-[100px]" />
        </div>
        <div className="relative">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Build your first plugin
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-fd-muted-foreground">
            Start with the quickstart, or read the architecture that makes one
            tree render across DOM, terminal, and native hosts.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <DocLink path="getting-started" className={btnPrimary}>
              Get started <ArrowRight className="size-4" />
            </DocLink>
            <DocLink path="architecture" className={btnSecondary}>
              Architecture
            </DocLink>
          </div>
        </div>
      </div>
    </section>
  );
}

const DOCS_LINKS: { label: string; path: string }[] = [
  { label: "Getting Started", path: "getting-started" },
  { label: "Architecture", path: "architecture" },
  { label: "Terminal UI", path: "tui" },
  { label: "Native macOS", path: "guides/native-macos" },
];

const PACKAGE_LINKS: { label: string; path: string }[] = [
  { label: "@uniview/protocol", path: "packages/protocol" },
  { label: "@uniview/host-sdk", path: "packages/host-sdk" },
  { label: "@uniview/react-renderer", path: "packages/react-renderer" },
  { label: "Runtime modes", path: "guides/runtime-modes" },
];

export function Footer() {
  return (
    <footer className="border-t border-fd-border">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 md:grid-cols-4">
        <div className="sm:col-span-2 md:col-span-1">
          <div className="font-semibold text-fd-foreground">Uniview</div>
          <p className="mt-2 max-w-xs text-sm text-fd-muted-foreground">
            A universal, protocol-first renderer. Write once, render anywhere.
          </p>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-fd-foreground">
            Documentation
          </h4>
          <ul className="mt-3 space-y-2 text-sm text-fd-muted-foreground">
            {DOCS_LINKS.map((l) => (
              <li key={l.path}>
                <DocLink path={l.path} className="hover:text-fd-foreground">
                  {l.label}
                </DocLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-fd-foreground">Packages</h4>
          <ul className="mt-3 space-y-2 text-sm text-fd-muted-foreground">
            {PACKAGE_LINKS.map((l) => (
              <li key={l.path}>
                <DocLink path={l.path} className="hover:text-fd-foreground">
                  {l.label}
                </DocLink>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="text-sm font-semibold text-fd-foreground">
            Community
          </h4>
          <ul className="mt-3 space-y-2 text-sm text-fd-muted-foreground">
            <li>
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 hover:text-fd-foreground"
              >
                <GithubMark className="size-3.5" /> GitHub
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-fd-border py-6 text-center text-xs text-fd-muted-foreground">
        © Uniview
      </div>
    </footer>
  );
}
