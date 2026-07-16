import { describe, expect, it } from "vitest";
import { TEXT_NODE_TYPE, type UINode } from "@uniview/protocol";
import { uinodeToRenderNode } from "../src/convert";

describe("convert — blink & hidden text props", () => {
  it("maps blink/hidden text props to CellStyle flags", () => {
    const node: UINode = {
      id: "label",
      type: "text",
      props: { blink: true, hidden: true },
      children: [
        { id: "t", type: TEXT_NODE_TYPE, props: {}, children: [], text: "secret" },
      ],
    };
    const rendered = uinodeToRenderNode(node);
    expect(rendered?.textStyle).toMatchObject({ blink: true, hidden: true });
  });
});
