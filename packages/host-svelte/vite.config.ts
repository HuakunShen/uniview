import { svelte } from "@sveltejs/vite-plugin-svelte";
/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  root: "./playground",
  plugins: [svelte()],
  test: {
    root: ".",
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
