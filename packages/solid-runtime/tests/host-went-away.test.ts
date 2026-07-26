import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { RPCChannel, RPCMessage, Transport } from "kkrpc";
import type { HostToPluginAPI, PluginToHostAPI } from "@uniview/protocol";
import { PROTOCOL_VERSION } from "@uniview/protocol";
import { createElement } from "@uniview/solid-renderer";
import { createSolidPluginRuntime } from "../src/runtime";

/**
 * The plugin pushes updates at the host and never awaits them. When the host
 * goes away mid-flight the RPC eventually rejects (kkrpc times a request out
 * after 30s), and in a Node/Bun plugin process — the bridge/ws-client case — an
 * unhandled rejection KILLS THE PROCESS. See the react-runtime twin of this
 * file: that is how the E2E suite's `simple-demo` bridge client died.
 */

const nullTransport: Transport<RPCMessage> = {
  send() {},
  subscribe() {
    return () => {};
  },
};

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function makeRuntime(mode: "full" | "incremental") {
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

  const runtime = createSolidPluginRuntime(
    {
      App: () => createElement("Button") as unknown as ReturnType<() => never>,
      transport: nullTransport,
      mode,
    },
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
    get plugin(): HostToPluginAPI {
      if (!exposed) throw new Error("runtime has not started");
      return exposed;
    },
  };
}

describe("a host that went away", () => {
  let rejections: unknown[] = [];
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
    await settle();
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
