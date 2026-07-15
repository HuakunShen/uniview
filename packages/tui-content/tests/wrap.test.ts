import { describe, expect, it } from "vitest";
import { styledLineText } from "@uniview/tui-core";
import { wrapStyledSpans } from "../src/wrap";

describe("wrapStyledSpans", () => {
  it("wraps plain text on word boundaries to fit the width", () => {
    const lines = wrapStyledSpans([{ text: "the quick brown fox" }], 9);
    expect(lines.map(styledLineText)).toEqual(["the quick", "brown fox"]);
  });

  it("preserves the span style on every wrapped line", () => {
    const lines = wrapStyledSpans([{ text: "aaa bbb ccc", style: { bold: true } }], 3);
    expect(lines.map(styledLineText)).toEqual(["aaa", "bbb", "ccc"]);
    for (const line of lines) {
      expect(line.every((s) => s.style?.bold === true)).toBe(true);
    }
  });

  it("keeps a mid-word style change in one word, hard-breaking only when needed", () => {
    const spans = [
      { text: "foo", style: { bold: true } },
      { text: "bar", style: {} },
    ];
    // fits on one line: single visual word "foobar"
    expect(wrapStyledSpans(spans, 10).map(styledLineText)).toEqual(["foobar"]);
    // narrower than the word: hard-break at the cell boundary, styles intact
    const broken = wrapStyledSpans(spans, 3);
    expect(broken.map(styledLineText)).toEqual(["foo", "bar"]);
    expect(broken[0]![0]!.style?.bold).toBe(true);
    expect(broken[1]![0]!.style?.bold).toBeUndefined();
  });

  it("applies a hanging indent to continuation lines", () => {
    const lines = wrapStyledSpans([{ text: "alpha beta gamma" }], 8, { hangingIndent: 2 });
    // first line uses full width; continuations indented by 2
    expect(lines.map(styledLineText)).toEqual(["alpha", "  beta", "  gamma"]);
  });

  it("accounts for wide characters when measuring", () => {
    // each 你 is 2 cells wide; width 4 fits two per line
    const lines = wrapStyledSpans([{ text: "你好 世界" }], 4);
    expect(lines.map(styledLineText)).toEqual(["你好", "世界"]);
  });

  it("returns a single line when width is non-positive (no wrap)", () => {
    const spans = [{ text: "no wrap here" }];
    expect(wrapStyledSpans(spans, 0)).toEqual([spans]);
  });
});
