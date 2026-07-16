import { describe, expect, it } from "vitest";
import { StyleTable } from "../../src/style/style-table";
import { renderToBuffer, type RenderNode } from "../../src/paint/paint";
import { frameToText } from "../../src/buffer/frame";
import type { BorderValue } from "../../src/style/tui-style";

function borderRows(border: BorderValue): string[] {
  const node: RenderNode = { type: "box", style: { border, width: 4, height: 3 } };
  const { buffer } = renderToBuffer(node, { width: 4, height: 3 }, new StyleTable());
  return frameToText(buffer).split("\n");
}

describe("border presets", () => {
  it("paints a thick border (single glyph pair, reused per edge)", () => {
    const rows = borderRows("thick");
    expect(rows[0]).toBe("┏━━┓");
    expect(rows[1]![0]).toBe("┃");
    expect(rows[1]![3]).toBe("┃");
    expect(rows[2]).toBe("┗━━┛");
  });

  it("paints a quadrant-inside border with per-edge half blocks", () => {
    const rows = borderRows("quadrant-inside");
    expect(rows[0]).toBe("▗▄▄▖");
    expect(rows[1]![0]).toBe("▐");
    expect(rows[1]![3]).toBe("▌");
    expect(rows[2]).toBe("▝▀▀▘");
  });

  it("paints a quadrant-outside border with per-edge half blocks", () => {
    const rows = borderRows("quadrant-outside");
    expect(rows[0]).toBe("▛▀▀▜");
    expect(rows[1]![0]).toBe("▌");
    expect(rows[1]![3]).toBe("▐");
    expect(rows[2]).toBe("▙▄▄▟");
  });
});
