import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { MemoryCellSurface, StyleTable, renderSvg } from "@uniview/tui-core";
import { createTuiReactRoot, ErrorOverview as ReactErrorOverview } from "@uniview/tui-react";
import { createTuiSolidRoot, ErrorOverview as SolidErrorOverview } from "../src/index";
import { tick } from "./tick";

const SIZE = { width: 30, height: 6 };

describe("ErrorOverview — React vs Solid parity", () => {
  it("renders byte-identical SVG for the same error", async () => {
    const error = new Error("kaboom");

    const rStyles = new StyleTable();
    const rSurface = new MemoryCellSurface({ styles: rStyles });
    const rRoot = createTuiReactRoot({ surface: rSurface, styles: rStyles, size: SIZE });
    rRoot.render(h(ReactErrorOverview, { error }));
    await tick();
    const rFrame = rSurface.lastFrame;
    if (!rFrame) throw new Error("no React frame");
    const reactSvg = renderSvg(rFrame, rStyles);

    const sStyles = new StyleTable();
    const sSurface = new MemoryCellSurface({ styles: sStyles });
    const sRoot = createTuiSolidRoot({ surface: sSurface, styles: sStyles, size: SIZE });
    sRoot.render(() => SolidErrorOverview({ error }));
    const sFrame = sSurface.lastFrame;
    if (!sFrame) throw new Error("no Solid frame");
    const solidSvg = renderSvg(sFrame, sStyles);

    expect(solidSvg).toBe(reactSvg);
    rRoot.destroy();
    sRoot.destroy();
  });
});
