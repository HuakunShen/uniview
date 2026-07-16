import { AnsiCellSurface, StyleTable, TerminalDriver } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, createState, handleKey, type AppHost } from "./app";
import { MESSAGE } from "./data";

/**
 * A multi-page, opencode-style terminal UI:
 *   • Chat / Code / Diff pages (scrollable), syntax-highlighted content
 *   • a Ctrl-K command palette dialog (absolute overlay)
 *   • mouse: click tabs/files/commands, hover to highlight, wheel to scroll
 *   • keyboard: 1/2/3 pages, ↑↓/PgUp·PgDn/Home·End scroll, [ ] switch file
 *
 *   pnpm --filter @uniview/tui-opencode-demo dev     (q / Ctrl-C to quit)
 */
const columns = process.stdout.columns ?? 96;
const rows = process.stdout.rows ?? 32;
const ONCE = !process.stdout.isTTY || process.env.UNIVIEW_DEMO_ONCE === "1";

const state = createState(columns, rows, ONCE ? MESSAGE.length : 0);
state.page = Number(process.env.UNIVIEW_DEMO_PAGE ?? 0);
state.palette.open = process.env.UNIVIEW_DEMO_PALETTE === "1";

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
  mouse: "motion", // any-motion tracking → hover
  onEvent: (event) => {
    if (event.type === "resize") {
      state.width = event.width;
      state.height = event.height;
      root.host.renderer.resize({ width: event.width, height: event.height });
      rerender();
      return;
    }
    if (event.type === "mouse") {
      root.dispatchInput(event); // hover / click / wheel
      return;
    }
    if (!handleKey(state, host, event)) root.dispatchInput(event);
  },
});

if (!ONCE) {
  driver.start();
  started = true;
  process.stdin.on?.("end", host.quit);
  const timer = setInterval(() => {
    if (state.streamN >= MESSAGE.length) {
      clearInterval(timer);
      return;
    }
    state.streamN = Math.min(MESSAGE.length, state.streamN + 4);
    rerender();
  }, 40);
}

rerender();
if (ONCE) setTimeout(host.quit, 300);
