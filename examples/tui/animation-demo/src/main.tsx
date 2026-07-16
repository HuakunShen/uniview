import { AnsiCellSurface, StyleTable, TerminalDriver } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App } from "./app";

/**
 * animate() showcase — a bouncing bar. The default FrameClock (performance.now()
 * paced) drives the tween; each frame re-renders locally (no per-frame RPC).
 *
 *   pnpm --filter @uniview/tui-animation-demo dev     (Ctrl-C to quit)
 */
const columns = process.stdout.columns ?? 80;
const rows = process.stdout.rows ?? 24;
const ONCE = !process.stdout.isTTY || process.env.UNIVIEW_DEMO_ONCE === "1";

const styles = new StyleTable();
const surface = new AnsiCellSurface({ write: (chunk) => process.stdout.write(chunk), styles });
const root = createTuiReactRoot({ surface, styles, size: { width: columns, height: rows } });

let started = false;
const driver = new TerminalDriver({
  input: process.stdin,
  output: process.stdout,
  onEvent: (event) => {
    if (event.type === "resize") {
      root.host.renderer.resize({ width: event.width, height: event.height });
      root.render(<App />);
      return;
    }
    if (event.type === "key" && event.ctrl && event.key === "c") {
      root.destroy();
      if (started) driver.stop();
      process.exit(0);
    }
  },
});

if (!ONCE) {
  driver.start();
  started = true;
}

root.render(<App />);
if (ONCE)
  setTimeout(() => {
    root.destroy();
    process.exit(0);
  }, 300);
