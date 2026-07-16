import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { FrameClock, StyleTable, SvgCellSurface } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, type AppHost } from "../src/app";

/**
 * Render the audio scope to an SVG for the docs. A fixed clock (`now → 0`,
 * `requestFrame` never fires) pins the frame at t=0, so the captured waveform is
 * deterministic and the snapshot doesn't churn the diff.
 *
 *   pnpm --filter @uniview/tui-scope-demo snapshot
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../docs/public/tui/scope-react.svg");

const styles = new StyleTable();
const surface = new SvgCellSurface({ styles });
const clock = new FrameClock({ now: () => 0, requestFrame: () => {} });
const root = createTuiReactRoot({ surface, styles, size: { width: 80, height: 24 }, clock });
const host: AppHost = { quit: () => {} };

root.render(createElement(App, { cols: 80, rows: 24, host }));

setTimeout(() => {
  const svg = surface.toSVG();
  if (!svg) throw new Error("no frame was presented");
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, svg);
  console.log(`wrote ${OUT} (${svg.length} bytes)`);
  process.exit(0);
}, 300);
