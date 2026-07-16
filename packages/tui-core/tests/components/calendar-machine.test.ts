import { describe, expect, it } from "vitest";
import { keyEvent } from "../../src/input/events";
import { CalendarMachine } from "../../src/components/calendar-machine";

const REF = { year: 2026, month: 7, day: 16 }; // injected, deterministic

describe("CalendarMachine", () => {
  it("lays out the reference month with correct leading pad cells", () => {
    const weeks = new CalendarMachine({ reference: REF }).weeks();
    expect(weeks.length).toBe(5); // July 2026 spans 5 week rows
    expect(weeks[0]!.slice(0, 3).every((c) => c.date === null)).toBe(true); // Sun..Tue blank
    expect(weeks[0]![3]!.date).toEqual({ year: 2026, month: 7, day: 1 }); // Wed = the 1st
  });

  it("flags the cursor cell and the reference ('today') cell", () => {
    const cells = new CalendarMachine({ reference: REF }).weeks().flat();
    const ref = cells.find((c) => c.date?.day === 16 && c.date.month === 7)!;
    expect(ref.today).toBe(true);
    expect(ref.focused).toBe(true); // cursor starts on the reference
  });

  it("ArrowRight moves one day and emits change", () => {
    const m = new CalendarMachine({ reference: REF });
    expect(m.handle(keyEvent("ArrowRight"))).toEqual([{ type: "change", date: { year: 2026, month: 7, day: 17 } }]);
  });

  it("ArrowDown moves a week, crossing the month boundary", () => {
    const m = new CalendarMachine({ reference: { year: 2026, month: 7, day: 30 } });
    m.handle(keyEvent("ArrowDown")); // +7 → Aug 6
    expect(m.selectedDate).toEqual({ year: 2026, month: 8, day: 6 });
  });

  it("PageDown clamps the day to the shorter target month", () => {
    const m = new CalendarMachine({ reference: { year: 2026, month: 1, day: 31 } });
    m.handle(keyEvent("PageDown")); // Jan 31 → Feb 2026 (28 days) → clamp to 28
    expect(m.selectedDate).toEqual({ year: 2026, month: 2, day: 28 });
  });

  it("Home/End jump to the first and last day of the month", () => {
    const m = new CalendarMachine({ reference: REF });
    m.handle(keyEvent("End"));
    expect(m.selectedDate).toEqual({ year: 2026, month: 7, day: 31 });
    m.handle(keyEvent("Home"));
    expect(m.selectedDate).toEqual({ year: 2026, month: 7, day: 1 });
  });

  it("Enter submits the cursor without moving it", () => {
    const m = new CalendarMachine({ reference: REF });
    expect(m.handle(keyEvent("Enter"))).toEqual([{ type: "submit", date: REF }]);
  });
});
