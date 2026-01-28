import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "ws-server": "src/ws-server-entry.ts",
    "ws-client": "src/ws-client-entry.ts",
  },
  exports: true,
});
