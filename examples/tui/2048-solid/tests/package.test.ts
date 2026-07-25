import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface PackageManifest {
  bin?: string | Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  files?: string[];
  private?: boolean;
  scripts?: Record<string, string>;
}

const manifest = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"),
) as PackageManifest;
const viteConfig = readFileSync(
  resolve(import.meta.dirname, "../vite.config.ts"),
  "utf8",
);

describe("published 2048 package", () => {
  it("exposes a built executable instead of a vite-node runtime", () => {
    const bin =
      typeof manifest.bin === "string"
        ? manifest.bin
        : manifest.bin?.["uniview-2048"];

    expect(manifest.private).not.toBe(true);
    expect(bin).toBe("./dist/main.js");
    expect(manifest.scripts?.build).toBe("vite build");
    expect(manifest.scripts?.start).toBe("node dist/main.js");
    expect(manifest.scripts?.prepack).toBe("node scripts/verify-model.mjs");
    expect(manifest.devDependencies).not.toHaveProperty("vite-node");
    expect(manifest.dependencies ?? {}).not.toHaveProperty("@uniview/tui-core");
    expect(manifest.dependencies ?? {}).not.toHaveProperty(
      "@uniview/tui-solid",
    );
    expect(manifest.dependencies ?? {}).not.toHaveProperty("solid-js");
  });

  it("ships the build output needed by npx", () => {
    expect(manifest.files).toContain("dist");
    expect(manifest.files).toContain("model");
    expect(viteConfig).toContain('banner: "#!/usr/bin/env node"');
    expect(viteConfig).toContain("noExternal: true");
    expect(viteConfig).toContain('target: "esnext"');
  });
});
