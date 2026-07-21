import { transformAsync } from "@babel/core";
import ts from "@babel/preset-typescript";
import solid from "babel-preset-solid";
import { defineConfig, type TsdownPlugin } from "tsdown";

const bundledWorkspacePackages = [
  /^@uniview\/(?:host-tui|solid-renderer|tui-content|tui-charts|protocol|style)(?:\/.*)?$/,
];

/**
 * Transform `.tsx` source with babel-preset-solid targeting the custom
 * universal renderer (@uniview/solid-renderer). Mirrors the `solidUniversal()`
 * plugin in vitest.config.ts exactly — esbuild/rolldown's default JSX
 * transform (or tsconfig's `"jsx": "preserve"`) is not aware of Solid's
 * universal-renderer calling convention and must not see `.tsx` files.
 */
function solidUniversal(): TsdownPlugin {
  return {
    name: "solid-universal",
    enforce: "pre",
    async transform(code, id) {
      if (!id.endsWith(".tsx")) return null;
      const result = await transformAsync(code, {
        filename: id,
        presets: [
          [
            solid,
            { moduleName: "@uniview/solid-renderer", generate: "universal" },
          ],
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
  entry: [
    "src/index.ts",
    "src/renderer.ts",
    "src/vite.ts",
    "src/jsx-runtime.ts",
  ],
  deps: {
    alwaysBundle: bundledWorkspacePackages,
    dts: { alwaysBundle: bundledWorkspacePackages },
  },
  exports: true,
  plugins: [solidUniversal()],
});
