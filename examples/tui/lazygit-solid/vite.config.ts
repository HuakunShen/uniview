import { univiewSolid } from "@uniview/tui-solid/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [univiewSolid()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
