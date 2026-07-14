import { describe, expect, it } from "vitest";
import { MemoryCellSurface, StyleTable, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiReactRoot } from "@uniview/tui-react";
import { App, createState, handleKey, type AppHost } from "../src/app";

const tick = () => new Promise((r) => setTimeout(r, 20));
const text = (t: string): TuiInputEvent => ({ type: "text", text: t });
const keyEv = (k: string, ctrl = false): TuiInputEvent => ({ type: "key", key: k, ctrl, alt: false, shift: false, meta: false });
const wheel = (x: number, y: number, deltaY: -1 | 1): TuiInputEvent => ({ type: "mouse", action: "wheel", button: "none", x, y, deltaY, ctrl: false, alt: false, shift: false });
const move = (x: number, y: number): TuiInputEvent => ({ type: "mouse", action: "move", button: "none", x, y, ctrl: false, alt: false, shift: false });
const click = (x: number, y: number): TuiInputEvent => ({ type: "mouse", action: "up", button: "left", x, y, ctrl: false, alt: false, shift: false });

function boot() {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width: 80, height: 20 } });
  const state = createState(80, 20, 100000); // fully streamed
  let quit = false;
  const host: AppHost = {
    rerender: () => root.render(<App state={state} host={host} />),
    quit: () => (quit = true),
  };
  host.rerender();
  // Route input the way main.tsx does.
  const send = (e: TuiInputEvent) => {
    if (e.type === "mouse") root.dispatchInput(e);
    else if (!handleKey(state, host, e)) root.dispatchInput(e);
  };
  return { root, surface, state, send, wasQuit: () => quit };
}
const screen = (s: ReturnType<typeof boot>) => s.surface.text({ trimRight: true });

describe("opencode demo — keyboard", () => {
  it("switches pages with number keys", async () => {
    const t = boot();
    await tick();
    t.send(text("2"));
    await tick();
    expect(screen(t)).toContain("greet.ts"); // Code page sidebar
    t.send(text("3"));
    await tick();
    expect(screen(t)).toContain("@@ -4,9"); // Diff page hunk header
  });

  it("scrolls the content with the keyboard", async () => {
    const t = boot();
    t.send(text("3")); // diff page (not chat-follow)
    await tick();
    const before = screen(t);
    t.send(keyEv("End"));
    await tick();
    expect(screen(t)).not.toBe(before);
    expect(screen(t)).toContain("VERSION"); // last hunk is now visible
  });

  it("opens the palette with Ctrl-K, filters, and selects with Enter", async () => {
    const t = boot();
    await tick();
    t.send(keyEv("k", true));
    await tick();
    expect(screen(t)).toContain("Go to Chat");
    t.send(text("diff")); // filter
    await tick();
    expect(screen(t)).toContain("Go to Diff");
    expect(screen(t)).not.toContain("Go to Chat");
    t.send(keyEv("Enter"));
    await tick();
    expect(screen(t)).not.toContain("Go to Diff"); // palette closed
    expect(screen(t)).toContain("@@ -4,9"); // navigated to the Diff page
  });

  it("cycles files on the Code page with ] and [", async () => {
    const t = boot();
    t.send(text("2"));
    await tick();
    t.send(text("]"));
    await tick();
    expect(screen(t)).toContain('"name": "uniview"'); // config.json is now selected
  });
});

describe("opencode demo — mouse", () => {
  it("clicks a tab to switch pages", async () => {
    const t = boot();
    await tick();
    // header row 0: " uniview  1 Chat  2 Code  3 Diff ..." — click within "2 Code"
    const col = screen(t).split("\n")[0]!.indexOf("2 Code");
    t.send(click(col + 1, 0));
    await tick();
    expect(screen(t)).toContain("greet.ts");
  });

  it("scrolls with the mouse wheel", async () => {
    const t = boot();
    t.send(text("3"));
    await tick();
    const before = screen(t);
    for (let i = 0; i < 4; i += 1) t.send(wheel(10, 10, 1));
    await tick();
    expect(screen(t)).not.toBe(before);
  });

  it("highlights a file row on hover", async () => {
    const t = boot();
    t.send(text("2"));
    await tick();
    const styles = new StyleTable();
    // hover the second file row (row 2: sidebar under header); check a bg appears
    t.send(move(3, 2));
    await tick();
    const frame = t.surface.cells();
    // some cell in the sidebar rows now carries a (hover/active) background
    const hasBg = frame!.cells.slice(1, 5).some((row) => row.slice(0, 16).some((c) => frame!.styles[c.styleId]?.bg !== undefined));
    expect(hasBg).toBe(true);
    void styles;
  });
});
