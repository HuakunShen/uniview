import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, type AppHost } from "../src/app";

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });

async function tick(): Promise<void> {
  for (let i = 0; i < 25; i += 1) await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("forms demo", () => {
  it("shows both tabs + the login fields, and switches to the status tab", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 40, height: 8 } });
    const host: AppHost = {
      rerender: () => root.render(createElement(App, { host })),
      quit: () => {},
    };
    host.rerender();
    await tick();
    const text = surface.text();
    expect(text).toContain("Login");
    expect(text).toContain("Status");
    expect(text).toContain("Name:");

    // Focus the tablist and move to the Status tab.
    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("ArrowRight"));
    await tick();
    expect(surface.text()).toContain("Sync");
    root.destroy();
  });
});
