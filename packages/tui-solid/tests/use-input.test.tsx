import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiSolidRoot, useInput, usePaste } from "../src/index";
import { tick } from "./tick";

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });

function App() {
  const [msg, setMsg] = createSignal("idle");
  useInput((input, k) => {
    if (k.escape) setMsg("escaped");
    else if (input === "q") setMsg("quit");
  });
  usePaste((textPasted) => setMsg(`pasted:${textPasted}`));
  return <text>{msg()}</text>;
}

describe("tui-solid useInput/usePaste", () => {
  it("delivers unfocused global keys and paste to the hooks", async () => {
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 20, height: 1 } });
    root.render(App);
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
});
