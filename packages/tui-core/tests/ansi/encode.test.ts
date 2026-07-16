import { describe, expect, it } from "vitest";
import { sgrFor, sgrParams } from "../../src/ansi/encode";
import { StyleTable } from "../../src/style/style-table";

describe("sgrParams — blink & hidden", () => {
  it("emits SGR 5 for blink and SGR 8 for hidden", () => {
    expect(sgrParams({ blink: true })).toEqual(["5"]);
    expect(sgrParams({ hidden: true })).toEqual(["8"]);
  });

  it("orders every modifier by SGR code", () => {
    expect(
      sgrParams({
        bold: true,
        underline: true,
        blink: true,
        inverse: true,
        hidden: true,
        strikethrough: true,
      }),
    ).toEqual(["1", "4", "5", "7", "8", "9"]);
  });

  it("sgrFor resets then applies blink", () => {
    expect(sgrFor({ blink: true })).toBe("\x1b[0;5m");
  });
});

describe("StyleTable — blink & hidden survive interning", () => {
  it("interns blink/hidden as distinct styles (normalize() keeps them)", () => {
    const table = new StyleTable();
    const plain = table.intern({});
    const blink = table.intern({ blink: true });
    const hidden = table.intern({ hidden: true });
    expect(blink).not.toBe(plain);
    expect(hidden).not.toBe(plain);
    expect(table.get(blink).blink).toBe(true);
    expect(table.get(hidden).hidden).toBe(true);
  });
});
