import { createElement as h, useState } from "react";
import {
  AnsiCellSurface,
  StyleTable,
  TerminalDriver,
} from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";

/**
 * A React counter running in the terminal via @uniview/tui-react.
 *
 *   pnpm --filter @uniview/tui-react-demo dev
 *   click [ Increment ] or focus it with Tab and press Enter; q / Ctrl-C quits.
 */
function App() {
  const [count, setCount] = useState(0);
  return h(
    "box",
    { flexDirection: "column", padding: 1, border: "rounded", width: 40 },
    h("text", { color: "cyan", bold: true }, "React on tui-core"),
    h("text", null, ""),
    h("text", { bold: true }, `Count: ${count}`),
    h("text", null, ""),
    h(
      "box",
      {
        onClick: () => setCount((c) => c + 1),
        backgroundColor: "blue",
        padding: { left: 1, right: 1 },
      },
      h("text", { color: "white" }, "Increment"),
    ),
    h("text", { color: "gray", dim: true }, "Tab+Enter or click · q quits"),
  );
}

const styles = new StyleTable();
const surface = new AnsiCellSurface({
  write: (chunk) => process.stdout.write(chunk),
  styles,
});
const root = createTuiReactRoot({ surface, styles, size: { width: 40, height: 12 } });

function quit(): void {
  root.destroy();
  driver.stop();
  process.exit(0);
}

const driver = new TerminalDriver({
  input: process.stdin,
  output: process.stdout,
  onEvent: (event) => {
    if (event.type === "resize") {
      root.host.renderer.resize({ width: event.width, height: event.height });
      return;
    }
    if (
      (event.type === "text" && event.text === "q") ||
      (event.type === "key" && event.key === "c" && event.ctrl)
    ) {
      quit();
      return;
    }
    root.dispatchInput(event);
  },
});

driver.start();
root.render(h(App));

process.stdin.on?.("end", quit);
