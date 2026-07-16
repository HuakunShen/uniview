import { describe, expect, it } from "vitest";
import { textInputSlices } from "../../src/index";

describe("textInputSlices", () => {
  it("puts the caret at end-of-value by default", () => {
    expect(textInputSlices("hi", {})).toEqual({ head: "hi", caret: " ", tail: "", placeholder: false });
  });

  it("splits around a controlled mid-string caret", () => {
    expect(textInputSlices("hello", { cursor: 2 })).toEqual({ head: "he", caret: "l", tail: "lo", placeholder: false });
  });

  it("masks the display but never the slices' source value", () => {
    expect(textInputSlices("ab", { mask: true, cursor: 1 })).toEqual({ head: "•", caret: "•", tail: "", placeholder: false });
  });

  it("marks placeholder mode for an empty value", () => {
    expect(textInputSlices("", { placeholder: "name" })).toEqual({ head: "name", caret: " ", tail: "", placeholder: true });
  });

  it("drops the caret cell when showCursor is false", () => {
    expect(textInputSlices("hi", { showCursor: false })).toEqual({ head: "hi", caret: "", tail: "", placeholder: false });
  });
});
