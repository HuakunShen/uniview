import { describe, expect, it } from "vitest";
import { handlerIdProp, TEXT_NODE_TYPE, type UINode } from "@uniview/protocol";
import { MemoryCellSurface, StyleTable, keyEvent, type TuiInputEvent } from "@uniview/tui-core";
import { TuiHost } from "../src/tui-host";
import { InputRouter } from "../src/input-router";

const text = (t: string): TuiInputEvent => ({ type: "text", text: t });

function setup(root: UINode) {
  const clicks: string[] = [];
  const styles = new StyleTable();
  const host = new TuiHost({
    surface: new MemoryCellSurface({ styles }),
    styles,
    size: { width: 20, height: 3 },
    onInvokeHandler: (id) => clicks.push(id),
  });
  host.setRoot(root);
  const router = new InputRouter(host);
  router.onRender();
  return { host, router, clicks };
}

describe("InputRouter.subscribeInput", () => {
  it("forwards unconsumed key/text and every paste to subscribers", () => {
    const { router } = setup({ id: "root", type: "box", props: {}, children: [] });
    const got: TuiInputEvent[] = [];
    const unsub = router.subscribeInput((e) => got.push(e));

    router.dispatch(text("q")); // nothing focused → global
    router.dispatch(keyEvent("Escape")); // nothing focused → global
    router.dispatch({ type: "paste", text: "pasted" }); // paste is always global

    expect(got).toEqual([{ type: "text", text: "q" }, keyEvent("Escape"), { type: "paste", text: "pasted" }]);

    unsub();
    router.dispatch(text("z"));
    expect(got).toHaveLength(3); // unsubscribed
  });

  it("does NOT forward events a focused control consumed", () => {
    const { router } = setup({
      id: "root",
      type: "box",
      props: {},
      children: [
        {
          id: "btn",
          type: "box",
          props: { [handlerIdProp("onClick")]: "go" },
          children: [{ id: "l", type: TEXT_NODE_TYPE, props: {}, children: [], text: "Go" } as UINode],
        },
      ],
    });
    const got: TuiInputEvent[] = [];
    router.subscribeInput((e) => got.push(e));

    router.dispatch(keyEvent("Tab")); // focus the button (focus-move, consumed)
    router.dispatch(keyEvent("Enter")); // activates the focused button (consumed)

    expect(got).toEqual([]); // neither leaked to the global layer
  });
});
