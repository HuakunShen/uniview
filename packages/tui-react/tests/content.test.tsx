import { describe, expect, it } from "vitest";
import { createElement as h, type ReactElement } from "react";
import {
  defaultSyntaxTheme,
  MemoryCellSurface,
  StyleTable,
  styleForScope,
} from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { Code, Diff, Markdown, StreamingMarkdown } from "../src/content";

const tick = () => new Promise((r) => setTimeout(r, 20));

function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { root, surface, styles };
}

describe("Markdown component", () => {
  it("renders markdown through React → UINode → host → cells", async () => {
    const { root, surface } = mount(
      h(Markdown, { content: "# Hi\n\nhello **world**", width: 20 }),
      20,
      4,
    );
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("Hi");
    expect(text).toContain("hello world");
    root.destroy();
  });
});

describe("StreamingMarkdown component", () => {
  it("renders completed blocks and the in-progress tail together", async () => {
    const { root, surface } = mount(
      h(StreamingMarkdown, { content: "# A\n\nbody being typed", width: 20 }),
      20,
      4,
    );
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("A");
    expect(text).toContain("body being typed");
    root.destroy();
  });

  it("keeps rendering as more tokens stream in", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 24, height: 6 } });
    root.render(h(StreamingMarkdown, { content: "# Doc\n\nhello", width: 24 }));
    await tick();
    root.render(h(StreamingMarkdown, { content: "# Doc\n\nhello world\n\nmore", width: 24 }));
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("Doc");
    expect(text).toContain("hello world");
    expect(text).toContain("more");
    root.destroy();
  });
});

describe("Code component", () => {
  it("highlights code and detects language from a filename", async () => {
    const { root, surface } = mount(h(Code, { content: "const x = 1", filename: "a.ts" }), 20, 1);
    await tick();
    const frame = surface.cells();
    expect(surface.text({ trimRight: true })).toContain("const x = 1");
    // "const" keyword carries the syntax color end-to-end
    const styleId = frame?.cells[0]?.[0]?.styleId ?? 0;
    expect(frame?.styles[styleId]?.fg).toEqual(styleForScope(defaultSyntaxTheme, "keyword").fg);
    root.destroy();
  });
});

describe("Diff component", () => {
  it("renders a unified diff with add/remove lines", async () => {
    const patch = "--- a/x\n+++ b/x\n@@ -1 +1 @@\n-old\n+new\n";
    const { root, surface } = mount(h(Diff, { patch, showFileHeader: false }), 30, 4);
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("- old");
    expect(text).toContain("+ new");
    root.destroy();
  });
});
