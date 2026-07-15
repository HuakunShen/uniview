import { describe, expect, it } from "vitest";
import { StyleTable, DEFAULT_STYLE_ID } from "../../src/style/style-table";

describe("StyleTable", () => {
  it("reserves id 0 for the default (empty) style", () => {
    const table = new StyleTable();
    expect(DEFAULT_STYLE_ID).toBe(0);
    expect(table.get(0)).toEqual({});
    expect(table.size).toBe(1);
  });

  it("interns the empty style to id 0", () => {
    const table = new StyleTable();
    expect(table.intern({})).toBe(0);
    expect(table.size).toBe(1);
  });

  it("assigns new ids to distinct styles and reads them back", () => {
    const table = new StyleTable();
    const bold = table.intern({ bold: true });
    const red = table.intern({ fg: "red" });
    expect(bold).toBe(1);
    expect(red).toBe(2);
    expect(table.get(bold)).toEqual({ bold: true });
    expect(table.get(red)).toEqual({ fg: "red" });
    expect(table.size).toBe(3);
  });

  it("returns the same id for equal styles regardless of key order", () => {
    const table = new StyleTable();
    const a = table.intern({ bold: true, fg: "cyan" });
    const b = table.intern({ fg: "cyan", bold: true });
    expect(a).toBe(b);
    expect(table.size).toBe(2);
  });

  it("normalizes falsy and undefined attributes away", () => {
    const table = new StyleTable();
    expect(table.intern({ bold: false, italic: undefined, fg: undefined })).toBe(0);
    expect(table.size).toBe(1);
  });

  it("treats rgb colors structurally", () => {
    const table = new StyleTable();
    const a = table.intern({ fg: { r: 10, g: 20, b: 30 } });
    const b = table.intern({ fg: { r: 10, g: 20, b: 30 } });
    expect(a).toBe(b);
    expect(table.get(a)).toEqual({ fg: { r: 10, g: 20, b: 30 } });
  });

  it("throws when reading an unknown id", () => {
    const table = new StyleTable();
    expect(() => table.get(99)).toThrow();
  });
});
