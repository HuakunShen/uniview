import { AnsiCellSurface, StyleTable, TerminalDriver } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, type AppHost } from "./app";

/**
 * A terminal audio scope — oscilloscope / vectorscope / spectroscope over a
 * braille `<Canvas>`, fed by a synthetic stereo source (no audio device, so it
 * runs anywhere). The default FrameClock (performance.now()-paced) drives the
 * per-frame redraw once `useAnimation()` subscribes.
 *
 *   pnpm --filter @uniview/tui-scope-demo dev
 *
 * (Tab / 1·2·3: switch mode · q or Ctrl-C: quit)
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
    if (event.type === "key" && event.ctrl && event.key === "c") {
      host.quit();
      return;
    }
    // Forward everything else so <App>'s useInput sees Tab / 1·2·3 / q.
    root.dispatchInput(event);
  },
});

if (!ONCE) {
  driver.start();
  started = true;
  process.stdin.on?.("end", host.quit);
}

paint();
if (ONCE) setTimeout(host.quit, 300);
