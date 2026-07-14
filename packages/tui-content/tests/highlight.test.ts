import { describe, expect, it } from "vitest";
import { defaultSyntaxTheme, styleForScope, styledLineText } from "@uniview/tui-core";
import { highlightToLines } from "../src/highlight";

const theme = defaultSyntaxTheme;

describe("highlightToLines", () => {
  it("classifies keyword / string / comment in typescript", () => {
    const lines = highlightToLines('const x = "hi" // c', { lang: "typescript", theme });
    expect(lines).toHaveLength(1);
    const line = lines[0]!;

    expect(line.find((s) => s.text === "const")?.style).toEqual(
      styleForScope(theme, "keyword"),
    );
    expect(line.find((s) => s.text.includes('"hi"'))?.style).toEqual(
      styleForScope(theme, "string"),
    );
    expect(line.find((s) => s.text.includes("// c"))?.style).toEqual(
      styleForScope(theme, "comment"),
    );
    // plain text between tokens is preserved verbatim
    expect(styledLineText(line)).toBe('const x = "hi" // c');
  });

  it("splits multi-line code into one StyledLine per source line", () => {
    const lines = highlightToLines("const a = 1\nconst b = 2", {
      lang: "javascript",
      theme,
    });
    expect(lines).toHaveLength(2);
    expect(styledLineText(lines[0]!)).toBe("const a = 1");
    expect(styledLineText(lines[1]!)).toBe("const b = 2");
  });

  it("highlights JSON keys, strings and numbers", () => {
    const lines = highlightToLines('{ "a": 1, "b": "x" }', { lang: "json", theme });
    const flat = lines.flat();
    expect(flat.find((s) => s.text === "1")?.style).toEqual(styleForScope(theme, "number"));
    expect(flat.find((s) => s.text.includes('"x"'))?.style).toEqual(
      styleForScope(theme, "string"),
    );
  });

  it("highlights a python def keyword and number", () => {
    const lines = highlightToLines("def f():\n    return 42", { lang: "python", theme });
    const flat = lines.flat();
    expect(flat.find((s) => s.text === "def")?.style).toEqual(styleForScope(theme, "keyword"));
    expect(flat.find((s) => s.text === "42")?.style).toEqual(styleForScope(theme, "number"));
  });

  it("falls back to a single plain-text run for an unknown language", () => {
    const lines = highlightToLines("plain text here", { lang: "made-up-lang", theme });
    expect(lines).toEqual([[{ text: "plain text here", style: styleForScope(theme, "text") }]]);
  });

  it("preserves indentation and blank lines", () => {
    const lines = highlightToLines("if (x) {\n\n  y()\n}", { lang: "javascript", theme });
    expect(lines).toHaveLength(4);
    expect(styledLineText(lines[1]!)).toBe("");
    expect(styledLineText(lines[2]!)).toBe("  y()");
  });
});
