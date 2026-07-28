import { describe, expect, it } from "vitest";
import { createElement as h, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { RichText, Text } from "../src/primitives";
import { tick } from "./tick";

function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { root, surface, styles };
}

describe("Text — blink & hidden (React)", () => {
  it("paints a cell whose style carries blink and hidden", async () => {
    const { root, surface, styles } = mount(
      h(Text, { blink: true, hidden: true }, "x"),
      4,
      1,
    );
    await tick();
    const frame = surface.cells()!;
    const style = styles.get(frame.cells[0]![0]!.styleId);
    expect(style.blink).toBe(true);
    expect(style.hidden).toBe(true);
    root.destroy();
  });

  it("is selectable by default and honors selectable=false for text and richtext", async () => {
    const { root, surface } = mount(
      h(
        "box",
        { flexDirection: "column" },
        h(Text, null, "copy"),
        h(Text, { selectable: false }, "secret"),
        h(RichText, {
          selectable: false,
          spans: [{ text: "hidden" }],
        }),
      ),
      10,
      3,
    );
    await tick();

    const frame = surface.lastFrame!;
    expect([...frame.selectable.slice(0, 4)]).toEqual([1, 1, 1, 1]);
    expect([...frame.selectable.slice(10, 16)]).toEqual([0, 0, 0, 0, 0, 0]);
    expect([...frame.selectable.slice(20, 26)]).toEqual([0, 0, 0, 0, 0, 0]);
    root.destroy();
  });

  it("passes selection options through the React root", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({
      surface,
      styles,
      size: { width: 8, height: 1 },
      selection: {},
    });
    root.render(h(Text, null, "select"));
    await tick();

    root.dispatchInput({
      type: "mouse",
      action: "down",
      button: "left",
      x: 0,
      y: 0,
      ctrl: false,
      alt: false,
      shift: false,
    });
    root.dispatchInput({
      type: "mouse",
      action: "drag",
      button: "left",
      x: 2,
      y: 0,
      ctrl: false,
      alt: false,
      shift: false,
    });

    expect(root.host.renderer.selectionRange).toEqual({
      start: { x: 0, y: 0 },
      end: { x: 2, y: 0 },
    });
    root.destroy();
  });
});
