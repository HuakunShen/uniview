import { describe, expect, it } from "vitest";
import { CellBuffer } from "../../src/buffer/cell-buffer";
import {
  extractSelectedText,
  isSelectableCell,
  normalizeSelectionRange,
  TextSelectionController,
} from "../../src/selection/text-selection";
import type { TuiInputEvent } from "../../src/input/events";

function writeSelectable(
  buffer: CellBuffer,
  x: number,
  y: number,
  text: string,
): number {
  return buffer.writeText(x, y, text, 0, 0, undefined, undefined, true);
}

function mouse(
  action: "down" | "up" | "drag",
  x: number,
  y: number,
  shift = false,
): TuiInputEvent {
  return {
    type: "mouse",
    action,
    button: "left",
    x,
    y,
    ctrl: false,
    alt: false,
    shift,
  };
}

describe("text selection ranges", () => {
  it("normalizes reverse multi-row endpoints in visual order", () => {
    expect(normalizeSelectionRange({ x: 6, y: 2 }, { x: 2, y: 0 })).toEqual({
      start: { x: 2, y: 0 },
      end: { x: 6, y: 2 },
    });
  });

  it("normalizes reverse endpoints on the same row", () => {
    expect(normalizeSelectionRange({ x: 6, y: 1 }, { x: 2, y: 1 })).toEqual({
      start: { x: 2, y: 1 },
      end: { x: 6, y: 1 },
    });
  });
});

describe("extractSelectedText", () => {
  it("extracts a horizontal inclusive range", () => {
    const buffer = new CellBuffer(8, 1);
    writeSelectable(buffer, 0, 0, "hello");

    expect(
      extractSelectedText(buffer, {
        start: { x: 1, y: 0 },
        end: { x: 3, y: 0 },
      }),
    ).toBe("ell");
  });

  it("extracts forward and reverse multi-line ranges identically", () => {
    const buffer = new CellBuffer(8, 2);
    writeSelectable(buffer, 0, 0, "hello");
    writeSelectable(buffer, 0, 1, "world");

    const forward = extractSelectedText(buffer, {
      start: { x: 2, y: 0 },
      end: { x: 2, y: 1 },
    });
    const reverse = extractSelectedText(buffer, {
      start: { x: 2, y: 1 },
      end: { x: 2, y: 0 },
    });

    expect(forward).toBe("llo\nwor");
    expect(reverse).toBe(forward);
  });

  it("copies CJK emoji and combining graphemes once", () => {
    const buffer = new CellBuffer(10, 2);
    writeSelectable(buffer, 0, 0, "A 界");
    writeSelectable(buffer, 0, 1, "🙂 e\u0301");

    expect(
      extractSelectedText(buffer, {
        start: { x: 0, y: 0 },
        end: { x: 4, y: 1 },
      }),
    ).toBe("A 界\n🙂 e\u0301");
  });

  it("omits non-selectable layout gaps and terminal padding", () => {
    const buffer = new CellBuffer(12, 1);
    writeSelectable(buffer, 0, 0, "left");
    writeSelectable(buffer, 8, 0, "right");

    expect(
      extractSelectedText(buffer, {
        start: { x: 0, y: 0 },
        end: { x: 11, y: 0 },
      }),
    ).toBe("leftrigh");
  });

  it("returns an empty string when the range contains no selectable cells", () => {
    const buffer = new CellBuffer(4, 1);
    buffer.writeText(0, 0, "box", 0, 0);

    expect(
      extractSelectedText(buffer, {
        start: { x: 0, y: 0 },
        end: { x: 3, y: 0 },
      }),
    ).toBe("");
  });
});

describe("isSelectableCell", () => {
  it("accepts both halves of a wide selectable grapheme", () => {
    const buffer = new CellBuffer(4, 1);
    writeSelectable(buffer, 0, 0, "界");

    expect(isSelectableCell(buffer, { x: 0, y: 0 })).toBe(true);
    expect(isSelectableCell(buffer, { x: 1, y: 0 })).toBe(true);
  });

  it("rejects coordinates outside the frame", () => {
    const buffer = new CellBuffer(4, 1);
    expect(isSelectableCell(buffer, { x: -1, y: 0 })).toBe(false);
    expect(isSelectableCell(buffer, { x: 4, y: 0 })).toBe(false);
    expect(isSelectableCell(buffer, { x: 0, y: 1 })).toBe(false);
  });
});

