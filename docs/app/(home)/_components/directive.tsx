/**
 * The Prime Directive as a selling point: framework-, app-, and brand-agnostic.
 * Three tenets, each a short claim about what the renderer refuses to know.
 */

import type { LucideIcon } from "lucide-react";
import { Blocks, Layers, Palette } from "lucide-react";
import { DocLink } from "./shared";

const TENETS: {
  icon: LucideIcon;
  title: string;
  desc: string;
}[] = [
  {
    icon: Blocks,
    title: "Framework-agnostic",
    desc: "The protocol and every host speak UINode + Mutation + Style IR. They don't know React or Solid or Svelte exists. A new plugin framework is a new package — nothing else changes.",
  },
  {
    icon: Layers,
    title: "App-agnostic",
    desc: "The renderer has no idea what a sidebar or a command palette is. Those are components, written in TypeScript in the plugin — never primitives baked into the core.",
  },
  {
    icon: Palette,
    title: "Brand-agnostic",
    desc: "No color, gradient, radius, or shadow the renderer invented. It draws the Style IR the plugin sends. Semantic tokens resolve to the system's colors — the user's, never ours.",
  },
];

export function Directive() {
  return (
    <section className="border-t border-fd-border bg-fd-muted/30">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <span className="text-sm font-semibold uppercase tracking-wide text-fd-primary">
            The Prime Directive
          </span>
          <h2 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">
            A renderer with no opinions of its own
          </h2>
          <p className="mt-3 text-fd-muted-foreground">
            The renderer is reimplemented on every platform, so it stays small
            and stays neutral. It renders what the tree says — nothing it
            decided on its own.
          </p>
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {TENETS.map((t) => {
            const Icon = t.icon;
            return (
              <div
                key={t.title}
                className="rounded-2xl border border-fd-border bg-fd-card p-6"
              >
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/15 to-sky-500/15 text-fd-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold text-fd-foreground">
                  {t.title}
                </h3>
                <p className="mt-2 text-sm text-fd-muted-foreground">
                  {t.desc}
                </p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 text-center">
          <DocLink
            path="architecture"
            className="text-sm font-medium text-fd-foreground underline underline-offset-4 hover:text-fd-primary"
          >
            Read the architecture →
          </DocLink>
        </div>
      </div>
    </section>
  );
}
