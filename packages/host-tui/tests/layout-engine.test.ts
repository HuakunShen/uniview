import { describe, expect, it } from "vitest";
import { MemoryCellSurface, StyleTable, customLayoutEngine, yogaLayoutEngine } from "@uniview/tui-core";
import { TEXT_NODE_TYPE, type UINode } from "@uniview/protocol";
import { TuiHost } from "../src/tui-host";

function tree(label: string): UINode {
  return {
    id: "root",
    type: "box",
    props: {},
    children: [
      {
        id: "row",
        type: "text",
        props: {},
        children: [{ id: "t", type: TEXT_NODE_TYPE, props: {}, children: [], text: label }],
      },
    ],
  };
}

describe("TuiHost — layoutEngine option", () => {
  it("threads the selected engine through to the render loop (explicit custom)", () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const host = new TuiHost({ surface, size: { width: 12, height: 4 }, styles, layoutEngine: customLayoutEngine });
    host.setRoot(tree("hi"));
    expect(surface.text({ trimRight: true })).toContain("hi");
    host.destroy();
  });

  it("renders and re-renders stably through yogaLayoutEngine on a single host", () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const host = new TuiHost({ surface, size: { width: 12, height: 4 }, styles, layoutEngine: yogaLayoutEngine });
    host.setRoot(tree("aa"));
    expect(surface.text({ trimRight: true })).toContain("aa");
    host.setRoot(tree("bb"));
    expect(surface.text({ trimRight: true })).toContain("bb");
    host.setRoot(tree("cc"));
    expect(surface.text({ trimRight: true })).toContain("cc");
    host.destroy();
  });

  it("yoga and custom produce the same frame for a simple aligned tree", () => {
    const render = (engine: typeof customLayoutEngine): string => {
      const styles = new StyleTable();
      const surface = new MemoryCellSurface({ styles });
      const host = new TuiHost({ surface, size: { width: 12, height: 4 }, styles, layoutEngine: engine });
      host.setRoot(tree("hi"));
      const text = surface.text();
      host.destroy();
      return text;
    };
    expect(render(yogaLayoutEngine)).toBe(render(customLayoutEngine));
  });
});
