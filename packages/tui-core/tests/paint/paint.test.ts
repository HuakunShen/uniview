import { describe, expect, it } from "vitest";
import { frameToLines } from "../../src/buffer/frame";
import { StyleTable } from "../../src/style/style-table";
import { renderToBuffer, type RenderNode } from "../../src/paint/paint";

function render(root: RenderNode, width: number, height: number) {
  const styles = new StyleTable();
  return { styles, ...renderToBuffer(root, { width, height }, styles) };
}

describe("renderToBuffer — text", () => {
  it("paints a text leaf at its laid-out position", () => {
    const { buffer } = render({ type: "text", text: "hi" }, 5, 1);
    expect(frameToLines(buffer, { trimRight: true })).toEqual(["hi"]);
  });

  it("stacks text children of a column", () => {
    const { buffer } = render(
      {
        type: "box",
        style: { flexDirection: "column" },
        children: [
          { type: "text", text: "one" },
          { type: "text", text: "two" },
        ],
      },
      5,
      2,
    );
    expect(frameToLines(buffer, { trimRight: true })).toEqual(["one", "two"]);
  });

  it("clips text to the width of its box", () => {
    const { buffer } = render(
      { type: "text", text: "hello", style: { width: 3, height: 1 } },
      10,
      1,
    );
    expect(frameToLines(buffer, { trimRight: true })).toEqual(["hel"]);
  });

  it("marks text and rich text selectable without marking layout or opted-out text", () => {
    const { buffer } = render(
      {
        type: "box",
        style: { flexDirection: "column" },
        children: [
          { type: "text", text: "copy" },
          { type: "richtext", spans: [{ text: "rich" }] },
          { type: "text", text: "secret", selectable: false },
        ],
      },
      8,
      4,
    );

    expect([...buffer.selectable.slice(0, 4)]).toEqual([1, 1, 1, 1]);
    expect([...buffer.selectable.slice(8, 12)]).toEqual([1, 1, 1, 1]);
    expect([...buffer.selectable.slice(16, 22)]).toEqual([0, 0, 0, 0, 0, 0]);
    expect(buffer.cellAt(7, 0).selectable).toBe(false);
  });
});

describe("renderToBuffer — overflow and scroll", () => {
  it("allows visible content to paint outside its box", () => {
    const { buffer } = render(
      {
        type: "box",
        style: { width: 5, height: 2, overflow: "visible" },
        children: [
          {
            type: "text",
            text: "visible",
            style: { position: "absolute", top: 2, left: 0, width: 5, height: 1 },
          },
        ],
      },
      5,
      4,
    );

    expect(frameToLines(buffer, { trimRight: true })).toEqual(["", "", "visib", ""]);
  });

  it("clips hidden content to its box", () => {
    const { buffer } = render(
      {
        type: "box",
        style: { width: 5, height: 2, overflow: "hidden" },
        children: [
          {
            type: "text",
            text: "hidden",
            style: { position: "absolute", top: 2, left: 0, width: 5, height: 1 },
          },
        ],
      },
      5,
      4,
    );

    expect(frameToLines(buffer, { trimRight: true })).toEqual(["", "", "", ""]);
  });

  it("keeps the border fixed while scrolling descendants", () => {
    const { buffer } = render(
      {
        type: "box",
        style: { border: "single", width: 8, height: 5, overflow: "scroll", scrollTop: 2 },
        children: Array.from({ length: 5 }, (_, i) => ({ type: "text", text: "row-" + i })),
      },
      8,
      5,
    );

    const lines = frameToLines(buffer);
    expect(lines[0]).toBe("┌──────┐");
    expect(lines[1]).toContain("row-2");
    expect(lines[3]).toContain("row-4");
    expect(lines[4]).toBe("└──────┘");
  });
});

describe("renderToBuffer — background", () => {
  it("fills the box region with the background style", () => {
    const { buffer, styles } = render(
      { type: "box", background: "red", style: { width: 3, height: 2 } },
      5,
      3,
    );
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 3; x += 1) {
        const cell = buffer.cellAt(x, y);
        expect(styles.get(cell.styleId)).toEqual({ bg: "red" });
      }
    }
    // outside the box stays default
    expect(buffer.cellAt(3, 0).styleId).toBe(0);
  });
});

describe("renderToBuffer — border", () => {
  it("draws a single-line border and keeps content inside", () => {
    const { buffer } = render(
      {
        type: "box",
        style: { border: "single", width: 5, height: 3 },
        children: [{ type: "text", text: "x" }],
      },
      5,
      3,
    );
    const lines = frameToLines(buffer);
    expect(lines[0]).toBe("┌───┐");
    expect(lines[1]).toBe("│x  │");
    expect(lines[2]).toBe("└───┘");
    expect(buffer.cellAt(0, 0).selectable).toBe(false);
    expect(buffer.cellAt(1, 1).selectable).toBe(true);
  });

  it("supports the rounded preset", () => {
    const { buffer } = render(
      { type: "box", style: { border: "rounded", width: 3, height: 3 } },
      3,
      3,
    );
    const lines = frameToLines(buffer);
    expect(lines[0]).toBe("╭─╮");
    expect(lines[2]).toBe("╰─╯");
  });
});

describe("renderToBuffer — owners (hit-testing source)", () => {
  it("stamps each painted cell with its node's owner id", () => {
    const { buffer, owners } = render(
      { type: "text", id: "greeting", text: "hi" },
      5,
      1,
    );
    const ownerId = buffer.cellAt(0, 0).ownerId;
    expect(ownerId).not.toBe(0);
    expect(owners.idOf(ownerId)).toBe("greeting");
  });

  it("lets children own their cells over the parent", () => {
    const { buffer, owners } = render(
      {
        type: "box",
        id: "panel",
        background: "blue",
        style: { width: 4, height: 1 },
        children: [{ type: "text", id: "label", text: "hi" }],
      },
      4,
      1,
    );
    expect(owners.idOf(buffer.cellAt(0, 0).ownerId)).toBe("label");
    // a cell not covered by the child still belongs to the panel
    expect(owners.idOf(buffer.cellAt(3, 0).ownerId)).toBe("panel");
  });
});
