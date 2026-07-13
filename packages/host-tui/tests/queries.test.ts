import { describe, expect, it, vi } from "vitest";
import { TEXT_NODE_TYPE, handlerIdProp, type UINode } from "@uniview/protocol";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { TuiHost } from "../src/tui-host";

function host() {
  const styles = new StyleTable();
  return new TuiHost({ surface: new MemoryCellSurface({ styles }), styles, size: { width: 30, height: 5 }, onInvokeHandler: vi.fn() });
}

const text = (id: string, t: string): UINode => ({ id, type: TEXT_NODE_TYPE, props: {}, children: [], text: t });

const app: UINode = {
  id: "root",
  type: "box",
  props: {},
  children: [
    { id: "title", type: "text", props: { role: "status" }, children: [text("t1", "Ready")] },
    { id: "refresh", type: "box", props: { [handlerIdProp("onClick")]: "h1" }, children: [text("t2", "Refresh")] },
    { id: "save", type: "box", props: { [handlerIdProp("onClick")]: "h2" }, children: [text("t3", "Save")] },
  ],
};

describe("TuiHost queries", () => {
  it("exposes the semantic tree", () => {
    const h = host();
    h.setRoot(app);
    expect(h.semanticTree()?.role).toBe("group");
  });

  it("queries by role and name", () => {
    const h = host();
    h.setRoot(app);
    expect(h.queryByRole("button", { name: "Refresh" })?.id).toBe("refresh");
    expect(h.queryByRole("button", { name: "Save" })?.id).toBe("save");
    expect(h.queryByRole("status")?.id).toBe("title");
  });

  it("matches a name by regexp", () => {
    const h = host();
    h.setRoot(app);
    expect(h.queryByRole("button", { name: /refr/i })?.id).toBe("refresh");
  });

  it("queries by text", () => {
    const h = host();
    h.setRoot(app);
    expect(h.queryByText("Ready")?.id).toBe("title");
    expect(h.queryByText(/save/i)?.id).toBe("save");
  });

  it("queries by id", () => {
    const h = host();
    h.setRoot(app);
    expect(h.queryById("save")?.role).toBe("button");
    expect(h.queryById("missing")).toBeNull();
  });

  it("returns null when nothing matches", () => {
    const h = host();
    h.setRoot(app);
    expect(h.queryByRole("button", { name: "Nope" })).toBeNull();
  });
});
