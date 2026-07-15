import { describe, expect, it } from "vitest";
import { defaultTheme, themeSpacing } from "../../src/theme/theme";

describe("defaultTheme", () => {
  it("provides the core color tokens", () => {
    expect(defaultTheme.name).toBe("uniview-dark");
    expect(defaultTheme.colors.primary).toEqual({ r: 0, g: 122, b: 204 });
    expect(defaultTheme.borders.rounded?.topLeft).toBe("╭");
    expect(defaultTheme.borders.none).toBeNull();
  });
});

describe("themeSpacing", () => {
  it("looks up the spacing scale, clamped", () => {
    expect(themeSpacing(defaultTheme, 0)).toBe(0);
    expect(themeSpacing(defaultTheme, 2)).toBe(2);
    expect(themeSpacing(defaultTheme, 99)).toBe(4); // clamps to the last step
  });
});
