import { describe, expect, it, vi } from "vitest";
import { handlerIdProp, TEXT_NODE_TYPE, type UINode } from "@uniview/protocol";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { TuiHost } from "../src/tui-host";

function make() {
  const onInvokeHandler = vi.fn();
  const styles = new StyleTable();
  const h = new TuiHost({ surface: new MemoryCellSurface({ styles }), styles, size: { width: 30, height: 5 }, onInvokeHandler });
  return { h, onInvokeHandler };
}

const text = (id: string, t: string): UINode => ({ id, type: TEXT_NODE_TYPE, props: {}, children: [], text: t });

const app: UINode = {
  id: "root",
  type: "box",
  props: {},
  children: [
    { id: "refresh", type: "box", props: { [handlerIdProp("onClick")]: "git.refresh" }, children: [text("t", "Refresh")] },
  ],
};

describe("TuiHost.activate", () => {
  it("activates a control by role and name", () => {
    const { h, onInvokeHandler } = make();
    h.setRoot(app);
    expect(h.activate({ role: "button", name: "Refresh" })).toBe(true);
    expect(onInvokeHandler).toHaveBeenCalledWith("git.refresh", undefined);
  });

  it("activates a control by id", () => {
    const { h, onInvokeHandler } = make();
    h.setRoot(app);
    expect(h.activate({ id: "refresh" })).toBe(true);
    expect(onInvokeHandler).toHaveBeenCalledWith("git.refresh", undefined);
  });

  it("returns false when no semantic target matches", () => {
    const { h, onInvokeHandler } = make();
    h.setRoot(app);
    expect(h.activate({ role: "button", name: "Nope" })).toBe(false);
    expect(onInvokeHandler).not.toHaveBeenCalled();
  });
});
