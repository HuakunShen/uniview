import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiSolidRoot } from "../src/index";
import { BarChart, Gauge, Histogram, LineChart, Scatter, Sparkline } from "../src/charts";

import { tick } from "./tick";

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  return { root, surface, styles };
}

/** The braille block (U+2800–U+28FF) — what SubcellCanvas paints with. */
const hasBraille = (s: string): boolean => /[⠀-⣿]/.test(s);

describe("chart components", () => {
  it("Sparkline renders eighth-block glyphs", async () => {
    const { root, surface } = mount(() => <Sparkline values={[0, 4, 8]} options={{ max: 8 }} />, 10, 3);
    await tick();
    expect(surface.text()).toContain("▄█");
    root.destroy();
  });

  it("Gauge renders a fully-filled bar", async () => {
    const { root, surface } = mount(() => <Gauge fraction={1} options={{ width: 4 }} />, 10, 3);
    await tick();
    expect(surface.text()).toContain("████");
    root.destroy();
  });

  it("BarChart renders a full block for the tallest bar", async () => {
    const { root, surface } = mount(
      () => (
        <BarChart
          data={[
            { label: "a", value: 1 },
            { label: "b", value: 2 },
          ]}
          options={{ height: 2, max: 2 }}
        />
      ),
      10,
      3,
    );
    await tick();
    expect(surface.text()).toContain("█");
    root.destroy();
  });

  it("Histogram renders bar glyphs for its bins", async () => {
    const { root, surface } = mount(
      () => <Histogram values={[1, 2, 2, 3, 3, 3]} options={{ bins: 3, height: 2 }} />,
      20,
      4,
    );
    await tick();
    // The tallest bin (three 3s) must reach a full block.
    expect(surface.text()).toContain("█");
    root.destroy();
  });

  it("LineChart paints braille sub-cell glyphs", async () => {
    const { root, surface } = mount(
      () => (
        <LineChart
          series={[
            {
              points: [
                [0, 0],
                [1, 1],
                [2, 0],
              ],
            },
          ]}
          options={{ width: 10, height: 4 }}
        />
      ),
      20,
      6,
    );
    await tick();
    expect(hasBraille(surface.text())).toBe(true);
    root.destroy();
  });

  it("Scatter paints braille sub-cell glyphs", async () => {
    const { root, surface } = mount(
      () => (
        <Scatter
          series={[
            {
              points: [
                [0, 0],
                [1, 1],
              ],
            },
          ]}
          options={{ width: 10, height: 4 }}
        />
      ),
      20,
      6,
    );
    await tick();
    expect(hasBraille(surface.text())).toBe(true);
    root.destroy();
  });

  /**
   * The chart must re-render when its props change. `NodeView` picks its branch
   * once at component-body level and does not re-dispatch, so a chart that built
   * its RenderNode a single time would render the initial data forever. Driving
   * the values from a signal and asserting the glyphs actually flip is what
   * catches that.
   */
  it("re-renders when a values signal changes", async () => {
    const [values, setValues] = createSignal<readonly number[]>([0, 4, 8]);
    const { root, surface } = mount(() => <Sparkline values={values()} options={{ max: 8 }} />, 10, 3);
    await tick();
    expect(surface.text()).toContain("▄█");

    setValues([8, 4, 0]);
    await tick();
    expect(surface.text()).toContain("█▄"); // reversed
    expect(surface.text()).not.toContain("▄█");
    root.destroy();
  });
});
