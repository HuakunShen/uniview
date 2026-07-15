import { describe, expect, it } from "vitest";
import { splitStableMarkdown } from "../src/streaming";

describe("splitStableMarkdown", () => {
  it("keeps completed blocks stable and the last block as the tail", () => {
    const md = "# Title\n\nfirst paragraph\n\nsecond para in progress";
    const { stable, tail } = splitStableMarkdown(md);
    expect(stable).toBe("# Title\n\nfirst paragraph\n\n");
    expect(tail).toBe("second para in progress");
  });

  it("treats an unterminated fenced code block as the unstable tail", () => {
    const md = "intro text\n\n```ts\nconst x = 1\nconst y = 2";
    const { stable, tail } = splitStableMarkdown(md);
    expect(stable).toBe("intro text\n\n");
    expect(tail).toBe("```ts\nconst x = 1\nconst y = 2");
  });

  it("does not split on blank lines inside a closed code fence", () => {
    const md = "```ts\na\n\nb\n```\n\ntail";
    const { stable, tail } = splitStableMarkdown(md);
    expect(stable).toBe("```ts\na\n\nb\n```\n\n");
    expect(tail).toBe("tail");
  });

  it("returns everything as tail when there is no completed block yet", () => {
    const { stable, tail } = splitStableMarkdown("just a partial line");
    expect(stable).toBe("");
    expect(tail).toBe("just a partial line");
  });

  it("stable + tail always reconstruct the input", () => {
    for (const md of ["", "a", "a\n\nb", "```\nx\n", "# h\n\n- one\n- two\n\nmore"]) {
      const { stable, tail } = splitStableMarkdown(md);
      expect(stable + tail).toBe(md);
    }
  });
});
