import { describe, expect, it } from "vitest";
import { MemoryCellSurface, StyleTable, type Color, type TuiInputEvent } from "@uniview/tui-core";
import { createTuiSolidRoot } from "@uniview/tui-solid";
import { App, createAppState, handleKey, type AppHost } from "../src/app";

const tick = () => new Promise((r) => setTimeout(r, 20));

function mount(width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  const state = createAppState();
  const host: AppHost = { quit: () => {} };
  // Mounted ONCE — every assertion below relies on Solid updating the terminal
  // reactively from signal writes, with no re-render call anywhere.
  root.render(() => <App state={state} />);
  return { root, surface, styles, state, host };
}

const key = (k: string, shift = false): TuiInputEvent => ({
  type: "key",
  key: k,
  ctrl: false,
  alt: false,
  shift,
  meta: false,
});
const text = (t: string): TuiInputEvent => ({ type: "text", text: t });

describe("lazygit demo (Solid)", () => {
  it("renders the five left panels, the log panel and the status bar", async () => {
    const { root, surface } = mount(100, 30);
    await tick();
    const out = surface.text({ trimRight: true });

    expect(out).toContain("[1]-Status");
    expect(out).toContain("[2]-Files");
    expect(out).toContain("[3]-Local branches");
    expect(out).toContain("[4]-Commits");
    expect(out).toContain("[5]-Stash");
    expect(out).toContain("[0]-Log");
    expect(out).toContain("Checkout: <space>"); // status bar
    expect(out).toContain("feat/tui"); // branch list rendered
    root.destroy();
  });

  it("focuses a panel by digit key — with no re-render call", async () => {
    const { root, surface, styles, state, host } = mount(100, 30);
    await tick();

    // Branches ([3]) starts focused, so its border is green and Files' is not.
    const borderFg = (label: string): Color | null => {
      const lines = surface.text({ trimRight: false }).split("\n");
      const y = lines.findIndex((l) => l.includes(label));
      if (y < 0) return null;
      const x = lines[y]!.indexOf("╭");
      if (x < 0) return null;
      return styles.get(surface.cells()!.cells[y]![x]!.styleId).fg ?? null;
    };
    expect(state.focused()).toBe(2);
    expect(borderFg("[3]-Local branches")).toBe("green");
    expect(borderFg("[2]-Files")).toBe(null);

    // Digits arrive as `text` events. Note: nothing re-renders the tree here.
    handleKey(state, host, text("2"));
    await tick();

    expect(state.focused()).toBe(1);
    expect(borderFg("[2]-Files")).toBe("green");
    expect(borderFg("[3]-Local branches")).toBe(null);
    root.destroy();
  });

  it("moves the branch selection with the arrow keys", async () => {
    const { root, surface, state, host } = mount(100, 30);
    await tick();
    expect(surface.text({ trimRight: true })).toContain("1 of 7"); // footer counter

    handleKey(state, host, key("ArrowDown"));
    handleKey(state, host, key("ArrowDown"));
    await tick();

    expect(state.branch()).toBe(2);
    expect(surface.text({ trimRight: true })).toContain("3 of 7");
    root.destroy();
  });

  it("arrow keys move the commit selection once [4] is focused", async () => {
    const { root, surface, state, host } = mount(100, 30);
    await tick();

    handleKey(state, host, text("4"));
    handleKey(state, host, key("ArrowDown"));
    await tick();

    expect(state.focused()).toBe(3);
    expect(state.commit()).toBe(1);
    // The Log panel mirrors the selected commit — proves cross-panel reactivity.
    expect(surface.text({ trimRight: true })).toContain("8973cc9");
    root.destroy();
  });
});
