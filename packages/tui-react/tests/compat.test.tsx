import { describe, expect, it } from "vitest";
import { createElement as h, useState } from "react";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { Box, Button, Text } from "../src/compat";

const tick = () => new Promise((r) => setTimeout(r, 20));
const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });

// A counter written against the OLD @uniview/tui-renderer component API.
function LegacyApp() {
  const [count, setCount] = useState(0);
  return h(
    Box,
    { flexDirection: "column" },
    h(Text, { color: "cyan", bold: true }, "Compat Demo"),
    h(Text, null, `Count: ${count}`),
    h(Button, { onPress: () => setCount((c) => c + 1) }, "Increment"),
  );
}

describe("compat facade", () => {
  it("renders legacy Box/Text/Button on the new stack", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 24, height: 4 } });
    root.render(h(LegacyApp));
    await tick();

    const text = surface.text({ trimRight: true });
    expect(text).toContain("Compat Demo");
    expect(text).toContain("Count: 0");
    expect(text).toContain("[ Increment ]");
    root.destroy();
  });

  it("activates a legacy Button via keyboard", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 24, height: 4 } });
    root.render(h(LegacyApp));
    await tick();

    root.dispatchInput(key("Tab")); // focus the button (only focusable)
    root.dispatchInput(key("Enter"));
    await tick();

    expect(surface.text({ trimRight: true })).toContain("Count: 1");
    root.destroy();
  });
});
