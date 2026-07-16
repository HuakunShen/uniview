import { describe, expect, it } from "vitest";
import { createSignal } from "solid-js";
import { MemoryCellSurface, StyleTable, type TuiInputEvent, type YearMonthDay } from "@uniview/tui-core";
import { AutomationSession } from "@uniview/host-tui";
import { createTuiSolidRoot } from "../src/index";
import { Calendar } from "../src/calendar";
import { tick } from "./tick";

const key = (k: string): TuiInputEvent => ({ type: "key", key: k, ctrl: false, alt: false, shift: false, meta: false });
const REF: YearMonthDay = { year: 2026, month: 7, day: 16 };

function mount(App: () => unknown, width: number, height: number) {
  const styles = new StyleTable();
  const surface = new MemoryCellSurface({ styles });
  const root = createTuiSolidRoot({ surface, styles, size: { width, height } });
  root.render(App);
  return { root, surface, styles };
}

describe("Calendar (solid)", () => {
  it("moves the selected day with the arrow keys (via automation)", async () => {
    const [value, setValue] = createSignal<YearMonthDay>(REF);
    const { root, surface } = mount(() => <Calendar referenceDate={REF} value={value()} onChange={setValue} />, 24, 10);
    await tick();
    const session = new AutomationSession(root.host);
    expect(surface.text({ trimRight: true }).split("\n")[0]).toContain("July 2026");
    root.dispatchInput(key("Tab"));
    root.dispatchInput(key("ArrowDown")); // +7 → the 23rd
    await tick();
    session.expect.node({ role: "gridcell", name: "2026-07-23" }, { selected: true });
    root.destroy();
  });
});
