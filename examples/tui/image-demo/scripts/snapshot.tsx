import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { StyleTable, SvgCellSurface } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, type AppHost } from "../src/app";
import { gallery } from "../src/images";

/**
 * Render the image viewer to an SVG for the docs. `SvgCellSurface` is a drop-in
 * for the ANSI surface, so the docs show the real half-block render.
 *
 *   pnpm --filter @uniview/tui-image-demo snapshot
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../docs/public/tui/image-react.svg");

const styles = new StyleTable();
const surface = new SvgCellSurface({ styles });
const root = createTuiReactRoot({ surface, styles, size: { width: 80, height: 30 } });
const host: AppHost = { quit: () => {} };

root.render(createElement(App, { cols: 80, rows: 30, host, images: gallery(256) }));

setTimeout(() => {
  const svg = surface.toSVG();
  if (!svg) throw new Error("no frame was presented");
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, svg);
  console.log(`wrote ${OUT} (${svg.length} bytes)`);
  process.exit(0);
}, 300);
