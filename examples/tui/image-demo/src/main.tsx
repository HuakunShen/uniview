import { AnsiCellSurface, StyleTable, TerminalDriver } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, type AppHost } from "./app";

/**
 * A terminal image viewer — raster images painted as half-block ▀ cells.
 *
 *   pnpm --filter @uniview/tui-image-demo dev     (n: next image · q or Ctrl-C: quit)
 */
const ONCE = !process.stdout.isTTY || process.env.UNIVIEW_DEMO_ONCE === "1";

const styles = new StyleTable();
const surface = new AnsiCellSurface({ write: (chunk) => process.stdout.write(chunk), styles });

let dim = { width: process.stdout.columns ?? 80, height: process.stdout.rows ?? 24 };
const root = createTuiReactRoot({ surface, styles, size: dim });

let started = false;
const host: AppHost = {
  quit: () => {
    root.destroy();
    if (started) driver.stop();
    process.exit(0);
  },
};
const paint = (): void => root.render(<App cols={dim.width} rows={dim.height} host={host} />);

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
    if (event.type === "key" && event.ctrl && event.key === "c") host.quit();
  },
});

if (!ONCE) {
  driver.start();
  started = true;
  process.stdin.on?.("end", host.quit);
}

paint();
if (ONCE) setTimeout(host.quit, 300);
