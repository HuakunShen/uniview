import { describe, expect, it } from "vitest";
import { createElement as h, useState, type ReactElement } from "react";
import { MemoryCellSurface, StyleTable, type TuiInputEvent, type YearMonthDay } from "@uniview/tui-core";
import { AutomationSession } from "@uniview/host-tui";
import { createTuiReactRoot } from "../src/index";
import { Calendar } from "../src/calendar";
import { tick } from "./tick";

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });
const REF: YearMonthDay = { year: 2026, month: 7, day: 16 };

function mount(el: ReactElement, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiReactRoot({ surface, styles, size: { width, height } });
  root.render(el);
  return { root, surface, styles };
}

function Harness() {
  const [value, setValue] = useState<YearMonthDay>(REF);
  return h(Calendar, { referenceDate: REF, value, onChange: setValue });
}

describe("Calendar", () => {
  it("renders the month header and weekday row", async () => {
    const { surface } = mount(h(Harness), 24, 10);
    await tick();
    const lines = surface.text({ trimRight: true }).split("\n");
    expect(lines[0]).toContain("July 2026");
    expect(lines[1]).toContain("Su");
    expect(lines[1]).toContain("Sa");
  });

  it("moves the selected day with the arrow keys (via automation)", async () => {
    const { root } = mount(h(Harness), 24, 10);
    await tick();
    const session = new AutomationSession(root.host);
    root.dispatchInput(key("Tab")); // focus the grid
    root.dispatchInput(key("ArrowRight")); // 16 → 17
    await tick();
    session.expect.node({ role: "gridcell", name: "2026-07-17" }, { selected: true });
    session.expect.node({ role: "gridcell", name: "2026-07-16" }, { selected: false });
  });

  it("PageDown pages to the next month", async () => {
    const { root, surface } = mount(h(Harness), 24, 10);
    await tick();
    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("PageDown")); // July → August
    await tick();
    expect(surface.text({ trimRight: true })).toContain("August 2026");
  });
});
