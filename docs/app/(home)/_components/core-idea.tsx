/**
 * "One tree, many targets" — the core seam explained: UINode + Mutation + Style
 * IR. A compact pipeline diagram plus prose. Static; no client code.
 */
import { SectionHead } from "./shared";

const PIPELINE: { label: string; sub: string }[] = [
  { label: "Plugin", sub: "React / Solid" },
  { label: "Reconciler", sub: "→ UINode tree" },
  { label: "Mutations", sub: "over RPC" },
  { label: "Host renderer", sub: "DOM · TUI · AppKit" },
];

export function CoreIdea() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
      <SectionHead eyebrow="How it works" title="One tree, many targets">
        A plugin never touches a DOM. It emits a serializable{" "}
        <code className="rounded bg-fd-muted px-1.5 py-0.5 font-mono text-sm">
          UINode
        </code>{" "}
        tree and a stream of mutations. Each host is simply a renderer for that
        tree — in its own native primitives.
      </SectionHead>

      <div className="mt-12 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center">
        {PIPELINE.map((step, i) => (
          <div key={step.label} className="flex items-center gap-3">
            <div className="flex-1 rounded-xl border border-fd-border bg-fd-card px-4 py-3 text-center shadow-sm sm:flex-none">
              <div className="text-sm font-semibold text-fd-foreground">
                {step.label}
              </div>
              <div className="mt-0.5 text-xs text-fd-muted-foreground">
                {step.sub}
              </div>
            </div>
            {i < PIPELINE.length - 1 && (
              <span aria-hidden className="hidden text-fd-primary sm:inline">
                →
              </span>
            )}
          </div>
        ))}
      </div>

      <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-fd-muted-foreground">
        The primitive set is bounded and converges; an app's UI is unbounded and
        grows forever. That asymmetry is the whole bet — a new plugin framework
        is a new renderer package and{" "}
        <strong className="font-semibold text-fd-foreground">
          zero protocol change
        </strong>
        .
      </p>
    </section>
  );
}
