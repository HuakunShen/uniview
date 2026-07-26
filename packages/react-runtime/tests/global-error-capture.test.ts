import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RPCChannel, RPCMessage, Transport } from "kkrpc";
import type { HostToPluginAPI, PluginToHostAPI } from "@uniview/protocol";
import { createPluginRuntime } from "../src/runtime";

/**
 * A plugin in Node (the bridge/ws-client case) used to get NO global error
 * capture: `globalThis.addEventListener?.(...)` is a no-op there, so an uncaught
 * exception never reached the host's reportError.
 *
 * These run in vitest's node environment, which is exactly the environment the
 * bug was in — `globalThis.addEventListener` is undefined here.
 */

type ReportedError = { message: string; stack?: string };

/** Goes nowhere: the runtime only hands it to createChannel, which we fake. */
const nullTransport: Transport<RPCMessage> = {
  send() {},
  subscribe() {
    return () => {};
  },
};

function makeRuntime() {
  const reported: ReportedError[] = [];
  const hostAPI: PluginToHostAPI = {
    updateTree() {},
    applyMutations() {},
    log() {},
    reportError(err) {
      reported.push(err);
    },
  };

  const runtime = createPluginRuntime(
    { App: () => null, transport: nullTransport },
    () =>
      ({
        getAPI: () => hostAPI,
        destroy() {},
      }) as unknown as RPCChannel<HostToPluginAPI, PluginToHostAPI>,
  );

  return { runtime, reported };
}

/** The listener the runtime just added, so we can call it without process.emit
 * (which would also wake vitest's own uncaughtException handler). */
function lastListener(event: "uncaughtException" | "unhandledRejection") {
  const listeners = process.listeners(event);
  return listeners[listeners.length - 1] as (value: unknown) => void;
}

describe("global error capture in node", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("this environment has no addEventListener — the case the bug was in", () => {
    expect(
      (globalThis as { addEventListener?: unknown }).addEventListener,
    ).toBeUndefined();
  });

  test("start() installs process handlers and stop() removes them", async () => {
    const uncaughtBefore = process.listenerCount("uncaughtException");
    const rejectionBefore = process.listenerCount("unhandledRejection");

    const { runtime } = makeRuntime();
    await runtime.start();

    expect(process.listenerCount("uncaughtException")).toBe(uncaughtBefore + 1);
    expect(process.listenerCount("unhandledRejection")).toBe(
      rejectionBefore + 1,
    );

    runtime.stop();

    expect(process.listenerCount("uncaughtException")).toBe(uncaughtBefore);
    expect(process.listenerCount("unhandledRejection")).toBe(rejectionBefore);
  });

  test("an uncaught exception reaches the host's reportError, with its stack", async () => {
    const { runtime, reported } = makeRuntime();
    await runtime.start();
    const handler = lastListener("uncaughtException");

    const error = new Error("plugin blew up");
    handler(error);

    expect(reported).toHaveLength(1);
    expect(reported[0].message).toBe("plugin blew up");
    expect(reported[0].stack).toBe(error.stack);

    runtime.stop();
  });

  test("an unhandled rejection reaches the host's reportError", async () => {
    const { runtime, reported } = makeRuntime();
    await runtime.start();
    const handler = lastListener("unhandledRejection");

    handler("rejected with a string");

    expect(reported).toEqual([{ message: "rejected with a string" }]);

    runtime.stop();
  });

  test("a global with addEventListener keeps the browser/Worker path", async () => {
    const added: string[] = [];
    const removed: string[] = [];
    vi.stubGlobal("addEventListener", (type: string) => {
      added.push(type);
    });
    vi.stubGlobal("removeEventListener", (type: string) => {
      removed.push(type);
    });
    const uncaughtBefore = process.listenerCount("uncaughtException");

    const { runtime } = makeRuntime();
    await runtime.start();
    runtime.stop();

    expect(added).toEqual(["error", "unhandledrejection"]);
    expect(removed).toEqual(["error", "unhandledrejection"]);
    // ...and does not also double-register on process.
    expect(process.listenerCount("uncaughtException")).toBe(uncaughtBefore);

    vi.unstubAllGlobals();
  });

  test("handlers registered by one runtime stop reporting after that runtime stops", async () => {
    const { runtime, reported } = makeRuntime();
    await runtime.start();
    const handler = lastListener("uncaughtException");
    runtime.stop();

    handler(new Error("after stop"));

    expect(reported).toEqual([]);
  });
});
