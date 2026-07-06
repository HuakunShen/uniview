/**
 * Regression test: unmount() must run effect cleanups. destroy() used to
 * only drop references — plugin effects/timers kept running forever after
 * the host disconnected (worst in WebSocket mode, where each host
 * reconnect leaked another live tree).
 */
import { createElement, useEffect } from "react";
import { describe, expect, test } from "vitest";
import { createRenderer, render, unmount } from "../src";

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 30));
}

describe("unmount", () => {
  test("runs effect cleanups and clears the tree", async () => {
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
    await flush();
    expect(cleaned).toBe(1);
    expect(renderer.rootInstance).toBeNull();
  });
});
