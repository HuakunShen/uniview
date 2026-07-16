import { describe, expect, it } from "vitest";
import { createElement as h, useState } from "react";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiReactRoot, useInput, usePaste } from "../src/index";
import { tick } from "./tick";

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });

function App() {
  const [msg, setMsg] = useState("idle");
  useInput((input, k) => {
    if (k.escape) setMsg("escaped");
    else if (input === "q") setMsg("quit");
  });
  usePaste((textPasted) => setMsg(`pasted:${textPasted}`));
  return h("text", null, msg);
}

describe("tui-react useInput/usePaste", () => {
  it("delivers unfocused global keys and paste to the hooks", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 20, height: 1 } });
    root.render(h(App));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("idle");

    root.dispatchInput({ type: "text", text: "q" });
    await tick();
    expect(surface.text({ trimRight: true })).toContain("quit");

    root.dispatchInput(key("Escape"));
    await tick();
    expect(surface.text({ trimRight: true })).toContain("escaped");

    root.dispatchInput({ type: "paste", text: "xy" });
    await tick();
    expect(surface.text({ trimRight: true })).toContain("pasted:xy");
    root.destroy();
  });

  it("does not fire when isActive is false", async () => {
    function Inactive() {
      const [msg, setMsg] = useState("idle");
      useInput(() => setMsg("fired"), { isActive: false });
      return h("text", null, msg);
    }
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiReactRoot({ surface, styles, size: { width: 20, height: 1 } });
    root.render(h(Inactive));
    await tick();
    root.dispatchInput({ type: "text", text: "q" });
    await tick();
    expect(surface.text({ trimRight: true })).toContain("idle");
    root.destroy();
  });
});
