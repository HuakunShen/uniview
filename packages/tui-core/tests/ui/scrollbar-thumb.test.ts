import { describe, expect, it } from "vitest";
import { scrollbarThumb } from "../../src/index";

describe("scrollbarThumb", () => {
  it("fills the whole track when content fits", () => {
    expect(scrollbarThumb(4, 10, 0)).toEqual({ start: 0, thumb: 10 });
  });

  it("sizes the thumb proportionally and never below 1", () => {
    // height^2 / total = 100/100 = 1
    expect(scrollbarThumb(100, 10, 0)).toEqual({ start: 0, thumb: 1 });
  });

  it("positions the thumb by scroll fraction", () => {
    // total 20, height 10 → thumb = round(100/20) = 5; maxScroll = 10.
    // value 10 → start = round((10/10) * (10-5)) = 5.
    expect(scrollbarThumb(20, 10, 10)).toEqual({ start: 5, thumb: 5 });
    expect(scrollbarThumb(20, 10, 0)).toEqual({ start: 0, thumb: 5 });
  });
});
