import { describe, expect, test } from "vitest";
import {
  connectToHostServer,
  createPluginRuntime,
  createWebSocketPluginClient,
  startWorkerPlugin,
} from "../src";

describe("react runtime exports", () => {
  test("exposes public runtime entry points", () => {
    expect(createPluginRuntime).toBeDefined();
    expect(startWorkerPlugin).toBeDefined();
    expect(createWebSocketPluginClient).toBeDefined();
    expect(connectToHostServer).toBeDefined();
  });
});
