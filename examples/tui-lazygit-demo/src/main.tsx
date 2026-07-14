import { AnsiCellSurface, StyleTable, TerminalDriver } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, createState, handleKey, type AppHost } from "./app";

/**
 * A lazygit-style multi-panel terminal UI:
 *   • Status / Files / Local branches / Commits / Stash panels on the left
 *   • a Log panel on the right
 *   • a keybinding status bar docked at the bottom
 *
 *   pnpm --filter @uniview/tui-lazygit-demo dev     (Ctrl-C to quit)
 *
 *   keys: 1-5/0 focus a panel · ↑↓ move the branch/commit selection
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
    if (!handleKey(state, host, event)) root.dispatchInput(event);
  },
});

if (!ONCE) {
  driver.start();
  started = true;
  process.stdin.on?.("end", host.quit);
}

rerender();
if (ONCE) setTimeout(host.quit, 300);
