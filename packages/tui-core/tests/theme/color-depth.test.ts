import { describe, expect, it } from "vitest";
import {
  nearestNamedColor,
  rgbToAnsi256,
} from "../../src/theme/color-depth";

describe("nearestNamedColor", () => {
  it("maps pure primaries to their bright tokens", () => {
    expect(nearestNamedColor({ r: 255, g: 0, b: 0 })).toBe("brightred");
    expect(nearestNamedColor({ r: 0, g: 255, b: 0 })).toBe("brightgreen");
    // pure blue is closest to #0000ee ("blue"), not #5c5cff ("brightblue")
    expect(nearestNamedColor({ r: 0, g: 0, b: 255 })).toBe("blue");
  });

  it("maps dim primaries to their base tokens", () => {
    expect(nearestNamedColor({ r: 205, g: 0, b: 0 })).toBe("red");
    expect(nearestNamedColor({ r: 0, g: 205, b: 0 })).toBe("green");
  });

  it("maps black, white and mid-gray", () => {
    expect(nearestNamedColor({ r: 0, g: 0, b: 0 })).toBe("black");
    expect(nearestNamedColor({ r: 255, g: 255, b: 255 })).toBe("brightwhite");
    expect(nearestNamedColor({ r: 127, g: 127, b: 127 })).toBe("brightblack");
  });

  it("is deterministic", () => {
    const c = { r: 100, g: 150, b: 200 };
    expect(nearestNamedColor(c)).toBe(nearestNamedColor(c));
  });
});

describe("rgbToAnsi256", () => {
  it("maps the color cube corners", () => {
    expect(rgbToAnsi256({ r: 0, g: 0, b: 0 })).toBe(16);
    expect(rgbToAnsi256({ r: 255, g: 255, b: 255 })).toBe(231);
  });

  it("maps grays to the grayscale ramp", () => {
    const mid = rgbToAnsi256({ r: 128, g: 128, b: 128 });
    expect(mid).toBeGreaterThanOrEqual(232);
    expect(mid).toBeLessThanOrEqual(255);
  });

  it("maps pure red into the cube region", () => {
    expect(rgbToAnsi256({ r: 255, g: 0, b: 0 })).toBe(196);
  });
});
