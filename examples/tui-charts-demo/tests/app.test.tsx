import { describe, expect, it } from "vitest";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, createState, tick, type AppHost } from "../src/app";

const settle = () => new Promise((r) => setTimeout(r, 20));

function boot() {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width: 100, height: 30 } });
  const state = createState();
  const host: AppHost = { rerender: () => root.render(<App state={state} host={host} />), quit: () => {} };
  host.rerender();
  return { surface, state, host };
}
const screen = (t: ReturnType<typeof boot>) => t.surface.text({ trimRight: true });

describe("charts demo", () => {
  it("renders the five panel titles", async () => {
    const t = boot();
    await settle();
    const text = screen(t);
    for (const title of ["Progress", "Stats for last sec", "Status code distribution", "Requests / past sec", "Response time histogram"]) {
      expect(text).toContain(title);
    }
  });

  it("changes the bar-chart region after several ticks", async () => {
    const t = boot();
    await settle();
    const before = screen(t);
    for (let i = 0; i < 5; i += 1) tick(t.state);
    t.host.rerender();
    await settle();
    const after = screen(t);
    expect(after).not.toBe(before);
  });

  it("shows a filled portion of the progress gauge", async () => {
    const t = boot();
    tick(t.state);
    t.host.rerender();
    await settle();
    const lines = screen(t).split("\n");
    const progressLineIndex = lines.findIndex((line) => line.includes("Progress"));
    const gaugeRow = lines.slice(progressLineIndex, progressLineIndex + 3).join("\n");
    expect(gaugeRow).toContain("█");
  });
});
