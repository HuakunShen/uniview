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
});
