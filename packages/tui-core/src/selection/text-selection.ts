import { CellFlags, type CellBuffer } from "../buffer/cell-buffer";
import type { TuiInputEvent } from "../input/events";
import type { CellStyle } from "../style/style-table";
import { graphemesOf } from "../text/graphemes";

export const DEFAULT_MAX_CLIPBOARD_BYTES = 1024 * 1024;

export interface CellPoint {
  x: number;
  y: number;
}

export interface SelectionRange {
  start: CellPoint;
  end: CellPoint;
}

export interface SelectionEvent extends SelectionRange {
  text: string;
  characterCount: number;
  byteCount: number;
  clipboardEmitted: boolean;
}

export interface SelectionInputResult {
  consumed: boolean;
  changed: boolean;
  completed?: SelectionEvent;
}

export interface TextSelectionOptions {
  clipboard?: "off" | "on-select";
  maxClipboardBytes?: number;
  style?: CellStyle;
  writeClipboard?: (text: string, maxBytes: number) => boolean;
  onSelection?: (event: SelectionEvent) => void;
}

type SelectionState =
  | { type: "idle" }
  | { type: "pending"; anchor: CellPoint }
  | { type: "selecting"; anchor: CellPoint; current: CellPoint }
  | { type: "selected"; range: SelectionRange }
  | { type: "shift-pending"; anchor: CellPoint }
  | { type: "shift-drag" };

export function normalizeSelectionRange(
  start: CellPoint,
  end: CellPoint,
): SelectionRange {
  const startBeforeEnd =
    start.y < end.y || (start.y === end.y && start.x <= end.x);
  return startBeforeEnd
    ? { start: { ...start }, end: { ...end } }
    : { start: { ...end }, end: { ...start } };
}

export function isSelectableCell(
  buffer: CellBuffer,
  point: CellPoint,
): boolean {
  if (
    point.x < 0 ||
    point.y < 0 ||
    point.x >= buffer.width ||
    point.y >= buffer.height
  ) {
    return false;
  }
  return buffer.selectable[buffer.index(point.x, point.y)] === 1;
}

function selectableLead(buffer: CellBuffer, point: CellPoint): CellPoint {
  if (!isSelectableCell(buffer, point)) return point;
  const index = buffer.index(point.x, point.y);
  if (point.x > 0 && (buffer.flags[index]! & CellFlags.Continuation) !== 0) {
    return { x: point.x - 1, y: point.y };
  }
  return point;
}

export function extractSelectedText(
  buffer: CellBuffer,
  range: SelectionRange,
): string {
  if (buffer.width === 0 || buffer.height === 0) return "";

  const normalized = normalizeSelectionRange(range.start, range.end);
  const firstY = Math.max(0, normalized.start.y);
  const lastY = Math.min(buffer.height - 1, normalized.end.y);
  if (firstY > lastY) return "";

  const rows: string[] = [];
  for (let y = firstY; y <= lastY; y += 1) {
    const firstX =
      y === normalized.start.y ? Math.max(0, normalized.start.x) : 0;
    const lastX =
      y === normalized.end.y
        ? Math.min(buffer.width - 1, normalized.end.x)
        : buffer.width - 1;
    let row = "";
    let hasSelectableCell = false;

    for (let x = firstX; x <= lastX; x += 1) {
      const index = buffer.index(x, y);
      if (buffer.selectable[index] !== 1) continue;
      hasSelectableCell = true;
      if (buffer.flags[index]! & CellFlags.Continuation) continue;
      row += buffer.graphemes[index]!;
    }

    if (hasSelectableCell) rows.push(row);
  }

  return rows.join("\n");
}

export class TextSelectionController {
  private state: SelectionState = { type: "idle" };

  get range(): SelectionRange | null {
    if (this.state.type === "selecting") {
      return normalizeSelectionRange(this.state.anchor, this.state.current);
    }
    if (this.state.type === "selected") return this.state.range;
    return null;
  }

  clear(): boolean {
    const changed =
      this.state.type === "selecting" || this.state.type === "selected";
    this.state = { type: "idle" };
    return changed;
  }

  handle(
    event: TuiInputEvent,
    buffer?: CellBuffer | null,
  ): SelectionInputResult {
    if (event.type === "key" && event.key === "Escape") {
      return { consumed: false, changed: this.clear() };
    }
    if (event.type !== "mouse" || event.button !== "left") {
      return { consumed: false, changed: false };
    }

    const point = { x: event.x, y: event.y };

    if (event.action === "down") {
      const changed = this.clear();
      if (event.shift) {
        this.state = { type: "shift-pending", anchor: point };
        return { consumed: false, changed };
      }
      if (buffer && isSelectableCell(buffer, point)) {
        this.state = {
          type: "pending",
          anchor: selectableLead(buffer, point),
        };
      }
      return { consumed: false, changed };
    }

    if (this.state.type === "shift-pending") {
      if (
        event.action === "drag" &&
        (point.x !== this.state.anchor.x || point.y !== this.state.anchor.y)
      ) {
        this.state = { type: "shift-drag" };
        return { consumed: true, changed: false };
      }
      if (event.action === "up") {
        this.state = { type: "idle" };
      }
      return { consumed: false, changed: false };
    }

    if (this.state.type === "shift-drag") {
      if (event.action === "up") this.state = { type: "idle" };
      return { consumed: true, changed: false };
    }

    if (this.state.type === "pending") {
      if (
        event.action === "drag" &&
        (point.x !== this.state.anchor.x || point.y !== this.state.anchor.y)
      ) {
        const current = buffer ? selectableLead(buffer, point) : point;
        this.state = {
          type: "selecting",
          anchor: this.state.anchor,
          current,
        };
        return { consumed: true, changed: true };
      }
      if (event.action === "up") {
        if (
          point.x !== this.state.anchor.x ||
          point.y !== this.state.anchor.y
        ) {
          this.state = {
            type: "selecting",
            anchor: this.state.anchor,
            current: buffer ? selectableLead(buffer, point) : point,
          };
          return this.handle(event, buffer);
        }
        this.state = { type: "idle" };
      }
      return { consumed: false, changed: false };
    }

    if (this.state.type === "selecting") {
      if (event.action !== "drag" && event.action !== "up") {
        return { consumed: true, changed: false };
      }
      const current = buffer ? selectableLead(buffer, point) : point;
      const range = normalizeSelectionRange(this.state.anchor, current);
      this.state = {
        type: "selecting",
        anchor: this.state.anchor,
        current,
      };
      if (event.action === "drag") {
        return { consumed: true, changed: true };
      }

      const text = buffer ? extractSelectedText(buffer, range) : "";
      if (text.length === 0) {
        this.state = { type: "idle" };
        return { consumed: true, changed: true };
      }
      this.state = { type: "selected", range };
      return {
        consumed: true,
        changed: true,
        completed: {
          ...range,
          text,
          characterCount: [...graphemesOf(text)].length,
          byteCount: new TextEncoder().encode(text).byteLength,
          clipboardEmitted: false,
        },
      };
    }

    return { consumed: false, changed: false };
  }
}
