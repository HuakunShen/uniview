import { transformAsync } from "@babel/core";
import ts from "@babel/preset-typescript";
import solid from "babel-preset-solid";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Transform `.tsx` test files with babel-preset-solid targeting the custom
 * universal renderer (@uniview/solid-renderer), the same setup the Solid demo
 * builds with. Runs before esbuild so the JSX is already lowered.
 */
function solidUniversal(): Plugin {
  return {
    name: "solid-universal",
    enforce: "pre",
    async transform(code, id) {
      if (!id.endsWith(".tsx")) return null;
      const result = await transformAsync(code, {
        filename: id,
        presets: [
          [solid, { moduleName: "@uniview/solid-renderer", generate: "universal" }],
          [ts],
        ],
        sourceMaps: true,
      });
      if (!result?.code) return null;
      return { code: result.code, map: result.map };
    },
  };
}

export default defineConfig({
  plugins: [solidUniversal()],
  // Use Solid's reactive (browser/development) build, not the SSR build Node
  // would otherwise resolve via the "server" export condition.
  resolve: {
    conditions: ["development", "browser"],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    server: {
      deps: { inline: [/solid-js/, /@uniview\/solid-renderer/] },
    },
  },
});
