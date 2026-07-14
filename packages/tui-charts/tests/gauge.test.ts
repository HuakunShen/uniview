import { styledLineText } from "@uniview/tui-core";
import { describe, expect, it } from "vitest";

import { renderGauge } from "../src/gauge";

describe("renderGauge", () => {
  it("fills half of a 4-cell gauge for fraction 0.5", () => {
    const result = renderGauge(0.5, { width: 4 });

    const line = result.children![0]!;
    expect(styledLineText(line.spans!)).toBe("██  ");
  });

  it("fills the entire gauge for fraction 1", () => {
    const result = renderGauge(1, { width: 4 });

    const line = result.children![0]!;
    expect(styledLineText(line.spans!)).toBe("████");
  });
});
