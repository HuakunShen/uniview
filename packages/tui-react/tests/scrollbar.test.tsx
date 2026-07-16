import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { Scrollbar } from "../src/interactive";
import { tick } from "./tick";

describe("Scrollbar", () => {
  it("paints a thumb over a track", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 1, height: 10 } });
    root.render(h(Scrollbar, { total: 20, height: 10, value: 0 }));
    await tick();
    // thumb = 5 rows of "█" then 5 rows of "│"
    expect(surface.lines({ trimRight: true })).toEqual(["█", "█", "█", "█", "█", "│", "│", "│", "│", "│"]);
    root.destroy();
  });
});
