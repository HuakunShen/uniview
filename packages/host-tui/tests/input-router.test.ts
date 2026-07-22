import { describe, expect, it } from "vitest";
import { handlerIdProp, TEXT_NODE_TYPE, type JSONValue, type UINode } from "@uniview/protocol";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { TuiHost } from "../src/tui-host";
import { InputRouter } from "../src/input-router";

function fieldProps(value: string): Record<string, JSONValue> {
  return {
    value,
    [handlerIdProp("onChange")]: "change",
    [handlerIdProp("onSubmit")]: "submit",
  };
}

function setup(initial = "") {
  const model = { value: initial, submitted: null as string | null };
  const styles = new StyleTable();
  const host = new TuiHost({
    surface: new MemoryCellSurface({ styles }),
    styles,
    size: { width: 20, height: 3 },
    onInvokeHandler: (id, payload) => {
      if (id === "change") {
        model.value = String(payload);
        host.applyBatch([{ type: "setProps", nodeId: "field", props: fieldProps(model.value) }]);
      } else if (id === "submit") {
        model.submitted = String(payload);
      } else if (id === "btn") {
        model.submitted = "clicked";
      }
    },
  });
  host.setRoot({
    id: "root",
    type: "box",
    props: {},
    children: [
      { id: "field", type: "input", props: fieldProps(initial), children: [] },
      {
        id: "button",
        type: "box",
        props: { [handlerIdProp("onClick")]: "btn" },
        children: [{ id: "bt", type: TEXT_NODE_TYPE, props: {}, children: [], text: "Go" } as UINode],
      },
    ],
  });
  const router = new InputRouter(host);
  router.onRender();
  return { host, router, model };
}

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });
const type = (t: string): TuiInputEvent => ({ type: "text", text: t });

describe("InputRouter — text editing", () => {
  it("types into a focused text field, updating the controlled value", () => {
    const { router, model } = setup();
    router.dispatch(key("Tab")); // focus the field (first focusable)
    router.dispatch(type("h"));
    router.dispatch(type("i"));
    expect(model.value).toBe("hi");
  });

  it("backspaces within the field", () => {
    const { router, model } = setup("hi");
    router.dispatch(key("Tab"));
    router.dispatch(key("Backspace"));
    expect(model.value).toBe("h");
  });

  it("submits the field on Enter without activating a button", () => {
    const { router, model } = setup("go");
    router.dispatch(key("Tab"));
    router.dispatch(key("Enter"));
    expect(model.submitted).toBe("go");
  });

  it("treats Space as a typed character, not activation", () => {
    const { router, model } = setup("a");
    router.dispatch(key("Tab"));
    router.dispatch(type(" "));
    expect(model.value).toBe("a ");
  });
});

describe("InputRouter — buttons", () => {
  it("still activates a focused button with Enter", () => {
    const { router, model } = setup();
    router.dispatch(key("Tab")); // field
    router.dispatch(key("Tab")); // button
    router.dispatch(key("Enter"));
    expect(model.submitted).toBe("clicked");
  });
});

describe("InputRouter — teardown during global input", () => {
  it("stops dispatch before the next subscriber when the first destroys the host renderer", () => {
    const { host, router } = setup();
    const calls: string[] = [];
    router.subscribeInput(() => {
      calls.push("first");
      host.renderer.destroy();
    });
    router.subscribeInput(() => calls.push("second"));

    router.dispatch(type("x"));

    expect(calls).toEqual(["first"]);
    expect(() => router.subscribeInput(() => {})).toThrow(/teardown/i);
    expect(() => router.dispatch(type("y"))).toThrow(/teardown/i);
    host.destroy();
  });
});

describe("InputRouter — onKeyDown", () => {
  function setupKeys() {
    const events: { key: string }[] = [];
    const styles = new StyleTable();
    const host = new TuiHost({
      surface: new MemoryCellSurface({ styles }),
      styles,
      size: { width: 20, height: 3 },
      onInvokeHandler: (id, payload) => {
        if (id === "keys") events.push(payload as { key: string });
      },
    });
    host.setRoot({
      id: "list",
      type: "box",
      props: { [handlerIdProp("onKeyDown")]: "keys" },
      children: [],
    });
    const router = new InputRouter(host);
    router.onRender();
    return { router, events };
  }

  it("routes key events to a focused node's onKeyDown handler", () => {
    const { router, events } = setupKeys();
    router.dispatch(key("Tab")); // focus the list
    router.dispatch(key("ArrowDown"));
    router.dispatch(key("ArrowUp"));
    expect(events.map((e) => e.key)).toEqual(["ArrowDown", "ArrowUp"]);
  });

  /**
   * A left-click focuses the exact node under the cursor. In a list that node is
   * the row — which carries onClick but no onKeyDown — so an arrow key pressed
   * right after a click used to land on the row and be dropped, silently killing
   * keyboard navigation until the user pressed Tab. Keys bubble to the nearest
   * ancestor that handles them, the same way clicks already do.
   */
  function setupRows() {
    const events: { key: string }[] = [];
    const clicks: string[] = [];
    const styles = new StyleTable();
    const host = new TuiHost({
      surface: new MemoryCellSurface({ styles }),
      styles,
      size: { width: 20, height: 3 },
      onInvokeHandler: (id, payload) => {
        if (id === "keys") events.push(payload as { key: string });
        else clicks.push(id);
      },
    });
    host.setRoot({
      id: "list",
      type: "box",
      props: { [handlerIdProp("onKeyDown")]: "keys" },
      children: [
        {
          id: "row0",
          type: "box",
          props: { [handlerIdProp("onClick")]: "click0", width: 20, height: 1 },
          // The row wraps its label, so the node actually under the cursor is
          // this text node — which is not focusable at all. That is the real
          // shape a List renders, and the reason the click used to focus nothing.
          children: [textEl("row0label", "alpha")],
        },
      ],
    });
    const router = new InputRouter(host);
    router.onRender();
    return { router, events, clicks };
  }

  const click = (x: number, y: number): TuiInputEvent => ({
    type: "mouse",
    action: "up",
    button: "left",
    x,
    y,
    ctrl: false,
    alt: false,
    shift: false,
  });

  it("bubbles keys to an ancestor handler after a click focuses a plain row", () => {
    const { router, events, clicks } = setupRows();
    router.dispatch(click(2, 0)); // click the row — focus moves to it
    expect(clicks).toEqual(["click0"]);

    router.dispatch(key("ArrowDown")); // must still reach the list
    expect(events.map((e) => e.key)).toEqual(["ArrowDown"]);
  });

  it("still activates the focused node on Enter rather than feeding the ancestor", () => {
    const { router, events, clicks } = setupRows();
    router.dispatch(click(2, 0));
    expect(clicks).toEqual(["click0"]);

    // Enter activates the focused row; it must NOT be swallowed by the list's
    // onKeyDown just because the list is now reachable by bubbling.
    router.dispatch(key("Enter"));
    expect(clicks).toEqual(["click0", "click0"]);
    expect(events).toEqual([]);
  });
});

