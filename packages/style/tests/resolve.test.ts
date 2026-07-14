import { describe, expect, test } from "vitest";
import {
  defaultTheme,
  normalizeStyleInput,
  resolveClassName,
  resolveStyle,
} from "../src";

describe("resolveClassName — flex", () => {
  test("`flex` means a ROW, matching CSS's default flex-direction", () => {
    // Yoga's default direction is column, CSS's `display:flex` default is row.
    // Without this, `<div className="flex gap-2">` (a button row) would stack
    // vertically on a native host.
    expect(resolveClassName("flex")).toMatchObject({ flexDirection: "row" });
    expect(resolveClassName("flex gap-2")).toMatchObject({
      flexDirection: "row",
      gap: 8,
    });
  });

  test("`flex-col` overrides the `flex` row default", () => {
    expect(resolveClassName("flex flex-col")).toMatchObject({
      flexDirection: "column",
    });
  });

  test("a class-less box has no direction — the engine default (column) stacks it", () => {
    expect(resolveClassName("p-4")).not.toHaveProperty("flexDirection");
  });

  test("wrap, grow, shrink, flex-1", () => {
    expect(resolveClassName("flex-wrap")).toMatchObject({ flexWrap: "wrap" });
    expect(resolveClassName("shrink-0")).toMatchObject({ flexShrink: 0 });
    expect(resolveClassName("flex-1")).toMatchObject({
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
    });
  });

  test("alignment", () => {
    expect(resolveClassName("items-center")).toMatchObject({
      alignItems: "center",
    });
    expect(resolveClassName("justify-between")).toMatchObject({
      justifyContent: "space-between",
    });
  });
});

describe("resolveClassName — spacing", () => {
  test("gap and padding use the spacing scale", () => {
    expect(resolveClassName("gap-4")).toMatchObject({ gap: 16 });
    expect(resolveClassName("p-6")).toMatchObject({
      paddingTop: 24,
      paddingRight: 24,
      paddingBottom: 24,
      paddingLeft: 24,
    });
    expect(resolveClassName("px-2 py-1")).toMatchObject({
      paddingLeft: 8,
      paddingRight: 8,
      paddingTop: 4,
      paddingBottom: 4,
    });
    expect(resolveClassName("pt-3")).toMatchObject({ paddingTop: 12 });
  });

  test("fractional spacing tokens (Tailwind's 0.5 step)", () => {
    expect(resolveClassName("mt-0.5")).toMatchObject({ marginTop: 2 });
    expect(resolveClassName("gap-1.5")).toMatchObject({ gap: 6 });
  });

  test("`space-y-N` / `space-x-N` become gap", () => {
    // Tailwind implements these as margins between children; on a flex engine
    // `gap` is the equivalent, and every native container is a flex box.
    expect(resolveClassName("space-y-6")).toMatchObject({ gap: 24 });
    expect(resolveClassName("space-x-2")).toMatchObject({ gap: 8 });
    expect(resolveClassName("space-y-0.5")).toMatchObject({ gap: 2 });
  });

  test("margins, including auto", () => {
    expect(resolveClassName("m-2")).toMatchObject({
      marginTop: 8,
      marginRight: 8,
      marginBottom: 8,
      marginLeft: 8,
    });
    expect(resolveClassName("mx-auto")).toMatchObject({
      marginLeft: "auto",
      marginRight: "auto",
    });
  });
});

describe("resolveClassName — sizing", () => {
  test("numeric, full, auto, and fractions", () => {
    expect(resolveClassName("w-10")).toMatchObject({ width: 40 });
    expect(resolveClassName("h-2 w-2")).toMatchObject({ width: 8, height: 8 });
    expect(resolveClassName("w-full")).toMatchObject({ width: "100%" });
    expect(resolveClassName("h-auto")).toMatchObject({ height: "auto" });
    expect(resolveClassName("w-1/2")).toMatchObject({ width: "50%" });
  });

  test("named size tokens (`max-w-md`) come from the theme's size scale", () => {
    expect(resolveClassName("max-w-md")).toMatchObject({ maxWidth: 448 });
    expect(resolveClassName("max-w-lg")).toMatchObject({ maxWidth: 512 });
    // A bare number still means the spacing scale, not the size scale.
    expect(resolveClassName("max-w-20")).toMatchObject({ maxWidth: 80 });
  });
});

describe("resolveClassName — color", () => {
  test("the Tailwind palette resolves to hex", () => {
    expect(resolveClassName("bg-emerald-500")).toMatchObject({
      backgroundColor: "#10b981",
    });
    expect(resolveClassName("text-zinc-400")).toMatchObject({
      color: "#a1a1aa",
    });
    expect(resolveClassName("text-white")).toMatchObject({ color: "#ffffff" });
  });

  test("semantic theme tokens win over palette names", () => {
    expect(resolveClassName("bg-primary")).toMatchObject({
      backgroundColor: defaultTheme.colors.primary,
    });
  });

  test("the `/alpha` suffix becomes an 8-digit hex", () => {
    // #rrggbbaa is what the native hosts' color parsers already accept.
    expect(resolveClassName("bg-emerald-500/10")).toMatchObject({
      backgroundColor: "#10b9811a",
    });
    expect(resolveClassName("border-violet-500/20")).toMatchObject({
      borderColor: "#8b5cf633",
    });
  });
});

