/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  root: ".",
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