const textEl = (id: string, t: string): UINode => ({
  id,
  type: "text",
  props: {},
  children: [{ id: `${id}_t`, type: TEXT_NODE_TYPE, props: {}, children: [], text: t }],
});

const move = (x: number, y: number): TuiInputEvent => ({
  type: "mouse",
  action: "move",
  button: "none",
  x,
  y,
  ctrl: false,
  alt: false,
  shift: false,
});
const wheel = (x: number, y: number, deltaY: -1 | 1): TuiInputEvent => ({
  type: "mouse",
  action: "wheel",
  button: "none",
  x,
  y,
  deltaY,
  ctrl: false,
  alt: false,
  shift: false,
});

describe("InputRouter — mouse hover and wheel", () => {
  function setupHover() {
    const calls: { id: string; payload: JSONValue | undefined }[] = [];
    const styles = new StyleTable();
    const host = new TuiHost({
      surface: new MemoryCellSurface({ styles }),
      styles,
      size: { width: 8, height: 3 },
      onInvokeHandler: (id, payload) => calls.push({ id, payload }),
    });
    host.setRoot({
      id: "root",
      type: "box",
      props: {},
      children: [
        {
          id: "a",
          type: "box",
          props: {
            [handlerIdProp("onMouseEnter")]: "enterA",
            [handlerIdProp("onMouseLeave")]: "leaveA",
            [handlerIdProp("onWheel")]: "wheelA",
          },
          children: [textEl("at", "AAAA")],
        },
        {
          id: "b",
          type: "box",
          props: {
            [handlerIdProp("onMouseEnter")]: "enterB",
            [handlerIdProp("onMouseLeave")]: "leaveB",
          },
          children: [textEl("bt", "BBBB")],
        },
      ],
    });
    const router = new InputRouter(host);
    router.onRender();
    return { host, router, calls };
  }

  it("fires enter/leave as the pointer moves between nodes (bubbling to the handler)", () => {
    const { router, calls } = setupHover();
    router.dispatch(move(1, 0)); // over a
    router.dispatch(move(2, 0)); // still over a — no new events
    router.dispatch(move(1, 1)); // over b
    expect(calls.map((c) => c.id)).toEqual(["enterA", "leaveA", "enterB"]);
  });

  it("fires leave when the pointer moves off all hover targets", () => {
    const { router, calls } = setupHover();
    router.dispatch(move(1, 0)); // enter a
    router.dispatch(move(1, 2)); // empty row
    expect(calls.map((c) => c.id)).toEqual(["enterA", "leaveA"]);
  });

  it("routes wheel to the nearest onWheel handler with deltaY", () => {
    const { router, calls } = setupHover();
    router.dispatch(wheel(1, 0, 1));
    expect(calls.find((c) => c.id === "wheelA")?.payload).toMatchObject({ deltaY: 1 });
  });
});

describe("InputRouter — whole-row click target", () => {
  it("clicking the empty part of a menu-item row fires its onClick", () => {
    const calls: string[] = [];
    const styles = new StyleTable();
    const host = new TuiHost({
      surface: new MemoryCellSurface({ styles }),
      styles,
      size: { width: 16, height: 1 },
      onInvokeHandler: (id) => calls.push(id),
    });
    host.setRoot({
      id: "root",
      type: "box",
      props: {},
      children: [
        {
          id: "item",
          type: "box",
          props: { [handlerIdProp("onClick")]: "pick" },
          children: [textEl("lbl", "lib.rs")],
        },
      ],
    });
    const router = new InputRouter(host);
    router.onRender();
    // The 16-wide row shows only "lib.rs" (6 cells). Click col 12 — well past
    // the label, in the empty part of the row — and it should still activate.
    router.dispatch({
      type: "mouse",
      action: "up",
      button: "left",
      x: 12,
      y: 0,
      ctrl: false,
      alt: false,
      shift: false,
    });
    expect(calls).toEqual(["pick"]);
  });
});
