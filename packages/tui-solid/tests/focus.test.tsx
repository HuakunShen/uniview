import { describe, expect, it } from "vitest";
import { createRoot } from "solid-js";
import type { TuiKeyEvent } from "@uniview/tui-core";
import { createFocusList, nextFocus } from "../src/focus";

const key = (k: string, shift = false): TuiKeyEvent => ({
  key: k,
  ctrl: false,
  alt: false,
  shift,
  meta: false,
});

describe("nextFocus", () => {
  it("Tab cycles forward with wrap", () => {
    expect(nextFocus(0, 3, "Tab", false)).toBe(1);
    expect(nextFocus(2, 3, "Tab", false)).toBe(0);
  });
  it("Shift+Tab cycles backward with wrap", () => {
    expect(nextFocus(0, 3, "Tab", true)).toBe(2);
  });
  it("a digit jumps to that 1-based panel", () => {
    expect(nextFocus(0, 5, "3", false)).toBe(2);
  });
  it("returns null for out-of-range digits and other keys", () => {
    expect(nextFocus(0, 3, "9", false)).toBeNull();
    expect(nextFocus(0, 3, "x", false)).toBeNull();
  });
});

describe("createFocusList", () => {
  it("cycles focus on Tab / Shift+Tab and reports the key as consumed", () => {
    createRoot((dispose) => {
      const focus = createFocusList(3);
      expect(focus.focused()).toBe(0);
      expect(focus.handleKey(key("Tab"))).toBe(true);
      expect(focus.focused()).toBe(1);
      expect(focus.handleKey(key("Tab", true))).toBe(true);
      expect(focus.focused()).toBe(0);
      dispose();
    });
  });

  it("jumps to a 1-based panel on a digit key", () => {
    createRoot((dispose) => {
      const focus = createFocusList(5);
      expect(focus.handleKey(key("4"))).toBe(true);
      expect(focus.focused()).toBe(3);
      dispose();
    });
  });

  it("does not consume unhandled keys and leaves focus untouched", () => {
    createRoot((dispose) => {
      const focus = createFocusList(3, 2);
      expect(focus.focused()).toBe(2);
      expect(focus.handleKey(key("x"))).toBe(false);
      expect(focus.handleKey(key("9"))).toBe(false);
      expect(focus.focused()).toBe(2);
      dispose();
    });
  });

  it("setFocused overrides the index", () => {
    createRoot((dispose) => {
      const focus = createFocusList(4);
      focus.setFocused(3);
      expect(focus.focused()).toBe(3);
      dispose();
    });
  });
});
