import { AnsiCellSurface, StyleTable, TerminalDriver } from "@uniview/tui-core";
import { createTuiSolidRoot } from "@uniview/tui-solid";
import { App, createAppState, handleKey, type AppHost } from "./app";

/**
 * A lazygit-style multi-panel terminal UI — the same demo as
 * `@uniview/tui-lazygit-demo`, but authored in Solid instead of React. Both
 * drive the identical host (`@uniview/host-tui` + `@uniview/tui-core`), which is
 * what makes this the parity proof.
 *
 *   pnpm --filter @uniview/tui-lazygit-solid dev     (Ctrl-C to quit)
 *
 *   keys: 1-5/0 focus a panel · ↑↓ move the branch/commit selection
 *
 * Note it runs under `vite-node`, not `tsx`: the public `univiewSolid()` Vite
 * helper lowers Solid JSX for the terminal renderer; esbuild alone cannot.
 */
const columns = process.stdout.columns ?? 100;
const rows = process.stdout.rows ?? 30;
const ONCE = !process.stdout.isTTY || process.env.UNIVIEW_DEMO_ONCE === "1";

const styles = new StyleTable();
const surface = new AnsiCellSurface({
  write: (chunk) => process.stdout.write(chunk),
  styles,
});
const root = createTuiSolidRoot({
  surface,
  styles,
  size: { width: columns, height: rows },
});

const state = createAppState();

let started = false;
const host: AppHost = {
  quit: () => {
    root.destroy();
    if (started) driver.stop();
    process.exit(0);
  },
};

const driver = new TerminalDriver({
  input: process.stdin,
  output: process.stdout,
  mouse: "motion",
  onEvent: (event) => {
    if (event.type === "resize") {
      // `resize` invalidates layout and schedules its own repaint — and the Solid
      // tree is untouched, so there is nothing to re-render.
      root.host.renderer.resize({ width: event.width, height: event.height });
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

// Mounted exactly once. Every later update comes from a signal write inside
// `handleKey` — the React twin has to call `root.render(...)` again per key.
root.render(() => <App state={state} />);

if (ONCE) setTimeout(host.quit, 300);
