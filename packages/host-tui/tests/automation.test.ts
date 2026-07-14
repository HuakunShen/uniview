import { describe, expect, it } from "vitest";
import { handlerIdProp, TEXT_NODE_TYPE, type UINode } from "@uniview/protocol";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { TuiHost } from "../src/tui-host";
import { AutomationSession } from "../src/automation";

function setup() {
  const styles = new StyleTable();
  // Wire the handler to a fake model that flips a status label.
  const state = { status: "Idle" };
  const host = new TuiHost({
    surface: new MemoryCellSurface({ styles }),
    styles,
    size: { width: 30, height: 5 },
    onInvokeHandler: (id) => {
      if (id === "git.refresh") {
        state.status = "Updated";
        host.applyBatch([{ type: "setText", nodeId: "status-text", text: "Updated" }]);
      }
    },
  });
  host.setRoot(app());
  return { host, session: new AutomationSession(host), state };
}

const text = (id: string, t: string): UINode => ({ id, type: TEXT_NODE_TYPE, props: {}, children: [], text: t });

const app = (): UINode => ({
  id: "root",
  type: "box",
  props: {},
  children: [
    { id: "status", type: "text", props: { role: "status" }, children: [text("status-text", "Idle")] },
    { id: "refresh", type: "box", props: { [handlerIdProp("onClick")]: "git.refresh" }, children: [text("t", "Refresh")] },
  ],
});

describe("AutomationSession", () => {
  it("queries the semantic tree by role", () => {
    const { session } = setup();
    expect(session.query({ role: "button", name: "Refresh" })?.id).toBe("refresh");
  });

  it("activates a control and records the command", () => {
    const { session } = setup();
    expect(session.act.activate({ role: "button", name: "Refresh" })).toBe(true);
    expect(session.commands().map((c) => c.id)).toContain("git.refresh");
  });

  it("drives a semantic flow: activate then assert the status updated", () => {
    const { session } = setup();
    session.act.activate({ role: "button", name: "Refresh" });

    expect(() => session.expect.node({ role: "status" }, { text: /updated/i })).not.toThrow();
    expect(session.commands().map((c) => c.id)).toEqual(["git.refresh"]);
  });

  it("throws from expect.node when the assertion fails", () => {
    const { session } = setup();
    expect(() => session.expect.node({ role: "status" }, { text: /updated/i })).toThrow();
  });

  it("expect.text asserts some node has the text", () => {
    const { session } = setup();
    session.act.activate({ id: "refresh" });
    expect(() => session.expect.text(/updated/i)).not.toThrow();
  });

  it("waitForCommand resolves when the command has been recorded", async () => {
    const { session } = setup();
    session.act.activate({ role: "button", name: "Refresh" });
    await expect(session.waitForCommand("git.refresh")).resolves.toBeUndefined();
  });

  it("record returns the trace of actions and commands", () => {
    const { session } = setup();
    session.act.activate({ role: "button", name: "Refresh" });
    const trace = session.record();
    expect(trace.commands.map((c) => c.id)).toEqual(["git.refresh"]);
    expect(trace.actions).toContainEqual({ kind: "activate", target: { role: "button", name: "Refresh" } });
  });
});
