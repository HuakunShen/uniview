import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { CommittedOutput, MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiSolidRoot } from "../src/index";
import { Static } from "../src/static";
import { tick } from "./tick";

describe("Static (Solid)", () => {
  it("commits only newly-appended lines, above an empty live region", async () => {
    const chunks: string[] = [];
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const committed = new CommittedOutput({ write: (c) => chunks.push(c) });
    const root = createTuiSolidRoot({ surface, styles, size: { width: 20, height: 3 }, committed });

    const [items, setItems] = createSignal<readonly string[]>(["alpha"]);
    root.render(() => <Static items={items()}>{(item: string) => item}</Static>);
    await tick();
    expect(chunks.join("")).toContain("alpha");
    expect(surface.text({ trimRight: true }).trim()).toBe("");

    chunks.length = 0;
    setItems(["alpha", "beta"]);
    await tick();
    expect(chunks.join("")).toContain("beta");
    expect(chunks.join("")).not.toContain("alpha"); // alpha already committed
    root.destroy();
  });
});
