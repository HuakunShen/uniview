import { describe, expect, it } from "vitest";
import { createElement as h } from "react";
import { MemoryCellSurface, StyleTable } from "@uniview/tui-core";
import { AutomationSession } from "@uniview/host-tui";
import { createTuiReactRoot } from "@uniview/tui-react";
import { GitWorkspaceModel } from "../src/model";
import { GitWorkspaceTui } from "../src/view";

const tick = () => new Promise((r) => setTimeout(r, 25));

function mount() {
  const model = new GitWorkspaceModel();
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width: 40, height: 12 } });
  root.render(h(GitWorkspaceTui, { model }));
  const session = new AutomationSession(root.host);
  return { model, surface, root, session };
}

describe("Git Workspace — semantic contract", () => {
  it("drives refresh and stage via semantic actions", async () => {
    const { session, root } = mount();
    await tick();

    // Initial: clean.
    session.expect.node({ role: "status" }, { text: /no changes/i });

    // Refresh loads the working tree.
    expect(session.act.activate({ role: "button", name: "Refresh" })).toBe(true);
    await tick();
    session.expect.node({ role: "status" }, { text: /change/i });
    session.expect.text(/README\.md/);

    // Stage the README via its semantic action.
    expect(session.act.activate({ role: "button", name: "Stage README.md" })).toBe(true);
    await tick();
    session.expect.node({ role: "status" }, { text: /staged/i });
    session.expect.text(/● README\.md/);

    root.destroy();
  });

  it("renders the working tree to the terminal", async () => {
    const { session, surface } = mount();
    await tick(); // wait for the initial React commit
    session.act.activate({ role: "button", name: "Refresh" });
    await tick();

    const text = surface.text({ trimRight: true });
    expect(text).toContain("Git — main");
    expect(text).toContain("README.md");
    expect(text).toContain("[ Refresh ]");
  });

  it("hugs the Refresh button background to its label, not the whole row", async () => {
    const { session, surface } = mount();
    await tick();
    session.act.activate({ role: "button", name: "Refresh" });
    await tick();

    const frame = surface.cells()!;
    const rowY = frame.cells.findIndex((row) =>
      row.map((c) => c.grapheme).join("").includes("[ Refresh ]"),
    );
    expect(rowY).toBeGreaterThanOrEqual(0);

    const bgOf = (styleId: number) => frame.styles[styleId]?.bg;
    const blueCells = frame.cells[rowY]!.filter((c) => bgOf(c.styleId) === "blue");

    // The blue fill must cover exactly the label "[ Refresh ]" (11 cells),
    // not bleed to the end of the 40-wide row.
    expect(blueCells.length).toBe("[ Refresh ]".length);
  });
});
