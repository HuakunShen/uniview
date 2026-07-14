import { describe, expect, it } from "vitest";
import { detectLanguage } from "../src/filetype";

describe("detectLanguage", () => {
  it("maps common extensions to highlight.js language ids", () => {
    expect(detectLanguage("main.ts")).toBe("typescript");
    expect(detectLanguage("app.tsx")).toBe("typescript");
    expect(detectLanguage("index.js")).toBe("javascript");
    expect(detectLanguage("lib.rs")).toBe("rust");
    expect(detectLanguage("run.py")).toBe("python");
    expect(detectLanguage("go.mod")).toBe(undefined); // not a code ext we map
    expect(detectLanguage("main.go")).toBe("go");
    expect(detectLanguage("data.json")).toBe("json");
    expect(detectLanguage("conf.yaml")).toBe("yaml");
    expect(detectLanguage("README.md")).toBe("markdown");
  });

  it("handles full paths and uppercase extensions", () => {
    expect(detectLanguage("/src/deep/File.TS")).toBe("typescript");
    expect(detectLanguage("./a/b/c.PY")).toBe("python");
  });

  it("recognizes well-known basenames without extensions", () => {
    expect(detectLanguage("Dockerfile")).toBe("dockerfile");
    expect(detectLanguage("/repo/Makefile")).toBe("makefile");
  });

  it("returns undefined for unknown or extensionless files", () => {
    expect(detectLanguage("notes")).toBe(undefined);
    expect(detectLanguage("archive.xyz")).toBe(undefined);
  });
});
