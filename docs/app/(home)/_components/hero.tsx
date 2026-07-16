/**
 * Landing hero: badge, headline, lede, primary CTAs, render-target status chips,
 * and the static "one tree, three surfaces" mockup triptych. Everything is a
 * server component — the mockup is pure CSS/SVG, no runtime, so it survives the
 * Next.js static export untouched.
 */
import { ArrowRight, BookOpen, Github } from "lucide-react";
import { MockupTriptych } from "./mockup";
import { btnPrimary, btnSecondary, DocLink, GITHUB_URL } from "./shared";

const TARGETS: { label: string; dot: string }[] = [
  { label: "DOM hosts (Svelte · Vue · React)", dot: "bg-emerald-500" },
  { label: "Terminal (TUI)", dot: "bg-emerald-500" },
  { label: "Native macOS (AppKit) · new", dot: "bg-amber-500" },
  { label: "Windows · HarmonyOS · planned", dot: "bg-fd-muted-foreground/40" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-12%] h-[440px] w-[760px] -translate-x-1/2 rounded-full bg-violet-500/20 blur-[130px]" />
        <div className="absolute left-[12%] top-[8%] h-[320px] w-[320px] rounded-full bg-sky-500/15 blur-[110px]" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(127,127,140,0.14) 1px, transparent 0)",
            backgroundSize: "32px 32px",
            maskImage:
              "radial-gradient(ellipse 55% 45% at 50% 0%, #000 30%, transparent 78%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 55% 45% at 50% 0%, #000 30%, transparent 78%)",
          }}
        />
      </div>

      <div className="mx-auto max-w-5xl px-4 pb-4 pt-16 text-center sm:pt-24">
        <span className="inline-flex items-center gap-2 rounded-full border border-fd-border bg-fd-card/60 px-3 py-1 text-xs font-medium text-fd-muted-foreground backdrop-blur">
          <span className="size-1.5 rounded-full bg-violet-500" />
          Open-source · protocol-first · framework-agnostic
        </span>

        <h1 className="mx-auto mt-6 max-w-3xl text-balance text-4xl font-bold tracking-tight sm:text-6xl">
          Write once. Render{" "}
          <span className="bg-gradient-to-r from-violet-500 via-indigo-500 to-sky-500 bg-clip-text text-transparent">
            anywhere
          </span>
          .
        </h1>

        <p className="mx-auto mt-5 max-w-2xl text-pretty text-lg text-fd-muted-foreground">
          Uniview is a universal renderer. Author plugins in{" "}
          <strong className="font-semibold text-fd-foreground">
            React or Solid
          </strong>{" "}
          and render them to real{" "}
          <strong className="font-semibold text-fd-foreground">
            Svelte / Vue / React DOM
          </strong>
          , a{" "}
          <strong className="font-semibold text-fd-foreground">terminal</strong>
          , or a{" "}
          <strong className="font-semibold text-fd-foreground">
            native macOS window
          </strong>{" "}
          — across an RPC boundary.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <DocLink path="getting-started" className={btnPrimary}>
            Get started <ArrowRight className="size-4" />
          </DocLink>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className={btnSecondary}
          >
            <Github className="size-4" /> GitHub
          </a>
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-xs text-fd-muted-foreground">
          <DocLink
            path="architecture"
            className="inline-flex items-center gap-1.5 hover:text-fd-foreground"
          >
            <BookOpen className="size-3.5" /> Architecture
          </DocLink>
          <span className="text-fd-border">·</span>
          <DocLink
            path="tui"
            className="inline-flex items-center gap-1.5 hover:text-fd-foreground"
          >
            Terminal UI
          </DocLink>
          <span className="text-fd-border">·</span>
          <DocLink
            path="guides/native-macos"
            className="inline-flex items-center gap-1.5 hover:text-fd-foreground"
          >
            Native macOS
          </DocLink>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-fd-muted-foreground">
          {TARGETS.map((t) => (
            <span
              key={t.label}
              className="inline-flex items-center gap-1.5 rounded-full border border-fd-border bg-fd-card/60 px-3 py-1 backdrop-blur"
            >
              <span className={`size-1.5 rounded-full ${t.dot}`} />
              {t.label}
            </span>
          ))}
        </div>

        <MockupTriptych />
      </div>
    </section>
  );
}
