import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { StyleTable, SvgCellSurface } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, createState, tick, type AppHost } from "../src/app";

/**
 * Render the charts dashboard to an SVG the docs can embed. `SvgCellSurface` is a
 * drop-in for the ANSI surface, so the docs show the real component tree.
 *
 *   pnpm --filter @uniview/tui-charts-demo snapshot
 */
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../docs/public/tui/charts-react.svg",
);

const styles = new StyleTable();
const surface = new SvgCellSurface({ styles });
// 120 columns: at 100 the right-hand histogram panel is clipped mid-title.
const root = createTuiReactRoot({ surface, styles, size: { width: 120, height: 30 } });

const state = createState();
const host: AppHost = {
  rerender: () => root.render(createElement(App, { state, host })),
  quit: () => {},
};

// Advance the simulated load test far enough to fill the charts, but stop short
// of the end so the progress gauge is caught mid-run rather than at 100%.
for (let i = 0; i < 28; i += 1) tick(state);

host.rerender();

setTimeout(() => {
  const svg = surface.toSVG();
  if (!svg) throw new Error("no frame was presented");
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, svg);
  console.log(`wrote ${OUT} (${svg.length} bytes)`);
  process.exit(0);
}, 300);
