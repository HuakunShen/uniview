import { describe, expect, it } from "vitest";
import {
  defaultSyntaxTheme,
  frameToLines,
  renderToBuffer,
  StyleTable,
  styleForScope,
  type RenderNode,
} from "@uniview/tui-core";
import { renderMarkdown } from "../src/markdown";

function paint(node: RenderNode, width: number, height: number) {
  const styles = new StyleTable();
  const { buffer } = renderToBuffer(node, { width, height }, styles);
  return { styles, buffer, lines: frameToLines(buffer, { trimRight: true }) };
}

/** First row index whose text contains `needle`. */
function rowOf(lines: string[], needle: string): number {
  return lines.findIndex((l) => l.includes(needle));
}

describe("renderMarkdown", () => {
  it("renders headings and paragraphs with inline emphasis", () => {
    const node = renderMarkdown("# Hi\n\nsome **bold** and _em_ text", { width: 30 });
    const { lines, styles, buffer } = paint(node, 30, 4);
    expect(lines[0]).toBe("Hi");
    expect(lines[1]).toBe("");
    expect(lines[2]).toBe("some bold and em text");

    // heading is bold
    expect(styles.get(buffer.cellAt(0, 0).styleId).bold).toBe(true);
    // "bold" (starts at col 5 of "some bold...") is bold
    expect(styles.get(buffer.cellAt(5, 2).styleId).bold).toBe(true);
    // "em" (after "some bold and ", col 14) is italic
    expect(styles.get(buffer.cellAt(14, 2).styleId).italic).toBe(true);
  });

  it("renders unordered and ordered lists, including nesting", () => {
    const { lines } = paint(
      renderMarkdown("- a\n- b\n  - c\n\n1. x\n2. y", { width: 20 }),
      20,
      8,
    );
    expect(lines[0]).toBe("• a");
    expect(lines[1]).toBe("• b");
    expect(lines[2]).toBe("  • c");
    expect(lines[3]).toBe("");
    expect(lines[4]).toBe("1. x");
    expect(lines[5]).toBe("2. y");
  });

  it("renders a blockquote with a bar prefix", () => {
    const { lines } = paint(renderMarkdown("> hello there", { width: 20 }), 20, 2);
    expect(lines[0]).toBe("│ hello there");
  });

  it("renders inline code and links", () => {
    const node = renderMarkdown("run `build()` on [site](http://x)", { width: 40 });
    const { lines, styles, buffer } = paint(node, 40, 2);
    expect(lines[0]).toBe("run build() on site");
    // inline code fg == string scope color
    const codeCell = buffer.cellAt(4, 0); // "build()" starts at col 4
    expect(styles.get(codeCell.styleId).fg).toEqual(styleForScope(defaultSyntaxTheme, "string").fg);
    // link is underlined
    const linkCol = "run build() on ".length;
    expect(styles.get(buffer.cellAt(linkCol, 0).styleId).underline).toBe(true);
  });

  it("renders a fenced code block, syntax-highlighted, behind a bar", () => {
    const md = "text\n\n```ts\nconst x = 1\n```";
    const node = renderMarkdown(md, { width: 40 });
    const { lines, styles, buffer } = paint(node, 40, 6);
    const row = rowOf(lines, "const x = 1");
    expect(row).toBeGreaterThan(0);
    expect(lines[row]).toBe("│ const x = 1");
    // "const" keyword is colored (bar is 2 cells, so const starts at col 2)
    expect(styles.get(buffer.cellAt(2, row).styleId).fg).toEqual(
      styleForScope(defaultSyntaxTheme, "keyword").fg,
    );
  });

  it("word-wraps long paragraphs to the given width", () => {
    const node = renderMarkdown("the quick brown fox jumps", { width: 10 });
    const { lines } = paint(node, 10, 4);
    expect(lines[0]).toBe("the quick");
    expect(lines.join("\n")).toContain("brown fox");
  });

  it("renders a GFM table with aligned columns", () => {
    const md = "| Name | Qty |\n|------|-----|\n| eggs | 12 |\n| milk | 1 |";
    const { lines } = paint(renderMarkdown(md, { width: 40 }), 40, 5);
    // header, separator, two rows
    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("Qty");
    expect(lines[1]).toMatch(/^[─┼-]+/);
    expect(rowOf(lines, "eggs")).toBeGreaterThan(1);
    expect(rowOf(lines, "milk")).toBeGreaterThan(1);
  });
});
