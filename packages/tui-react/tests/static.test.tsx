import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { CommittedOutput, MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { createTuiReactRoot } from "../src/index";
import { Static } from "../src/static";
import { tick } from "./tick";

describe("Static (React)", () => {
  it("commits its lines above an empty live region", async () => {
    const chunks: string[] = [];
    const styles = new StyleTable();
    const surface = new MemoryCellSurface({ styles });
    const committed = new CommittedOutput({ write: (c) => chunks.push(c) });
    const root = createTuiReactRoot({ surface, styles, size: { width: 20, height: 3 }, committed });

    root.render(h(Static<string>, { items: ["alpha", "beta"], children: (item) => item }));
    await tick();
    expect(chunks.join("")).toContain("alpha");
    expect(chunks.join("")).toContain("beta");
    expect(surface.text({ trimRight: true }).trim()).toBe(""); // nothing in the live frame
    root.destroy();
  });
});
