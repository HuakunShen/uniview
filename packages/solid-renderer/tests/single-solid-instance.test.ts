/**
 * Every package in this workspace MUST resolve the same physical copy of
 * solid-js.
 *
 * Solid's reactive graph is module-level state. An effect created by copy A
 * reads a signal owned by copy B without subscribing to it, because the
 * `Listener` each copy consults is its own. Nothing throws — the eager first
 * render still produces a correct tree, and then no update ever arrives again.
 *
 * That is not a thought experiment. A `"solid-js": "1.9.10"` devDependency on
 * this package, while every plugin resolved 1.9.11, made
 * `@uniview/solid-renderer` render into a different reactive graph than the
 * plugin's signals lived in. Every Solid demo mounted correctly and then
 * ignored every click, for weeks — and the only warning was one line Solid
 * itself printed into the E2E log: "You appear to have multiple instances of
 * Solid."
 *
 * The fix is the `solid-js` entry in pnpm-workspace.yaml's catalog. This test
 * is what stops the next `pnpm add -D solid-js@x.y.z` from undoing it.
 */
import { existsSync, readdirSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");

/** Workspace member directories, per pnpm-workspace.yaml's globs. */
function workspaceDirs(): string[] {
  const dirs: string[] = [join(repoRoot, "learn")];
  for (const group of ["packages", "examples", "examples/tui"]) {
    const base = join(repoRoot, group);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = join(base, entry.name);
      if (existsSync(join(dir, "package.json"))) dirs.push(dir);
    }
  }
  return dirs;
}

function resolvedSolidCopies(): Map<string, string> {
  const byPackage = new Map<string, string>();
  for (const dir of workspaceDirs()) {
    const link = join(dir, "node_modules", "solid-js");
    if (!existsSync(link)) continue;
    byPackage.set(dir.slice(repoRoot.length + 1), realpathSync(link));
  }
  return byPackage;
}

describe("solid-js is a singleton across the workspace", () => {
  test("the workspace actually resolves solid-js somewhere", () => {
    // Guards against this whole file silently passing on a bad path or a
    // node_modules layout it does not understand.
    expect(resolvedSolidCopies().size).toBeGreaterThan(0);
  });

  test("every package that resolves solid-js resolves the same copy", () => {
    const byPackage = resolvedSolidCopies();
    const copies = new Set(byPackage.values());

    if (copies.size > 1) {
      const detail = [...byPackage]
        .map(([pkg, path]) => `  ${pkg} -> ${path}`)
        .sort()
        .join("\n");
      throw new Error(
        `solid-js resolves to ${copies.size} different copies; every package sharing a ` +
          `reactive graph must resolve one. Point the offender at "catalog:".\n${detail}`,
      );
    }

    expect(copies.size).toBe(1);
  });
});
