import { afterEach, describe, expect, test } from "vitest";
import { DEFAULT_HOST_ENVIRONMENT } from "@uniview/protocol";
import type { RPCChannel, RPCMessage, Transport } from "kkrpc";
import type { HostToPluginAPI, PluginToHostAPI } from "@uniview/protocol";
import { createPluginRuntime } from "../src/runtime";
import {
  getHostEnvironment,
  resetHostEnvironment,
  setHostEnvironment,
} from "../src/environment";

/**
 * The environment store is module-level ("one Worker, one process, one React
 * root"). On the main thread that premise does not hold, so tearing a runtime
 * down has to clear it — otherwise the next plugin in the process opens in the
 * previous plugin's dark mode and accent color.
 */

const nullTransport: Transport<RPCMessage> = {
  send() {},
  subscribe() {
    return () => {};
  },
};

const hostAPI: PluginToHostAPI = {
  updateTree() {},
  applyMutations() {},
  log() {},
  reportError() {},
};

/** Returns the HostToPluginAPI the runtime exposes, captured on the way past. */
function makeRuntime() {
  let pluginAPI: HostToPluginAPI | null = null;
  const runtime = createPluginRuntime(
    { App: () => null, transport: nullTransport },
    (_transport, expose) => {
      pluginAPI = expose;
      return {
        getAPI: () => hostAPI,
        destroy() {},
      } as unknown as RPCChannel<HostToPluginAPI, PluginToHostAPI>;
    },
  );
  return { runtime, api: () => pluginAPI as HostToPluginAPI };
}

afterEach(() => {
  resetHostEnvironment();
});

describe("resetHostEnvironment", () => {
  test("clears every key, not just the ones the default names", () => {
    setHostEnvironment({
      colorScheme: "dark",
      accentColor: "#ff0055",
      reduceMotion: true,
    });

    resetHostEnvironment();

    expect(getHostEnvironment()).toEqual(DEFAULT_HOST_ENVIRONMENT);
  });

  test("is a no-op on an already-default store, so the snapshot keeps its identity", () => {
    resetHostEnvironment();
    const snapshot = getHostEnvironment();

    resetHostEnvironment();

    // useSyncExternalStore re-renders on identity change: a reset that rebuilt
    // the object would re-render every subscriber for nothing.
    expect(getHostEnvironment()).toBe(snapshot);
  });
});

describe("runtime teardown clears the host environment", () => {
  test("destroy() drops back to the default", async () => {
    const { runtime, api } = makeRuntime();
    await runtime.start();

    await api().setEnvironment({ colorScheme: "dark", accentColor: "#ff0055" });
    expect(getHostEnvironment().colorScheme).toBe("dark");

    await api().destroy();

    expect(getHostEnvironment()).toEqual(DEFAULT_HOST_ENVIRONMENT);
    runtime.stop();
  });

  test("stop() drops back to the default", async () => {
    const { runtime, api } = makeRuntime();
    await runtime.start();
    await api().setEnvironment({ colorScheme: "dark" });

    runtime.stop();

    expect(getHostEnvironment()).toEqual(DEFAULT_HOST_ENVIRONMENT);
  });

  test("a second plugin in the same process does not inherit the first one's environment", async () => {
    const first = makeRuntime();
    await first.runtime.start();
    await first.api().setEnvironment({
      colorScheme: "dark",
      accentColor: "#ff0055",
      reduceMotion: true,
    });
    first.runtime.stop();

    const second = makeRuntime();
    await second.runtime.start();

    expect(getHostEnvironment()).toEqual(DEFAULT_HOST_ENVIRONMENT);
    second.runtime.stop();
  });
});
