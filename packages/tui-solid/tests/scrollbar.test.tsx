import { describe, expect, it } from "vitest";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiSolidRoot } from "../src/index";
import { Scrollbar } from "../src/interactive";
import { tick } from "./tick";

describe("Scrollbar (Solid)", () => {
  it("paints a thumb over a track", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 1, height: 10 } });
    root.render(() => <Scrollbar total={20} height={10} value={0} />);
    await tick();
    expect(surface.lines({ trimRight: true })).toEqual(["█", "█", "█", "█", "█", "│", "│", "│", "│", "│"]);
    root.destroy();
  });
});
