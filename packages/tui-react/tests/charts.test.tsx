import { describe, expect, it } from "vitest";
import { createElement as h, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import {
  BarChart,
  Gauge,
  Histogram,
  LineChart,
  Scatter,
  Sparkline,
} from "../src/charts";

const tick = () => new Promise((r) => setTimeout(r, 20));
function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { root, surface, styles };
}

describe("chart components", () => {
  it("Sparkline renders eighth-block glyphs", async () => {
    const { surface } = mount(
      h(Sparkline, { values: [0, 4, 8], options: { max: 8 } }),
      10,
      3,
    );
    await tick();
    expect(surface.text()).toContain("▄█");
  });

  it("Gauge renders a fully-filled bar", async () => {
    const { surface } = mount(h(Gauge, { fraction: 1, options: { width: 4 } }), 10, 3);
    await tick();
    expect(surface.text()).toContain("████");
  });

  it("BarChart renders a full block for the tallest bar", async () => {
    const { surface } = mount(
      h(BarChart, {
        data: [
          { label: "a", value: 1 },
          { label: "b", value: 2 },
        ],
        options: { height: 2, max: 2 },
      }),
      10,
      3,
    );
    await tick();
    expect(surface.text()).toContain("█");
  });

  it("Histogram renders without error", async () => {
    const { surface } = mount(
      h(Histogram, { values: [1, 2, 2, 3, 3, 3], options: { bins: 3, height: 2 } }),
      20,
      4,
    );
    await tick();
    expect(surface.text().length).toBeGreaterThan(0);
  });

  it("LineChart renders without error", async () => {
    const { surface } = mount(
      h(LineChart, {
        series: [{ points: [[0, 0], [1, 1], [2, 0]] }],
        options: { width: 10, height: 4 },
      }),
      20,
      6,
    );
    await tick();
    expect(surface.text().length).toBeGreaterThan(0);
  });

  it("Scatter renders without error", async () => {
    const { surface } = mount(
      h(Scatter, {
        series: [{ points: [[0, 0], [1, 1]] }],
        options: { width: 10, height: 4 },
      }),
      20,
      6,
    );
    await tick();
    expect(surface.text().length).toBeGreaterThan(0);
  });
});
