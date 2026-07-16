import { describe, expect, it } from "vitest";
import { renderCanvas, type Marker } from "../../src/canvas/draw";
import { dataToPixel } from "../../src/canvas/coords";
import { styledLineText } from "../../src/text/styled-text";

const BRAILLE = /[⠀-⣿]/;

const text = (node: ReturnType<typeof renderCanvas>): string =>
  (node.children ?? []).map((c) => styledLineText(c.spans!)).join("\n");

const glyphCount = (node: ReturnType<typeof renderCanvas>, glyph: string): number =>
  [...text(node)].filter((ch) => ch === glyph).length;

describe("renderCanvas structure", () => {
  it("returns a column box of richtext lines (charts' output path)", () => {
    const node = renderCanvas({ width: 4, height: 2 }, (cv) => cv.line(0, 0, 7, 7));
    expect(node.type).toBe("box");
    expect(node.style?.flexDirection).toBe("column");
    expect(node.children).toHaveLength(2); // one richtext leaf per cell row
    expect(node.children!.every((c) => c.type === "richtext")).toBe(true);
  });
});

describe("shapes", () => {
  it("draws a diagonal line as braille dots", () => {
    const node = renderCanvas({ width: 4, height: 2 }, (cv) => cv.line(0, 0, cv.widthPx - 1, cv.heightPx - 1));
    expect(BRAILLE.test(text(node))).toBe(true);
  });

  it("carries the caller-supplied color on the spans, none by default", () => {
    const colored = renderCanvas({ width: 4, height: 2 }, (cv) => cv.line(0, 0, 4, 4, { color: "red" }));
    const plain = renderCanvas({ width: 4, height: 2 }, (cv) => cv.line(0, 0, 4, 4));
    const fgs = (n: ReturnType<typeof renderCanvas>) => (n.children ?? []).flatMap((c) => c.spans!.map((s) => s.style?.fg));
    expect(fgs(colored)).toContain("red");
    expect(fgs(plain).every((fg) => fg === undefined)).toBe(true); // no invented color
  });

  it("fills a rectangle when fill is set (more ink than the outline)", () => {
    const outline = renderCanvas({ width: 6, height: 3, marker: "block" }, (cv) => cv.rect(0, 0, cv.widthPx, cv.heightPx));
    const filled = renderCanvas({ width: 6, height: 3, marker: "block" }, (cv) =>
      cv.rect(0, 0, cv.widthPx, cv.heightPx, { fill: true }),
    );
    expect(glyphCount(filled, "█")).toBeGreaterThan(glyphCount(outline, "█"));
    expect(glyphCount(outline, "█")).toBeGreaterThan(0);
  });

  it("fills a circle when fill is set", () => {
    const outline = renderCanvas({ width: 10, height: 10, marker: "block" }, (cv) =>
      cv.circle(cv.widthPx / 2, cv.heightPx / 2, 4),
    );
    const filled = renderCanvas({ width: 10, height: 10, marker: "block" }, (cv) =>
      cv.circle(cv.widthPx / 2, cv.heightPx / 2, 4, { fill: true }),
    );
    expect(glyphCount(filled, "█")).toBeGreaterThan(glyphCount(outline, "█"));
    expect(glyphCount(outline, "█")).toBeGreaterThan(0);
  });

  it("plots a batch of points", () => {
    const node = renderCanvas({ width: 4, height: 4, marker: "block" }, (cv) =>
      cv.points([
        [0, 0],
        [3, 3],
      ]),
    );
    expect(glyphCount(node, "█")).toBe(2);
  });
});

describe("marker families", () => {
  const dot = (marker: Marker): string =>
    text(renderCanvas({ width: 2, height: 2, marker }, (cv) => cv.set(0, 0, { color: "red" })));

  it("braille uses braille glyphs (2×4 per cell)", () => expect(BRAILLE.test(dot("braille"))).toBe(true));
  it("block uses a full block", () => expect(dot("block")).toContain("█"));
  it("dot uses a bullet", () => expect(dot("dot")).toContain("•"));
  it("half-block uses a half or full block (1×2 per cell)", () => expect(/[▀▄█]/.test(dot("half-block"))).toBe(true));
});

describe("DrawContext.project", () => {
  it("maps data space through the shared dataToPixel", () => {
    let seen: [number, number] | null = null;
    renderCanvas({ width: 4, height: 2, xBounds: [0, 10], yBounds: [0, 5] }, (cv) => {
      seen = cv.project(10, 5);
      expect(seen[0]).toBe(dataToPixel(10, [0, 10], cv.widthPx));
      expect(seen[1]).toBe(dataToPixel(5, [0, 5], cv.heightPx));
    });
    expect(seen).not.toBeNull();
  });
});
