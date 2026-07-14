import { describe, expect, it } from "vitest";
import { handlerIdProp, TEXT_NODE_TYPE, type UINode } from "@uniview/protocol";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { TuiHost } from "../src/tui-host";
import { AutomationSession } from "../src/automation";
import { executeAction, runTrace, type AutomationActionJson } from "../src/automation-runner";

const text = (id: string, t: string): UINode => ({ id, type: TEXT_NODE_TYPE, props: {}, children: [], text: t });

function setup() {
  const styles = new StyleTable();
  const host = new TuiHost({
    surface: new MemoryCellSurface({ styles }),
    styles,
    size: { width: 30, height: 4 },
    onInvokeHandler: (id) => {
      if (id === "refresh") {
        host.applyBatch([{ type: "setText", nodeId: "st", text: "Updated" }]);
      }
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

describe("executeAction", () => {
  it("activates a control and reports success", async () => {
    const session = setup();
    const result = await executeAction(session, { kind: "activate", target: { role: "button", name: "Refresh" } });
    expect(result.ok).toBe(true);
    expect(session.commands().map((c) => c.id)).toContain("refresh");
  });

  it("reports no_match when the target is absent", async () => {
    const session = setup();
    const result = await executeAction(session, { kind: "activate", target: { role: "button", name: "Nope" } });
    expect(result).toEqual({ ok: false, error: { code: "no_match", message: expect.any(String) } });
  });

  it("expectNode passes and fails with a stable error code", async () => {
    const session = setup();
    await executeAction(session, { kind: "activate", target: { role: "button", name: "Refresh" } });

    const pass = await executeAction(session, { kind: "expectNode", target: { role: "status" }, text: "updated" });
    expect(pass.ok).toBe(true);

    const fail = await executeAction(session, { kind: "expectNode", target: { role: "status" }, text: "missing" });
    expect(fail).toMatchObject({ ok: false, error: { code: "assertion_failed" } });
  });

  it("query returns the matched node id", async () => {
    const session = setup();
    const result = await executeAction(session, { kind: "query", target: { role: "button", name: "Refresh" } });
    expect(result).toMatchObject({ ok: true, data: { id: "refresh" } });
  });

  it("rejects an unknown action kind", async () => {
    const session = setup();
    const result = await executeAction(session, { kind: "bogus" } as unknown as AutomationActionJson);
    expect(result).toMatchObject({ ok: false, error: { code: "unknown_action" } });
  });
});

describe("runTrace", () => {
  it("runs a JSON trace and returns a result per action", async () => {
    const session = setup();
    const trace: AutomationActionJson[] = [
      { kind: "activate", target: { role: "button", name: "Refresh" } },
      { kind: "waitCommand", id: "refresh" },
      { kind: "expectText", text: "updated" },
    ];
    const results = await runTrace(session, trace);
    expect(results.map((r) => r.ok)).toEqual([true, true, true]);
  });
});
