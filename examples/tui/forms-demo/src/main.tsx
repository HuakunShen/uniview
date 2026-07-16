import { AnsiCellSurface, StyleTable, TerminalDriver } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, type AppHost } from "./app";

/**
 * A forms showcase: <Tabs> + <TextInput> + <LineGauge> + <Scrollbar>.
 *
 *   pnpm --filter @uniview/tui-forms-demo dev
 *   (Tab focuses the tab strip; arrows switch tabs; q or Ctrl-C quits.)
 */
const columns = process.stdout.columns ?? 80;
const rows = process.stdout.rows ?? 24;
const ONCE = !process.stdout.isTTY || process.env.UNIVIEW_DEMO_ONCE === "1";

const styles = new StyleTable();
const surface = new AnsiCellSurface({ write: (chunk) => process.stdout.write(chunk), styles });
const root = createTuiReactRoot({ surface, styles, size: { width: columns, height: rows } });

let started = false;
const host: AppHost = {
  rerender: () => root.render(<App host={host} />),
  quit: () => {
    root.destroy();
    if (started) driver.stop();
    process.exit(0);
  },
};

const driver = new TerminalDriver({
  input: process.stdin,
  output: process.stdout,
  onEvent: (event) => {
    if (event.type === "resize") {
      root.host.renderer.resize({ width: event.width, height: event.height });
      host.rerender();
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
}

host.rerender();
if (ONCE) setTimeout(host.quit, 300);
