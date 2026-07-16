import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { StyleTable, SvgCellSurface } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, type AppHost, type Frame } from "../src/app";
import { syntheticProcesses } from "../src/sysinfo";

/**
 * Render the system monitor to an SVG for the docs. Live sampling is transient
 * on the first frame, so the snapshot uses a hand-crafted, deterministic frame
 * (varied per-core load, a filled history curve) to show the layout at its best.
 *
 *   pnpm --filter @uniview/tui-htop-demo snapshot
 */
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../docs/public/tui/htop-react.svg");

const clamp = (n: number): number => Math.max(0, Math.min(100, n));
const cores = [34, 12, 78, 45, 9, 62, 21, 88, 15, 40, 55, 7, 30, 71];
// Deterministic history (Math.sin — no Date.now/Math.random, so no diff churn).
const cpuHist = Array.from({ length: 90 }, (_, i) => clamp(42 + 26 * Math.sin(i / 6) + 9 * Math.sin(i / 2)));
const memHist = Array.from({ length: 90 }, (_, i) => clamp(58 + 7 * Math.sin(i / 9)));

const frame: Frame = {
  cpu: 41,
  cores,
  mem: 63.4,
  memUsedGB: 30.4,
  memTotalGB: 48,
  load1: 3.21,
  processes: syntheticProcesses(),
  cpuHist,
  memHist,
};

const styles = new StyleTable();
const surface = new SvgCellSurface({ styles });
const root = createTuiReactRoot({ surface, styles, size: { width: 100, height: 32 } });
const host: AppHost = { quit: () => {} };

root.render(createElement(App, { frame, cols: 100, rows: 32, host }));

setTimeout(() => {
  const svg = surface.toSVG();
  if (!svg) throw new Error("no frame was presented");
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, svg);
  console.log(`wrote ${OUT} (${svg.length} bytes)`);
  process.exit(0);
}, 300);
