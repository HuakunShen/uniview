import { describe, expect, it } from "vitest";
import { createElement as h, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { Box, Text } from "../src/primitives";
import { Newline, Spacer, Transform } from "../src/layout-primitives";
import { tick } from "./tick";

function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { root, surface };
}

describe("Spacer (React)", () => {
  it("pushes siblings to opposite ends of a row", async () => {
    const { root, surface } = mount(
      h(Box, { flexDirection: "row", width: 10 }, h(Text, null, "L"), h(Spacer), h(Text, null, "R")),
      10,
      1,
    );
    await tick();
    const line = surface.text({ trimRight: false }).split("\n")[0]!;
    expect(line[0]).toBe("L");
    expect(line[9]).toBe("R");
    root.destroy();
  });
});

describe("Newline (React)", () => {
  it("inserts blank rows between text (count rows)", async () => {
    const { root, surface } = mount(
      h(Box, { flexDirection: "column" }, h(Text, null, "a"), h(Newline, { count: 2 }), h(Text, null, "b")),
      4,
      4,
    );
    await tick();
    const lines = surface.text({ trimRight: true }).split("\n");
    expect(lines[0]).toBe("a");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("");
    expect(lines[3]).toBe("b");
    root.destroy();
  });
});

describe("Transform (React)", () => {
  it("maps each line through the transform", async () => {
    const { root, surface } = mount(
      h(Transform, { transform: (line: string) => line.toUpperCase() }, "ab\ncd"),
      4,
      2,
    );
    await tick();
    const lines = surface.text({ trimRight: true }).split("\n");
    expect(lines[0]).toBe("AB");
    expect(lines[1]).toBe("CD");
    root.destroy();
  });
});
