import { describe, expect, it } from "vitest";
import { tailwindPalette } from "../src/palette";
import { readTailwindFamilies, SHADES } from "../scripts/tailwind-source.mjs";

/**
 * The palette is committed as literal hex (`@uniview/style` must not depend on
 * Tailwind at runtime — it ships to Workers and to Node), so nothing stops it
 * from drifting away from the Tailwind everyone else in the repo renders with.
 *
 * This is the thing that stops it. When it fails, run:
 *   pnpm --filter @uniview/style gen:palette
 */
describe("the committed palette is the installed Tailwind's palette", () => {
  const families = readTailwindFamilies();

  it("reads a real palette out of tailwindcss (the test itself isn't vacuous)", () => {
    expect(Object.keys(families).length).toBeGreaterThan(20);
  });

  it.each(Object.keys(families))("%s matches shade for shade", (family) => {
    const expected = Object.fromEntries(
      SHADES.map((shade, i) => [`${family}-${shade}`, families[family][i]]),
    );
    const actual = Object.fromEntries(
      SHADES.map((shade) => [`${family}-${shade}`, tailwindPalette[`${family}-${shade}`]]),
    );
    expect(actual).toEqual(expected);
  });

  it("keeps the non-family keywords", () => {
    expect(tailwindPalette.white).toBe("#ffffff");
    expect(tailwindPalette.black).toBe("#000000");
    expect(tailwindPalette.transparent).toBe("transparent");
  });
});
