import { describe, expect, it } from "vitest";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiSolidRoot } from "../src/index";
import { LineGauge } from "../src/charts";
import { tick } from "./tick";

describe("LineGauge (Solid)", () => {
  it("renders label, bar and percentage", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 24, height: 1 } });
    root.render(() => <LineGauge fraction={0.6} options={{ width: 10, label: "Load" }} />);
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("Load ");
    expect(text).toContain("60%");
    root.destroy();
  });
});
