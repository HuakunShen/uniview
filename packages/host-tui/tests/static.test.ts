import { describe, expect, it } from "vitest";
import { CommittedOutput, MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import type { UINode } from "@uniview/protocol";
import { TuiHost } from "../src/tui-host";

function logNode(lines: string[]): UINode {
  return { id: "log", type: "box", props: { role: "log", staticLines: lines, height: 0 }, children: [] };
}

function capture() {
  const chunks: string[] = [];
  return {
    write: (s: string) => chunks.push(s),
    out: () => chunks.join(""),
    reset: () => (chunks.length = 0),
  };
}

describe("Static committed output (host)", () => {
  it("commits each line once and never repaints it on re-render", () => {
    const io = capture();
    const styles = new StyleTable();
    const host = new TuiHost({
      surface: new MemoryCellSurface({ styles }),
      size: { width: 20, height: 3 },
      styles,
      committed: new CommittedOutput({ write: io.write }),
    });

    host.setRoot(logNode(["first", "second"]));
    expect(io.out()).toContain("first");
    expect(io.out()).toContain("second");

    // A live re-render with the SAME committed lines writes nothing new.
    io.reset();
    host.setRoot(logNode(["first", "second"]));
    expect(io.out()).toBe("");

    // Appending a line commits only the new one.
    io.reset();
    host.setRoot(logNode(["first", "second", "third"]));
    expect(io.out()).toContain("third");
    expect(io.out()).not.toContain("first");
  });
});
