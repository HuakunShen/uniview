import { describe, expect, test } from "vitest";
import { ComponentRenderer, PluginHost } from "../src";

describe("host-svelte exports", () => {
  test("exports the public host components", () => {
    expect(PluginHost).toBeDefined();
    expect(ComponentRenderer).toBeDefined();
  });
});
