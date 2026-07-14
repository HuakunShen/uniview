import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { StyleTable, SvgCellSurface } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, createState, type AppHost } from "../src/app";

/**
 * Render the demo to an SVG the docs can embed. `SvgCellSurface` swaps in for the
 * ANSI surface with no change to the app, so the docs show the real thing.
 *
 *   pnpm --filter @uniview/tui-lazygit-demo snapshot
 */
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/public/tui/lazygit-react.svg",
);

const styles = new StyleTable();
const surface = new SvgCellSurface({ styles });
const root = createTuiReactRoot({ surface, styles, size: { width: 100, height: 30 } });

const state = createState();
state.branch = 2; // a selected row reads better than a pristine one
const host: AppHost = {
  rerender: () => root.render(createElement(App, { state, host })),
  quit: () => {},
};
host.rerender();

setTimeout(() => {
  const svg = surface.toSVG();
  if (!svg) throw new Error("no frame was presented");
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, svg);
  console.log(`wrote ${OUT} (${svg.length} bytes)`);
  process.exit(0);
}, 300);
