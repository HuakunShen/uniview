import { describe, expect, it } from "vitest";
import { handlerIdProp, TEXT_NODE_TYPE, type JSONValue, type UINode } from "@uniview/protocol";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createControllerHost } from "../src/controller-host";

const text = (id: string, t: string): UINode => ({ id, type: TEXT_NODE_TYPE, props: {}, children: [], text: t });

const counterTree = (n: number): UINode => ({
  id: "root",
  type: "box",
  props: { flexDirection: "column" },
  children: [
    { id: "count", type: "text", props: {}, children: [text("ct", `Count: ${n}`)] },
    {
      id: "inc",
      type: "box",
      props: { [handlerIdProp("onClick")]: "inc", backgroundColor: "blue", width: 5, height: 1 },
      children: [text("bt", "+")],
    },
  ],
});

/**
 * A fake PluginController standing in for a Worker/WebSocket controller: it
 * holds tree state, notifies subscribers, and on executeHandler("inc") mutates
 * its state and re-emits — exactly the remote round-trip a real plugin performs.
 */
function fakeController() {
  let count = 0;
  const subs = new Set<(tree: UINode | null) => void>();
  const calls: { id: string; args?: JSONValue[] }[] = [];
  const emit = () => subs.forEach((cb) => cb(counterTree(count)));
  return {
    calls,
    controller: {
      executeHandler(id: string, args?: JSONValue[]) {
        calls.push({ id, args });
        if (id === "inc") {
          count += 1;
          emit();
        }
      },
      subscribe(cb: (tree: UINode | null) => void) {
        subs.add(cb);
        return () => subs.delete(cb);
      },
      async connect() {
        emit(); // initial render
      },
    },
  };
}

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });

describe("createControllerHost", () => {
  it("renders the tree pushed by the controller on connect", async () => {
    const { controller } = fakeController();
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const bound = createControllerHost(controller, { surface, styles, size: { width: 20, height: 3 } });

    await bound.connect();
    expect(surface.lines({ trimRight: true })[0]).toBe("Count: 0");
    await bound.destroy();
  });

  it("routes input to executeHandler and re-renders the controller's update", async () => {
    const { controller, calls } = fakeController();
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const bound = createControllerHost(controller, { surface, styles, size: { width: 20, height: 3 } });
    await bound.connect();

    // Tab to the button, activate it -> executeHandler("inc") -> controller
    // mutates + re-emits -> host re-renders.
    bound.dispatchInput(key("Tab"));
    bound.dispatchInput(key("Enter"));

    expect(calls.map((c) => c.id)).toContain("inc");
    expect(surface.lines({ trimRight: true })[0]).toBe("Count: 1");
    await bound.destroy();
  });
});
