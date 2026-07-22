/**
 * Regression test: unmount() must run effect cleanups. destroy() used to
 * only drop references — plugin effects/timers kept running forever after
 * the host disconnected (worst in WebSocket mode, where each host
 * reconnect leaked another live tree).
 */
import { createElement, useEffect, useLayoutEffect } from "react";
import { describe, expect, test } from "vitest";
import {
  ReactReentrantUnmountError,
  createRenderer,
  isReactReentrantUnmountError,
  render,
  unmount,
} from "../src";
import { flush } from "./flush";

describe("unmount", () => {
  test("runs effect cleanups and clears the tree synchronously", async () => {
    let mounted = 0;
    let cleaned = 0;
    function App() {
      useEffect(() => {
        mounted++;
        return () => {
          cleaned++;
        };
      }, []);
      return createElement("div", null, "hi");
    }

    const renderer = createRenderer();
    render(createElement(App), renderer);
    await flush();
    expect(mounted).toBe(1);
    expect(renderer.rootInstance).not.toBeNull();

    unmount(renderer);
    expect(cleaned).toBe(1);
    expect(renderer.rootInstance).toBeNull();
  });

  test("rejects unmount during render and leaves the tree active", async () => {
    const renderer = createRenderer();
    let error: unknown;

    function App() {
      try {
        unmount(renderer);
      } catch (caught) {
        error = caught;
      }
      return createElement("div", null, "active");
    }

    render(createElement(App), renderer);
    await flush();

    expect(error).toMatchObject({
      name: "ReactReentrantUnmountError",
      code: "UNIVIEW_REACT_REENTRANT_UNMOUNT",
      message: expect.stringMatching(/queueMicrotask/),
    });
    expect(error).toBeInstanceOf(ReactReentrantUnmountError);
    expect(isReactReentrantUnmountError(error)).toBe(true);
    expect(
      isReactReentrantUnmountError(
        new Error(
          "Cannot destroy a React renderer during React work; schedule destroy outside render, commit, or effects (for example with queueMicrotask)",
        ),
      ),
    ).toBe(false);
    expect(renderer.rootInstance).not.toBeNull();

    unmount(renderer);
    expect(renderer.rootInstance).toBeNull();
  });

  test("rejects unmount during commit and leaves the tree active", async () => {
    const renderer = createRenderer();
    let error: unknown;

    function App() {
      useLayoutEffect(() => {
        try {
          unmount(renderer);
        } catch (caught) {
          error = caught;
        }
      }, []);
      return createElement("div", null, "active");
    }

    render(createElement(App), renderer);
    await flush();

    expect(error).toMatchObject({
      name: "ReactReentrantUnmountError",
      code: "UNIVIEW_REACT_REENTRANT_UNMOUNT",
      message: expect.stringMatching(/queueMicrotask/),
    });
    expect(error).toBeInstanceOf(ReactReentrantUnmountError);
    expect(isReactReentrantUnmountError(error)).toBe(true);
    expect(renderer.rootInstance).not.toBeNull();

    unmount(renderer);
    expect(renderer.rootInstance).toBeNull();
  });
});
