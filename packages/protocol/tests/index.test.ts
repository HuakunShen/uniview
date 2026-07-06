import { describe, expect, test } from "vitest";
import {
  EVENT_PROPS,
  PROTOCOL_VERSION,
  extractEventName,
  handlerIdProp,
  isHandlerIdProp,
  isLayoutTag,
  isValidJSONValue,
  isValidMutations,
  isValidUINode,
  validateExecuteHandlerArgs,
  validateInitializeRequest,
  validateMutations,
} from "../src";
import { TEXT_NODE_TYPE } from "../src/tree";

describe("protocol exports", () => {
  test("exposes a positive integer protocol version", () => {
    expect(Number.isInteger(PROTOCOL_VERSION)).toBe(true);
    expect(PROTOCOL_VERSION).toBeGreaterThan(0);
  });

  test("recognizes supported layout tags", () => {
    expect(isLayoutTag("div")).toBe(true);
    expect(isLayoutTag("Button")).toBe(false);
  });
});

describe("event handler prop helpers", () => {
  test.each(EVENT_PROPS)("round-trips %s handler IDs", (eventName) => {
    const propName = handlerIdProp(eventName);

    expect(isHandlerIdProp(propName)).toBe(true);
    expect(extractEventName(propName)).toBe(eventName);
  });

  test("rejects unknown handler-like props", () => {
    expect(isHandlerIdProp("_onUnknownHandlerId")).toBe(true);
    expect(extractEventName("_onUnknownHandlerId")).toBeNull();
  });
});

describe("runtime validators", () => {
  test("accepts valid JSON values", () => {
    expect(
      isValidJSONValue({ name: "Ada", enabled: true, count: 2, tags: ["demo"] }),
    ).toBe(true);
  });

  test("rejects function values", () => {
    expect(isValidJSONValue({ onClick: () => undefined })).toBe(false);
  });

  test("accepts a serializable UI tree", () => {
    expect(
      isValidUINode({
        id: "root",
        type: "div",
        props: { className: "container" },
        children: [
          "Hello",
          { id: "child", type: "span", props: {}, children: ["world"] },
        ],
      }),
    ).toBe(true);
  });

  test("validates initialize requests", () => {
    expect(
      validateInitializeRequest({
        protocolVersion: PROTOCOL_VERSION,
        props: { initialName: "Ada" },
      }),
    ).toEqual({
      protocolVersion: PROTOCOL_VERSION,
      props: { initialName: "Ada" },
    });
  });

  test("accepts a v3 text node in a tree", () => {
    expect(
      isValidUINode({
        id: "root",
        type: "div",
        props: {},
        children: [
          { id: "t1", type: TEXT_NODE_TYPE, props: {}, children: [], text: "hi" },
        ],
      }),
    ).toBe(true);
  });
});

describe("mutation validators", () => {
  test("accepts a well-formed v3 mutation batch", () => {
    const mutations = [
      { type: "setRoot", node: { id: "root", type: "div", props: {}, children: [] } },
      { type: "appendChild", parentId: "root", node: { id: "a", type: "span", props: {}, children: [] } },
      { type: "insertBefore", parentId: "root", node: { id: "b", type: "span", props: {}, children: [] }, beforeId: "a" },
      { type: "setText", nodeId: "t1", text: "updated" },
      { type: "setProps", nodeId: "a", props: { className: "x" } },
      { type: "removeChild", parentId: "root", nodeId: "b" },
    ];
    expect(isValidMutations(mutations)).toBe(true);
    expect(validateMutations(mutations)).toHaveLength(6);
  });

  test("rejects the retired setText-by-childIndex shape", () => {
    // The v2 shape { type: "setText", parentId, childIndex, text } must no
    // longer validate — catching a stale plugin talking to a v3 host.
    expect(
      isValidMutations([{ type: "setText", parentId: "root", childIndex: 0, text: "x" }]),
    ).toBe(false);
  });

  test("rejects an unknown mutation type", () => {
    expect(isValidMutations([{ type: "teleport", nodeId: "a" }])).toBe(false);
  });

  test("validates executeHandler positional args", () => {
    expect(validateExecuteHandlerArgs("root:onClick", [])).toBeNull();
    expect(validateExecuteHandlerArgs("root:onClick", [1, "two", null])).toBeNull();
    expect(validateExecuteHandlerArgs(42, [])).toContain("handlerId");
    expect(validateExecuteHandlerArgs("id", "not-an-array")).toContain("args");
  });
});
