import type { HostToPluginAPI } from "@uniview/protocol";
import { describe, expect, test } from "vitest";

describe("runtime RPC contract", () => {
  test("HostToPluginAPI does not include benchmark-specific updateItem", () => {
    type HasUpdateItem = "updateItem" extends keyof HostToPluginAPI
      ? true
      : false;
    const hasUpdateItem: HasUpdateItem = false;

    const methodNames: Array<keyof HostToPluginAPI> = [
      "initialize",
      "updateProps",
      "executeHandler",
      "destroy",
      "syncTree",
    ];

    expect(methodNames).toEqual([
      "initialize",
      "updateProps",
      "executeHandler",
      "destroy",
      "syncTree",
    ]);
    expect(hasUpdateItem).toBe(false);
  });
});
