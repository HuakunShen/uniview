import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { AnsiCellSurface, StyleTable, TerminalDriver } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, type AppHost } from "./app";
import { parseCsv, type CsvData } from "./csv";
import { SAMPLE_CSV } from "./sample";

/**
 * `less` for CSV — a virtualized <Table> pager with sort, regex find and a row
 * filter. Modelled on ratatui `csvlens`.
 *
 *   pnpm --filter @uniview/tui-csv-demo dev                   # bundled sample
 *   pnpm --filter @uniview/tui-csv-demo dev -- data.csv       # a real file
 *
 * (↑/↓ PgUp/PgDn move · ←/→ pick sort column · s sort · / find · n/N next/prev
 *  · & filter · Esc clear · q or Ctrl-C quit)
 */
const path = process.argv[2];
let data: CsvData;
let name: string;
if (path) {
  try {
    data = parseCsv(readFileSync(path, "utf8"));
    name = basename(path);
  } catch (error) {
    process.stderr.write(`Could not read "${path}": ${(error as Error).message}\n`);
    process.exit(1);
  }
} else {
  data = parseCsv(SAMPLE_CSV);
  name = "cities.csv (sample)";
}

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
const paint = (): void => root.render(<App data={data} name={name} cols={dim.width} rows={dim.height} host={host} />);

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
}

paint();
if (ONCE) setTimeout(host.quit, 300);
