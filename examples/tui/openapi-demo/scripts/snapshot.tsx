import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { StyleTable, SvgCellSurface } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, type AppHost } from "../src/app";
import { petstore } from "../src/petstore";

/**
 * Render the OpenAPI explorer to an SVG for the docs. It is fully static (no
 * animation), so a single render captures the real multi-pane tree.
 *
 *   pnpm --filter @uniview/tui-openapi-demo snapshot
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../docs/public/tui/openapi-react.svg");

const styles = new StyleTable();
const surface = new SvgCellSurface({ styles });
const root = createTuiReactRoot({ surface, styles, size: { width: 100, height: 30 } });
const host: AppHost = { quit: () => {} };

root.render(createElement(App, { spec: petstore, cols: 100, rows: 30, host }));

setTimeout(() => {
  const svg = surface.toSVG();
  if (!svg) throw new Error("no frame was presented");
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, svg);
  console.log(`wrote ${OUT} (${svg.length} bytes)`);
  process.exit(0);
}, 300);
