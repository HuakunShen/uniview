import { describe, expect, it } from "vitest";
import { MemoryCellSurface, StyleTable, TuiRenderer } from "@uniview/tui-core";
import { renderLineGauge } from "../src/gauge";

function paint(node: ReturnType<typeof renderLineGauge>, width: number): string {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const renderer = new TuiRenderer({ surface, size: { width, height: 1 }, styles });
  renderer.setRoot(node);
  renderer.flush();
  return surface.text({ trimRight: true });
}

describe("renderLineGauge", () => {
  it("lays out label, bar and percentage on one line", () => {
    const text = paint(renderLineGauge(0.6, { width: 10, label: "Load" }), 40);
    expect(text.startsWith("Load ")).toBe(true);
    expect(text.endsWith(" 60%")).toBe(true);
    expect(text).toContain("█");
  });

  it("omits the percentage when showPercent is false", () => {
    const text = paint(renderLineGauge(1, { width: 6, showPercent: false }), 20);
    expect(text).toBe("██████");
  });
});