describe("TextSelectionController", () => {
  it("does not consume a same-cell click", () => {
    const buffer = new CellBuffer(8, 1);
    writeSelectable(buffer, 0, 0, "click");
    const controller = new TextSelectionController();

    expect(controller.handle(mouse("down", 1, 0), buffer)).toEqual({
      consumed: false,
      changed: false,
    });
    expect(controller.handle(mouse("up", 1, 0), buffer)).toEqual({
      consumed: false,
      changed: false,
    });
    expect(controller.range).toBeNull();
  });

  it("owns a drag after it crosses into another cell", () => {
    const buffer = new CellBuffer(8, 1);
    writeSelectable(buffer, 0, 0, "drag me");
    const controller = new TextSelectionController();

    controller.handle(mouse("down", 1, 0), buffer);
    expect(controller.handle(mouse("drag", 2, 0), buffer)).toEqual({
      consumed: true,
      changed: true,
    });
    const completed = controller.handle(mouse("up", 4, 0), buffer);

    expect(completed.consumed).toBe(true);
    expect(completed.changed).toBe(true);
    expect(completed.completed).toMatchObject({
      text: "rag ",
      start: { x: 1, y: 0 },
      end: { x: 4, y: 0 },
      characterCount: 4,
      byteCount: 4,
      clipboardEmitted: false,
    });
    expect(controller.range).toEqual({
      start: { x: 1, y: 0 },
      end: { x: 4, y: 0 },
    });
  });

  it("owns a cross-cell release when an input source omits motion reports", () => {
    const buffer = new CellBuffer(8, 1);
    writeSelectable(buffer, 0, 0, "drag me");
    const controller = new TextSelectionController();

    controller.handle(mouse("down", 1, 0), buffer);
    const completed = controller.handle(mouse("up", 4, 0), buffer);

    expect(completed).toMatchObject({
      consumed: true,
      changed: true,
      completed: {
        text: "rag ",
        start: { x: 1, y: 0 },
        end: { x: 4, y: 0 },
      },
    });
  });

  it("normalizes a reverse multi-row drag", () => {
    const buffer = new CellBuffer(6, 2);
    writeSelectable(buffer, 0, 0, "first");
    writeSelectable(buffer, 0, 1, "last");
    const controller = new TextSelectionController();

    controller.handle(mouse("down", 3, 1), buffer);
    controller.handle(mouse("drag", 2, 0), buffer);
    const completed = controller.handle(mouse("up", 1, 0), buffer);

    expect(completed.completed?.text).toBe("irst\nlast");
    expect(completed.completed?.start).toEqual({ x: 1, y: 0 });
    expect(completed.completed?.end).toEqual({ x: 3, y: 1 });
  });

  it("clears a completed selection on click without consuming the click", () => {
    const buffer = new CellBuffer(8, 1);
    writeSelectable(buffer, 0, 0, "select");
    const controller = new TextSelectionController();
    controller.handle(mouse("down", 0, 0), buffer);
    controller.handle(mouse("drag", 2, 0), buffer);
    controller.handle(mouse("up", 2, 0), buffer);

    expect(controller.handle(mouse("down", 5, 0), buffer)).toEqual({
      consumed: false,
      changed: true,
    });
    expect(controller.handle(mouse("up", 5, 0), buffer).consumed).toBe(false);
    expect(controller.range).toBeNull();
  });

  it("clears on Escape and lets Escape continue routing", () => {
    const buffer = new CellBuffer(8, 1);
    writeSelectable(buffer, 0, 0, "select");
    const controller = new TextSelectionController();
    controller.handle(mouse("down", 0, 0), buffer);
    controller.handle(mouse("drag", 2, 0), buffer);
    controller.handle(mouse("up", 2, 0), buffer);

    expect(
      controller.handle(
        {
          type: "key",
          key: "Escape",
          ctrl: false,
          alt: false,
          shift: false,
          meta: false,
        },
        buffer,
      ),
    ).toEqual({ consumed: false, changed: true });
    expect(controller.range).toBeNull();
  });

  it("bypasses shifted click and suppresses a shifted drag reported by the terminal", () => {
    const buffer = new CellBuffer(8, 1);
    writeSelectable(buffer, 0, 0, "native");
    const controller = new TextSelectionController();

    expect(controller.handle(mouse("down", 0, 0, true), buffer).consumed).toBe(
      false,
    );
    expect(controller.handle(mouse("up", 0, 0, true), buffer).consumed).toBe(
      false,
    );

    controller.handle(mouse("down", 0, 0, true), buffer);
    expect(controller.handle(mouse("drag", 2, 0, true), buffer)).toEqual({
      consumed: true,
      changed: false,
    });
    expect(controller.handle(mouse("up", 2, 0, true), buffer)).toEqual({
      consumed: true,
      changed: false,
    });
    expect(controller.range).toBeNull();
  });

  it("starts a wide-character selection from the grapheme lead", () => {
    const buffer = new CellBuffer(5, 1);
    writeSelectable(buffer, 0, 0, "界x");
    const controller = new TextSelectionController();

    controller.handle(mouse("down", 1, 0), buffer);
    controller.handle(mouse("drag", 2, 0), buffer);
    const completed = controller.handle(mouse("up", 2, 0), buffer);

    expect(completed.completed?.text).toBe("界x");
    expect(completed.completed?.start).toEqual({ x: 0, y: 0 });
  });
});