describe("resolveClassName — visual + typography", () => {
  test("border, rounded, opacity", () => {
    expect(resolveClassName("border")).toMatchObject({ borderWidth: 1 });
    expect(resolveClassName("border-2")).toMatchObject({ borderWidth: 2 });
    expect(resolveClassName("rounded")).toMatchObject({ borderRadius: 6 });
    expect(resolveClassName("rounded-lg")).toMatchObject({ borderRadius: 8 });
    expect(resolveClassName("rounded-full")).toMatchObject({
      borderRadius: 9999,
    });
    expect(resolveClassName("opacity-50")).toMatchObject({ opacity: 0.5 });
  });

  test("`border` + a border color compose", () => {
    expect(resolveClassName("border border-emerald-500/20")).toMatchObject({
      borderWidth: 1,
      borderColor: "#10b98133",
    });
  });

  test("font size, weight, align", () => {
    expect(resolveClassName("text-sm")).toMatchObject({ fontSize: 12 });
    expect(resolveClassName("text-2xl")).toMatchObject({ fontSize: 22 });
    expect(resolveClassName("font-semibold")).toMatchObject({
      fontWeight: "semibold",
    });
    expect(resolveClassName("text-center")).toMatchObject({
      textAlign: "center",
    });
  });
});

describe("resolveClassName — misc", () => {
  test("unknown classes are ignored, not thrown on", () => {
    expect(resolveClassName("hover:foo not-a-class tracking-tight")).toEqual(
      {},
    );
  });

  test("later classes override earlier ones", () => {
    expect(resolveClassName("flex-row flex-col")).toMatchObject({
      flexDirection: "column",
    });
  });

  test("the real demo root class string resolves end to end", () => {
    expect(resolveClassName("p-6 max-w-md mx-auto space-y-6")).toEqual({
      paddingTop: 24,
      paddingRight: 24,
      paddingBottom: 24,
      paddingLeft: 24,
      maxWidth: 448,
      marginLeft: "auto",
      marginRight: "auto",
      gap: 24,
    });
  });
});

describe("normalizeStyleInput", () => {
  test("expands padding shorthand into four edges", () => {
    expect(normalizeStyleInput({ padding: 8 })).toEqual({
      paddingTop: 8,
      paddingRight: 8,
      paddingBottom: 8,
      paddingLeft: 8,
    });
  });

  test("horizontal/vertical override the all-sides shorthand", () => {
    expect(normalizeStyleInput({ padding: 8, paddingHorizontal: 16 })).toEqual({
      paddingTop: 8,
      paddingBottom: 8,
      paddingLeft: 16,
      paddingRight: 16,
    });
  });

  test("an explicit edge overrides both shorthands", () => {
    expect(normalizeStyleInput({ padding: 8, paddingTop: 2 })).toEqual({
      paddingTop: 2,
      paddingRight: 8,
      paddingBottom: 8,
      paddingLeft: 8,
    });
  });

  test("passes non-shorthand fields through untouched", () => {
    expect(
      normalizeStyleInput({ flexDirection: "row", backgroundColor: "#fff" }),
    ).toEqual({ flexDirection: "row", backgroundColor: "#fff" });
  });
});

describe("resolveStyle", () => {
  test("className only", () => {
    expect(resolveStyle({ className: "flex-row gap-2" })).toMatchObject({
      flexDirection: "row",
      gap: 8,
    });
  });

  test("style object only, with shorthand expansion", () => {
    expect(resolveStyle({ style: { padding: 4, flexGrow: 1 } })).toMatchObject({
      paddingTop: 4,
      paddingLeft: 4,
      flexGrow: 1,
    });
  });

  test("the style object wins over className on conflict", () => {
    const r = resolveStyle({
      className: "flex-row bg-primary",
      style: { flexDirection: "column" },
    });
    expect(r.flexDirection).toBe("column");
    expect(r.backgroundColor).toBe("#0a84ff");
  });

  test("empty input resolves to an empty style", () => {
    expect(resolveStyle({})).toEqual({});
  });

  test("a cached className result is never mutated by a later caller", () => {
    // resolveClassName memoizes; resolveStyle must not write into the cache.
    const first = resolveStyle({
      className: "flex-row",
      style: { flexDirection: "column" },
    });
    const second = resolveStyle({ className: "flex-row" });
    expect(first.flexDirection).toBe("column");
    expect(second.flexDirection).toBe("row");
  });
});
