import { describe, expect, it } from "vitest";
import { renderCanvas } from "../../src/canvas/draw";
import { drawWorldMap, WORLD_MAP_POINTS } from "../../src/canvas/world-map";
import { styledLineText } from "../../src/text/styled-text";

describe("drawWorldMap", () => {
  it("plots dots inside the grid for lon/lat bounds", () => {
    const node = renderCanvas(
      { width: 30, height: 12, marker: "dot", xBounds: [-180, 180], yBounds: [-90, 90] },
      (cv) => drawWorldMap(cv, { color: "green" }),
    );
    const painted = (node.children ?? []).map((c) => styledLineText(c.spans!)).join("\n");
    expect([...painted].some((ch) => ch === "•")).toBe(true);
    expect(WORLD_MAP_POINTS.length).toBeGreaterThan(0);
  });

  it("stays within the grid (no throw, exactly `height` rows)", () => {
    const node = renderCanvas({ width: 20, height: 8, xBounds: [-180, 180], yBounds: [-90, 90] }, (cv) =>
      drawWorldMap(cv),
    );
    expect((node.children ?? []).length).toBe(8);
  });
});
