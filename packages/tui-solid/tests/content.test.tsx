import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { renderMarkdown, splitStableMarkdown } from "@uniview/tui-content";
import { createTuiSolidRoot } from "../src/index";
import { Code, Diff, Markdown, StreamingMarkdown } from "../src/content";

// Wrap the real renderer so the streaming-reuse test can count parses.
vi.mock("@uniview/tui-content", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@uniview/tui-content")>();
  return { ...actual, renderMarkdown: vi.fn(actual.renderMarkdown) };
});

const tick = () => new Promise((r) => setTimeout(r, 20));

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  return { root, surface, styles };
}

beforeEach(() => {
  vi.mocked(renderMarkdown).mockClear();
});

describe("Markdown", () => {
  it("renders markdown through Solid → UINode → host → cells", async () => {
    const { root, surface } = mount(
      () => <Markdown content={"# Hi\n\nhello **world**"} width={20} />,
      20,
      4,
    );
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("Hi");
    expect(text).toContain("hello world");
    root.destroy();
  });

  it("re-renders when the content signal changes", async () => {
    const [content, setContent] = createSignal("first");
    const { root, surface } = mount(() => <Markdown content={content()} width={20} />, 20, 4);
    await tick();
    expect(surface.text({ trimRight: true })).toContain("first");

    setContent("second");
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("second");
    expect(text).not.toContain("first");
    root.destroy();
  });
});

describe("Code", () => {
  it("renders highlighted code for an explicit language", async () => {
    const { root, surface } = mount(
      () => <Code content={"const x = 1;"} language="typescript" />,
      24,
      3,
    );
    await tick();
    expect(surface.text({ trimRight: true })).toContain("const x = 1;");
    root.destroy();
  });

  it("infers the language from the filename when `language` is absent", async () => {
    const { root, surface, styles } = mount(
      () => <Code content={"const x = 1;"} filename="a.ts" />,
      24,
      3,
    );
    await tick();
    expect(surface.text({ trimRight: true })).toContain("const x = 1;");
    // Detection actually ran: `const` is highlighted as a keyword, not plain.
    const frame = surface.cells()!;
    const fgs = frame.cells[0]!.slice(0, 5).map((c) => styles.get(c.styleId).fg);
    expect(fgs.some((fg) => fg !== undefined)).toBe(true);
    root.destroy();
  });
});

describe("Diff", () => {
  it("renders a unified diff with its sign column", async () => {
    const patch = [
      "--- a/f.ts",
      "+++ b/f.ts",
      "@@ -1,2 +1,2 @@",
      " keep",
      "-old",
      "+new",
    ].join("\n");
    const { root, surface } = mount(() => <Diff patch={patch} language="typescript" />, 30, 8);
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("old");
    expect(text).toContain("new");
    root.destroy();
  });
});

describe("StreamingMarkdown", () => {
  it("renders completed blocks and the in-progress tail together", async () => {
    const { root, surface } = mount(
      () => <StreamingMarkdown content={"# A\n\nbody being typed"} width={24} />,
      24,
      6,
    );
    await tick();
    const text = surface.text({ trimRight: true });
    expect(text).toContain("A");
    expect(text).toContain("body being typed");
    root.destroy();
  });

  /**
   * The whole point of StreamingMarkdown: as tokens arrive, only the tail should
   * be re-parsed — already-complete blocks are reused. React gets this from
   * `memo`; Solid has none, so `stable` is its own `createMemo` whose `===`
   * equality check stops the unchanged prefix from propagating. Without that,
   * every token re-parses the entire completed document.
   */
  it("does not re-parse the stable prefix as the tail grows", async () => {
    const spy = vi.mocked(renderMarkdown);
    const before = "# Heading\n\nbody";
    const after = "# Heading\n\nbody grows";

    const stable = splitStableMarkdown(before).stable;
    expect(stable.length).toBeGreaterThan(0); // precondition: there IS a stable prefix
    expect(splitStableMarkdown(after).stable).toBe(stable); // and it is unchanged by the new token

    const [content, setContent] = createSignal(before);
    const { root, surface } = mount(() => <StreamingMarkdown content={content()} width={24} />, 24, 6);
    await tick();

    const stableParses = (): number => spy.mock.calls.filter((call) => call[0] === stable).length;
    expect(stableParses()).toBe(1);

    setContent(after);
    await tick();

    expect(surface.text({ trimRight: true })).toContain("body grows"); // tail did update
    expect(stableParses()).toBe(1); // …but the prefix was NOT re-parsed
    root.destroy();
  });
});
