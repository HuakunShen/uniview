import { describe, expect, test } from "vitest";
import { darkTheme, defaultTheme } from "../src";

describe("theme", () => {
  test("spacing scale is Tailwind-like (n → n*4)", () => {
    expect(defaultTheme.spacing(0)).toBe(0);
    expect(defaultTheme.spacing(4)).toBe(16);
    expect(defaultTheme.spacing(2)).toBe(8);
  });

  test("default theme exposes core color tokens", () => {
    expect(defaultTheme.colors.background).toBe("#ffffff");
    expect(defaultTheme.colors.primary).toBe("#0a84ff");
    expect(defaultTheme.colors.border).toBeDefined();
  });

  test("radii include a default", () => {
    expect(defaultTheme.radii.default).toBe(6);
    expect(defaultTheme.radii.full).toBe(9999);
  });

  test("dark theme overrides background/foreground but keeps primary", () => {
    expect(darkTheme.colors.background).toBe("#1e1e1e");
    expect(darkTheme.colors.foreground).toBe("#f5f5f7");
    expect(darkTheme.colors.primary).toBe(defaultTheme.colors.primary);
  });
});
