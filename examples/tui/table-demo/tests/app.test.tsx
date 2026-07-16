import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, type AppHost } from "../src/app";

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });

async function tick(): Promise<void> {
  for (let i = 0; i < 25; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("table demo", () => {
  it("renders the header + files and moves the cursor", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 40, height: 6 } });
    const host: AppHost = {
      rerender: () => root.render(createElement(App, { host })),
      quit: () => {},
    };
    host.rerender();
    await tick();
    const text = surface.text();
    expect(text).toContain("Name");
    expect(text).toContain("README.md");

    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("ArrowDown"));
    await tick();
    expect(surface.text()).toContain("index.ts");
    root.destroy();
  });
});
