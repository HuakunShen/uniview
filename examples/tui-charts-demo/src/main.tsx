import { AnsiCellSurface, StyleTable, TerminalDriver } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, createState, tick, type AppHost } from "./app";

/**
 * An oha-style load-test charts dashboard:
 *   • a Progress gauge (elapsed / total seconds)
 *   • "Stats for last sec" + "Status code distribution" side by side
 *   • "Requests / past sec" (bar chart) + "Response time histogram" side by side
 *
 *   pnpm --filter @uniview/tui-charts-demo dev     (Ctrl-C to quit)
 */
const columns = process.stdout.columns ?? 100;
const rows = process.stdout.rows ?? 30;
const ONCE = !process.stdout.isTTY || process.env.UNIVIEW_DEMO_ONCE === "1";

const state = createState();

const styles = new StyleTable();
const surface = new AnsiCellSurface({ write: (chunk) => process.stdout.write(chunk), styles });
const root = createTuiReactRoot({ surface, styles, size: { width: columns, height: rows } });

let started = false;
const host: AppHost = {
  rerender: () => root.render(<App state={state} host={host} />),
  quit: () => {
    root.destroy();
    if (started) driver.stop();
    process.exit(0);
  },
};
const rerender = host.rerender;

const driver = new TerminalDriver({
  input: process.stdin,
  output: process.stdout,
  mouse: "motion",
  onEvent: (event) => {
    if (event.type === "resize") {
      root.host.renderer.resize({ width: event.width, height: event.height });
      rerender();
      return;
    }
    if (event.type === "mouse") {
      root.dispatchInput(event);
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
  setInterval(() => {
    tick(state);
    rerender();
  }, 1000);
}

rerender();
if (ONCE) setTimeout(host.quit, 300);
