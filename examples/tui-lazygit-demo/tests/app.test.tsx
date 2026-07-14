import { describe, expect, it } from "vitest";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, createState, handleKey, type AppHost } from "../src/app";

const tick = () => new Promise((r) => setTimeout(r, 20));
const keyEv = (k: string, shift = false): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift, meta: false });
const textEv = (t: string): TuiInputEvent => ({ type: "text", text: t });

function boot() {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width: 100, height: 30 } });
  const state = createState();
  const host: AppHost = { rerender: () => root.render(<App state={state} host={host} />), quit: () => {} };
  host.rerender();
  const send = (e: TuiInputEvent) => {
    if (e.type !== "mouse" && handleKey(state, host, e)) return;
    root.dispatchInput(e);
  };
  return { surface, send };
}
const screen = (s: ReturnType<typeof boot>) => s.surface.text({ trimRight: true });

describe("lazygit demo", () => {
  it("renders the five left panels + the log panel", async () => {
    const t = boot();
    await tick();
    const text = screen(t);
    for (const title of ["Status", "Files", "Local branches", "Commits", "Stash", "Log"]) {
      expect(text).toContain(title);
    }
  });

  it("shows a keybinding status bar", async () => {
    const t = boot();
    await tick();
    expect(screen(t)).toContain("Checkout:");
  });

  it("moves the branch selection with arrows when the branches panel is focused", async () => {
    const t = boot();
    await tick();
    t.send(textEv("3")); // focus [3] Local branches (a digit arrives as a text event)
    await tick();
    const before = screen(t);
    t.send(keyEv("ArrowDown"));
    await tick();
    expect(screen(t)).not.toBe(before); // selection highlight moved
  });
});
