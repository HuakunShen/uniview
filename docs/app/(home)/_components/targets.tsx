/**
 * Render-targets showcase (the multi-shell analog): one panel per surface —
 * DOM hosts, Terminal (TUI), Native macOS (AppKit) — each with a status tag and
 * a link into the relevant docs.
 */

import type { LucideIcon } from "lucide-react";
import {
  AppWindowMac,
  ArrowRight,
  Monitor,
  SquareTerminal,
} from "lucide-react";
import { DocLink, SectionHead } from "./shared";

const TARGETS: {
  icon: LucideIcon;
  title: string;
  status: string;
  statusClass: string;
  desc: string;
  path: string;
}[] = [
  {
    icon: Monitor,
    title: "DOM hosts",
    status: "Available",
    statusClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    desc: "Svelte 5, Vue, and React adapters render the tree into real DOM. High-frequency interaction — scroll, hover, focus — stays local, never streamed over RPC.",
    path: "packages/host-svelte",
  },
  {
    icon: SquareTerminal,
    title: "Terminal (TUI)",
    status: "Available",
    statusClass: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    desc: "The same plugin renders to a terminal with no DOM at all — layout, styled text, and sub-cell-resolution charts, from React or Solid.",
    path: "tui",
  },
  {
    icon: AppWindowMac,
    title: "Native macOS (AppKit)",
    status: "New · experimental",
    statusClass: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    desc: "A real NSWindow and AppKit views, driven from a React tree — native bezel buttons, vibrancy, scroll views. Windows and HarmonyOS are next.",
    path: "guides/native-macos",
  },
];

export function Targets() {
  return (
    <section className="border-t border-fd-border bg-fd-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <SectionHead
          eyebrow="Render targets"
          title="The same tree, on every surface"
        >
          One authoring model, drawn natively wherever it lands. Adding a
          surface is a renderer package — it never changes the plugin or the
          protocol.
        </SectionHead>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TARGETS.map((t) => {
            const Icon = t.icon;
            return (
              <DocLink
                key={t.title}
                path={t.path}
                className="group relative flex flex-col rounded-2xl border border-fd-border bg-fd-card p-5 transition-all hover:border-fd-primary/40 hover:shadow-lg"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/15 to-sky-500/15 text-fd-primary">
                    <Icon className="size-5" />
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.statusClass}`}
                  >
                    {t.status}
                  </span>
                </div>
                <h3 className="flex items-center gap-1 text-base font-semibold text-fd-foreground">
                  {t.title}
                  <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
                </h3>
                <p className="mt-1.5 text-sm text-fd-muted-foreground">
                  {t.desc}
                </p>
              </DocLink>
            );
          })}
        </div>
      </div>
    </section>
  );
}
