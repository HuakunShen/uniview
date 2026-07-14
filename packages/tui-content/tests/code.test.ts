import { describe, expect, it } from "vitest";
import {
  defaultSyntaxTheme,
  frameToLines,
  renderToBuffer,
  StyleTable,
  styleForScope,
} from "@uniview/tui-core";
import { renderCode } from "../src/code";

function paint(node: ReturnType<typeof renderCode>, width: number, height: number) {
  const styles = new StyleTable();
  const { buffer } = renderToBuffer(node, { width, height }, styles);
  return { styles, buffer, lines: frameToLines(buffer, { trimRight: true }) };
}

describe("renderCode", () => {
  it("renders highlighted code as a paintable column", () => {
    const node = renderCode("const x = 1", { lang: "typescript" });
    const { styles, buffer, lines } = paint(node, 20, 1);
    expect(lines).toEqual(["const x = 1"]);
    expect(styles.get(buffer.cellAt(0, 0).styleId)).toEqual(
      styleForScope(defaultSyntaxTheme, "keyword"),
    );
  });

  it("adds a right-aligned line-number gutter when requested", () => {
    const node = renderCode("a\nbb\nccc", { lineNumbers: true });
    const { lines } = paint(node, 20, 3);
    expect(lines).toEqual(["1 a", "2 bb", "3 ccc"]);
  });

  it("pads the gutter to the widest line number", () => {
    const code = Array.from({ length: 10 }, (_, i) => `x${i}`).join("\n");
    const node = renderCode(code, { lineNumbers: true });
    const { lines } = paint(node, 20, 10);
    expect(lines[0]).toBe(" 1 x0");
    expect(lines[9]).toBe("10 x9");
  });

  it("honors a custom start line", () => {
    const node = renderCode("here", { lineNumbers: true, startLine: 42 });
    const { lines } = paint(node, 20, 1);
    expect(lines[0]).toBe("42 here");
  });
});
