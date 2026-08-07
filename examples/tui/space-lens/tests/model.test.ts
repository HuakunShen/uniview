import { describe, expect, it } from "vitest";
import { frameToLines, renderToBuffer } from "@uniview/tui-core";
import {
  ROWS,
  createInitialState,
  reduce,
  viewportHeight,
  view,
} from "../src/model";

describe("space-lens direct-core model", () => {
  it("keeps the scan panel bounded and paints the border", () => {
    const size = { width: 72, height: 18 };
    const lines = frameToLines(
      renderToBuffer(view(createInitialState(), size), size).buffer,
      { trimRight: true },
    );

    expect(lines[3]).toMatch(/^╭.*╮$/);
    expect(lines[lines.length - 1]).toMatch(/^╰.*╯$/);
    expect(lines.some((line) => line.includes("skills-lock.json"))).toBe(true);
    expect(lines.some((line) => line.includes("row-185"))).toBe(false);
  });

  it("moves the visible window without moving the panel border", () => {
    const size = { width: 72, height: 18 };
    const state = reduce(
      createInitialState(),
      {
        type: "key",
        key: "End",
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      },
      viewportHeight(size),
    );
    const lines = frameToLines(renderToBuffer(view(state, size), size).buffer, {
      trimRight: true,
    });

    expect(lines[3]).toMatch(/^╭.*╮$/);
    expect(lines[lines.length - 1]).toMatch(/^╰.*╯$/);
    expect(lines.some((line) => line.includes("row-185"))).toBe(true);
    expect(lines.some((line) => line.includes("skills-lock.json"))).toBe(false);
  });

  it("reclamps scroll state when the viewport becomes taller", () => {
    const size = { width: 72, height: 12 };
    const end = reduce(
      createInitialState(),
      {
        type: "key",
        key: "End",
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      },
      viewportHeight(size),
    );
    const resized = reduce(
      end,
      { type: "resize", width: 72, height: 40 },
      viewportHeight({ width: 72, height: 40 }),
    );

    expect(resized.cursor).toBe(ROWS.length - 1);
    expect(resized.scrollTop).toBe(
      ROWS.length - viewportHeight({ width: 72, height: 40 }),
    );
  });
});
