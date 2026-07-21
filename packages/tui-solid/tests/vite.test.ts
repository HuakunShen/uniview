import { describe, expect, it } from "vitest";
import { univiewSolid } from "../src/vite";

describe("univiewSolid", () => {
  it("compiles TSX against the public renderer entry", async () => {
    const plugin = univiewSolid();
    const output = await plugin.transform(
      "export const App = () => <box><text>Hello</text></box>",
      "fixture.tsx",
    );

    expect(output?.code).toContain('from "@uniview/tui-solid/renderer"');
    expect(output?.code).not.toContain("@uniview/solid-renderer");
  });

  it("does not force development resolution in production builds", () => {
    const plugin = univiewSolid();
    const config = plugin.config({}, { command: "build", mode: "production" });

    expect(config.resolve.conditions).toEqual(["browser"]);
    expect(config.resolve.conditions).not.toContain("development");
    expect(config.resolve.conditions).not.toContain("production");
  });
});
