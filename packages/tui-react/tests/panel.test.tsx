import { describe, expect, it } from "vitest";
import { createElement as h, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { Panel } from "../src/panel";

const tick = () => new Promise((r) => setTimeout(r, 20));
function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { root, surface, styles };
}

describe("Panel", () => {
  it("renders a titled border and a right-aligned footer", async () => {
    const { surface } = mount(h(Panel, { title: "Status", footer: "1 of 8", footerAlign: "right", width: 14, height: 3 }), 14, 3);
    await tick();
    const lines = surface.text({ trimRight: false }).split("\n");
    expect(lines[0]).toContain("Status");
    expect(lines[2]!.slice(7, 13)).toBe("1 of 8");
  });

  it("colors the border green when focused", async () => {
    const { surface, styles } = mount(h(Panel, { title: "Branches", focused: true, width: 12, height: 3 }), 12, 3);
    await tick();
    const frame = surface.cells()!;
    const topLeft = frame.cells[0]![0]!; // the ╭ corner glyph
    expect(styles.get(topLeft.styleId).fg).toBe("green");
  });
});
