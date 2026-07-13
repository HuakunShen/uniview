import { describe, expect, it } from "vitest";
import { graphemesOf, unicodeWidth } from "../../src/text/graphemes";

describe("graphemesOf", () => {
  it("splits ASCII into one grapheme per character", () => {
    expect([...graphemesOf("abc")]).toEqual(["a", "b", "c"]);
  });

  it("keeps a ZWJ emoji family as a single grapheme cluster", () => {
    expect([...graphemesOf("👨‍👩‍👧‍👦")]).toEqual(["👨‍👩‍👧‍👦"]);
  });

  it("keeps a base + combining mark as a single grapheme cluster", () => {
    // "e" + combining acute accent
    expect([...graphemesOf("é")]).toEqual(["é"]);
  });

  it("keeps a regional-indicator flag as a single grapheme cluster", () => {
    expect([...graphemesOf("🇯🇵")]).toEqual(["🇯🇵"]);
  });
});

describe("unicodeWidth", () => {
  it("reports width 1 for ASCII", () => {
    expect(unicodeWidth("a")).toBe(1);
  });

  it("reports width 2 for CJK ideographs", () => {
    expect(unicodeWidth("中")).toBe(2);
    expect(unicodeWidth("あ")).toBe(2);
    expect(unicodeWidth("한")).toBe(2);
  });

  it("reports width 2 for a fullwidth form", () => {
    expect(unicodeWidth("Ａ")).toBe(2);
  });

  it("reports width 2 for emoji presentation", () => {
    expect(unicodeWidth("😀")).toBe(2);
    expect(unicodeWidth("👨‍👩‍👧‍👦")).toBe(2);
  });

  it("reports width 2 for a text symbol forced to emoji with VS16", () => {
    // U+2764 HEAVY BLACK HEART + VS16 -> emoji, width 2
    expect(unicodeWidth("❤️")).toBe(2);
  });

  it("reports width 2 for a regional-indicator flag", () => {
    expect(unicodeWidth("🇯🇵")).toBe(2);
  });

  it("reports width 0 for a lone combining mark", () => {
    expect(unicodeWidth("́")).toBe(0);
  });

  it("reports width 0 for a zero-width space and ZWJ", () => {
    expect(unicodeWidth("​")).toBe(0);
    expect(unicodeWidth("‍")).toBe(0);
  });

  it("reports width 0 for the empty string", () => {
    expect(unicodeWidth("")).toBe(0);
  });

  it("counts a base grapheme with a combining mark as the base width", () => {
    expect(unicodeWidth("é")).toBe(1);
    expect(unicodeWidth("中́")).toBe(2);
  });
});
