import { describe, expect, it } from "vitest";
import { createElement as h, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot, ErrorBoundary, ErrorOverview } from "../src/index";
import { tick } from "./tick";

function Boom(): ReactElement {
  throw new Error("kaboom");
}

describe("tui-react ErrorBoundary", () => {
  it("renders the overlay for a thrown child and paints a complete frame", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 30, height: 6 } });
    root.render(
      h(ErrorBoundary, { fallback: (err: unknown) => h(ErrorOverview, { error: err }) }, h(Boom)),
    );
    await tick();

    // The overlay reached the surface...
    expect(surface.text()).toContain("kaboom");
    // ...and the surface holds a full frame (not left mid-render/blank).
    const frame = surface.lastFrame;
    if (!frame) throw new Error("surface was left without a frame");
    expect(frame.height).toBe(6);
    root.destroy();
  });
});
