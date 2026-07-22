import { describe, expect, it } from "vitest";
import { resolveConfig, version as viteVersion } from "vite";
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

  it("sets cross-version browser conditions and deduplicates Solid", () => {
    const plugin = univiewSolid();
    const config = plugin.config({}, { command: "build", mode: "production" });

    const expected = ["module", "browser", "development|production"];
    expect(config.resolve.dedupe).toEqual(["solid-js"]);
    expect(config.resolve.conditions).toEqual(expected);
    expect(config.ssr.resolve.conditions).toEqual(expected);
    expect(config.resolve.conditions).not.toContain("node");
    expect(config.ssr.resolve.conditions).not.toContain("node");
  });

  it("resolves browser and never node conditions in current Vite environments", async () => {
    expect(viteVersion).toBe("8.1.5");
    const config = await resolveConfig(
      { configFile: false, plugins: [univiewSolid()] },
      "serve",
    );

    for (const environment of [
      config.environments.client,
      config.environments.ssr,
    ]) {
      expect(environment.resolve.conditions).toContain("browser");
      expect(environment.resolve.conditions).not.toContain("node");
    }
  });
});
