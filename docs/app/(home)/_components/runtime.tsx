/**
 * Runtime isolation section (the permissions analog): the three execution modes
 * a plugin can run in, and the sandbox guarantees that come with them.
 */

import type { LucideIcon } from "lucide-react";
import { Boxes, Globe, Wrench } from "lucide-react";
import { DocLink, SectionHead } from "./shared";

const MODES: {
  icon: LucideIcon;
  title: string;
  env: string;
  desc: string;
}[] = [
  {
    icon: Boxes,
    title: "Web Worker",
    env: "Browser · full sandbox",
    desc: "The production path for untrusted plugins. No access to the page — no window, no document.",
  },
  {
    icon: Globe,
    title: "WebSocket bridge",
    env: "Node · Deno · Bun",
    desc: "Plugins connect out to a bridge; a plugin can run in another process, or on another machine entirely.",
  },
  {
    icon: Wrench,
    title: "Main thread",
    env: "Browser · dev only",
    desc: "Zero isolation for fast local debugging. The host code is identical across all three modes.",
  },
];

export function Runtime() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
      <SectionHead eyebrow="Isolation" title="Sandboxed by default">
        Plugins never touch the page they render into. They run behind a process
        or worker boundary and speak to the host only through typed RPC.
      </SectionHead>

      <div className="mt-12 grid gap-4 md:grid-cols-3">
        {MODES.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.title}
              className="rounded-2xl border border-fd-border bg-fd-card p-6"
            >
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/15 to-sky-500/15 text-fd-primary">
                <Icon className="size-5" />
              </div>
              <h3 className="text-base font-semibold text-fd-foreground">
                {m.title}
              </h3>
              <div className="mt-0.5 text-xs font-medium text-fd-primary">
                {m.env}
              </div>
              <p className="mt-2 text-sm text-fd-muted-foreground">{m.desc}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-sm text-fd-muted-foreground">
        Same host code, three transports —{" "}
        <DocLink
          path="guides/runtime-modes"
          className="font-medium text-fd-foreground underline underline-offset-4 hover:text-fd-primary"
        >
          read the runtime-modes guide
        </DocLink>
        .
      </p>
    </section>
  );
}
