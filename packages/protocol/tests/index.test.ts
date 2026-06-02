import { describe, expect, test } from "vitest";
import {
  EVENT_PROPS,
  PROTOCOL_VERSION,
  extractEventName,
  handlerIdProp,
  isHandlerIdProp,
  isLayoutTag,
  isValidJSONValue,
  isValidUINode,
  validateInitializeRequest,
} from "../src";

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
});
