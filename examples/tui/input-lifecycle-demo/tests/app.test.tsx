import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, type AppHost } from "../src/app";

async function tick(): Promise<void> {
  for (let i = 0; i < 25; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("input-lifecycle demo", () => {
  it("shows the ready prompt, then echoes a paste via usePaste", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 44, height: 3 } });
    const host: AppHost = {
      rerender: () => root.render(createElement(App, { host })),
      quit: () => {},
    };
    host.rerender();
    await tick();
    expect(surface.text({ trimRight: true })).toContain("ready");

    root.dispatchInput({ type: "paste", text: "hello" });
    await tick();
    expect(surface.text()).toContain("pasted: hello");
    root.destroy();
  });
});
