import { describe, expect, it } from "vitest";
import {
  cycleSort,
  formatCell,
  orderRows,
  resolveColumnWidths,
} from "../../src/components/table-columns";

describe("resolveColumnWidths", () => {
  it("keeps fixed widths and distributes leftover to flex columns", () => {
    // total 20, gap 1 between 2 cols ⇒ 19 for content; col0 fixed 5, col1 flexes to 14
    const cols = resolveColumnWidths([{ width: 5 }, { flexGrow: 1 }], 20, 1);
    expect(cols).toEqual([
      { width: 5, align: "left" },
      { width: 14, align: "left" },
    ]);
  });

  it("treats a width-less, flex-less column as flexGrow:1", () => {
    const [a, b] = resolveColumnWidths([{}, {}], 21, 1); // 20 content split evenly
    expect(a!.width).toBe(10);
    expect(b!.width).toBe(10);
  });

  it("honors minWidth and preserves alignment", () => {
    const [a] = resolveColumnWidths([{ minWidth: 8, align: "right", flexGrow: 1 }], 4, 0);
    expect(a).toEqual({ width: 8, align: "right" }); // clamped up to minWidth
  });
});

describe("formatCell", () => {
  it("left-pads, right-pads and centers to an exact width", () => {
    expect(formatCell("hi", 5, "left")).toBe("hi   ");
    expect(formatCell("hi", 5, "right")).toBe("   hi");
    expect(formatCell("hi", 5, "center")).toBe(" hi  ");
  });

  it("truncates with an ellipsis and still fills the width", () => {
    expect(formatCell("hello world", 5)).toBe("hell…");
    expect(formatCell("hello world", 5)).toHaveLength(5);
  });

  it("counts a wide glyph as two cells when truncating", () => {
    // "世界" is 4 cells; into width 3 ⇒ one wide glyph + ellipsis = 3 cells
    expect(formatCell("世界", 3)).toBe("世…");
  });
});

describe("cycleSort", () => {
  it("cycles asc → desc → cleared, resetting on a new column", () => {
    expect(cycleSort(null, "name")).toEqual({ columnKey: "name", direction: "asc" });
    expect(cycleSort({ columnKey: "name", direction: "asc" }, "name")).toEqual({ columnKey: "name", direction: "desc" });
    expect(cycleSort({ columnKey: "name", direction: "desc" }, "name")).toBeNull();
    expect(cycleSort({ columnKey: "name", direction: "desc" }, "age")).toEqual({ columnKey: "age", direction: "asc" });
  });
});

describe("orderRows", () => {
  const rows = [{ n: 3 }, { n: 1 }, { n: 2 }];
  const byN = (a: { n: number }, b: { n: number }) => a.n - b.n;
  it("returns a stable ascending/descending permutation", () => {
    expect(orderRows(rows, byN, "asc")).toEqual([1, 2, 0]);
    expect(orderRows(rows, byN, "desc")).toEqual([0, 2, 1]);
  });
  it("is identity without a comparator", () => {
    expect(orderRows(rows, undefined, "asc")).toEqual([0, 1, 2]);
  });
});
