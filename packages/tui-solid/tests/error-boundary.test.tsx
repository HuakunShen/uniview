import { describe, expect, it } from "vitest";
import type { JSX } from "solid-js";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiSolidRoot, TuiErrorBoundary, ErrorOverview } from "../src/index";

function Boom(): JSX.Element {
  throw new Error("kaboom");
}

describe("tui-solid ErrorBoundary", () => {
  it("renders the overlay for a thrown child and paints a complete frame", () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 30, height: 6 } });
    root.render(() => (
      <TuiErrorBoundary fallback={(err) => <ErrorOverview error={err} />}>
        <Boom />
      </TuiErrorBoundary>
    ));

    expect(surface.text()).toContain("kaboom");
    const frame = surface.lastFrame;
    if (!frame) throw new Error("surface was left without a frame");
    expect(frame.height).toBe(6);
    root.destroy();
  });
});
