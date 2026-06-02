import { describe, expect, test } from "vitest";
import {
  connectSolidToHostServer,
  createSolidPluginRuntime,
  createSolidWebSocketPluginClient,
  startSolidWorkerPlugin,
} from "../src";

describe("solid runtime exports", () => {
  test("exposes public runtime entry points", () => {
    expect(createSolidPluginRuntime).toBeDefined();
    expect(startSolidWorkerPlugin).toBeDefined();
    expect(createSolidWebSocketPluginClient).toBeDefined();
    expect(connectSolidToHostServer).toBeDefined();
  });
});
