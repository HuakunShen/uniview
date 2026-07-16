import type { TuiInputEvent } from "../input/events";

/** A civil date. Injected by the caller — the machine never reads the clock. */
export interface YearMonthDay {
  year: number;
  /** 1–12. */
  month: number;
  /** 1–31. */
  day: number;
}

/** One cell of the rendered month grid. */
export interface CalendarCell {
  /** The date, or `null` for a leading/trailing pad cell outside the month. */
  date: YearMonthDay | null;
  /** true when this cell equals the machine's cursor (the focused day). */
  focused: boolean;
  /** true when this cell equals the injected reference ("today"). */
  today: boolean;
}

/** Serializable transitions emitted by {@link CalendarMachine.handle}. */
export type CalendarEffect =
  | { type: "change"; date: YearMonthDay }
  | { type: "submit"; date: YearMonthDay };

export interface CalendarInit {
  /** The day the grid opens on AND the cursor's start. Injected — never `Date.now()`. */
  reference: YearMonthDay;
  /** 0 = weeks start Sunday (default), 1 = Monday. */
  weekStartsOn?: 0 | 1;
}

// --- Pure date math (Howard Hinnant's algorithms; no Date object) -----------

/** Serial day number for a civil date (day 0 = 1970-01-01). */
function daysFromCivil({ year, month, day }: YearMonthDay): number {
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor((y >= 0 ? y : y - 399) / 400);
  const yoe = y - era * 400;
  const mp = (month + 9) % 12;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

/** Inverse of {@link daysFromCivil}. */
function civilFromDays(serial: number): YearMonthDay {
  const z = serial + 719468;
  const era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

/** 0 = Sunday … 6 = Saturday. (serial 0 = 1970-01-01 = Thursday = 4.) */
function weekdayOf(date: YearMonthDay): number {
  const z = daysFromCivil(date);
  return ((z % 7) + 4 + 7) % 7;
}

function lastDayOfMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

function sameDate(a: YearMonthDay, b: YearMonthDay): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * Framework-neutral month-grid + selectable-date state. Clock-free: the caller
 * injects the reference date, so tests are deterministic. Emits serializable
 * effects, mirroring {@link TextInputMachine} (`change`/`submit`).
 */
export class CalendarMachine {
  private cursor: YearMonthDay;
  private readonly reference: YearMonthDay;
  private readonly weekStartsOn: 0 | 1;

  constructor(init: CalendarInit) {
    this.reference = init.reference;
    this.cursor = init.reference;
    this.weekStartsOn = init.weekStartsOn ?? 0;
  }

  get selectedDate(): YearMonthDay {
    return this.cursor;
  }

  /** The displayed month = the cursor's month. */
  get viewYear(): number {
    return this.cursor.year;
  }
  get viewMonth(): number {
    return this.cursor.month;
  }

  setSelected(date: YearMonthDay): void {
    this.cursor = date;
  }

  /** The displayed month as rows of 7 cells, padded with `null` to whole weeks. */
  weeks(): CalendarCell[][] {
    const { year, month } = this.cursor;
    const lead = (weekdayOf({ year, month, day: 1 }) - this.weekStartsOn + 7) % 7;
    const total = lastDayOfMonth(year, month);
    const cells: CalendarCell[] = [];
    for (let i = 0; i < lead; i += 1) cells.push({ date: null, focused: false, today: false });
    for (let day = 1; day <= total; day += 1) {
      const date = { year, month, day };
      cells.push({ date, focused: sameDate(date, this.cursor), today: sameDate(date, this.reference) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, focused: false, today: false });
    const rows: CalendarCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }

  private moveTo(date: YearMonthDay): CalendarEffect[] {
    if (sameDate(date, this.cursor)) return [];
    this.cursor = date;
    return [{ type: "change", date }];
  }

  private addDays(delta: number): CalendarEffect[] {
    return this.moveTo(civilFromDays(daysFromCivil(this.cursor) + delta));
  }

  private addMonths(delta: number): CalendarEffect[] {
    const zeroBased = this.cursor.month - 1 + delta;
    const year = this.cursor.year + Math.floor(zeroBased / 12);
    const month = (((zeroBased % 12) + 12) % 12) + 1;
    const day = Math.min(this.cursor.day, lastDayOfMonth(year, month));
    return this.moveTo({ year, month, day });
  }

  handle(event: TuiInputEvent): CalendarEffect[] {
    if (event.type !== "key") return [];
    switch (event.key) {
      case "ArrowLeft":
        return this.addDays(-1);
      case "ArrowRight":
        return this.addDays(1);
      case "ArrowUp":
        return this.addDays(-7);
      case "ArrowDown":
        return this.addDays(7);
      case "PageUp":
        return this.addMonths(-1);
      case "PageDown":
        return this.addMonths(1);
      case "Home":
        return this.moveTo({ ...this.cursor, day: 1 });
      case "End":
        return this.moveTo({ ...this.cursor, day: lastDayOfMonth(this.cursor.year, this.cursor.month) });
      case "Enter":
        return [{ type: "submit", date: this.cursor }];
      default:
        return [];
    }
  }
}
