import { AnsiCellSurface, StyleTable, TerminalDriver } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, type AppHost, type Frame } from "./app";
import { createSampler } from "./sysinfo";

/**
 * An htop-style system monitor — a live CPU/MEM history plot + meters over a
 * sortable process table. Real data: `os` counters for CPU/memory and `ps` for
 * the process list, sampled on an interval (this is the Node/Bun-plugin "real
 * I/O" story — a sandboxed Worker couldn't read them). Each sample re-renders;
 * sort/cursor state lives in <App>, so sorting is instant between samples.
 *
 *   pnpm --filter @uniview/tui-htop-demo dev
 *
 * (↑/↓ PgUp/PgDn move · C/M/T/P/N sort by cpu/mem/time/pid/name · q/Ctrl-C quit)
 */
const INTERVAL_MS = 1500;

const ONCE = !process.stdout.isTTY || process.env.UNIVIEW_DEMO_ONCE === "1";
const styles = new StyleTable();
const surface = new AnsiCellSurface({ write: (chunk) => process.stdout.write(chunk), styles });

let dim = { width: process.stdout.columns ?? 80, height: process.stdout.rows ?? 24 };
const root = createTuiReactRoot({ surface, styles, size: dim });

const sampler = createSampler();
let frame: Frame | null = null;

let timer: ReturnType<typeof setInterval> | null = null;
const host: AppHost = {
  quit: () => {
    if (timer) clearInterval(timer);
    root.destroy();
    if (started) driver.stop();
    process.exit(0);
  },
};

const paint = (): void => {
  if (frame) root.render(<App frame={frame} cols={dim.width} rows={dim.height} host={host} />);
};

const takeSample = (): void => {
  frame = sampler.sample();
  paint();
};

let started = false;
const driver = new TerminalDriver({
  input: process.stdin,
  output: process.stdout,
  onEvent: (event) => {
    if (event.type === "resize") {
      dim = { width: event.width, height: event.height };
      root.host.renderer.resize(dim);
      paint();
      return;
    }
    if (event.type === "key" && event.ctrl && event.key === "c") {
      host.quit();
      return;
    }
    root.dispatchInput(event);
  },
});

if (!ONCE) {
  driver.start();
  started = true;
  process.stdin.on?.("end", host.quit);
  timer = setInterval(takeSample, INTERVAL_MS);
}

takeSample(); // prime the first frame immediately
if (ONCE) setTimeout(host.quit, 300);
