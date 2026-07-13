import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    compat: "src/compat.ts",
  },
  exports: true,
});
