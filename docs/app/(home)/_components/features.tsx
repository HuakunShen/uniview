/**
 * "Batteries-included" grid: the differentiators that don't get their own
 * section. Each card links into the relevant docs.
 */

import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  BarChart3,
  GitBranch,
  Layers,
  MousePointerClick,
  Palette,
  Plug,
} from "lucide-react";
import { DocLink, SectionHead } from "./shared";

const FEATURES: {
  icon: LucideIcon;
  title: string;
  desc: string;
  path: string;
}[] = [
  {
    icon: Plug,
    title: "Type-safe RPC",
    desc: "Built on kkrpc — bidirectional, typed calls over Worker, WebSocket, HTTP, or stdio transports.",
    path: "guides/bridge-server",
  },
  {
    icon: Palette,
    title: "Style IR",
    desc: "Tailwind classes resolve to a serializable style tree each host paints natively — including dark:/hover:/focus: variants.",
    path: "architecture",
  },
  {
    icon: Layers,
    title: "React + Solid renderers",
    desc: "Two authoring frameworks today, each a small renderer package. The protocol never learned either one exists.",
    path: "tui/solid",
  },
  {
    icon: BarChart3,
    title: "Sub-cell charts",
    desc: "The terminal renderer draws charts at sub-cell resolution and can export them to SVG — ride the richtext spans, no new primitive.",
    path: "tui/charts",
  },
  {
    icon: MousePointerClick,
    title: "Handler-registry events",
    desc: "Functions never cross RPC. Callbacks register as handler IDs and dispatch back to the plugin on interaction.",
    path: "guides/custom-components",
  },
  {
    icon: GitBranch,
    title: "Protocol versioning",
    desc: "A single PROTOCOL_VERSION is checked on the initialize handshake, so hosts and plugins fail loud, not silently.",
    path: "packages/protocol",
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <SectionHead eyebrow="And more" title="A protocol-first toolkit">
        The plumbing real plugins need — typed RPC, a portable style model, and
        renderers you can add without touching the core.
      </SectionHead>

      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <DocLink
              key={f.title}
              path={f.path}
              className="group relative rounded-2xl border border-fd-border bg-fd-card p-5 transition-all hover:border-fd-primary/40 hover:shadow-lg"
            >
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/15 to-sky-500/15 text-fd-primary">
                <Icon className="size-5" />
              </div>
              <h3 className="flex items-center gap-1 text-base font-semibold text-fd-foreground">
                {f.title}
                <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover:translate-x-0 group-hover:opacity-100" />
              </h3>
              <p className="mt-1.5 text-sm text-fd-muted-foreground">
                {f.desc}
              </p>
            </DocLink>
          );
        })}
      </div>
    </section>
  );
}
