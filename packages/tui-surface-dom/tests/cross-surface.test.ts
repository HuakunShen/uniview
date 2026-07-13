import { describe, expect, it } from "vitest";
import {
  MemoryCellSurface,
  StyleTable,
  buildFrameUpdate,
  frameToLines,
  renderSvg,
  renderToBuffer,
  HIDDEN_CURSOR,
  type RenderNode,
} from "@uniview/tui-core";
import { DomCellSurface } from "../src/index";

const sync = (cb: () => void) => cb();

const scene: RenderNode = {
  type: "box",
  style: { flexDirection: "column", padding: 1, border: "rounded", width: 24 },
  children: [
    { type: "text", text: "Uniview", textStyle: { fg: "cyan", bold: true } },
    { type: "text", text: "中文 mix 😀" },
    { type: "text", text: "Count: 42" },
  ],
};

function domRowText(container: HTMLElement): string[] {
  return [...container.querySelectorAll(".uv-term-row")].map((r) => r.textContent ?? "");
}

describe("cross-surface consistency", () => {
  it("renders the same frame text to Memory, DOM and SVG", () => {
    const styles = new StyleTable();
    const { buffer } = renderToBuffer(scene, { width: 24, height: 8 }, styles);
    const update = buildFrameUpdate(null, buffer, 1, HIDDEN_CURSOR);

    // Memory surface
    const memory = new MemoryCellSurface({ styles });
    memory.mount({ width: 24, height: 8 });
    memory.present(buffer, update);

    // DOM surface
    const container = document.createElement("div");
    const dom = new DomCellSurface(container, { styles, schedule: sync });
    dom.mount({ width: 24, height: 8 });
    dom.present(buffer, update);

    // The DOM mirror must match the Memory frame row-for-row (Beta gate).
    const memoryLines = frameToLines(buffer);
    expect(domRowText(container)).toEqual(memoryLines);
    expect(memory.lines()).toEqual(memoryLines);

    // The SVG artifact carries the same visible text.
    const svg = renderSvg(buffer, styles);
    expect(svg).toContain("Uniview");
    expect(svg).toContain("Count: 42");
    expect(svg).toContain("中文");
  });

  it("keeps the mirror in sync after an incremental update", () => {
    const styles = new StyleTable();
    const first = renderToBuffer(scene, { width: 24, height: 8 }, styles).buffer;

    const container = document.createElement("div");
    const dom = new DomCellSurface(container, { styles, schedule: sync });
    dom.mount({ width: 24, height: 8 });
    dom.present(first, buildFrameUpdate(null, first, 1, HIDDEN_CURSOR));

    const updatedScene: RenderNode = {
      ...scene,
      children: [
        scene.children![0]!,
        scene.children![1]!,
        { type: "text", text: "Count: 43" },
      ],
    };
    const second = renderToBuffer(updatedScene, { width: 24, height: 8 }, styles).buffer;
    dom.present(second, buildFrameUpdate(first, second, 2, HIDDEN_CURSOR));

    expect(domRowText(container)).toEqual(frameToLines(second));
  });
});
