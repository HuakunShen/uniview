import { describe, expect, it } from "vitest";
import { frameToLines } from "@uniview/tui-core";
import { mountDescriptor, type OpenTuiApi } from "../src/mount";
import { charFrameToBuffer } from "../src/capture";
import { toOpenTuiDescriptor } from "../src/mapping";

/** A mock OpenTUI API recording every Renderable constructed. */
function mockApi() {
  const created: { kind: "box" | "text"; options: Record<string, unknown> }[] = [];
  const make = (kind: "box" | "text") =>
    class {
      children: unknown[] = [];
      constructor(_renderer: unknown, options: Record<string, unknown>) {
        created.push({ kind, options });
      }
      add(child: unknown) {
        this.children.push(child);
      }
    };
  const api = { BoxRenderable: make("box"), TextRenderable: make("text") } as unknown as OpenTuiApi;
  return { api, created };
}

describe("mountDescriptor", () => {
  it("constructs a Renderable per descriptor node", () => {
    const { api, created } = mockApi();
    const descriptor = toOpenTuiDescriptor({
      type: "box",
      style: { flexDirection: "column", padding: 1 },
      children: [
        { type: "text", text: "Hello", textStyle: { fg: "cyan" } },
        { type: "text", text: "World" },
      ],
    });
    mountDescriptor(api, {}, descriptor);

    expect(created.map((c) => c.kind)).toEqual(["box", "text", "text"]);
    expect(created[0]!.options).toMatchObject({ flexDirection: "column", padding: 1 });
    expect(created[1]!.options).toMatchObject({ content: "Hello", fg: "cyan" });
  });
});

describe("charFrameToBuffer", () => {
  it("parses OpenTUI's captured char frame into a CellBuffer", () => {
    const buffer = charFrameToBuffer("hi\n  ", { width: 5, height: 2 });
    expect(frameToLines(buffer, { trimRight: true })).toEqual(["hi", ""]);
  });

  it("handles wide characters", () => {
    const buffer = charFrameToBuffer("中x", { width: 4, height: 1 });
    expect(frameToLines(buffer, { trimRight: true })).toEqual(["中x"]);
  });
});
