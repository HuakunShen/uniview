import { describe, expect, it, vi } from "vitest";
import { createTuiApp, type RenderNode } from "../../src/app/create-tui-app";
import type { TuiInputEvent } from "../../src/input/events";

function fakeTty(columns = 20, rows = 5) {
  const dataListeners = new Set<(chunk: Buffer) => void>();
  const resizeListeners = new Set<() => void>();
  const writes: string[] = [];
  const input = {
    isTTY: true as const,
    setRawMode: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
    on: (e: string, l: (chunk: Buffer) => void) => e === "data" && dataListeners.add(l),
    off: (e: string, l: (chunk: Buffer) => void) => e === "data" && dataListeners.delete(l),
  };
  const output = {
    columns,
    rows,
    write: (c: string) => writes.push(c),
    on: (e: string, l: () => void) => e === "resize" && resizeListeners.add(l),
    off: (e: string, l: () => void) => e === "resize" && resizeListeners.delete(l),
  };
  return {
    input,
    output,
    emitData: (s: string) => dataListeners.forEach((l) => l(Buffer.from(s, "utf8"))),
    emitResize: (c: number, r: number) => {
      output.columns = c;
      output.rows = r;
      resizeListeners.forEach((l) => l());
    },
    out: () => writes.join(""),
    reset: () => (writes.length = 0),
  };
}

const label = (text: string): RenderNode => ({ type: "text", text });

describe("createTuiApp", () => {
  it("enters the terminal and paints the initial scene", () => {
    const tty = fakeTty();
    const app = createTuiApp({ input: tty.input, output: tty.output });
    app.render(label("Hello"));

    const out = tty.out();
    expect(out).toContain("\x1b[?1049h"); // entered alternate screen
    expect(out).toContain("Hello");
    app.destroy();
  });

  it("routes parsed input to registered handlers", () => {
    const tty = fakeTty();
    const app = createTuiApp({ input: tty.input, output: tty.output });
    const seen: TuiInputEvent[] = [];
    app.onInput((e) => seen.push(e));

    tty.emitData("x");
    expect(seen).toEqual([{ type: "text", text: "x" }]);
    app.destroy();
  });

  it("re-renders at the new size on resize", () => {
    const tty = fakeTty(20, 5);
    const app = createTuiApp({ input: tty.input, output: tty.output });
    app.render(label("Hi"));
    expect(app.size).toEqual({ width: 20, height: 5 });

    tty.reset();
    tty.emitResize(30, 8);
    expect(app.size).toEqual({ width: 30, height: 8 });
    // a full repaint was emitted for the new geometry
    expect(tty.out()).toContain("Hi");
    app.destroy();
  });

  it("restores the terminal on destroy", () => {
    const tty = fakeTty();
    const app = createTuiApp({ input: tty.input, output: tty.output });
    app.render(label("Hi"));
    tty.reset();
    app.destroy();
    expect(tty.out()).toContain("\x1b[?1049l"); // left alternate screen
    expect(tty.out()).toContain("\x1b[?25h"); // cursor restored
  });

  it("supports an interactive update in response to input", () => {
    const tty = fakeTty(20, 3);
    const app = createTuiApp({ input: tty.input, output: tty.output });
    let count = 0;
    const view = () => label(`Count: ${count}`);
    app.render(view());
    app.onInput((e) => {
      if (e.type === "text" && e.text === "+") {
        count += 1;
        app.render(view());
      }
    });

    tty.reset();
    tty.emitData("+");
    const out = tty.out();
    expect(out).not.toContain("\x1b[2J"); // incremental, no clear
    expect(out).toContain("1");
    app.destroy();
  });
});
