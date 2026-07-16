import { styledLineText } from "@uniview/tui-core";
import { describe, expect, it } from "vitest";

import { axisTicks, frameChart } from "../src/axis";

describe("axisTicks", () => {
  it("spans the bound inclusively with evenly spaced ticks", () => {
    const ticks = axisTicks([0, 10], 5, 40);
    expect(ticks).toHaveLength(5);
    expect(ticks[0]!.value).toBe(0);
    expect(ticks[0]!.cell).toBe(0);
    expect(ticks[ticks.length - 1]!.value).toBe(10);
    expect(ticks[ticks.length - 1]!.cell).toBe(39); // dataToPixel maps hi -> cells-1
  });

  it("clamps a tick count below 2 up to 2 (endpoints)", () => {
    const ticks = axisTicks([0, 1], 1, 10);
    expect(ticks).toHaveLength(2);
    expect(ticks.map((t) => t.label)).toEqual(["0", "1"]);
  });

  it("formats labels to the requested significant digits", () => {
    const ticks = axisTicks([0, 1], 3, 10, 4);
    expect(ticks[1]!.label).toBe("0.5");
  });
});

describe("frameChart", () => {
  // A 2x2 all-filled braille body: both plot rows are "⣿⣿".
  const body = [[{ text: "⣿⣿" }], [{ text: "⣿⣿" }]];

  it("prepends a Y gutter and appends X rule + label rows", () => {
    const framed = frameChart(body, 2, 2, [0, 1], [0, 1], { xTicks: 2, yTicks: 2 });

    // 2 body rows + 1 rule row + 1 x-label row, no titles.
    expect(framed).toHaveLength(4);

    const rows = framed.map((line) => styledLineText(line));
    expect(rows[0]).toBe("1│⣿⣿");
    expect(rows[1]).toBe("0│⣿⣿");
    expect(rows[2]).toBe(" └┴┴");
    expect(rows[3]!.startsWith(" ")).toBe(true);
    expect(rows[3]).toContain("0");
    expect(rows[3]).toContain("1");
  });

  it("colors the frame with the axis color, leaving the body spans untouched", () => {
    const axisColor = { r: 9, g: 9, b: 9 };
    const framed = frameChart(body, 2, 2, [0, 1], [0, 1], { xTicks: 2, yTicks: 2, color: axisColor });

    const gutterSpan = framed[0]![0]!; // the "1│" gutter span
    expect(gutterSpan.style?.fg).toEqual(axisColor);
    const bodySpan = framed[0]![framed[0]!.length - 1]!; // the "⣿⣿" body span
    expect(bodySpan.style?.fg).toBeUndefined();
  });

  it("adds a yTitle line above and a centered xTitle line below when set", () => {
    const framed = frameChart(body, 2, 2, [0, 1], [0, 1], { xTicks: 2, yTicks: 2, xTitle: "time", yTitle: "value" });

    const rows = framed.map((line) => styledLineText(line));
    expect(rows[0]).toContain("value"); // yTitle first
    expect(rows[rows.length - 1]).toContain("time"); // xTitle last
    expect(framed).toHaveLength(2 + 2 + 1 + 1); // body + (rule+labels) + 2 titles
  });

  it("omits the Y gutter entirely when y:false", () => {
    const framed = frameChart(body, 2, 2, [0, 1], [0, 1], { y: false, xTicks: 2 });
    expect(styledLineText(framed[0]!)).toBe("⣿⣿"); // no gutter prepended
  });
});
