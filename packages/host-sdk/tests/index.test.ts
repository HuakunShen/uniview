import { describe, expect, test } from "vitest";
import { createComponentRegistry } from "../src/registry";

describe("createComponentRegistry", () => {
  test("registers and retrieves components by type", () => {
    const registry = createComponentRegistry<() => string>();
    const Button = () => "button";

    registry.register("Button", Button);

    expect(registry.has("Button")).toBe(true);
    expect(registry.get("Button")).toBe(Button);
    expect(registry.has("Missing")).toBe(false);
    expect(registry.get("Missing")).toBeUndefined();
  });
});
