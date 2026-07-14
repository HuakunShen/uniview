import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRoot } from "solid-js";
import { StyleTable, SvgCellSurface } from "@uniview/tui-core";
import { createTuiSolidRoot } from "@uniview/tui-solid";
import { App, createAppState } from "../src/app";

/**
 * Render the demo to an SVG the docs can embed. `SvgCellSurface` swaps in for the
 * ANSI surface with no change to the app, so the docs show the real thing.
 *
 *   pnpm --filter @uniview/tui-lazygit-solid snapshot
 */
const OUT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../docs/public/tui/lazygit-solid.svg",
);

const styles = new StyleTable();
const surface = new SvgCellSurface({ styles });
const root = createTuiSolidRoot({ surface, styles, size: { width: 100, height: 30 } });

createRoot(() => {
  const state = createAppState();
  state.setBranch(2); // a selected row reads better than a pristine one
  root.render(() => <App state={state} />);

  setTimeout(() => {
    const svg = surface.toSVG();
    if (!svg) throw new Error("no frame was presented");
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, svg);
    console.log(`wrote ${OUT} (${svg.length} bytes)`);
    process.exit(0);
  }, 200);
});
