import { describe, expect, it } from "vitest";
import {
  defaultSyntaxTheme,
  frameToLines,
  renderToBuffer,
  StyleTable,
  styleForScope,
  type RenderNode,
} from "@uniview/tui-core";
import { renderDiff } from "../src/diff";

const PATCH = `--- a/foo.ts
+++ b/foo.ts
@@ -1,3 +1,4 @@
 const a = 1
-const b = 2
+const b = 3
+const c = 4
 const d = 5
`;

function paint(node: RenderNode, width: number, height: number) {
  const styles = new StyleTable();
  const { buffer } = renderToBuffer(node, { width, height }, styles);
  return { styles, buffer, lines: frameToLines(buffer, { trimRight: true }) };
}
const rowOf = (lines: string[], needle: string) => lines.findIndex((l) => l.includes(needle));

describe("renderDiff", () => {
  it("lays out gutters, sign column and content per line", () => {
    const node = renderDiff(PATCH, { lang: "typescript", showFileHeader: false });
    const { lines } = paint(node, 40, 8);
    // hunk header first, then the lines
    expect(lines[0]).toContain("@@ -1,3 +1,4 @@");
    expect(lines[rowOf(lines, "const a = 1")]).toBe("1 1   const a = 1");
    expect(lines[rowOf(lines, "const b = 2")]).toBe("2   - const b = 2");
    expect(lines[rowOf(lines, "const b = 3")]).toBe("  2 + const b = 3");
  });

  it("bands added and removed lines with a background and colored sign", () => {
    const node = renderDiff(PATCH, { lang: "typescript", showFileHeader: false });
    const { lines, styles, buffer } = paint(node, 40, 8);

    const addRow = rowOf(lines, "const b = 3");
    const delRow = rowOf(lines, "const b = 2");
    // trailing cell (beyond content) carries the band background
    expect(styles.get(buffer.cellAt(38, addRow).styleId).bg).toBeDefined();
    expect(styles.get(buffer.cellAt(38, delRow).styleId).bg).toBeDefined();
    expect(styles.get(buffer.cellAt(38, addRow).styleId).bg).not.toEqual(
      styles.get(buffer.cellAt(38, delRow).styleId).bg,
    );
    // "+" / "-" signs carry the diff accent color
    expect(styles.get(buffer.cellAt(4, addRow).styleId).fg).toEqual(
      styleForScope(defaultSyntaxTheme, "addition").fg,
    );
    expect(styles.get(buffer.cellAt(4, delRow).styleId).fg).toEqual(
      styleForScope(defaultSyntaxTheme, "deletion").fg,
    );
  });

  it("syntax-highlights the diff content", () => {
    const node = renderDiff(PATCH, { lang: "typescript", showFileHeader: false });
    const { lines, styles, buffer } = paint(node, 40, 8);
    const addRow = rowOf(lines, "const b = 3");
    // content starts at col 6 ("  2 + "); "const" keyword is colored
    expect(styles.get(buffer.cellAt(6, addRow).styleId).fg).toEqual(
      styleForScope(defaultSyntaxTheme, "keyword").fg,
    );
  });

  it("shows a file header by default", () => {
    const { lines } = paint(renderDiff(PATCH, { lang: "typescript" }), 40, 9);
    expect(lines[0]).toContain("foo.ts");
  });

  it("widens the gutter for large line numbers", () => {
    const patch = `--- a/x\n+++ b/x\n@@ -9,2 +9,2 @@\n context\n-old\n+new\n`;
    const { lines } = paint(renderDiff(patch, { showFileHeader: false, showHunkHeader: false }), 40, 4);
    // line 10 appears → gutter width 2
    expect(lines[rowOf(lines, "context")]).toBe(" 9  9   context");
  });
});
