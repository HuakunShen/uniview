import { defineConfig } from "tsdown";

const bundledWorkspacePackages = [
  /^@uniview\/(?:host-tui|react-renderer|tui-content|tui-charts|protocol|style)(?:\/.*)?$/,
];

export default defineConfig({
  entry: {
    index: "src/index.ts",
    compat: "src/compat.ts",
  },
  deps: {
    alwaysBundle: bundledWorkspacePackages,
    dts: { alwaysBundle: bundledWorkspacePackages },
  },
  exports: true,
});
