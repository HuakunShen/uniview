import { describe, expect, it } from "vitest";
import { createElement as h, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { StatusBar } from "../src/status-bar";

import { tick } from "./tick";
function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { surface };
}

describe("StatusBar", () => {
  it("renders label: key pairs joined by a separator", async () => {
    const { surface } = mount(
      h(StatusBar, { items: [ { label: "Checkout", keyHint: "<space>" }, { label: "Delete", keyHint: "d" } ] }),
      40, 1,
    );
    await tick();
    expect(surface.text({ trimRight: true })).toContain("Checkout: <space> | Delete: d");
  });
});
