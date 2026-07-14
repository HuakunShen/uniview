import { describe, expect, it } from "vitest";
import { parseUnifiedDiff } from "../src/diff";

const PATCH = `diff --git a/foo.ts b/foo.ts
--- a/foo.ts
+++ b/foo.ts
@@ -1,3 +1,4 @@
 const a = 1
-const b = 2
+const b = 3
+const c = 4
 const d = 5
`;

describe("parseUnifiedDiff", () => {
  it("parses file and hunk headers", () => {
    const files = parseUnifiedDiff(PATCH);
    expect(files).toHaveLength(1);
    const file = files[0]!;
    expect(file.oldPath).toBe("a/foo.ts");
    expect(file.newPath).toBe("b/foo.ts");
    expect(file.hunks).toHaveLength(1);
    const hunk = file.hunks[0]!;
    expect(hunk).toMatchObject({ oldStart: 1, oldCount: 3, newStart: 1, newCount: 4 });
  });

  it("classifies and numbers each line", () => {
    const hunk = parseUnifiedDiff(PATCH)[0]!.hunks[0]!;
    expect(hunk.lines.map((l) => [l.kind, l.text, l.oldLine, l.newLine])).toEqual([
      ["context", "const a = 1", 1, 1],
      ["del", "const b = 2", 2, undefined],
      ["add", "const b = 3", undefined, 2],
      ["add", "const c = 4", undefined, 3],
      ["context", "const d = 5", 3, 4],
    ]);
  });

  it("supports multiple files and default single-line hunk counts", () => {
    const multi = `--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n--- a/y\n+++ b/y\n@@ -0,0 +1 @@\n+brand new\n`;
    const files = parseUnifiedDiff(multi);
    expect(files.map((f) => f.newPath)).toEqual(["b/x", "b/y"]);
    expect(files[0]!.hunks[0]).toMatchObject({ oldStart: 1, oldCount: 1, newStart: 1, newCount: 1 });
    expect(files[1]!.hunks[0]!.lines).toEqual([
      { kind: "add", text: "brand new", oldLine: undefined, newLine: 1 },
    ]);
  });

  it("ignores the no-newline marker without consuming a line number", () => {
    const patch = `--- a/z\n+++ b/z\n@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n`;
    const lines = parseUnifiedDiff(patch)[0]!.hunks[0]!.lines;
    expect(lines.map((l) => l.kind)).toEqual(["del", "add"]);
    expect(lines[1]).toMatchObject({ newLine: 1 });
  });
});
