/**
 * The hero centerpiece: one UINode tree rendered three ways.
 *
 * Entirely static CSS/SVG — no runtime, no client island. The point it makes
 * visually is the whole thesis: a single serializable tree (left) fans out to a
 * DOM card, a terminal frame, and a native macOS window (right), each drawn in
 * that surface's own idiom from the *same* source.
 */
import { ArrowRight } from "lucide-react";

/** The shared source tree, shown as compact JSX. */
function SourceTree() {
  return (
    <div className="rounded-xl border border-fd-border bg-fd-background/80 p-4 text-left font-mono text-[11px] leading-relaxed shadow-sm">
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-fd-muted-foreground">
        Plugin · React or Solid
      </div>
      <pre className="overflow-x-auto text-left text-fd-foreground/90">
        <span className="text-violet-500">&lt;Stack&gt;</span>
        {"\n  "}
        <span className="text-sky-500">&lt;Text&gt;</span>Counter
        <span className="text-sky-500">&lt;/Text&gt;</span>
        {"\n  "}
        <span className="text-sky-500">&lt;Text&gt;</span>
        {"{count}"}
        <span className="text-sky-500">&lt;/Text&gt;</span>
        {"\n  "}
        <span className="text-emerald-500">&lt;Button</span> onClick=
        {"{inc}"}
        <span className="text-emerald-500">&gt;</span>+1
        <span className="text-emerald-500">&lt;/Button&gt;</span>
        {"\n"}
        <span className="text-violet-500">&lt;/Stack&gt;</span>
      </pre>
    </div>
  );
}

/** DOM host (Svelte/Vue/React) — a web card. */
function DomFrame() {
  return (
    <FrameShell label="DOM host">
      <div className="flex h-full flex-col justify-center gap-2 rounded-lg bg-white p-4 dark:bg-zinc-900">
        <div className="text-xs font-semibold text-zinc-500">Counter</div>
        <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          3
        </div>
        <button
          type="button"
          className="mt-1 w-fit rounded-md bg-gradient-to-r from-violet-500 to-sky-500 px-3 py-1.5 text-xs font-semibold text-white shadow"
        >
          +1
        </button>
      </div>
    </FrameShell>
  );
}

/** Terminal (TUI) — monospace, box-drawing. */
function TerminalFrame() {
  return (
    <FrameShell label="Terminal (TUI)">
      <div className="flex h-full flex-col justify-center gap-1 rounded-lg bg-zinc-950 p-3 font-mono text-[11px] leading-tight text-emerald-400">
        <div className="text-zinc-500">┌─ Counter ─────┐</div>
        <div>
          │ <span className="text-zinc-100">3</span>
          {"             "}│
        </div>
        <div>
          │{" "}
          <span className="rounded bg-emerald-500 px-1 text-zinc-950">+1</span>
          {"          "}│
        </div>
        <div className="text-zinc-500">└───────────────┘</div>
      </div>
    </FrameShell>
  );
}

/** Native macOS (AppKit) — a real window chrome + bezel button. */
function AppKitFrame() {
  return (
    <FrameShell label="Native macOS · new">
      <div className="flex h-full flex-col overflow-hidden rounded-lg border border-black/10 bg-gradient-to-b from-zinc-100 to-zinc-200 dark:border-white/10 dark:from-zinc-800 dark:to-zinc-900">
        <div className="flex items-center gap-1.5 border-b border-black/5 px-2 py-1.5 dark:border-white/5">
          <span className="size-2 rounded-full bg-[#ff5f57]" />
          <span className="size-2 rounded-full bg-[#febc2e]" />
          <span className="size-2 rounded-full bg-[#28c840]" />
        </div>
        <div className="flex flex-1 flex-col justify-center gap-1.5 p-3">
          <div className="text-[11px] font-medium text-zinc-500">Counter</div>
          <div className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            3
          </div>
          <button
            type="button"
            className="mt-0.5 w-fit rounded-[5px] border border-black/10 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-800 shadow-sm dark:border-white/10 dark:bg-zinc-700 dark:text-zinc-100"
          >
            +1
          </button>
        </div>
      </div>
    </FrameShell>
  );
}

function FrameShell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-center text-[10px] font-semibold uppercase tracking-wide text-fd-muted-foreground">
        {label}
      </div>
      <div className="h-36 rounded-xl border border-fd-border bg-fd-card/40 p-1.5 shadow-sm">
        {children}
      </div>
    </div>
  );
}

export function MockupTriptych() {
  return (
    <div className="relative mx-auto mt-14 max-w-5xl">
      <div
        aria-hidden
        className="absolute -inset-x-6 -inset-y-4 -z-10 rounded-[2rem] bg-gradient-to-b from-violet-500/15 to-sky-500/5 opacity-70 blur-2xl"
      />
      <div className="rounded-2xl border border-fd-border bg-fd-card/60 p-4 shadow-2xl backdrop-blur sm:p-6">
        <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,2fr)]">
          <SourceTree />

          <div className="hidden shrink-0 lg:flex lg:flex-col lg:items-center lg:gap-1">
            <ArrowRight className="size-6 text-fd-primary" />
            <span className="text-[10px] font-medium text-fd-muted-foreground">
              one tree
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <DomFrame />
            <TerminalFrame />
            <AppKitFrame />
          </div>
        </div>
      </div>
    </div>
  );
}
