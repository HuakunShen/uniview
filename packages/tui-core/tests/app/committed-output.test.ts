import { describe, expect, it } from "vitest";
import { CommittedOutput } from "../../src/app/committed-output";

function capture() {
  const chunks: string[] = [];
  return {
    write: (s: string) => chunks.push(s),
    out: () => chunks.join(""),
    reset: () => (chunks.length = 0),
  };
}

describe("CommittedOutput", () => {
  it("writes each committed line once, SGR-encoded, and tracks a high-water mark", () => {
    const io = capture();
    const channel = new CommittedOutput({ write: io.write });

    channel.commit([[{ text: "first" }], [{ text: "second" }]]);
    expect(io.out()).toContain("first");
    expect(io.out()).toContain("second");
    expect(channel.committedLines).toBe(2);

    io.reset();
    channel.commit([[{ text: "third", style: { fg: "red" } }]]);
    const out = io.out();
    expect(out).toContain("third");
    expect(out).toContain("\x1b[0;31m"); // red SGR for the styled span
    expect(out).not.toContain("first"); // already-committed lines are never re-emitted
    expect(channel.committedLines).toBe(3);
  });

  it("writes nothing for an empty commit", () => {
    const io = capture();
    const channel = new CommittedOutput({ write: io.write });
    channel.commit([]);
    expect(io.out()).toBe("");
    expect(channel.committedLines).toBe(0);
  });
});
