import { transformAsync } from "@babel/core";
import ts from "@babel/preset-typescript";
import solid from "babel-preset-solid";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

/**
 * Compile Solid JSX for the custom universal renderer (@uniview/solid-renderer).
 *
 * This is why the demo runs under `vite-node` rather than `tsx` like its React
 * twin: esbuild (which `tsx` uses) only knows the React-style JSX transform and
 * would emit `React.createElement`-shaped calls. Solid's universal renderer
 * needs babel-preset-solid, so the runner has to be one that can host a babel
 * plugin. The same config serves `vite-node src/main.tsx` and vitest.
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
  // Use Solid's reactive (development/browser) build; Node would otherwise
  // resolve the SSR build via the "server" export condition, and nothing would
  // ever update.
  resolve: {
    conditions: ["development", "browser"],
  },
  ssr: {
    noExternal: ["solid-js", "@uniview/solid-renderer", "@uniview/tui-solid"],
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    server: {
      deps: { inline: [/solid-js/, /@uniview\/solid-renderer/, /@uniview\/tui-solid/] },
    },
  },
});
