import { resolve } from "node:path";
import { univiewSolid } from "@uniview/tui-solid/vite";
import { defineConfig } from "vitest/config";

const external = (id: string): boolean => id.startsWith("node:");

export default defineConfig({
  plugins: [univiewSolid()],
  ssr: {
    noExternal: true,
  },
  build: {
    ssr: resolve(import.meta.dirname, "src/main.tsx"),
    target: "esnext",
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      external,
      output: {
        format: "es",
        banner: "#!/usr/bin/env node",
        entryFileNames: "[name].js",
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
