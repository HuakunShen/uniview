import { transformAsync } from "@babel/core";
import typescript from "@babel/preset-typescript";
import solid from "babel-preset-solid";

export interface UniviewSolidTransformResult {
  code: string;
  /** Rollup-compatible JSON source map. */
  map: string | null;
}

export interface UniviewSolidVitePlugin {
  name: string;
  enforce: "pre";
  transform(
    code: string,
    id: string,
  ): Promise<UniviewSolidTransformResult | null>;
  config(
    config: object,
    environment: { command: "build" | "serve"; mode: string },
  ): {
    resolve: { conditions: string[]; dedupe: string[] };
    ssr: {
      noExternal: string[];
      resolve: { conditions: string[] };
    };
  };
}

/**
 * Compile Solid TSX for Uniview's terminal renderer in Vite and vite-node.
 *
 * The helper deliberately uses a structural plugin interface so consumers do
 * not need Vite installed at runtime. Vite is a normal application build tool.
 */
export function univiewSolid(): UniviewSolidVitePlugin {
  return {
    name: "uniview-solid",
    enforce: "pre",
    async transform(code, id) {
      if (!id.endsWith(".tsx")) return null;
      const result = await transformAsync(code, {
        filename: id,
        presets: [
          [
            solid,
            {
              moduleName: "@uniview/tui-solid/renderer",
              generate: "universal",
            },
          ],
          [typescript],
        ],
        sourceMaps: true,
      });
      if (!result?.code) return null;
      return {
        code: result.code,
        map: result.map ? JSON.stringify(result.map) : null,
      };
    },
    config(_config, _environment) {
      const conditions = ["module", "browser", "development|production"];
      return {
        resolve: {
          conditions,
          dedupe: ["solid-js"],
        },
        ssr: {
          resolve: { conditions },
          noExternal: [
            "solid-js",
            "@uniview/tui-solid",
            "@uniview/tui-solid/renderer",
          ],
        },
      };
    },
  };
}
