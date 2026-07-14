import { styledLineText } from "@uniview/tui-core";
import { describe, expect, it } from "vitest";

import { renderBarChart } from "../src/bar";
import { renderHistogram } from "../src/histogram";

describe("renderHistogram", () => {
  it("bins values into counts and matches renderBarChart of those counts", () => {
    // min=0, max=2, width=2/3=0.6667
    // bucket0 [0, 0.667)         -> {0, 0} = 2
    // bucket1 [0.667, 1.333)     -> {1}    = 1
    // bucket2 [1.333, 2] (incl.) -> {2,2,2}= 3
    const result = renderHistogram([0, 0, 1, 2, 2, 2], {
      bins: 3,
      height: 3,
      max: 3,
      gap: 0,
    });

    const expected = renderBarChart(
      [
        { label: "a", value: 2 },
        { label: "b", value: 1 },
        { label: "c", value: 3 },
      ],
      { height: 3, max: 3, gap: 0 },
    );

    const resultRows = result.children!.map((child) =>
      styledLineText(child.spans!),
    );
    const expectedRows = expected.children!.map((child) =>
      styledLineText(child.spans!),
    );
    expect(resultRows).toEqual(expectedRows);
  });

  it("produces bucket labels rounded to ~4 significant digits", () => {
    const result = renderHistogram([0, 0, 1, 2, 2, 2], {
      bins: 3,
      height: 1,
      max: 1,
      gap: 0,
      showLabels: true,
    });

    const labelRow = styledLineText(
      result.children![result.children!.length - 1]!.spans!,
    );
    expect(labelRow).toBe("00.66671.333");
  });

  it("does not throw on empty input and produces all-zero bars summing to 0", () => {
    const result = renderHistogram([], {
      bins: 5,
      height: 2,
      gap: 0,
      showValues: true,
    });

    const valueRow = styledLineText(
      result.children![result.children!.length - 1]!.spans!,
    );
    expect(valueRow).toBe("00000");
  });

  it("does not throw when all values are equal, and counts sum to values.length", () => {
    const result = renderHistogram([5, 5, 5], {
      bins: 4,
      height: 1,
      gap: 1,
      showValues: true,
    });

    const valueRow = styledLineText(
      result.children![result.children!.length - 1]!.spans!,
    );
    const counts = valueRow.split(" ").map(Number);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(counts).toEqual([3, 0, 0, 0]);
  });
});
