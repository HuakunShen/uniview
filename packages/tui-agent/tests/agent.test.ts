import { describe, expect, it } from "vitest";
import { handlerIdProp, TEXT_NODE_TYPE, type UINode } from "@uniview/protocol";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { AutomationSession, TuiHost } from "@uniview/host-tui";
import { agentContext, parseCommand, runCommand } from "../src/index";

const text = (id: string, t: string): UINode => ({ id, type: TEXT_NODE_TYPE, props: {}, children: [], text: t });

function session() {
  const styles = new StyleTable();
  const host = new TuiHost({
    surface: new MemoryCellSurface({ styles }),
    styles,
    size: { width: 30, height: 4 },
    onInvokeHandler: (id) => {
      if (id === "refresh") host.applyBatch([{ type: "setText", nodeId: "st", text: "Updated" }]);
    },
  });
  host.setRoot({
    id: "root",
    type: "box",
    props: {},
    children: [
      { id: "status", type: "text", props: { role: "status" }, children: [text("st", "Idle")] },
      { id: "refresh", type: "box", props: { [handlerIdProp("onClick")]: "refresh" }, children: [text("bt", "Refresh")] },
    ],
  });
  return new AutomationSession(host);
}

describe("parseCommand", () => {
  it("parses query with role and name", () => {
    expect(parseCommand(["query", "--role", "button", "--name", "Refresh"])).toEqual({
      kind: "action",
      action: { kind: "query", target: { role: "button", name: "Refresh" } },
    });
  });

  it("parses act activate", () => {
    expect(parseCommand(["act", "activate", "--role", "button", "--name", "Refresh"])).toEqual({
      kind: "action",
      action: { kind: "activate", target: { role: "button", name: "Refresh" } },
    });
  });

  it("parses act activate by id", () => {
    expect(parseCommand(["act", "activate", "--id", "refresh"])).toEqual({
      kind: "action",
      action: { kind: "activate", target: { id: "refresh" } },
    });
  });

  it("parses wait command", () => {
    expect(parseCommand(["wait", "command", "refresh"])).toEqual({
      kind: "action",
      action: { kind: "waitCommand", id: "refresh" },
    });
  });

  it("parses expect text and expect node", () => {
    expect(parseCommand(["expect", "text", "Updated"])).toEqual({
      kind: "action",
      action: { kind: "expectText", text: "Updated" },
    });
    expect(parseCommand(["expect", "node", "--role", "status", "--text", "updated"])).toEqual({
      kind: "action",
      action: { kind: "expectNode", target: { role: "status" }, text: "updated" },
    });
  });

  it("parses tree and agent-context", () => {
    expect(parseCommand(["tree"])).toEqual({ kind: "tree" });
    expect(parseCommand(["agent-context"])).toEqual({ kind: "agent-context" });
  });

  it("reports an error for an unknown command", () => {
    expect(parseCommand(["frobnicate"])).toMatchObject({ kind: "error" });
  });
});

describe("agentContext", () => {
  it("describes the action schema, selectors and error taxonomy", () => {
    const ctx = agentContext();
    expect(ctx.version).toBeGreaterThanOrEqual(1);
    expect(ctx.actions.map((a) => a.kind)).toContain("activate");
    expect(ctx.selectors).toContain("role");
    expect(ctx.errors).toContain("no_match");
  });
});

describe("runCommand", () => {
  it("runs an activate action and returns a JSON result", async () => {
    const s = session();
    const out = JSON.parse(await runCommand(s, ["act", "activate", "--role", "button", "--name", "Refresh"]));
    expect(out).toMatchObject({ ok: true });
    expect(s.commands().map((c) => c.id)).toContain("refresh");
  });

  it("prints the semantic tree as JSON", async () => {
    const s = session();
    const out = JSON.parse(await runCommand(s, ["tree"]));
    expect(out.role).toBe("group");
  });

  it("emits agent-context as JSON", async () => {
    const s = session();
    const out = JSON.parse(await runCommand(s, ["agent-context"]));
    expect(out.actions.length).toBeGreaterThan(0);
  });

  it("runs a full query->act->expect flow", async () => {
    const s = session();
    expect(JSON.parse(await runCommand(s, ["act", "activate", "--role", "button", "--name", "Refresh"])).ok).toBe(true);
    expect(JSON.parse(await runCommand(s, ["expect", "node", "--role", "status", "--text", "updated"])).ok).toBe(true);
  });
});
