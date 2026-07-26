import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createElement } from "react";
import type { RPCChannel, RPCMessage, Transport } from "kkrpc";
import type { HostToPluginAPI, PluginToHostAPI } from "@uniview/protocol";
import { PROTOCOL_VERSION } from "@uniview/protocol";
import { createPluginRuntime } from "../src/runtime";

/**
 * The plugin pushes updates at the host and never awaits them. When the host
 * goes away mid-flight the RPC eventually rejects (kkrpc times a request out
 * after 30s), and in a Node/Bun plugin process — the bridge/ws-client case — an
 * unhandled rejection KILLS THE PROCESS.
 *
 * That is not hypothetical: it took out the E2E suite's `simple-demo` bridge
 * client with `RPCTimeoutError: RPC request ... timed out after 30000ms`, and
 * every later test that needed that plugin failed with a plugin that was no
 * longer there. A host that closed its tab is a normal event, not a crash.
 */

const nullTransport: Transport<RPCMessage> = {
  send() {},
  subscribe() {
    return () => {};
  },
};

/** Let Node decide a promise is unhandled: it does so after the microtask
 * queue drains, so one macrotask hop is enough. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function makeRuntime(mode: "full" | "incremental") {
  const rejections: unknown[] = [];
  let exposed: HostToPluginAPI | null = null;

  const hostAPI: PluginToHostAPI = {
    updateTree() {
      return Promise.reject(new Error("RPC request timed out after 30000ms"));
    },
    applyMutations() {
      return Promise.reject(new Error("RPC request timed out after 30000ms"));
    },
    log() {},
    reportError() {},
  };

  const runtime = createPluginRuntime(
    { App: () => createElement("Button", { title: "hi" }), transport: nullTransport, mode },
    (_transport, expose) => {
      exposed = expose;
      return {
        getAPI: () => hostAPI,
        destroy() {},
      } as unknown as RPCChannel<HostToPluginAPI, PluginToHostAPI>;
    },
  );

  return {
    runtime,
    rejections,
    get plugin(): HostToPluginAPI {
      if (!exposed) throw new Error("runtime has not started");
      return exposed;
    },
  };
}

describe("a host that went away", () => {
  let rejections: unknown[];
  const onRejection = (reason: unknown) => rejections.push(reason);

  beforeEach(() => {
    rejections = [];
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    process.on("unhandledRejection", onRejection);
  });

  afterEach(() => {
    process.off("unhandledRejection", onRejection);
    vi.restoreAllMocks();
  });

  test("a rejected updateTree does not become an unhandled rejection", async () => {
    const h = makeRuntime("full");
    await h.runtime.start();

    await h.plugin.initialize({ protocolVersion: PROTOCOL_VERSION, props: {} });
    await settle();

    expect(rejections).toEqual([]);
    h.runtime.stop();
  });

  test("a rejected syncTree does not become an unhandled rejection", async () => {
    const h = makeRuntime("full");
    await h.runtime.start();

    await h.plugin.initialize({ protocolVersion: PROTOCOL_VERSION, props: {} });
    rejections.length = 0;
    await h.plugin.syncTree();
    await settle();

    expect(rejections).toEqual([]);
    h.runtime.stop();
  });

  test("a rejected applyMutations does not become an unhandled rejection", async () => {
    const h = makeRuntime("incremental");
    await h.runtime.start();

    await h.plugin.initialize({ protocolVersion: PROTOCOL_VERSION, props: {} });
    await settle();

    expect(rejections).toEqual([]);
    h.runtime.stop();
  });
});
