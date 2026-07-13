import { describe, expect, it, vi } from "vitest";
import { handlerIdProp, TEXT_NODE_TYPE, type UINode } from "@uniview/protocol";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { TuiHost } from "../src/tui-host";

function host(onInvokeHandler = vi.fn()) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const h = new TuiHost({ surface, styles, size: { width: 20, height: 3 }, onInvokeHandler });
  return { h, surface, onInvokeHandler };
}

const textNode = (id: string, t: string): UINode => ({
  id,
  type: TEXT_NODE_TYPE,
  props: {},
  children: [],
  text: t,
});

describe("TuiHost — rendering", () => {
  it("renders a UINode root to the surface", () => {
    const { h, surface } = host();
    h.setRoot({
      id: "root",
      type: "box",
      props: { flexDirection: "column" },
      children: [
        { id: "label", type: "text", props: {}, children: [textNode("t", "Hello")] },
      ],
    });
    expect(surface.lines({ trimRight: true })[0]).toBe("Hello");
  });

  it("re-renders after a mutation batch", () => {
    const { h, surface } = host();
    h.setRoot({
      id: "root",
      type: "text",
      props: {},
      children: [textNode("t", "Count: 0")],
    });
    h.applyBatch([{ type: "setText", nodeId: "t", text: "Count: 1" }]);
    expect(surface.lines({ trimRight: true })[0]).toBe("Count: 1");
  });
});

describe("TuiHost — hit-testing and events", () => {
  it("maps a pointer coordinate to the owning node id", () => {
    const { h } = host();
    h.setRoot({
      id: "label",
      type: "text",
      props: {},
      children: [textNode("t", "hi")],
    });
    expect(h.nodeAt(0, 0)).toBe("label");
    expect(h.nodeAt(19, 2)).toBeNull();
  });

  it("invokes the handler registered for an event", () => {
    const { h, onInvokeHandler } = host();
    h.setRoot({
      id: "btn",
      type: "box",
      props: { [handlerIdProp("onClick")]: "h1" },
      children: [],
    });
    expect(h.fireEvent("btn", "onClick")).toBe(true);
    expect(onInvokeHandler).toHaveBeenCalledWith("h1", undefined);
  });

  it("returns false when a node has no handler for the event", () => {
    const { h, onInvokeHandler } = host();
    h.setRoot({ id: "btn", type: "box", props: {}, children: [] });
    expect(h.fireEvent("btn", "onClick")).toBe(false);
    expect(onInvokeHandler).not.toHaveBeenCalled();
  });

  it("supports a full click: coordinate -> node -> handler", () => {
    const { h, onInvokeHandler } = host();
    h.setRoot({
      id: "btn",
      type: "box",
      props: {
        [handlerIdProp("onClick")]: "click-1",
        backgroundColor: "blue",
        width: 5,
        height: 1,
      },
      children: [],
    });

    const nodeId = h.nodeAt(0, 0);
    expect(nodeId).toBe("btn");
    h.fireEvent(nodeId!, "onClick", { x: 0, y: 0 });
    expect(onInvokeHandler).toHaveBeenCalledWith("click-1", { x: 0, y: 0 });
  });
});
