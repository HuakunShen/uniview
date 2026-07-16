import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App } from "../src/app";

const BRAILLE = /[⠀-⣿]/;

async function tick(): Promise<void> {
  for (let i = 0; i < 25; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("canvas demo", () => {
  it("renders the title and braille canvas content", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 52, height: 18 } });
    root.render(createElement(App));
    await tick();
    const text = surface.text();
    expect(text).toContain("Canvas");
    expect(BRAILLE.test(text)).toBe(true); // the sine wave / circle / frame rasterized
    root.destroy();
  });
});
