import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { StyleTable, SvgCellSurface } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import {
  Box as RBox,
  Masked as RMasked,
  Newline as RNewline,
  Spacer as RSpacer,
  Text as RText,
  Transform as RTransform,
} from "@uniview/tui-react";
import { createTuiSolidRoot } from "../src/index";
import { Box, Masked, Newline, Spacer, Text, Transform } from "../src/index";
import { tick } from "./tick";

const WIDTH = 24;
const HEIGHT = 6;

async function reactSvg(): Promise<string> {
  const styles = new StyleTable();
  const surface = new SvgCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width: WIDTH, height: HEIGHT } });
  root.render(
    h(
      RBox,
      { flexDirection: "column", border: "thick", width: WIDTH, height: HEIGHT },
      h(RBox, { flexDirection: "row" }, h(RText, { blink: true }, "L"), h(RSpacer), h(RMasked, { value: "pw" })),
      h(RNewline, { count: 1 }),
      h(RTransform, { transform: (line: string) => line.toUpperCase() }, "done"),
    ),
  );
  await tick();
  const svg = surface.toSVG();
  root.destroy();
  if (!svg) throw new Error("react: no frame presented");
  return svg;
}

async function solidSvg(): Promise<string> {
  const styles = new StyleTable();
  const surface = new SvgCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width: WIDTH, height: HEIGHT } });
  root.render(() => (
    <Box flexDirection="column" border="thick" width={WIDTH} height={HEIGHT}>
      <Box flexDirection="row">
        <Text blink>L</Text>
        <Spacer />
        <Masked value="pw" />
      </Box>
      <Newline count={1} />
      <Transform transform={(line) => line.toUpperCase()}>done</Transform>
    </Box>
  ));
  await tick();
  const svg = surface.toSVG();
  root.destroy();
  if (!svg) throw new Error("solid: no frame presented");
  return svg;
}

describe("Phase 2 primitives — React vs Solid parity", () => {
  it("renders a byte-identical SVG from both bindings", async () => {
    const [react, solid] = [await reactSvg(), await solidSvg()];
    expect(solid).toBe(react);
  });
});
