/**
 * Landing showcase: a gallery of real terminal-UI frames.
 *
 * Every image here is an actual frame of the real component tree — each example
 * has a `snapshot` script that swaps `AnsiCellSurface` for `SvgCellSurface` and
 * writes `toSVG()` into `docs/public/tui/`. So these are not mockups; they are
 * the renderer's own output, and they stay crisp at any zoom because they are
 * SVG (and text underneath). Static server component — no runtime, no client
 * island — so it survives the Next.js static export untouched.
 *
 * The `@/public/...` SVG imports resolve through the `/uniview` basePath via
 * `next/image` automatically, the same way the Examples MDX page embeds them.
 */
import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import csv from "@/public/tui/csv-react.svg";
import charts from "@/public/tui/charts-react.svg";
import htop from "@/public/tui/htop-react.svg";
import image from "@/public/tui/image-react.svg";
import openapi from "@/public/tui/openapi-react.svg";
import scope from "@/public/tui/scope-react.svg";
import game2048 from "@/public/tui/2048-solid.svg";
import { SectionHead } from "./shared";

interface Shot {
  img: StaticImageData;
  title: string;
  blurb: string;
  alt: string;
  anchor: string;
}

/** The examples-page anchor a card links to (see `content/docs/tui/examples.mdx`). */
const EXAMPLES = "/docs/tui/examples";

const FEATURED: Shot = {
  img: htop,
  title: "htop — system monitor",
  blurb:
    "A live CPU/MEM history plot, a memory meter, a per-core bar chart, and a process table you can sort by any column — real os / ps data, sampled on an interval.",
  alt: "A terminal system monitor: a CPU/MEM history line chart and memory meter across the top, a per-core CPU bar chart, and a process table sorted by CPU%",
  anchor: "#htop--a-live-system-monitor",
};

const GRID: Shot[] = [
  {
    img: charts,
    title: "charts — load-test dashboard",
    blurb: "Gauge, bar chart, histogram and live stats.",
    alt: "A load-test dashboard with a progress gauge, request stats, a status-code bar chart and a response-time histogram",
    anchor: "#charts--an-oha-style-dashboard",
  },
  {
    img: scope,
    title: "scope — audio oscilloscope",
    blurb: "A braille Canvas waveform driven by a per-frame loop.",
    alt: "An audio oscilloscope drawing two braille waveforms over time",
    anchor: "#scope--an-audio-oscilloscope",
  },
  {
    img: image,
    title: "image — raster viewer",
    blurb: "Full-color rasters as half-block ▀ cells — two pixels per cell.",
    alt: "A colorful Mandelbrot set rendered in the terminal as half-block cells",
    anchor: "#image--a-raster-viewer",
  },
  {
    img: csv,
    title: "csv — less for CSV",
    blurb: "A virtualized, sortable table with regex find and filter.",
    alt: "A CSV pager showing a sortable table of world cities with a scrollbar",
    anchor: "#csv--less-for-csv",
  },
  {
    img: openapi,
    title: "openapi — API explorer",
    blurb: "Multi-pane browse with a collapsible $ref schema tree.",
    alt: "An OpenAPI browser with an operations list and a collapsible JSON-Schema tree",
    anchor: "#openapi--an-api-explorer",
  },
  {
    img: game2048,
    title: "2048 — with a trained AI",
    blurb: "A playable board plus an n-tuple network over expectimax.",
    alt: "The game 2048 in the terminal with a score curve sparkline and an AI panel",
    anchor: "#2048--played-by-a-trained-agent",
  },
];

/** A framed terminal screenshot card that links into the Examples page. */
function ShotCard({ shot, priority }: { shot: Shot; priority?: boolean }) {
  return (
    <Link
      href={`${EXAMPLES}${shot.anchor}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-fd-border bg-fd-card/60 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:border-fd-primary/40 hover:shadow-md"
    >
      <div className="flex items-center gap-1.5 border-b border-fd-border/70 bg-fd-card/80 px-3 py-2">
        <span className="size-2.5 rounded-full bg-[#ff5f57]" />
        <span className="size-2.5 rounded-full bg-[#febc2e]" />
        <span className="size-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-1.5 truncate font-mono text-[11px] text-fd-muted-foreground">
          {shot.title}
        </span>
      </div>
      <div className="overflow-hidden bg-[#1e1e1e] p-2">
        <Image
          src={shot.img}
          alt={shot.alt}
          priority={priority}
          className="h-auto w-full rounded transition-transform duration-300 group-hover:scale-[1.02]"
        />
      </div>
      <div className="flex flex-1 flex-col px-4 py-3">
        <p className="text-sm text-fd-muted-foreground">{shot.blurb}</p>
      </div>
    </Link>
  );
}

export function Showcase() {
  return (
    <section className="relative overflow-hidden py-20">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/3 h-[360px] w-[680px] -translate-x-1/2 rounded-full bg-sky-500/10 blur-[130px]" />
      </div>

      <div className="mx-auto max-w-6xl px-4">
        <SectionHead eyebrow="Real frames, not mockups" title="See what it renders">
          Every screenshot below is an actual frame of the real component tree —
          captured to SVG by swapping a single line (<code>AnsiCellSurface</code> →{" "}
          <code>SvgCellSurface</code>). Each is <strong>pure plugin code</strong>,
          rendered by the terminal host. Click any card to run it.
        </SectionHead>

        {/* Featured htop, front and center. */}
        <div className="mx-auto mt-12 max-w-3xl">
          <ShotCard shot={FEATURED} priority />
        </div>

        {/* The rest, in a responsive grid. */}
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {GRID.map((shot) => (
            <ShotCard key={shot.title} shot={shot} />
          ))}
        </div>

        <div className="mt-10 text-center">
          <Link
            href={EXAMPLES}
            className="inline-flex items-center gap-2 text-sm font-semibold text-fd-primary hover:underline"
          >
            Browse all examples <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>
    </section>
  );
}
