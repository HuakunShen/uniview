import { describe, expect, it } from "vitest";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiSolidRoot } from "../src/index";
import { Box, Text } from "../src/primitives";
import { Newline, Spacer, Transform } from "../src/layout-primitives";
import { tick } from "./tick";

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  return { root, surface };
}

describe("Spacer (Solid)", () => {
  it("pushes siblings to opposite ends of a row", async () => {
    const { root, surface } = mount(
      () => (
        <Box flexDirection="row" width={10}>
          <Text>L</Text>
          <Spacer />
          <Text>R</Text>
        </Box>
      ),
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

describe("Newline (Solid)", () => {
  it("inserts blank rows between text (count rows)", async () => {
    const { root, surface } = mount(
      () => (
        <Box flexDirection="column">
          <Text>a</Text>
          <Newline count={2} />
          <Text>b</Text>
        </Box>
      ),
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

describe("Transform (Solid)", () => {
  it("maps each line through the transform", async () => {
    const { root, surface } = mount(
      () => <Transform transform={(line) => line.toUpperCase()}>{"ab\ncd"}</Transform>,
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
