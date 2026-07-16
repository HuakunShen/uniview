import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { StyleTable, SvgCellSurface } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, type AppHost } from "../src/app";
import { parseCsv } from "../src/csv";
import { SAMPLE_CSV } from "../src/sample";

/**
 * Render the CSV pager to an SVG for the docs, over the bundled city sample.
 *
 *   pnpm --filter @uniview/tui-csv-demo snapshot
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../docs/public/tui/csv-react.svg");

const styles = new StyleTable();
const surface = new SvgCellSurface({ styles });
const root = createTuiReactRoot({ surface, styles, size: { width: 90, height: 24 } });
const host: AppHost = { quit: () => {} };

root.render(createElement(App, { data: parseCsv(SAMPLE_CSV), name: "cities.csv (sample)", cols: 90, rows: 24, host }));

setTimeout(() => {
  const svg = surface.toSVG();
  if (!svg) throw new Error("no frame was presented");
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, svg);
  console.log(`wrote ${OUT} (${svg.length} bytes)`);
  process.exit(0);
}, 300);
